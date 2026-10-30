import { prepareGarmentPageStrict } from "./garment-page-codec";
import type {
  GarmentPageRequest,
  GarmentPageResponse,
} from "./garment-page-preparation";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<GarmentPageRequest>) => void) | null;
  postMessage: (
    response: GarmentPageResponse,
    transfer: Transferable[],
  ) => void;
};
scope.onmessage = async ({ data: request }) => {
  try {
    if (
      request?.kind !== "garment-page" ||
      !(request.patch instanceof Uint8Array) ||
      !(request.ownership instanceof Uint8Array) ||
      !request.dimensions
    )
      throw Error("Unsupported garment preparation request.");
    const value = await prepareGarmentPageStrict(
      request.patch,
      request.ownership,
      request.dimensions,
    );
    const transfer = [
      ...new Set([
        value.patch.pixels.buffer,
        value.ownership.buffer,
        ...value.patch.colorChunks.map((chunk) => chunk.buffer),
      ]),
    ] as ArrayBuffer[];
    scope.postMessage({ kind: "garment-page", ok: true, value }, transfer);
  } catch (error) {
    scope.postMessage(
      {
        kind: "garment-page",
        ok: false,
        message:
          error instanceof Error ? error.message : "Invalid garment page.",
      },
      [],
    );
  }
};
