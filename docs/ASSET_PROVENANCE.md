# Artwork provenance and reuse

## Preserved artwork V1 and V2

`src/core/generator-v1.ts` and `src/core/generator-v2.ts` draw original integer-coordinate shapes and palette rules created for this project. Their 48×64 artwork is frozen: loading an existing configuration selects its original renderer. The original examples in `public/samples/` and `public/samples/v2/` remain unchanged.

## Detailed artwork V3

The detailed revision uses **AI-assisted illustration assets**, created with OpenAI's image generation tool during development on 2026-10-15. User-provided images guided the rounded Japanese chibi proportions, curling hair, warm lighting, and layered wedding clothing. Those reference images are not bundled with the repository or exported packs. This is not a claim that the detailed assets were drawn entirely by hand.

The source banks are retained in [`artwork/illustrated-source/`](../artwork/illustrated-source/). Offline preparation extracts transparent layers, identifies editable materials, and records joints. The browser bundles the prepared pixels and composes them with `src/core/generator-v3.ts` and the adjacent `illustrated-*` modules. Recoloring preserves the source shading; articulated limbs and secondary hair/skirt motion are sampled with nearest-neighbor pixels. Exported alpha is binary, and generation is deterministic for the same configuration and artwork version.

V3 uses 192×256 frames in a 1536×512 sheet, with a ground anchor at (96, 240). This provides room for the eye highlights, hair strands, lace, and cloth folds that could not remain readable in the earlier 48×64 design. Both older versions retain their exact geometry and artwork. The portable CharacterPack manifest remains version 1.

The runtime performs no AI calls, photo processing, asset downloads, or other remote generation. AI/photo input as a product feature remains a separate future milestone. An exported pack contains all pixels required for independent playback.

## Expressive artwork V4

V4 reuses the frozen V3 illustration bank and adds deterministic eye expressions, different highlight treatment, and an updated articulated rig in `expressive-face.ts` and `expressive-rig.ts`. V3 source bytes and rendering remain unchanged. New appearance files explicitly declare artwork version 4.

The optional rose hairpiece was created with OpenAI's image generation tool on 2026-10-15, guided by the user's wedding character references. Its original transparent source is committed at [`artwork/expressive-source/flower-clip.png`](../artwork/expressive-source/flower-clip.png). `scripts/prepare-expressive-accessory.py` crops the alpha bounds, thresholds alpha at 128, scales with nearest-neighbor sampling into a 28×40 bound (actual 28×39), and packs fixed-color RGBA/material tuples. It does not redraw the asset. The app bundles `expressive-accessory.generated.ts`; this asset remains optional and recoloring does not affect its rose/leaf colors.

Blinking and happy eyes are local procedural changes within the illustrated head's eye regions; this revision does not use a model during customization or animation. V4 keeps the V3 frame dimensions and CharacterPack v1 contract. Its real export evidence is in `docs/art-expressive/`, and samples are in `public/samples/expressive/`.

## Reuse and evidence

Project source, prepared artwork, source banks, and generated sprites are distributed under the repository's [MIT License](../LICENSE), to the extent rights are held by the contributors. Retain its copyright and permission notice when redistributing. There is no mandatory visible in-game credit or per-export fee. This does not grant rights to third-party trademarks or identities, or to assets users independently add. Each exported pack includes the license and a provenance statement appropriate to its artwork version.

Images and animations under `docs/art-detailed/` are assembled from **actual application exports**. Source banks are production inputs, not export evidence. PNGs preserve exported RGBA values; preview backgrounds are composited only for viewing, and GIFs may quantize colors to the format's palette limit. The labeled neutral scene is not a Gathria scene asset. Production Gathria integration remains unverified.

## Cohesive artwork V5

V5 introduces an AI-assisted whole-character expression sheet produced on 16 October 2026 (Australia/Sydney) with OpenAI's image-generation tool. Its production source and preparation notes are in [`artwork/cohesive-source/`](../artwork/cohesive-source/). Three authored face states for the waves/crop portraits and their wedding bodies share the same source. Offline anatomical masks separate materials, preserve both rear-hair tails and register the neck. The previous illustration bank and V1–V4 generators remain frozen. Runtime remains deterministic and local. New evidence is in `docs/art-cohesive/`; see [the review](ART_COHESION_V5.md) for scope and remaining limits.

## Polished artwork V6

V6 (16 October 2026) introduces no newly generated illustration. It reuses the exact V5 expression-bank and garment-backplate images, plus the retained older daily clothing and accessory assets. [`prepare-polished-assets.py`](../scripts/prepare-polished-assets.py) normalizes those existing sources, separates sleeve/torso ownership along anatomical contours, retains whole head/neck states, excludes skirt fabric from bare hands, and restores existing hair/coat pixels to their fixed layers. It writes an independent V6 namespace in `polished-assets.generated.ts`; V5 and all older source banks remain unchanged. [`polished-source-baseline.json`](../artwork/polished-source-baseline.json) records their hashes.

This is technical extraction, masking and local rig refinement of AI-assisted production artwork, not a new model call or a claim of hand-painted animation. The selected expression includes the entire authored face; it does not use rectangular eye erasure. New evidence is assembled from actual V6 exported PNGs in `docs/art-polished/`. [The review](ART_POLISH_V6.md) records compatibility, source processing, verification and remaining limits.

## Running extension for artwork V6

`motionVersion: 1` adds running without a new artwork revision. This batch makes **no image-generation calls and introduces no new source illustration**. It reuses the frozen V6 prepared wedding layers, the earlier daily-garment layers available through the V6 bank, and the existing rose accessory. The original V6 source bank and renderer are retained. [`running-baseline/baseline-index.json`](running-baseline/baseline-index.json) records the source hashes and the bride/groom baseline captured from actual browser exports before running was added.

[`src/core/running-rig.ts`](../src/core/running-rig.ts) applies run-only technical masks at overlapping limb cuts to remove borrowed hair, skin, shoe or clothing fragments exposed by the stronger poses. The masked pixels are local copies; source image and generated-bank files are not rewritten. The rig uses the same V6 recoloring and whole-face states, a shared rigid head/neck/torso lean, bent arms, and two-bone leg placement. The lapel flower follows its torso layer and the hair accessory follows the head transform. Rear hair and cloth receive bounded delayed motion. For the floor-length gown, both wrists follow the same deformation as their gown grips, while the shoes remain fully occluded. This is deterministic layered animation, not newly painted frame-by-frame art.

[`generator-motion-v1.ts`](../src/core/generator-motion-v1.ts) copies the original V6 idle/walk atlas rows intact and appends twelve run drawings. Packs retain artwork version 6, declare motion version 1 in their configuration and identify the generator as `gathria-polished-pixels-v6-motion-v1`. Their provenance text identifies the original AI-assisted artwork and the new local motion work separately. Older files and packs are not silently upgraded.

[`docs/running/`](running/) contains actual exported PNGs, GIF previews, CharacterPack ZIPs and independent-player evidence. Numbered iteration folders preserve intermediate application exports; the files directly in the directory are the final review set. [RUNNING_REVIEW.md](RUNNING_REVIEW.md) records the compatibility decisions, verification and remaining motion limits. Review backgrounds are neutral scenes, and GIF palette/timing conversion is presentation processing rather than production source art. No production Gathria integration or user visual acceptance is implied.

## Harmonized artwork V7

V7 (17 October 2026, Australia/Sydney) uses new complete bride and groom expression sheets generated with OpenAI's image-generation tool during development. The existing V5 character bank supplied identity and clothing references; the user's wedding sprite references guided the art direction. Four calls produced the bride, a groom draft, its focused neck/collar refinement, and a hand-free gown backplate. The selected original PNGs, exact prompts and registration metadata are preserved in [`artwork/harmonized-source/`](../artwork/harmonized-source/); the rejected first groom draft is not used by the app.

[`prepare-harmonized-assets.py`](../scripts/prepare-harmonized-assets.py) performs deterministic technical registration, nearest-neighbor sampling, binary-alpha thresholding, one face-weighted 96-color palette per identity, anatomical layer extraction and material masking. It creates 29 independent V7 layers, including a matching rear-hair state for each bride expression. Complete heads carry the eyes, brows, mouth and cheeks together. The gown has no embedded hands; its shoes are separately articulated. The older daily garments and rose accessory remain available from their frozen banks.

The runtime performs no image-generation calls. Its V7 rig applies local, deterministic articulation, recoloring and weighted cloth deformation; this is not hand-painted frame animation. V1–V6 source images, rendering modules and prior packs remain preserved. Each V7 pack carries version-specific provenance; the manifest remains CharacterPack v1. See [ART_HARMONY_V7.md](ART_HARMONY_V7.md) for actual exported PNG/GIF/ZIP evidence, compatibility and visual limits.
