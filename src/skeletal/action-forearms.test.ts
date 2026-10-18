import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import { bakeProject } from "./bake";
import { prepareRig } from "./renderer";
import { validateActionForearms } from "./action-forearms";
import {
  importSkinPack,
  validateProject,
  validateSkin,
  validateSkinMetadata,
} from "./skin-io";
import {
  ACTION_FOREARM_SLOTS,
  type ActionForearms,
  type ForearmAction,
  type SkinPack,
} from "./types";

const digest = (pixels: Uint8ClampedArray) =>
  createHash("sha256").update(pixels).digest("hex");

function alternateSkin(actions: ForearmAction[] = ["run", "jump"]): SkinPack {
  const skin = createBuiltinSkin("denim-daytrip");
  const pair = {
    "near-forearm": "near-forearm-active",
    "far-forearm": "far-forearm-active",
  } as const;
  const actionForearms: ActionForearms = Object.fromEntries(
    actions.map((action) => [action, { ...pair }]),
  );
  if (skin.metadata.version !== 1)
    throw Error("Expected a legacy base skin fixture.");
  skin.metadata = {
    ...skin.metadata,
    version: 2,
    slots: [...skin.metadata.slots, ...ACTION_FOREARM_SLOTS],
    actionForearms,
  };
  for (const side of ["near", "far"] as const) {
    const pixels = new Uint8ClampedArray(skin.images[`${side}-forearm`]!);
    // Same silhouette and registration, with a visible unmistakable alternate.
    for (let p = 0; p < pixels.length; p += 4)
      if (pixels[p + 3]) pixels.set([190, 44, 203], p);
    skin.images[`${side}-forearm-active`] = pixels;
  }
  return skin;
}

describe("versioned paired action forearms", () => {
  it("preserves v1 metadata and accepts a detached v2 pair for run and jump", () => {
    const old = createBuiltinSkin("denim-daytrip");
    expect(validateSkinMetadata(old.metadata)).toEqual(old.metadata);
    const skin = alternateSkin();
    const validated = validateSkin(skin);
    expect(validated.metadata).toEqual(skin.metadata);
    expect(validated.metadata.actionForearms).not.toBe(
      skin.metadata.actionForearms,
    );
    expect(validated.metadata.actionForearms!.run).not.toBe(
      skin.metadata.actionForearms!.run,
    );
    expect(validated.images["near-forearm-active"]).not.toBe(
      skin.images["near-forearm-active"],
    );
    expect(
      validateSkinMetadata(alternateSkin(["run"]).metadata).actionForearms,
    ).toEqual({ run: skin.metadata.actionForearms!.run });
  });

  it.each([
    undefined,
    {},
    {
      idle: {
        "near-forearm": "near-forearm-active",
        "far-forearm": "far-forearm-active",
      },
    },
    { run: undefined },
    { run: { "near-forearm": "near-forearm-active" } },
    {
      jump: {
        "near-forearm": "far-forearm-active",
        "far-forearm": "near-forearm-active",
      },
    },
    {
      run: {
        "near-forearm": "near-forearm-active",
        "far-forearm": "far-forearm-active",
        head: "head-joyful",
      },
    },
  ])("rejects malformed/unsupported action maps: %j", (value) => {
    expect(() => validateActionForearms(value)).toThrow(/actionForearms/);
  });

  it("rejects silently upgrading v1, incomplete slot pairs, missing art and blank alternatives", () => {
    const skin = alternateSkin();
    expect(() =>
      validateSkinMetadata({ ...skin.metadata, version: 1 }),
    ).toThrow(/unsupported fields/);
    const { actionForearms: _actionForearms, ...withoutMap } = skin.metadata;
    expect(() => validateSkinMetadata({ ...withoutMap, version: 1 })).toThrow(
      /slots|slot/,
    );
    expect(() => validateSkinMetadata(withoutMap)).toThrow(/actionForearms/);
    expect(() =>
      validateSkinMetadata({
        ...skin.metadata,
        slots: skin.metadata.slots.filter((s) => s !== "far-forearm-active"),
      }),
    ).toThrow(/missing active pair/);
    delete skin.images["far-forearm-active"];
    expect(() => validateSkin(skin)).toThrow(/exactly match/);
    skin.images["far-forearm-active"] = new Uint8ClampedArray(192 * 256 * 4);
    expect(() => validateSkin(skin)).toThrow(/empty/);
  });

  it("checks declared active PNG ownership before any browser decoding", async () => {
    const skin = alternateSkin();
    const files: Record<string, Uint8Array> = {
      "skin.json": strToU8(JSON.stringify(skin.metadata)),
      ...Object.fromEntries(
        skin.metadata.slots.map((slot) => [
          `slots/${slot}.png`,
          new Uint8Array([1, 2, 3]),
        ]),
      ),
    };
    delete files["slots/far-forearm-active.png"];
    await expect(importSkinPack(new Blob([zipSync(files)]))).rejects.toThrow(
      /exactly match/,
    );
    files["slots/far-forearm-active.png"] = new Uint8Array([1, 2, 3]);
    await expect(importSkinPack(new Blob([zipSync(files)]))).rejects.toThrow(
      /intact PNG/,
    );
  });

  it("replaces only declared action forearms while retaining every pose and idle/walk pixel", () => {
    const project = createAuthoringProject(createBuiltinSkin("denim-daytrip"));
    const base = prepareRig(project.rig, project.skin, project.motions);
    const skin = alternateSkin();
    const active = prepareRig(project.rig, skin, project.motions);
    const referenceSkin = createBuiltinSkin("denim-daytrip");
    for (const side of ["near", "far"] as const)
      referenceSkin.images[`${side}-forearm`] =
        skin.images[`${side}-forearm-active`];
    const reference = prepareRig(project.rig, referenceSkin, project.motions);
    const expectedBake = bakeProject(project);
    const validated = validateProject({ ...project, skin });
    const actualBake = bakeProject(validated);
    expect(actualBake.manifest).toEqual(expectedBake.manifest);
    for (const animation of ["idle", "walk", "run", "jump"] as const) {
      for (
        let key = 0;
        key < project.motions.clips[animation]!.keys.length;
        key++
      ) {
        const actual = active.frame(animation, key);
        const wanted = (
          animation === "run" || animation === "jump" ? reference : base
        ).frame(animation, key);
        expect(digest(actual)).toBe(digest(wanted));
        expect(
          active.inspect(animation, key).limbs.map((limb) => limb.bones),
        ).toEqual(base.inspect(animation, key).limbs.map((limb) => limb.bones));
        expect(
          actual.every((v, p) => p % 4 !== 3 || v === 0 || v === 255),
        ).toBe(true);
      }
    }
    expect(digest(active.frame("run", 0))).not.toBe(
      digest(base.frame("run", 0)),
    );
    expect(digest(active.frame("jump", 4))).not.toBe(
      digest(base.frame("jump", 4)),
    );
    expect(digest(active.frame("run", 0))).toBe(
      digest(prepareRig(project.rig, skin, project.motions).frame("run", 0)),
    );
  });

  it("uses base arms for an undeclared active action and snapshots source buffers", () => {
    const project = createAuthoringProject(createBuiltinSkin("denim-daytrip"));
    const skin = alternateSkin(["run"]);
    const active = prepareRig(project.rig, skin, project.motions);
    const base = prepareRig(project.rig, project.skin, project.motions);
    const before = digest(active.frame("run", 3));
    skin.images["near-forearm-active"]!.fill(0);
    skin.metadata.actionForearms!.jump = {
      ...skin.metadata.actionForearms!.run!,
    };
    expect(digest(active.frame("run", 3))).toBe(before);
    expect(digest(active.frame("jump", 5))).toBe(digest(base.frame("jump", 5)));
  });

  it("keeps active and base attachment offsets independent across actions and metadata reopen", () => {
    const project = createAuthoringProject(createBuiltinSkin("denim-daytrip"));
    const original = alternateSkin(["run"]);
    const activeOffset = structuredClone(original);
    activeOffset.metadata.bindings.offsets = {
      "near-forearm-active": [3, -2],
      "far-forearm-active": [-2, 1],
    };
    const reopened = validateSkinMetadata(
      JSON.parse(JSON.stringify(activeOffset.metadata)),
    );
    expect(reopened).toEqual(activeOffset.metadata);
    expect(reopened.bindings.offsets["near-forearm-active"]).not.toBe(
      activeOffset.metadata.bindings.offsets["near-forearm-active"],
    );
    const bothOffsets = structuredClone(activeOffset);
    bothOffsets.metadata.bindings.offsets["near-forearm"] = [2, 1];
    bothOffsets.metadata.bindings.offsets["far-forearm"] = [-1, -2];
    const render = (skin: SkinPack) =>
      prepareRig(project.rig, skin, project.motions);
    const base = render(original),
      activeOnly = render({ ...activeOffset, metadata: reopened }),
      independent = render(bothOffsets);
    for (const action of ["idle", "walk", "run", "jump"] as const) {
      let activeChanges = 0,
        baseChanges = 0;
      for (
        let key = 0;
        key < project.motions.clips[action]!.keys.length;
        key++
      ) {
        const before = digest(base.frame(action, key)),
          active = digest(activeOnly.frame(action, key)),
          both = digest(independent.frame(action, key));
        activeChanges += +(before !== active);
        baseChanges += +(active !== both);
      }
      if (action === "run") {
        expect(activeChanges).toBe(project.motions.clips[action]!.keys.length);
        expect(baseChanges).toBe(0);
      } else {
        // Jump was deliberately omitted from the map, so it retains base art.
        expect(activeChanges).toBe(0);
        expect(baseChanges).toBe(project.motions.clips[action]!.keys.length);
      }
    }
  });
});
