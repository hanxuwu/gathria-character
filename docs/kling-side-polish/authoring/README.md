# Source-bound side-view clothing tools

[`scripts/kling_side_tools.py`](../../../scripts/kling_side_tools.py) makes the
existing native painting workflow callable without writing a custom Python
driver. It reuses the frozen source loader, guide exporter and runtime-matching
protection raster from `kling_side_authoring.py`. It introduces no renderer,
animation format, registration change or generated anatomy.

## Generate painting guides

From the repository root, with Python, NumPy and Pillow installed:

```sh
# Review the known male hand/shorts contact at pack frame 26.
python scripts/kling_side_tools.py --identity male guides --action walk --frames 26 --output /tmp/side-polish/my-shirt-walk26

# Export an entire action in its original clip order.
python scripts/kling_side_tools.py --identity female guides --action run --output /tmp/side-polish/my-blouse-run

# Omitting --action and --frames exports all poses for that character.
# An explicit registration can also be selected BEFORE the subcommand.
python scripts/kling_side_tools.py --identity male --registration artwork/kling-side-workspace/registration/male/registration.json guides --frames 26 --output /tmp/side-polish/original-registration-walk26
```

The default registration is the current **tailored candidate**, loaded and hashed
at execution time. Each frame includes:

- The untouched native 512×768 RGBA source and a blank transparent painting layer.
- A separate fitting guide with 17 anchors, visible/uncertain limb hints and
  head/hand contours. Anchor confidence is recorded rather than treated as proof.
- Exact binary `protect-head`, `protect-nearHand` and `protect-farHand` PNGs.
  White means the source-visible pixel cannot belong to a garment. These masks
  use the runtime pixel-center polygon rule intersected with source alpha > 0.
- A separate translucent protection overlay. Its opacity is only for inspection;
  the binary masks contain the ownership contract.
- JSON with pack frame ID, original video/frame ID, action position, native
  source RGBA hash, source ZIP hash, registration hash, anchors, mask hashes and
  file hashes. `index.json` records the selected poses in original clip order.

`--frames` always means **pack frame IDs**, not original video frame numbers.
Unknown IDs, duplicates and IDs outside the selected action fail explicitly.
Output must be a new or empty directory, so rerunning cannot overwrite artwork.

See the retained [female run-49 guide](example-female-run49/female-run-frame049-source150-guides.png),
[locked source](example-female-run49/female-run-frame049-source150-source.png),
[exact protection overlay](example-female-run49/female-run-frame049-source150-protection-overlay.png)
and [source-bound index](example-female-run49/index.json). This one-pose example
is an authoring guide, not a dressed-character export or visual acceptance claim.

The [male walk-26 guide](example-male-walk26/index.json) uses the final reviewed
hand/shorts boundary from this polish. Its hashes identify the current male
registration; older template folders retain the preceding candidate's masks.

## Preflight a painted garment

```sh
python scripts/kling_side_tools.py --identity male lint docs/kling-side-expansion/assets/male-shirt.garment.zip --report /tmp/side-polish/male-shirt-preflight.json
python scripts/kling_side_tools.py --identity male lint docs/kling-side-expansion/assets/male-trousers.garment.zip --report /tmp/side-polish/male-trousers-preflight.json
python scripts/kling_side_tools.py --identity female lint docs/kling-side-expansion/assets/female-blouse.garment.zip --report /tmp/side-polish/female-blouse-preflight.json
python scripts/kling_side_tools.py --identity female lint docs/kling-side-expansion/assets/female-skirt.garment.zip --report /tmp/side-polish/female-skirt-preflight.json
```

The structured report checks current source/registration binding, complete and
unique pose coverage, declared ZIP members, bounded PNG/atlas decoding, integer
atlas/native bounds, binary ownership and visible paint outside ownership.
Head/hand overlap reports name the pack frame, action position, source video
frame, protected part, pixel count, native bounding box and sample coordinates.
Deliberate owned transparency can erase old cloth and is counted, not rejected.
Silhouette extensions within the native canvas are likewise counted.

Exit codes: **0** means the supported preflight passed, **1** means package
findings, **2** means a command/context/output error. A JSON report records the
exact inspected garment and registration hashes. Reports cannot overwrite a
registration, garment or unrelated existing JSON file. The command never edits
the inspected package or source. Existing reports from this CLI may be refreshed.

This offline command supports the side collection's **garment V1**. Other garment
versions are rejected as unsupported by this tool, not declared invalid for the
whole application. Browser import remains the authority for all supported formats.

## What a passing report does not prove

The tool checks declared ownership, not whether a protected polygon was drawn
around the correct anatomy. The male walk-26 shorts fragment is an example:
incorrectly protected old cloth can pass structural validation while still
looking wrong. Source-traced review is required to correct that boundary.

Neither a guide nor a passing preflight approves sleeve folds, fabric continuity,
front/back ordering, shoulder volume or animation naturalness. Paint and pack
with the existing helper, then inspect the real application at native size,
integer enlargement and normal playback speed. Save, reopen and export through
the real workflow before approving a garment.

## Current verification

```sh
python scripts/test_kling_side_tools.py
```

[19 current tests](tests.txt) cover real-source RGBA/protection guide roundtrip,
source-bound hashes, explicit erasure, missing/duplicate/unknown poses, nonbinary
ownership, protected source ownership, unowned visible art, both bounds, bad PNGs,
unsafe/duplicate ZIP members, decoded pixel limits, unsupported versions, frame
selection and refusal to overwrite existing artwork/JSON. These tests are
separate from the application's browser checks and visual review.

The female [blouse](female-blouse-preflight.json) and
[skirt](female-skirt-preflight.json) reports inspect 102 poses each; the male
[shirt](male-shirt-preflight.json) and [trousers](male-trousers-preflight.json)
inspect 107 poses each. The recorded hashes identify the actual checked banks
and candidate registration; reports are refreshed after final asset freezing.
