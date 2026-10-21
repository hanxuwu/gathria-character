# Original-frame motion flow candidate

This batch uses only the existing male/female Kling CharacterPacks. It creates
no artwork, extracts no new video frames and does not extend the skeleton.
The original packs and the earlier 52-drawing loop candidates remain intact.

`selection.json` pins both source archives and earlier candidates by SHA-256.
Each selected drawing records its source frame, motion phase and hold duration.
Each route records the last source pose shown before switching, the first target
pose, and the reason for choosing that boundary. The compiler converts those
frame IDs into playback positions after verifying the actual hold sequence.

## Why frames were restored

Male walk had four three-tick holds during the second stride half. Restoring
37, 40, 43 and 46 reduces those stalls while retaining the 27-tick source clock.
Female walk changed more visibly around contacts and passing; it now retains
all 27 drawings except 29 and 42, with two-tick holds at 28 and 41.

Run retains all 16 original drawings for each character. The omitted frames
carried substantial fast limb/body motion, so holding their predecessors made
the cycle visibly step. Celebration similarly restores male 71/73/78/80 and
female 71/73/79/81 during arm ascent and descent. Idle keeps four subtle rest
poses. There is no uniform frame deletion or target of exactly 52 drawings.

Jump restores the full original 83–121 sequence, including upright recovery,
and plays once. The previous crouched-hop loop stays available as a separate
candidate. These are two different playback choices, not a silent upgrade of
the old loop pack. Male now has 88 distinct drawings; female has 96.

## Reviewed action boundaries

Male walk→run uses 34→55 or 48→63; the reverse routes use the same support halves.
Female walk→run uses 34→55 or 46→63; run→walk uses 55→35 or 63→47. Entering run
at its original first frame51 would enter flight; reviewed entries use support
poses. Stopping or beginning jump waits for a corresponding support phase.

Jump exits only after frame121's complete duration. Without another request,
the supporting player returns to idle0. Celebration exits after lowered-hand
frame82. Idle can leave at the end of any of its four rest holds, at most 250 ms
away at normal speed. There are 40 explicit routes per character covering all
20 distinct action pairs; paused inspection still switches immediately.

These are reviewed cuts between existing drawings, not newly drawn transitions.
Jump83 already starts partly crouched, celebration67/82 still have raised hands,
and walking changes torso angle. Scheduling cannot invent missing neutral poses
or repair the source blur and jump-apex scalp clipping.

## Reproduction and portable contract

`python3 scripts/compile-kling-motion.py` writes existing-format CharacterPack V3
files with two bounded atlas pages. Every selected 704×1056 RGBA crop matches its
original exactly, including transparent RGB. Anchor (352,998), source IDs and
24 FPS are unchanged. Additional pages preserve native dimensions rather than
shrinking the approved art. ZIP creation is deterministic.

Optional `character.json` → `sourceMetadata.motionFlow` contains exact action
snapshots, source-tick exit boundaries, target-tick entry positions and the
jump-to-idle rule. Editing any action invalidates this profile; the app falls
back to ordinary playback. Other V3 consumers still play the standard clips and
hold the one-shot jump's final frame if they do not implement the optional rule.

[Actual exported comparisons](../../docs/kling-motion/README.md) ·
[Implementation and verification](../../docs/KLING_MOTION_REVIEW.md).
