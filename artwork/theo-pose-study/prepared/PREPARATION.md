# Theo complete-character pose study: preparation

Run `node scripts/prepare-theo-pose-study.mjs` from the repository root. The script starts and closes its own Vite/Chromium instance; it makes no image-generation calls. Original sources and prompts live in `../source/`. `registration.json` records source SHA256, exact source polygons/landmarks, output SHA256, garment ownership decisions, motion keys and executable checks.

## Complete-model registration

The standing figure in source cell 1 is the master: binary alpha threshold 192, uniform nearest sampling at scale 0.484, source neck `(260,246)` registered to `(96,118)`, source ground y496 registered to y239. The visible head, torso, sleeves, hands, trousers and shoes come from that complete model. Parts are not independently squeezed to the previous narrow silhouette. The far shoe needs a two-pixel downward registration to put its sampled opaque sole at y239; it is not stretched. The master/gentle head is unchanged after this common registration.

The helper sheet contributes only the neutral/joyful complete heads and hidden torso/pelvis cloth. Whole helper heads use uniform scale 0.318, neck points `(232,916)` / `(639,916)` to `(96,118)`. Their ear/pupil/hair silhouettes differ slightly from the complete master; this remains a visible expression consistency limitation. No eye rectangles are erased or symbol expressions added. Explicit face/ear/neck material polygons prevent bright hair from being assigned to skin.

Helper arm and active-forearm cells are **unused**. The complete master already has compact curled hands, so the top has no action-forearm override and uses its ordinary full arm artwork for every action. Do not describe the unused helper cells as shipping animation attachments.

## Ownership and color

The torso owns its single coat hem. Misassigned whole-master hand fringe is removed from the torso, and duplicate coat pixels under the upper trouser parts are replaced with helper pelvis cloth or transparency. Hidden torso fill is restricted to underarms, excluding the visible central pants below the vest. No color is globally deleted. Source parts retain their own semantic masks for skin, hair, upper clothing, lower clothing and shoes; eyes, ivory trim, tie and boutonniere remain fixed.

All three new wardrobe items use version 3 / `colorModel: source-relative-v1`. At their declared source palette all 15 registered source slot RGBA arrays exactly equal the assembled source slots. Old wardrobe versions and source files are retained.

## Project-owned movement

The shared renderer and rig hierarchy are unchanged. New source hip annotations `(86,182)` / `(103,182)` sit inside the hidden pelvis, retaining measured knees and ankles. Compared with annotations at the visible trouser edges `(78,182)` / `(111,182)`, the standing rendered RGBA is identical. These annotations reduce the first contact's overlapping feet.

The final 12-key run remains 18 fps and loops. It uses lean 0.14, body bob `[5,7,5,2,0,3]` repeated, and the exact foot and arm arrays in `registration.json`. The farther back arm now swings behind its shoulder; the forward arm is capped at 0.55 radians so its fist stays below the face. The shortened character uses a smaller recovery lift than the old run. Both contact halves remain asymmetric because the two source hips stay horizontally separated; deep recovery still compresses the upper trouser mesh. This is a bounded bone-animation study, not reproduction of the five fully redrawn source run poses.

Only this project's jump keys 4–7 cap rootY from `[-3,-4,-4,-3]` to `-2`. The complete helper heads otherwise touch/cross frame row 0. No head reshape or ankle stretch is used. The final and `theo-study-old-run.rig.zip` comparator share this clearance change, identical art and source bindings; only their run clip differs. Idle and walk clips retain the previous project values.

## Checks and retained comparisons

Preparation executes all three expressions × 36 action keys (108 frames), checks frame-edge clearance, records source RGBA equality for 15 slots, verifies unchanged standing pixels after hip annotation and checks three face/skin masks. All checks are recorded in `registration.json`; actual UI export and independent-player checks belong to the separate final evidence report.

- `diagnostics/master-native.png`, `master-2x.png`: uniformly registered original complete figure; source evidence, not an application export.
- `diagnostics/master-standing-comparison.png`: source next to actual rig output.
- `diagnostics/run-keyframes.png`, `run-keyframes-2x.png`: actual current rig frames.
- `diagnostics/old-run/`: same final art with previous run.
- `iterations/01-initial/`: earlier source-registration candidate and manifest, before bounded source-mask and ownership corrections.
- `iterations/02-fixed-source-masks/`: candidate immediately before the inward-hip trial, including a complete recoverable project.

These iteration snapshots are historical retained candidates; the preparation script does not overwrite them. The final deliverable files are the top-level identity, three clothing ZIPs, final project and old-run comparator project.
