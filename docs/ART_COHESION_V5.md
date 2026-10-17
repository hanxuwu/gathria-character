# Character art cohesion V5

Historical V5 delivery; the current batch is [V6 polish](ART_POLISH_V6.md). The verification counts below describe the original V5 session.

V5 addresses the bride/groom head-to-body seam and procedural expression patches. At V5 delivery, new characters started in V5; saved V1–V4 configurations retain their renderer until **Create refined copy** is selected.

本轮先修新娘长卷发与新郎短发。素材问题包括各部位绘制方式不一致、裙摆内嵌静态手部；合成问题包括矩形擦眼后补画表情、头颈裁切与变形、肤色/发色遮罩混淆，以及外套下摆裁切缺口。V5 使用完整绘制的三种头部状态与同源婚礼服装，重新登记颈部、腰线和脚底坐标，修正分层、遮罩和关节重叠。以下对比和循环均来自应用实际导出。

## Findings and changes

| Finding in V4 | V5 change |
| --- | --- |
| `expressionPixels` erases rectangular eye regions by interpolating nearby skin, then draws arcs; the rest of the expression remains unchanged. | Three complete authored heads, registered to the same neck landmark. Brows, eyes, cheeks, mouth and surrounding face pixels are selected together. |
| The portrait is cut at fixed row 114. Face-shape stretching continues into the neck, while the garment uses a separate source. | Wedding torso/head come from the same source and shared landmarks. Jaw deformation tapers to identity at the neck. Old garments keep their attachment coordinates. |
| Hair, skin and fabric came from separate production images with different rendering characteristics. | Bride/groom wedding art comes from one coherent source; skin tint retains a restrained amount of the source's warm chroma. |
| Generic connected-component cleanup would delete one side of the long rear hair. | Rear hair explicitly preserves both authored tails. |
| Standing hands embedded in a full-character skirt source duplicate during arm animation. | A dedicated imagegen-cleaned garment backplate supplies the hand-free skirt; arms remain separate. |
| The generic torso cut stops above the new suit's coat hem, exposing a rectangular gap near the hip. | The V5 suit mask retains its complete authored hem with overlap over the trousers. |
| Hue-only masks confuse warm hair highlights with skin and miss bright skin pixels. | Anatomical face/ear/arm ownership protects skin highlights and keeps eye ink independent of hair recoloring. The head cut follows the neck rather than retaining a horizontal strip of body material. |

The portable manifest remains CharacterPack v1, with 192×256 frames and anchor (96,240). V5 uses a new generator ID. Idle breathing, articulated walking, rear-hair/skirt motion, left-facing playback, recoloring, saved configurations and self-contained ZIP export remain available. Whole-face artwork replaces the old procedural blink for the two new portraits; V5 does not synthesize a blink from eye erasure. Left-facing playback mirrors the exported native-right frames, including asymmetric accessories.

## Inspect the real outputs

All panels below are assembled from PNGs emitted by the browser's **actual generator and exporter**. The source art sheet is never substituted for exported evidence.

- [Before/after at native size](art-cohesive/before-after-1x.png)
- [Before/after at 2×](art-cohesive/before-after-2x.png)
- [Face and neck at 4×](art-cohesive/face-neck-4x.png)
- [Three expressions per character](art-cohesive/expressions-2x.png)
- [Both heads with every upper garment](art-cohesive/wardrobe-1x.png)
- [Dark complexion and blonde hair](art-cohesive/recolor-2x.png)
- [Idle](art-cohesive/idle-right.gif), [walk right](art-cohesive/walk-right.gif), [walk left](art-cohesive/walk-left.gif)
- [All eight walking poses](art-cohesive/walk-frames.png)
- [Browser verification evidence](art-cohesive/evidence-index.json)

GIFs follow the manifest's frame order and timing but use GIF palette quantization. PNGs and ZIPs are the color-accurate deliverables. Previews use a neutral background, not a Gathria production scene.

## Reproduce

1. `npm ci`
2. `python3 scripts/prepare-cohesive-assets.py`
3. `npm run typecheck && npm test && npm run build`
4. `node scripts/generate-cohesive-evidence.mjs` (requires Playwright Chromium; optional `CHROMIUM_PATH` / `CHROMIUM_ARGS_JSON`)
5. `python3 scripts/render-cohesive-review.py`
6. `npm run test:e2e`

The evidence script verifies repeatable generation, configuration round-trips, ZIP validation, exact PNG decoded-pixel equality, and independent idle/left/right playback after closing Studio. It checks that the independent player loads no editor/generator module and no remote generation service.

Verified locally: TypeScript/build succeeded, 193 unit tests passed, and all 9 Chromium end-to-end tests passed. The export evidence contains 20 pixel-verified packs and 8 independent playback runs (two characters × idle/walk × left/right). Both new heads were also checked across all five upper garments and all twelve exported poses for clipping, opaque-alpha edges, the neck bridge and the shared floor baseline. These structural checks complement the visual panels; they do not replace visual judgment.

## Scope and remaining limits

This is a bride/groom-focused improvement, not a replacement of every hairstyle's source art. Waves and crop have the new three-state face artwork; bob/crest retain their original open-eye face. The other everyday garments remain the existing illustrated wardrobe. The animation is a deterministic articulated 2D rig with secondary motion, not individually painted walk frames. The visual reference guides direction; exact stylistic equivalence and Gathria production integration are not claimed.
