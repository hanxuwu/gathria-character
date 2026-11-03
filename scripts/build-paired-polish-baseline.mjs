// Recreate previously reviewed, real UI downloads from exact embedded bytes.
// This avoids checking another 220 MiB of duplicated source assets into Git.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { strToU8, zipSync } from "fflate";

export async function rebuildReviewedPair(character, output) {
  const recipe = JSON.parse(
    await readFile("docs/paired-polish/baseline-projects.json", "utf8"),
  );
  const entry = recipe.projects.find((p) => p.character === character);
  assert(entry, "Unknown reviewed character");
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  try {
    const existing = await readFile(output);
    if (sha(existing) === entry.sha256)
      return {
        character,
        output,
        bytes: existing.length,
        sha256: entry.sha256,
      };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const options = { level: 6, mtime: new Date(2020, 0, 1, 0, 0, 0) };
  const outer = {};
  for (const view of ["original", "side"]) {
    const r = entry.views[view],
      inner = { "document.json": strToU8(r.document) };
    for (const [name, path] of Object.entries(r.files)) {
      const bytes = await readFile(path);
      inner[name] = name.endsWith(".zip") ? [bytes, { level: 0 }] : bytes;
    }
    const bytes = zipSync(inner, options);
    assert.equal(
      sha(bytes),
      r.sha256,
      `${view}: historical archive bytes changed`,
    );
    outer[`${view}.wardrobe.zip`] = [bytes, { level: 0 }];
  }
  outer["manifest.json"] = strToU8(entry.manifest);
  const bytes = zipSync(outer, options);
  assert.equal(sha(bytes), entry.sha256, "Historical paired download changed");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  return { character, output, bytes: bytes.length, sha256: entry.sha256 };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  assert(
    process.argv[2] && process.argv[3],
    "Usage: node scripts/build-paired-polish-baseline.mjs male OUTPUT.zip",
  );
  console.log(
    JSON.stringify(
      await rebuildReviewedPair(process.argv[2], resolve(process.argv[3])),
    ),
  );
}
