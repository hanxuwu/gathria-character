import { decodeSourceRgbaPngAsync, type RgbaPng } from "./baked-source";
import {
  readPortableCharacterPackArchive,
  type PortableCharacterPackArchive,
} from "./pack";

export interface SourcePreparationOptions {
  signal?: AbortSignal;
}

export type SourcePreparationRequest =
  | { kind: "archive"; bytes: Uint8Array }
  | {
      kind: "png";
      bytes: Uint8Array;
      expected?: { width: number; height: number };
    };
export type SourcePreparationResponse =
  | {
      kind: "archive";
      ok: true;
      value: PortableCharacterPackArchive;
    }
  | { kind: "png"; ok: true; value: RgbaPng }
  | { kind: SourcePreparationRequest["kind"]; ok: false; message: string };

export function assertSourcePreparationActive(
  options: SourcePreparationOptions,
): void {
  if (options.signal?.aborted)
    throw new DOMException("Source preparation cancelled.", "AbortError");
}

// Only transport failures permit a same-validator fallback. A worker reporting
// invalid source bytes must reject the load rather than retry a different path.
class WorkerTransportError extends Error {}

function prepareInWorker(
  request: SourcePreparationRequest,
  options: SourcePreparationOptions,
): Promise<PortableCharacterPackArchive | RgbaPng> {
  assertSourcePreparationActive(options);
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      if (typeof Worker === "undefined")
        throw new Error("Workers are unavailable.");
      worker = new Worker(
        new URL("./source-preparation.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      reject(new WorkerTransportError("Cannot start source worker."));
      return;
    }
    let settled = false;
    const finish = (
      error?: Error,
      value?: PortableCharacterPackArchive | RgbaPng,
    ) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () =>
      finish(new DOMException("Source preparation cancelled.", "AbortError"));
    options.signal?.addEventListener("abort", abort, { once: true });
    // Covers an abort during worker construction, including custom hosts.
    if (options.signal?.aborted) {
      abort();
      return;
    }
    worker.onmessage = (event: MessageEvent<SourcePreparationResponse>) => {
      const response = event.data;
      if (
        !response ||
        response.kind !== request.kind ||
        typeof response.ok !== "boolean" ||
        (response.ok ? !response.value : typeof response.message !== "string")
      ) {
        finish(new WorkerTransportError("Invalid source worker response."));
        return;
      }
      if (!response.ok) finish(new Error(response.message));
      else finish(undefined, response.value);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(new WorkerTransportError("Source worker stopped unexpectedly."));
    };
    worker.onmessageerror = () =>
      finish(new WorkerTransportError("Cannot receive source worker result."));
    try {
      // Transfer a disposable copy. The retained snapshot is needed if the
      // worker fails after accepting its message; public/project bytes stay live.
      const bytes = new Uint8Array(request.bytes);
      worker.postMessage({ ...request, bytes }, [bytes.buffer]);
    } catch {
      finish(new WorkerTransportError("Cannot send source worker input."));
    }
  });
}

/** Parse all ZIP/manifest/PNG-header checks away from the UI on a cold load. */
export async function prepareSourceArchive(
  bytes: Uint8Array,
  options: SourcePreparationOptions = {},
): Promise<PortableCharacterPackArchive> {
  assertSourcePreparationActive(options);
  const snapshot = new Uint8Array(bytes);
  try {
    const result = await prepareInWorker(
      { kind: "archive", bytes: snapshot },
      options,
    );
    assertSourcePreparationActive(options);
    return result as PortableCharacterPackArchive;
  } catch (error) {
    if (!(error instanceof WorkerTransportError)) throw error;
    assertSourcePreparationActive(options);
    const archive = readPortableCharacterPackArchive(snapshot);
    archive.png = new Uint8Array(archive.png);
    if (archive.additionalPngs)
      archive.additionalPngs = archive.additionalPngs.map(
        (png) => new Uint8Array(png),
      );
    return archive;
  }
}

/** Raw RGBA and PNG color chunks, never a browser/canvas color conversion. */
export async function prepareSourcePng(
  bytes: Uint8Array,
  expected?: { width: number; height: number },
  options: SourcePreparationOptions = {},
): Promise<RgbaPng> {
  assertSourcePreparationActive(options);
  const snapshot = new Uint8Array(bytes);
  const dimensions = expected ? { ...expected } : undefined;
  try {
    const result = await prepareInWorker(
      { kind: "png", bytes: snapshot, expected: dimensions },
      options,
    );
    assertSourcePreparationActive(options);
    return result as RgbaPng;
  } catch (error) {
    if (!(error instanceof WorkerTransportError)) throw error;
    assertSourcePreparationActive(options);
    return decodeSourceRgbaPngAsync(snapshot, dimensions, options);
  }
}
