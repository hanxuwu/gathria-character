// Regenerate the original V1 samples against the local Vite development server.
// V2 samples and review evidence use generate-art-v2-evidence.mjs instead.
// Both scripts use the same browser PNG/ZIP exporter as the UI.
import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
);
try {
  const page = await browser.newPage();
  await page.goto(process.env.SAMPLE_BASE_URL || "http://127.0.0.1:5173");
  const examples = await page.evaluate(async () => {
    const { LEGACY_PRESETS } = await import("/src/core/config.ts");
    const { generateCharacter } = await import("/src/core/generator.ts");
    const { createCharacterPack } = await import("/src/core/pack.ts");
    return Promise.all(
      LEGACY_PRESETS.map(async (preset) => ({
        id: preset.id,
        bytes: Array.from(
          new Uint8Array(
            await (
              await createCharacterPack(
                preset.config,
                generateCharacter(preset.config),
              )
            ).arrayBuffer(),
          ),
        ),
      })),
    );
  });
  for (const example of examples) {
    const dir = new URL(`../public/samples/${example.id}/`, import.meta.url);
    await mkdir(dir, { recursive: true });
    const archive = new Uint8Array(example.bytes);
    await writeFile(
      new URL(`../public/samples/${example.id}.character.zip`, import.meta.url),
      archive,
    );
    for (const [filename, bytes] of Object.entries(unzipSync(archive)))
      await writeFile(new URL(filename, dir), bytes);
    console.log(
      `Exported ${example.id}: ${archive.byteLength} bytes, PNG + metadata + editable configuration + provenance + guide.`,
    );
  }
} finally {
  await browser.close();
}
