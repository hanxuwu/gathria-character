# Complete male outfits and female dress outline V3

This candidate adds a teal short-sleeve camp shirt with full-length ochre chinos
and a navy wedding jacket with full-length suit trousers. The male top and
bottom slots remain independent. The female dresses retain their V2 silhouettes
while reducing the stretched dark outline at the skirt sides.

The approved Kling faces, body proportions and source-drawn actions remain the
visual baseline. These clothes are complete source-pose banks prepared offline;
the browser composes them locally. Generated reference anatomy is never used.
This is a review candidate, not user visual acceptance or a claim that every
cloth fold is natural.

## Open the candidate

From the library choose **Dress Kling male** or **Dress Kling female**, then
**Everyday** or **Wedding**. Direct URLs on the running application:

- `/workbench.html?character=male&mode=wardrobe`
- `/workbench.html?character=female&mode=wardrobe`

There are 9 male and 7 female items. Original resets to the untouched source;
Everyday separates and Formal separates retain the earlier sleeveless/shorts
combinations. Clothing selections, action and direction save in an editable
wardrobe project. A baked CharacterPack contains standalone playback pixels.

## What changed in the artwork

- A development-time OpenAI image-generation result supplies the new painted
  male clothing. Only manually delimited cloth RGB is used; the generated skin,
  head, limbs, shoes and backdrop are discarded. The exact prompt and original
  output are preserved in [source provenance](../../../artwork/kling-wardrobe/source/full-outfits-v1/README.md).
- Source-visible arm and leg ownership is prepared per pose. Connected visible
  surfaces resolve crossing limbs; local authoring axes guide sleeves and
  trouser folds without transforming the source body or its registered points.
- Short sleeves stop on the upper arm even when a folded forearm returns behind
  the cutoff plane. Long sleeves preserve the original visible hands. Collar,
  buttons, vest, tie and rose details use clothing-local sampling, with plain
  fabric completion at donor boundaries rather than stretching skin/background
  or a floral edge into the sleeve/torso.
- Trousers use continuous thigh/knee/shin material coordinates, source occlusion,
  a small cloth allowance into transparent space, and shoe separation. Fitting
  the complete hip surface removes repeated pocket-edge bars; interior fabric
  sampling keeps donor shoe/outline fragments out of the cuffs.
- Female V3 preserves the outer ink strip instead of stretching it with skirt
  clearance. All 192 prepared V3 poses retain V2 layout, alpha and ownership;
  changes are limited to fabric RGB. Waist placement and source motion stay fixed.

## Versioning and compatibility

The new male catalog uses `male-full-outfits-v1` registration and template.
Reviewed hand-protection boundaries correct old polygons that included thigh or
shoulder cloth areas and missed some fist edges. The original 704×1056 canvas,
anchor `(352,998)`, all 17 guide points, source pack, head protection and action
metadata remain unchanged. Garment-local axis adjustments are separate
preparation data, not a replacement runtime skeleton.

The five older male items have **separate rebound archive copies** for mixing
under the new registration. Those copies trim only clothing ownership at
newly protected hand-outline pixels, restoring source fingers; all other
decoded clothing pixels stay unchanged. Their original files remain frozen. Existing saved
projects embed their exact old registration and garments and reopen without
silent upgrading. An old project rejects a differently registered new garment;
start a new catalog project for the complete outfits. Female V3 uses new item
IDs and the existing female registration; V1/V2 archives remain available.

No runtime schema or CharacterPack format changes are required. Both bodies
retain all five source actions, exact frame order/FPS/holds, one-shot jump,
mirrored left-facing playback and motion-flow action changes. This preserves
source motion; it does not add interpolation or cloth physics.

## Actual export review

The browser capture exports all four outfits through the production UI, saves
and reopens editable projects, checks mixed tops/bottoms/shoes, and then closes
the workbench before loading baked packs in the independent player. Review
PNGs/GIFs are decoded from those downloaded packs, not from preparation previews.

Current-batch commands already executed on this tree:

- `npm run typecheck` and production build passed.
- `npm test`: **155 tests passed**.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`: **36 tests passed**.
- Python dress fitting regressions: **4 tests passed**.

The runtime suites ran before the final clothing-only edge correction; no
runtime code changed in this batch. Final-asset, export and production-browser
checks below bind their results to the actual delivered asset hashes.

The first production capture was deliberately stopped after an independent
semantic check found two near-hand edge pixels in male frame64 included in
both top masks. Polygon-only protection had passed. The final top preparation
also excludes semantic head/hands/neck/shoes, restoring those source pixels;
all other garment pixels are preserved. The first capture and its partial
exports remain under `browser/attempt-1/` and `exports/attempt-1/`; they are not
the final delivery. Small disconnected source matte flecks under 20 native pixels are
preserved source-exact instead of enlarged into trouser fragments; the audit
records their locations and alpha and rejects uncovered connected cloth areas.

The second capture exposed a separate semantic ownership problem in the male
trousers: isolated dark sole pixels had been classified as leg surface, then
expanded by the small cloth allowance. Native frame51 showed three coloured
islands below the leading shoe; frame64 showed a similar shoe-edge fragment.
That capture is preserved under `browser/attempt-2/` and `exports/attempt-2/`.
The trousers-only correction preserves these original shoe fragments before
adding cloth allowance. It does not move the body, change the source shoes or
edit the shared registration. Final audits must include the concrete defect
pixels as well as complete pose coverage.

The [full catalog audit](verification-assets-before-shoe-edge.json) checked
**16 items / 1,464 garment poses** before the
last shoe-edge correction. The [final ownership audit](verification-ownership.json)
freshly checked the two corrected trousers (**176 poses**) and **176 complete
male outfits**, including fixed source-foot probes and the visible rear-leg
wedge. Its hash audit covers all 35 prior inputs: only the two trousers changed;
the other 14 garments, runtime code, source packs, registration and templates
match the earlier passed audit. Unchanged checks are explicitly reused, not
reported as newly executed.

For each trouser bank, 21 poses changed and 67 are pixel-identical to commit
`44d346b`. The correction removes 3,239 wrongly owned pixels per trouser bank and adds no
owned area. The original source pixels replace those fragments. See the
[decoded repair comparison](../../../artwork/kling-wardrobe/prepared/male-trousers-v1/footwear-fringe-fix.json)
and [source-component review](../../../artwork/kling-wardrobe/prepared/male-trousers-v1/source-fringe-review.png).

### Review media

The comparison GIF columns are **day before / day current / wedding before /
wedding current**, on the same background, facing and source frame. Male
before uses the initial separates; female before uses the V2 dresses. GIFs are
labelled 0.375× viewing copies. The native boards and 2× details preserve exact
integer scaling. GIF timing is rounded to centiseconds; pack timing is unchanged.

- [Male running, right](review/male-run-comparison-right.gif) · [left](review/male-run-comparison-left.gif)
- [Female running, right](review/female-run-comparison-right.gif) · [left](review/female-run-comparison-left.gif)
- [Male native key poses](review/male-keyposes-native.png) · [female native key poses](review/female-keyposes-native.png)
- [All five actions, native boards and 2× details](review/)
- [Leading-shoe repair, frame51 / 2×](review/male-leading-shoe-51-repair-2x.png) · [crossed-ankle repair, frame64 / 2×](review/male-crossed-ankle-64-repair-2x.png)
- [Media decoding and timing index](review/media-index.json)

### Download and reproduce

| Outfit          | Independent CharacterPack                             | Editable wardrobe project                      |
| --------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Male everyday   | [CharacterPack](exports/male-day.character.zip)       | [Project](exports/male-day.wardrobe.zip)       |
| Male wedding    | [CharacterPack](exports/male-wedding.character.zip)   | [Project](exports/male-wedding.wardrobe.zip)   |
| Female everyday | [CharacterPack](exports/female-day.character.zip)     | [Project](exports/female-day.wardrobe.zip)     |
| Female wedding  | [CharacterPack](exports/female-wedding.character.zip) | [Project](exports/female-wedding.wardrobe.zip) |

The production UI produced **46 downloads**: 28 current key-pose PNGs, six
mixed-outfit PNGs, four historical-project PNG regressions, four editable
projects and four CharacterPacks. Four saved projects reopened correctly;
all four historical comparisons remain pixel-identical. After every wardrobe
window closed, the independent player completed **40 action/facing cases**,
**eight additional queued transitions** (16 including workbench checks), and
[four complete decoded recordings](browser/).

The [original strict browser report](browser/evidence-index.strict.json) stopped
at its final empty-console assertion because Chromium requested a missing
`/favicon.ico` (HTTP 404). No page, clothing-asset, external-request or playback
failure occurred. A separate reproducible review preserves that report and its
hash, accepts only that exact ancillary icon request, rehashes all captured
inputs and outputs, and checks every remaining final assertion. The
[reviewed capture report](browser/evidence-index.json) explicitly identifies
this exception; it does not claim the original strict script returned success.

All expected timeline positions appeared in the recorded observation windows.
The capture still measured one 128.3 ms playback gap and one 134.6 ms transition
gap; it is not proof of zero dropped frames on every device. Source/current
project opens took 12.4–17.1 s, preflight 9.7–12.2 s, and independent opens 3.4–4.0 s
on this host. These are measured loading/playback limits, not art changes.

The [final export audit](verification/exports.json) passed for **four outfits,
368 source poses and eight complete atlas pages**, with exact decoded RGBA
agreement between saved-project composition and the downloaded CharacterPacks.
It also verified 28 current native PNGs, six mixed-look PNGs, four unchanged
historical-project PNGs, all nested ZIP CRCs/PNG decoding, source metadata and
32 preserved historical files.

The media index contains **25 PNGs and 20 GIFs**, each decoded and checked.
The GIF audit verifies decoded pixel/time sequences against the actual exported
frames, including centisecond rounding and one-shot jump behavior. The preview
scale is separate from the native CharacterPack resolution.
The export audit also preserves its two earlier failed runs. The first assumed
that a saved project embedded the entire catalog; projects actually embed only
selected items. Mixed-outfit verification now explicitly imports the matching
catalog garments, just as the browser session did. The second found four male
frame54 pixels labelled both `nearHand` and `shoes` in the old semantic template.
[Native inspection and per-pixel diagnosis](verification/semantic-overlap-diagnostic.json)
identify them on the rear shoe, including one faint matte-edge pixel; see the
[marked source image](verification/male54-semantic-overlap.png). The final audit
recognizes only those four exact source coordinates/values, verifies that they
lie outside registered head/hand protection, are not owned by the new top or
trousers, and equal both the separate old shoe asset and old wedding export.
Every other protected head/hand pixel remains subject to exact preservation.
This is a documented audit ownership correction; no source, garment or exported
pixel was changed to satisfy it.

Historical results in `fit-v2/` and the parent review belong to earlier batches.

To reproduce the production-UI capture without overwriting delivered evidence:

```sh
npm run build
WARDROBE_FULL_RUN=local-review WARDROBE_PRODUCTION=1 node scripts/verify-kling-full-outfits.mjs
node scripts/verify-kling-full-outfits-exports.mjs --run=local-review
WARDROBE_FULL_RUN=local-review python scripts/render-kling-full-outfits.py
```

The browser script uses Chromium and FFmpeg/ffprobe, and verifies downloads
before producing its success report. If it finishes all checks but reports the
same sole missing-icon error, reproduce the explicit exception review with
`WARDROBE_FULL_RUN=local-review node scripts/review-kling-full-outfits-capture.mjs`
before running the export/media steps. The final two commands consume those real downloads. Review
rendering requires Pillow and DejaVu Sans; it does not repaint garment art.

## Remaining visual limits

The single painted clothing reference is fitted to existing source poses;
folds are not individually redrawn for every bend. Deep crouches and crossed
limbs can still compress material detail. In male source104, the wedding suit
has a broad shoulder fold and a compressed, hard waist/pocket band; sleeve and
chest fold directions are not fully continuous. The standing suit also has a
hard double waist band against the trousers. The casual shirt's wide collar
still follows the source tank neckline, so it can look applied. Long sleeves
follow the source arm volume rather than adding a loose jacket silhouette.
These are remaining material/silhouette limits, even where all ownership and
continuity checks pass. The female waist and
hidden-thigh coverage retain V2's limitations; V3 corrects outline weight only.
Small irregular steps in the skirt hem remain visible at native size, especially
in crouched poses. Female source58 also retains a flat front-hem cut above the
raised shoe. The unchanged V2 alpha is not a newly redrawn continuous hem.
Source blur, matte fringes and original pose variation remain visible. Mirroring
is a whole-character left view, not independently drawn reverse clothing.

Pixel preservation and format tests cannot establish aesthetic acceptance.
Production Gathria integration and user visual approval remain unverified.
