# Maple action forearms

This follow-up continues the generated-character trial on [draft PR #7](https://github.com/hanxuwu/gathria-character/pull/7) from
`2b10770becafe8abda9e28c37c8843f8fb7bb317`. It adds a registered closed-hand pair
for Maple's run and jump, while retaining relaxed hands for idle and walk.
The character's head, neck, body proportions, source joints, skeleton and action
timing remain unchanged. The branch remains unmerged; visual acceptance is not
claimed.

## Source artwork and integration

Two development-time OpenAI image-generation calls produced an arm/hand draft
and a corrected isolated closed-fist pair. The first draft still read as dangling
fingers and was not used. The production source supplies only the new hands:
original sweater sleeve/cuff pixels overlay them at the existing wrist.
The old semantic skin mask determines which relaxed-hand pixels to replace;
there is no global skin-color deletion. Existing fixed cream trim and recolorable
sleeve ownership are preserved, and the new hand pixels belong to skin material.

All 15 original attachments remain intact. Two full-canvas alternate forearms
are added, rather than overwriting the original forearms. This lets the same
skeleton choose the suitable source drawing for each action. New skin and top
item ZIPs retain the source, provenance, registration and recolor masks.
See [source and preparation](../artwork/maple-action-poses/README.md).

## Compatibility contract

- Skin metadata **version 2** requires `near-forearm-active` and
  `far-forearm-active`, plus an explicit paired `actionForearms` map for run,
  jump, or both. Idle/walk cannot be overridden. The alternate pair shares the
  original upper-arm source and elbow/wrist chain; integer offsets remain per
  attachment.
- Portable **top item version 2** owns the five existing top parts and both
  alternate forearms with their material masks. Bottom/shoe formats stay v1.
  Selecting an old top drops the alternate pair and emits a v1 skin; undo
  restores the complete previous project.
- Existing skin/item v1 files keep their previous pixels and serialization.
  No saved project is silently upgraded. The authoring project envelope and
  custom-item recipe remain unchanged; newer nested v2 skins/items require this
  editor revision. Old readers reject the unsupported version.
- Baked CharacterPacks keep their existing format, four action rows and timing.
  The independent player requires no alternate-attachment logic because these
  choices are already baked into the PNG frames.
- The attachment editor shows active slots only for v2 skins and resets a removed
  selection after changing back to a v1 top. Prepared imports declare the map;
  this batch does not add a general attachment-timeline editor.

The wardrobe still supports the two registered identities, Crop and Waves.
Maple remains a portable flat skin/project; opening wardrobe on Maple explicitly
switches to a catalog identity. The new sweater can be reused on both catalog
identities. Registering arbitrary identities as reusable wardrobe entries is
still separate work.

## Knee investigation: retain the current result

Two diagnostic sweeps rendered 540 frames: nine mesh-radius/volume combinations
and six source-knee placements, each across all 36 action keys. Smaller blend
radii concentrate the fold into a pointed corner; larger radii smear or broaden
the trousers. Moving source knees shifts the solved pose and hip contour without
recovering missing fabric folds. None was a clear overall improvement.

Keep radius 6, volume 0.65, near knee (79,198), far knee (110,198). These settings
also affect arms, so changing them to hide one knee crease has wider effects.
A tightly bent knee needs authored fabric coverage or pose-local deformation,
not more global blending. Diagnostic panels and their script are retained in
[knee-diagnostics/](maple-action-poses/knee-diagnostics/). They are labeled direct
renderer experiments, separate from the actual Studio exports below. The
baseline diagnostic frames match all 36 prior exported frames exactly.

## Actual export review

- [Before/after, native size](maple-action-poses/final/before-after-1x.png) ·
  [2×](maple-action-poses/final/before-after-2x.png)
- [Active hand and cuff, 4×](maple-action-poses/final/before-after-active-hands-4x.png) ·
  [Shoulder/wrist/waist, 4×](maple-action-poses/final/before-after-arm-waist-4x.png)
- [Running comparison, right](maple-action-poses/final/before-after-run-right-2x.gif) ·
  [left](maple-action-poses/final/before-after-run-left-2x.gif)
- [Four actions, right](maple-action-poses/final/four-actions-right-2x.gif) ·
  [left](maple-action-poses/final/four-actions-left-2x.gif)
- [Run keys](maple-action-poses/final/run-keyframes-1x.png) ·
  [Jump keys](maple-action-poses/final/jump-keyframes-1x.png)
- [Expressions](maple-action-poses/final/expressions-2x.png) ·
  [Recolored reused clothes](maple-action-poses/final/reused-clothing-2x.png)
- [Editable projects, clothing and independent CharacterPacks](maple-action-poses/README.md)

The review compares matching native frames on the same background and integer zoom;
no generated illustration substitutes for an application export. GIF previews
use the original action timing rounded cumulatively to centiseconds. Jump is
one-shot; the labeled four-action tour deliberately repeats. Playback is in
place, not world movement or production Gathria integration.

## Verification executed in this follow-up

The actual browser workflow produced **18 ZIPs, 61 PNGs and 24 GIFs**; all were
fully decoded. GIF frames, cumulative durations and looping/one-shot flags were
checked against exported PNGs. Both v1 projects re-export all **72 original
frames and both manifests exactly**. All three new Maple expression exports
retain every idle/walk key exactly, along with geometry, timing and anchors.
The original 15 attachments, skeleton and motion definitions match; only the two
active forearms are added.

The capture checks 88 editor playback frames, garment ZIP round trips, project
save/reopen and eight independent action/facing playback cases **after closing
Skin Studio**. The player checks source pixels, order, timing, loop wrapping and
jump hold/replay. Maximum measured scheduling deviation was 31 ms. The two new
focused browser tests also pass: action routing/source preservation and clothing
v2→v1 switching, undo, recoloring, item/project round trips. Captured runtime and
prepared input hashes are checked again at delivery.

Visual inspection of native/2× keyframes and 4× wrists finds a clearer compact
hand silhouette, continuous original cuffs and no new duplicate palm or detached
cloth fragment in these examples. The blue/light-skin and sage/dark-skin reused
outfits preserve fixed cream trim and separate skin/cloth recoloring. This is a
visual finding for the delivered examples, distinct from the functional tests.

The final isolated full suite passed **437 unit tests / 33 files**, and the full
Chromium suite passed **50 E2E tests** without retries. TypeScript and production
build passed. One earlier unit run, concurrent with E2E, hit the existing
20-second limit in the old Denim deterministic-baking test; the unchanged suite
passed when run alone. No assertions or timeouts were weakened. The existing
large generated-art bundle warning remains. Detailed results are recorded in
[verification-results.json](maple-action-poses/verification-results.json).
[Delivery integrity](maple-action-poses/delivery-integrity.json) covers retained
source, prepared imports, review outputs, diagnostic outputs and scripts.

Reproduce the new sources and actual evidence sequentially:

```sh
node scripts/prepare-maple-action-poses.mjs
node scripts/generate-maple-pose-evidence.mjs
python3 scripts/render-maple-pose-review.py
python3 scripts/check-maple-pose-delivery.py
```

Knee diagnostics are separately reproducible with
`node scripts/diagnose-maple-knees.mjs`; temporary frame sweeps are deleted after
comparison panels are written. Preserve the prior `generated-traveler/final`
baseline rather than overwriting it.

## Remaining limits

Closed hands improve the running arm silhouette but remain mesh-transformed
source art, not independently animated fingers. At 4× they read as a simplified,
slightly mitten-like grip, with fixed hand perspective rotating with the forearm.
Deep knee/hip texture compression
remains as described above. The previous torso/sleeve saturation difference,
subtle neutral/gentle expression difference and small hair-edge differences
between full head states are not addressed by this bounded change.
