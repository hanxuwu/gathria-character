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
