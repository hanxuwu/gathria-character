# Female daily blouse and skirt

The two independent V1 layers are `side-female-cream-blouse-v1` (top) and
`side-female-rose-skirt-v1` (bottom). They preserve the frozen native 512×768
source frames, source timing, pose, face, head, hands, and every uncovered pixel.
The source supplies the left-facing mirror at playback.

The cream blouse has a new short gathered sleeve, rounded collar, and button
placket. The dusty rose skirt has a separate waistband and continuous painted
folds and hem. It covers the original shorts and upper legs as the pose requires.

Eight blouse pose donors and six skirt pose donors were painted with OpenAI
image generation. The final skirts were generated as complete isolated cloth
sprites, so the garment does not retain hand-shaped fill patches from the
original design sheet. Generated skin, heads, hands, shoes, and background are
discarded. Exact prompts, source artwork, isolated cloth masks, and file hashes
are in `artwork/kling-side-expansion/female/source/`.

`scripts/prepare-kling-side-female-clothing.py` fits authored cloth offline using
bounded garment transforms. The skirt retains a coherent donor throughout each
action (standing/walk/run 0, jump 79), so passing poses cannot switch the
whole fold pattern or hem design. Blouse frames 40 and 47 use the same reviewed
backwards-arm donor as their neighbors. The source
body is never transformed. This is a finite painted donor workflow, not 102
independently painted clothing drawings. The runtime receives only sparse
prepared pixels and binary ownership masks.

The skirt hem depth and width use smooth source-pose curves across each action
and around looping boundaries. The skirt fold pattern remains stable inside each clip; its shape still responds
to the original smoothed pose curves. Switching between actions can still change
the skirt shape, and blouse pose donors still change. This is an authored
approximation, not cloth simulation. The current bounded continuity pass and
its same-frame evidence are documented in [female polish](../../kling-side-polish/female/README.md). Forward-arm blouse regions hidden in the design reference are
completed from the standing donor's painted bodice before fitting.

`hardposes.jpg` covers idle, forward-arm walk/run, crossed legs, raised arms,
airborne motion, and crouching. The action contact sheets cover all 102 source
frames. The source-bound pack audits under
`artwork/kling-side-expansion/female/` verify native coverage, protected pixels,
and exact source pixels outside ownership.

The `*-motion.gif` files are review previews at half size. GIF duration is
rounded to 10ms; the garment packs retain the original runtime timing at 24fps.
