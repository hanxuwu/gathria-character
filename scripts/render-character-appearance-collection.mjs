// Static catalogue evidence from the current native readers and renderer.
// This does not generate, retouch, rescale or certify character artwork.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "docs/character-collection/appearance");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const local = (path) => resolve(root, path.replace(/^\//, ""));
const json = async (path) => JSON.parse(await readFile(local(path), "utf8"));
const bytes = async (path) => new Uint8Array(await readFile(local(path)));
const clean = (s) => s.replace(/[^a-zA-Z0-9._-]/g, "-");
const colors = ["chestnut", "espresso", "copper"];
const colorNames = { chestnut: "栗棕", espresso: "深咖", copper: "铜棕" };
const styleNames = {
  "soft-crop": "柔软短发", "soft-bob": "轻盈短波波", "side-part": "柔软侧分短发",
  "tucked-bun": "收拢盘发", "airy-tousle": "蓬松碎发", "soft-curls": "柔软卷发",
  "swept-quiff": "上梳蓬松短发", "romantic-waves": "浪漫长卷发", "ribbon-pony": "缎带马尾",
  "braided-crown": "编发花冠", "side-swept-crop": "侧视蓬松短发", "side-tucked-bob": "侧视内扣波波",
  "side-part-matched-v1": "柔软侧分短发 · 侧视配对", "soft-bob-matched-v1": "轻盈短波波 · 侧视配对",
  gentle: "柔和微笑 · 早期版", joyful: "开心表情 · 早期版", "gentle-v2": "柔和微笑 · 修订版",
  "joyful-v2": "开心表情 · 柔和动作版", "gentle-side-v1": "柔和微笑 · 侧视",
};
await mkdir(output, { recursive: true });
const sourceCache = new Map();
const cards = [];
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { readPortableCharacterPackArchive } = await server.ssrLoadModule("/src/core/pack.ts");
  const { decodeSourceRgbaPng, encodeSourceRgbaPng } = await server.ssrLoadModule("/src/core/baked-source.ts");
  const { validateWardrobeRegistration } = await server.ssrLoadModule("/src/wardrobe/contract.ts");
  const { readAppearanceBank } = await server.ssrLoadModule("/src/appearance/bank.ts");
  const { AppearanceRenderer } = await server.ssrLoadModule("/src/appearance/render.ts");
  const { readThemeLook } = await server.ssrLoadModule("/src/themes/bundle.ts");

  function crop(image, rect) {
    assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= image.width && rect.y + rect.height <= image.height);
    const pixels = new Uint8Array(rect.width * rect.height * 4);
    for (let y = 0; y < rect.height; y++) {
      const start = ((rect.y + y) * image.width + rect.x) * 4;
      pixels.set(image.pixels.subarray(start, start + rect.width * 4), y * rect.width * 4);
    }
    return { width: rect.width, height: rect.height, pixels, colorChunks: image.colorChunks };
  }
  function nativeFrame(archive) {
    const frameId = archive.manifest.animations.idle.frames[0];
    const frame = archive.manifest.frames.find((f) => f.id === frameId);
    assert(frame, "Idle frame must exist");
    const page = decodeSourceRgbaPng([archive.png, ...(archive.additionalPngs ?? [])][frame.page ?? 0]);
    return { frameId, image: crop(page, frame), frame };
  }
  async function source(path, expectedHash) {
    const key = path.replace(/^\//, "");
    if (!sourceCache.has(key)) {
      const input = await bytes(key), hash = sha(input);
      const archive = readPortableCharacterPackArchive(input);
      sourceCache.set(key, { archive, hash, ...nativeFrame(archive) });
    }
    const result = sourceCache.get(key);
    if (expectedHash) assert.equal(result.hash, expectedHash, `Source checksum: ${key}`);
    return result;
  }
  async function saveCard(record, image, portraitBounds) {
    assert(!cards.some((c) => c.id === record.id), `Duplicate card: ${record.id}`);
    const imagePath = `${record.id}.png`;
    const png = encodeSourceRgbaPng(image);
    await writeFile(resolve(output, imagePath), png);
    const result = {
      ...record, image: imagePath, nativeWidth: image.width, nativeHeight: image.height,
      pngSha256: sha(png), rgbaSha256: sha(image.pixels),
    };
    if (portraitBounds) {
      const x = Math.max(0, Math.floor(portraitBounds.x)), y = Math.max(0, Math.floor(portraitBounds.y));
      const bounds = { x, y, width: Math.min(image.width - x, Math.ceil(portraitBounds.width)), height: Math.min(image.height - y, Math.ceil(portraitBounds.height)) };
      const portraitPath = `${record.id}.portrait.png`;
      const portrait = encodeSourceRgbaPng(crop(image, bounds));
      await writeFile(resolve(output, portraitPath), portrait);
      Object.assign(result, { portrait: portraitPath, portraitBounds: bounds, portraitPngSha256: sha(portrait) });
    }
    cards.push(result);
  }
  async function appearanceGroup(group) {
    const src = await source(group.sourceUrl, group.sourceSha256);
    const registrationBytes = await bytes(group.registrationUrl), regHash = sha(registrationBytes);
    if (group.registrationSha256) assert.equal(regHash, group.registrationSha256);
    const registration = validateWardrobeRegistration(JSON.parse(new TextDecoder().decode(registrationBytes)), src.archive, src.hash);
    const bankBytes = await bytes(group.bankUrl), bankHash = sha(bankBytes);
    if (group.bankSha256) assert.equal(bankHash, group.bankSha256);
    const bank = await readAppearanceBank(bankBytes, registration, regHash);
    const protectedRegions = new Map(registration.frames.map((f) => [f.frameId, f.protected]));
    const pose = bank.manifest.poses.find((p) => p.frameId === src.frameId);
    assert(pose);
    const bounds = pose.hairBounds;
    const portrait = {
      x: bounds.x + bank.manifest.padding.left - 16,
      y: bounds.y + bank.manifest.padding.top - 16,
      width: bounds.width + 32,
      height: Math.max(bounds.height, pose.headBounds.y + pose.headBounds.height - bounds.y) + 48,
    };
    const common = {
      character: group.character, view: group.view, group: group.id, groupName: group.name,
      status: group.status ?? "current", frameId: src.frameId,
      source: group.sourceUrl.replace(/^\//, ""), sourceSha256: src.hash,
      registration: group.registrationUrl.replace(/^\//, ""), registrationSha256: regHash,
      bank: group.bankUrl.replace(/^\//, ""), bankSha256: bankHash, bankId: bank.manifest.id,
      workbenchUrl: group.workbenchUrl,
      clothing: "原人物基础服装；仅比较外观选项", rendering: "smooth",
    };
    if (group.includeSource) {
      await saveCard({ ...common, id: `${group.id}-source`, kind: "source", name: "原人物 · 光头", selection: null }, src.image);
    }
    const choices = [];
    for (const style of bank.manifest.styles.filter((s) => s.slot === "hair")) {
      for (const hairColor of colors) choices.push({
        id: `${group.id}-${style.id}-${hairColor}`, kind: "hair", name: `${styleNames[style.id] ?? style.name} · ${colorNames[hairColor]}`,
        styleId: style.id, styleName: style.name, colorName: colorNames[hairColor],
        selection: { hairId: style.id, faceId: null, hairColor },
      });
    }
    if (group.includeFaces) {
      const hairId = group.faceHairId ?? bank.manifest.styles.find((s) => s.slot === "hair")?.id ?? null;
      const faces = [null, ...bank.manifest.styles.filter((s) => s.slot === "face")];
      for (const style of faces) choices.push({
        id: `${group.id}-face-${style?.id ?? "natural"}`, kind: "face", name: style ? styleNames[style.id] ?? style.name : "原人物自然表情",
        styleId: style?.id ?? null, styleName: style?.name ?? "Natural (original)",
        styleRevision: style && ["gentle", "joyful"].includes(style.id) ? "earlier-selectable" : "current",
        selection: { hairId, faceId: style?.id ?? null, hairColor: "chestnut" },
      });
    }
    for (const choice of choices) {
      const renderer = new AppearanceRenderer(bank, choice.selection, protectedRegions);
      const rendered = renderer.render(src.frameId, src.image, src.image);
      assert.equal(rendered.width, src.image.width + renderer.padding.left + renderer.padding.right);
      assert.equal(rendered.height, src.image.height + renderer.padding.top + renderer.padding.bottom);
      await saveCard({ ...common, ...choice }, rendered, portrait);
    }
    console.log(`${group.id}: ${choices.length} appearance previews`);
    globalThis.gc?.();
  }

  const wardrobe = await json("docs/kling-wardrobe/catalog.json");
  for (const character of wardrobe.characters) {
    const common = {
      character: character.key, view: "original", sourceUrl: character.sourceUrl,
      registrationUrl: character.registrationUrl, sourceSha256: character.appearanceRevision.sourceSha256,
      registrationSha256: character.appearanceRevision.registrationSha256,
      workbenchUrl: `/workbench.html?character=${character.key}&mode=wardrobe`,
    };
    await appearanceGroup({ ...common, id: `original-${character.key}-base`, name: "原视角 · 基础外观",
      bankUrl: character.appearanceBankUrl, bankSha256: character.appearanceRevision.bankSha256,
      includeSource: true, includeFaces: true, faceHairId: character.key === "male" ? "soft-crop" : "soft-bob" });
    for (const library of character.appearanceLibraries ?? []) {
      const style = library.styles.find((s) => s.slot === "hair");
      await appearanceGroup({ ...common, id: `original-${character.key}-${style.id}`, name: "原视角 · 扩展发型",
        bankUrl: library.url, bankSha256: library.sha256 });
    }
  }
  const inventory = await json("docs/wardrobe-coverage/inventory.json");
  for (const character of ["male", "female"]) {
    const group = inventory.groups.find((g) => g.id === `side-tailored-${character}`);
    await appearanceGroup({ ...group, character, view: "side", id: `side-tailored-${character}`, name: "侧视 · 新款试装发型",
      bankUrl: `docs/kling-side-expansion/assets/${character}.appearance.zip`,
      workbenchUrl: `/workbench.html?character=${character}&mode=side-view&collection=tailored` });
  }
  const paired = await json("docs/paired-polish/assets/appearance-catalog.json");
  for (const group of paired.representations) {
    await appearanceGroup({ ...group, id: `paired-${group.character}-${group.view}`, name: "双视角 · 配对发型", bankUrl: group.url,
      includeFaces: true, faceHairId: group.hairId, workbenchUrl: `/workbench.html?character=${group.character}&mode=paired` });
  }
  const landing = inventory.groups.find((g) => g.id === "side-landing-candidate-male");
  await appearanceGroup({ ...landing, id: "landing-candidate-male", name: "男版落地候选 · 外观", character: "male", view: "side", status: "experimental",
    bankUrl: "docs/kling-landing-production/assets/male.appearance.zip", includeFaces: true,
    workbenchUrl: "/workbench.html?character=male&mode=side-view&collection=landing-candidate" });

  const themes = await json("artwork/kling-themes/catalog-index.json");
  for (const theme of themes) {
    for (const reference of theme.manifest.looks) {
      const asset = theme.lookAssets.find((a) => a.logicalId === reference.logicalId);
      assert(asset, "Theme must have a separately published look asset");
      const look = await readThemeLook(await bytes(asset.file), theme.manifest, reference);
      const native = nativeFrame(look.archive);
      await saveCard({
        id: `theme-${clean(theme.key)}-${reference.logicalId}`, kind: "theme", name: `${theme.isOriginal ? "Kling 原画" : "像素童话"} · ${reference.logicalId === "wedding" ? "婚礼" : "基础造型"} · R${theme.manifest.revision}`,
        character: theme.character, view: "original", group: theme.key, groupName: theme.name,
        status: theme.current ? "current" : "earlier-selectable", frameId: native.frameId,
        source: asset.file, sourceSha256: reference.sha256, themeKey: theme.key, logicalLook: reference.logicalId,
        rendering: theme.manifest.rendering, nativeAnchor: look.archive.manifest.anchor,
        workbenchUrl: `/workbench.html?character=${theme.character}&mode=themes`,
        note: "完整烘焙主题造型；基础与婚礼各自有动作，不能把主题衣服当作独立衣物混搭。原画主题婚礼保留发布时的嵌入素材。",
      }, native.image);
      console.log(`${theme.key}/${reference.logicalId}: theme preview`);
      globalThis.gc?.();
    }
  }
  const report = {
    format: "gathria-current-appearance-and-theme-collection", version: 1,
    workingCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    mainCommit: execFileSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" }).trim(),
    method: "Current source-bound appearance banks are hash-checked, fully parsed by readAppearanceBank and rendered through the native AppearanceRenderer. Theme look archives use readThemeLook and their first native Idle drawing. Full PNGs keep native dimensions/padding. Portrait PNGs are exact crops with recorded bounds; no resizing, repainting or generation.",
    counts: {
      cards: cards.length,
      byKind: Object.fromEntries([...new Set(cards.map((c) => c.kind))].map((kind) => [kind, cards.filter((c) => c.kind === kind).length])),
      originalHairChoicesByCharacter: Object.fromEntries(["male", "female"].map((character) => [character, new Set(cards.filter((c) => c.kind === "hair" && c.character === character && c.group.startsWith("original-")).map((c) => c.styleId)).size])),
      hairColors: colors,
    },
    scope: "Every currently advertised original-view hairstyle in three selectable colors; base original-view facial presets; current tailored side, current matched paired and male landing-candidate appearance banks; all current/earlier selectable theme look records. Repeated expressions in hairstyle-specific banks are not expanded into every hair-expression combination. Legacy embedded user projects and unreferenced source studies are excluded.",
    limits: [
      "Static Idle previews show catalogue choices, not full-motion visual approval.",
      "Hair variants that share logical names across views are separate source-bound banks.",
      "The experimental male landing candidate remains separately labeled.",
      "Pixel storybook is authored full-look artwork; algorithmic pixel finishes are settings applied to any finished wardrobe look, not additional fixed catalog designs.",
    ],
    script: relative(root, fileURLToPath(import.meta.url)), scriptSha256: sha(await readFile(fileURLToPath(import.meta.url))), cards,
  };
  await writeFile(resolve(output, "manifest.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.counts));
} finally {
  await server.close();
}
