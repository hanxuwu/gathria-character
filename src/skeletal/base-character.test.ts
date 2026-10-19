import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assembleWardrobe } from "./wardrobe";
import { prepareRig } from "./renderer";
import { bakeProject } from "./bake";
import { validateProject } from "./skin-io";
import type { AuthoringProject } from "./types";

function base(): AuthoringProject {
  const files = unzipSync(
    readFileSync(
      new URL(
        "../../artwork/base-character/prepared/base-character.rig.zip",
        import.meta.url,
      ),
    ),
  );
  const json = (name: string) =>
    JSON.parse(new TextDecoder().decode(files[name]));
  const envelope = json("project.json");
  const wardrobeItems = json("wardrobe.json").items;
  const wardrobeIdentities = json("identities.json").identities;
  // Reconstruct from portable semantic sources; no built-in character fallback.
  return validateProject({
    ...envelope,
    wardrobeItems,
    wardrobeIdentities,
    skin: assembleWardrobe(
      envelope.wardrobe,
      json("skin.json").name,
      wardrobeItems,
      wardrobeIdentities,
    ),
  });
}

describe("base character study", () => {
  it("embeds editable anatomy, clothing and all four clips in its own project", () => {
    const p = base();
    expect(p.wardrobeItems).toHaveLength(3);
    expect(p.wardrobeIdentities).toHaveLength(1);
    expect(p.rig.chains).toEqual(p.skin.metadata.bindings.chains);
    expect(p.rig.anchor).toEqual([96, 240]);
    expect(Object.keys(p.motions.clips).sort()).toEqual([
      "idle",
      "jump",
      "run",
      "walk",
    ]);
    expect(p.motions.clips.jump!.loop).toBe(false);
  });

  it("keeps every pose and expression nonempty, transparent and within the frame", () => {
    const p = base(),
      r = prepareRig(p.rig, p.skin, p.motions);
    for (const expression of ["neutral", "gentle", "joyful"] as const)
      for (const action of ["idle", "walk", "run", "jump"] as const)
        for (let k = 0; k < p.motions.clips[action]!.keys.length; k++) {
          const rgba = r.frame(action, k, expression);
          let count = 0;
          for (let i = 0; i < rgba.length; i += 4) {
            const alpha = rgba[i + 3];
            if (alpha !== 0 && alpha !== 255)
              throw Error(`${action}/${k}: filtered alpha`);
            if (alpha) {
              count++;
              const x = (i / 4) % 192,
                y = Math.floor(i / 4 / 192);
              if (x < 1 || x > 190 || y < 1 || y > 254)
                throw Error(`${action}/${k}: clipped at ${x},${y}`);
            } else if (rgba[i] || rgba[i + 1] || rgba[i + 2])
              throw Error("Dirty transparent RGB");
          }
          expect(count).toBeGreaterThan(5000);
        }
  });

  it("keeps run leg lengths, shared ankles and shoe axes stable at all twelve keys", () => {
    const p = base(),
      r = prepareRig(p.rig, p.skin, p.motions);
    const distance = (a: readonly number[], b: readonly number[]) =>
      Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 0; k < 12; k++) {
      const pose = r.inspect("run", k, "neutral");
      for (const shoe of pose.shoes!) {
        const leg = pose.limbs.find((l) => l.id === shoe.chain)!;
        const rest = p.skin.metadata.bindings.chains[shoe.chain];
        expect(distance([...rest[0]], [...rest[1]])).toBeCloseTo(
          distance(leg.bones[0], leg.bones[1]),
          7,
        );
        expect(distance([...rest[1]], [...rest[2]])).toBeCloseTo(
          distance(leg.bones[1], leg.bones[2]),
          7,
        );
        expect(shoe.ankle).toEqual(leg.bones[2]);
        expect(Math.abs(shoe.supportError)).toBeLessThanOrEqual(1);
        const angle = Math.atan2(
          leg.bones[2][1] - leg.bones[1][1],
          leg.bones[2][0] - leg.bones[1][0],
        );
        const sourceAngle = Math.atan2(
          shoe.sourceAnkle[1] - shoe.sourceShin[1],
          shoe.sourceAnkle[0] - shoe.sourceShin[0],
        );
        expect(Math.sin(shoe.rotation + sourceAngle - angle)).toBeCloseTo(0, 8);
      }
    }
  });

  it("lands the one-shot jump on its exact ready pose and bakes deterministically", () => {
    const p = base(),
      r = prepareRig(p.rig, p.skin, p.motions);
    expect(Buffer.from(r.frame("jump", 11, "neutral"))).toEqual(
      Buffer.from(r.frame("jump", 0, "neutral")),
    );
    const first = bakeProject(p),
      second = bakeProject(p);
    expect(
      Buffer.compare(Buffer.from(first.pixels), Buffer.from(second.pixels)),
    ).toBe(0);
    expect(first.manifest.frames).toHaveLength(36);
    expect(first.manifest.facing.left).toBe("mirror-x");
    expect(first.manifest.animations.jump!.loop).toBe(false);
  });
});
