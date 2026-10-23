# Supplementary cloth, not replacement characters

OpenAI image generation edits made 2026-10-23 from actual application exports:

- `sleeve-donor.png` from
  `docs/kling-polish/evidence/waist-v6/male-male-wedding-after-86-right.png`.
  Requested rounded elbow folds and small ivory inner cuffs on the same pose.
  Only traced navy sleeve cloth and a narrow ivory cuff sample are used.
- `waist-donor.png` from
  `docs/kling-polish/evidence/waist-v6/female-female-day-after-86-right.png`.
  Requested softly gathered compressed waist folds without a changed silhouette.
  **Both fitted waist trials were rejected. No female archive is published.**

The generator changed anatomy subtly and added a glow despite a transparent
background request. Neither anatomy nor background from these donors is used.
The original Kling head, skin, hands, alpha, ownership, anchors, action frame
order and timing stay exact. The donor images are not final character exports.

`scripts/prepare-kling-fit-workflow.py` records baseline/donor hashes, continuous
pose-derived weights and per-pose changes. Existing shirt cloth receives a
narrow shaded hem on the clothing side of its original short-sleeve cut.
Jacket elbow cloth is sampled from the supplementary painting inside existing
ownership; source hand masks locate a narrow inner cuff behind the wrist.

Trial 1 over-wrapped the cuff around the fist. Trial 2 limits it to the wrist's
elbow side. Waist trial 1 brought a dark outer edge into the interior; trial 2
still created a pale fleck and broken fold. Retain the released dress V6 after
two failures. Further improvement needs precisely painted pose-local waist
patches with adjacent-pose continuity, not another global sampled donor band.

Offline candidate boards are labeled OFFLINE. Delivered review GIFs/PNGs come
from browser-exported CharacterPacks, separately validated under
`docs/kling-fit-workflow/`.
