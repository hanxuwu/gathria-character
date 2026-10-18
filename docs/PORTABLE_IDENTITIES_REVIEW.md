# Portable identities: Maple and Willow

Maple can now change outfits while keeping its authored head, hair and three
expressions. A second generated character, Willow, uses the same identity format,
garment library, skeleton and four actions. Selecting a new identity keeps the
outfit; importing an identity alone leaves the current canvas intact.

Implementation starts from `fa3b5d2` on the still-unmerged draft PR #7. Recovery
commit `74923c0` saves and pushes the identity format, editor workflow, sources,
preparation and reusable examples; `654de23` repairs oversized playback provenance.
This is a separate stacked draft targeting
`feat/generated-character-pipeline`; no merge or deployment is part of delivery.

## Actual output for review

All presentation images below use actual Skin Studio-exported PNGs. The neutral
background is a review stage, not a production Gathria scene. Raw generated
source sheets are separately labeled in the source directory.

- Six looks: [native](portable-identities/final/lineup-1x.png),
  [2×](portable-identities/final/lineup-2x.png).
- Four actions: [native](portable-identities/final/four-actions-1x.png),
  [2×](portable-identities/final/four-actions-2x.png),
  [right playback](portable-identities/final/four-actions-right-2x.gif),
  [left playback](portable-identities/final/four-actions-left-2x.gif).
- Three expressions each: [2×](portable-identities/final/expressions-2x.png).
- All six outfits running:
  [right](portable-identities/final/outfits-run-right-1x.gif),
  [left](portable-identities/final/outfits-run-left-1x.gif).
- Registration: [Maple neck/shoulder](portable-identities/final/maple-neck-shoulder-4x.png),
  [Willow neck/shoulder](portable-identities/final/willow-neck-shoulder-4x.png),
  [Maple cuff/waist](portable-identities/final/maple-cuff-waist-4x.png),
  [Willow cuff/waist](portable-identities/final/willow-cuff-waist-4x.png).
- Recoloring: [full run pose](portable-identities/final/recolor-2x.png),
  [Maple head](portable-identities/final/maple-head-recolor-4x.png),
  [Willow head](portable-identities/final/willow-head-recolor-4x.png).
- Prior flat Maple versus the explicit new wardrobe look:
  [native](portable-identities/final/maple-flat-to-identity-1x.png),
  [2×](portable-identities/final/maple-flat-to-identity-2x.png).

See the [download index](portable-identities/README.md) for individual action
GIFs, all run/jump keys, reusable identities, clothing and editable projects.

## What changed and what the trial found

**Identity sources are independent of clothes.** A bounded `.identity.zip` owns
three complete expression heads and optional back hair, explicit neck/jaw
registration and semantic skin/hair masks. The editor stores the identity library
inside the project. Choosing clothes does not replace those heads. Library-only
import, explicit selection, removal, recoloring and project saving participate
in existing undo/redo. A flat imported drawing has no inferred clothing recipe;
the UI explains that using an identity there starts a new default outfit.

**Willow supplies a second real source example.** Two generated source sheets
establish a rounded wavy bob and a plum cardigan/olive trouser/cream sneaker
outfit. Offline preparation separates and registers the parts; it removes
translucent source halos, trims static trouser ends from the hip plate and keeps
joint overlap. Run/jump hands reuse the retained generated closed fists under
the new cuffs. Maple's original three head PNGs remain exact.

**Visual inspection corrected source ownership.** Deep skin with blonde hair
exposed bright forehead pixels assigned to hair; explicit source masks were
extended along the forehead. Recoloring the cardigan exposed a burgundy placket
strip mistakenly included in the fixed cream-shirt mask; its garment ownership
was corrected. These were preparation defects, not skeleton defects. The six
outfit checks retain stable head/neck registration across three collars.

**Code review caught a color discontinuity.** Preserving source-colored heads
exactly but immediately using the older recolor formula for any other color made
a one-unit color adjustment jump visibly. Custom identities now apply a
continuous target-minus-source palette adjustment to authored pixels. A focused
regression checks the neighboring colors; the existing garment/built-in formula
is unchanged. No character-specific renderer code, rig or motion edits were
needed to support Willow.

**The real export trial caught a packaging defect.** The bake provenance recipe
copied encoded identity and clothing pixels into `PROVENANCE.txt`, making the
first six-item sample 390,890 bytes and exceeding the independent consumer's
256 KiB text limit. Playback provenance now describes those source libraries
without duplicating pixel payloads. Complete sources remain in the authoring
project. Consumer limits remain unchanged; the failed intermediate export is
replaced by a complete final capture after the repair.

## Compatibility and reproducibility

Wardrobe recipe **v3** explicitly selects a custom identity and adds hair color.
Existing v1/v2 recipes and built-in identities keep their original rendering.
The authoring project envelope stays v1 with optional `identities.json`; flat
PNG attachments remain complete. SkinPack v2's paired active forearms are reused
without a new skin version. Choosing a built-in identity explicitly returns to
v1/v2; unused custom identities remain saved in the library.

Earlier flat Maple projects do not silently upgrade. The new prepared examples
embed both identities and all six custom clothing items. A baked CharacterPack
needs only its exported pixels and metadata to play; keep the editable `.rig.zip`
for further changes. Legacy appearance JSON is only a compatibility reference
and cannot reproduce an imported identity by itself.

The explicit new Maple wardrobe look is not a byte-identical whole-body copy of
the old flat skin: garment fitting and its preserved recolor path change roughly
4,830–6,731 pixels per frame, predominantly clothing/limb palette treatment.
The matched comparison above records that difference. Its three authored head
sources remain exact, and reopening the original flat project still reproduces
the original output exactly.

[Identity contract](IDENTITY_PACK_V1.md) ·
[Source/provenance and preparation](../artwork/portable-identities/README.md) ·
[Preparation script](../scripts/prepare-portable-identities.mjs) ·
[Actual UI capture](../scripts/generate-identity-evidence.mjs) ·
[Review/decoding script](../scripts/render-identity-review.py).

## Verification in this batch

On the final implementation, **454 unit tests across 35 files, all 52 Chromium
E2E tests, TypeScript and production build passed**. Unit and browser suites ran
sequentially; the browser suite took 4.3 minutes with no retry or failure. The
build retains its bundle-size warning. The earlier 452-test run preceded the
real-export provenance defect and its two new regressions.

The final actual capture passed **12 new look/expression/color exports (432
source poses), 176 editor frame/facing comparisons, eight save/reopen roundtrips
and 24 independent timed playback cases after closing Studio**. Both identity
ZIPs and six clothing items roundtrip with exact PNG/mask pixels. Four historical
flat/wardrobe projects retain all 36 poses and their manifests. All six looks
share identical rig and motion data; source-colored heads stay exact across
outfits. No page errors, external requests or authoring-module fetches occurred.

Every delivered **155 PNGs, 20 GIFs and 46 ZIPs** was decoded; ZIP members/CRCs,
binary alpha, frame sequence, mirrors and GIF durations/loop flags were checked.
The 46 ZIPs include editable projects, identity/clothing roundtrips, reopened
exports and legacy checks as well as the 12 main review CharacterPacks.
Sources and prepared input hashes remained fixed throughout the capture.
Independent examples: [Maple running](portable-identities/final/maple-maple/independent-run-right.png),
[Willow running left](portable-identities/final/willow-willow/independent-run-left.png),
[Willow jump landed](portable-identities/final/willow-willow/independent-jump-right.png).

The execution record is [verification-results.json](portable-identities/verification-results.json).
It distinguishes this run from the historical 437-unit/50-browser Maple batch.
Actual export checks are in [evidence-index.json](portable-identities/final/evidence-index.json),
media checks in [artifact-validation.json](portable-identities/final/artifact-validation.json),
and every delivered file/member in [file-integrity.json](portable-identities/final/file-integrity.json).

## Visual limits and next boundary

- Neutral and gentle expressions remain close; joyful is clearly different.
- Maple's original relaxed hands are paler than its warm face. Different garment
  sources still have slightly different texture density and skin treatment.
- Deep skin/blonde recolors retain a few warm ear/hairline boundary pixels and
  dark fixed hair outlines. These masks are authored for these sources, not a
  universal automatic segmentation model.
- Deep knee folds, compressed cloth and mitten-like active hands remain. This
  batch intentionally retains the existing renderer and motion; earlier knee
  parameter trials did not justify another patch. A dedicated bent-pose source
  study should be a separate change.
- The built-in Denim top keeps its original hand art. Only the new Maple/Willow
  top items provide paired run/jump alternatives; swapping to Denim and back
  exercises that explicit skin-version transition.
- This family supports registered V6-scale anatomy. Arbitrary proportions,
  automatic splitting/binding, accessories, scene travel and production Gathria
  integration remain outside this batch. Animation is in place.

Functional checks and visual review are separate. No final user visual
acceptance is claimed. Stop here for review before expanding the system.
