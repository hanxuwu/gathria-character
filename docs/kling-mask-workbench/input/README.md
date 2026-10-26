# Reviewed neckline example drafts

These two JSON files are authored **inputs**, not application exports and not
proof of automatic propagation. Both bind to the exact original female source,
registration and Plum pintuck V1 garment. Every pose starts **pending**.

- `seed-103.mask-draft.json`: the reviewed cloth proposal for pose 103 only.
- `reviewed-neckline.mask-draft.json`: six separately reviewed manual proposals
  for poses 89, 90, 93, 101, 102 and 103.

Their RGB pixels come directly from
`artwork/kling-mask-workbench/female-plum-neckline-seeds.json`; no additional
painting or generated anatomy is introduced by these wrappers. The source of
that cloth painting and the conservative protected-cloth permission map are
recorded beside the artwork. Source blur and thin ambiguous fringes remain.

To open one, wear **Plum pintuck blouse**, choose **Jump**, stop at **source pose
103** (timeline position 20 / displayed frame 21), and open **Fitting guides →
Edit clothing mask**. Enable **Include reviewed neckline cloth** before opening
the draft. Inspect each proposed change and explicitly accept or reject it.
Neighbor propagation is a separate operation in the workbench; it does not mark
its proposals accepted or claim that the six manual examples were inferred.

The production capture records the seed proposal, actual neighbor suggestions,
a restore brush and exact undo, draft save/reopen, six explicit acceptances and
a pending neighboring proposal excluded from the new clothing. Actual exported
drafts and clothing belong to that run's evidence directory, not this input folder.
