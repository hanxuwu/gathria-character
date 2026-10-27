// Offline reproduction helper, separate from production UI evidence.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const out = path.resolve(
  process.env.PIXEL_STUDY_DIR ?? "/tmp/kling-strong-pixels/study-reproduction",
);
const sourceDir = path.resolve(
  process.env.PIXEL_STUDY_SOURCE_DIR ?? "/tmp/kling-pixel-refinement/final-v1",
);
const selection = JSON.parse(
  await fs.readFile(path.join(here, "selection.json"), "utf8"),
);
await fs.mkdir(out, { recursive: true });
await build({
  stdin: {
    contents: `export {buildPixelCandidate} from './src/pixel/pack.ts';\nexport {themeActionGif,themeFramePng} from './src/themes/media.ts';`,
    resolveDir: root,
    sourcefile: "pixel-study-entry.ts",
    loader: "ts",
  },
  outfile: path.join(out, "api.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const { buildPixelCandidate, themeActionGif, themeFramePng } = await import(
  pathToFileURL(path.join(out, "api.mjs")).href
);
const summary = [];
for (const source of selection.inputs) {
  const sourcePath = path.join(sourceDir, source.filename);
  const input = new Uint8Array(await fs.readFile(sourcePath));
  const actual = createHash("sha256").update(input).digest("hex");
  if (actual !== source.sha256)
    throw Error(`Source hash mismatch: ${sourcePath}`);
  for (const variant of selection.variants.filter(
    (v) => v.look === source.look,
  )) {
    const started = Date.now();
    const result = await buildPixelCandidate(input, variant.settings);
    if (result.report.outputSha256 !== variant.candidate.sha256)
      throw Error(
        `Candidate differs from retained probe: ${variant.look}/${variant.label}. Check versioned algorithm and provenance changes; do not relabel changed output as this study.`,
      );
    const key = `${variant.look}-${variant.label}`;
    await fs.writeFile(path.join(out, key + ".character.zip"), result.bytes);
    await fs.writeFile(
      path.join(out, key + ".report.json"),
      JSON.stringify(result.report, null, 2),
    );
    await fs.writeFile(
      path.join(out, key + "-run.gif"),
      await themeActionGif(result.archive, "run", "right"),
    );
    for (const action of ["idle", "run", "jump"]) {
      const clip = result.archive.manifest.animations[action];
      for (const position of [0, Math.floor(clip.frames.length / 2)])
        await fs.writeFile(
          path.join(out, `${key}-${action}-${position}.png`),
          await themeFramePng(result.archive, clip.frames[position], "right"),
        );
    }
    summary.push({
      look: variant.look,
      sourcePath,
      label: variant.label,
      settings: variant.settings,
      ms: Date.now() - started,
      sha256: result.report.outputSha256,
      cleanup: result.report.cleanup,
    });
    console.log(
      `${key}: matches retained candidate ${result.report.outputSha256}`,
    );
  }
}
await fs.writeFile(
  path.join(out, "summary.json"),
  JSON.stringify(summary, null, 2),
);
