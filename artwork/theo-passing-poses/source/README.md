# Complete bent-leg source

One OpenAI image-generation call on 2026-10-18 UTC produced
`complete-bent-leg.png`. The untouched 1536×1024 PNG was copied from
`/workspace/generated_images/exec-1628bda1-5e25-4fcc-af0a-9b881683cff2.png`.
The tool was requested to preserve a transparent background. Exact prompt:
[`complete-bent-leg.prompt.txt`](complete-bent-leg.prompt.txt).

Inputs were the retained
[`complete-pose-model.png`](../../theo-pose-study/source/complete-pose-model.png)
and [`first-candidate-parts-4x.png`](first-candidate-parts-4x.png), a diagnostic
integer-zoom view of the first candidate's isolated leg/boot parts. Only the new
isolated trouser leg is generated; head, torso, arms,
anatomical rig, motion and side-profile shoe source remain from the existing
project. This is development-time AI-assisted source art, not runtime generation
or actual-export evidence.

The prompt retains an early diagnosis that the first candidate's pointed flap
came from its upper cut. Later UV tracing identified that visible point as a
skewed distal cuff; deep recovery also inverted weighted triangles. The exact
prompt is retained rather than rewritten after generation. Registration and
evaluation use the corrected diagnosis.

Preparation uses measured source joints, uniform nearest-neighbor sampling,
binary alpha and lower-clothing ownership. See the parent source record and
`prepared/registration.json` for final coordinates, hashes and retained trials.
