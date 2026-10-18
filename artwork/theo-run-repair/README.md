# Theo run repair — source ownership and motion

This bounded follow-up starts from the immutable Theo study project at `1ab97c5`.
The complete character, expressions, limbs, suit design, proportions and source
colors are retained. No image-generation call or new illustration is used.

Run `node scripts/prepare-theo-run-repair.mjs` from the repository root. The
script opens its own local Vite/Chromium instance, imports
`artwork/theo-pose-study/prepared/theo-study.rig.zip`, derives a new top item,
and exports a self-contained editable project. It never rewrites the input
project or any existing source/evidence directory.

The new top uses `custom-theo-run-top`; identity, trousers and shoes keep their
existing IDs and exact source bytes. The new top remains wardrobe item V3 with
`source-relative-v1` coloring. Both PNG and semantic mask are carried in its
portable ZIP. New motion data is opt-in via `run-motion.json`; absence of that
file produces an isolated shoulder repair with the previous motion.

## The shoulder defect and its repair

The standing illustration assigned the near sleeve's cap exclusively to the
moving arm, while the torso ended at its inner edge. During a forward swing,
the sleeve rotated away and exposed an undrawn triangular region below the
hair, between shoulder and collar. The defect exists in source ownership and
occlusion coverage, not GIF ordering or source palette conversion.

The selected second candidate adds **113 previously transparent torso pixels**
inside a small proximal-shoulder polygon. Every pixel copies exact RGB, alpha
and material 3 from the same source near-upper-arm cloth. A nearest same-cloth
sample supplies the short hidden allowance above the extracted cap. Existing
opaque torso pixels are never repainted. Eight explicitly identified misplaced
hand-fringe pixels are removed as described below. The moving arm, cuff, hand, hair,
collar and all lower-body source arrays stay byte-identical.

The coverage belongs to the torso, behind the near arm and head. It is present
in the authored source part before rendering, so it follows torso motion and
recolors through the same portable item contract. There is no final-frame
hole painting, color deletion, silhouette mask or conditional background fill.

`prepared/registration.json` records the source hash, exact polygon, all 113
source/target pixel coordinates and copied material/color values, generated
file hashes, source equality checks and per-frame differences. The first,
narrower 77-pixel candidate is retained under `iterations/01-inner-cap/`; it
left a small upper gap and is not the shipping top.

A second defect became visible with the new upper-body motion: eight detached
skin pixels at source x61–62 / y179–182 had leaked from the complete standing
hand into the torso extraction. Those exact pixels are removed from the new
top only; original RGBA and material values are recorded separately in
`ownership.removed`. This is a local part-ownership trim, not a skin-color
filter. The real hands and every forearm remain unchanged.

`iterations/02-first-centered-run/` retains the recoverable first V2 project
before recovery-trajectory tuning and this eight-pixel ownership cleanup.

## Non-running review

The old idle, walk and jump motion keys remain unchanged. The isolated
113-pixel shoulder repair gains only 27–52 pixels at the pre-existing gap. The separate ownership cleanup can also remove up
to eight detached hand-fringe pixels at the lower coat; detailed per-frame
counts are recorded by preparation. No valid coat silhouette is cut away.
Differences remain localized to the shoulder and detached hand fringe, not the
face, neck anatomy, body height or clothing design. This is an intentional seam repair, so these new-item frames are not
claimed pixel-identical to the previous item's frames. The previous project
and top are still reproducible and never silently upgraded.

Source diagnostics under `prepared/diagnostics/` show full frames and an
integer-zoom shoulder comparison. They are preparation diagnostics rendered
through the real skeleton, not a substitute for final Studio export evidence.
The separate delivery review contains UI exports and independent playback.

## Lower-body scope

No trousers, knees, ankles or shoe art is repainted in this batch. Inspection
found no clear foreign cloth ownership to remove. The crowded recovery pose
comes from the two stride trajectories and deep joint compression; the
project's opt-in motion contract addresses the trajectory/support relationship.
The existing weighted mesh still has limits under extreme folding. Full
redrawn bent-knee silhouettes remain a possible later milestone.


## Selected project motion

`run-motion.json` is the complete opt-in MotionLibrary V2, with the previous
idle, walk and jump clips retained exactly. The final recovery trial changes
only zero-based run keys 7–9 from the first centered candidate: footX
`[-18,-3,11]` becomes `[-10,4,15]`, and footLift `[17,14,10]` becomes
`[16,17,11]`. Twelve keys, 18 fps, arm-angle keys, main lean and source anatomy
remain stable. The separate upper-body lean is at most 0.018 radians. The
runtime V2 reset defaults intentionally represent the baseline centered clip;
resetting the project discards its local recovery tuning and can be undone.

The second centered candidate is selected, with no additional lower-body art
iteration. It improves phase alignment and moves the recovering boot farther
forward, but the ninth key still has visible near/far boot overlap. The short
legs and broad authored boots make the weighted 2D passing pose a remaining
visual limitation. It is not claimed to be a fully redrawn or overlap-free run.
A short flat dark backing near the collar is also visible in some poses;
it is preferable to the previous open background wedge, but is not a claim
of perfect anatomical rendering.

`prepared/diagnostics/run-inspection.json` records actual posed joint/mesh
inspection. The preparation GIF uses the twelve real renderer frames and a
670 ms loop after GIF timing quantization; it is labeled preparation evidence,
not an application export. Final Studio/consumer evidence is delivered
separately under `docs/theo-run-repair/`.
