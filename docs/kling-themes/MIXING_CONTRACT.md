# Assets required for independent clothing across themes

This is the next-stage authoring contract, not a claim that the pixel theme
already supports independent garments. The current theme UI selects complete
`base` or `wedding` look banks. Both themes have corresponding look IDs, and a
missing look remains unavailable rather than being silently replaced.

The original wardrobe already combines matching clothing and appearance layers.
Its native registration and ownership masks are tied to the original source
hash. The authored pixel frames have different drawings, dimensions and frame
IDs. Original clothing cannot be pasted onto those frames merely because the
character or outfit has the same name. CharacterPack V4 currently contains baked
pixels; it does not imply editable clothing support.

## First useful authoring batch

Start with one male and one female pixel base, each with a top, bottom and shoes
that can be worn independently. Validate those parts on all five existing
actions before expanding the catalog. A wedding dress belongs to `fullBody` and
is mutually exclusive with separate top/bottom garments. Full-body looks must
not be labeled as three independently replaceable pieces.

Each supported theme needs its own matching drawings. The eventual outfit
selection should retain semantic garment IDs across themes, while resolving to
theme-specific revisions and source hashes. If any selected item has no matching
variant, show that exact unavailable item and retain the requested outfit; do not
mix smooth and pixel layers or silently choose another garment.

## Required material for every supported pose

For every unique frame referenced by idle, walk, run, jump and celebrate:

- An immutable source frame and reviewed native-frame registration: neck,
  shoulders, waist, hips, elbows, wrists, knees, ankles and toes. Mark hidden
  anchors as estimated/occluded; never present them as extracted joints.
- A transparent replacement patch for each garment, plus a pixel-aligned
  ownership mask that covers only that garment's old pixels. A simple bounding
  rectangle or global color removal cannot establish ownership.
- Reviewed sleeves, cuffs, waist overlaps and shoe/hem overlaps, including the
  underpaint needed when an arm lifts or a leg separates. Hidden clothing and
  skin missing from the source must be authored and recorded as such.
- Protected head/face and hand regions with explicit near/far occlusion. A sleeve
  may cover an approved part of a hand protection region; it must not gain
  permission to repaint the face, ear or hairstyle.
- Declared attachment order and exceptional overlap masks where a garment
  crosses hands, legs or another garment. A single global stack is insufficient
  for every crossed-arm or skirt pose.

Left-facing playback can mirror the complete accepted right-facing composition,
using the existing contract. It still needs visual inspection: mirrored glyphs,
asymmetric accessories and intentional handedness need an explicit future design
decision, not an accidental side effect.

## Version and export requirements

Keep the approved complete-look packs and old sessions reproducible. New layered
materials must bind to an exact source and registration revision. A changed
source bank must not reuse an old immutable key/hash, and existing baked V4
imports must not become editable merely by dropping the current wardrobe guard.

The editing project needs the selected semantic IDs, resolved material revisions,
source, registration, patches, ownership masks and appearance protection. The
portable playback CharacterPack remains a deterministic baked composition, with
the same declared action order, timing, anchors and facing behavior. Independent
playback must not require the editor or a runtime image-generation service.

## Acceptance before exposing mixing controls

Use actual application exports to compare the unchanged base with every initial
combination. Inspect native size, integer enlargement, all frames and repeated
playback in both directions. Check the neck/shoulder, cuffs/hands, waist,
hip/skirt and ankle/shoe boundaries through the complete cycle, including the
first/last transition. Test saves and reopening, missing-material behavior and
the exported pack after closing the editor.

Hash checks, decoding and timing tests establish technical integrity. They do not
prove that an ownership mask or new garment looks correct. Do not count a
full-outfit preview, recoloring, a static pose, or a synthetic test fixture as
evidence of independently interchangeable five-action clothing.
