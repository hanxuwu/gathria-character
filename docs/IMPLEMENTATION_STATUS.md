# Implementation status

**Wedding harmony V7 implemented; awaiting user visual review.** Current branch: `fix/character-art-cohesion`, continuing verified V6 `c307a8f` and the recovered V5 commits `ef1a378` / `bd731c6`. [Draft PR #2](https://github.com/hanxuwu/gathria-character/pull/2) targets the still-unmerged `feat/character-art-v2`; do not merge or deploy. Earlier MVP/V2/V3/V4 history remains intact.

## Current behavior and implementation

- New studio configurations use explicit `artworkVersion: 7`. The dispatcher supports all seven versions. Saved V1–V6 configs retain their original renderer, presets and pixels; **Create V7 copy** explicitly opts in. Older conversion APIs reject downgrades.
- V7 retains the V5/V6 `neutral | gentle | joyful` and `none | flowers` fields. Waves/crop use new whole-face states; every waves expression has matching rear hair. Bob/crest retain their original open-eye portraits with a visible editor notice.
- New AI-assisted complete bride/groom sheets establish shared neck/collar anatomy, lighting and detail treatment. Selected originals, exact prompts, registration and frozen V6 hashes are in `artwork/harmonized-source/`. A separate hand-free backplate prevents duplicate hands in the gown.
- `prepare-harmonized-assets.py` registers chin, collar, waist and soles, applies one face-weighted 96-color palette per identity, and extracts 29 material-aware layers. Anatomical masks protect ears/neck from hair recoloring and prevent sleeves, fingers and garment colors entering unrelated layers.
- `harmonized-rig.ts` and `generator-v7.ts` add contact/down/passing/up gait phases, opposing arms/legs, independent bride shoes, localized hem lift and joyful idle posture. Old generators and their packed banks are unchanged.
- Geometry remains 192×256 frames, 1536×512 sheets and anchor (96,240). V7 preserves V6's four idle drawings held over twelve steps at 4 fps (3 seconds), plus eight walking drawings at 10 fps (0.8 seconds). Both directions use native-right pixels and metadata mirroring. Manifest remains CharacterPack v1.
- Colors, mixed outfits, saving/reopening, transparent PNG/ZIP export and independent playback remain available. The player's main example is V7, with V6 and older examples retained.

## Current V7 verification

See [ART_HARMONY_V7.md](ART_HARMONY_V7.md) for reproduction commands, source history and limitations. This V7 session passed typecheck/build, **210 unit tests** and **12 Chromium E2E tests**. Tests include frozen legacy bytes, original V1–V6 saved-pixel equality, explicit upgrade/save/reopen, semantic layer ownership, skin/hair separation, connected wedding poses and stable portrait/sole alignment.

The browser exported **24 packs**, checked config round-trips and verified every decoded PNG against generator RGBA. After Studio closed, **24 independent playback cases** covered both characters, three expressions, two animations and both directions. Live pixels were compared with independently cropped/mirrored export frames. The file verifier fully decoded **37 PNGs, four GIFs, 24 ZIPs and the complete browser recording**, checking timelines, CRCs, extracted members, public copies and recorded hashes. Per-file SHA256 values are in [file-validation.json](art-harmonized/file-validation.json).

V6's 200 unit/11 browser results in [ART_POLISH_V6.md](ART_POLISH_V6.md), V5's 193/9 in [ART_COHESION_V5.md](ART_COHESION_V5.md), and [V5_DELIVERY.md](V5_DELIVERY.md) remain historical records. They are not counted as new V7 executions.

## Review artifacts and remaining work

Current outputs: [`docs/art-harmonized/`](art-harmonized/) and [`public/samples/harmonized/`](../public/samples/harmonized/). Earlier outputs and source art are preserved. Review the matched [native comparison](art-harmonized/before-after-1x.png), [2× comparison](art-harmonized/before-after-2x.png), [head/neck](art-harmonized/face-neck-4x.png), [shoulders/hands](art-harmonized/arms-before-after-3x.png), [expressions](art-harmonized/expressions-2x.png), [idle](art-harmonized/idle-right.gif), [right](art-harmonized/walk-right.gif)/[left](art-harmonized/walk-left.gif) walks and [key poses](art-harmonized/walk-keyframes.png). [V7_PROGRESS.md](V7_PROGRESS.md) records staged recovery commits.

This remains a deterministic articulated 2D rig. Shoe alternation and weight transfer are more visible, but gown movement is a warp, not hand-painted frame animation. Neutral/gentle eye differences remain subtle; source hair varies slightly between expression states. Lace retains denser detail than face shading. Very dark skin preserves warm authored mouth colors. Daily clothing and two hairstyles remain older sources. Reference-level finish and user visual acceptance are not claimed.

**Stop for visual review after delivery.** Keep PR #2 draft and unmerged. Gathria integration remains **UNVERIFIED**; this batch uses neutral preview backgrounds. Photo/AI input as product features, expanded bodies and additional actions remain separate milestones. Firefox and Safari are not claimed as tested. The production build retains a large studio-chunk warning because all historical artwork banks remain bundled.
