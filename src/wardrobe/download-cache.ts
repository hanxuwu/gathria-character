import { sha256 } from "../core/sha256";

export interface DownloadProgress {
  loaded: number;
  total: number | null;
  cached: boolean;
}
/** A small session-local cache of verified compressed files, never decoded atlases. */
export function createWardrobeDownloads(budget = 96 * 1024 * 1024) {
  const cache = new Map<string, Uint8Array>();
  let used = 0;
  return {
    clear() {
      cache.clear();
      used = 0;
    },
    get bytes() {
      return used;
    },
    async load(
      url: string,
      maximum: number,
      options: {
        signal?: AbortSignal;
        sha256?: string;
        onProgress?: (value: DownloadProgress) => void;
      } = {},
    ): Promise<Uint8Array> {
      const { signal, onProgress } = options;
      signal?.throwIfAborted();
      const key = options.sha256 ? `${url}#${options.sha256}` : null;
      const saved = key ? cache.get(key) : undefined;
      if (saved) {
        if (saved.length > maximum)
          throw Error("This file exceeds the supported size.");
        cache.delete(key!);
        cache.set(key!, saved);
        onProgress?.({
          loaded: saved.length,
          total: saved.length,
          cached: true,
        });
        return saved.slice();
      }
      const response = await fetch(url, { signal });
      if (!response.ok)
        throw Error(`Could not open clothing artwork (${response.status}).`);
      const length = Number(response.headers.get("content-length"));
      const total = Number.isFinite(length) && length > 0 ? length : null;
      if (total && total > maximum) {
        await response.body?.cancel();
        throw Error("This file exceeds the supported size.");
      }
      let bytes: Uint8Array;
      if (response.body) {
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let loaded = 0;
        try {
          for (;;) {
            signal?.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            loaded += value.length;
            if (loaded > maximum)
              throw Error("This file exceeds the supported size.");
            chunks.push(value);
            onProgress?.({ loaded, total, cached: false });
          }
        } catch (e) {
          await reader.cancel().catch(() => {});
          throw e;
        } finally {
          reader.releaseLock();
        }
        bytes = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
      } else bytes = new Uint8Array(await response.arrayBuffer());
      signal?.throwIfAborted();
      if (!bytes.length || bytes.length > maximum)
        throw Error("This file is empty or exceeds the supported size.");
      if (options.sha256 && (await sha256(bytes)) !== options.sha256)
        throw Error("The artwork file does not match its library entry.");
      signal?.throwIfAborted();
      if (key && bytes.length <= budget) {
        while (used + bytes.length > budget && cache.size) {
          const oldest = cache.keys().next().value!;
          used -= cache.get(oldest)!.length;
          cache.delete(oldest);
        }
        const previous = cache.get(key);
        if (previous) used -= previous.length;
        cache.set(key, bytes.slice());
        used += bytes.length;
      }
      onProgress?.({ loaded: bytes.length, total, cached: false });
      return bytes;
    },
  };
}
