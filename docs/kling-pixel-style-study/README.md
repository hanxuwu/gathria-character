# Algorithmic pixel-style study

This batch investigates whether the existing Source pixel artwork can move closer to the supplied chibi pixel-art references through deterministic processing. It preserves the currently shipped theme. **Neither candidate is selected as a replacement.**

The references use deliberate hair/cloth highlight shapes, controlled dark outlines and coherent color clusters. The current Source pixel bank retains many small gradient colors. This study tests whether regrouping those existing colors helps, without redrawing anatomy or changing motion.

## See the experiment

The columns are **current Source pixel / candidate A / candidate B**:

- [Male wedding run GIF](../../artwork/kling-pixel-style-study/male-run-authoring.gif)
- [Female wedding walk GIF](../../artwork/kling-pixel-style-study/female-walk-authoring.gif)
- First-frame comparisons: [male native](../../artwork/kling-pixel-style-study/first-frame/male-run-comparison-1x.png), [male 2x](../../artwork/kling-pixel-style-study/first-frame/male-run-comparison-2x.png), [female native](../../artwork/kling-pixel-style-study/first-frame/female-walk-comparison-1x.png), [female 2x](../../artwork/kling-pixel-style-study/first-frame/female-walk-comparison-2x.png).
- Difficult-pose comparisons: [male jump](../../artwork/kling-pixel-style-study/male-jump-comparison-2x.png), [female jump](../../artwork/kling-pixel-style-study/female-jump-comparison-2x.png).

These are explicitly labeled **offline authoring diagnostics, not new application exports**. Their inputs are the approved original wedding CharacterPacks and the existing application's Source pixel artwork; the candidate processing happens offline. No new theme is published to the catalog, no runtime rendering changes, and no new image-generation API call is made. Transparent atlas PNGs are authoritative; the GIF adds a matte and a display palette.

## Two bounded rounds

Round 1 used coarse color families and evenly selected ramp shades. It created orange shoes, reddish hair and flat cheek patches. It was rejected. The [male](../../artwork/kling-pixel-style-study/rejected-v1/male-run-comparison-2x.png) and [female](../../artwork/kling-pixel-style-study/rejected-v1/female-walk-comparison-2x.png) comparisons, exact script, palette and statistics are retained for traceability.

Round 2 uses fixed weighted color representatives from the existing full-bank palette, corrected brown/rose grouping, chroma/lightness change limits, and retained skin-family colors. The two candidates differ as follows:

| Candidate | Interior shading | Additional processing |
| --- | --- | --- |
| A | Five selected shades per color family; ivory retains eight | One restrained synchronous cleanup pass on eligible isolated colors |
| B | Four selected shades; ivory retains seven | Stronger cleanup and a selective inner-edge darkening rule |

Both retain the existing 128-color master palette for protected details and edge pixels. The interior ramp counts are not total image color counts. Fixed RGB families approximate materials; they are not semantic hair/face/garment masks.

Dark fine features, narrow strokes, isolated light details, low-alpha RGB pixels and heuristic skin colors are protected. RGB protection applies below alpha 240, not to every partially transparent pixel. Alpha is unchanged everywhere, including pixels at alpha 240–254 whose RGB may change. This does not prove that every semantic face pixel is unchanged: pale skin highlights and dark facial strokes may belong to other color families.

The full preparation retains both wedding banks: 88 male and 96 female original source cells, with all five original action tables. The animation study focuses on male run (16 positions) and female walk (27 positions / 25 drawings) at 24 FPS. Existing holds, poses and original loop seams remain. Output stays 192x298 with anchor (96,282), using the already established fixed source projection. There is no per-frame palette, added texture, temporal blend, head fitting, geometry warp or new anatomical drawing.

## What improved and what did not

The second round fixes the first round's obvious hue and cheek regressions. Candidate A makes hair and clothing color groups clearer. Candidate B offers little extra useful edge definition and introduces harder patches. In the inspected first poses its inner-contour rule changes only six male pixels and one female pixel; most of its appearance change comes from color reduction, so it is not evidence of a successful overall outline redesign.

**The tradeoff prevents adoption:** male curls become flatter/darker, and harder color thresholds create more color jumps during motion. Cleaner static clusters alone are not sufficient. The existing antialiased silhouette also remains, because this study deliberately keeps alpha exact.

The temporal diagnostic examines only opaque, same-coordinate projected pixels whose source RGB changes by at most two channel values. A jump is an output channel difference of at least twelve. Original held frames are excluded from the table below and checked separately; loop seams are included.

| Clip | Eligible observations | Current jumps | A jumps | B jumps |
| --- | ---: | ---: | ---: | ---: |
| Male run | 41,221 | 92 (0.22%) | 492 (1.19%) | 648 (1.57%) |
| Female walk | 157,204 | 500 (0.32%) | 2,832 (1.80%) | 3,027 (1.93%) |

Coverage is approximately 13.8% / 30.3% of the visible union over non-held transitions. This is a limited screen-pixel diagnostic, not a full perceptual flicker score, optical-flow correspondence or proof that every tracked body region behaves similarly. It is never used to alter the animation. Both original female held drawings remain identical with zero color jumps.

Algorithms can improve color grouping and edge readability, but global reductions cannot reliably design the reference's curl highlights, folded fabric or selective outline breaks. A next useful experiment would need explicit material/feature regions, controlled highlight/shadow shapes and validated motion correspondence for color labels. It should retain the existing silhouette and original movement, with any region guidance documented. Another global sharpening or fewer-color pass is not justified by these results.

## Verification and provenance

The generator records sources, hashes, parameters, palette representatives, protected-feature changes, isolated-color statistics and temporal coverage in [study.json](../../artwork/kling-pixel-style-study/study.json) and [palette-and-ramps.json](../../artwork/kling-pixel-style-study/palette-and-ramps.json).

Checks executed for this experiment:

- Both original wedding archives and all 184 native source cells were independently checked against their declared source hashes and fixed quarter-scale projections.
- All **368 candidate frames** retain exact alpha, protected-feature RGB and heuristic skin-family RGB. Source IDs, schedules and the number of unique poses are retained.
- Primary frames were processed again in reverse order: **82 candidate frames** matched byte for byte, checking that results do not depend on prior frames or traversal order.
- Every primary transition, including both loop seams and female held frames, was evaluated against the source-stable-pixel definition above.
- Both GIFs fully decode and loop: male 16 frames / 670 ms, female 27 frames / 1130 ms. GIF centisecond rounding approximates the native 24 FPS schedule.

See [independent audit](independent-audit.json) and [final artifact verification](verification.json). No new production app validation is claimed: application code, catalog, shipped packs and default themes are unchanged. The prior full-theme browser/test results remain in [their own review](../kling-source-pixel-full/README.md).

Reproduce with Python 3.12.14, Pillow 12.3.0 and NumPy 2.3.5:

```sh
/tmp/kling-polish-venv/bin/python scripts/prepare-kling-pixel-style-study.py --batch
```

Use `--root /path/to/gathria-character --output /tmp/pixel-style-recheck` for a separate output directory. The script defaults to the current repository and `artwork/kling-pixel-style-study`. The historical rejected-v1 archive is retained evidence and is not regenerated by the current script. Final visual acceptance remains pending; the existing Source pixel theme stays the preferred production version for now.
