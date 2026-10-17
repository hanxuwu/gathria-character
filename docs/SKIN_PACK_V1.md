# Preparing another character for the shared rig

Start at `/skin-studio.html` with either Denim or Coral, and choose **Download artwork template**. The ZIP contains a registered example, `skin.json`, a separate `guides.png` and `TEMPLATE.md`. These are editable source assets, not a finished animation atlas.

## Paint and register the parts

Every attachment is a **192×256 PNG with a transparent background** in the same source coordinate system. Keep its full canvas: do not trim the PNG, scale it independently or paint the guide into it. Native artwork faces right in three-quarter view. The first rig family expects V6-scale proportions; replacing a tiny or differently proportioned drawing does not automatically retarget it.

Required attachments:

| Slots                                              | Painting responsibility                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `torso`, `hips`                                    | Complete fixed clothing under moving limbs, including covered areas                 |
| `near-upper-arm`, `far-upper-arm`                  | Sleeve and upper arm, with painted overlap at shoulder/elbow                        |
| `near-forearm`, `far-forearm`                      | Forearm, cuff and hand; exclude adjacent waist, skirt and hair pixels               |
| `near-thigh`, `far-thigh`, `near-shin`, `far-shin` | Continuous leg clothing/skin with enough coverage around the knee                   |
| `near-shoe`, `far-shoe`                            | Separate foot/shoe attachments, registered at the ankle                             |
| `head-neutral`, `head-gentle`, `head-joyful`       | Complete coordinated head states with stable identity, neck position and front hair |

`back-hair` and `garment` are optional overlays. Near/far means the viewer-facing/back limb, not left/right playback. The player mirrors the native frame for the opposite direction. Preserve material ownership: a sleeve should not carry a skirt fragment just because the source illustration overlaps there.

A generated full-character illustration is useful as a consistent design source, but it still needs part separation and painted coverage behind joints. This tool does not infer hidden anatomy or automatically split an illustration. No image-generation API is called during authoring, rendering or playback.

## Bind and inspect

1. Replace one selected attachment PNG, or edit the template's PNG files and import the complete ZIP. Import reports any alpha normalization for an individual image; saved skin/project ZIPs require exact transparent/opaque pixels.
2. Set the skin's name and ID in `skin.json` when preparing a reusable new identity. IDs are not limited to the built-in catalog. Keep `format`, `version` and `rigId` unchanged for this family.
3. Match each arm's shoulder–elbow–wrist and each leg's hip–knee–ankle registration to the source drawing. Drag source-canvas handles, use arrow keys (Shift for ten pixels), or enter coordinates and commit with Enter/blur. A drag is one undo step; Escape cancels it. These landmarks fit the same hierarchy and shared actions to the new parts. Attachment X/Y offsets are integer pixel adjustments; they are not a substitute for correct anatomical cuts.
4. Inspect isolated parts and the posed skeleton/mesh. Check idle, walk, run and jump, all expressions, both directions and every key. Use **Skeleton only** to inspect the actual animated body and limb chains without artwork. Repair exposed source gaps rather than hiding them with unrelated pixels.
5. Save the full project before exporting. Reopen it and compare the result, then load the baked CharacterPack into the independent player.

The motion editor selects playback frames, edits their shared source poses, changes FPS, and adds/removes held playback entries. Repeated entries reuse the same pose; locomotion limbs use opposing half-cycle poses. Four idle, eight walk and twelve run source keys are preserved. New projects add twelve jump keys with coordinated legs and a one-shot sequence; it stops on the final authored pose and can be replayed. Old projects keep their three clips until **Add jump action** is selected; adding it is undoable. Optional jump-only `rootY` and `armBend` fields default to zero when omitted. Shared motion keys, FPS and playback sequence are saved in `project.json`, not the skin-only ZIP. Reset restores the selected clip's built-in motion. This is not yet a free-form bone or animation-curve editor. See [the basic actions review](BASIC_ACTIONS_REVIEW.md) and [the authoring tools review](AUTHORING_TOOLS_REVIEW.md) for undo/redo, controls and limits.

## Choose the correct file

| File             | Purpose                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `.skin.zip`      | `skin.json` plus `slots/<slot>.png`; reuse the art and its bindings with the shared rig                               |
| `.template.zip`  | Skin files plus separate guide and preparation instructions                                                           |
| `.rig.zip`       | Complete editable project: skin PNGs/metadata, rig, motion library and preview state                                  |
| `.character.zip` | Existing five-file CharacterPack: baked atlas, manifest, appearance reference and documentation; independent playback |

Keep the `.rig.zip` as the reproducible source. `character.json` in a baked pack is an old-Studio-compatible appearance reference; it cannot restore arbitrary imported artwork or edited skeleton motion. Ordinary Studio continues to use its preserved renderers.

Skin metadata includes provenance supplied by the asset author. Replacing images does not confer a new license on them. Current examples reuse the project's documented AI-assisted development artwork; the renderer itself remains local and deterministic.

See [the implementation review](REUSABLE_RIG_REVIEW.md) and [actual exported examples](reusable-rig/README.md) for current evidence and limits.
