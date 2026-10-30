import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import {
  checkPageHeader,
  prepareGarmentPageStrict,
  type DecodedGarmentPage,
} from "./garment-page-codec";

export type GarmentPageRequest = {
  kind: "garment-page";
  patch: Uint8Array;
  ownership: Uint8Array;
  dimensions: { width: number; height: number };
};
export type GarmentPageResponse =
  | { kind: "garment-page"; ok: true; value: DecodedGarmentPage }
  | { kind: "garment-page"; ok: false; message: string };

class GarmentWorkerTransportError extends Error {}

function validResult(
  value: DecodedGarmentPage,
  dimensions: GarmentPageRequest["dimensions"],
): boolean {
  return !!(
    value &&
    value.patch &&
    value.patch.width === dimensions.width &&
    value.patch.height === dimensions.height &&
    value.patch.pixels instanceof Uint8Array &&
    value.patch.pixels.length === dimensions.width * dimensions.height * 4 &&
    value.ownership instanceof Uint8Array &&
    value.ownership.length === dimensions.width * dimensions.height &&
    Array.isArray(value.patch.colorChunks) &&
    value.patch.colorChunks.every((chunk) => chunk instanceof Uint8Array)
  );
}

function inWorker(
  request: GarmentPageRequest,
  options: SourcePreparationOptions,
): Promise<DecodedGarmentPage> {
  assertSourcePreparationActive(options);
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      if (typeof Worker === "undefined") throw Error("Workers unavailable.");
      worker = new Worker(
        new URL("./garment-page-preparation.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      reject(new GarmentWorkerTransportError("Cannot start garment worker."));
      return;
    }
    let settled = false;
    const finish = (error?: Error, value?: DecodedGarmentPage) => {
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
      finish(new DOMException("Garment preparation cancelled.", "AbortError"));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    worker.onmessage = (event: MessageEvent<GarmentPageResponse>) => {
      const response = event.data;
      if (
        !response ||
        response.kind !== "garment-page" ||
        typeof response.ok !== "boolean" ||
        (response.ok
          ? !validResult(response.value, request.dimensions)
          : typeof response.message !== "string")
      ) {
        finish(
          new GarmentWorkerTransportError("Invalid garment worker response."),
        );
        return;
      }
      // Asset rejection is definitive. Never retry invalid bytes via fallback.
      if (!response.ok) finish(new Error(response.message));
      else finish(undefined, response.value);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(
        new GarmentWorkerTransportError("Garment worker stopped unexpectedly."),
      );
    };
    worker.onmessageerror = () =>
      finish(
        new GarmentWorkerTransportError(
          "Cannot receive garment worker result.",
        ),
      );
    try {
      const patch = new Uint8Array(request.patch),
        ownership = new Uint8Array(request.ownership);
      worker.postMessage({ ...request, patch, ownership }, [
        patch.buffer,
        ownership.buffer,
      ]);
    } catch {
      finish(
        new GarmentWorkerTransportError("Cannot send garment worker input."),
      );
    }
  });
}

/** A disposable worker owns the heavy paired PNG decode and ownership scan.
 * Snapshot before yielding; retain source/project buffers and fallback bytes.
 * Only validated successful results may be admitted to the shared page cache. */
export async function prepareGarmentPage(
  patch: Uint8Array,
  ownership: Uint8Array,
  dimensions: { width: number; height: number },
  options: SourcePreparationOptions = {},
): Promise<DecodedGarmentPage> {
  assertSourcePreparationActive(options);
  checkPageHeader(patch, dimensions.width, dimensions.height);
  checkPageHeader(ownership, dimensions.width, dimensions.height);
  const request: GarmentPageRequest = {
    kind: "garment-page",
    patch: new Uint8Array(patch),
    ownership: new Uint8Array(ownership),
    dimensions: { ...dimensions },
  };
  try {
    const value = await inWorker(request, options);
    assertSourcePreparationActive(options);
    return value;
  } catch (error) {
    if (!(error instanceof GarmentWorkerTransportError)) throw error;
    assertSourcePreparationActive(options);
    const value = await prepareGarmentPageStrict(
      request.patch,
      request.ownership,
      request.dimensions,
    );
    assertSourcePreparationActive(options);
    return value;
  }
}
