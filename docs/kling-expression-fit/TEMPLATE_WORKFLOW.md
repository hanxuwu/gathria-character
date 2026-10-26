# Reusing the female sleeveless clothing template

This workflow demonstrates another painted design on an existing source-bound
cut. It is not a universal one-image-to-any-outfit generator.

## Stable inputs

| Input | Reused contract |
| --- | --- |
| Original female CharacterPack | 704 × 1056, source anchor (352, 998), 96 unique source poses |
| Frozen female registration | 17 per-pose guides, source IDs, strict head/hand protection |
| Source actions | Idle 24, walk 27, run 16, jump 39 and celebrate 16 scheduled positions; 24 FPS |
| Existing top ownership | Sleeve-free source outline, native alpha and forearm occlusion |
| Bottom banks | Existing navy and ochre shorts, original layer ordering |
| New authoring derivative | Three reviewed cloth-only repairs; other 93 crop records unchanged |

Numbers above count scheduled positions separately from distinct source poses.
Jump remains a one-shot with its existing idle return in the player; other
actions retain their existing loop flags. Left playback mirrors native right.

## Steps for another design of the same cut

1. Preserve an approved full-character reference and the exact new donor,
   prompt and provenance. Sample only explicitly traced clothing RGB. Generated
   body pixels and transparency are not a replacement for the source character.
2. Register donor cloth using the existing neckline, shoulders and sloped waist.
   The tracked neck guide can lie on the chin in a crouch, so record separate
   cloth-paint controls instead of moving the body's source anchors.
3. Reuse the reviewed source-bound authoring derivative:
   [female-sleeveless-authoring-v2.zip](../../artwork/kling-female-top/prepared/female-sleeveless-authoring-v2.zip).
   Its masks include the three explicit repairs described in
   [ownership-repairs.json](../../artwork/kling-female-top/source/ownership-repairs.json).
   Do not infer cloth ownership from a color threshold or overlapping guide masks.
4. Produce explicit native paint/mask overrides for every pose. The example
   [recipe](../../artwork/kling-female-top/prepared/plum-pintuck-recipe.json)
   pins all 96 overrides and inputs by hash and builds through the existing
   strict garment recipe mechanism. Give each newly published design a new ID.
5. Review crossing hands, side-on run, crouch, apex, landing and raised arms in
   native-size crops and timed playback. Check both shorts. Item masks must
   retain source alpha and protect skin; each extra owned region needs a
   visible-cloth explanation and recorded bounds.
6. Import the resulting garment, mix it in the workbench, save and reopen the
   editable project, then export a baked CharacterPack. Close the editor and
   inspect all five actions in both directions in the independent player.

The new donor's first ivory binding did not follow moving openings and was
discarded. Its plum cloth, buttons and pintucks were retained. This is a concrete
example of a detail that requires visual judgment despite valid source anchors.

## What this does not cover

A new sleeve, exposed neckline, loose hem or dress silhouette needs new native
ownership and hidden-area artwork. The same standing donor and old masks cannot
provide those surfaces automatically. Cloth already inside strict head
protection cannot be painted over by this template. The blouse demonstrates
that limit on six fast jump poses; correcting that protection would be a
separate registration review with compatible assets and dedicated regression
evidence, not a silent exception in the garment importer.

Keep PNGs, masks, registration, recipe, provenance and actual exports together.
A thumbnail or GIF alone is not an editable clothing template.
