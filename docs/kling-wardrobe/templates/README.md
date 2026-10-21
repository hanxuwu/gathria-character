# Clothing authoring templates

These self-contained kits are for preparing new clothing offline on the two
approved Kling sprite sources. They are **not** ready-to-import garments or
wardrobe projects, and a single clothing PNG does not automatically fit every
pose.

| Kit                                    | Source frames | Decoded semantic masks |  ZIP bytes |
| -------------------------------------- | ------------: | ---------------------: | ---------: |
| [Male](male.wardrobe-template.zip)     |            88 |                    616 | 24,375,731 |
| [Female](female.wardrobe-template.zip) |            96 |                  1,056 | 27,675,089 |

Each kit includes:

- The exact original `source.character.zip`; no changed faces, proportions,
  frame geometry, anchors or motion metadata.
- The exact final `registration.json`, with 17 landmarks, source-frame identity,
  confidence/method notes and head/hand protection for every frame.
- Native semantic masks, complete frame/action index, a practical `GUIDE.md`
  and a per-file SHA-256 inventory.

All five motions—idle, walk, run, jump and celebration—are covered. Male guides
are binary grayscale; female guides preserve soft source coverage. These
semantic masks still need deliberate ownership/occlusion authoring before
becoming runtime garments. Empty masks for hidden hands or limbs are recorded
and allowed. Newly exposed hidden body surfaces require authored underpainting.

[Delivery inventory](inventory.json) records the ZIP hashes, source and
registration hashes, counts and verification results. The builder decoded all
1,672 masks from both their input files and delivered archives, decoded all
four source atlas PNGs, verified exact source/registration bytes and reproduced
each canonical ZIP byte-for-byte. These are technical checks, not acceptance
of a future garment's visual quality.

Run from the repository root. To reproduce preparation without overwriting
the frozen tracked registrations:

```sh
python3.12 -m venv /tmp/gathria-wardrobe-venv
/tmp/gathria-wardrobe-venv/bin/python -m pip install \
  -r scripts/requirements-kling-wardrobe.txt

/tmp/gathria-wardrobe-venv/bin/python scripts/prepare-kling-wardrobe-male.py \
  --source docs/kling-motion/exports/male.character.zip \
  --poses artwork/kling-wardrobe/registration/male/reviewed-poses.json \
  --output /tmp/kling-wardrobe-male-repro \
  --registration /tmp/kling-wardrobe-male-repro/registration.json

/tmp/gathria-wardrobe-venv/bin/python scripts/prepare-kling-wardrobe-female.py \
  --pack docs/kling-motion/exports/female.character.zip \
  --output /tmp/kling-wardrobe-female \
  --registration-output /tmp/kling-wardrobe-female-registration-check

/tmp/gathria-wardrobe-venv/bin/python scripts/verify-kling-wardrobe-female-registration.py \
  --masks /tmp/kling-wardrobe-female/masks \
  --registration /tmp/kling-wardrobe-female-registration-check/registration.json

sha256sum \
  /tmp/kling-wardrobe-male-repro/registration.json \
  artwork/kling-wardrobe/registration/male/registration.json \
  /tmp/kling-wardrobe-female-registration-check/registration.json \
  artwork/kling-wardrobe/registration/female/registration.json
```

Compare each regenerated registration with its tracked counterpart. If either
hash differs, review the new registration before replacing tracked data or
rebuilding its garments. Then package the exact tracked registrations with the
reviewed mask directories:

```sh
/tmp/gathria-wardrobe-venv/bin/python scripts/build-kling-wardrobe-templates.py \
  --male-prepared /tmp/kling-wardrobe-male-repro \
  --female-prepared /tmp/kling-wardrobe-female
```

The preparation directories are produced by the corresponding
`scripts/prepare-kling-wardrobe-male.py` and
`scripts/prepare-kling-wardrobe-female.py` workflows. Male preparation ends by
calling `scripts/refine-kling-wardrobe-male-masks.py`, which applies the
source-bound contours in
`artwork/kling-wardrobe/registration/male/reviewed-mask-corrections.json`.
Keep that step: it preserves the reviewed shoe ownership instead of falling
back to color segmentation alone. It checks source and registration hashes
and leaves the source pixels and joint registration unchanged. See
[the wardrobe format and workflow](../FORMAT.md) before preparing an item.
Do not reformat or edit a frozen registration JSON without rebuilding its
hash-bound garments and template.

Preparation was verified with CPython 3.12.14, Pillow 12.3.0, numpy 2.3.5,
scipy 1.17.0 and opencv-python-headless 5.0.0.93 (`cv2` reports 5.0.0).
Exact package pins are in
[`scripts/requirements-kling-wardrobe.txt`](../../../scripts/requirements-kling-wardrobe.txt)
and each kit's `requirements.txt`. The original execution loaded OpenCV using
`PYTHONPATH=/tmp/kling-wardrobe-python`; a virtual environment with those pins
can replace that temporary path. The template packaging script itself needs
only Python and Pillow because it copies already prepared masks unchanged.
The review-sheet scripts use DejaVu Sans at
`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`; install that font or adapt the
review-sheet font path on another platform. The actual semantic masks do not
contain rendered text.
