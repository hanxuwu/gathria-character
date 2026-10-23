# Appearance workflow and motion review

This batch keeps the two existing short hairstyles, three hair colors and Gentle
face preset. It builds on the ear-edge correction at `055e951`; no source video,
hair donor, garment or motion timing is regenerated. Appearance content revision
3 changes only metadata; every atlas and ownership PNG byte remains identical.

## Using the workbench

Open **Character library → Dress Kling male/female → Hair & face**. Hair cards
show examples cropped from actual wardrobe exports; named color swatches use the
same saved selection as the existing controls. The live preview is authoritative
for the selected character, color, face and clothes. **Compare original** retains
the approved source character alongside the dressed character.

An older saved project continues to use its exact embedded appearance assets.
**Preview updated appearance** opens a separate before/after view at the current
action, frame and facing. Inspect the update, then **Save updated copy** to download
a new editable project. Reopen that copy to use it. Cancelling or saving the copy
leaves the original open project, including unsaved clothing edits, unchanged.

Only the catalog's exact released predecessor banks can be updated. Unknown,
custom or newer banks are retained. Source and registration hashes must match;
missing styles and incorrect downloaded assets fail without replacing the open
project. Current-bank projects do not offer an unnecessary update. Older projects
without head assets can explicitly preview adding the current bank; their original
head selection is preserved.

## Visual scope

[Full head-frame audit](visual-audit.md) records the review of 368 head drawings
from the previously exported packs, plus native-size difficult poses. This is
a fresh visual review of retained exports, not a new export execution. New browser
workflow captures and downloads are recorded separately below.

The ear-side scalp band repaired in the previous batch did not recur. A new
fine-line defect was found at the rectangular head boundary: original scalp
raster remnants were incorrectly protected as body, interrupting the new hair.
The new bank explicitly allows authored hair over a three-pixel top/side fringe,
with unchanged lower edge and retained foreground regions. The measured remnants
were at most 1.5 pixels outside for the male and 2.5 for the female in non-celebrate
poses; distant celebration hand pixels remain protected. Old embedded banks keep
the old rule until an explicit copy upgrade.

[Bank revision verification](bank-revision-validation.json) compares both current
banks with `055e951`: all 20 atlas/ownership PNG entries are byte-identical and
all 184 original head/face/anchor guides are unchanged. The new hair fringe
envelope, content ID and provenance are added. All existing foreground polygons
remain unchanged, with two explicit additions described below.

The full sequence review also found a separate preexisting defect: female
celebration poses 78 and 79 let hair cover a triangular patch inside the thumb
and wrist. Two small source-coordinate polygons restore the original hand in
front of the hair. All newly protected pixels are opaque source-hand pixels;
the transparent space between hand and ear is not filled. These changes are
metadata only, not a new skin drawing or a skin-color filter. The earlier
female export is retained as iteration 1 with its hashes, while final female
exports are captured again against the final bank. Neighboring selected poses
75 and 80 are checked too; frame 77 is not in the current selected sequence.

Original video blur and chroma-key edge colors remain visible
in some fast jump poses. The short hair follows registered head motion without
secondary hair physics. This batch does not claim that those source limitations
or garment deformation limits are resolved, or that user visual approval has been
received.

## Verification

This iteration ran 221 unit tests, TypeScript checking, the production build,
six Python hair/ear regressions, and the complete 50-test Chromium suite. They
passed. After the final metadata-only hand correction, the ten appearance-upgrade
tests were rerun against the final bank hashes. These ten are a subset of the
221, not an additional ten distinct tests. The female actual browser workflow
is recaptured after the correction; the male bank is unchanged.

The new browser captures exercise explicit preview/cancel/save-copy, old-project
preservation, current-bank reopen, both hair styles, representative colors,
everyday/wedding outfits, actual PNG and CharacterPack downloads, and independent
playback with the editor closed. The downloadable CharacterPacks contain all
five actions and keep the source frame order, timing and mirrored-left behavior.
The GIFs repeat a labeled five-action review sequence; this does not turn the
CharacterPack's one-shot jump into a looping action.

The final male and corrected female captures record **40 downloads**: 30 native
PNGs, six editable project downloads, and four CharacterPacks. Four outfit
save/reopen checks and **40 independent playback combinations** pass (two
characters × two outfits × five actions × two directions). Final pixel checks
cover 368 native pack frames. The same-config daily comparison covers all 184
unique character poses: male changes are confined to 315 boundary pixels; female
changes comprise 2,018 boundary pixels and 352 restored original hand pixels.
All other pixels, including the original face, match the prior same-config export.
The final production build was rerun after refreshing the actual-export thumbnails.

Earlier verification counts remain in the
[ear-edge review](../ear-edge-review/README.md) and describe that earlier revision.
Technical checks do not establish user visual acceptance.

## Actual exported results

- Male, everyday and wedding: [right GIF](workflow/male-everyday-wedding-right.gif)
  / [left GIF](workflow/male-everyday-wedding-left.gif).
- Female, everyday and wedding: [right GIF](workflow/female-everyday-wedding-right.gif)
  / [left GIF](workflow/female-everyday-wedding-left.gif).
- Female hand ownership: [source / before / after at 4×](hand-source-before-after-4x.png)
  / [neighboring poses at 4×](hand-neighbors-source-before-after-4x.png).
- Saved-copy ear comparison at 2×: [male](workflow/male-saved-copy-ear-2x.png)
  / [female](workflow/female-saved-copy-ear-2x.png).
- Final independent wedding CharacterPacks:
  [male ZIP](workflow/final-male/male-wedding.character.zip) /
  [female ZIP](workflow/final-female-hand-fix/female-wedding.character.zip).
- Capture records: [male](workflow/final-male/evidence-index.json) /
  [final female](workflow/final-female-hand-fix/evidence-index.json).
- [Decoded artifact, pixel, timing and playback checks](workflow/artifact-validation.json)
  / [final framewise visual validation](final-visual-validation.json).

GIFs are labeled 0.5× review copies to keep the full characters readable together.
Native RGBA checks use the full-size PNG frames and decoded CharacterPacks, not
the quantized GIFs. The smaller hairstyle cards are presentation thumbnails
cropped from actual frame-0 exports; their source hashes and crop boxes are in
`src/appearance/previews/provenance.json`.

The first female pass is retained under `workflow/final-female` as diagnostic
iteration 1. Its index pins the earlier bank and downloads; the retention record
explains why its duplicate full ZIP is not shipped. It is not the final female
result. No screenshots or simulated ownership repairs substitute for the final
application exports above.

## Remaining limits

The opaque thumb/wrist intrusion and rectangular scalp-remnant lines are fixed.
Some raised-hand edges still show the original pale semitransparent fringe;
compositing those edge pixels over rear hair needs a separate ownership-aware
alpha refinement. Source jump blur, chroma-key colors and closed-eyelid speckles
are retained. No secondary hair physics or new expressions are added here.
Gentle remains a restrained source-derived preset, and existing garment-fold
limitations remain visible. This batch does not change motion rhythm, proportions,
or production Gathria integration status.
