// Run against the Vite development server, then run render-art-v2-review.py.
// Uses the same browser generator and PNG/ZIP exporter as the studio. V1 samples
// are read-only: their archived pixels remain the before/compatibility baseline.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";

const root = new URL("../", import.meta.url);
const review = new URL("docs/art-v2/", root);
const samples = new URL("public/samples/v2/", root);
const baseUrl = process.env.SAMPLE_BASE_URL || "http://127.0.0.1:5173";
const ids = ["mira", "rowan", "jun"];
const legacy = await Promise.all(
  ids.map(async (id) => ({
    id,
    config: JSON.parse(
      await readFile(new URL(`public/samples/${id}/character.json`, root)),
    ),
  })),
);
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
);

try {
  await mkdir(review, { recursive: true });
  await mkdir(samples, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl);
  const exported = await page.evaluate(async (legacyConfigs) => {
    const {
      ART_V2_PRESETS: PRESETS,
      OUTFIT_PRESETS,
      parseCharacterConfig,
    } = await import("/src/core/config.ts");
    const { generateCharacter } = await import("/src/core/generator.ts");
    const { createCharacterPack, loadCharacterPack } = await import(
      "/src/core/pack.ts"
    );

    const requests = PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      group: "lineup",
      config: preset.config,
    }));
    const mira = PRESETS.find((preset) => preset.id === "mira");
    if (!mira) throw new Error("The representative Mira preset is missing.");
    for (const outfit of OUTFIT_PRESETS) {
      requests.push({
        id: `mira-${outfit.id}`,
        label: outfit.label,
        group: "outfits",
        config: {
          ...mira.config,
          ...outfit.appearance,
          name: `Mira - ${outfit.label}`,
        },
      });
    }
    for (const faceVariant of ["heart", "oval", "round"]) {
      requests.push({
        id: `face-${faceVariant}`,
        label: `${faceVariant[0].toUpperCase()}${faceVariant.slice(1)} face`,
        group: "faces",
        config: {
          ...mira.config,
          name: `Mira - ${faceVariant} face`,
          hairstyle: "crop",
          faceVariant,
        },
      });
    }
    for (const hairstyle of ["crop", "bob", "waves", "mohawk"]) {
      requests.push({
        id: `hair-${hairstyle}`,
        label: `${hairstyle[0].toUpperCase()}${hairstyle.slice(1)}`,
        group: "hairstyles",
        config: {
          ...mira.config,
          name: `Mira - ${hairstyle} hairstyle`,
          hairstyle,
        },
      });
    }
    for (const before of legacyConfigs) {
      const preset = PRESETS.find((item) => item.id === before.id);
      if (!preset) throw new Error(`Missing V2 preset ${before.id}.`);
      // Preserve every original palette/style input. Only the declared artwork
      // version and new face selection differ in the matched comparison.
      requests.push({
        id: before.id,
        label: preset.label,
        group: "matched",
        config: {
          ...before.config,
          schemaVersion: 2,
          artworkVersion: 2,
          faceVariant: preset.config.faceVariant,
        },
      });
    }
    return Promise.all(
      requests.map(async (request) => {
        const config = parseCharacterConfig(request.config);
        if (config.schemaVersion !== 2 || config.artworkVersion !== 2) {
          throw new Error(
            "The archived Art V2 exporter only accepts explicit artworkVersion 2.",
          );
        }
        const generated = generateCharacter(config);
        const repeated = generateCharacter(config);
        if (
          generated.pixels.length !== repeated.pixels.length ||
          generated.pixels.some((value, i) => value !== repeated.pixels[i])
        ) {
          throw new Error(`${request.id}: generation is not deterministic.`);
        }
        const archive = await createCharacterPack(config, generated);
        const loaded = await loadCharacterPack(archive);
        const canvas = document.createElement("canvas");
        canvas.width = loaded.image.naturalWidth;
        canvas.height = loaded.image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("A browser 2D canvas is required.");
        context.drawImage(loaded.image, 0, 0);
        const decoded = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        if (decoded.some((value, i) => value !== generated.pixels[i])) {
          throw new Error(
            `${request.id}: exported PNG differs from generator.`,
          );
        }
        return {
          ...request,
          config,
          bytes: Array.from(new Uint8Array(await archive.arrayBuffer())),
        };
      }),
    );
  }, legacy);

  const index = {
    source: "Actual browser generator + createCharacterPack exports",
    frame: "idle frame 0, right facing",
    matching:
      "V1 sample inputs retained; schema/artwork version and face variant are explicit V2 additions",
    scene: "Neutral preview — not a Gathria scene",
    checks: [
      "Repeated generation produces identical RGBA bytes",
      "Every generated archive validates and decodes in the browser",
      "Decoded exported PNG equals the generated RGBA bytes",
      "Every sample opens and animates in the independent player with generator/editor routes blocked",
    ],
    lineup: [],
    outfits: [],
    matched: [],
    faces: [],
    hairstyles: [],
  };
  for (const item of exported) {
    const archive = new Uint8Array(item.bytes);
    const files = unzipSync(archive);
    assert.deepEqual(Object.keys(files).sort(), [
      "INTEGRATION.md",
      "PROVENANCE.txt",
      "character.json",
      "manifest.json",
      "spritesheet.png",
    ]);
    const publicSample = ["lineup", "outfits"].includes(item.group);
    const relative = publicSample
      ? `public/samples/v2/${item.id}`
      : item.group === "matched"
        ? `docs/art-v2/matched/${item.id}`
        : `docs/art-v2/options/${item.id}`;
    const directory = new URL(`${relative}/`, root);
    await mkdir(directory, { recursive: true });
    for (const [filename, bytes] of Object.entries(files)) {
      await writeFile(new URL(filename, directory), bytes);
    }
    if (publicSample) {
      await writeFile(new URL(`${relative}.character.zip`, root), archive);
    }
    const entry = {
      id: item.id,
      label: item.label,
      name: item.config.name,
      directory: relative,
      faceVariant: item.config.faceVariant,
    };
    if (item.group === "matched") {
      const before = legacy.find((old) => old.id === item.id);
      for (const [field, value] of Object.entries(before.config)) {
        if (field !== "schemaVersion") assert.equal(item.config[field], value);
      }
      entry.before = `public/samples/${item.id}`;
    } else if (publicSample) entry.archive = `${relative}.character.zip`;
    index[item.group].push(entry);
    console.log(
      `Exported ${item.group}/${item.id}: ${archive.byteLength} bytes.`,
    );
  }

  // Keep the legacy review screenshot on explicit Art V2 even after defaults evolve.
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(
      fileURLToPath(new URL("public/samples/v2/mira/character.json", root)),
    );
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await page.getByLabel("Pixel zoom", { exact: true }).selectOption("5");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({
    path: fileURLToPath(new URL("studio-v2.png", review)),
    fullPage: true,
  });

  const player = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  player.on("pageerror", (error) => errors.push(error.message));
  const forbidden = [];
  await player.route(/\/(?:src\/editor\/|src\/core\/generator)/, (route) => {
    forbidden.push(route.request().url());
    return route.abort();
  });
  await player.goto(`${baseUrl}/player.html`);
  await player.evaluate(() => {
    const source = document.querySelector('[data-testid="consumer-canvas"]');
    if (!(source instanceof HTMLCanvasElement))
      throw new Error("Consumer canvas missing.");
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 620;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Recording requires a browser 2D canvas.");
    const stream = canvas.captureStream(20);
    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("This browser cannot record WebM evidence.");
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 1000000,
    });
    const recording = { recorder, stream, chunks: [], raf: 0 };
    recorder.ondataavailable = (event) => {
      if (event.data.size) recording.chunks.push(event.data);
    };
    function draw() {
      context.fillStyle = "#F7F5EE";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#3F443B";
      context.font = "bold 24px sans-serif";
      context.fillText("Character Art V2 · independent player", 30, 42);
      context.font = "16px sans-serif";
      context.fillText(
        source.getAttribute("aria-label") || "Opening exported CharacterPack",
        30,
        74,
      );
      context.imageSmoothingEnabled = false;
      // Copy the actual running consumer canvas at its native canvas pixel size.
      // This recording does not load spritesheets or regenerate any artwork.
      context.drawImage(
        source,
        Math.floor((canvas.width - source.width) / 2),
        115,
      );
      context.fillStyle = "#757A6D";
      context.font = "13px sans-serif";
      context.fillText(
        "Live browser playback from exported ZIPs · 5× pixel scale · generator/editor requests blocked",
        30,
        568,
      );
      context.fillText("Neutral preview — not a Gathria scene", 30, 592);
      recording.raf = requestAnimationFrame(draw);
    }
    draw();
    recorder.start();
    window.__artReviewRecording = recording;
  });
  index.browserPlayback = [];
  for (const item of [...index.lineup, ...index.outfits]) {
    await player
      .locator("#player-zip")
      .setInputFiles(fileURLToPath(new URL(item.archive, root)));
    await expect(player.getByRole("status")).toContainText("Loaded: ");
    await expect(player.getByRole("status")).toContainText(
      `Loaded: ${item.name}`,
    );
    await player.locator("#player-zoom").selectOption("5");
    const canvas = player.getByTestId("consumer-canvas");
    const manifest = JSON.parse(
      await readFile(new URL(`${item.directory}/manifest.json`, root)),
    );
    for (const [animation, facing] of [
      ["idle", "right"],
      ["walk", "right"],
      ["idle", "left"],
      ["walk", "left"],
    ]) {
      await player
        .getByRole("button", {
          name: facing === "right" ? "Right" : "Left",
          exact: true,
        })
        .click();
      await player
        .getByRole("button", {
          name: animation === "idle" ? "Idle" : "Walk",
          exact: true,
        })
        .click();
      await expect(canvas).toHaveAttribute(
        "aria-label",
        new RegExp(`${animation}, facing ${facing}`),
      );
      const sequence = manifest.animations[animation];
      const durationMs =
        (sequence.frames.length / sequence.fps) *
        1000 *
        (animation === "walk" ? 2 : 1);
      const observed = await canvas.evaluate(
        (element, duration) =>
          new Promise((resolve) => {
            const labels = new Set();
            const start = performance.now();
            function sample() {
              labels.add(element.getAttribute("aria-label"));
              if (performance.now() - start >= duration) resolve([...labels]);
              else requestAnimationFrame(sample);
            }
            sample();
          }),
        durationMs + 100,
      );
      assert.ok(
        observed.length > 1,
        `${item.id}: ${animation}/${facing} did not animate.`,
      );
      index.browserPlayback.push({
        id: item.id,
        animation,
        facing,
        durationMs,
        observedFrames: observed.length,
      });
    }
    if (item.id === "mira-wedding-dress") {
      await player
        .getByRole("button", { name: "Pause animation", exact: true })
        .click();
      await player.locator("#player-zoom").selectOption("5");
      await player.screenshot({
        path: fileURLToPath(new URL("player-v2.png", review)),
        fullPage: true,
      });
    }
  }
  const recording = await player.evaluate(async () => {
    const recording = window.__artReviewRecording;
    await new Promise((resolve) => {
      recording.recorder.onstop = resolve;
      recording.recorder.stop();
    });
    cancelAnimationFrame(recording.raf);
    recording.stream.getTracks().forEach((track) => track.stop());
    return Array.from(
      new Uint8Array(
        await new Blob(recording.chunks, {
          type: recording.recorder.mimeType,
        }).arrayBuffer(),
      ),
    );
  });
  assert.ok(
    recording.length < 10 * 1024 * 1024,
    "Keep the review recording below 10 MiB.",
  );
  await writeFile(
    new URL("independent-player-motion.webm", review),
    new Uint8Array(recording),
  );
  index.recording = {
    file: "docs/art-v2/independent-player-motion.webm",
    source:
      "Browser MediaRecorder capture of the actual running independent player canvas, with neutral background and labels",
    width: 960,
    height: 620,
    bytes: recording.length,
  };
  assert.deepEqual(forbidden, []);
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("evidence-index.json", review),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  console.log(
    "All six samples independently played; comparison inputs match V1. Render images with python3 scripts/render-art-v2-review.py.",
  );
} finally {
  await browser.close();
}
