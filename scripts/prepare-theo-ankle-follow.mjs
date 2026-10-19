/** Register footwear's original source shin direction. This is a metadata-only
 * opt-in: every artwork byte, anatomical chain and motion key is preserved. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const output = new URL("artwork/theo-ankle-follow/prepared/", root);
const inputs = {
  project: "docs/theo-passing-poses/final/theo-passing.rig.zip",
  originalBoot: "artwork/theo-pose-study/source/complete-pose-model.png",
  previousRegistration: "artwork/theo-passing-poses/prepared/registration.json",
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sources = {};
for (const [name, path] of Object.entries(inputs)) {
  const bytes = await readFile(new URL(path, root));
  sources[name] = { path, sha256: digest(bytes) };
  if (name === "project") sources[name].data = bytes.toString("base64");
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
      const { exportWardrobeItem, importWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { validateWardrobeItem, decodeWardrobeItemPart } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const { applyWardrobe } = await import("/src/skeletal/wardrobe.ts");
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const from64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const baseline = await importProject(
        new Blob([from64(sources.project.data)]),
      );
      const originalShoes = baseline.wardrobeItems.find(
        (item) => item.id === baseline.wardrobe.shoes,
      );
      if (originalShoes.version !== 4 || !originalShoes.runShoes)
        throw Error("Expected the explicit passing-pose source shoes.");
      const originalSource = {
        knee: [1284, 405],
        ankle: [1268, 456],
        scale: 121 / 250,
      };
      const shoes = structuredClone(originalShoes);
      shoes.version = 5;
      shoes.id = "custom-theo-ankle-shoes";
      shoes.name = "Theo boots — follow trouser ankle";
      shoes.provenance =
        "Metadata-only derivation of custom-theo-passing-shoes. All original artwork, palettes and material masks remain exact. Registers the boot's own original source shin from complete-pose-model.png knee(1284,405) to ankle(1268,456), uniform scale0.484, so running footwear follows the posed lower-leg direction about the shared ankle. The generated trouser source has a different rest angle and is not used for footwear registration. No new image generation. scripts/prepare-theo-ankle-follow.mjs records source mapping and preservation checks.";
      const sourceAxis = {};
      for (const side of ["near", "far"]) {
        const chain = side + "Leg",
          entry = shoes.runShoes[chain];
        const sourceShin = entry.ankle.map((v, i) =>
          Math.round(
            v +
              (originalSource.knee[i] - originalSource.ankle[i]) *
                originalSource.scale,
          ),
        );
        shoes.runShoes[chain] = { ...entry, sourceShin };
        sourceAxis[chain] = {
          sourceShin,
          ankle: entry.ankle,
          angleRadians: Math.atan2(
            entry.ankle[1] - sourceShin[1],
            entry.ankle[0] - sourceShin[0],
          ),
        };
      }
      const checkedShoes = validateWardrobeItem(shoes);
      const project = applyWardrobe(
        {
          ...baseline,
          wardrobeItems: baseline.wardrobeItems.map((item) =>
            item.id === originalShoes.id ? checkedShoes : item,
          ),
        },
        { ...baseline.wardrobe, shoes: checkedShoes.id },
      );
      project.preview = {
        ...baseline.preview,
        animation: "run",
        facing: "right",
        expression: "neutral",
      };
      if (project.skin.metadata.version !== 4)
        throw Error("Following footwear requires explicit Skin V4.");
      for (const key of ["rig", "motions", "wardrobeIdentities"])
        if (JSON.stringify(project[key]) !== JSON.stringify(baseline[key]))
          throw Error("Unexpected change: " + key);
      if (JSON.stringify(shoes.parts) !== JSON.stringify(originalShoes.parts))
        throw Error("Footwear source or mask changed.");
      const sourceChecks = [];
      for (const slot of baseline.skin.metadata.slots) {
        const before = baseline.skin.images[slot],
          after = project.skin.images[slot];
        if (
          !after ||
          after.length !== before.length ||
          after.some((v, i) => v !== before[i])
        )
          throw Error("Skin art changed: " + slot);
        sourceChecks.push({ slot, changedChannels: 0 });
      }
      const outputs = {};
      const saveBlob = async (name, blob) =>
        (outputs[name] = Array.from(new Uint8Array(await blob.arrayBuffer())));
      const itemZip = await exportWardrobeItem(checkedShoes),
        projectZip = await exportProject(project);
      await saveBlob("theo-ankle-follow-shoes.wardrobe.zip", itemZip);
      await saveBlob("theo-ankle-follow.rig.zip", projectZip);
      const reopenedItem = await importWardrobeItem(itemZip),
        reopenedProject = await importProject(projectZip);
      const canonical = (value) =>
        value && typeof value === "object"
          ? Array.isArray(value)
            ? value.map(canonical)
            : Object.fromEntries(
                Object.keys(value)
                  .sort()
                  .map((key) => [key, canonical(value[key])]),
              )
          : value;
      if (JSON.stringify(reopenedItem) !== JSON.stringify(checkedShoes))
        throw Error("Footwear ZIP roundtrip changed metadata/art.");
      if (
        JSON.stringify(canonical(reopenedProject.skin.metadata)) !==
        JSON.stringify(canonical(project.skin.metadata))
      )
        throw Error("Project ZIP roundtrip changed skin registration.");
      if (
        JSON.stringify(reopenedProject.motions) !==
        JSON.stringify(project.motions)
      )
        throw Error("Project ZIP roundtrip changed motion.");
      for (const part of checkedShoes.parts) {
        if (!part.slot.endsWith("-run")) continue;
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
      const renderers = {
        before: prepareRig(baseline.rig, baseline.skin, baseline.motions),
        final: prepareRig(project.rig, project.skin, project.motions),
      };
      const inspection = {};
      for (const [name, renderer] of Object.entries(renderers)) {
        inspection[name] = [];
        for (let key = 0; key < 12; key++) {
          const raw = renderer.inspect("run", key, "neutral");
          inspection[name].push({
            key,
            bodyBones: raw.bodyBones,
            shoes: raw.shoes,
            limbs: raw.limbs.map(({ id, variant, sourceSlots, bones }) => ({
              id,
              variant,
              sourceSlots,
              bones,
            })),
          });
          outputs[`diagnostics/${name}/run-${key}.png`] = Array.from(
            await encodeAttachmentPng(renderer.frame("run", key, "neutral")),
          );
        }
      }
      const nonRunChecks = [],
        upperChecks = [],
        frames = [];
      for (const action of ["idle", "walk", "jump"])
        for (
          let key = 0;
          key < baseline.motions.clips[action].keys.length;
          key++
        ) {
          const before = renderers.before.frame(action, key, "neutral"),
            after = renderers.final.frame(action, key, "neutral");
          const changedChannels = after.reduce(
            (n, v, i) => n + Number(v !== before[i]),
            0,
          );
          if (changedChannels)
            throw Error(`Non-run output changed: ${action}/${key}`);
          nonRunChecks.push({ action, key, changedChannels });
        }
      for (const expression of ["neutral", "gentle", "joyful"])
        for (const action of ["idle", "walk", "run", "jump"])
          for (
            let key = 0;
            key < baseline.motions.clips[action].keys.length;
            key++
          ) {
            const after = renderers.final.frame(action, key, expression);
            let left = 192,
              top = 256,
              right = -1,
              bottom = -1;
            for (let p = 0; p < 192 * 256; p++) {
              if (after[p * 4 + 3] !== 0 && after[p * 4 + 3] !== 255)
                throw Error("Non-binary output alpha.");
              if (!after[p * 4 + 3]) continue;
              left = Math.min(left, p % 192);
              right = Math.max(right, p % 192);
              top = Math.min(top, Math.floor(p / 192));
              bottom = Math.max(bottom, Math.floor(p / 192));
            }
            if (left < 1 || right > 190 || top < 1 || bottom > 254)
              throw Error(`Clipping: ${expression}/${action}/${key}`);
            frames.push({
              expression,
              action,
              key,
              bounds: [left, top, right + 1, bottom + 1],
            });
            if (action === "run") {
              const before = renderers.before.frame(action, key, expression);
              const changedUpperChannels = after
                .subarray(0, 192 * 166 * 4)
                .reduce((n, v, i) => n + Number(v !== before[i]), 0);
              if (changedUpperChannels)
                throw Error(`Upper character moved: ${expression}/${key}`);
              upperChecks.push({
                expression,
                key,
                region: [0, 0, 192, 166],
                changedChannels: changedUpperChannels,
              });
            }
          }
      return {
        outputs,
        originalSource,
        sourceAxis,
        sourceChecks,
        nonRunChecks,
        upperChecks,
        frames,
        inspection,
        unchanged: {
          rig: true,
          motions: true,
          identity: true,
          shoeParts: true,
          allSkinImages: true,
        },
        roundtrip: { project: true, wardrobeItem: true },
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
from PIL import Image,ImageDraw,ImageOps
from pathlib import Path
import sys
p=Path(sys.argv[1])
durations=[round((i+1)*100/18)*10-round(i*100/18)*10 for i in range(12)]
for facing in ['right','left']:
 frames=[]
 for i in range(12):
  c=Image.new('RGB',(800,552),'#e7ebdf');d=ImageDraw.Draw(c)
  for j,name in enumerate(['before','final']):
   im=Image.open(p/'diagnostics'/name/('run-'+str(i)+'.png')).convert('RGBA')
   if facing=='left':im=ImageOps.mirror(im)
   im=im.resize((384,512),Image.Resampling.NEAREST)
   c.paste(im,(j*400+8,32),im);d.text((j*400+8,10),name+' / '+facing+' / key '+str(i+1),fill='#25302a')
  frames.append(c)
 frames[0].save(p/('diagnostics/run-comparison-'+facing+'-2x.gif'),save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=2)
for zoom in [1,2]:
 c=Image.new('RGB',(6*192*zoom,4*(256*zoom+24)),'#e7ebdf');d=ImageDraw.Draw(c)
 for row,name in enumerate(['before','final']):
  for i in range(12):
   x=(i%6)*192*zoom;y=(row*2+i//6)*(256*zoom+24)
   im=Image.open(p/'diagnostics'/name/('run-'+str(i)+'.png')).resize((192*zoom,256*zoom),Image.Resampling.NEAREST)
   c.paste(im,(x,y+24),im);d.text((x+3,y+6),name+' / '+str(i+1),fill='#25302a')
 c.save(p/('diagnostics/run-keyframes-'+str(zoom)+'x.png'))
c=Image.new('RGB',(12*112*3,2*(80*3+24)),'#e7ebdf');d=ImageDraw.Draw(c)
for row,name in enumerate(['before','final']):
 for i in range(12):
  im=Image.open(p/'diagnostics'/name/('run-'+str(i)+'.png')).crop((40,165,152,245)).resize((336,240),Image.Resampling.NEAREST)
  c.paste(im,(i*336,row*264+24),im);d.text((i*336+3,row*264+6),name+' / '+str(i+1),fill='#25302a')
c.save(p/'diagnostics/ankle-connections-3x.png')
`,
    fileURLToPath(output),
  ]);
  for (const name of [
    "diagnostics/run-comparison-right-2x.gif",
    "diagnostics/run-comparison-left-2x.gif",
    "diagnostics/run-keyframes-1x.png",
    "diagnostics/run-keyframes-2x.png",
    "diagnostics/ankle-connections-3x.png",
  ])
    result.outputs[name] = Array.from(await readFile(new URL(name, output)));
  const { outputs, ...metadata } = result;
  await writeFile(
    new URL("registration.json", output),
    JSON.stringify(
      {
        sources: Object.fromEntries(
          Object.entries(sources).map(([name, { data, ...record }]) => [
            name,
            record,
          ]),
        ),
        ...metadata,
        files: Object.fromEntries(
          Object.entries(outputs).map(([name, bytes]) => [
            name,
            digest(new Uint8Array(bytes)),
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
      sourceAxis: metadata.sourceAxis,
      sourceImagesPreserved: metadata.sourceChecks.length,
      nonRunChecks: metadata.nonRunChecks.length,
      upperChecks: metadata.upperChecks.length,
      frames: metadata.frames.length,
      roundtrip: metadata.roundtrip,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
