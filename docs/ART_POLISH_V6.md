# Wedding character polish — Artwork V6

This batch fixes visible layer contamination and relaxes the wedding characters' motion. It continues `fix/character-art-cohesion` from `bd731c6`, including the recovered V5 implementation `ef1a378`. [Draft PR #2](https://github.com/hanxuwu/gathria-character/pull/2) stays unmerged against `feat/character-art-v2`.

## Visible changes

Actual V5 exports showed gown fragments following the bride's hands, hair/collar pixels moving with sleeves, and a piece of the groom's boutonniere assigned to an arm. The generic torso also retained part of the neutral jaw behind the other expressions. These were extraction/ownership defects; the existing source contained sufficient artwork to repair them without generating another illustration.

| Observed problem                                                     | V6 correction                                                                                                                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| White skirt scraps move with bare hands.                             | Anatomical forearm masks retain skin, outlines and enclosed highlights, excluding exterior gown pixels. The existing hand-free skirt remains separate.                                 |
| Hair, neckline and boutonniere shift with sleeves.                   | New sleeve and torso contours separate moving arms from fixed collar/lapel artwork. The far suit shoulder pivot follows its actual sleeve.                                             |
| Jaw/neck cutoff and duplicate neutral-face pixels.                   | Whole head states retain the neck to the collar; torso cuts exclude the neutral jaw. Face-shape deformation still tapers to zero at the neck.                                          |
| Cleaning shoulders exposes missing rear hair or a notch in the coat. | Restore those original pixels to the rear-hair and fixed torso layers respectively. No painted patch or new expression overlay is used.                                                |
| Wide, rigid arm and leg swings and uneven idle pulses.               | Reduce horizontal stride, arm reach and forward wrist lift. Use a four-drawing, three-second breathing loop. Keep opposing limbs, planted sole height and secondary hair/hem movement. |

Neutral, gentle and joyful expressions remain the complete V5 authored heads. Their eyes, brows, cheeks and mouths are selected together; this batch changes their lower cut and connection, not their facial design. Neutral and gentle remain intentionally close in expression. The original soft shading and hair/fabric detail are retained. At integer zoom the groom's shoulder contour now joins the collar without the exposed cutout seen during the first iteration.

## Review the actual exports

All comparison images use matched configurations, frame IDs, scale and background. Only `artworkVersion` changes between V5 and V6. Panels are cropped from browser-exported PNGs, not production source sheets.

- [Native before/after](art-polished/before-after-1x.png), [2× before/after](art-polished/before-after-2x.png)
- [Head, neck and shoulders at 4×](art-polished/face-neck-4x.png)
- [Hands and sleeves at 3×](art-polished/arms-before-after-3x.png), [matched walking stance](art-polished/walk-before-after-1x.png)
- [Three expressions](art-polished/expressions-2x.png), [five upper garments on both heads](art-polished/wardrobe-1x.png), [deep skin and blonde hair](art-polished/recolor-2x.png)
- Idle: [right](art-polished/idle-right.gif), [left](art-polished/idle-left.gif)
- Walking: [right](art-polished/walk-right.gif), [left](art-polished/walk-left.gif), [all eight poses](art-polished/walk-frames.png)
- [Independent-player recording](art-polished/independent-player.webm), [studio](art-polished/studio-desktop.png)
- Self-contained packs: [bride](../public/samples/polished/dress-joyful.character.zip), [groom](../public/samples/polished/suit-joyful.character.zip)
- [All 20 packs and extracted files](art-polished/), [browser evidence](art-polished/evidence-index.json), [per-file decoding and hashes](art-polished/file-validation.json)

Previews use a **neutral background**, not a production Gathria scene. PNGs/ZIPs preserve the actual RGBA colors. GIFs use one quantized palette per loop, integer nearest-neighbor scaling and manifest timing. The idle GIF has five encoded frames (four unique drawings, with the starting pose repeated at the end) lasting 3000 ms; walk has eight frames lasting 800 ms. All four GIFs are written to temporary files, decoded, then atomically replaced to prevent incomplete deliverables.

## Compatibility and source processing

- New studio characters explicitly use `artworkVersion: 6`, generator `gathria-polished-pixels-v6`. V1–V5 configurations keep their saved renderer, presets and output. **Create polished copy** is the explicit opt-in; opening, editing, resetting and saving do not migrate a file.
- V6 keeps V5's configuration fields and expression/accessory choices. CharacterPack remains manifest version 1, with 192×256 frames, 1536×512 sheet, anchor (96,240), four idle and eight walking drawings. Facing left mirrors the native-right export.
- No new image-generation API call or source illustration was made in this batch. [`prepare-polished-assets.py`](../scripts/prepare-polished-assets.py) reuses the committed V5 normalization and original source images, adds anatomical extraction/material masks, and emits a separately namespaced V6 bank. V5's source bank and renderer are frozen by [baseline hashes](../artwork/polished-source-baseline.json); the existing V1–V4 protection remains active.
- Colors remain editable, with protected eye ink and retained warm skin variation. Everything needed for generation ships locally; the independent consumer reads PNGs and metadata without importing a renderer. The player now offers the V6 wedding sample alongside preserved examples.
- See [asset provenance](ASSET_PROVENANCE.md) and [V5 production history](../artwork/cohesive-source/README.md). Each V6 ZIP describes its AI-assisted source origin and this technical revision.

## Verification in this development session

These are new checks for this batch, distinct from the historical V5 implementation/recovery records:

| Check                           | Result                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and production build | Passed; both entrypoints build. Vite still warns about the large studio chunk containing all retained artwork banks.                                                                                                                                                                                           |
| Unit suite                      | 200 tests passed, including seven focused V6 regressions; no skipped tests.                                                                                                                                                                                                                                    |
| Chromium browser suite          | 11 passed, including pixel-exact saved V1–V5 reopening, explicit V6 copy, customization, save/reopen, actual exports and independent playback.                                                                                                                                                                 |
| Browser export evidence         | 20 packs: two V5 baselines, six V6 expression looks, ten upper-garment combinations and two deep-skin/blonde looks. PNG decoding matches generator RGBA exactly; save/reopen regeneration matches.                                                                                                             |
| Independent playback            | Studio closed; all 24 character/expression × idle/walk × left/right cases observed every frame ID. Actual live canvas pixels are compared to independently cropped/mirrored PNG frames above the player's anchor guide. Generator/editor requests are blocked; no external generation calls or browser errors. |
| Per-file integrity              | Every delivered PNG fully decodes; every ZIP passes CRC and matches its extracted members; every GIF frame/timing/loop is checked; the full browser recording decodes. Public ZIP copies and source/renderer hashes match. See the machine-readable file report for sizes and SHA256 values.                   |
| Geometry                        | All 20 sheets have binary alpha, correct frame dimensions and margins, and the ground baseline. V6 outfits retain a neck bridge in every pose. Both primary wedding looks also pass whole-character connectivity and stable portrait checks.                                                                   |
| Visual review                   | Native and integer-scaled output panels, facial states, skin/hair masks, every walk pose, and sampled independent playback were inspected. This is implementation review, not user aesthetic acceptance.                                                                                                       |

Reproduce (Node 24, Python dependencies from `artwork/requirements.txt`):

```sh
python3 scripts/prepare-polished-assets.py
npm run typecheck
npm test
npm run build
npm run test:e2e
node scripts/generate-polished-evidence.mjs
python3 scripts/render-polished-review.py
python3 scripts/verify-polished-evidence.py
```

The evidence command starts/stops its own Vite server on port 5177 and requires Playwright Chromium and FFmpeg. The file verifier also uses `ffmpeg`/`ffprobe`. Here system Chromium was selected with `CHROMIUM_PATH=/usr/bin/chromium`; Playwright's FFmpeg download was denied by the environment, so its local cache entry points to the already installed `/usr/bin/ffmpeg`. No package or TLS verification was disabled. Browser tests used `CHROMIUM_ARGS_JSON='["--no-sandbox","--disable-dev-shm-usage"]'` in this isolated cloud container.

## Remaining visual limits

The work concentrates on **waves/crop wedding characters**. Bob/crest still use their original open-eye face, with a studio notice; everyday clothing remains the earlier illustration bank. The dress is a long gown whose feet are largely hidden, and the source hands retain a skirt-holding curve. Hair and hem motion are restrained deformations rather than individually painted follow-through. The face states are held illustrations, without newly painted blinking/in-between expressions. Limited body shapes and one mirrored three-quarter view remain.

Reference-level finish and user visual approval are **not claimed**. Production Gathria integration remains **unverified**: no new scene assets or runtime contract were supplied. Running, jumping, bouquet/heart gestures, photo/AI input and production integration remain later milestones. Stop this batch for review; keep PR #2 draft and unmerged.
