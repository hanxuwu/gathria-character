# Side-view garment fitting and contact refinement

This candidate builds on PR #53 at `220ea2f`, on the separate branch
`feat/kling-side-fitting-workbench`. Original Kling source artwork, frame IDs,
24 fps, dimensions and timing remain unchanged. The prior draft stays unmerged.
[Plan and contracts](PLAN.md) · [Baseline hashes](baseline.json).

## Open the tools

Start the app and choose **侧视新款试装与发型**, or open:

- `/workbench.html?character=male&mode=side-view&collection=tailored`
- `/workbench.html?character=female&mode=side-view&collection=tailored`

Below the stage choose **服装校正 · 锚点与遮挡**. It pauses movement and opens
original, isolated garment and complete-look views. The 17 anchor markers are
alignment references; they do not deform the source body. Purple/orange regions
show original head/hand protection. Choose a worn garment, action and frame,
then inspect native 1×/2× views or run the full action audit. The audit describes
pixel islands and area changes, including loop seams; these are review prompts,
not an artistic verdict.

**局部校正** reuses the existing source-bound mask tools: sample existing cloth,
repair clothing or restore original pixels, undo/reset, explicitly accept poses,
and save/reopen a draft. Preview both directions before applying a new garment.
Save the resulting wardrobe project or export the existing CharacterPack format.
The original garment stays in the project. [Tool behavior and checks](workbench/README.md).

This is local sprite fitting, not an automatic clothes generator. Each repair
draft supports up to eight accepted poses and preserves the source alpha.
New silhouettes or painted folds need appropriate artwork. A neighboring-frame
guide ZIP is an authoring reference, not a playable CharacterPack.

## Visual changes

- [Male sleeves](male/README.md): cloth-only shoulder-cap guides improve the
  compressed second-jump passage. The body and canonical joints do not move.
- [Female sleeves](female-arm/README.md): independent fitting of existing painted
  sleeves keeps their volume coherent through the running cycle.
- [Female skirt](skirt/README.md): source-traced foreground arms restore the
  forearm edges where skirt ownership had covered original skin and ink;
  one pleated drawing follows jump poses, with its upper hip fitted to cover
  the original shorts envelope using painted cloth instead of a flat color strip.
- [Male nape](hair/README.md): a bounded lower-hair correction removes a small
  exposed scalp strip in one pose, with ear and face artwork preserved.

## Loading and validation

[First-load measurements](performance/README.md) isolate cooperative scheduling
against identical frozen assets. Every integrity, ownership and pose check stays
in place. Long individual synchronous ZIP/PNG operations are a remaining limit.

Current export evidence and integration checks are recorded in [QA.md](QA.md).
Historical results remain in their original documentation and are not counted
as this iteration's tests.

## Actual exported review

| Review                    | Male                                                                    | Female                                                                      |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Running before / after    | [Right](review/male-run-right.gif) · [Left](review/male-run-left.gif)   | [Right](review/female-run-right.gif) · [Left](review/female-run-left.gif)   |
| Jumping before / after    | [Right](review/male-jump-right.gif) · [Left](review/male-jump-left.gif) | [Right](review/female-jump-right.gif) · [Left](review/female-jump-left.gif) |
| Walking regression        | [Right](review/male-walk-right.gif) · [Left](review/male-walk-left.gif) | [Right](review/female-walk-right.gif) · [Left](review/female-walk-left.gif) |
| Native key poses          | [PNG](review/male-keyposes-native.png)                                  | [PNG](review/female-keyposes-native.png)                                    |
| Integer 2× details        | [PNG](review/male-details-2x.png)                                       | [PNG](review/female-details-2x.png)                                         |
| Independent CharacterPack | [ZIP](review/male.character.zip)                                        | [ZIP](review/female.character.zip)                                          |
| Editable wardrobe project | [ZIP](review/male.wardrobe.zip)                                         | [ZIP](review/female.wardrobe.zip)                                           |

[Pair: walk → run → original two jumps](review/pair-walk-run-two-jumps.gif).
This is a presentation sequence of exported frames. Interactive switching is
verified separately by browser tests; the GIF does not add new transition poses.

Closed-workbench independent player evidence:
[male](review/male-hair-independent.png) · [female](review/female-hair-independent.png).

Visual limits remain: female run40's small forearm/cuff cut, some original
neckline/armhole fragments, source blur/matte fringes and donor variation.
The skirt's motion is calmer, and the original jump ends crouched.
See [technical checks and visual verdict separately](QA.md).
