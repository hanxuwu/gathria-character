# Implementation status

**Wedding polish V6 implemented; awaiting user visual review.** Current branch: `fix/character-art-cohesion`, continuing the recovered V5 implementation `ef1a378` and delivery repair `bd731c6`. [Draft PR #2](https://github.com/hanxuwu/gathria-character/pull/2) targets the still-unmerged `feat/character-art-v2`; do not merge or deploy. The prior V4 milestone is in draft PR #1, with MVP `4785afa`, V2 `c9505f0`, V3 `bc69f9d` and V4 `5846d59` retained in history.

## Current behavior and implementation

- New studio configurations use explicit `artworkVersion: 6`. `generator.ts` dispatches all six versions. Saved V1–V5 configs retain their original renderer, presets and pixels; **Create polished copy** explicitly opts in. Older conversion APIs reject downgrades.
- V6 retains V5's `neutral | gentle | joyful` and `none | flowers` options. Waves/crop select whole authored face states. Bob/crest retain their open-eye portraits with a visible editor notice.
- `prepare-polished-assets.py` performs technical cuts of the existing V5 sources: anatomical shoulders/arms, bare hands without gown scraps, full neck/head cuts, rear-hair ownership and a fixed coat/collar bridge. No source illustrations were regenerated. `polished-assets.generated.ts` has an independent namespace; source and V5 renderer hashes are frozen in `artwork/polished-source-baseline.json`.
- `polished-rig.ts` and `generator-v6.ts` use restrained opposing limb motion, stable soles, secondary hair/hem movement, and a slower breathing sequence. Old generators and their packed banks remain unchanged.
- Geometry remains 192×256 frames, 1536×512 sheets and anchor (96,240). V6 idle uses four drawings held over twelve steps at 4 fps (3 seconds); walk uses eight drawings at 10 fps (0.8 seconds). Both directions use native-right pixels and metadata mirroring. Manifest remains CharacterPack v1.
- Colors, freely mixed outfits, saving/reopening, transparent PNG/ZIP export and the independent consumer remain available. The player's main example is the V6 wedding pack, with older examples retained.

## Current-session verification

See [ART_POLISH_V6.md](ART_POLISH_V6.md) for the review, reproduction commands, source history and remaining limitations. This session ran typecheck/build, **200 unit tests** and **11 Chromium E2E tests**. Tests include frozen legacy bytes, original V1–V5 saved-pixel equality, explicit upgrade/save/reopen, V6 semantic layer ownership, connected wedding poses and stable portrait alignment.

The browser exported **20 packs** and verified every decoded PNG against generator RGBA. After Studio closed, **24 independent playback cases** covered both characters, three expressions, two animations and both directions; live pixels were checked against cropped/mirrored export frames. Every review PNG, GIF, ZIP and browser recording was decoded; timelines, CRCs, extracted members, public sample copies and recorded hashes were checked. Counts and per-file SHA256 values are in [file-validation.json](art-polished/file-validation.json).

Earlier V5 checks (193 unit/9 E2E) remain historical records in [ART_COHESION_V5.md](ART_COHESION_V5.md); the recovery-only validation is in [V5_DELIVERY.md](V5_DELIVERY.md). They are not presented as new executions.

## Review artifacts and remaining work

Current outputs: [`docs/art-polished/`](art-polished/) and [`public/samples/polished/`](../public/samples/polished/). Earlier outputs and production source art are preserved. Review the matched [native comparison](art-polished/before-after-1x.png), [hands/sleeves](art-polished/arms-before-after-3x.png), [head/neck](art-polished/face-neck-4x.png), [expressions](art-polished/expressions-2x.png), [idle](art-polished/idle-right.gif), and [right](art-polished/walk-right.gif)/[left](art-polished/walk-left.gif) walk loops.

This is still a deterministic articulated 2D rig: long-gown walking largely hides the feet, the hand drawing retains its skirt-holding curve, and hair/cloth movement is restrained warping. Whole expressions are held states, not new blink/in-between drawings. Everyday clothing and two hairstyles remain the earlier source bank. Reference-level finish and user aesthetic approval are not claimed.

**Stop for visual review after delivery.** Keep PR #2 draft and unmerged. Gathria integration remains **UNVERIFIED**; no production scene assets or runtime contract were available in this batch. Photo/AI input, expanded body shapes, running/jumping and bouquet/heart gestures remain separate milestones. Firefox, Safari and fresh cloud-task bootstrap are not claimed as tested. The production build retains a large studio-bundle warning because all preserved artwork versions are bundled.
