# Original-video baked character sources

User-supplied Kling originals, received for faithful playback on 20 October
2026 (UTC). The male file already exists at
[`../reference-mother/source/reference-video.mp4`](../reference-mother/source/reference-video.mp4).
The female original is [`source/female.mp4`](source/female.mp4). Both remain
untouched; exact SHA256 values are in [`source/selection.json`](source/selection.json).
No new image-generation call, redrawing or skeleton fitting is used in this batch.

`scripts/prepare-kling-playback.py` performs fixed native-resolution cropping
and technical green-screen matting. Its estimated soft edges are derived work,
not original transparent layers. Opaque source RGB is preserved exactly.
`prepared/kling-source.zip` holds all 166 derived RGBA8 frames, source frame/time
maps and source metadata using the external Unified source contract.
`prepared/extraction-report.json` records per-frame checks and hashes.

The source ZIP is an import resource, not a native CharacterPack. The existing
player's adapter creates a versioned native V2 baked pack without resampling.
Actual application exports and review images live in `docs/kling-playback`.
Only those exports, not conceptual mockups, are used in the review animation.

Storage decision: reuse the existing male original, retain the new female
original once, package derived source PNGs once, and keep the two independently
usable exported packs as delivery artifacts. Do not unpack duplicate source
frame directories into Git. Small source-standing crops are retained for
matched source/matte/export comparisons.

The user supplied these assets; this processing does not assign them a new
artwork license. Existing source artwork and historical generated studies
retain their documented provenance. See [the implementation review](../../docs/KLING_PLAYBACK_REVIEW.md)
and [modular feasibility](../../docs/KLING_MODULAR_FEASIBILITY.md).
