# Side-view hair candidates

One chestnut hairstyle per source: **Soft side sweep** (`side-swept-crop`) for the male and **Soft tucked bob** (`side-tucked-bob`) for the female. Each appearance V1 bank has front and back layers covering every native pose: 107 male and 102 female. Both retain the original 512 × 768 envelope, with zero padding. Existing espresso/copper tinting changes only the authored hair.

The original source packs, four actions, frame IDs, 24 FPS timing, anatomy and expressions remain unchanged. No face layer is included. Bank IDs are `kling-side-male-hair-v1` and `kling-side-female-hair-v1`; final source/registration/bank hashes are in the adjacent `*-audit.json` files.

## Artwork and reproduction

The OpenAI image-generation donor sheet was made on 2026-10-29 from exact male/female side-source frame 0 references. The original donor and complete prompt are under `artwork/kling-side-expansion/hair/source/`. Explicit donor-coordinate hairline polygons and binary masks exclude its generated face, ears, skin and clothes. The portrait itself is provenance only; only the masked hair enters the banks. Derived RGBA cutouts and all bulk trials are reproducible scratch files under `/tmp/side-expansion/hair/`.

Run `python scripts/prepare-kling-side-hair.py` with numpy, Pillow, OpenCV and SciPy available. `--prototype` produces scratch review frames; `--character male|female` limits a run. Final builds require the separate corrected registrations at `artwork/kling-side-expansion/templates/*.registration.json`. The source loader still verifies the frozen original packs and original registration bytes before applying that explicit candidate binding.

Hair-only fitting combines source-head feature registration with a bounded crown-silhouette correction for jump squash. It never transforms original source pixels. An explicit opaque facial core trims overlong donor fringe tips away from brows, eyes, nose, mouth and cheeks. Native source visibility determines front/back assignment, and original non-head silhouette plus the corrected hand registrations provide foreground occlusion. The final hair's RGB channels are rounded by at most one 8-bit value to compact the atlas; original source channels and new-hair alpha are unaffected by that rounding.

## Evidence and limits

Each character directory contains all-action contact sheets, selected native head closeups, and original/hair pairs including difficult first and second jump poses. Review covered all 209 frames in larger scratch sheets, with particular attention to source ear outlines, scalp coverage, nape tips and raised hands.

`face-preservation.json` records a per-pose facial-core polygon and original/render RGBA hashes. All original opaque core pixels and original opaque registered foreground pixels must remain byte exact. Original antialias silhouette pixels are excluded from this core proof because rear hair naturally changes their transparent background. `boundary-preservation.json` compares every original RGBA pixel outside the authored hair, including invisible RGB, and records each hair bound and native canvas edge clearance. These are numerical ownership checks, not a claim of perfect visual quality.

The styles follow the native head with a fitted illustrated donor; the bob has no independently simulated secondary motion. The most compressed, blurred jump drawings can make new hair look slightly crisper than the original face. Small nape tips and a narrow rear scalp transition in the deepest male blink pose remain visible at close inspection. The original arm and shoulder edges can make the bob's lower overlap look abrupt during raised-arm poses; those original anatomy pixels are retained. No additional hairstyle or face synthesis is included.
