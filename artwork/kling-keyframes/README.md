# Kling keyframe loop selection

This candidate selects only existing frames from the two approved five-action
Kling packs. No new artwork, source extraction, AI generation, interpolation,
skeletal posing or per-frame alignment is used. Original sources remain intact.

`selection.json` is the authoring record. Every key identifies the original atlas
frame, original video frame, motion phase and hold in 1/24-second ticks. It also
pins the input ZIP SHA-256. Characters are assessed separately; matching totals
do not imply identical motion or shared clothing layers.

## Selection decisions

- Idle: four near-stationary poses, six ticks each. Preserve the one-second
  period without retaining 24 nearly identical drawings.
- Walk: retain both foot contacts, weight transfer and passing poses. Male uses
  12 distinct images; female uses 14 where the source step changes more quickly.
  Both keep the original 27-tick period. The source torso turns during the
  stride; frame selection cannot remove that change without altering the art.
- Run: retain extension, landing, recovery and both flight phases. Male uses
  11 drawings and female 12 over the original 16 ticks. Fast transitions keep
  one-tick poses; similar poses share a held drawing. No reverse playback.
- Jump: retain preparation, takeoff, tucked apex, descent and landing crouch.
  The full original 39-frame jump ends upright and cannot repeat into its
  initial crouch naturally. Select source frames 174–195 for male and 175–195
  for female as separate repeated hops. Male retains 16 drawings over 22 ticks;
  female 14 over 21 ticks. Final upright recovery stays in the original pack.
- Celebrate: retain raised hands, peak, lowering and the return to preparation;
  male uses nine drawings, female eight, over the original 16 ticks.

The initial male jump proposal omitted all four slightly clipped apex images.
Inspection showed that this also removed the highest knees-tucked pose and
flattened the flight arc. The rejected selection is retained in
`iterations/male-apex-omission.json`. The delivered candidate restores genuine
apex poses and discloses the existing scalp clipping rather than inventing
replacement pixels. This is one reviewed selection, not a claim of a global
optimum or final user visual acceptance.

## Compilation and provenance

Run `python3 scripts/compile-kling-keyframes.py` from the repository root.
The compiler copies integer frame rectangles into a compact CharacterPack V2
atlas. Every decoded 704×1056 RGBA frame is checked against its source, including
transparent pixel RGB. Anchor (352,998), scale and mirroring are unchanged.
Atlas PNG bytes and frame rectangles change during lossless repacking; selected
frame pixels do not. Original sparse frame IDs and source mapping are retained.

Repeated IDs in each animation implement holds at 24 FPS using the existing
player contract. They must not be deduplicated from the playback sequence.
The packs contain 52 distinct drawings each, not 52 equal-duration time slots.
The original pack and selection provenance are included in `character.json` and
`PROVENANCE.txt`; these are complete-character images, not separated garments.

See [actual exports and comparisons](../../docs/kling-keyframes/README.md) and
[verification and limitations](../../docs/KLING_KEYFRAMES_REVIEW.md).
