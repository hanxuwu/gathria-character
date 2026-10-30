# Fitting review workflow

This iteration extends the existing **服装校正 · 锚点与遮挡** panel. It does not
replace the original Kling sprites, anchors, motion timing or previous mask tools.

Open `/workbench.html?character=female&mode=side-view&collection=tailored`
(or `character=male`), then **服装校正 · 锚点与遮挡** below the stage.

## Inspect a transition

Choose an action and pose, then **比较前一帧、当前帧与后一帧**. The three views
use the same native canvas and scale. Choose either the actual complete outfit or
isolated garment. Anchor/protection overlays stay in the separate original views;
the neighbor strip contains unmarked rendered artwork. Native zoom initially centers
on the registered torso instead of empty canvas corners; subsequent scrubbing
preserves manual panning. Previous/next buttons
follow the action's real frame list. Loop boundaries are labeled **循环交界**;
the original one-shot jump never wraps its last pose back to its first.

Run **检查这件服装的全部动作** to see local collar, sleeves, cuffs and hem
review prompts in addition to the existing ownership and island checks. Clicking
an action/pose opens its neighbor comparison. **修正此帧** goes directly to the
existing mask workbench at that action/position. At most two local explanations
are expanded in the strip; the full diagnostic data remains in the audit JSON.
Automated scores identify things to inspect; they do not certify visual quality.

## Know what is saved

The panel explicitly distinguishes:

1. Inspection of the current project.
2. A local correction draft, not yet applied.
3. A candidate preview, before replacing the current project.
4. An applied correction that still needs a project download.
5. The current project's ZIP download has been initiated.

The last state is tied to the exact project identity passed by the parent only
when the ZIP was generated and its download initiated. It does not claim the
browser has finished writing a file. Keep the downloaded project to reopen it.
Changing the project invalidates that status. Existing draft save/reopen and
candidate left/right preview remain available.

## Reuse a fitting reference

Expand **复用服装定位模板** and choose **导出当前邻帧模板**. The JSON describes
the current pose and its available neighbors, the original source/registration,
and the donor's wearing slot. It contains no transplanted clothing pixels.

Wear a compatible garment, then **打开定位模板**. The validation checks the same
source, registration, dimensions and slot. Click the imported pose links to inspect
the target garment, or **导出当前服装的模板绘制包** to prepare its existing artwork
and masks for the established painting workflow. A template from the other
character is rejected; current clothing stays unchanged. See the
[template contract and reuse evidence](../templates/README.md).

## Verification scope

`tests/e2e/side-fitting-refinement.spec.ts` covers native strip/current-view pixel
identity, both loop edges, jump endpoints, row-to-repair navigation, unchanged
stage PNG exports, narrow-screen integer zoom, template reopening, exact target
artwork/registration in the guide ZIP, and rejection of another source.

The pre-existing fitting browser workflow also checks the newly displayed applied
and download states while exercising correction, save and reopen. Current-run
results and screenshots are recorded by the integration verification; historical
browser results are not counted as new tests.

An initial browser run passed both new cases and the existing male correction/save
case. The existing female case lost its panel during concurrent development-module
replacement and timed out at its first guide toggle; it did not reach its assertions.
Visual inspection also found that mobile 2× zoom initially showed empty canvas
corners. The panel now centers native zoom on the torso, and the new browser test
checks that the visible viewport actually contains rendered pixels. The final frozen integration run passed all four fitting cases (within 14 integration cases). [Actual panel screenshots and verification](verification.json) record native neighbor identity, mobile visible art, applied/download state and save/reopen. Initial interrupted evidence is not counted as final acceptance.
