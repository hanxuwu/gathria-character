# Sprints 26–30: curved cuffs, waist edges and synchronized comparisons

PR #34 was merged first as `c36e11c` after both remote checks passed. This batch
starts there and retains all prior source characters, clothing, appearances,
saved-project contracts and CharacterPack playback. New clothing is explicitly
versioned; opening an older project does not replace its artwork.

| Sprint | Delivered                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 26     | **Wedding curved cuff** — navy jacket V6 corrects the straight crossing-wrist cut in source pose 56, with only the original fist/wrist visible. |
| 27     | **Everyday smooth waist** / **Wedding smooth waist** — dress V8 revisions repair small right-waist steps in 15 compressed poses each.           |
| 28     | Connection inspection gains light, dark and checkerboard backgrounds, silhouettes and a dedicated elbow/cuff/hand crop.                         |
| 29     | **Download comparison GIF** pairs the padded original/current poses with fixed labels, original timing and matching facing.                     |
| 30     | Actual application downloads, matched prior-release comparisons, saved-project reopen, mixed outfits and isolated player verification.          |

## Open and inspect

Open `/workbench.html?character=male&mode=wardrobe` and select **Wedding curved
cuff**. Use `character=female` for **Everyday smooth waist** or **Wedding smooth
waist**. Earlier looks remain under **More outfits and earlier versions**. The
male **Everyday soft cuff** outfit is an unchanged control in this review.

Pause a difficult frame, enable **Inspect connections**, select **Elbows, cuffs
& hands** or **Shoulders & waist**, then change **Background** or enable **Show
silhouettes**. Original/current crops use the same registered rectangle; inspection
does not change your character or export settings. **Save comparison PNG** includes
the frame, facing and inspection mode in its labels/filename.

**Download comparison GIF** keeps the original on the left and the current look
on the right, including for left-facing clips. Both characters have the same
padded canvas/anchor; neither is independently scaled or centered. Labels stay
readable while only character pixels mirror. GIF is a half-native, 256-color,
cream-matted viewing copy. Preview speed and scrub position do not change the
exported complete action. Original looping actions loop; one-shot actions play
once. **Cancel preparation** cancels the download while retaining the open look.
Transparent full-resolution PNG and CharacterPack exports remain available.

## Actual exported review

The **before/after** media compare the previous released look with this revision.
The directly downloaded **source-comparison** GIFs instead compare the original
Kling body/clothing to the current styled character; these answer different
review questions and are labeled separately.

| Look                  | Same-frame crop                                    | Right run                                             | Left run                                             | Jump                                                   |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Male everyday control | [2× crop](review/male-day-connection-2x.png)       | [GIF](review/male-day-run-right-comparison.gif)       | [GIF](review/male-day-run-left-comparison.gif)       | [GIF](review/male-day-jump-right-comparison.gif)       |
| Male wedding          | [2× cuff](review/male-wedding-connection-2x.png)   | [GIF](review/male-wedding-run-right-comparison.gif)   | [GIF](review/male-wedding-run-left-comparison.gif)   | [GIF](review/male-wedding-jump-right-comparison.gif)   |
| Female everyday       | [2× edge](review/female-day-connection-2x.png)     | [GIF](review/female-day-run-right-comparison.gif)     | [GIF](review/female-day-run-left-comparison.gif)     | [GIF](review/female-day-jump-right-comparison.gif)     |
| Female wedding        | [2× edge](review/female-wedding-connection-2x.png) | [GIF](review/female-wedding-run-right-comparison.gif) | [GIF](review/female-wedding-run-left-comparison.gif) | [GIF](review/female-wedding-jump-right-comparison.gif) |

[Native full frames and ordered keyframes](review/) ·
[Direct action/source-comparison GIF downloads and inspector PNGs](evidence/).
Before CharacterPacks are retained actual downloads from Sprints 21–25 with their
hashes recorded. Matched before/after PNGs are freshly downloaded this batch.
Review boards only crop, arrange or scale exported frames; they do not repaint art.

Portable packs: [male everyday](evidence/male-day.character.zip),
[male wedding](evidence/male-wedding.character.zip),
[female everyday](evidence/female-day.character.zip),
[female wedding](evidence/female-wedding.character.zip).

## Art and compatibility

The male cuff uses a recorded OpenAI local cloth donor; generated face, body,
hands and other clothing are discarded. A curved item-specific V2 hand review
retains every previously protected fist pixel and restores a small original
wrist rim. All other 87 male poses remain exact.

The female repair reuses existing V7 art. Its small contour steps were in the
garment's alpha/ownership, not the interior folds. A local scanline-edge fit
transports the painted edge and fractional alpha by at most six native pixels,
with continuous pose weighting and a bounded waist window. It preserves original
skin/head/hands; newly owned pixels are restricted to empty background. Other
81 poses per dress remain exact. [Art source, processing and limits](../../artwork/kling-contour-review/README.md).

No skeleton, source body, shared anchor or action timing is changed. New items
use the existing garment V1/V2 contracts; baked packs use the existing portable
format. Runtime generation and playback stay browser-local and deterministic.

## Verification and visual limits

This batch ran TypeScript/production build, **247 unit tests**, **68 Chromium
browser tests** and **six offline recipe tests** successfully. The four focused
GIF/inspection browser tests also passed before the full suite. These results
are distinct from the historical PR #34 checks. [Tested source hashes and
commands](test-results.json) identify the working tree used for the production
capture; its initial Git parent is not presented as the implementation commit.

[Asset audit](asset-checks.json) protects 101 old archive hashes and the four
source/registration files, then checks all 280 poses in the three new banks.
The same audit now runs in CI. [Browser record](evidence/evidence-index.json),
[decoded export audit](export-checks.json) and [review-media index](review-index.json)
record exact files, timings and independent playback. Technical checks do not
constitute user visual acceptance.

The final content audit decoded **four packs / 368 poses, 72 matched PNGs,
24 direct GIFs and four saved projects**. The 24 GIFs comprise 16 run/jump views
and eight original/current comparisons. Each comparison's two decoded panels
were checked against the corresponding exported/source frame, allowing only
GIF quantization; both directions retain exact mirrored panels and readable
labels. All 36 derived review media were decoded, with frame count and duration
checks. Independent playback covered **40 action/direction cases after closing
all editors**, with editor/wardrobe module requests blocked. No application
errors or external requests occurred; the known missing browser favicon is
recorded separately.

Editable project ZIPs are temporary test downloads with hashes in the browser
record. Source banks, actual CharacterPacks and their provenance are committed;
the temporary project files can be recreated through **Save wardrobe**. To
recapture without overwriting retained evidence, after building and installing
Playwright Chromium:

```sh
KLING_REVIEW_DIR=.review-tmp/contour-recapture node scripts/capture-kling-contour-review.mjs
KLING_REVIEW_DIR=.review-tmp/contour-recapture python scripts/verify-kling-contour-exports.py
KLING_REVIEW_DIR=.review-tmp/contour-recapture python scripts/render-kling-contour-review.py
```

`CHROMIUM_PATH` optionally selects an installed browser. `KLING_REVIEW_TEMP`
optionally selects a folder for editable project downloads; its default is the
ignored `.review-tmp/kling-contour` directory. Python uses the repository's
artwork dependencies. The current delivery's original temporary paths remain
recorded honestly rather than being rewritten to pretend they were committed.

- The male curved cuff removes the rectangular cut and residual straight pale
  sliver. The source fist still has motion blur and limited finger detail.
- The female repair is a few-pixel contour improvement, not a new dress shape.
  Some source blur and larger pre-existing fabric/armhole seams remain.
- Other old vest/waist seams and source frame-to-frame drawing variation remain.
  This batch does not claim that all five actions are free of every artifact.
- GIF palette and centisecond timing are approximate viewing representations;
  exact source FPS, RGBA and anchors remain in CharacterPack.
