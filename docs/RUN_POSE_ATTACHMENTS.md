# Registered running pose attachments

For opt-in shoes that inherit the final shin rotation, see
[Skin V4 / shoe item V5](RUN_SHOE_PARENTING.md). The V3 behavior described below
is retained for historical projects, including its independent shoe pitch.

Skin pack V3 adds optional, explicitly registered running alternatives. It
keeps the original base parts and anatomical skeleton. The new parts supply
artwork for poses that a standing drawing cannot bend into convincingly.

## Ownership and registration

`runLegs` owns a pair of complete trouser/leg textures:

```json
{
  "nearLeg": {
    "slot": "near-leg-bent",
    "joints": [
      [80, 180],
      [102, 195],
      [94, 217]
    ]
  },
  "farLeg": {
    "slot": "far-leg-bent",
    "joints": [
      [100, 180],
      [122, 195],
      [114, 217]
    ]
  }
}
```

These example source landmarks are illustrative. Each image needs its own
measured hip, knee and ankle. The single texture includes thigh and shin cloth,
with hidden allowance beneath the pelvis and cuff; it must exclude footwear,
coat, neighboring limbs and background. Its source joints only register the
texture. They never replace the anatomical chain that determines stature,
bone lengths or the posed joints.

`runShoes` owns a pair of separately registered shoes:

```json
{
  "nearLeg": { "slot": "near-shoe-run", "ankle": [66, 222] },
  "farLeg": { "slot": "far-shoe-run", "ankle": [110, 222] }
}
```

Again these are examples, not universal coordinates. Keep the shoe's neutral
orientation deliberate: the existing clip's `shoePitch` rotates this drawing
around its own source ankle. The renderer places its rotated opaque sole at the
requested ground/lift height, and uses that same posed ankle for the leg.

Both fields are optional; at least one is required for Skin V3. A supplied field
must contain the complete near/far pair and exactly its declared images. V3 can
also retain the existing action-specific forearms. Every image is a registered
192×256 RGBA canvas, with the existing binary-alpha and archive limits.

## Selection and rendering

During run, the leg renderer compares the solved knee's signed turn with the
base and alternate source turns, choosing the closer source. Ties retain the
base. Selection follows geometry, including bend direction; it does not depend
on character names or hardcoded frame numbers. The alternate mesh maps its own
source joints onto the unchanged solved anatomical joints.

Run shoes are used throughout the run, avoiding a shoe-view switch midway
through recovery. Idle, walk and jump use the base leg and shoe images.
Inspect the complete loop and the frames where a leg changes sources: a good
individual drawing can still create a visible transition if its width, folds
or color disagree with the base.

## Portable clothing and compatibility

Wardrobe item V4 extends bottoms with `runLegs` and shoes with `runShoes`.
Their original base parts, chains/ankles and source-relative coloring remain.
The garment ZIP carries the extra PNGs, material masks and registrations.
Bottom items own leg cloth; shoe items own footwear. Replacing one clothing
group removes only that group's alternatives, leaving the other group intact.

Old Skin V1/V2 and item V1–V3 files keep their original behavior. No existing
file is upgraded merely by opening it. New V3 skins can use either existing
motion-library version: the library retains its foot-travel convention, while
an explicitly supplied run shoe uses its registered ankle and opaque support.
The project envelope and baked CharacterPack format remain unchanged. Older
authoring apps reject the new source versions; ordinary independent players
still consume the exported pixels and timing.

This is a small hybrid of skeletal deformation and authored pose parts. It
does not automatically segment arbitrary character images, invent hidden cloth,
or guarantee smooth transitions for unrelated generated assets.
