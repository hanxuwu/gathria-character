/** Bounded Theo repair: retain original portable art, add hidden shoulder
 * coverage from the same sleeve cloth, and optionally attach the reviewed run.
 * Sources, old project, faces, lower parts and legacy motions stay immutable. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = new URL("../", import.meta.url);
const output = new URL("artwork/theo-run-repair/prepared/", root);
const sourcePath = "artwork/theo-pose-study/prepared/theo-study.rig.zip";
const source = await readFile(new URL(sourcePath, root));
const hash = (b) => createHash("sha256").update(b).digest("hex");
let reviewedMotion = null;
try {
  reviewedMotion = JSON.parse(
    await readFile(
      new URL("artwork/theo-run-repair/run-motion.json", root),
      "utf8",
    ),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/skin-studio.html`,
  );
  const result = await page.evaluate(
    async ({ source, reviewedMotion }) => {
      const { importProject, exportProject, encodeAttachmentPng } =
        await import("/src/skeletal/skin-io.ts");
      const { exportWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { decodeWardrobeItemPart, validateWardrobeItem } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const { applyWardrobe } = await import("/src/skeletal/wardrobe.ts");
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const { zlibSync } = await import("/node_modules/.vite/deps/fflate.js");
      const from64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const b64 = (b) => {
        let s = "";
        for (let i = 0; i < b.length; i += 8192)
          s += String.fromCharCode(...b.subarray(i, i + 8192));
        return btoa(s);
      };
      const baseline = await importProject(new Blob([from64(source)]));
      const originalTop = baseline.wardrobeItems.find(
        (i) => i.id === baseline.wardrobe.top,
      );
      const top = structuredClone(originalTop);
      top.id = "custom-theo-run-top";
      top.name = "Theo suit — shoulder coverage";
      top.provenance =
        "Derived from Theo complete-pose-model.png and immutable theo-study top. Adds a torso-owned proximal shoulder underlap from exact same-sleeve source RGB/material pixels and removes eight explicitly located misplaced hand-fringe pixels; no new generated art, head changes, or runtime patch painting. scripts/prepare-theo-run-repair.mjs records every copied pixel.";
      const torso = top.parts.find((p) => p.slot === "torso");
      const arm = top.parts.find((p) => p.slot === "near-upper-arm");
      const torsoPixels = decodeWardrobeItemPart(torso.data).slice();
      const armPixels = decodeWardrobeItemPart(arm.data);
      const inside = (x, y, poly) => {
        let yes = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i],
            [xj, yj] = poly[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            yes = !yes;
        }
        return yes;
      };
      // Inner cap only. The broad outer shoulder remains owned by the moving arm.
      // The two-pixel top allowance hides behind the hair at rest and supports the
      // shoulder when the sleeve turns; no final-frame hole detector is involved.
      const polygon = [
        [65, 118],
        [67, 115],
        [72, 113],
        [80, 114],
        [84, 122],
        [80, 132],
        [68, 131],
      ];
      const copied = [];
      for (let y = 110; y < 134; y++)
        for (let x = 64; x < 86; x++) {
          const p = (y * 192 + x) * 5;
          if (torsoPixels[p + 3] || !inside(x + 0.5, y + 0.5, polygon))
            continue;
          let donor = null,
            best = Infinity;
          for (let sy = 116; sy <= 133; sy++)
            for (let sx = 62; sx <= 77; sx++) {
              const q = (sy * 192 + sx) * 5;
              if (armPixels[q + 3] !== 255 || armPixels[q + 4] !== 3) continue;
              const d = (sx - x) ** 2 + (sy - y) ** 2;
              if (d < best) {
                donor = [sx, sy];
                best = d;
              }
            }
          if (!donor) throw Error("No same-material sleeve donor");
          const q = (donor[1] * 192 + donor[0]) * 5;
          torsoPixels.set(armPixels.subarray(q, q + 5), p);
          copied.push({
            target: [x, y],
            sourceSlot: "near-upper-arm",
            source: donor,
            rgba: Array.from(armPixels.subarray(q, q + 4)),
            material: armPixels[q + 4],
          });
        }
      // Eight disconnected skin pixels are a remnant of the standing master's
      // hand in the coat extraction. They belong to the arm, not the torso. Keep
      // this local ownership trim explicit; never delete colors globally.
      const removed = [];
      for (let y = 179; y <= 182; y++)
        for (let x = 61; x <= 62; x++) {
          const p = (y * 192 + x) * 5;
          if (torsoPixels[p + 3] !== 255)
            throw Error("Expected known hand-fringe source pixel");
          removed.push({
            target: [x, y],
            rgba: Array.from(torsoPixels.subarray(p, p + 4)),
            material: torsoPixels[p + 4],
            reason: "Detached standing hand fringe misassigned to torso",
          });
          torsoPixels.fill(0, p, p + 5);
        }
      torso.data = b64(zlibSync(torsoPixels));
      torso.sourceLayerId = "theo-run:torso-shoulder-underlap";
      validateWardrobeItem(top);
      const recipe = { ...baseline.wardrobe, top: top.id };
      const project = applyWardrobe(
        {
          ...baseline,
          wardrobeItems: baseline.wardrobeItems.map((i) =>
            i.id === originalTop.id ? top : i,
          ),
        },
        recipe,
      );
      const oldMotion = structuredClone(project);
      if (reviewedMotion) {
        if (reviewedMotion.format === "gathria-motion-library")
          project.motions = structuredClone(reviewedMotion);
        else {
          project.motions = structuredClone(baseline.motions);
          project.motions.id = "theo-run-repair-basic-actions-1";
          project.motions.clips.run = structuredClone(
            reviewedMotion.clip ?? reviewedMotion,
          );
        }
      }
      project.preview = {
        ...project.preview,
        animation: "run",
        facing: "right",
        expression: "neutral",
      };
      const outputs = {};
      const saveBlob = async (n, b) =>
        (outputs[n] = Array.from(new Uint8Array(await b.arrayBuffer())));
      await saveBlob(
        "theo-run-top.wardrobe.zip",
        await exportWardrobeItem(top),
      );
      await saveBlob("theo-run.rig.zip", await exportProject(project));
      await saveBlob(
        "theo-run-old-motion.rig.zip",
        await exportProject(oldMotion),
      );
      const renderers = {
        before: prepareRig(baseline.rig, baseline.skin, baseline.motions),
        coverage: prepareRig(oldMotion.rig, oldMotion.skin, oldMotion.motions),
        final: prepareRig(project.rig, project.skin, project.motions),
      };
      outputs["diagnostics/run-inspection.json"] = Array.from(
        new TextEncoder().encode(
          JSON.stringify(
            {
              sourceChains: project.skin.metadata.bindings.chains,
              keys: project.motions.clips.run.keys,
              frames: Array.from({ length: 12 }, (_, key) => ({
                key,
                ...renderers.final.inspect("run", key, "neutral"),
              })),
            },
            null,
            2,
          ) + "\n",
        ),
      );
      for (const action of ["idle", "walk", "jump"])
        if (
          JSON.stringify(project.motions.clips[action]) !==
          JSON.stringify(baseline.motions.clips[action])
        )
          throw Error(`Unexpected non-run motion edit: ${action}`);
      const frameChecks = [];
      for (const [variant, renderer] of Object.entries(renderers)) {
        for (const action of ["idle", "walk", "run", "jump"])
          for (let i = 0; i < project.motions.clips[action].keys.length; i++) {
            const rgba = renderer.frame(action, i, "neutral");
            outputs[`diagnostics/${variant}/${action}-${i}.png`] = Array.from(
              await encodeAttachmentPng(rgba),
            );
          }
      }
      for (const expression of ["neutral", "gentle", "joyful"])
        for (const action of ["idle", "walk", "run", "jump"])
          for (let i = 0; i < project.motions.clips[action].keys.length; i++) {
            const rgba = renderers.final.frame(action, i, expression);
            let left = 192,
              top = 256,
              right = -1,
              bottom = -1;
            for (let p = 0; p < 192 * 256; p++)
              if (rgba[p * 4 + 3]) {
                const x = p % 192,
                  y = Math.floor(p / 192);
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
            if (left === 0 || right === 191 || top === 0 || bottom === 255)
              throw Error(
                `Frame clipping ${expression}/${action}/${i} ${[left, top, right, bottom]}`,
              );
            frameChecks.push({
              expression,
              action,
              key: i,
              bounds: [left, top, right + 1, bottom + 1],
            });
          }
      const sourceChecks = [];
      for (const slot of baseline.skin.metadata.slots) {
        const old = baseline.skin.images[slot],
          current = oldMotion.skin.images[slot];
        let channels = 0,
          pixels = 0;
        for (let p = 0; p < 192 * 256; p++) {
          let different = false;
          for (let c = 0; c < 4; c++)
            if (old[p * 4 + c] !== current[p * 4 + c]) {
              channels++;
              different = true;
            }
          pixels += +different;
        }
        if (slot !== "torso" && channels)
          throw Error(`Unexpected changed source slot ${slot}`);
        if (slot === "torso" && pixels !== copied.length + removed.length)
          throw Error(
            `Torso source changes exceed explicit ownership edits: ${pixels}`,
          );
        sourceChecks.push({
          slot,
          changedPixels: pixels,
          changedChannels: channels,
        });
      }
      for (const part of top.parts) {
        const pixels = decodeWardrobeItemPart(part.data),
          rgba = new Uint8ClampedArray(192 * 256 * 4),
          mask = new Uint8ClampedArray(rgba.length);
        for (let p = 0; p < 192 * 256; p++) {
          rgba.set(pixels.subarray(p * 5, p * 5 + 4), p * 4);
          mask[p * 4] = pixels[p * 5 + 4];
          mask[p * 4 + 3] = pixels[p * 5 + 3];
        }
        outputs[`theo-run-top/slots/${part.slot}.png`] = Array.from(
          await encodeAttachmentPng(rgba),
        );
        outputs[`theo-run-top/masks/${part.slot}.png`] = Array.from(
          await encodeAttachmentPng(mask),
        );
      }
      const regression = [];
      for (const action of ["idle", "walk", "jump"])
        for (let i = 0; i < baseline.motions.clips[action].keys.length; i++) {
          const before = renderers.before.frame(action, i, "neutral"),
            after = renderers.coverage.frame(action, i, "neutral");
          let changed = 0,
            added = 0,
            removed = 0,
            left = 192,
            top = 256,
            right = -1,
            bottom = -1;
          for (let p = 0; p < 192 * 256; p++) {
            if (
              before
                .subarray(p * 4, p * 4 + 4)
                .some((v, c) => v !== after[p * 4 + c])
            ) {
              changed++;
              left = Math.min(left, p % 192);
              right = Math.max(right, p % 192);
              top = Math.min(top, Math.floor(p / 192));
              bottom = Math.max(bottom, Math.floor(p / 192));
            }
            added += +(!before[p * 4 + 3] && !!after[p * 4 + 3]);
            removed += +(!!before[p * 4 + 3] && !after[p * 4 + 3]);
          }
          regression.push({
            action,
            key: i,
            changedPixels: changed,
            addedPixels: added,
            removedPixels: removed,
            changeBounds: [left, top, right + 1, bottom + 1],
          });
        }
      const composite = async (name, cells, crop, zoom, cols) => {
        const [sx, sy, sw, sh] = crop,
          c = document.createElement("canvas");
        c.width = cols * sw * zoom;
        c.height = Math.ceil(cells.length / cols) * (sh * zoom + 24);
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#dfe6d3";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.font = "12px sans-serif";
        for (let i = 0; i < cells.length; i++) {
          const [variant, action, key] = cells[i],
            tiny = document.createElement("canvas");
          tiny.width = 192;
          tiny.height = 256;
          tiny
            .getContext("2d")
            .putImageData(
              new ImageData(
                renderers[variant].frame(action, key, "neutral"),
                192,
                256,
              ),
              0,
              0,
            );
          const x = (i % cols) * sw * zoom,
            y = Math.floor(i / cols) * (sh * zoom + 24);
          ctx.fillStyle = "#25302a";
          ctx.fillText(`${variant} ${action} ${key + 1}`, x + 4, y + 16);
          ctx.drawImage(tiny, sx, sy, sw, sh, x, y + 24, sw * zoom, sh * zoom);
        }
        await saveBlob(
          name,
          await new Promise((resolve) => c.toBlob(resolve, "image/png")),
        );
      };
      await composite(
        "diagnostics/coverage-comparison-8x.png",
        [
          ["before", "run", 5],
          ["coverage", "run", 5],
          ["before", "idle", 0],
          ["coverage", "idle", 0],
        ],
        [50, 105, 55, 55],
        8,
        4,
      );
      await composite(
        "diagnostics/all-shoulders-4x.png",
        ["before", "coverage"].flatMap((v) =>
          Array.from({ length: 12 }, (_, i) => [v, "run", i]),
        ),
        [45, 102, 55, 60],
        4,
        12,
      );
      await composite(
        "diagnostics/final-run-keyframes-2x.png",
        Array.from({ length: 12 }, (_, i) => ["final", "run", i]),
        [0, 0, 192, 256],
        2,
        6,
      );
      await composite(
        "diagnostics/coverage-other-actions-1x.png",
        ["idle", "walk", "jump"].flatMap((action) =>
          [
            0,
            Math.floor(project.motions.clips[action].keys.length / 2),
          ].flatMap((i) => ["before", "coverage"].map((v) => [v, action, i])),
        ),
        [0, 0, 192, 256],
        1,
        4,
      );
      return {
        outputs,
        ownership: { slot: "torso", polygon, copied, removed },
        frameChecks,
        sourceChecks,
        regression,
        reviewedMotion: !!reviewedMotion,
      };
    },
    { source: source.toString("base64"), reviewedMotion },
  );
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of Object.entries(result.outputs)) {
    const target = new URL(name, output);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, new Uint8Array(bytes));
  }
  // Preparation-only side-by-side preview from the exact renderer PNGs above.
  // Final review evidence is captured separately through Studio export.
  execFileSync("python3", [
    "-c",
    String.raw`
from PIL import Image,ImageDraw
from pathlib import Path
import sys
root=Path(sys.argv[1]); frames=[]
for i in range(12):
    canvas=Image.new('RGB',(810,550),'#e7ebdf'); draw=ImageDraw.Draw(canvas)
    for column,variant in enumerate(['before','final']):
        image=Image.open(root/'diagnostics'/variant/('run-'+str(i)+'.png')).resize((384,512),Image.Resampling.NEAREST)
        canvas.paste(image,(column*400+10,30),image)
        draw.text((column*400+10,10),variant+' / run '+str(i+1),fill='black')
    frames.append(canvas)
durations=[round((i+1)*100/18)*10-round(i*100/18)*10 for i in range(12)]
frames[0].save(root/'diagnostics/run-comparison-2x.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=2)
`,
    fileURLToPath(output),
  ]);
  result.outputs["diagnostics/run-comparison-2x.gif"] = Array.from(
    await readFile(new URL("diagnostics/run-comparison-2x.gif", output)),
  );
  const { outputs, ...metadata } = result;
  await writeFile(
    new URL("registration.json", output),
    JSON.stringify(
      {
        source: { path: sourcePath, sha256: hash(source) },
        motionSource: reviewedMotion
          ? {
              path: "artwork/theo-run-repair/run-motion.json",
              sha256: hash(
                await readFile(
                  new URL("artwork/theo-run-repair/run-motion.json", root),
                ),
              ),
            }
          : null,
        ...metadata,
        files: Object.fromEntries(
          Object.entries(outputs).map(([n, b]) => [n, hash(new Uint8Array(b))]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      files: Object.keys(outputs).length,
      copied: metadata.ownership.copied.length,
      reviewedMotion: metadata.reviewedMotion,
      nonRunRegressions: metadata.regression.filter((x) => x.changedPixels),
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
