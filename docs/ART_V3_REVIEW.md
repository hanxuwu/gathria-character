# Character Art V2 — detailed revision review

This revision replaces the compact default artwork with detailed Japanese chibi illustrations: rounded faces, glossy eyes, overlapping curls, and layered casual/wedding clothing. The new renderer is explicitly **artwork version 3**, preserving the already published V1 and V2 designs. It remains a draft for visual review.

## Visual changes

- Mira has long curling waves and a heart-shaped face; Rowan has a short silver silhouette and an oval face; Jun has a dark rounded bob and fuller cheeks. Face shape remains independently selectable.
- The head, short neck, shoulders, and relaxed arms use rounder proportions. Source hair contains individual overlapping strands and warm highlights; clothing includes seams, fabric folds, lace, and layered hems.
- Four hairstyles, five upper garments, four lower garments, and five material colors remain freely combinable. Polished casual, wedding suit, and wedding dress are editable starting points.
- Artwork is assembled from AI-assisted production illustrations and explicit material masks. Runtime composition, recoloring, and animation are deterministic and local. [Provenance and source banks](ASSET_PROVENANCE.md) distinguish production inputs from actual exported evidence.
- The native frame is now **192×256**, with anchor **(96, 240)** and recommended zoom **1×**. Fine eye, curl, and lace details could not remain readable at 48×64. Old renderers retain 48×64 and (24, 60); the CharacterPack format did not change.

## Actual application evidence

All items below come from the application renderer and exported PNG/manifest files. The production source banks are not substituted for these outputs.

| Review                                                                 | Artifact                                                                                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matched V2/detailed characters, same options, frame and apparent scale | [Comparison](art-detailed/before-after-native.png), [enlarged](art-detailed/before-after-enlarged.png)                                                         |
| Mira, Rowan and Jun                                                    | [Native](art-detailed/lineup-native.png), [2×](art-detailed/lineup-2x.png)                                                                                     |
| Casual and wedding outfits                                             | [Outfits](art-detailed/outfits-2x.png), [wedding pair](art-detailed/wedding-pair.png)                                                                          |
| Face and hair variation                                                | [Faces](art-detailed/face-study.png), [hair](art-detailed/hairstyles-2x.png)                                                                                   |
| Representative character and resolution comparison                     | [Direction study](art-detailed/mira-direction-study.png), [resolution study](art-detailed/resolution-study.png)                                                |
| Full idle/walk loops in both directions                                | [Characters GIF](art-detailed/characters-motion.gif), [outfits GIF](art-detailed/outfits-motion.gif), [wedding pair GIF](art-detailed/wedding-pair-motion.gif) |
| Live independent playback                                              | [Browser recording](art-detailed/independent-player-motion.webm)                                                                                               |
| Application workflow                                                   | [Studio](art-detailed/studio-detailed.png), [player](art-detailed/player-detailed.png)                                                                         |
| Export validation                                                      | [Evidence index](art-detailed/evidence-index.json), [animation metadata](art-detailed/animation-evidence.json)                                                 |

The [previous-draft comparison](art-detailed/previous-draft-comparison.png) also shows the rejected 96×128 procedural candidate beside the detailed output at matched apparent size. Those historical raster snapshots are labeled comparison evidence, not a separately supported artwork version. The [neutral composition](art-detailed/neutral-scene.png) uses real exports and is explicitly not a Gathria scene.

PNG comparisons use integer nearest-neighbor scale and matched neutral backgrounds. Review GIFs use the manifest timing and may quantize colors to GIF's palette limit; PNGs and exported packs are the lossless artwork reference. Exported PNG/ZIP assets retain transparency. Browser recordings capture actual player playback.

Detailed sample packs: [Mira](../public/samples/detailed/mira.character.zip), [Rowan](../public/samples/detailed/rowan.character.zip), [Jun](../public/samples/detailed/jun.character.zip), [casual](../public/samples/detailed/mira-casual.character.zip), [wedding suit](../public/samples/detailed/mira-wedding-suit.character.zip), [wedding dress](../public/samples/detailed/mira-wedding-dress.character.zip).

## Compatibility

V1 configurations dispatch to the frozen V1 renderer. Schema-2 configurations explicitly select artwork 2 or 3. Loading, editing, selecting presets, resetting, and saving older work preserve its original artwork version. **Create detailed copy** is the only editor action that opts old work into V3. Existing face and appearance choices are retained during conversion.

Manifest schema remains **1**. Dimensions, anchor, timing and mirroring are read from metadata. The independent player needs only the PNG and manifest and continues to load V1/V2 packages without importing generator/editor code. All previous sample files remain unchanged. New samples and evidence use separate directories; old regeneration scripts explicitly select their original artwork version.

## Reproduce

Source preparation (only needed when the committed production assets or masks change):

```sh
python3 -m pip install -r artwork/requirements.txt
node scripts/prepare-illustrated-assets.mjs
```

With Vite running, generate actual exports and review media:

```sh
CHROMIUM_PATH=/usr/bin/chromium node scripts/generate-detailed-evidence.mjs
python3 scripts/render-detailed-review.py
```

Preparation and review assembly require Python 3, Pillow and NumPy; the browser application does not. No model call is needed to rebuild the committed assets. Omit `CHROMIUM_PATH` if using Playwright's installed Chromium.

## Verification

Executed on 2026-10-15 using Node 24.19.0, npm 11.9.0, and system Chromium:

- **168 unit tests passed**, no skips: fixed V1/V2 decoded pixel hashes; configuration parsing/copy/round trips; detailed determinism, binary alpha, frame margins, stable ground/portrait geometry, distinct faces, connected clothing, all editable material colors, secondary hair/skirt motion, and pack/player contracts.
- Focused palette regressions cover all six skin tones at the exposed neckline and both hands' independence from lower-clothing colors, including the exact forearm boundary pixels found during visual inspection.
- **Typecheck and production build passed.** The detailed editor bundle is approximately 484 kB before gzip; the independent player does not load the illustration bank.
- **8 Chromium workflows passed** against the final assets and refreshed packs, including old-file pixel preservation, explicit conversion, save/reopen, real ZIP provenance/export, mobile layout, mirrored playback and independent V1/V2/V3 playback with editor/generator/illustration modules blocked.
- The final source-art bank rebuilt **byte-for-byte** in an isolated directory using Pillow 12.3.0 and NumPy 2.3.5. The asset bank and exported PNG hashes are recorded in the evidence index; capture/assembly reject changed inputs.
- **18 real exports** validated; decoded PNG bytes equal generator output. Six public packs and two wedding examples played independently through **32 animation/facing phases**, each observing all declared frame IDs, with no browser errors or generator/editor requests. The live recording lasts 84.25 seconds; the three GIFs each last 9.2 seconds.
- Actual native/enlarged exports, all eight walking poses, six skin tones on light/dark backgrounds, material isolation, desktop/mobile layout, GIF frame timing and recorded independent playback were inspected. PNGs and packs are the authoritative lossless artwork; GIF palette quantization is disclosed.

Remote CI, Firefox, Safari and a fresh environment bootstrap are not claimed as verified.

## Known limits and remaining integration

The character uses one articulated body rig and a mirrored three-quarter view. Animation transforms layered artwork rather than providing separately illustrated poses for every frame. Hair/skirt follow-through is deterministic deformation, not cloth physics. Face shapes share the same eye style. Detailed idle uses breathing and hand/hair motion; its source eyes do not blink. There is no expression selector, body-shape selector or rear view. Extremely dark or low-contrast custom palettes can obscure fine details. The detailed art contains more colors than the old restrained-palette sprites, and the larger source sheet costs more memory.

Gathria scene assets/runtime remain inaccessible: the read-only repository request returned HTTP 403. Any neutral preview composition is explicitly not a Gathria scene, and production integration remains **UNVERIFIED**. A later milestone needs the actual runtime revision and loader/scene contract to verify the larger artwork dimensions, anchor, display scale, texture filtering and timing in a real scene. Firefox and Safari remain unverified. Runtime AI/photo input and production Gathria integration are separate later milestones. Keep the draft PR unmerged and stop for visual review.
