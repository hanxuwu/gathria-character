/** Offline base-model registration. The browser runtime only consumes these
 * ordinary portable items, identity, skin pixels and project-owned clips. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const output = new URL("artwork/base-character/prepared/", root);
const sourcePath = "artwork/base-character/source/model-sheet.png";
const sourceHash = createHash("sha256")
  .update(await readFile(new URL(sourcePath, root)))
  .digest("hex");
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
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/skin-studio.html`,
  );
  const result = await page.evaluate(
    async ({ sourcePath, sourceHash }) => {
      const { importProject, exportProject, encodeAttachmentPng } =
        await import("/src/skeletal/skin-io.ts");
      const { exportWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { validateWardrobeItem } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const { exportWardrobeIdentity } = await import(
        "/src/skeletal/identity-io.ts"
      );
      const { applyWardrobe } = await import("/src/skeletal/wardrobe.ts");
      const { defaultCustomWardrobeRecipe } = await import(
        "/src/skeletal/identities.ts"
      );
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const { zlibSync } = await import("/node_modules/.vite/deps/fflate.js");
      const W = 192,
        H = 256,
        outputs = {},
        records = [];
      const b64 = (b) => {
        let s = "";
        for (let i = 0; i < b.length; i += 8192)
          s += String.fromCharCode(...b.subarray(i, i + 8192));
        return btoa(s);
      };
      const save = async (path, blob) =>
        (outputs[path] = b64(new Uint8Array(await blob.arrayBuffer())));
      const png = async (path, rgba) =>
        (outputs[path] = b64(await encodeAttachmentPng(rgba)));
      const image = async (path) => {
        const im = await createImageBitmap(
          await (await fetch("/" + path)).blob(),
        );
        const c = document.createElement("canvas");
        c.width = im.width;
        c.height = im.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(im, 0, 0);
        im.close();
        return {
          width: c.width,
          height: c.height,
          data: ctx.getImageData(0, 0, c.width, c.height).data,
        };
      };
      const source = await image(sourcePath);
      const baseline = await importProject(
        await (
          await fetch("/docs/theo-ankle-follow/final/theo-ankle-follow.rig.zip")
        ).blob(),
      );
      const chains = {
        nearArm: [
          [74, 133],
          [66, 155],
          [67, 177],
        ],
        farArm: [
          [121, 133],
          [127, 155],
          [130, 177],
        ],
        nearLeg: [
          [86, 181],
          [82, 205],
          [79, 229],
        ],
        farLeg: [
          [106, 181],
          [109, 205],
          [111, 229],
        ],
      };
      const palette = {
        skin: "#f6bc8d",
        hair: "#75462c",
        upper: "#b9bca6",
        lower: "#46575c",
        shoe: "#e9dfd2",
      };
      const provenance = `Base character study 1. OpenAI image generation, development-time only, source ${sourcePath} SHA256 ${sourceHash}; exact prompt retained beside source. Existing standard-kit shared bald expression heads retained. Offline registration in scripts/prepare-base-character.mjs: authored part bounding boxes, nearest-neighbor sampling, alpha >= 210, largest connected source component, explicit limb landmarks/material ownership. No runtime AI, no new legacy rendering version.`;
      // Source-local component cleanup keeps outlines but removes isolated generation debris.
      function cell(box) {
        const [l, t, r, b] = box,
          w = r - l,
          h = b - t,
          mask = new Uint8Array(w * h);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            mask[y * w + x] =
              source.data[((y + t) * source.width + x + l) * 4 + 3] >= 210
                ? 1
                : 0;
        let best = [];
        const seen = new Uint8Array(mask.length);
        for (let n = 0; n < mask.length; n++) {
          if (!mask[n] || seen[n]) continue;
          const q = [n];
          seen[n] = 1;
          for (let i = 0; i < q.length; i++) {
            const p = q[i],
              x = p % w,
              y = Math.floor(p / w);
            for (const [dx, dy] of [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
            ]) {
              const xx = x + dx,
                yy = y + dy,
                k = yy * w + xx;
              if (
                xx >= 0 &&
                xx < w &&
                yy >= 0 &&
                yy < h &&
                mask[k] &&
                !seen[k]
              ) {
                seen[k] = 1;
                q.push(k);
              }
            }
          }
          if (q.length > best.length) best = q;
        }
        mask.fill(0);
        best.forEach((n) => (mask[n] = 1));
        return (x, y) => {
          x = Math.round(x);
          y = Math.round(y);
          if (x < l || x >= r || y < t || y >= b || !mask[(y - t) * w + x - l])
            return null;
          const p = (y * source.width + x) * 4;
          return [...source.data.subarray(p, p + 3), 255];
        };
      }
      const parts = {};
      function sample(name, box, inverse, material) {
        const at = cell(box),
          raw = new Uint8Array(W * H * 5);
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const p = inverse(x, y);
            if (!p) continue;
            const rgb = at(...p);
            if (rgb)
              raw.set(
                [
                  ...rgb,
                  typeof material === "function" ? material(rgb, p) : material,
                ],
                (y * W + x) * 5,
              );
          }
        records.push({ name, sourceBox: box });
        return (parts[name] = raw);
      }
      const torso = sample(
        "torso",
        [560, 160, 839, 435],
        (x, y) => [(x - 96) / 0.22 + 704, (y - 117) / 0.22 + 188],
        (rgb) => (rgb[0] > rgb[1] * 1.12 ? 1 : 3),
      );
      const hips = sample(
        "shorts-full",
        [105, 570, 417, 802],
        (x, y) => [(x - 96) / 0.16 + 264, (y - 175) / 0.16 + 640],
        (rgb) => (rgb[0] > rgb[1] * 1.18 ? 1 : 4),
      );
      function limb(name, box, from, to, widthScale) {
        records.push({
          limb: name,
          sourceJoints: from,
          targetJoints: to,
          widthScale,
        });
        return sample(
          name,
          box,
          (x, y) => {
            const i = y < to[1][1] ? 0 : 1;
            const t = (y - to[i][1]) / (to[i + 1][1] - to[i][1]);
            const sx = from[i][0] + t * (from[i + 1][0] - from[i][0]),
              sy = from[i][1] + t * (from[i + 1][1] - from[i][1]);
            const cx = to[i][0] + t * (to[i + 1][0] - to[i][0]);
            return [sx + (x - cx) / widthScale, sy];
          },
          1,
        );
      }
      limb(
        "near-arm",
        [1035, 105, 1190, 455],
        [
          [1108, 166],
          [1094, 285],
          [1116, 384],
        ],
        chains.nearArm,
        0.17,
      );
      limb(
        "far-arm",
        [1472, 115, 1620, 452],
        [
          [1536, 171],
          [1550, 282],
          [1570, 380],
        ],
        chains.farArm,
        0.16,
      );
      limb(
        "near-leg",
        [598, 480, 779, 789],
        [
          [700, 514],
          [688, 646],
          [665, 777],
        ],
        chains.nearLeg,
        0.16,
      );
      limb(
        "far-leg",
        [1020, 490, 1190, 790],
        [
          [1113, 526],
          [1105, 651],
          [1085, 778],
        ],
        chains.farLeg,
        0.15,
      );
      const filter = (raw, predicate) => {
        const copy = new Uint8Array(raw);
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++)
            if (!predicate(x, y))
              copy.fill(0, (y * W + x) * 5, (y * W + x + 1) * 5);
        return copy;
      };
      for (const side of ["near", "far"]) {
        const arm = parts[side + "-arm"],
          leg = parts[side + "-leg"];
        parts[side + "-upper-arm"] = filter(arm, (_, y) => y <= 157);
        parts[side + "-forearm"] = filter(arm, (_, y) => y >= 153);
        const thigh = filter(leg, (_, y) => y <= 207);
        for (let y = 175; y < 199; y++)
          for (let x = 0; x < W; x++) {
            if (
              (side === "near" ? x <= 97 : x >= 97) &&
              y >= 175 + ((x - chains[side + "Leg"][0][0]) / 13) ** 2 * 5 &&
              hips[(y * W + x) * 5 + 3]
            )
              thigh.set(
                hips.subarray((y * W + x) * 5, (y * W + x + 1) * 5),
                (y * W + x) * 5,
              );
          }
        parts[side + "-thigh"] = thigh;
        parts[side + "-shin"] = filter(leg, (_, y) => y >= 203);
      }
      parts.hips = filter(hips, (x, y) => y <= 184 - ((x - 96) / 23) ** 2 * 8);
      // Shoes contain no socks/skin; ankle overlap belongs to the bare shin.
      sample(
        "near-shoe",
        [1353, 689, 1538, 803],
        (x, y) => [(x - 79) / 0.15 + 1407, (y - 229) / 0.14 + 716],
        5,
      );
      sample(
        "far-shoe",
        [1564, 681, 1745, 791],
        (x, y) => [(x - 111) / 0.15 + 1610, (y - 229) / 0.14 + 708],
        5,
      );
      for (const side of ["near", "far"]) {
        const slot = side + "-shoe",
          raw = parts[slot];
        let bottom = -1;
        for (let p = 0; p < W * H; p++)
          if (raw[p * 5 + 3]) bottom = Math.floor(p / W);
        const dy = 239 - bottom,
          out = new Uint8Array(raw.length);
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++)
            if (y + dy >= 0 && y + dy < H)
              out.set(
                raw.subarray((y * W + x) * 5, (y * W + x + 1) * 5),
                ((y + dy) * W + x) * 5,
              );
        parts[slot] = out;
        parts[slot + "-run"] = new Uint8Array(out);
        records.push({ shoe: slot, soleCorrection: dy });
      }
      const encode = (slot, raw) => ({
        slot,
        data: b64(zlibSync(raw)),
        palette,
        preserveWarmSkin: true,
        sourceLayerId: "base-character-study-1:" + slot,
      });
      const part = (slot) => encode(slot, parts[slot]);
      const common = {
        format: "gathria-wardrobe-item",
        rigId: baseline.rig.id,
        provenance,
        colorModel: "source-relative-v1",
      };
      const items = [
        validateWardrobeItem({
          ...common,
          version: 3,
          id: "custom-base-vest",
          name: "Base · training vest + bare arms",
          group: "top",
          chains: { nearArm: chains.nearArm, farArm: chains.farArm },
          parts: [
            "torso",
            "near-upper-arm",
            "near-forearm",
            "far-upper-arm",
            "far-forearm",
          ].map(part),
        }),
        validateWardrobeItem({
          ...common,
          version: 3,
          id: "custom-base-shorts",
          name: "Base · shorts + bare legs",
          group: "bottom",
          chains: { nearLeg: chains.nearLeg, farLeg: chains.farLeg },
          parts: [
            "hips",
            "near-thigh",
            "near-shin",
            "far-thigh",
            "far-shin",
          ].map(part),
        }),
        validateWardrobeItem({
          ...common,
          version: 5,
          id: "custom-base-shoes",
          name: "Base · simple shoes",
          group: "shoes",
          ankles: { near: chains.nearLeg[2], far: chains.farLeg[2] },
          runShoes: Object.fromEntries(
            ["near", "far"].map((side) => [
              side + "Leg",
              {
                slot: side + "-shoe-run",
                ankle: chains[side + "Leg"][2],
                sourceShin: chains[side + "Leg"][1],
              },
            ]),
          ),
          parts: ["near-shoe", "far-shoe", "near-shoe-run", "far-shoe-run"].map(
            part,
          ),
        }),
      ];
      const heads = [];
      for (const expression of ["neutral", "gentle", "joyful"]) {
        const base =
            "artwork/standard-kit/prepared/identities/shared-face/" +
            expression,
          rgba = (await image(base + ".png")).data,
          mask = (await image(base + ".mask.png")).data,
          raw = new Uint8Array(W * H * 5);
        for (let p = 0; p < W * H; p++)
          if (rgba[p * 4 + 3])
            raw.set([...rgba.subarray(p * 4, p * 4 + 4), mask[p * 4]], p * 5);
        heads.push({
          ...encode("head-" + expression, raw),
          palette: { skin: palette.skin, hair: palette.hair },
        });
      }
      const identity = {
        format: "gathria-character-identity",
        version: 1,
        rigId: baseline.rig.id,
        id: "custom-base-bald",
        name: "Base · bald shared face",
        provenance,
        frame: { width: 192, height: 256 },
        anchor: [96, 240],
        neck: [96, 118],
        jaw: { center: [111, 78], start: 80, scale: 1, length: 1 },
        hairSway: 0,
        palette: { skin: palette.skin, hair: palette.hair },
        sourceAppearance: {
          ...baseline.skin.metadata.sourceAppearance,
          skinTone: palette.skin,
          hairColor: palette.hair,
        },
        parts: heads,
      };
      let project = applyWardrobe(
        {
          ...structuredClone(baseline),
          wardrobeItems: items,
          wardrobeIdentities: [identity],
        },
        {
          ...defaultCustomWardrobeRecipe(identity),
          top: items[0].id,
          bottom: items[1].id,
          shoes: items[2].id,
          colors: {
            skin: palette.skin,
            hair: palette.hair,
            top: palette.upper,
            bottom: palette.lower,
            shoes: palette.shoe,
          },
        },
      );
      project.skin.metadata.name = "Base character study";

      // Store the actual new anatomy in the inspectable rig as well as its skin binding.
      project.rig.chains = structuredClone(chains);
      for (const [name, joints] of Object.entries(chains)) {
        const a = project.rig.bones.find((b) => b.id === name + ":upper"),
          b = project.rig.bones.find((b) => b.id === name + ":lower");
        a.from = joints[0];
        a.to = joints[1];
        b.from = joints[1];
        b.to = joints[2];
      }
      project.motions.id = "base-character-study-actions-1";
      for (const key of project.motions.clips.run.keys) {
        key.footX *= 0.8;
        key.bodyBob += 6;
      }
      const jump = project.motions.clips.jump;
      [0, 0, 0, -2, -9, -14, -14, -8, 0, 0, 0, 0].forEach(
        (y, i) => (jump.keys[i].rootY = y),
      );
      project.preview = {
        animation: "idle",
        facing: "right",
        expression: "neutral",
      };
      for (const item of items)
        await save(item.id + ".wardrobe.zip", await exportWardrobeItem(item));
      await save(
        "base-bald.identity.zip",
        await exportWardrobeIdentity(identity),
      );
      await save("base-character.rig.zip", await exportProject(project));
      for (const [slot, raw] of Object.entries(parts)) {
        if (
          [
            "shorts-full",
            "near-leg",
            "far-leg",
            "near-arm",
            "far-arm",
          ].includes(slot)
        )
          continue;
        const rgba = new Uint8ClampedArray(W * H * 4),
          mask = new Uint8ClampedArray(W * H * 4);
        for (let p = 0; p < W * H; p++)
          if (raw[p * 5 + 3]) {
            rgba.set(raw.subarray(p * 5, p * 5 + 4), p * 4);
            mask.set([raw[p * 5 + 4], 0, 0, 255], p * 4);
          }
        await png("slots/" + slot + ".png", rgba);
        await png("masks/" + slot + ".png", mask);
      }
      const renderer = prepareRig(project.rig, project.skin, project.motions),
        poses = [];
      for (const [action, clip] of Object.entries(project.motions.clips))
        for (let key = 0; key < clip.keys.length; key++) {
          try {
            const rgba = renderer.frame(action, key, "neutral");
            await png("poses/" + action + "-" + key + ".png", rgba);
            poses.push({
              action,
              key,
              inspection: ((r) => ({
                bodyBones: r.bodyBones,
                shoes: r.shoes,
                limbs: r.limbs.map((l) => ({ id: l.id, bones: l.bones })),
              }))(renderer.inspect(action, key, "neutral")),
            });
          } catch (e) {
            poses.push({ action, key, error: String(e) });
          }
        }
      return {
        outputs,
        registration: {
          sourcePath,
          sourceHash,
          frame: [192, 256],
          anchor: [96, 240],
          neck: [96, 118],
          chains,
          records,
          notes: [
            "Cells contain complete source limbs; upper/lower splits overlap by 5 px and are merged before mesh deformation.",
            "Short hems move on thighs; waist is on pelvis.",
            "Run shoes inherit the shin axis. Other actions retain existing shoe semantics.",
            "Bald expression heads reused exactly; no legacy assets or global motions edited.",
          ],
        },
        poses,
      };
    },
    { sourcePath, sourceHash },
  );
  if (result.poses.some((pose) => pose.error))
    throw Error(JSON.stringify(result.poses.filter((pose) => pose.error)));
  for (const [name, data] of Object.entries(result.outputs)) {
    const path = new URL(name, output);
    await mkdir(new URL("./", path), { recursive: true });
    await writeFile(path, Buffer.from(data, "base64"));
  }
  await writeFile(
    new URL("registration.json", output),
    JSON.stringify(result.registration, null, 2) + "\n",
  );
  await writeFile(
    new URL("pose-inspection.json", output),
    JSON.stringify(result.poses, null, 2) + "\n",
  );
  console.log(
    `Prepared ${Object.keys(result.outputs).length} files; ${result.poses.length} poses.`,
  );
} finally {
  await browser.close();
  await server.close();
}
