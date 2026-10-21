# Kling-only cleanup

This batch follows the user's explicit request to remove unrelated characters
and concentrate development on the approved Kling male/female pair. It starts
from merged `158efad`, on `refactor/kling-only-workspace`. Deleted content remains
recoverable from that commit; no Git history was rewritten.

## Retained

Both original characters keep their existing five source-video actions, facing,
comparison, pause/scrub/replay, exact export and independent V3 playback. Earlier
Kling V2 packs and unified source archives remain supported. Source PNGs, crop,
alpha, anchors, timing and exported originals are unchanged.

The original male video was stored inside the earlier mother-study directory.
It is relocated byte-for-byte to `artwork/kling-playback/source/male.mp4` before
that directory is removed. Both source recipes change only this path; source
hashes and frame selection remain exact. Existing prepared metadata retains the
old path as a historical provenance identifier.

The male native skeletal candidate keeps fifteen source parts, four static
poses, joint edits, undo/reset, project save/reopen, PNG and V2 still-pack export.
Its geometry now lives in a neutral module without old character dependencies.
The full four rendered poses are compared against the preserved prepared PNGs.
There is no female skeleton yet, and female playback is never presented as one.

The library now puts **Edit Kling male skeleton** on the male card as a large
button. Three main destinations remain: library, workbench and independent
player. The workbench's **Male skeleton** tab is explicit about its identity.
There are four HTML build entries; `/skin-studio.html` directly opens the native
candidate and existing `study=kling-male` links still work.

## Removed

- Classic Art V1–V7 generators, configurations and editor.
- Denim/Coral and everyday/wedding variants, Theo studies, traveler/roster/kit
  characters and their generated asset banks.
- Old skin, identity, wardrobe, motion/lab authoring and earlier redrawn mother studies.
- Related artwork, samples, obsolete pages, scripts, tests and documentation.
- CharacterPack V1 loader and speculative production-game adapter.

Only reusable code actually needed by Kling is retained: archive/PNG validation,
SHA-256 including ordinary-HTTP fallback, V2/V3 packs, the independent player,
and native limb geometry. ZIP path, CRC, decompression-limit and invalid-import
protection tests are retained or moved into the V2 suite. Removing tests for
deleted products does not remove these current data-integrity checks.

V1 character/config/skin/wardrobe files no longer open in this focused app.
Unsupported imports report an error and preserve the loaded Kling character.
Use commit `158efad` if those old workflows are needed; they are not silently
converted. The external Kling Unified `characterpack-v1` source contract is a
different format and remains supported.

## Verification and evidence

The current integrated run passed TypeScript, production build, **109 unit tests
across eight files and 13 Chromium E2E tests**. Four HTML entries are built.
Actual browser evidence checks two characters × five actions × two directions,
jump landing/replay and byte-identical original exports. Native project editing,
save/reopen and eight independent static-pose displays pass after authoring is
closed. All four native pose outputs remain pixel-identical to the retained
prepared images; source standing differs by zero RGBA pixels.

49 delivered PNGs and three ZIPs decode, with ZIP CRC checks. Protected source,
export and video-relocation hashes are recorded separately from the browser run.
The desktop/mobile screenshots visibly show the male skeleton button and honest
female limitation. No character art change or user visual acceptance is claimed.

[Current screenshots, exports and checks](kling-focus/README.md) ·
[Commands and logs](kling-focus/verification-results.json) ·
[Source preservation](kling-focus/source-preservation.json).

Earlier Kling review folders retain original artwork provenance and historical
records. Their test counts are not this cleanup's results.

## Remaining limits

This cleanup changes scope and navigation, not character art. Existing male
armhole notches, raised-shoulder compression, far upper-arm narrowing and angular
shorts folds remain. Four skeletal poses are not full animation cycles. Outfit
and expression layers and the female skeleton still need development. Native
original atlases retain their existing memory cost. Production Gathria runtime
integration is unverified.
