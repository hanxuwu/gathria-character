# Side-view clothing polish and review tools

This follow-up improves the two existing Kling side-view outfits and makes
their defects easier to inspect. It continues draft PR #53 on
`feat/kling-side-tailored-wardrobe`; it does not merge the candidate into main.
The prior actual exports and source assets are identified in [baseline.json](baseline.json).

## Open the review

Run `npm run dev`, then choose **侧视新款试装与发型** on either character card:

- `/workbench.html?character=male&mode=side-view&collection=tailored`
- `/workbench.html?character=female&mode=side-view&collection=tailored`

The new clothes start selected. Choose a **发型** to add the side-view hair.
Below the preview, **检查穿帮 · 逐帧审阅** pauses the current pose and opens
source/current comparison. Use the existing frame slider and step controls,
0.25× / 0.5× slow playback, and 2× / 3× native detail panes for ears, wrists,
waist, knees and ankles. Slow motion changes preview time only; exported images,
GIF timing and CharacterPack action metadata retain the original source contract.

Problem-frame notes stay in the current browser, grouped by character and source.
Each note includes the actual registration, selected clothing and appearance
versions. A changed look is identified rather than silently treating an old note
as current. **导出审阅 JSON** makes notes portable; notes are separate from a
saved wardrobe project. [Workbench behavior and checks](workbench/README.md).

## Repairs

- **Male hands and trousers:** source-traced walk contact boundaries release
  original dark shorts that were incorrectly protected as hand pixels. The
  accepted leg fit is held stable so a hand-mask repair cannot change unrelated
  trouser shading. See [native comparisons and exact change audit](male/README.md).
- **Female cloth continuity:** one complete pleated skirt is used through idle,
  walk and run, with a consistent folded skirt through jump. This removes
  repeated switches between incompatible fold patterns. Two isolated blouse
  donor choices are corrected. A trial with a floating front skirt flap was
  rejected; [the retained version and tradeoff](female/README.md) are recorded.
- **Male rear hair:** a bounded correction covers a conspicuous exposed rear
  scalp strip in jump frame 67. Original face/ear artwork and the other native
  hair poses are preserved. [Hair review and limitations](hair/README.md).

No new character, face, body pose, animation frame or source retiming is added.
The source remains 107 male and 102 female frames at 512 × 768, 24 fps, anchored
at `(256, 710)`. The jump is still the original two-jump one-shot with its shallow
crouch ending. Existing material outfits, old embedded projects and other app
destinations retain their behavior.

## Reuse and loading

[Painting guides and package preflight](authoring/README.md) are available through
`scripts/kling_side_tools.py`. Guides include original RGBA, a blank painting
layer, anchors, exact head/hand protection masks and source/version hashes.
Preflight reports missing poses, mismatched bindings, out-of-bounds ownership
and protected overlap by frame. It cannot establish correct anatomy or approve
cloth motion; actual visual review remains necessary.

[Loading measurements](performance/README.md) compare the old and new loaders
against the same frozen asset set. Independent downloads now run in parallel.
A bounded cache retains only the two verified compressed source ZIPs, up to
32 MiB. Clothing, registration and hair are still fetched and validated afresh;
no second cache of expanded frame images is introduced. Reusing source bytes
trades retained compressed memory for less repeated transfer, not a claim of
lower total browser memory.

## Actual-export evidence

The final [QA record](QA.md) distinguishes current tests from historical results.
These comparisons use the previous actual exported packs and the current packs
downloaded through the workbench. Presentation scripts add labels/layouts only.

| Review                    | Male                                                                    | Female                                                                      |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Walk before / after       | [Right](review/male-walk-right.gif) · [Left](review/male-walk-left.gif) | [Right](review/female-walk-right.gif) · [Left](review/female-walk-left.gif) |
| Run before / after        | [Right](review/male-run-right.gif) · [Left](review/male-run-left.gif)   | [Right](review/female-run-right.gif) · [Left](review/female-run-left.gif)   |
| Jump before / after       | [Right](review/male-jump-right.gif) · [Left](review/male-jump-left.gif) | [Right](review/female-jump-right.gif) · [Left](review/female-jump-left.gif) |
| Native key poses          | [PNG](review/male-keyposes-native.png)                                  | [PNG](review/female-keyposes-native.png)                                    |
| Integer 2× details        | [PNG](review/male-details-2x.png)                                       | [PNG](review/female-details-2x.png)                                         |
| Independent CharacterPack | [ZIP](review/male.character.zip)                                        | [ZIP](review/female.character.zip)                                          |
| Editable project          | [ZIP](review/male.wardrobe.zip)                                         | [ZIP](review/female.wardrobe.zip)                                           |

Independent player screenshots after closing the workbench:
[male](review/male-independent-player.png) and
[female](review/female-independent-player.png).

[Pair: walk → run → original two jumps](review/pair-walk-run-two-jumps.gif)
is a presentation sequence from actual exported frames, not proof of a newly
generated animation transition. GIFs use an indexed palette; native PNGs and
CharacterPack pages are the lossless reference.

## Remaining visual limits

The female forearm/fist boundary at run frames 39/49 remains visibly squared,
and some blouse sleeve changes are still perceptible. Using a full pleated
running skirt improves continuity but has less wind lift than the rejected
ruffled version; switching into jump still changes the skirt silhouette.
Male compressed sleeves can look angular. The rear-hair correction is local,
not hair simulation. Source blur, matte fringes and cross-clip drawing changes
are retained. These limits remain separate from successful format, pixel and
playback checks; this iteration does not claim every seam is invisible.
