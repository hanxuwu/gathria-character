# Theo: shoes follow the trouser ankle

The previous running shoes shared the leg's ankle position but used a separate
motion-key angle. During recovery, the cuff rotated with the solved shin while
the boot stayed comparatively horizontal. At the two most conspicuous near-leg
keys, the rotations differed by roughly 62–85 degrees. The repair makes the
shoe a rigid child of the final shin while retaining its authored rest angle.

This follows `8ed74d3` on `feat/theo-passing-poses`, continuing draft PR #11.
It changes no source pixels, masks, anatomical bindings or motion keys. Head,
neck, upper body, twelve-key/18 FPS run timing and non-running frames remain
unchanged. Earlier studies and exports are retained.

## Implementation and compatibility

- **Registration:** the shoe's own original drawing supplies a second source
  point along its shin. The near/far axes are `(74,197) → (66,222)` and
  `(119,197) → (111,222)`. The independently drawn bent trousers have a different
  source angle, so copying their transform directly would be incorrect.
- **Composition:** shoe rotation equals final shin angle minus its source shin
  angle. The shoe and cloth map to exactly the same solved ankle. Coupled support
  solving keeps fixed bone lengths and uses the actual opaque rasterized sole;
  ankle height and knee position may change to support the rotated shoe.
- **Explicit versions:** Skin V4 and shoe item V5 enable this behavior. Skin
  V1–V3 and older items retain their original results. Idle, walk and jump use
  their original footwear. CharacterPack and independent-player formats are
  unchanged because exported pixels are baked.
- **Editing:** both source-axis handles are editable, saved and undoable.
  Independent run shoe pitch is disabled with an explanation for this footwear;
  its saved value remains available with older shoes. Unsupported run edits are
  rejected before replacing the current project, including invalid later keys.

The [contract](RUN_SHOE_PARENTING.md) gives the bounded solver and format details.
The [source record](../artwork/theo-ankle-follow/README.md) and preparation script
retain provenance and exact input/output hashes. No new image-generation call
or runtime image service is involved.

## Actual exports and verification

[Comparisons, source project and independent CharacterPack](theo-ankle-follow/README.md)
come from Studio controls and downloads. Source registration diagnostics remain
separately labeled in `artwork/theo-ankle-follow/prepared/diagnostics`.

Current command results are recorded in
[`verification-results.json`](theo-ankle-follow/verification-results.json).
The final evidence index records source hashes, browser actions and
closed-editor playback; media and archive reports decode the delivered files.

Executed for this correction (not reused from the preceding attachment study):

- **489 unit tests across 39 files passed**, including seven focused tests for
  paired source axes, actual marker rotation, shared ankle/opaque support,
  fixed leg lengths, unreachable later keys, legacy pixels and mixed wardrobe
  replacements. Future-version assertions now reject the next unsupported
  versions while still rejecting incomplete V4/V5 files.
- **18 relevant Chromium E2E tests passed**, covering Skin Studio, source
  editing, portable clothes/colors, active forearms and both motion versions.
- **TypeScript and production build passed.**
- Preparation preserved all 19 RGBA source arrays, 24 non-run frames and 36
  expression/run upper-region comparisons, and checked 108 frame boundaries.
  Its 31 PNGs, two twelve-frame GIFs and two ZIPs decode; ZIP CRCs pass.
- Actual Studio capture passed four packs / 144 poses, 80 editor comparisons,
  source-axis save/reopen/undo, portable-shoe roundtrip, old/new shoe switching
  and rejection of an unreachable nonfirst motion key without losing work.
  With Studio closed, ten timed independent-player cases verify the final four
  actions in both directions and both baseline run directions. No external
  requests, forbidden generator imports or page errors occurred.
- All final **71 PNGs, sixteen GIFs and seventeen ZIPs** decode. GIF frame order,
  duration and loop semantics, archive CRCs and embedded PNG/JSON content pass.
  All 24 actual shoe transforms share the solved ankle and shin angle within
  floating-point precision, with zero measured opaque-sole support error.

The actual-capture harness initially assumed the historical shoe item was in
the new project's library. That selection timed out because the portable new
project contains its selected items only. The harness now explicitly imports
the retained old shoe ZIP before checking the swap. No application, source art
or assertion was changed to hide that failure; the failed attempt is recorded
in [the first-attempt record](theo-ankle-follow/verification/capture-attempt-1.json).
The complete second capture passed against frozen runtime and prepared inputs.

## Visual assessment and limits

Recovery boots now turn with the calf instead of twisting independently away
from the cuff. Native-size, integer-zoom and all twelve ankle close-ups should
be assessed together with both looping directions. Shared attachment coordinates
and passing tests alone do not establish polished natural motion.

- Pose 9 still has a crowded crossing of the two feet. Their orientations now
  differ more clearly, but this change does not redesign the leg path.
- Existing fast recovery keys become more visible in the rigid boot angle:
  near poses 8→9 change by about 67°, far poses 3→4 by about 60°. The loop boundary
  is smaller (about 4° near / 16° far). Timing was intentionally retained.
- Bent/base trouser source transitions, variable fold width and the rear
  trouser triangle remain separate source/mesh limitations.
- This is rigid parenting, without independent ankle flexion or heel roll.
  It fixes the requested attachment relationship rather than completing every
  aspect of natural running.
- No production Gathria integration or user visual acceptance is claimed.

The implementation is saved in `ce5f239`; this review and final evidence are
delivered in a subsequent commit on the same draft branch, left unmerged.
