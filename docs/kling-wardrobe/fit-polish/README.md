# Kling clothing fit polish

This batch refines the four existing everyday/wedding outfits on merged main
`c89e5add8d8b1a134e7cb3d7576c6370590cb57e`. It keeps the approved Kling heads,
body proportions, original source poses and action cadence. No new character
illustration replaces the video artwork.

## Changes and compatibility

The new male tops use separate `teal-camp-shirt-v2` and
`navy-suit-jacket-v2` IDs. The trousers, shoes, male registration and source pack
remain unchanged. The prior fitting treated dark pixels from the original tank
as garment edges, carrying its waistband and armpit creases into the jacket.
The new fitting distinguishes the external edge from interior tank ink, makes
the shoulder sampling transition more continuous and restores the jacket's
own lower contour. The casual collar receives a restrained horizontal fitting
adjustment; an experimental upward shift was rejected after native inspection.

The female dresses use new `coral-daydress-v4` and
`ivory-wedding-dress-v4` IDs. Their original painted hem is re-extracted without
discarding its dark outline as background. The old ivory mask also included a
piece of grey reference background beneath the lace; removing that region
restores the original leg in running pose58. Premultiplied-alpha sampling and
removal of faint mask rings reduce fragments at the shoe edge. None of these
changes redraws the legs or shoes.

This batch reuses the existing painted clothing references. It does not claim
new hand-painted key poses or generated character artwork. See the
[male preparation/provenance](../../../artwork/kling-wardrobe/prepared/fit-polish/male/README.md)
and [female preparation/provenance](../../../artwork/kling-wardrobe/prepared/dress-fit-v4/README.md)
for source boundaries, fitting rules and rejected trials.

Old garment archives, templates, source packs, registrations and previously
exported projects remain reproducible. Existing projects embed their selected
garments and do not silently upgrade. The current catalog offers the refined
versions in **Everyday** and **Wedding**. The unchanged male trousers and shoes
remain available for independent slot mixing.

## Open and inspect

- `/workbench.html?character=male&mode=wardrobe`
- `/workbench.html?character=female&mode=wardrobe`

Choose **Everyday** or **Wedding**, then enable **Compare original** and inspect
at **1× native** or **2×**. Use **Save wardrobe** for an editable project and
**Export CharacterPack** for an independently playable animation.

## Before baseline and evidence

The before material is the previous batch's actual production-UI export,
not a preparation sketch. [Baseline identities](baseline.json) bind those files
to the merged commit. Rechecking their hashes in this batch is distinct from
recapturing the original browser session.

[Evidence procedure](EVIDENCE.md) describes the new UI capture, save/reopen,
mixing, independent playback and decoded PNG/GIF/ZIP verification.

| Actual exported comparison           | Male                                                   | Female                                         |
| ------------------------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| Run, right                           | [GIF](review/male-run-comparison-right.gif)            | [GIF](review/female-run-comparison-right.gif)  |
| Run, left                            | [GIF](review/male-run-comparison-left.gif)             | [GIF](review/female-run-comparison-left.gif)   |
| Jump, right                          | [GIF](review/male-jump-comparison-right.gif)           | [GIF](review/female-jump-comparison-right.gif) |
| Jump, left                           | [GIF](review/male-jump-comparison-left.gif)            | [GIF](review/female-jump-comparison-left.gif)  |
| Native difficult poses               | [PNG](review/male-keyposes-native.png)                 | [PNG](review/female-keyposes-native.png)       |
| 2× crouched connection / running hem | [PNG](review/male-crouched-shoulders-waist-104-2x.png) | [PNG](review/female-skirt-outline-58-2x.png)   |

GIF columns are **Kling original / everyday before / everyday current / wedding
before / wedding current**, all with the same source frame and timing. GIFs are
labelled 0.375× previews; native PNGs and integer 2× crops are provided separately.
The [review directory](review/) also contains idle, walk and celebrate in both
directions, collar/cuff details and matched full poses. Jump plays once, preserving
the source package's action contract.

| Outfit          | Independent CharacterPack                   | Editable project                           | Independent session                             |
| --------------- | ------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| Male everyday   | [ZIP](exports/male-day.character.zip)       | [ZIP](exports/male-day.wardrobe.zip)       | [WebM](browser/male-day-independent.webm)       |
| Male wedding    | [ZIP](exports/male-wedding.character.zip)   | [ZIP](exports/male-wedding.wardrobe.zip)   | [WebM](browser/male-wedding-independent.webm)   |
| Female everyday | [ZIP](exports/female-day.character.zip)     | [ZIP](exports/female-day.wardrobe.zip)     | [WebM](browser/female-day-independent.webm)     |
| Female wedding  | [ZIP](exports/female-wedding.character.zip) | [ZIP](exports/female-wedding.wardrobe.zip) | [WebM](browser/female-wedding-independent.webm) |

## Verification recorded in this batch

- [Runtime checks](verification/runtime-checks.json): 155 unit tests, 36 Chromium
  tests, typecheck, production build and four dress-fitting script tests passed
  before the later PNG decoder work. These are newly executed checks.
- [Asset audit](verification/assets.json): four candidate garments, 368 pose
  payloads, six default/mixed looks across 544 poses, protected source pixels,
  alpha/ownership and deterministic preparation samples. The final metadata-only
  display-name repack is explicitly revalidated against the initial pixel audit.
- [Immutable baseline](verification/immutable-baseline.json): old source packs,
  registrations, templates, garments and historical exports remain unchanged.
- [Browser capture](browser/evidence-index.json): 38 real downloads, four new
  save/reopen checks, four historical project reopenings, six mixed-outfit PNGs,
  40 independent action/direction cases and 16 queued transitions. No application
  errors or unexpected resource/network requests were observed.
- [Independent export audit](verification/exports.json): all eight decoded atlas
  pages in four CharacterPacks exactly match the saved-project compositor across
  368 source poses. The audit also checks 20 main PNGs, six mixed PNGs, four old
  project PNGs and 53 unchanged historical export/input files.
- [Media audit](review/media-index.json): all 24 PNGs and 20 GIFs decode; GIF
  quantized pixels, full time sequence, mirroring and loop/one-shot behaviour
  match the corresponding exported frames. GIF centisecond rounding is recorded.
- [Visual review](verification/visual-review.json): 18 matched native pose pairs,
  integer 2× detail boards and temporal samples from the actual GIFs reviewed
  separately from the technical checks. Remaining limitations are listed below.

The first capture stopped when the environment lacked Playwright's recorder.
Its [failure report](browser/evidence-index.environment-failure.json) is retained.
The continuation verified all earlier downloads/input hashes, then used a fresh
browser and the installed system FFmpeg to record independent playback. Earlier
workbench results were retained, not described as a second complete capture.

Normal playback observations covered every expected position; transition
observations still include a 105.6 ms gap during male-wedding walk→run. This is
reported rather than used to claim guaranteed delivery of every display frame.
Source motion metadata and GIF encoding checks are distinct from browser timing.

## Visual scope

Native actual exports show a clearer jacket hem and less duplicated tank ink
in standing0/crouching104; the shirt's shoulder boundary is more continuous in
running51. Female running58 has a continuous coral hem and no longer carries the
ivory reference-background triangle across the leg. The head, skin, pose and
original timing are retained.

Clothing remains fitted to the source pose bank. These limits remain visible:

- Crouched male87/104 still compress dense sleeve and vest folds. Sleeve volume
  follows the source arms rather than a separately drawn loose jacket.
- The casual collar retains the original round neck opening. An open collar
  with additional visible skin requires separately approved neckline artwork.
- The female deep-crouch waist/side openings and relatively stiff broad folds
  remain. Correcting the hem does not resolve all bodice-to-skirt fitting.
- Original motion blur, pose variation and whole-character mirrored left-facing
  playback remain part of the source-based workflow.

The batch improves the specified defects; passing pixel/format tests is distinct
from aesthetic acceptance and does not certify physically simulated cloth,
perfectly smooth playback or user visual approval.
