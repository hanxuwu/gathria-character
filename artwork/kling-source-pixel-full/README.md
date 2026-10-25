# Source pixel full bank

Complete detail128 continuation: both characters, original base and wedding looks, all five native actions. The 368 source cells and 488 original timeline ticks retain exact IDs, order, holds, 24 fps and loop behavior. Jump remains a 39-tick one-shot. All original derivation and sourceMetadata, including direct motionFlow transitions, are retained.

All four looks use a 192x298 native canvas and anchor (96,282). Base frames receive fixed source padding left/right 32, top 130, bottom 6; wedding frames receive top 2, bottom 6. The resulting 768x1192 canvas is sampled uniformly at one quarter scale. Base geometry matches the prior detail study translated by exactly (+8,+32) output pixels. No source pixels are cropped or individually repositioned.

The integer premultiplied-alpha BOX method continues the approved detail study. A newly fitted, versioned 128-color palette is shared across all four complete banks. Palette error comparisons against the unchanged study palette are recorded in palette.json. This improves wedding color coverage, with a modest base RGB tradeoff; it does not claim identical base color bytes. Alpha is identical to the fixed unquantized projection, without thresholding, dithering, new shadow removal, sharpening or AI redraw.

index.json records input SHA256, source cell maps, fixed padding, output packages, palette and toolchain. prepared/<character>/<look>/atlas.json records every source/output frame hash, alpha check, animation and derivation hash. Transparent RGBA8 atlases are authoritative; contact sheets are labeled offline diagnostics. catalog-index.json is a two-record catalog fragment; the generator never edits the live catalog. Bundles live in docs/kling-source-pixel-full/bundles.

Regenerate with `/tmp/kling-polish-venv/bin/python scripts/prepare-kling-source-pixel-full.py`. Original assets and the earlier bounded study are read-only inputs. Source clipping, blur and original motion imperfections remain.
