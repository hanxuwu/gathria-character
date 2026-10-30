// Strict source-native parser/renderer audit. Actual UI exports are separate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "vite";

const root = new URL("../", import.meta.url).pathname;
const view = process.argv.find((arg) => arg.startsWith("--view="))?.split("=")[1];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const output = `${root}/artwork/dual-looks/appearance/runtime`;
await mkdir(output, { recursive: true });
const catalog = JSON.parse(await readFile(`${root}/docs/dual-tailored/assets/catalog.json`, "utf8"));
const server = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });
try {
  const { readPortableCharacterPackArchive } = await server.ssrLoadModule("/src/core/pack.ts");
  const { validateWardrobeRegistration } = await server.ssrLoadModule("/src/wardrobe/contract.ts");
  const { readAppearanceBank } = await server.ssrLoadModule("/src/appearance/bank.ts");
  const { AppearanceRenderer } = await server.ssrLoadModule("/src/appearance/render.ts");
  const { decodeSourceRgbaPng, encodeSourceRgbaPng } = await server.ssrLoadModule("/src/core/baked-source.ts");
  const report = { format: "gathria-dual-looks-native-appearance-audit", version: 1, method: "Existing strict source and appearance parsers, source-native AppearanceRenderer for all poses, three hair colors, natural and gentle face. Opaque pixels outside the existing validated head/hair-occlusion envelope and all pixels outside selected appearance ownership must remain exact. Existing hair-only fringe may extend the head top/sides by at most three native pixels; it never extends below the head. UI export QA is separate.", representations: [] };
  for (const row of catalog.representations.filter((r) => !view || r.view === view)) {
    const key = `${row.character}-${row.view}`;
    const sourceBytes = new Uint8Array(await readFile(root + row.sourceUrl));
    assert.equal(sha(sourceBytes), row.sourceSha256);
    const archive = readPortableCharacterPackArchive(sourceBytes);
    const regBytes = new Uint8Array(await readFile(root + row.registrationUrl));
    assert.equal(sha(regBytes), row.registrationSha256);
    const reg = validateWardrobeRegistration(JSON.parse(new TextDecoder().decode(regBytes)), archive, sha(sourceBytes));
    const bytes = new Uint8Array(await readFile(`${root}/docs/dual-looks/assets/${key}.appearance.zip`));
    const bank = await readAppearanceBank(bytes, reg, sha(regBytes));
    const sourcePages = [archive.png, ...(archive.additionalPngs ?? [])].map((p) => decodeSourceRgbaPng(p));
    const ownershipPages = bank.pages.map((p) => decodeSourceRgbaPng(p.ownership));
    const hairId = bank.manifest.styles.find((s) => s.slot === "hair").id;
    const faceId = bank.manifest.styles.find((s) => s.slot === "face").id;
    const protect = new Map(reg.frames.map((f) => [f.frameId, f.protected]));
    const poses = new Map(bank.manifest.poses.map((p) => [p.frameId, p]));
    const selectors = ["chestnut", "espresso", "copper"].flatMap((hairColor) => [null, faceId].map((faceId) => ({ hairId, faceId, hairColor })));
    const renderers = selectors.map((selection) => new AppearanceRenderer(bank, selection, protect));
    renderers.forEach((r) => r.warmPages());
    const pad = bank.manifest.padding;
    const frames = [];
    const hard = new Set([0, 24, 38, 43, 47, 54, 67, 77, 80, 85, 87, 90, 95, 101, 103, 111]);
    await mkdir(`${output}/${key}`, { recursive: true });
    for (const frame of archive.manifest.frames) {
      const page = sourcePages[frame.page ?? 0];
      const w = frame.width, h = frame.height;
      const pixels = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) pixels.set(page.pixels.subarray(((frame.y+y)*page.width+frame.x)*4, ((frame.y+y)*page.width+frame.x+w)*4), y*w*4);
      const source = { width: w, height: h, pixels, colorChunks: page.colorChunks };
      const pose = poses.get(frame.id), body = pose.hairOcclusionBounds ?? pose.headBounds;
      const finalWidth = w+pad.left+pad.right, finalHeight = h+pad.top+pad.bottom;
      const rows = [];
      for (let choice = 0; choice < selectors.length; choice++) {
        const selection = selectors[choice], result = renderers[choice].render(frame.id, source, source);
        assert.equal(result.width, finalWidth); assert.equal(result.height, finalHeight);
        const owned = new Uint8Array(finalWidth*finalHeight);
        for (const style of bank.manifest.styles.filter((s) => s.id === selection.hairId || s.id === selection.faceId)) {
          for (const layer of style.layers) {
            const f = layer.frames.find((f) => f.frameId === frame.id);
            if (f.mode === "source") continue;
            const own = ownershipPages[f.page];
            for (let y=0; y<f.rect.height; y++) for (let x=0; x<f.rect.width; x++) {
              if (own.pixels[((f.rect.y+y)*own.width+f.rect.x+x)*4+3] === 255) owned[(f.offset.y+y+pad.top)*finalWidth+f.offset.x+x+pad.left] = 1;
            }
          }
        }
        let changed = 0, protectedBody = 0;
        for (let y=0; y<finalHeight; y++) for (let x=0; x<finalWidth; x++) {
          const nativeX=x-pad.left, nativeY=y-pad.top, native=nativeX>=0 && nativeY>=0 && nativeX<w && nativeY<h;
          const a=(nativeY*w+nativeX)*4, b=(y*finalWidth+x)*4;
          let different=false;
          for (let c=0;c<4;c++) different ||= result.pixels[b+c] !== (native ? pixels[a+c] : 0);
          const nonHead = nativeX<body.x || nativeY<body.y || nativeX>=body.x+body.width || nativeY>=body.y+body.height;
          if (native && nonHead && pixels[a+3]===255) { protectedBody++; assert(!different, `${key}/${frame.id}: opaque body changed outside head at ${nativeX},${nativeY}; head=${JSON.stringify(body)} fringe=${JSON.stringify(pose.hairOcclusionBounds)}`); }
          if (different) { changed++; assert(owned[y*finalWidth+x], `${key}/${frame.id}: pixels changed outside declared appearance`); }
        }
        assert(changed > 0);
        rows.push({ ...selection, changedPixels: changed, opaqueNonHeadBodyPixelsExact: protectedBody, outsideAppearanceOwnershipExact: true, rgbaSha256: sha(result.pixels) });
        if (selection.hairColor === "chestnut" && hard.has(frame.id)) await writeFile(`${output}/${key}/${frame.id}-${selection.faceId ? "gentle" : "natural"}.png`, encodeSourceRgbaPng(result));
      }
      frames.push({ frameId: frame.id, sourceFrame: pose.sourceFrame, choices: rows });
    }
    report.representations.push({ character: row.character, view: row.view, sourceSha256: row.sourceSha256, registrationSha256: row.registrationSha256, bankSha256: sha(bytes), padding: pad, frameCount: frames.length, renderCount: frames.length*selectors.length, frames });
    console.log(`${key}: ${frames.length*selectors.length} native appearance renders passed`);
  }
  await writeFile(`${output}/${view ?? "all"}-audit.json`, JSON.stringify(report, null, 2)+"\n");
} finally { await server.close(); }
