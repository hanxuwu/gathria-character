# Wardrobe MVP actual exports

These are downloads from real Skin Studio wardrobe controls. The same shared skeleton and four-action motion library drive every look; review images are composed from the downloaded transparent PNGs, with integer nearest-neighbor zoom on a neutral stage.

- [Wardrobe lineup, native](wardrobe-lineup-1x.png) · [2×](wardrobe-lineup-2x.png)
- [Four actions, native](four-actions-1x.png) · [2×](four-actions-2x.png)
- [Four-action tour, right 2×](four-actions-right-2x.gif) · [Left 2×](four-actions-left-2x.gif)
- [Expressions](expressions-2x.png) · [Semantic recolor](recolor-2x.png) · [Connections](connections-3x.png)
- [Run keyframes](run-keyframes-1x.png) · [Jump keyframes](jump-keyframes-1x.png)
- [Shoe fit: initial vs final](shoe-fit-before-after-4x.png) · [Initial export record](iterations/01/connections-3x.png)
- [Desktop](studio-desktop.png) · [Mobile](studio-mobile.png)

| Action | Native right | Native left |
| --- | --- | --- |
| Idle | [GIF](idle-right-1x.gif) | [GIF](idle-left-1x.gif) |
| Walk | [GIF](walk-right-1x.gif) | [GIF](walk-left-1x.gif) |
| Run | [GIF](run-right-1x.gif) | [GIF](run-left-1x.gif) |
| Jump, plays once | [GIF](jump-right-1x.gif) | [GIF](jump-left-1x.gif) |

| Look | Editable project | Independent CharacterPack |
| --- | --- | --- |
| Crop / denim + trousers + lace-ups | [ZIP](crop-denim.rig.zip) | [ZIP](crop-denim.character.zip) |
| Crop / soft top + skirt + lace-ups | [ZIP](crop-mixed.rig.zip) | [ZIP](crop-mixed.character.zip) |
| Waves / soft top + skirt + flats | [ZIP](waves-soft.rig.zip) | [ZIP](waves-soft.character.zip) |
| Waves / denim + trousers + flats | [ZIP](waves-mixed.rig.zip) | [ZIP](waves-mixed.character.zip) |
| Waves / recolored crossed outfit | [ZIP](waves-recolor.rig.zip) | [ZIP](waves-recolor.character.zip) |

Both crossed looks were reopened through the UI. Item/color controls, selected jump/left preview, manifest and decoded spritesheet pixels were preserved. The three head PNGs and any back-hair PNG are pixel-identical within each identity's clothing pair. Clothing changes preserve the rig and all motion data.

After closing the editor, the standalone player loaded the two crossed-look packs and exercised four actions in both directions (16 cases). Every sampled native character frame matched the exported PNG including player guides. Idle, walk and run were observed through wrapping; jump was checked for all phases, final hold and replay. Authoring/generator modules were blocked and none were requested. Independent player screenshots are inside `crop-mixed/` and `waves-mixed/`.

Initial actual exports exposed a detached flat shoe in the crossed trouser look. The initial packs and 3× comparison remain in `iterations/01`. Final exported alpha is checked across all 36 poses of all four main looks: no separate opaque component larger than 80 pixels whose top is at or below y=185. This focused footwear check complements visual inspection; it does not prove the absence of every small texture seam. The complete-head Crop source retains a small collar-like tab, which limits perfectly clean collar swapping.

Individual jump GIFs have no loop extension and play once. Four-action tour GIFs deliberately repeat with a labelled end hold. GIF timing uses cumulative centisecond rounding; every decoded GIF frame is compared to its palette-converted intended frame and duration. Characters animate in place.

- [Browser evidence and source hashes](evidence-index.json)
- [PNG/GIF/ZIP and animation validation](artifact-validation.json)
- [Every-file integrity inventory](file-integrity.json)

This batch proves a bounded catalog of registered clothing parts. Arbitrary unregistered images still need authoring and part ownership cleanup. Tests and export validation are separate from visual acceptance; these artifacts remain for review.
