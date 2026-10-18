/** Offline registration, never runtime generation. Keep the original Maple
 * skin, ownership masks, joints and clips intact; add only two action forearms
 * using generated closed-hand artwork beneath the exact existing sleeve/cuff. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = new URL("../", import.meta.url);
const baseline = new URL("artwork/generated-traveler/prepared/", root);
const out = new URL("artwork/maple-action-poses/prepared/", root);
const sourcePath = "artwork/maple-action-poses/source/closed-fists.png";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = await readFile(new URL(sourcePath, root));
const baseFiles = {};
for (const name of [
  "traveler.rig.zip",
  "traveler.skin.zip",
  "traveler-top.wardrobe.zip",
  "traveler-bottom.wardrobe.zip",
  "traveler-shoes.wardrobe.zip",
  "registration.json",
])
  baseFiles[name] = await readFile(new URL(name, baseline));
const oldSkinFiles = unzipSync(baseFiles["traveler.skin.zip"]);
const oldMetadata = JSON.parse(
  new TextDecoder().decode(oldSkinFiles["skin.json"]),
);
await mkdir(out, { recursive: true });
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/skin-studio.html`);
  const result = await page.evaluate(
    async ({ source, sourcePath, baseProject, baseTop }) => {
      const {
        importProject,
        exportProject,
        exportSkinPack,
        encodeAttachmentPng,
      } = await import("/src/skeletal/skin-io.ts");
      const { importWardrobeItem, exportWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { decodeWardrobeItemPart, validateWardrobeItem } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const { zlibSync } = await import("/node_modules/.vite/deps/fflate.js");
      const bytes = (value) =>
        Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
      const base64 = (value) => {
        let binary = "";
        for (let offset = 0; offset < value.length; offset += 8192)
          binary += String.fromCharCode(
            ...value.subarray(offset, offset + 8192),
          );
        return btoa(binary);
      };
      const hash = async (value) =>
        Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", value)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      const old = await importProject(new Blob([bytes(baseProject)]));
      const top = await importWardrobeItem(new Blob([bytes(baseTop)]));
      if (
        old.skin.metadata.version !== 1 ||
        top.version !== 1 ||
        top.group !== "top"
      )
        throw Error(
          "Use the retained final V1 Maple project and top as baseline.",
        );
      const project = structuredClone(old);
      const pair = {
        "near-forearm": "near-forearm-active",
        "far-forearm": "far-forearm-active",
      };
      const actionForearms = { run: { ...pair }, jump: { ...pair } };
      const provenance =
        old.skin.metadata.provenance +
        "\nClosed-hand action attachments generated with OpenAI image generation during development, 2026-10-17 UTC. Raw source/prompts retained at artwork/maple-action-poses/source. scripts/prepare-maple-action-poses.mjs thresholds alpha at 192, isolates each source component, nearest-samples two registered hands, then overlays the unchanged original non-skin sleeve/cuff ownership. Only run/jump use the alternatives; all fifteen original slots, bindings, rig and motion data remain unchanged. See docs/MAPLE_ACTION_POSES_REVIEW.md.";
      project.skin.metadata = {
        ...project.skin.metadata,
        version: 2,
        id: "maple-traveler-action-poses",
        actionForearms,
        provenance,
        slots: [
          ...old.skin.metadata.slots,
          "near-forearm-active",
          "far-forearm-active",
        ],
      };
      const image = new Image();
      image.src = "data:image/png;base64," + source;
      await image.decode();
      if (image.naturalWidth !== 1774 || image.naturalHeight !== 887)
        throw Error(
          "Closed-hand source dimensions changed; remeasure explicit registration.",
        );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const sourcePixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const W = 192,
        H = 256,
        stats = [],
        outputs = {},
        parts = [...top.parts];
      // Explicit nonoverlapping source cells. Bounds are measured again after
      // thresholding; transparent storage margins do not alter hand proportions.
      const registrations = [
        {
          side: "near",
          region: [350, 240, 760, 680],
          target: [59, 159, 16, 19],
        },
        {
          side: "far",
          region: [1000, 240, 1410, 680],
          target: [129, 160, 14, 18],
        },
      ];
      for (const registration of registrations) {
        const { side, region, target } = registration;
        const [x0, y0, x1, y1] = region;
        const width = x1 - x0,
          height = y1 - y0;
        const mask = new Uint8Array(width * height),
          seen = new Uint8Array(mask.length);
        let partialAlphaPixels = 0,
          foregroundPixels = 0,
          largest = [];
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const alpha =
              sourcePixels[((y0 + y) * canvas.width + x0 + x) * 4 + 3];
            mask[y * width + x] = +(alpha >= 192);
            foregroundPixels += mask[y * width + x];
            partialAlphaPixels += +(alpha > 0 && alpha < 255);
          }
        for (let p = 0; p < mask.length; p++) {
          if (!mask[p] || seen[p]) continue;
          const component = [p];
          seen[p] = 1;
          for (let n = 0; n < component.length; n++) {
            const at = component[n],
              x = at % width,
              y = Math.floor(at / width);
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const xx = x + dx,
                yy = y + dy,
                next = yy * width + xx;
              if (
                xx >= 0 &&
                xx < width &&
                yy >= 0 &&
                yy < height &&
                mask[next] &&
                !seen[next]
              ) {
                seen[next] = 1;
                component.push(next);
              }
            }
          }
          if (component.length > largest.length) largest = component;
        }
        if (largest.length < 10000)
          throw Error(`${side} hand source is unexpectedly empty.`);
        const owned = new Uint8Array(mask.length);
        let left = width,
          topY = height,
          right = -1,
          bottom = -1;
        for (const p of largest) {
          owned[p] = 1;
          left = Math.min(left, p % width);
          right = Math.max(right, p % width);
          topY = Math.min(topY, Math.floor(p / width));
          bottom = Math.max(bottom, Math.floor(p / width));
        }
        const baseSlot = `${side}-forearm`,
          slot = `${baseSlot}-active`;
        const oldPart = top.parts.find((part) => part.slot === baseSlot);
        const decoded = decodeWardrobeItemPart(oldPart.data);
        const rgba = new Uint8ClampedArray(W * H * 4);
        const packed = new Uint8Array(W * H * 5);
        const [tx, ty, tw, th] = target;
        for (let y = 0; y < th; y++)
          for (let x = 0; x < tw; x++) {
            const sx = left + Math.floor(((x + 0.5) * (right - left + 1)) / tw);
            const sy =
              topY + Math.floor(((y + 0.5) * (bottom - topY + 1)) / th);
            if (!owned[sy * width + sx]) continue;
            const sourceIndex = ((y0 + sy) * canvas.width + x0 + sx) * 4;
            const p = (ty + y) * W + tx + x;
            rgba.set(
              sourcePixels.subarray(sourceIndex, sourceIndex + 3),
              p * 4,
            );
            rgba[p * 4 + 3] = 255;
            packed.set(rgba.subarray(p * 4, p * 4 + 4), p * 5);
            packed[p * 5 + 4] = 1;
          }
        let removedHandPixels = 0,
          preservedSleevePixels = 0,
          overlapPixels = 0;
        // Ownership, never global colour deletion: retain every original
        // fixed/cloth pixel verbatim above the replacement hand at overlaps.
        for (let p = 0; p < W * H; p++) {
          const a = p * 4,
            b = p * 5;
          for (let c = 0; c < 4; c++)
            if (decoded[b + c] !== old.skin.images[baseSlot][a + c])
              throw Error(
                `${baseSlot} item ownership does not match the saved skin.`,
              );
          if (!decoded[b + 3]) continue;
          if (decoded[b + 4] === 1) {
            removedHandPixels++;
            continue;
          }
          if (![0, 3].includes(decoded[b + 4]))
            throw Error("Unexpected forearm material.");
          overlapPixels += +(rgba[a + 3] > 0);
          rgba.set(decoded.subarray(b, b + 4), a);
          packed.set(decoded.subarray(b, b + 5), b);
          preservedSleevePixels++;
        }
        let visibleHandPixels = 0;
        for (let p = 0; p < W * H; p++)
          visibleHandPixels += +(
            packed[p * 5 + 3] === 255 && packed[p * 5 + 4] === 1
          );
        if (visibleHandPixels < 40 || overlapPixels < 2)
          throw Error(
            `${side} hand/cuff registration lacks visible art or overlap (${visibleHandPixels} visible hand pixels, ${overlapPixels} overlap pixels).`,
          );
        project.skin.images[slot] = rgba;
        parts.push({
          ...oldPart,
          slot,
          data: base64(zlibSync(packed)),
          sourceLayerId: "generated-maple-closed-fist:" + slot,
        });
        outputs[`slots/${slot}.png`] = Array.from(
          await encodeAttachmentPng(rgba),
        );
        stats.push({
          slot,
          source: sourcePath,
          region,
          sourceBounds: [x0 + left, y0 + topY, x0 + right + 1, y0 + bottom + 1],
          target,
          alphaThreshold: 192,
          sampling: "nearest pixel centres",
          partialAlphaPixels,
          foregroundPixels,
          largestComponentPixels: largest.length,
          removedHandPixels,
          preservedSleevePixels,
          overlapPixels,
          visibleHandPixels,
          rgbaSha256: await hash(rgba),
          materialSha256: await hash(packed),
        });
      }
      const item = validateWardrobeItem({
        ...top,
        version: 2,
        id: "custom-maple-active-top",
        name: "Maple sweater with action hands",
        provenance,
        actionForearms,
        parts,
      });
      const save = async (name, blob) => {
        outputs[name] = Array.from(new Uint8Array(await blob.arrayBuffer()));
      };
      await save("traveler.rig.zip", await exportProject(project));
      await save("traveler.skin.zip", await exportSkinPack(project.skin));
      await save("traveler-top.wardrobe.zip", await exportWardrobeItem(item));
      const baseImageHashes = {};
      for (const slot of old.skin.metadata.slots) {
        const prior = await hash(old.skin.images[slot]),
          current = await hash(project.skin.images[slot]);
        if (prior !== current) throw Error(`Original source changed: ${slot}`);
        baseImageHashes[slot] = current;
      }
      const unchanged = {};
      for (const [name, before, after] of [
        [
          "bindings",
          old.skin.metadata.bindings,
          project.skin.metadata.bindings,
        ],
        ["rig", old.rig, project.rig],
        ["motions", old.motions, project.motions],
      ]) {
        if (JSON.stringify(before) !== JSON.stringify(after))
          throw Error(`${name} changed.`);
        unchanged[name] = await hash(
          new TextEncoder().encode(JSON.stringify(after)),
        );
      }
      const renderer = prepareRig(project.rig, project.skin, project.motions);
      const priorRenderer = prepareRig(old.rig, old.skin, old.motions);
      const frameChecks = [];
      for (const action of ["idle", "walk", "run", "jump"])
        for (
          let key = 0;
          key < project.motions.clips[action].keys.length;
          key++
        ) {
          const rgba = renderer.frame(action, key, "neutral");
          const before = priorRenderer.frame(action, key, "neutral");
          const frameHash = await hash(rgba),
            beforeHash = await hash(before);
          if (
            (action === "idle" || action === "walk") &&
            frameHash !== beforeHash
          )
            throw Error(`${action} ${key} changed.`);
          outputs[`diagnostics/${action}-${key}.png`] = Array.from(
            await encodeAttachmentPng(rgba),
          );
          frameChecks.push({
            action,
            key,
            beforeSha256: beforeHash,
            afterSha256: frameHash,
            changed: frameHash !== beforeHash,
          });
        }
      return {
        outputs,
        stats,
        baseImageHashes,
        unchanged,
        frameChecks,
        metadata: project.skin.metadata,
      };
    },
    {
      source: source.toString("base64"),
      sourcePath,
      baseProject: baseFiles["traveler.rig.zip"].toString("base64"),
      baseTop: baseFiles["traveler-top.wardrobe.zip"].toString("base64"),
    },
  );
  // Original attachments and unedited garment archives retain their exact
  // checked-in PNG/ZIP bytes, as well as decoded pixels. Never rewrite baseline.
  for (const slot of oldMetadata.slots)
    result.outputs[`slots/${slot}.png`] = oldSkinFiles[`slots/${slot}.png`];
  for (const name of [
    "traveler-bottom.wardrobe.zip",
    "traveler-shoes.wardrobe.zip",
  ])
    result.outputs[name] = baseFiles[name];
  for (const name of ["traveler.rig.zip", "traveler.skin.zip"]) {
    const files = unzipSync(new Uint8Array(result.outputs[name]));
    for (const slot of oldMetadata.slots)
      if (
        digest(files[`slots/${slot}.png`]) !==
        digest(oldSkinFiles[`slots/${slot}.png`])
      )
        throw Error(`${name} original ${slot} PNG encoding changed.`);
  }
  for (const [file, bytes] of Object.entries(result.outputs)) {
    const path = new URL(file, out);
    await mkdir(new URL("./", path), { recursive: true });
    await writeFile(path, new Uint8Array(bytes));
  }
  const record = {
    phase: "action-forearms",
    source: { path: sourcePath, sha256: digest(source) },
    baseline: Object.fromEntries(
      Object.entries(baseFiles).map(([name, bytes]) => [name, digest(bytes)]),
    ),
    parts: result.stats,
    originalImageHashes: result.baseImageHashes,
    unchanged: result.unchanged,
    frameChecks: result.frameChecks,
    metadata: result.metadata,
    files: Object.fromEntries(
      Object.entries(result.outputs).map(([name, bytes]) => [
        name,
        digest(new Uint8Array(bytes)),
      ]),
    ),
  };
  await writeFile(
    new URL("registration.json", out),
    JSON.stringify(record, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      files: Object.keys(result.outputs).length,
      sourceSha256: record.source.sha256,
      parts: record.parts,
      unchanged: record.unchanged,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
