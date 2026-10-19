/** Offline wardrobe registration for the fixed Theo body template.
 * Reuses authored pixels/masks; does not generate art or modify legacy assets.
 * Every output uses the baseline arm/leg chains and the exact original motions.
 */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("artwork/standard-kit/prepared/garments/", root);
const inputPaths = {
  baseline: "docs/theo-ankle-follow/final/theo-ankle-follow.rig.zip",
  teal: "artwork/character-roster/prepared/tops/ravi.wardrobe.zip",
  ochre: "artwork/character-roster/prepared/tops/lina.wardrobe.zip",
  sneakers: "artwork/character-roster/prepared/garments/sageShoes.wardrobe.zip",
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sources = {};
for (const [key, path] of Object.entries(inputPaths)) {
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
  page.on("console", (message) => {
    if (message.type() === "log") console.log(message.text());
  });
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/skin-studio.html`,
  );
  const result = await page.evaluate(
    async ({ sources }) => {
      const { importProject, exportProject, encodeAttachmentPng } =
        await import("/src/skeletal/skin-io.ts");
      const { importWardrobeItem, exportWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { validateWardrobeItem, decodeWardrobeItemPart } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const { applyWardrobe } = await import("/src/skeletal/wardrobe.ts");
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const { zlibSync } = await import("/node_modules/.vite/deps/fflate.js");
      const W = 192,
        H = 256,
        outputs = {},
        records = [];
      const from64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const b64 = (b) => {
        let s = "";
        for (let i = 0; i < b.length; i += 8192)
          s += String.fromCharCode(...b.subarray(i, i + 8192));
        return btoa(s);
      };
      const canonical = (v) =>
        Array.isArray(v)
          ? v.map(canonical)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.keys(v)
                  .sort()
                  .map((k) => [k, canonical(v[k])]),
              )
            : v;
      const same = (a, b) =>
        JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
      const digest = async (b) =>
        Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
      const save = async (name, blob) =>
        (outputs[name] = b64(new Uint8Array(await blob.arrayBuffer())));
      const baseline = await importProject(
        new Blob([from64(sources.baseline.data)]),
      );
      const chains = structuredClone(baseline.skin.metadata.bindings.chains);
      const items = {};
      const matrices = (a, b, c, d) => {
        const ux = b[0] - a[0],
          uy = b[1] - a[1],
          vx = d[0] - c[0],
          vy = d[1] - c[1],
          len = ux * ux + uy * uy;
        const re = (ux * vx + uy * vy) / len,
          im = (ux * vy - uy * vx) / len;
        return [
          re,
          im,
          -im,
          re,
          c[0] - re * a[0] + im * a[1],
          c[1] - im * a[0] - re * a[1],
        ];
      };
      async function remapPart(part, matrix, name) {
        const raw = decodeWardrobeItemPart(part.data),
          out = new Uint8Array(raw.length);
        const [a, b, c, d, tx, ty] = matrix,
          det = a * d - b * c;
        for (let y = 1; y < H - 1; y++)
          for (let x = 1; x < W - 1; x++) {
            const sx = Math.round((d * (x - tx) - c * (y - ty)) / det),
              sy = Math.round((-b * (x - tx) + a * (y - ty)) / det);
            if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
            const j = (sy * W + sx) * 5;
            if (raw[j + 3]) out.set(raw.subarray(j, j + 5), (y * W + x) * 5);
          }
        records.push({
          item: name,
          slot: part.slot,
          method:
            "inverse nearest-neighbor affine sampling; RGBA and material sampled together",
          matrix,
          inputRawSha256: await digest(raw),
          outputRawSha256: await digest(out),
        });
        return {
          ...part,
          data: b64(zlibSync(out)),
          sourceLayerId: `standard-kit-${name}:${part.slot}`,
        };
      }
      for (const name of ["teal", "ochre"]) {
        const original = await importWardrobeItem(
          new Blob([from64(sources[name].data)]),
        );
        const item = structuredClone(original);
        item.id = `custom-kit-${name}-top`;
        item.name =
          name === "teal" ? "Standard teal jacket" : "Standard ochre pullover";
        for (let i = 0; i < item.parts.length; i++) {
          const part = item.parts[i];
          if (part.slot === "torso") {
            // The source neckline and waist already straddle Theo's neck/hips.
            // Keeping torso paint avoids warping collar and pocket design.
            item.parts[i] = await remapPart(part, [1, 0, 0, 1, 0, 0], name);
            continue;
          }
          const side = part.slot.startsWith("near") ? "near" : "far";
          const source = original.chains[side + "Arm"],
            target = chains[side + "Arm"];
          const segment = part.slot.includes("upper") ? 0 : 1;
          item.parts[i] = await remapPart(
            part,
            matrices(
              source[segment],
              source[segment + 1],
              target[segment],
              target[segment + 1],
            ),
            name,
          );
        }
        item.chains = { nearArm: chains.nearArm, farArm: chains.farArm };
        item.provenance = `${original.provenance}\nStandard kit derivative: ${sources[name].path} SHA256 ${sources[name].sha256}. scripts/prepare-standard-kit-garments.mjs registers each arm segment to the immutable Theo baseline shoulder/elbow/wrist with nearest-neighbor sampling. Torso/collar artwork unchanged. Original action forearm ownership/masks retained; no motion edits.`;
        items[name] = validateWardrobeItem(item);
        records.push({
          item: name,
          sourceChains: original.chains,
          targetChains: item.chains,
          torsoPreserved: true,
        });
      }
      for (const [name, group] of [
        ["trousers", "bottom"],
        ["boots", "shoes"],
      ]) {
        const original = baseline.wardrobeItems.find(
          (item) => item.id === baseline.wardrobe[group],
        );
        const item = structuredClone(original);
        item.id = `custom-kit-${name}`;
        item.name =
          name === "trousers"
            ? "Standard Theo trousers"
            : "Standard Theo boots";
        item.provenance += `\nStandard kit: exact source part pixels, masks and registrations from ${sources.baseline.path} SHA256 ${sources.baseline.sha256}. Only item ID/name/provenance changed; fixed Theo body and motions.`;
        items[name] = validateWardrobeItem(item);
        records.push({
          item: name,
          sourceChains: original.chains ?? null,
          targetChains: item.chains ?? null,
          ankles: item.ankles ?? null,
          runRegistration: item.runLegs ?? item.runShoes,
          allPartDataPreserved: item.parts.every(
            (p, i) => p.data === original.parts[i].data,
          ),
        });
      }
      {
        const original = await importWardrobeItem(
          new Blob([from64(sources.sneakers.data)]),
        );
        const item = structuredClone(original);
        item.id = "custom-kit-sneakers";
        item.name = "Standard Sage sneakers";
        item.parts = [];
        item.ankles = {};
        item.runShoes = {};
        for (const side of ["near", "far"]) {
          // Theo's footwear is drawn in a consistent 3/4 right-facing view.
          // Sage's near image is frontal, so both sides use the existing far
          // image's 3/4 painted form; item metadata records this deliberate reuse.
          const sourcePart = original.parts.find((p) => p.slot === "far-shoe");
          const part = { ...sourcePart, slot: side + "-shoe" };
          const raw = decodeWardrobeItemPart(part.data);
          let sole = -1;
          for (let p = 0; p < W * H; p++)
            if (raw[p * 5 + 3]) sole = Math.floor(p / W);
          const source = original.ankles.far,
            sourceKnee = original.runShoes.farLeg.sourceShin;
          const target = chains[side + "Leg"][2],
            targetKnee = chains[side + "Leg"][1];
          // Keep horizontal shoe width and authored toe direction. Fit ankle→sole
          // vertically. Run has its own source mount in the fixed Theo template,
          // matching the already-reviewed boots instead of a shorter Sage leg.
          const vertical = (239 - target[1]) / (sole - source[1]);
          const matrix = [
            1,
            0,
            0,
            vertical,
            target[0] - source[0],
            target[1] - vertical * source[1],
          ];
          const fitted = await remapPart(part, matrix, "sneakers");
          item.parts.push(fitted, {
            ...fitted,
            slot: side + "-shoe-run",
            sourceLayerId: `standard-kit-sneakers:${side}-shoe-run`,
          });
          item.ankles[side] = target;
          const runMount = baseline.skin.metadata.runShoes[side + "Leg"];
          item.runShoes[side + "Leg"] = {
            slot: side + "-shoe-run",
            ankle: target,
            sourceShin: runMount.sourceShin,
          };
          records.push({
            item: "sneakers",
            side,
            sourcePart: sourcePart.slot,
            sourceAnkle: source,
            sourceShin: sourceKnee,
            sourceSole: sole,
            targetAnkle: target,
            targetShin: targetKnee,
            targetRunMount: runMount.sourceShin,
            targetSole: 239,
            vertical,
            horizontalScale: 1,
            sourceViewAdaptation:
              "Both feet reuse the painted 3/4 far shoe. Frontal near shoe unsuitable for this fixed template. Run mount adopts reviewed Theo footwear mount; not an anatomical leg retarget.",
          });
        }
        item.provenance = `${original.provenance}\nStandard kit derivative ${sources.sneakers.path} SHA256 ${sources.sneakers.sha256}. Offline nearest-neighbor registration: both feet reuse Sage's authored 3/4 far-shoe artwork, replacing its incompatible frontal near view. Horizontal width/toe direction preserved; vertical scale maps ankle to fixed y=222 and sole to y=239. Run duplicates registered ordinary pixels and explicitly adopts the reviewed Theo run footwear mount. Body chains and motions unchanged; runtime ordinary fit is identity. Source-view/mount adaptation is recorded in scripts/prepare-standard-kit-garments.mjs.`;
        items.sneakers = validateWardrobeItem(item);
        records.push({
          item: "sneakers",
          sourceChains: original.runShoes,
          targetChains: item.runShoes,
        });
      }
      for (const [name, item] of Object.entries(items)) {
        const blob = await exportWardrobeItem(item),
          imported = await importWardrobeItem(blob);
        if (!same(item, imported))
          throw Error(`Portable item roundtrip changed ${name}`);
        await save(`${name}.wardrobe.zip`, blob);
        const materialCounts = {};
        for (const part of item.parts) {
          const raw = decodeWardrobeItemPart(part.data),
            counts = [0, 0, 0, 0, 0, 0];
          for (let p = 0; p < W * H; p++)
            if (raw[p * 5 + 3]) counts[raw[p * 5 + 4]]++;
          materialCounts[part.slot] = counts;
        }
        records.push({
          item: name,
          id: item.id,
          version: item.version,
          materialCounts,
          portableImportExportEqual: true,
        });
      }
      const preflight = [];
      for (const top of ["teal", "ochre"])
        for (const shoes of ["boots", "sneakers"]) {
          const name = `${top}-${shoes}`;
          const project = applyWardrobe(
            {
              ...structuredClone(baseline),
              wardrobeItems: Object.values(items),
            },
            {
              ...baseline.wardrobe,
              top: items[top].id,
              bottom: items.trousers.id,
              shoes: items[shoes].id,
              colors: {
                ...baseline.wardrobe.colors,
                top: items[top].parts.find((p) => p.slot === "torso").palette
                  .upper,
                bottom: "#514547",
                shoes: "#875638",
              },
            },
          );
          if (
            !same(project.rig, baseline.rig) ||
            !same(project.motions, baseline.motions) ||
            !same(project.skin.metadata.bindings.chains, chains)
          )
            throw Error(`${name}: shared anatomy/motions changed`);
          const renderer = prepareRig(
            project.rig,
            project.skin,
            project.motions,
          );
          const checks = [];
          for (const action of ["idle", "walk", "run", "jump"])
            for (
              let key = 0;
              key < project.motions.clips[action].keys.length;
              key++
            ) {
              const frame = renderer.frame(action, key, "neutral"),
                inspection = renderer.inspect(action, key, "neutral");
              let l = W,
                t = H,
                r = -1,
                b = -1;
              for (let p = 0; p < W * H; p++) {
                if (frame[p * 4 + 3] !== 0 && frame[p * 4 + 3] !== 255)
                  throw Error("Nonbinary alpha");
                if (frame[p * 4 + 3]) {
                  l = Math.min(l, p % W);
                  r = Math.max(r, p % W);
                  t = Math.min(t, Math.floor(p / W));
                  b = Math.max(b, Math.floor(p / W));
                }
              }
              if (l < 1 || t < 1 || r > W - 2 || b > H - 2)
                throw Error(`${name}/${action}/${key}: clipped`);
              checks.push({
                action,
                key,
                bounds: [l, t, r + 1, b + 1],
                ...(action === "run" ? { shoes: inspection.shoes } : {}),
              });
              await save(
                `diagnostics/${name}/${action}-${key}-right.png`,
                new Blob([await encodeAttachmentPng(frame)]),
              );
              const flipped = new Uint8ClampedArray(frame.length);
              for (let y = 0; y < H; y++)
                for (let x = 0; x < W; x++) {
                  const a = (y * W + x) * 4,
                    b = (y * W + W - 1 - x) * 4;
                  flipped.set(frame.subarray(a, a + 4), b);
                }
              await save(
                `diagnostics/${name}/${action}-${key}-left.png`,
                new Blob([await encodeAttachmentPng(flipped)]),
              );
            }
          const blob = await exportProject(project),
            reopened = await importProject(blob);
          if (
            !same(project.motions, reopened.motions) ||
            !same(
              project.skin.metadata.bindings.chains,
              reopened.skin.metadata.bindings.chains,
            )
          )
            throw Error(`${name}: project roundtrip changed`);
          await save(`diagnostics/${name}.rig.zip`, blob);
          preflight.push({
            name,
            frameCount: checks.length,
            directions: ["right", "left"],
            directionMethod:
              "native right renderer; exact horizontal RGBA mirror for left, matching player",
            anatomyAndMotionsUnchanged: true,
            projectRoundtrip: true,
            checks,
          });
          console.log(
            `Standard kit ${name}: ${checks.length} frames × 2 directions`,
          );
        }
      return {
        outputs,
        records,
        preflight,
        sharedChains: chains,
        rigSha256: await digest(
          new TextEncoder().encode(JSON.stringify(canonical(baseline.rig))),
        ),
        motionSha256: await digest(
          new TextEncoder().encode(JSON.stringify(canonical(baseline.motions))),
        ),
      };
    },
    { sources },
  );
  await mkdir(output, { recursive: true });
  for (const [name, b64] of Object.entries(result.outputs)) {
    const target = new URL(name, output);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, Buffer.from(b64, "base64"));
  }
  delete result.outputs;
  await writeFile(
    new URL("registration.json", output),
    JSON.stringify(
      {
        format: "gathria-standard-kit-garment-registration",
        version: 1,
        generatedBy: "scripts/prepare-standard-kit-garments.mjs",
        sources: Object.fromEntries(
          Object.entries(sources).map(([key, { path, sha256 }]) => [
            key,
            { path, sha256 },
          ]),
        ),
        ...result,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Wrote five registered wardrobe items to ${fileURLToPath(output)}`,
  );
} finally {
  await browser.close();
  await server.close();
}
