import { expect, it } from "vitest";
import type { WardrobeCompositor } from "./compositor";
import type { WardrobeProject } from "./contract";
import { createLookComparison } from "./look-comparison";

const project = {
  document: { sourceSha256: "source", registrationSha256: "anchors" },
} as WardrobeProject;
function renderer(left: number, top: number, color: number) {
  const w = 4 + left,
    h = 6 + top;
  const pixels = new Uint8Array(w * h * 4);
  pixels.set([color, 30, 40, 128], ((top + 3) * w + left + 2) * 4);
  const manifest = {
    spritesheet: { frameWidth: w, frameHeight: h },
    anchor: { x: 2 + left, y: 5 + top },
    frames: [{ id: 42 }, { id: 91 }],
    animations: { run: { frames: [42, 91, 91], fps: 24, loop: true } },
  } as WardrobeCompositor["manifest"];
  return {
    manifest,
    renderFrame: () => ({ width: w, height: h, pixels, colorChunks: [] }),
  };
}
it("uses the union at a common attachment without scaling, clipping or touching transparent artwork", () => {
  const a = renderer(3, 0, 10),
    b = renderer(0, 4, 20);
  const result = createLookComparison(a, b, project, project);
  expect(result.manifest.spritesheet).toMatchObject({
    frameWidth: 7,
    frameHeight: 10,
  });
  expect(result.manifest.anchor).toMatchObject({ x: 5, y: 9 });
  expect(result.manifest.animations).toEqual(b.manifest.animations);
  const i = ((4 + 3) * 7 + 3 + 2) * 4;
  expect(
    Array.from(result.renderSourceFrame(42).pixels.slice(i, i + 4)),
  ).toEqual([10, 30, 40, 128]);
  expect(Array.from(result.renderFrame(42).pixels.slice(i, i + 4))).toEqual([
    20, 30, 40, 128,
  ]);
  expect(
    result
      .renderFrame(42)
      .pixels.filter(
        (_, i) => i % 4 === 3 && result.renderFrame(42).pixels[i] !== 0,
      ),
  ).toHaveLength(1);
  expect(a.manifest.spritesheet.frameHeight).toBe(6);
});
it("rejects other sources, registrations, action timing and source order", () => {
  const a = renderer(0, 0, 10),
    b = renderer(0, 0, 20);
  for (const field of ["sourceSha256", "registrationSha256"])
    expect(() =>
      createLookComparison(a, b, project, {
        document: { ...project.document, [field]: "different" },
      }),
    ).toThrow("same original");
  b.manifest.animations.run!.fps = 30;
  expect(() => createLookComparison(a, b, project, project)).toThrow(
    "sequence",
  );
  b.manifest.animations.run!.fps = 24;
  b.manifest.frames.reverse();
  expect(() => createLookComparison(a, b, project, project)).toThrow(
    "sequence",
  );
});
