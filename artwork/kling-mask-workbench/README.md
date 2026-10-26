# Source-bound neckline cloth review

This is a deliberately small native-cloth permission profile and a set of
reviewable RGB proposals for the existing Kling female **Plum pintuck blouse**.
It supports the browser mask workbench; it is not a new character, a global
skin classifier, or a claim that all neckline defects are solved.

The original 704 × 1056 source frames, ground anchor (352, 998), source pack,
registration, head and hand polygons, old garment archives and action schedules
are unchanged. The profile is bound to their exact source and registration
hashes. A new garment version must explicitly opt into this fixed profile.

## What is authorized

`female-neckline-cloth-v1.json` contains sorted, disjoint inclusive scanline runs
for **2,053 pixels** of clearly visible original vest cloth that lie inside the
old conservative head polygon. Those exact pixels are the exception; the rest
of the head and all hands remain protected. A loaded garment cannot supply an
arbitrary replacement permission map.

| Native pose | Protected cloth pixels | Proposed RGB pixels | Remaining visual limit |
| --- | ---: | ---: | --- |
| 89 | 81 | 81 | Warm motion-blur fringe below the neck remains |
| 90 | 188 | 301 | Soft gray inner neckline band remains; it cannot safely be treated as entirely cloth |
| 93 | 24 | 24 | A thin lower cloth highlight remains around the original dark neckline |
| 101 | 375 | 400 | Inner blur edge and some small old boundary flecks remain |
| 102 | 150 | 166 | Narrow lower fringe remains |
| 103 | 1,235 | 1,418 | Large right gray wedge is reduced; thin inner/lower slivers remain |

The additional **337 proposal pixels** are explicitly traced, unprotected vest
cloth that the old garment did not own. They do not enlarge the protected-area
exception. All proposed pixels were originally opaque and all original alpha
values remain unchanged.

## How these decisions were made

Native original source and current clothing were inspected side by side, with
coordinate grids and the existing protected polygon overlay. The first attempt
applied an overly conservative local chroma exclusion to every trace. It left
disconnected gray fragments. The second bounded iteration uses contiguous
source-reviewed cloth contours, especially the clear right strap/wedge at pose
103. Only pose 93 retains a local ink exclusion to preserve its dark neckline.
Color thresholds do not grant runtime authority or define skin globally.

Ambiguous skin/cloth blur stays outside the reviewed trace. These labels are
specific authoring judgments on the six inspected source drawings, not inferred
ground-truth anatomy. The first attempt was rejected; the retained second
proposal is a partial improvement. No third painting round is presented here.

The proposal RGB comes from the **existing** recorded plum donor and its
published cloth shader, evaluated at the same donor coordinates beyond the old
mask. The generated donor's anatomy, alpha, background and skin are never used.
There was no new image-generation call. Source and donor hashes are recorded in
`authoring-review.json`.

## Files and reproduction

- `female-neckline-cloth-v1.json`: immutable source-bound runtime permissions.
- `female-plum-neckline-seeds.json`: explicit native RGB proposals, with source,
  registration, base garment and profile hashes. Each pose still needs explicit
  review and acceptance in the workbench.
- `permission-NNN.png`: transparent native diagnostic masks of the protected
  cloth exception only. `proposal-NNN.png`: native RGB/alpha proposal pixels,
  including the separately traced unprotected cloth.
- [Six-pose original/current/permission/proposal board](cloth-permissions-and-proposals-2x.png):
  integer 2× crops. [Pose 103 at 1×](source-103-comparison-1x.png) and
  [2×](source-103-comparison-2x.png) show the main improvement and remaining fringe.
- [Neighbor source context](neighbor-source-context-1x.png): native-size crops
  from existing source poses, without retiming or regeneration.
- `source-constraint-verification.json`: independent archive decode and
  pixel-center polygon checks. It verifies 2,053 allowed head-cloth pixels,
  2,390 proposed pixels, zero unauthorized protected changes, zero hand changes,
  exact alpha and exact pixels outside proposals. It is not visual approval.

```sh
python scripts/prepare-kling-neckline-review.py
python artwork/kling-mask-workbench/verify-authoring.py
```

Both scripts use the existing Python image dependencies. These are **offline
authoring diagnostics**, not application exports. Browser PNG/GIF/CharacterPack
evidence belongs in the workbench feature's delivery documentation.

## Cross-frame propagation limits

Shoulder and neck guides are useful for an initial spatial suggestion, but they
are not exact motion capture. The female neck guide moves from `(456, 599)` in
pose 89 to `(441, 530)` in pose 90 and `(395, 414)` in pose 93. A source patch
translated using one guide can cross the neckline or move onto skin. Suggestions
must therefore be clipped to each target's actual allowed cloth region and
reviewed independently. An empty/clipped proposal is a legitimate result; it
must not broaden permissions or count as a successful automatic repair.

These six authoring proposals are independently reviewed pose-specific seeds.
They must not be presented as six automatically propagated repairs from one
frame. The workbench's separately captured propagation demonstration records
which source seed and transform produced each suggestion.
