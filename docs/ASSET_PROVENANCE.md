# Kling asset provenance

The visual baseline is the user-supplied original male/female Kling videos.
Source extraction keeps one fixed crop/scale per character; it does not redraw
faces or independently resize body parts. Standing source frame 348 (14.50 s)
is the reference for both characters.

The unchanged male video now lives at `artwork/kling-playback/source/male.mp4`,
relocated from the earlier mother-study directory. Both extraction recipes only
change that path; source frame selection and all prepared archives remain intact.
Historical extraction reports/embedded metadata retain the original path as
a provenance identifier, not a runtime file dependency.

## Original playback

- [Four-action selection and extraction](../artwork/kling-playback/README.md)
- [Selection recipe](../artwork/kling-playback/source/selection.json)
- [Jump selection and transparent padding](../artwork/kling-jump/README.md)
- [Five-action packs and original video comparisons](kling-jump/README.md)

The current five-action source and exported packs are unchanged by the Kling-only
cleanup. Idle, walk, run and celebrate loop at source timing; jump plays once and
holds its landing. Left-facing output mirrors the original right-facing images.
Any motion softness, source-pose drift or matte fringe in those images belongs
to the retained extraction and is not claimed to be newly corrected.

## Separate keyframe loop candidates

[Selection record](../artwork/kling-keyframes/README.md) and
[review exports](kling-keyframes/README.md) retain 52 distinct drawings per
character from the existing five-action packs. No new art, extraction,
interpolation, recentering or skeletal deformation is used. The compact V2
atlas is re-encoded, but every selected native RGBA frame matches its source
exactly; original frame IDs, video mapping and anchor remain intact.
Repeated IDs encode explicit holds at 24 FPS. Jump is a separately labeled
crouch-to-crouch repeated hop, not the original full one-shot. Original packs
remain unchanged. Both candidate ZIPs contain source hashes, selection and
timing provenance, including the remaining source blur and clipping.

## Motion-flow candidate

The [motion-flow candidate](../artwork/kling-motion/README.md) is a separate
sprite-based derivative of the same original packs. It restores moving poses
omitted by the 52-drawing studies and retains the complete original jump.
No new images, video extraction or skeletal transformations are used. All 184
selected RGBA crops are source-exact; two V3 pages preserve native dimensions.
Reviewed pose-switch routes are optional playback metadata, not new drawings.
Original and earlier keyframe archives remain unchanged.

## Native male skeletal candidate

The visible reference is the exact approved transparent 704×1056 male frame.
Fifteen full-canvas parts and explicit registrations reconstruct standing with
zero RGBA difference. [Source record, prompt and hashes](../artwork/kling-native-study/source/README.md)
disclose one development-time OpenAI image-generation result used only for
supplementary hidden joint coverage. Those painted regions are authored, not
recovered original video layers.

The other three static poses are deterministic skeletal derivatives, not frames
extracted from the video. The cleanup moves shared geometry into a neutral
module and preserves the rendered output. No new images were generated in this
cleanup and no runtime generation API is used.

Non-Kling artwork and earlier alternative mother drawings were removed from the
active repository; their provenance and assets remain in Git history at `158efad`.

## Native female skeletal candidate

[Female source, prompt and hashes](../artwork/kling-native-female/source/README.md)
retain the exact approved female frame348 (14.50s), separately registered at
704×1056. One development-time OpenAI image generation produced supplementary
arm, vest, leg and shorts paint. The compiler uses only masked shoulder/upper-arm
and ankle samples; hip allowances reuse the original shorts texture after the
generated cloth showed a shading mismatch. These are reconstructed hidden
surfaces, not original extracted layers. The head, neck, face, visible outfit
and standing proportions are unchanged, and actual standing composition is
RGBA-identical to the source. All four non-animated static pose exports and
[limitations](KLING_FEMALE_NATIVE_REVIEW.md) are documented separately.

## Registered sprite wardrobe

The [wardrobe source record](../artwork/kling-wardrobe/source/README.md) documents
one development-time OpenAI image-generation result for casual and wedding
clothing. Its generated faces, bodies and backdrop are discarded. Runtime
clothing patches use only registered garment artwork and explicit material
variants; original source poses, skin, faces, scale and motion timing remain the
reference. The separate design sheet is not used as evidence of app output.

The two authoring registrations cover all 88 male and 96 female motion poses,
with 17 points per pose, manually reviewed visible landmarks, inferred hidden
joints and source-bound ownership masks. These are authoring guides rather than
original skeletal measurements. Dress folds are offline registered artwork,
not recovered video layers or physical cloth simulation. Complete preparation
scripts, template inventories and exact source/registration hashes accompany
the assets. See the [format](kling-wardrobe/FORMAT.md) and
[actual export review](kling-wardrobe/README.md) for scope and limitations.
