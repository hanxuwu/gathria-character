import { decodeSourceRgbaPngAsync } from "./baked-source";
import { readPortableCharacterPackArchive } from "./pack";
import type {
  SourcePreparationRequest,
  SourcePreparationResponse,
} from "./source-preparation";

// Keep the application DOM tsconfig: adding the WebWorker lib globally would
// introduce conflicting Window declarations. This module runs only in a worker.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<SourcePreparationRequest>) => void) | null;
  postMessage: (
    response: SourcePreparationResponse,
    transfer: Transferable[],
  ) => void;
};
function buffers(arrays: Uint8Array[]): ArrayBuffer[] {
  return [...new Set(arrays.map((bytes) => bytes.buffer as ArrayBuffer))];
}

scope.onmessage = async ({ data: request }) => {
  try {
    if (request.kind === "archive") {
      const parsed = readPortableCharacterPackArchive(request.bytes);
      // Stored ZIP entries may share the ZIP's buffer. Give each returned PNG
      // ownership of exactly its bytes, so cache accounting and transfers agree.
      const value = parsed;
      value.png = new Uint8Array(parsed.png);
      if (parsed.additionalPngs)
        value.additionalPngs = parsed.additionalPngs.map(
          (png) => new Uint8Array(png),
        );
      scope.postMessage(
        { kind: request.kind, ok: true, value },
        buffers([value.png, ...(value.additionalPngs ?? [])]),
      );
    } else if (request.kind === "png") {
      const value = await decodeSourceRgbaPngAsync(
        request.bytes,
        request.expected,
      );
      scope.postMessage(
        { kind: request.kind, ok: true, value },
        buffers([value.pixels, ...value.colorChunks]),
      );
    } else throw new Error("Unsupported source preparation request.");
  } catch (error) {
    scope.postMessage(
      {
        kind: request.kind,
        ok: false,
        message:
          error instanceof Error ? error.message : "Invalid source asset.",
      },
      [],
    );
  }
};
