import { expect, test } from "@playwright/test";

test("source-relative items round trip through editable PNG ZIPs and self-contained projects", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/skin-studio.html");
  const result = await page.evaluate(async () => {
    const canonical = (value: unknown) =>
      JSON.stringify(value, (_key, entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? Object.fromEntries(
              Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)),
            )
          : entry,
      );
    const ioPath = "/src/skeletal/skin-io.ts";
    const itemPath = "/src/skeletal/wardrobe-item-io.ts";
    const wardrobePath = "/src/skeletal/wardrobe.ts";
    const bakePath = "/src/skeletal/bake.ts";
    const io = await import(ioPath);
    const items = await import(itemPath);
    const wardrobe = await import(wardrobePath);
    const bake = await import(bakePath);
    const original = await io.importProject(
      await (
        await fetch("/artwork/reference-pair/prepared/theo.rig.zip")
      ).blob(),
    );
    const selected = original.wardrobeItems.filter(
      (item: { group: string; id: string }) =>
        original.wardrobe[item.group] === item.id,
    );
    const sourceItems = selected.map((item: { group: string }) => ({
      ...item,
      version: 3,
      colorModel: "source-relative-v1",
      id: `custom-color-v3-${item.group}`,
    }));
    const choices = Object.fromEntries(
      sourceItems.map((item: { group: string; id: string }) => [
        item.group,
        item.id,
      ]),
    );
    const source = wardrobe.applyWardrobe(
      { ...original, wardrobeItems: sourceItems },
      { ...original.wardrobe, ...choices },
    );
    const equalPixels = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
      a.length === b.length && a.every((value, i) => value === b[i]);
    const itemChecks = [];
    for (const item of sourceItems) {
      const reopened = await items.importWardrobeItem(
        await items.exportWardrobeItem(item),
      );
      itemChecks.push({
        group: item.group,
        equal: canonical(reopened) === canonical(item),
        version: reopened.version,
        model: reopened.colorModel,
      });
    }
    const reopened = await io.importProject(await io.exportProject(source));
    const bakedSource = bake.bakeProject(source),
      bakedReopened = bake.bakeProject(reopened);
    const recolored = wardrobe.applyWardrobe(reopened, {
      ...reopened.wardrobe,
      colors: { ...reopened.wardrobe.colors, top: "#8f5548", skin: "#87593f" },
    });
    const restored = wardrobe.applyWardrobe(recolored, source.wardrobe);
    const plainTop = structuredClone(
      sourceItems.find((item: { group: string }) => item.group === "top"),
    );
    plainTop.id = "custom-color-v3-plain";
    delete plainTop.actionForearms;
    plainTop.parts = plainTop.parts.filter(
      (part: { slot: string }) => !part.slot.endsWith("-active"),
    );
    const mixed = wardrobe.applyWardrobe(
      { ...original, wardrobeItems: [...selected, plainTop] },
      { ...original.wardrobe, top: plainTop.id },
    );
    const reopenedMixed = await io.importProject(await io.exportProject(mixed));
    return {
      itemChecks,
      projectSourcesEqual:
        canonical(reopened.wardrobeItems) === canonical(source.wardrobeItems),
      projectRecipeEqual:
        canonical(reopened.wardrobe) === canonical(source.wardrobe),
      allSlotsEqual: source.skin.metadata.slots.every((slot: string) =>
        equalPixels(source.skin.images[slot], reopened.skin.images[slot]),
      ),
      bakedEqual: equalPixels(bakedSource.pixels, bakedReopened.pixels),
      recolorChangesTorso: !equalPixels(
        source.skin.images.torso,
        recolored.skin.images.torso,
      ),
      restoredEqual: equalPixels(
        bakedSource.pixels,
        bake.bakeProject(restored).pixels,
      ),
      actions: Object.keys(bakedReopened.manifest.animations),
      mixedVersions: reopenedMixed.wardrobeItems
        .map((item: { version: number }) => item.version)
        .sort(),
      plainTopSkinVersion: reopenedMixed.skin.metadata.version,
      plainTopHasActiveMap: Object.hasOwn(
        reopenedMixed.skin.metadata,
        "actionForearms",
      ),
      mixedSourcesEqual:
        canonical(reopenedMixed.wardrobeItems) ===
        canonical(mixed.wardrobeItems),
      mixedBakedEqual: equalPixels(
        bake.bakeProject(mixed).pixels,
        bake.bakeProject(reopenedMixed).pixels,
      ),
    };
  });
  expect(result.itemChecks).toEqual([
    { group: "top", equal: true, version: 3, model: "source-relative-v1" },
    { group: "bottom", equal: true, version: 3, model: "source-relative-v1" },
    { group: "shoes", equal: true, version: 3, model: "source-relative-v1" },
  ]);
  expect(result.projectSourcesEqual).toBe(true);
  expect(result.projectRecipeEqual).toBe(true);
  expect(result.allSlotsEqual).toBe(true);
  expect(result.bakedEqual).toBe(true);
  expect(result.recolorChangesTorso).toBe(true);
  expect(result.restoredEqual).toBe(true);
  expect(result.actions).toEqual(["idle", "walk", "run", "jump"]);
  expect(result.mixedVersions).toEqual([1, 1, 2, 3]);
  expect(result.plainTopSkinVersion).toBe(1);
  expect(result.plainTopHasActiveMap).toBe(false);
  expect(result.mixedSourcesEqual).toBe(true);
  expect(result.mixedBakedEqual).toBe(true);
});

test("previous Theo, Rose, Maple and Willow projects retain every baked pixel", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/skin-studio.html");
  const checks = await page.evaluate(async () => {
    const canonical = (value: unknown) =>
      JSON.stringify(value, (_key, entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? Object.fromEntries(
              Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)),
            )
          : entry,
      );
    const ioPath = "/src/skeletal/skin-io.ts";
    const wardrobePath = "/src/skeletal/wardrobe.ts";
    const bakePath = "/src/skeletal/bake.ts";
    const packPath = "/src/core/pack.ts";
    const io = await import(ioPath),
      wardrobe = await import(wardrobePath),
      bake = await import(bakePath),
      pack = await import(packPath);
    const checks = [];
    for (const [folder, name] of [
      ["reference-pair", "theo-theo"],
      ["reference-pair", "rose-rose"],
      ["portable-identities", "maple-maple"],
      ["portable-identities", "willow-willow"],
    ]) {
      const prefix = `/docs/${folder}/final/${name}`;
      const original = await io.importProject(
        await (await fetch(`${prefix}.rig.zip`)).blob(),
      );
      const assembled = wardrobe.applyWardrobe(original, original.wardrobe);
      const equalPixels = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
        a.length === b.length && a.every((value, i) => value === b[i]);
      const archive = pack.readCharacterPackArchive(
        new Uint8Array(
          await (await fetch(`${prefix}.character.zip`)).arrayBuffer(),
        ),
      );
      const image = await createImageBitmap(
        new Blob([archive.png], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      image.close();
      const golden = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const baked = bake.bakeProject(assembled);
      checks.push({
        name,
        allSlotsEqual: original.skin.metadata.slots.every((slot: string) =>
          equalPixels(original.skin.images[slot], assembled.skin.images[slot]),
        ),
        metadataEqual:
          canonical(original.skin.metadata) ===
          canonical(assembled.skin.metadata),
        sourceVersions: assembled.wardrobeItems.map(
          (item: { version: number }) => item.version,
        ),
        allBakedPixelsEqual: equalPixels(golden, baked.pixels),
        manifestEqual:
          canonical(archive.manifest) === canonical(baked.manifest),
      });
    }
    return checks;
  });
  expect(checks).toHaveLength(4);
  for (const check of checks) {
    expect(check.allSlotsEqual, check.name).toBe(true);
    expect(check.metadataEqual, check.name).toBe(true);
    expect(check.sourceVersions.every((v: number) => v === 1 || v === 2)).toBe(
      true,
    );
    expect(check.allBakedPixelsEqual, check.name).toBe(true);
    expect(check.manifestEqual, check.name).toBe(true);
  }
});
