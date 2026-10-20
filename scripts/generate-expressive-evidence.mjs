// Run against the Vite development server, then run render-expressive-review.py.
// Uses the same browser generator and PNG/ZIP exporter as the studio. Archived
// V1/V3 samples and docs/art-v2 remain read-only; all new outputs are separate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";

const root = new URL("../", import.meta.url);
const assetBankFile = "src/core/illustrated-assets.generated.ts";
const assetBankSha256 = createHash("sha256")
  .update(await readFile(new URL(assetBankFile, root)))
  .digest("hex");
const review = new URL("docs/art-expressive/", root);
const samples = new URL("public/samples/expressive/", root);
const baseUrl = process.env.SAMPLE_BASE_URL || "http://127.0.0.1:5173";
const ids = ["mira", "rowan", "jun"];
const legacy = await Promise.all(
  ids.map(async (id) => ({
    id,
    config: JSON.parse(
      await readFile(
        new URL(`public/samples/detailed/${id}/character.json`, root),
      ),
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
  await page.goto(new URL("/editor.html", baseUrl).href);
  const exported = await page.evaluate(async (legacyConfigs) => {
    const { PRESETS, OUTFIT_PRESETS, parseCharacterConfig } = await import(
      "/src/core/config.ts"
    );
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
          hairAccessory: outfit.id === "wedding-dress" ? "flowers" : "none",
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
    for (const style of ["dress", "suit"]) {
      const outfit = OUTFIT_PRESETS.find(
        (item) => item.id === `wedding-${style}`,
      );
      if (!outfit) throw new Error(`Missing wedding ${style} outfit.`);
      requests.push({
        id: style,
        label:
          style === "dress" ? "Waves + wedding dress" : "Crop + wedding suit",
        group: "referencePair",
        config: {
          ...mira.config,
          ...outfit.appearance,
          hairAccessory: outfit.id === "wedding-dress" ? "flowers" : "none",
          name:
            style === "dress"
              ? "Wedding look - long waves"
              : "Wedding look - cropped hair",
          hairstyle: style === "dress" ? "waves" : "crop",
          faceVariant: style === "dress" ? mira.config.faceVariant : "oval",
          hairAccessory: style === "dress" ? "flowers" : "none",
          hairColor: "#43312E",
          skinTone: "#E5AE87",
          ...(style === "suit" ? { shoeColor: "#785542" } : {}),
        },
      });
    }
    for (const request of requests.filter(
      (item) => item.group === "referencePair",
    )) {
      requests.push({
        ...request,
        id: `joyful-${request.id}`,
        label: `Happy ${request.id}`,
        group: "expressions",
        config: {
          ...request.config,
          expression: "joyful",
          name: `Happy wedding ${request.id}`,
        },
      });
    }
    for (const before of legacyConfigs) {
      const preset = PRESETS.find((item) => item.id === before.id);
      if (!preset) throw new Error(`Missing expressive preset ${before.id}.`);
      // Preserve every archived V3 appearance input. Only the explicit artwork
      // version changes; frame dimensions are declared by the new renderer.
      requests.push({
        id: before.id,
        label: preset.label,
        group: "matched",
        config: {
          ...before.config,
          schemaVersion: 2,
          artworkVersion: 4,
          faceVariant: before.config.faceVariant,
          expression: "gentle",
          hairAccessory: "none",
        },
      });
    }
    return Promise.all(
      requests.map(async (request) => {
        const config = parseCharacterConfig(request.config);
        if (config.schemaVersion !== 2 || config.artworkVersion !== 4) {
          throw new Error(
            "Expressive evidence requires explicit artworkVersion 4.",
          );
        }
        const generated = generateCharacter(config);
        if (
          generated.width !== 1536 ||
          generated.height !== 512 ||
          generated.manifest.spritesheet.frameWidth !== 192 ||
          generated.manifest.spritesheet.frameHeight !== 256 ||
          generated.manifest.anchor.x !== 96 ||
          generated.manifest.anchor.y !== 240
        )
          throw new Error(
            "Expressive exports must declare the 192×256 frame and 96,240 attachment anchor.",
          );
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

  const accessorySha256 = createHash("sha256")
    .update(
      await readFile(
        new URL("src/core/expressive-accessory.generated.ts", root),
      ),
    )
    .digest("hex");
  const index = {
    accessorySource: {
      file: "src/core/expressive-accessory.generated.ts",
      sha256: accessorySha256,
    },
    source:
      "Actual browser generator + createCharacterPack exports; production illustration banks are inputs, never substituted for these output pixels",
    frame: "idle frame 0, right facing",
    matching:
      "All archived V3 palette, face, hair and outfit inputs retained; only artworkVersion changes explicitly from 3 to 4",
    scene: "Neutral preview — not a Gathria scene",
    artworkSource: {
      file: assetBankFile,
      sha256: assetBankSha256,
      artworkVersion: 4,
      frameDimensions: [192, 256],
      anchor: [96, 240],
    },
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
    referencePair: [],
    expressions: [],
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
    const publicSample = ["lineup", "outfits", "expressions"].includes(
      item.group,
    );
    const relative = publicSample
      ? `public/samples/expressive/${item.id}`
      : item.group === "matched"
        ? `docs/art-expressive/matched/${item.id}`
        : item.group === "referencePair"
          ? `docs/art-expressive/reference-pair/${item.id}`
          : `docs/art-expressive/options/${item.id}`;
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
      spritesheetSha256: createHash("sha256")
        .update(files["spritesheet.png"])
        .digest("hex"),
    };
    if (item.group === "matched") {
      const before = legacy.find((old) => old.id === item.id);
      for (const [field, value] of Object.entries(before.config)) {
        if (field !== "artworkVersion") assert.equal(item.config[field], value);
      }
      entry.before = `public/samples/detailed/${item.id}`;
    } else if (publicSample) entry.archive = `${relative}.character.zip`;
    index[item.group].push(entry);
    console.log(
      `Exported ${item.group}/${item.id}: ${archive.byteLength} bytes.`,
    );
  }

  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await page.getByLabel("Pixel zoom", { exact: true }).selectOption("1");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({
    path: fileURLToPath(new URL("studio-expressive.png", review)),
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
    const recording = { recorder, stream, chunks: [], raf: 0, startedAt: 0 };
    recorder.ondataavailable = (event) => {
      if (event.data.size) recording.chunks.push(event.data);
    };
    function draw() {
      context.fillStyle = "#F7F5EE";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#3F443B";
      context.font = "bold 24px sans-serif";
      context.fillText("Expressive character art · independent player", 30, 42);
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
        "Live browser playback from exported ZIPs · 1× pixel scale · generator/editor requests blocked",
        30,
        568,
      );
      context.fillText("Neutral preview — not a Gathria scene", 30, 592);
      recording.raf = requestAnimationFrame(draw);
    }
    draw();
    recording.startedAt = performance.now();
    recorder.start();
    window.__artReviewRecording = recording;
  });
  index.browserPlayback = [];
  for (const item of [
    ...index.lineup,
    ...index.outfits,
    ...index.referencePair,
    ...index.expressions,
  ]) {
    const input = item.archive
      ? fileURLToPath(new URL(item.archive, root))
      : {
          name: `${item.id}-reference-look.character.zip`,
          mimeType: "application/zip",
          buffer: Buffer.from(
            exported.find(
              (entry) =>
                entry.group === "referencePair" && entry.id === item.id,
            ).bytes,
          ),
        };
    await player.locator("#player-zip").setInputFiles(input);
    await expect(player.getByRole("status")).toContainText("Loaded: ");
    await expect(player.getByRole("status")).toContainText(
      `Loaded: ${item.name}`,
    );
    await player.locator("#player-zoom").selectOption("1");
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
      const recordingStartMs = await player.evaluate(() =>
        Math.round(performance.now() - window.__artReviewRecording.startedAt),
      );
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
      const expectedFrameIds = [...new Set(sequence.frames)].sort(
        (a, b) => a - b,
      );
      const observedFrameIds = [
        ...new Set(
          observed.map((label) => {
            const match = label?.match(/, frame (\d+)$/);
            assert.ok(
              match,
              `${item.id}: missing actual frame ID in consumer label.`,
            );
            return Number(match[1]);
          }),
        ),
      ].sort((a, b) => a - b);
      assert.deepEqual(
        observedFrameIds,
        expectedFrameIds,
        `${item.id}: ${animation}/${facing} did not display every declared frame ID.`,
      );
      index.browserPlayback.push({
        id: item.id,
        animation,
        facing,
        durationMs,
        recordingStartMs,
        recordingEndMs: await player.evaluate(() =>
          Math.round(performance.now() - window.__artReviewRecording.startedAt),
        ),
        observedFrames: observedFrameIds.length,
        observedFrameIds,
        expectedFrameIds,
      });
    }
    if (item.id === "mira-wedding-dress") {
      await player
        .getByRole("button", { name: "Pause animation", exact: true })
        .click();
      await player.locator("#player-zoom").selectOption("1");
      await player.screenshot({
        path: fileURLToPath(new URL("player-expressive.png", review)),
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
    file: "docs/art-expressive/independent-player-motion.webm",
    source:
      "Browser MediaRecorder capture of the actual running independent player canvas, with neutral background and labels",
    width: 960,
    height: 620,
    bytes: recording.length,
  };
  assert.deepEqual(forbidden, []);
  assert.deepEqual(errors, []);
  assert.equal(
    createHash("sha256")
      .update(await readFile(new URL(assetBankFile, root)))
      .digest("hex"),
    assetBankSha256,
    "The illustration bank changed during capture. Regenerate all evidence from the final frozen bank.",
  );
  await writeFile(
    new URL("evidence-index.json", review),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  console.log(
    "All eight public samples and both reference looks independently played; comparison inputs match archived V3. Render images with python3 scripts/render-expressive-review.py.",
  );
} finally {
  await browser.close();
}
