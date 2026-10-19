/** Build the eight calibrated looks through the unchanged public authoring APIs.
 * Offline source preparation is separate; every project embeds the whole kit.
 */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("artwork/standard-kit/prepared/", root);
const paths = {
  baseline: "docs/theo-ankle-follow/final/theo-ankle-follow.rig.zip",
  ...Object.fromEntries(
    ["short", "sweep"].map((id) => [
      id,
      `artwork/standard-kit/prepared/identities/${id}.identity.zip`,
    ]),
  ),
  ...Object.fromEntries(
    ["teal", "ochre", "trousers", "boots", "sneakers"].map((id) => [
      id,
      `artwork/standard-kit/prepared/garments/${id}.wardrobe.zip`,
    ]),
  ),
};
const inputs = {};
for (const [id, path] of Object.entries(paths)) {
  const bytes = await readFile(new URL(path, root));
  inputs[id] = {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    data: bytes.toString("base64"),
  };
}
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "log") console.log(m.text());
  });
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/skin-studio.html`,
  );
  const result = await page.evaluate(
    async ({ inputs }) => {
      const { importProject, exportProject, encodeAttachmentPng } =
        await import("/src/skeletal/skin-io.ts");
      const { importWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { importWardrobeIdentity } = await import(
        "/src/skeletal/identity-io.ts"
      );
      const { applyWardrobe } = await import("/src/skeletal/wardrobe.ts");
      const { defaultCustomWardrobeRecipe } = await import(
        "/src/skeletal/identities.ts"
      );
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const blob = (id) =>
        new Blob([
          Uint8Array.from(atob(inputs[id].data), (c) => c.charCodeAt(0)),
        ]);
      const b64 = (bytes) => {
        let s = "";
        for (let i = 0; i < bytes.length; i += 8192)
          s += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(s);
      };
      const canon = (v) =>
        Array.isArray(v)
          ? v.map(canon)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.keys(v)
                  .sort()
                  .map((k) => [k, canon(v[k])]),
              )
            : v;
      const equal = (a, b) =>
        JSON.stringify(canon(a)) === JSON.stringify(canon(b));
      const baseline = await importProject(blob("baseline"));
      const identities = {},
        items = {},
        outputs = {},
        projects = [];
      for (const id of ["short", "sweep"])
        identities[id] = await importWardrobeIdentity(blob(id));
      for (const id of ["teal", "ochre", "trousers", "boots", "sneakers"])
        items[id] = await importWardrobeItem(blob(id));
      for (const hair of ["short", "sweep"])
        for (const top of ["teal", "ochre"])
          for (const shoes of ["boots", "sneakers"]) {
            const id = `${hair}-${top}-${shoes}`,
              identity = identities[hair];
            const recipe = {
              ...defaultCustomWardrobeRecipe(identity),
              top: items[top].id,
              bottom: items.trousers.id,
              shoes: items[shoes].id,
              colors: {
                skin: identity.palette.skin,
                hair: identity.palette.hair,
                top: items[top].parts.find((part) => part.slot === "torso")
                  .palette.upper,
                bottom: "#514547",
                shoes: "#875638",
              },
            };
            const project = applyWardrobe(
              {
                ...structuredClone(baseline),
                skin: {
                  ...baseline.skin,
                  metadata: {
                    ...baseline.skin.metadata,
                    name: id.replaceAll("-", " "),
                  },
                },
                wardrobeIdentities: Object.values(identities),
                wardrobeItems: Object.values(items),
              },
              recipe,
            );
            project.preview = {
              ...project.preview,
              expression: "neutral",
              animation: "run",
              facing: "right",
            };
            if (
              !equal(project.rig, baseline.rig) ||
              !equal(project.motions, baseline.motions) ||
              !equal(
                project.skin.metadata.bindings.chains,
                baseline.skin.metadata.bindings.chains,
              )
            )
              throw Error(`${id}: body or motion drift`);
            const renderer = prepareRig(
                project.rig,
                project.skin,
                project.motions,
              ),
              poses = [];
            for (const action of ["idle", "walk", "run", "jump"])
              for (
                let key = 0;
                key < project.motions.clips[action].keys.length;
                key++
              ) {
                const rgba = renderer.frame(action, key, "neutral");
                let count = 0,
                  minX = 192,
                  minY = 256,
                  maxX = -1,
                  maxY = -1;
                for (let p = 0; p < 192 * 256; p++) {
                  const alpha = rgba[p * 4 + 3];
                  if (alpha !== 0 && alpha !== 255)
                    throw Error(`${id}/${action}/${key}: nonbinary alpha`);
                  if (!alpha) continue;
                  count++;
                  minX = Math.min(minX, p % 192);
                  minY = Math.min(minY, Math.floor(p / 192));
                  maxX = Math.max(maxX, p % 192);
                  maxY = Math.max(maxY, Math.floor(p / 192));
                }
                if (!count || minX < 1 || minY < 1 || maxX > 190 || maxY > 254)
                  throw Error(
                    `${id}/${action}/${key}: empty or clipped frame [${minX},${minY},${maxX},${maxY}]`,
                  );
                poses.push({
                  action,
                  key,
                  opaquePixels: count,
                  bounds: [minX, minY, maxX + 1, maxY + 1],
                });
                outputs[`diagnostics/${id}/${action}-${key}.png`] = b64(
                  await encodeAttachmentPng(rgba),
                );
              }
            for (const expression of ["neutral", "gentle", "joyful"])
              outputs[`diagnostics/${id}/expression-${expression}.png`] = b64(
                await encodeAttachmentPng(
                  renderer.frame("idle", 0, expression),
                ),
              );
            const zip = await exportProject(project),
              reopened = await importProject(zip);
            if (
              !equal(project.wardrobe, reopened.wardrobe) ||
              !equal(project.motions, reopened.motions)
            )
              throw Error(`${id}: project roundtrip metadata`);
            for (const [slot, pixels] of Object.entries(project.skin.images))
              if (!pixels.every((v, i) => v === reopened.skin.images[slot][i]))
                throw Error(`${id}: project roundtrip pixels ${slot}`);
            outputs[`projects/${id}.rig.zip`] = b64(
              new Uint8Array(await zip.arrayBuffer()),
            );
            projects.push({
              id,
              hair,
              top,
              shoes,
              recipe,
              poses,
              roundtripExact: true,
              rigUnchanged: true,
              chainsUnchanged: true,
              motionUnchanged: true,
            });
            console.log(
              `Assembled ${id}: all ${poses.length} source poses and exact project roundtrip`,
            );
          }
      return {
        projects,
        outputs,
        sourceRig: baseline.rig,
        sourceChains: baseline.skin.metadata.bindings.chains,
        sourceMotions: baseline.motions,
      };
    },
    { inputs },
  );
  for (const [name, bytes] of Object.entries(result.outputs)) {
    const path = new URL(name, output);
    await mkdir(new URL("./", path), { recursive: true });
    await writeFile(path, Buffer.from(bytes, "base64"));
  }
  delete result.outputs;
  await writeFile(
    new URL("assembly.json", output),
    JSON.stringify(
      {
        format: "gathria-standard-kit-build",
        version: 1,
        generatedAt: new Date().toISOString(),
        inputs: Object.fromEntries(
          Object.entries(inputs).map(([id, { data, ...rest }]) => [id, rest]),
        ),
        ...result,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
