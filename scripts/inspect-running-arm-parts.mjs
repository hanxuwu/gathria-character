// Asset ownership diagnostics. These transparent layer images explain the
// source-cut defect; final review PNG/GIFs are captured separately from exports.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const output = new URL("docs/run-connections/diagnostics/", root);
const sourcePaths = [
  "src/core/running-arm-parts.ts",
  "src/core/illustrated-assets.generated.ts",
  "src/core/polished-assets.generated.ts",
];
const hashes = async () =>
  Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (path) => [
        path,
        createHash("sha256")
          .update(await readFile(new URL(path, root)))
          .digest("hex"),
      ]),
    ),
  );
const revisionFiles = await hashes();
const server = await createServer({
  server: { host: "127.0.0.1", port: 5191, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5191");
  const result = await page.evaluate(async () => {
    const { EVERYDAY_EXAMPLES } = await import("/src/core/everyday-presets.ts");
    const { polishedBank } = await import("/src/core/polished-rig.ts");
    const { repairRunningArmParts } = await import(
      "/src/core/running-arm-parts.ts"
    );
    const { IllustratedCanvas, boneTransform } = await import(
      "/src/core/illustrated-canvas.ts"
    );
    const { expressiveColors } = await import("/src/core/expressive-face.ts");
    const { unzlibSync } = await import("/node_modules/.vite/deps/fflate.js");
    const config = EVERYDAY_EXAMPLES.find(
      (item) => item.id === "coral-afternoon",
    ).config;
    const original = polishedBank(config),
      repaired = repairRunningArmParts(original, config);
    const images = [],
      audits = [],
      panels = [];
    function dataUrl(pixels) {
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 256;
      canvas
        .getContext("2d")
        .putImageData(new ImageData(pixels, 192, 256), 0, 0);
      return canvas;
    }
    function rgba(layer) {
      return expressiveColors(layer, { ...config, artworkVersion: 4 });
    }
    function rawCanvas(layer) {
      const data = unzlibSync(
        Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0)),
      );
      const full = new Uint8Array(192 * 256 * 5);
      for (let p = 0; p < layer.width * layer.height; p++) {
        const target =
          ((layer.y + Math.floor(p / layer.width)) * 192 +
            layer.x +
            (p % layer.width)) *
          5;
        full.set(data.subarray(p * 5, p * 5 + 5), target);
      }
      return full;
    }
    const pairs = [
      [
        "near-forearm",
        original.upper.tee.nearForearm,
        repaired.upper.tee.nearForearm,
      ],
      [
        "far-forearm",
        original.upper.tee.farForearm,
        repaired.upper.tee.farForearm,
      ],
      ["torso", original.upper.tee.torso, repaired.upper.tee.torso],
      ["skirt-hips", original.lower.skirt.hips, repaired.lower.skirt.hips],
      ["skirt", original.lower.skirt.garment, repaired.lower.skirt.garment],
    ];
    for (const [part, oldId, newId] of pairs) {
      const before = original.layers.find((layer) => layer.id === oldId);
      const after = repaired.layers.find((layer) => layer.id === newId);
      const old = rawCanvas(before),
        next = rawCanvas(after);
      const removed = [],
        reassigned = [],
        materialChanges = [];
      for (let p = 0; p < 192 * 256; p++) {
        const coordinate = [p % 192, Math.floor(p / 192)];
        if (old[p * 5 + 3] && !next[p * 5 + 3])
          removed.push([...coordinate, ...old.subarray(p * 5, p * 5 + 5)]);
        if (!old[p * 5 + 3] && next[p * 5 + 3])
          reassigned.push([...coordinate, ...next.subarray(p * 5, p * 5 + 5)]);
        if (
          old[p * 5 + 3] &&
          next[p * 5 + 3] &&
          old[p * 5 + 4] !== next[p * 5 + 4]
        )
          materialChanges.push([
            ...coordinate,
            old[p * 5 + 4],
            next[p * 5 + 4],
          ]);
      }
      audits.push({ part, oldId, newId, removed, reassigned, materialChanges });
      const rendered = [];
      for (const [state, layer] of [
        ["before", before],
        ["after", after],
      ]) {
        const canvas = new IllustratedCanvas();
        canvas.draw(layer, rgba(layer));
        const view = dataUrl(canvas.pixels);
        images.push({
          name: `${part}-${state}.png`,
          data: view.toDataURL("image/png").split(",")[1],
        });
        rendered.push(view);
        if (part.includes("forearm")) {
          const near = part.startsWith("near"),
            body = original.upper.tee;
          const elbow = near ? body.elbowNear : body.elbowFar,
            wrist = near ? body.wristNear : body.wristFar;
          const length = Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]);
          for (const [pose, angle] of [
            ["raised", 0.2],
            ["back", -0.8],
          ]) {
            const posedWrist = [
              elbow[0] + Math.cos(angle) * length,
              elbow[1] + Math.sin(angle) * length,
            ];
            const rotated = new IllustratedCanvas();
            rotated.draw(
              layer,
              rgba(layer),
              boneTransform(elbow, wrist, elbow, posedWrist),
            );
            images.push({
              name: `${part}-${pose}-${state}.png`,
              data: dataUrl(rotated.pixels)
                .toDataURL("image/png")
                .split(",")[1],
            });
          }
        }
      }
      panels.push({ part, rendered });
    }
    const panel = document.createElement("canvas");
    panel.width = 5 * 336;
    panel.height = 2 * 324;
    const ctx = panel.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#F3EDE2";
    ctx.fillRect(0, 0, panel.width, panel.height);
    ctx.font = "14px sans-serif";
    panels.forEach(({ part, rendered }, i) =>
      rendered.forEach((canvas, row) => {
        ctx.fillStyle = "#30271F";
        ctx.fillText(
          `${row ? "AFTER" : "BEFORE"} / ${part}`,
          i * 336 + 8,
          row * 324 + 20,
        );
        ctx.drawImage(
          canvas,
          44,
          103,
          112,
          96,
          i * 336,
          row * 324 + 30,
          336,
          288,
        );
      }),
    );
    images.push({
      name: "coral-layer-ownership-3x.png",
      data: panel.toDataURL("image/png").split(",")[1],
    });
    return { images, audits, config };
  });
  assert.deepEqual(
    await hashes(),
    revisionFiles,
    "Source changed during diagnostic capture.",
  );
  await mkdir(output, { recursive: true });
  for (const image of result.images)
    await writeFile(
      new URL(image.name, output),
      Buffer.from(image.data, "base64"),
    );
  await writeFile(
    new URL("arm-ownership-audit.json", output),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        artifactKind:
          "transparent source layer diagnostic, not final character export",
        revisionFiles,
        coordinateFormat:
          "removed/reassigned rows are [x,y,r,g,b,alpha,material]; materialChanges are [x,y,oldMaterial,newMaterial]",
        config: result.config,
        layers: result.audits,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      images: result.images.length,
      layers: result.audits.map((audit) => ({
        part: audit.part,
        removed: audit.removed.length,
        reassigned: audit.reassigned.length,
        relabeled: audit.materialChanges.length,
      })),
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
