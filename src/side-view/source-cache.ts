import { sha256 } from "../core/sha256";

const MAX_ASSET_BYTES = 64 * 1024 * 1024;
export const SIDE_SOURCE_CACHE_BYTES = 32 * 1024 * 1024;

export async function fetchSideAsset(
  url: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const response = await fetch(url, { signal, cache: "no-cache" });
  if (!response.ok)
    throw Error(`侧视素材加载失败（${response.status}），请重试。`);
  const size = Number(response.headers.get("content-length"));
  if (size > MAX_ASSET_BYTES) throw Error("侧视素材超出可加载大小。");
  const data = new Uint8Array(await response.arrayBuffer());
  if (!data.length || data.length > MAX_ASSET_BYTES)
    throw Error("侧视素材为空或超出可加载大小。");
  signal?.throwIfAborted();
  return data;
}

type PendingSource = {
  controller: AbortController;
  promise: Promise<Uint8Array>;
  readers: number;
  settled: boolean;
};

/** Only frozen, hash-bound source ZIPs are retained, never parsed projects or
 * decoded frames. Mutable clothing/registration URLs are deliberately excluded.
 * Public bytes are copies; one cancelled reader cannot cancel another. */
export class SideSourceCache {
  private readonly stored = new Map<string, Uint8Array>();
  private readonly pending = new Map<string, PendingSource>();
  private storedBytes = 0;

  constructor(
    private readonly load = fetchSideAsset,
    private readonly digest = sha256,
    private readonly budget = SIDE_SOURCE_CACHE_BYTES,
  ) {}

  async get(
    url: string,
    expectedSha256: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    signal?.throwIfAborted();
    const key = `${expectedSha256}:${url}`;
    const cached = this.stored.get(key);
    if (cached) {
      this.stored.delete(key);
      this.stored.set(key, cached);
      return new Uint8Array(cached);
    }
    let entry = this.pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      const next: PendingSource = {
        controller,
        readers: 0,
        settled: false,
        promise: Promise.resolve(new Uint8Array()),
      };
      next.promise = this.load(url, controller.signal)
        .then(async (bytes) => {
          // Own the input before hashing, even with a custom transport.
          const snapshot = new Uint8Array(bytes);
          if ((await this.digest(snapshot)) !== expectedSha256)
            throw Error("侧视人物来源校验失败，请重新加载完整素材。");
          controller.signal.throwIfAborted();
          if (snapshot.length <= this.budget) {
            this.stored.set(key, snapshot);
            this.storedBytes += snapshot.length;
            while (this.stored.size > 2 || this.storedBytes > this.budget) {
              const oldest = this.stored.keys().next().value!;
              this.storedBytes -= this.stored.get(oldest)!.length;
              this.stored.delete(oldest);
            }
          }
          return snapshot;
        })
        .finally(() => {
          next.settled = true;
          if (this.pending.get(key) === next) this.pending.delete(key);
        });
      this.pending.set(key, next);
      entry = next;
    }
    const active = entry;
    active.readers++;
    return new Promise<Uint8Array>((resolve, reject) => {
      let done = false;
      const finish = (error?: unknown, bytes?: Uint8Array) => {
        if (done) return;
        done = true;
        signal?.removeEventListener("abort", cancel);
        active.readers--;
        if (!active.readers && !active.settled) {
          // Remove immediately so a new request never joins an abandoned load.
          if (this.pending.get(key) === active) this.pending.delete(key);
          active.controller.abort();
        }
        if (bytes === undefined) reject(error);
        else resolve(new Uint8Array(bytes));
      };
      const cancel = () =>
        finish(
          signal?.reason ?? new DOMException("加载已取消。", "AbortError"),
        );
      signal?.addEventListener("abort", cancel, { once: true });
      active.promise.then((bytes) => finish(undefined, bytes), finish);
      if (signal?.aborted) cancel();
    });
  }
}
