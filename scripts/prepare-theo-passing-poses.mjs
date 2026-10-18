/** Source-specific, offline run alternatives. Existing source parts and motion
 * stay byte-identical. A complete illustrated bent leg and side-view boot are
 * registered independently, not reconstructed by painting final frames. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = new URL("../", import.meta.url);
const output = new URL("artwork/theo-passing-poses/prepared/", root);
const paths = {
  project: "docs/theo-run-repair/final/theo-run.rig.zip",
  master: "artwork/theo-pose-study/source/complete-pose-model.png",
  bentLeg: "artwork/theo-passing-poses/source/complete-bent-leg.png",
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sources = {};
for (const [key, path] of Object.entries(paths)) {
  const bytes = await readFile(new URL(path, root));
  sources[key] = { path, sha256: hash(bytes), data: bytes.toString("base64") };
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
    async ({ sources }) => {
      const { importProject, exportProject, encodeAttachmentPng } =
        await import("/src/skeletal/skin-io.ts");
      const { exportWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { validateWardrobeItem, decodeWardrobeItemPart } = await import(
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
      const baseline = await importProject(
        new Blob([from64(sources.project.data)]),
      );
      const originalBottom = baseline.wardrobeItems.find(
        (i) => i.id === baseline.wardrobe.bottom,
      );
      const originalShoes = baseline.wardrobeItems.find(
        (i) => i.id === baseline.wardrobe.shoes,
      );
      const outputs = {},
        registrations = [];
      const saveBlob = async (name, blob) =>
        (outputs[name] = Array.from(new Uint8Array(await blob.arrayBuffer())));
      const decoded = {};
      for (const sourceKey of ["master", "bentLeg"]) {
        const image = new Image();
        image.src = "data:image/png;base64," + sources[sourceKey].data;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        decoded[sourceKey] = {
          image,
          width: canvas.width,
          height: canvas.height,
          pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
        };
      }
      const scale = 121 / 250,
        legScale = 0.078;
      const sourceJoints = [
        [590, 320],
        [972, 490],
        [773, 850],
      ];
      const shoeSourceAnkle = [1268, 456];
      // The second, isolated source owns a complete rounded proximal cap and
      // centered cuff, so no neighboring garment or occlusion polygon is needed.
      const legPolygon = [
        [0, 0],
        [1536, 0],
        [1536, 1024],
        [0, 1024],
      ];
      const shoePolygon = [
        [1227, 458],
        [1249, 458],
        [1266, 454],
        [1276, 451],
        [1289, 451],
        [1301, 457],
        [1313, 462],
        [1322, 470],
        [1328, 480],
        [1326, 488],
        [1317, 495],
        [1262, 496],
        [1233, 491],
        [1222, 485],
        [1222, 470],
      ];
      const sourceReview = document.createElement("canvas");
      sourceReview.width = 2 * 650;
      sourceReview.height = 784;
      const reviewContext = sourceReview.getContext("2d");
      reviewContext.imageSmoothingEnabled = false;
      reviewContext.fillStyle = "#ede9df";
      reviewContext.fillRect(0, 0, 1300, 784);
      reviewContext.font = "14px sans-serif";
      for (let column = 0; column < 2; column++) {
        const dx = column * 650;
        reviewContext.drawImage(
          decoded.bentLeg.image,
          450,
          150,
          650,
          760,
          dx,
          24,
          650,
          760,
        );
        reviewContext.fillStyle = "#25302a";
        reviewContext.fillText(
          column
            ? "Registered source hip, knee, ankle"
            : "Unmodified isolated bent-leg source",
          dx + 8,
          17,
        );
        if (!column) continue;
        reviewContext.lineWidth = 2;
        reviewContext.strokeStyle = "#cf3fe6";
        reviewContext.beginPath();
        sourceJoints.forEach(([x, y], i) =>
          reviewContext[i ? "lineTo" : "moveTo"](dx + x - 450, 24 + y - 150),
        );
        reviewContext.stroke();
        for (const [x, y] of sourceJoints) {
          reviewContext.fillStyle = "#cf3fe6";
          reviewContext.fillRect(dx + x - 450 - 3, 24 + y - 150 - 3, 6, 6);
        }
      }
      await saveBlob(
        "diagnostics/source-leg-registration.png",
        await new Promise((resolve) =>
          sourceReview.toBlob(resolve, "image/png"),
        ),
      );
      const inside = (x, y, polygon) => {
        let result = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const [xi, yi] = polygon[i],
            [xj, yj] = polygon[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            result = !result;
        }
        return result;
      };
      function registeredPart(
        slot,
        sourceKey,
        s,
        polygon,
        sourceAnchor,
        targetAnchor,
        material,
        palette,
      ) {
        const source = decoded[sourceKey].pixels;
        const raw = new Uint8Array(192 * 256 * 5),
          samples = [];
        for (let y = 0; y < 256; y++)
          for (let x = 0; x < 192; x++) {
            const sx = Math.round(sourceAnchor[0] + (x - targetAnchor[0]) / s);
            const sy = Math.round(sourceAnchor[1] + (y - targetAnchor[1]) / s);
            if (!inside(sx + 0.5, sy + 0.5, polygon)) continue;
            const p = (sy * decoded[sourceKey].width + sx) * 4;
            if (source[p + 3] < 192) continue;
            const q = (y * 192 + x) * 5;
            raw.set(source.subarray(p, p + 3), q);
            raw[q + 3] = 255;
            raw[q + 4] = material;
            samples.push({ target: [x, y], source: [sx, sy] });
          }
        registrations.push({
          slot,
          source: sources[sourceKey].path,
          sourceAnchor,
          targetAnchor,
          scale: s,
          polygon,
          alphaThreshold: 192,
          material,
          samples,
        });
        return {
          slot,
          data: b64(zlibSync(raw)),
          palette,
          preserveWarmSkin: false,
          sourceLayerId: "theo-passing:" + sourceKey + ":" + slot,
        };
      }
      const mappedPoint = (sourcePoint, sourceAnchor, targetAnchor, s) =>
        sourcePoint.map((value, i) =>
          Math.round(targetAnchor[i] + (value - sourceAnchor[i]) * s),
        );
      const bottom = structuredClone(originalBottom);
      bottom.version = 4;
      bottom.id = "custom-theo-passing-bottom";
      bottom.name = "Theo trousers — registered bent pose";
      bottom.provenance =
        "OpenAI image generation: artwork/theo-passing-poses/source/complete-bent-leg.png, a complete isolated navy bent trouser leg with rounded hidden proximal cap and centered cuff, made with the original Theo running source as visual reference. Uniform 0.078 nearest-neighbor registration, alpha >=192, source hip/knee/ankle reused for paired near/far run alternatives. All original base parts and target anatomy remain exact. See source provenance and scripts/prepare-theo-passing-poses.mjs for source/target samples. No final-frame patch painting.";
      bottom.runLegs = {};
      const shoes = structuredClone(originalShoes);
      shoes.version = 4;
      shoes.id = "custom-theo-passing-shoes";
      shoes.name = "Theo boots — registered side profile";
      shoes.provenance =
        "Original Theo complete-pose-model.png, upper-right run illustration, source boot isolated from trouser cuff by explicit polygon. Uniform 0.484 registration preserves source RGB/material and own ankle. Near/far use the same side-view boot; original standing shoes remain byte-identical. No new generated art. scripts/prepare-theo-passing-poses.mjs records ownership and source samples.";
      shoes.runShoes = {};
      for (const side of ["near", "far"]) {
        const limb = side + "Leg";
        const legSlot = side + "-leg-bent",
          shoeSlot = side + "-shoe-run";
        const hip = baseline.skin.metadata.bindings.chains[limb][0];
        const ankle = originalShoes.ankles[side];
        bottom.parts.push(
          registeredPart(
            legSlot,
            "bentLeg",
            legScale,
            legPolygon,
            sourceJoints[0],
            hip,
            4,
            { lower: baseline.wardrobe.colors.bottom },
          ),
        );
        bottom.runLegs[limb] = {
          slot: legSlot,
          joints: sourceJoints.map((p) =>
            mappedPoint(p, sourceJoints[0], hip, legScale),
          ),
        };
        shoes.parts.push(
          registeredPart(
            shoeSlot,
            "master",
            scale,
            shoePolygon,
            shoeSourceAnkle,
            ankle,
            5,
            { shoe: baseline.wardrobe.colors.shoes },
          ),
        );
        shoes.runShoes[limb] = { slot: shoeSlot, ankle };
      }
      const validBottom = validateWardrobeItem(bottom),
        validShoes = validateWardrobeItem(shoes);
      const variant = (newBottom, newShoes) => {
        const project = applyWardrobe(
          {
            ...baseline,
            wardrobeItems: baseline.wardrobeItems.map((item) =>
              item.id === originalBottom.id && newBottom
                ? validBottom
                : item.id === originalShoes.id && newShoes
                  ? validShoes
                  : item,
            ),
          },
          {
            ...baseline.wardrobe,
            bottom: newBottom ? bottom.id : originalBottom.id,
            shoes: newShoes ? shoes.id : originalShoes.id,
          },
        );
        project.preview = {
          ...baseline.preview,
          animation: "run",
          facing: "right",
          expression: "neutral",
        };
        return project;
      };
      const projects = {
        before: baseline,
        legs: variant(true, false),
        shoes: variant(false, true),
        final: variant(true, true),
      };
      for (const [name, project] of Object.entries(projects)) {
        if (
          JSON.stringify(project.motions) !== JSON.stringify(baseline.motions)
        )
          throw Error("Motion library changed: " + name);
        if (JSON.stringify(project.rig) !== JSON.stringify(baseline.rig))
          throw Error("Anatomical rig changed: " + name);
        for (const slot of baseline.skin.metadata.slots)
          if (
            project.skin.images[slot].some(
              (v, i) => v !== baseline.skin.images[slot][i],
            )
          )
            throw Error("Base source part changed: " + name + "/" + slot);
        if (
          JSON.stringify(project.wardrobeIdentities) !==
          JSON.stringify(baseline.wardrobeIdentities)
        )
          throw Error("Identity changed: " + name);
        if (name !== "before")
          await saveBlob(
            name === "final"
              ? "theo-passing.rig.zip"
              : `diagnostics/theo-passing-${name}.rig.zip`,
            await exportProject(project),
          );
      }
      await saveBlob(
        "theo-passing-bottom.wardrobe.zip",
        await exportWardrobeItem(validBottom),
      );
      await saveBlob(
        "theo-passing-shoes.wardrobe.zip",
        await exportWardrobeItem(validShoes),
      );
      for (const item of [validBottom, validShoes])
        for (const part of item.parts) {
          if (!part.slot.endsWith("-bent") && !part.slot.endsWith("-run"))
            continue;
          const raw = decodeWardrobeItemPart(part.data),
            rgba = new Uint8ClampedArray(192 * 256 * 4),
            mask = new Uint8ClampedArray(rgba.length);
          for (let p = 0; p < 192 * 256; p++) {
            rgba.set(raw.subarray(p * 5, p * 5 + 4), p * 4);
            mask[p * 4] = raw[p * 5 + 4];
            mask[p * 4 + 3] = raw[p * 5 + 3];
          }
          outputs[`slots/${part.slot}.png`] = Array.from(
            await encodeAttachmentPng(rgba),
          );
          outputs[`masks/${part.slot}.png`] = Array.from(
            await encodeAttachmentPng(mask),
          );
        }
      const renderers = Object.fromEntries(
        Object.entries(projects).map(([name, project]) => [
          name,
          prepareRig(project.rig, project.skin, project.motions),
        ]),
      );
      const regressions = [],
        frames = [],
        inspections = {};
      for (const [name, renderer] of Object.entries(renderers)) {
        // Full mesh arrays are reproducible from the saved project. Retain the
        // chosen source and posed joints without duplicating megabytes of mesh
        // topology once per frame in the source provenance record.
        inspections[name] = Array.from({ length: 12 }, (_, i) => {
          const inspection = renderer.inspect("run", i, "neutral");
          return {
            key: i,
            bodyBones: inspection.bodyBones,
            limbs: inspection.limbs.map(
              ({ id, variant, sourceSlots, bones }) => ({
                id,
                variant,
                sourceSlots,
                bones,
              }),
            ),
          };
        });
        for (const action of ["idle", "walk", "run", "jump"])
          for (
            let key = 0;
            key < baseline.motions.clips[action].keys.length;
            key++
          ) {
            const pixels = renderer.frame(action, key, "neutral");
            if (action === "run")
              outputs[`diagnostics/${name}/${action}-${key}.png`] = Array.from(
                await encodeAttachmentPng(pixels),
              );
            if (action !== "run") {
              const old = renderers.before.frame(action, key, "neutral");
              const changed = pixels.reduce(
                (n, value, i) => n + Number(value !== old[i]),
                0,
              );
              if (changed)
                throw Error(
                  `Non-run regression ${name}/${action}/${key}: ${changed}`,
                );
              regressions.push({
                variant: name,
                action,
                key,
                changedChannels: changed,
              });
            }
          }
      }
      for (const expression of ["neutral", "gentle", "joyful"])
        for (const action of ["idle", "walk", "run", "jump"])
          for (
            let key = 0;
            key < baseline.motions.clips[action].keys.length;
            key++
          ) {
            const pixels = renderers.final.frame(action, key, expression);
            let left = 192,
              top = 256,
              right = -1,
              bottom = -1;
            for (let p = 0; p < 192 * 256; p++)
              if (pixels[p * 4 + 3]) {
                left = Math.min(left, p % 192);
                right = Math.max(right, p % 192);
                top = Math.min(top, Math.floor(p / 192));
                bottom = Math.max(bottom, Math.floor(p / 192));
              }
            if (left < 1 || right > 190 || top < 1 || bottom > 254)
              throw Error(`Clipping ${expression}/${action}/${key}`);
            frames.push({
              expression,
              action,
              key,
              bounds: [left, top, right + 1, bottom + 1],
            });
          }
      return {
        outputs,
        registrations,
        sourceJoints,
        runLegs: bottom.runLegs,
        runShoes: shoes.runShoes,
        regressions,
        frames,
        inspections,
        inspectionNote:
          "Full mesh arrays are reproducible from the saved editable project. Compact inspections retain anatomical posed bones, chosen source slots and base/bent variant.",
        retentionNote:
          "Non-running frames were checked for exact equality; their duplicate PNGs are omitted. Retained earlier iterations keep contact sheets/GIF, source parts/masks, registration, prep script and one self-contained project.",
        unchanged: {
          motion: true,
          baseSkinParts: baseline.skin.metadata.slots,
          identities: true,
          rig: true,
        },
      };
    },
    { sources },
  );
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of Object.entries(result.outputs)) {
    const target = new URL(name, output);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, new Uint8Array(bytes));
  }
  execFileSync("python3", [
    "-c",
    String.raw`
from PIL import Image,ImageDraw
from pathlib import Path
import sys
p=Path(sys.argv[1]); frames=[]
for i in range(12):
    c=Image.new('RGB',(800,552),'#e7ebdf');d=ImageDraw.Draw(c)
    for j,name in enumerate(['before','final']):
        im=Image.open(p/'diagnostics'/name/('run-'+str(i)+'.png')).convert('RGBA').resize((384,512),Image.Resampling.NEAREST)
        c.paste(im,(j*400+8,32),im);d.text((j*400+8,10),name+' / key '+str(i+1),fill='#25302a')
    frames.append(c)
durations=[round((i+1)*100/18)*10-round(i*100/18)*10 for i in range(12)]
frames[0].save(p/'diagnostics/run-comparison-2x.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=2)
for zoom in [1,2]:
 c=Image.new('RGB',(6*192*zoom,4*(256*zoom+24)),'#e7ebdf');d=ImageDraw.Draw(c)
 for row,name in enumerate(['before','final']):
  for i in range(12):
   x=(i%6)*192*zoom;y=(row*2+i//6)*(256*zoom+24)
   im=Image.open(p/'diagnostics'/name/('run-'+str(i)+'.png')).resize((192*zoom,256*zoom),Image.Resampling.NEAREST)
   c.paste(im,(x,y+24),im);d.text((x+3,y+6),name+' / '+str(i+1),fill='#25302a')
 c.save(p/('diagnostics/run-keyframes-'+str(zoom)+'x.png'))
`,
    fileURLToPath(output),
  ]);
  for (const name of [
    "diagnostics/run-comparison-2x.gif",
    "diagnostics/run-keyframes-1x.png",
    "diagnostics/run-keyframes-2x.png",
  ])
    result.outputs[name] = Array.from(await readFile(new URL(name, output)));
  const { outputs, ...metadata } = result;
  await writeFile(
    new URL("registration.json", output),
    JSON.stringify(
      {
        sources: Object.fromEntries(
          Object.entries(sources).map(([key, { data, ...record }]) => [
            key,
            record,
          ]),
        ),
        ...metadata,
        files: Object.fromEntries(
          Object.entries(outputs).map(([name, bytes]) => [
            name,
            hash(new Uint8Array(bytes)),
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      files: Object.keys(outputs).length,
      registeredParts: metadata.registrations.map((r) => ({
        slot: r.slot,
        pixels: r.samples.length,
      })),
      frames: metadata.frames.length,
      nonRunRegressionChecks: metadata.regressions.length,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
