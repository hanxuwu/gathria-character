# Native-size inspection correction

The initial production export passed archive, protected-pixel and playback
checks, but native visual review still found source clothing incorrectly
classified as skin: white/pink shoe chunks in male run frames56/64 and warm-gray
shirt fragments in the blurred run64 poses. These PNGs are actual UI-exported
CharacterPack frame crops before the final bounded semantic correction, not
concept artwork. The recorded reports describe that earlier asset hash set;
they are not final visual acceptance.

The correction changes offline garment ownership. Female jump frame89 also
requires a corrected wrist guide and hand protection boundary: a propagated
wrist had drifted into the shirt, protecting cloth as if it were a hand. The
female registration therefore receives a new SHA-256 and all its garments are
rebuilt against it. Head protection and all original source pixels, source
packs, body shape, frame order and timing remain unchanged. The final main
review and export folders are rebuilt from the updated actual UI output.

`before-sources.json` records the original UI-export pack hashes. The four
`*-before.png` images retain those exact decoded source-sized frames.
`render-kling-wardrobe-corrections.py` combines their crops with the immutable
original and final UI export at 2× nearest-neighbor zoom; its output inventory
records source/final pack hashes and validates every generated PNG.

| Actual exported frame                         | Matched original / before / after at 2×   |
| --------------------------------------------- | ----------------------------------------- |
| Male run56, hidden rear shoe                  | [Comparison](male-56-correction-2x.png)   |
| Male run64, shoe/ankle                        | [Comparison](male-64-correction-2x.png)   |
| Female run64, cloth beneath arm               | [Comparison](female-64-correction-2x.png) |
| Female jump89, hand protection and skirt join | [Comparison](female-89-correction-2x.png) |

Small source motion-blur mixtures at ankle/hand contacts remain a limitation.
The correction does not globally erase pale or warm-colored pixels, nor redraw
the original anatomy to make automated ownership checks pass.
The final jump89 waist still has a small stepped edge and local skirt side
bulge. The matched crop deliberately retains them for review.
