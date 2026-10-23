# Inspect and share a clothing action

Open `workbench.html?character=male&mode=wardrobe` (or `female`).

In **Fitting guides**, choose a worn clothing item and check **Inspect clothing
layer**. Previous/current/next show native right-facing source layers at their
actual action positions. Intentional held frame IDs remain visible as separate
positions. Loops wrap; one-shot endpoints do not invent a neighbor. **Show
editable area** displays the binary ownership mask.

**Download neighboring poses for painting** contains unique native pose PNGs,
ownership masks, individual anchor guides, the exact base garment and a recipe.
`neighbors-guide.json` preserves the positions, holds, FPS and loop flag. The
single-pose button remains available. The offline recipe builder keeps V2 hand
reviews, source hashes, registration and alpha; painting cannot silently expand
ownership. Reimport the new item and review the whole action after editing.

**Download action GIF** exports the currently shown action and direction at its
original speed, independently of the preview speed slider. It uses half native
size (384×592 with current hair padding) and a cream matte, because GIF cannot
preserve fractional alpha. PNG and CharacterPack retain full resolution/alpha.
The first frame starts the action; paused scrub position does not truncate it.
Loops repeat, one-shot actions play once. Delays use cumulative centisecond
rounding (24 FPS alternates 40/50 ms) instead of changing the total duration.
A shared 256-color palette prevents frame-to-frame palette variation. This is a
viewing copy; slight quantization is expected. Use CharacterPack for lossless
artwork and exact fractional timing. GIFs above 50 FPS or 32 million compact
frame pixels are explicitly declined; the original export remains available.

Encoding is lazy-loaded (`gifenc` 1.0.3, MIT), browser-local, bounded and
cancelable between frames. No runtime image-generation API is called. Tests
use `gifuct-js` 2.1.2 (MIT) as an independent decoder. See each package's license.
