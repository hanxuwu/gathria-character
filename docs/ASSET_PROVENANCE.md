# Artwork provenance and reuse

## Portable Maple and Willow identities

Two OpenAI image-generation calls on 2026-10-17 UTC produced Willow's complete
character/three-expression design and a separate clothing sheet. The preceding
Maple source supplied the style/proportion reference. Untouched sources and
exact prompts are retained in
[`artwork/portable-identities/source/`](../artwork/portable-identities/source/).
Maple's existing heads are reused byte-for-byte with newly authored ownership
masks; no new Maple portrait was generated. Willow's run/jump hands reuse the
retained Maple closed-fist source, adjusted offline to the new source palette.

The [source record](../artwork/portable-identities/README.md) and preparation
script describe measured registration, alpha cleanup, hip/leg ownership and
explicit skin/hair/garment masks. Runtime only reads those prepared sources and
recolors marked materials; it performs no segmentation, image API calls or
identity-specific rendering. The existing skeleton, renderer and motions remain
unchanged. Source-colored identity heads preserve the authored pixels exactly.
Cross-dressing and playback evidence in the
[review](PORTABLE_IDENTITIES_REVIEW.md) comes from actual application exports.

Identity ZIPs retain their supplied provenance. They do not grant rights in
third-party artwork; project-owned sources follow the repository reuse notice
below. This delivery is not a claim of final visual acceptance.

## Maple action forearms

Two additional OpenAI image-generation calls on 2026-10-17 produced a rejected
arm/hand draft and the selected isolated closed-fist pair. Exact prompts and
untouched sources are retained at
[`artwork/maple-action-poses/source/`](../artwork/maple-action-poses/source/).
Only the selected hand skin contributes new artwork. Offline preparation removes
the old hand by its semantic ownership mask in a copy of each forearm, registers
the new hand underneath the original cuff, and preserves all original sleeve
pixels and color masks. Original base attachments are not overwritten.

The new skin/top-item v2 explicitly selects these alternate forearms for run and
jump. Existing v1 files and idle/walk remain reproducible. The same skeleton,
action timing and original body artwork are reused. Sources, hashes, technical
registration, reusable item masks and actual exports accompany the
[review](MAPLE_ACTION_POSES_REVIEW.md). No image API is called at runtime.

## Generated Maple shared-rig trial

This batch makes three OpenAI image-generation calls on 2026-10-17 UTC: an
original Maple character/part sheet, a rejected torso correction that still
contained a sleeve, and a corrected sleeveless torso backplate. The previous
actual-export lineup is the style/proportion reference. Original transparent
PNGs and exact prompts are retained in
[`artwork/generated-traveler/source/`](../artwork/generated-traveler/source/).
No generated image is substituted for actual exported-animation evidence.

[`prepare-generated-traveler.mjs`](../scripts/prepare-generated-traveler.mjs)
performs explicit source-region extraction, connected-object selection within
each part, nearest-neighbor registration, binary alpha, ownership cuts and
offline hand/cuff material masking. It emits a new 15-slot skin/project and
three independently reusable clothing items. Heads, rig and motions are
preserved between the trial's first and final exports. The existing renderer,
source banks and old versions are unchanged. Runtime remains local and
deterministic, with no Spine or generation API.

The [source record](../artwork/generated-traveler/README.md) distinguishes new
illustration from technical preparation. The [review](GENERATED_CHARACTER_REVIEW.md)
and [actual exports](generated-traveler/README.md) document the source defects,
repairs and remaining pose/identity limitations. This is AI-assisted original
project artwork under the repository reuse notice to the extent rights are held,
not a claim of hand-drawn illustration or final user visual acceptance.

## Modular wardrobe catalog 1

The opt-in wardrobe reuses the V6 crop/waves expression heads and existing jacket, soft top, trousers, short skirt and two shoe designs. It adds no illustration or image-generation call. [`prepare-wardrobe-assets.mjs`](../scripts/prepare-wardrobe-assets.mjs) extracts complete registered groups, retains authored material IDs, and separates overlapping garment/shoe ownership into an independent checked-in catalog. Original source banks and built-in skins remain unchanged. [The preparation record](WARDROBE_ASSET_SOURCES.md) explains source groups, masks, ankle registration and limitations.

Runtime composition recolors only marked skin, upper/lower clothing and shoe pixels. Fixed eyes, trim and the blue underskirt remain fixed. Each saved project contains both a versioned clothing recipe and complete flat PNG attachments; each CharacterPack retains the source notice and composition metadata while playing from baked pixels alone. [Wardrobe review](WARDROBE_MVP_REVIEW.md) links actual application exports and verification. This is registered garment reuse, not automatic splitting or binding of arbitrary generated illustrations.

## Independent Denim skeletal authoring study

The [skeletal rig study](SKELETAL_RIG_REVIEW.md) reuses the frozen V6 Denim head, jacket, trousers and shoes from source revision `ea01dd8e074741fdfab0311e1e64585329c29391`. It introduces no new illustration, image-generation call, third-party animation implementation or Spine dependency. Its project-owned mesh code joins existing registered source textures, assigns normalized bone weights, applies bounded joint corrections and bakes nearest-neighbor triangles. Texture/source banks and production V1–V7/motion renderers remain unchanged. Experimental packs identify `gathria-denim-skeletal-v1`, retain historical artwork provenance and include the exact rig recipe in provenance text; separate project JSON preserves editable authoring inputs. Actual exported review evidence is in `docs/skeletal-rig/`.

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

## Compact running refinement (motion version 2)

The user supplied a five-row, eight-column character movement study and requested the third row. That row informed **motion analysis only**: compact fore/aft arm pumping, bent-knee recovery beneath the body and restrained vertical bounce. No pixels from that reference were extracted, incorporated into the source bank, or used as an export substitute. This batch makes no image-generation calls and introduces no new source illustration.

[`running-rig-v2.ts`](../src/core/running-rig-v2.ts) independently reuses the frozen V6 prepared layers and recoloring. It targets feet relative to the posed hips, keeps elbows near a right angle, adjusts shoe pitch during recovery and reduces body/gown bounce. A hidden far-shoulder offset keeps the arm pump closer to the torso. Bride hands retain shared gown-grip registration. The V6 three-quarter head/body and full gown remain; the result is not a new pure-profile character drawing.

[`generator-motion-v2.ts`](../src/core/generator-motion-v2.ts) preserves original V6 idle/walk rows and appends only the compact run frames. Motion version 1 source files, exported evidence and saved rendering remain unchanged. Actual export processing and comparisons are in [`running-v2/`](running-v2/); [RUNNING_V2_REVIEW.md](RUNNING_V2_REVIEW.md) records the review and current limits.

## Everyday outfit catalog

The four everyday looks are new **configuration combinations**, not new garment illustrations. [`everyday-presets.ts`](../src/core/everyday-presets.ts) combines the existing jacket, soft top, hoodie, trousers, skirt and shorts with selected colors, and removes the optional rose hairpiece. Complete examples use preserved V6 heads with the existing compact running renderer (`motionVersion: 2`). No image-generation calls, source-image edits, generated-bank edits or renderer changes were made for this batch.

The jacket's cream inner shirt and the skirt's blue underskirt are details already painted into those layers; the color controls do not recolor every material. Existing generic limb/garment cut artifacts remain visible in some running poses. See [EVERYDAY_REVIEW.md](EVERYDAY_REVIEW.md) for the actual exported lineup, animation evidence and precise limits. The reference images used in earlier milestones are not incorporated into these review images; all figures come from application exports.

## Running limb ownership and connection repair (motion version 3)

This 17 October 2026 batch introduces no new illustration, external artwork or image-generation call. It derives run-only layers from the preserved V6 bank and its earlier everyday garment sources. [`running-arm-parts.ts`](../src/core/running-arm-parts.ts) reunites overlapping soft-top/skirt cuts, traces anatomical arm ownership in original source coordinates, restores misassigned arm-edge pixels and removes duplicate standing-arm pixels from the fixed garments. The blue underskirt remains intact; cleanup is based on ownership, not selected color. Corrected layers use independent `motion3:` identifiers and leave committed source-bank bytes unchanged. The [transparent diagnostics and coordinate audit](run-connections/diagnostics/arm-ownership-audit.json) record removed/reassigned RGBA/material tuples and source hashes.

[`running-leg-parts.ts`](../src/core/running-leg-parts.ts) samples the original thigh/shin painting as a connected strip along the unchanged run joint targets. A bounded five-pixel knee curve replaces exposed rectangular joint caps; cloth, bare skin and ankle details retain their own source pixels. Duplicate shoe pixels are excluded from the leg strip because the original shoe is already drawn separately with its preserved pitch. This is local deterministic source sampling and ownership correction, not newly painted frame animation.

Only explicit `motionVersion: 3` configurations select these changes through [`generator-motion-v3.ts`](../src/core/generator-motion-v3.ts). Earlier artwork/motion results remain reproducible, and original V6 idle/walk atlas rows are copied intact. The [before capture](run-connections/before/exports-validation.json) was exported from verified PR #2 merge `ebec736e72966923304281bc0150505ae04f1c99`; its [frozen hashes](run-connections/before/frozen-source-hashes.json) preserve the historical sources. Finished comparison PNGs/GIFs and CharacterPacks in [`run-connections/`](run-connections/) derive from actual application exports. Layer-isolation diagnostics are separately labeled. See [RUN_CONNECTIONS_REVIEW.md](RUN_CONNECTIONS_REVIEW.md) for causes, compatibility, functional verification and visual limits.

## Reusable skeleton and skin packs

This batch creates no new illustration and makes no image-generation call. [`skeletal/builtins.ts`](../src/skeletal/builtins.ts) converts the existing Denim and Coral configurations, preserved V6/earlier source layers and corrected Motion 3 arm ownership into registered 192×256 RGBA attachments. Their complete head states and source color treatment are retained. The portable PNGs, binding metadata, shared rig and actions are delivered in [`reusable-rig/`](reusable-rig/); the old source banks are unchanged.

The separate renderer consumes only imported RGBA attachments and data. All its idle/walk/run frames are newly baked from the shared rig, not copied from historical atlases. Its mesh helper derives from the earlier project-owned Denim experiment; it uses no Spine software or runtime. The technical import fixture changes one torso's red/blue channels to demonstrate external PNG replacement and is labeled accordingly. It is not new character illustration evidence.

Imported packs retain their supplied source provenance. Export documentation distinguishes the repository's rendering-code license from any rights in externally supplied artwork. CharacterPack PNGs/GIFs are actual application output; guides and mesh overlays are labeled authoring diagnostics. See [REUSABLE_RIG_REVIEW.md](REUSABLE_RIG_REVIEW.md) for compatibility and limits.

## Portable wardrobe item sample

This batch uses the existing [registered wardrobe catalog](WARDROBE_ASSET_SOURCES.md)
and makes no image-generation call. The sample embroidered denim top begins as
an item template downloaded from Skin Studio. The
[capture script](../scripts/generate-wardrobe-item-evidence.mjs) paints a small
pixel flower badge on existing torso cloth pixels and changes only those
pixels' material IDs to fixed color. It preserves alpha, registration, silhouette,
joint coverage and all other parts. The edited PNG and material mask are packed
and imported through the normal UI before producing the reviewed characters.

The example trousers and lace-up shoes are renamed, visually unchanged template
copies used to verify the other two supported clothing groups. Item metadata,
the saved project library and baked CharacterPack provenance record these
derivations. The sample illustrates reusable source editing; it is not a newly
generated full outfit or a claim of improved underlying character artwork.
All lineup PNGs and animation previews in [wardrobe-items/](wardrobe-items/)
come from the application's actual exported atlases. Imported user artwork
retains its supplied provenance and rights; clothing import does not assign it
a new license. See [the feature review](WARDROBE_ITEMS_REVIEW.md).
