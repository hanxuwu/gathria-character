# Project-owned skeletal authoring trial

This is a working, isolated **Denim daytrip** authoring workflow: registered layers → bone chains → weighted textured meshes → twelve pose keys → native-resolution frame bake → ordinary CharacterPack playback. It uses no Spine software, runtime, interchange format, dependency or third-party animation implementation. The existing Studio still defaults to V6 / Motion 3.

Start `npm run dev` and open **`/rig-lab.html`**. Compare the original and experimental frames at 1× or 2×, step or play either direction, show the skeleton/mesh, adjust joint influence and the selected running key, then save/reopen the rig recipe or export a transparent frame/CharacterPack. The comparison uses the actual baked RGBA frames. Overlays are diagnostics and are excluded from exports.

## What is implemented

| Part | Implementation |
| --- | --- |
| Sources and attachment registration | Existing V6 `polishedBank` with unchanged Denim appearance and Motion 3 ownership masks. No new image generation or source painting. |
| Skeleton and pose keys | Root body transform; shoulder–elbow–wrist and hip–knee–ankle chains. Two-bone knee placement, rigid shoes and head/neck/torso. Default keys preserve Motion 3 targets, 12 frames, 18 fps and opposite-limb phase offset. |
| Mesh and weights | Three-pixel grid, two normalized influences per vertex, smooth influence transition around the source joint, bounded local width correction. Texture coordinates refer to the original registered source pixels. |
| Rasterization | Project-owned CPU textured triangles with nearest-neighbor sampling and binary source alpha. Shoes are excluded from the leg texture and drawn once as separate attachments. |
| Layer order | Far arm → far leg → near leg → hips → torso → near arm → head; the inherited V6 head/neck treatment is unchanged. |
| Authoring | Inspect geometry; adjust joint blend radius and volume preservation; edit foot lift and arm angle per key. The opposite limb follows the edited key six frames later. |
| Baking | A separate experimental generator replaces only the run cells. Idle/walk atlas rows are copied byte-for-byte. Frame size 192×256, anchor (96,240), left-facing mirror, timing and ordinary pack layout are retained. |

Main files: [`project.ts`](../src/experiments/denim-rig/project.ts), [`mesh.ts`](../src/experiments/denim-rig/mesh.ts), [`rig.ts`](../src/experiments/denim-rig/rig.ts), [`bake.ts`](../src/experiments/denim-rig/bake.ts), [`lab.tsx`](../src/experiments/denim-rig/lab.tsx). The experimental pose/composition adapter was derived from this repository's own frozen `running-rig-v3.ts`. No production core module was edited.

## Reproducibility and compatibility

`gathria-skeletal-project`, schema 1, binds the frozen Denim appearance and source revision `ea01dd8e074741fdfab0311e1e64585329c29391`. Its JSON contains the twelve keys and mesh settings; the versioned implementation derives topology and weights deterministically. Other appearances, source revisions, nonfinite/out-of-range parameters and incorrect frame counts are rejected. This is a focused recipe editor, not yet a general-purpose rigging application or weight-painting tool.

The baked pack identifies `gathria-denim-skeletal-v1` and retains the existing five-file CharacterPack contract. It is playable without this authoring page. **`character.json` describes the preserved production appearance: reopening it in ordinary Studio intentionally regenerates Motion 3.** Reopen the separate `.rig-project.json` in the lab to reproduce the experimental run. A recovery copy of the exact recipe is embedded between `BEGIN GATHRIA RIG PROJECT` and `END GATHRIA RIG PROJECT` in `PROVENANCE.txt`. That file separately identifies historical AI-assisted artwork provenance and this new technical deformation. No saved character is silently upgraded.

## Visual review and limits

The first candidate was reviewed at native size and 3× joint crops across all twelve run poses. It reduces the inflated appearance of some folded knees and preserves continuous visible elbows, cuffs and ankles in the checked frames. The difference is modest. A second parameter comparison (blend radius 8, volume 1) made recovery knees rounder; the selected defaults remain radius 6 and volume 0.65. This is a technical authoring milestone, not a claim of user visual acceptance or a replacement of the production default.

Deep flexion still produces a U-shaped silhouette and stretches existing cloth texture. A weighted mesh cannot invent newly visible cloth, better folds or a different painted side view. Inner-bend triangles can invert and overlap; the rasterizer handles both windings deterministically, but this is not a collision-free anatomical mesh. Source-specific topology/weight painting and a small number of authored crease/pose corrections are the next appropriate improvements. Increasing a global volume factor did not solve that limitation.

The bounded trial covers one outfit/identity, fixed twelve-frame keys with no timeline interpolation, and in-place motion. It does not yet include generic texture import, bone creation, free vertex editing, arbitrary wardrobe binding or production Gathria integration. Current Studio customization and all historical artwork/motion renderers remain available unchanged.

## Actual export evidence and verification

All final character comparisons derive from the actual browser-exported pack PNG, with matching frame, background and integer zoom:

- [Native comparison](skeletal-rig/comparison-1x.png) / [2× comparison](skeletal-rig/comparison-2x.png).
- All twelve keys: [1×](skeletal-rig/run-keyframes-1x.png) / [2×](skeletal-rig/run-keyframes-2x.png).
- [Knees and ankles at 3×](skeletal-rig/knees-ankles-3x.png) / [shoulders and elbows at 3×](skeletal-rig/shoulders-elbows-3x.png).
- Paired running GIFs: right [1×](skeletal-rig/run-comparison-right-1x.gif) / [2×](skeletal-rig/run-comparison-right-2x.gif); left [1×](skeletal-rig/run-comparison-left-1x.gif) / [2×](skeletal-rig/run-comparison-left-2x.gif).
- [Idle/walk/run simultaneous comparison](skeletal-rig/idle-walk-run-comparison.gif). Its 12-second presentation loop is a common multiple of all three exported clip periods, avoiding an artificial idle/walk reset. Run-only GIFs round the exact 666⅔ ms period to 670 ms; packs retain 18 fps.
- [Experimental CharacterPack](skeletal-rig/experimental.character.zip), [unchanged baseline pack](skeletal-rig/baseline.character.zip), [editable project](skeletal-rig/project.json).
- [Authoring screenshot](skeletal-rig/authoring-lab.png), [all posed bones/weights/triangles](skeletal-rig/rig-inspection.json), [independent player screenshot](skeletal-rig/independent-player.png).

**Executed in this batch:** 293 unit tests across 18 files; 29 Chromium E2E tests; TypeScript and production build passed. The new lab tests cover recipe edits and file round trips, invalid imports, PNG exports excluding diagnostic overlays, five-file ZIPs and independent run playback. After expanding the idle comparison to all twelve held timeline slots, that focused E2E was rerun and passed. The retained large-asset build warning remains.

Separate browser evidence verified both exported PNGs against generated RGBA, recipe round-trip determinism, full legacy atlas rows and the unchanged run portrait region through y=109. After the lab closed, the existing independent player displayed every idle/walk/run frame in both directions and matched the full native frame, including shoes and its separate attachment guides. All six cases had correct frame order and measured loop durations within 75 ms of the declared interval; no browser errors, external requests or generator/authoring imports occurred. Forty-one historical source hashes matched.

File validation decoded **2 ZIPs / 48 sprite rectangles, 2 RGBA atlas PNGs, 9 review/screenshot PNGs and 5 GIFs**. ZIP CRC/members, transparent boundaries, exact alpha set `{0,255}`, GIF decoded frame order and quantized timing were checked. [Browser evidence](skeletal-rig/evidence-index.json), [artifact checks](skeletal-rig/artifact-validation.json) and [verification record](skeletal-rig/verification-results.json) retain the results. These are current executions; earlier milestone counts remain historical. Functional playback checks and static visual inspection are distinct from user aesthetic acceptance.

Reproduction (sequential):

```sh
CHROMIUM_PATH=/usr/bin/chromium node scripts/generate-skeletal-evidence.mjs
python3 scripts/render-skeletal-review.py
```

The capture owns port 5178. It closes the authoring page before testing the separate player, and blocks generator/experiment requests from that consumer. The renderer verifies GIF source-frame order and rounded durations, PNG decoding and ZIP contents. `SKELETAL_ITERATION=<name>` retains an alternative capture separately.
