// Configure an immutable, already verified collection capture engine without
// modifying historical scripts or checking in another full capture copy.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function runConfiguredCollectionCapture(config) {
  assert(/^scripts\/capture-kling-[a-z-]+\.mjs$/.test(config.engine));
  assert(/^[a-f0-9]{64}$/.test(config.engineSha256));
  const bytes = await readFile(join(root, config.engine));
  assert.equal(
    sha(bytes),
    config.engineSha256,
    "Historical capture engine changed; review its changes before updating the pin.",
  );
  let source = bytes.toString("utf8");
  for (const { from, to, count } of config.replacements) {
    assert(from && Number.isInteger(count) && count > 0);
    assert.equal(
      source.split(from).length - 1,
      count,
      `Unexpected capture configuration occurrence count: ${from}`,
    );
    source = source.replaceAll(from, to);
  }
  const rootDeclaration =
    'const root = fileURLToPath(new URL("../", import.meta.url));';
  assert.equal(source.split(rootDeclaration).length - 1, 1);
  source = source.replace(
    rootDeclaration,
    `const root = ${JSON.stringify(root)};`,
  );
  // The configured module runs from a dedicated temporary directory. Resolve
  // package imports through this repository's ESM package resolution first.
  for (const specifier of ["@playwright/test", "fflate", "gifuct-js", "vite"]) {
    const token = JSON.stringify(specifier);
    const count = source.split(token).length - 1;
    assert(count <= 1, `Unexpected package reference: ${specifier}`);
    if (count)
      source = source.replace(
        token,
        JSON.stringify(import.meta.resolve(specifier)),
      );
  }
  const provenance = {
    engine: config.engine,
    engineSha256: config.engineSha256,
    launcherSha256: sha(await readFile(fileURLToPath(import.meta.url))),
    configurationSha256: sha(JSON.stringify(config)),
  };
  source = `// Configured capture provenance: ${JSON.stringify(provenance)}\n${source}`;
  const temporary = await mkdtemp(
    join(tmpdir(), "gathria-configured-capture-"),
  );
  try {
    const script = join(temporary, "configured-capture.mjs");
    await writeFile(script, source, { flag: "wx" });
    const syntax = spawnSync(process.execPath, ["--check", script], {
      cwd: root,
      stdio: "inherit",
    });
    assert.equal(
      syntax.status,
      0,
      "Configured capture must parse before it runs.",
    );
    const result = spawnSync(
      process.execPath,
      [script, ...process.argv.slice(2)],
      { cwd: root, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    assert.equal(
      result.signal,
      null,
      `Capture interrupted by ${result.signal}`,
    );
    process.exitCode = result.status ?? 1;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
