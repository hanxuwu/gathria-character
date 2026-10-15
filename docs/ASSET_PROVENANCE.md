# Artwork provenance and reuse

## Preserved artwork V1 and V2

`src/core/generator-v1.ts` and `src/core/generator-v2.ts` draw original integer-coordinate shapes and palette rules created for this project. Their 48×64 artwork is frozen: loading an existing configuration selects its original renderer. The original examples in `public/samples/` and `public/samples/v2/` remain unchanged.

## Detailed artwork V3

The detailed revision uses **AI-assisted illustration assets**, created with OpenAI's image generation tool during development on 2026-10-15. User-provided images guided the rounded Japanese chibi proportions, curling hair, warm lighting, and layered wedding clothing. Those reference images are not bundled with the repository or exported packs. This is not a claim that the detailed assets were drawn entirely by hand.

The source banks are retained in [`artwork/illustrated-source/`](../artwork/illustrated-source/). Offline preparation extracts transparent layers, identifies editable materials, and records joints. The browser bundles the prepared pixels and composes them with `src/core/generator-v3.ts` and the adjacent `illustrated-*` modules. Recoloring preserves the source shading; articulated limbs and secondary hair/skirt motion are sampled with nearest-neighbor pixels. Exported alpha is binary, and generation is deterministic for the same configuration and artwork version.

V3 uses 192×256 frames in a 1536×512 sheet, with a ground anchor at (96, 240). This provides room for the eye highlights, hair strands, lace, and cloth folds that could not remain readable in the earlier 48×64 design. Both older versions retain their exact geometry and artwork. The portable CharacterPack manifest remains version 1.

The runtime performs no AI calls, photo processing, asset downloads, or other remote generation. AI/photo input as a product feature remains a separate future milestone. An exported pack contains all pixels required for independent playback.

## Reuse and evidence

Project source, prepared artwork, source banks, and generated sprites are distributed under the repository's [MIT License](../LICENSE), to the extent rights are held by the contributors. Retain its copyright and permission notice when redistributing. There is no mandatory visible in-game credit or per-export fee. This does not grant rights to third-party trademarks or identities, or to assets users independently add. Each exported pack includes the license and a provenance statement appropriate to its artwork version.

Images and animations under `docs/art-detailed/` are assembled from **actual application exports**. Source banks are production inputs, not export evidence. PNGs preserve exported RGBA values; preview backgrounds are composited only for viewing, and GIFs may quantize colors to the format's palette limit. The labeled neutral scene is not a Gathria scene asset. Production Gathria integration remains unverified.
