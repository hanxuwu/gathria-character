# Reusable character skeleton and skin packs

This milestone turns the single-Denim skeletal study into a separate authoring application at `/skin-studio.html`. A common bone hierarchy and motion library drive different imported skin packs. A new character supplies **PNG attachments plus binding data**; the generic renderer does not import character presets, old source banks or a list of accepted character identities. The production Studio, old configurations and the original Denim experiment remain unchanged.

Baseline: verified `391d842c5241814aca39bed94df4373e0ceb346f`, draft PR #4. Its two remote checks passed before this batch. Development continues on `feat/reusable-character-rig` and remains separate from the production default.

## User workflow

1. Open `/skin-studio.html` after `npm run dev`. Choose Denim or Coral as a starting skin. Both use the same rig and actions.
2. Download its skin template. Paint/generate replacement parts on the full 192×256 transparent canvases using the supplied registration guide. Keep the guide separate from the artwork.
3. Import a skin ZIP, or replace a selected attachment with a PNG. The existing binding is retained, then may be adjusted by its source joint coordinates or local offset. Individual PNG import explicitly snaps partial alpha to crisp pixels; loading a previously saved skin/project requires exact binary alpha and does not silently modify it.
4. Check idle, walk and run, both facings and all three expression states. Inspect source parts, connection points, the posed skeleton and mesh before exporting.
5. Save a **skin pack** for reuse, an **authoring project** to retain the full rig/motion/skin/preview state, or a **baked CharacterPack** for independent playback.

The new application uses the existing source illustrations to demonstrate reuse. It does not generate artwork through an API. Future generated illustrations still need coherent lighting/identity, part separation and painted coverage behind joints; a completed single illustration is not automatically animation-ready.

## Data boundaries

| Data              | Contents                                                                                                                                     | Reused across characters             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Rig definition    | Versioned bone hierarchy, frame/anchor, root pivot, chain structure and draw order                                                           | Yes                                  |
| Motion library    | Idle, walk and run keys, frame sequences and timing                                                                                          | Yes                                  |
| Skin metadata     | Identity/name, compatible rig family, source joint registration, local attachment offsets, mesh and cloth/hair parameters, source provenance | Supplied with each skin              |
| Skin PNGs         | Full-frame RGBA layers with semantic slot names                                                                                              | Replaceable without renderer changes |
| Authoring project | Rig, motions, skin metadata/PNGs and preview state                                                                                           | Editable local source                |
| CharacterPack     | Baked atlas and ordinary playback metadata                                                                                                   | Existing independent player          |

One shared hierarchy does not imply identical crop landmarks in every source painting. Denim's long trousers and Coral's skirt expose different parts of the leg; sleeve connection points also differ. Skin binding landmarks fit the common hierarchy to those registered cuts. They do not create a character-specific action function. The first supported family retains V6-scale proportions and a right-facing three-quarter source view.

The required 15 slots are torso, hips, near/far upper arm and forearm, near/far thigh/shin/shoe, and complete neutral/gentle/joyful head states. Back hair and a garment overlay are optional. A forearm currently includes the hand; head states include the authored front hair. This preserves coherent existing drawings. Separate interchangeable hands/front hair, generalized body proportions, custom bone creation and arbitrary weight painting are later extensions.

## Compatibility and provenance

Existing core renderers, configuration parsing and consumer code are preserved. This authoring system has its own versioned formats; it does not reinterpret existing saved characters. All three actions in a new skin pack are generated from its layers and shared motion data, so the new authoring output is not claimed pixel-identical to historical idle/walk rendering. Historical files still use their original renderers.

The baked pack keeps the existing five-file CharacterPack contract and identifies `gathria-reusable-rig-v1`. Its `character.json` is a compatibility/source-appearance reference; it cannot reconstruct arbitrary imported art in the ordinary Studio. The full authoring ZIP is the reproducible source and includes the actual PNG layers. Provenance describes the supplied artwork rather than claiming an imported image was drawn by this project.

## Scope and visual limits

The first reusable examples are Denim and Coral. Their existing V6/earlier garment illustrations and corrected Motion 3 ownership are converted into ordinary full-frame layers. No new illustration is needed to prove character reuse. The common skinning method still stretches source texture at deep bends; hidden clothing or better creases may require replacement art. Mesh overlap is deterministic, not a cloth collision solver. These are in-place animations without production Gathria scene integration or user visual acceptance.

## Verification executed for this batch

- **323 unit tests across 21 files passed**, including 30 new renderer, import and integration tests. TypeScript and the production build passed with all four HTML entries. The existing large-artwork-chunk warning remains.
- **34 Chromium E2E tests passed**, including five new Skin Studio workflows: both skins/all actions/expressions/facings, PNG replacement, binding edits, real skin/project/template files, invalid imports retaining work, and independent playback after closing the authoring page.
- A newly named external skin with a changed torso PNG renders all 24 keys through the same rig and motion data. Freshly decoded skin and project archives reproduce their original frame pixels. Legacy V6 appearance references without a motion version can export; edited run FPS survives into the baked manifest and integration instructions.
- Two skins × three actions × two directions passed **12 independent live-player cases**, checking native pixels, frame sequence and loop timing after all authoring pages closed. Ten exported atlases, including baseline and expression variants, decode to their generated pixels. The four delivered CharacterPack ZIPs (two new, two baseline) and six skin/project/template ZIPs pass integrity and member checks. Seven GIFs were reopened frame by frame and verified against their expected quantized pixels, frame order and centisecond timing.
- Forty-one historical source files match the retained hash baseline. `src/core`, `src/editor`, `src/consumer` and `src/experiments` have no diff against the starting commit. Old product workflows are included in the full test run.

The [verification record](reusable-rig/verification-results.json) separates this batch's tests from historical results. The complete [file inventory](reusable-rig/file-integrity.json) decodes and hashes **92 PNGs, seven GIFs and ten ZIPs**, including both template guides and the extracted source attachments.

An initial simultaneous unit/browser/evidence run overloaded the local test environment: one unchanged historical test reached its 20-second timeout and the strict live capture missed one observed frame. The complete unit suite passed in 19.57 seconds when rerun without the browser workload; the isolated evidence capture passed all twelve cases. Assertions and timeouts were not weakened. [Capture attempts](reusable-rig/capture-attempts.json) records the incomplete capture separately. These are current executions; earlier milestone counts remain historical.

The functional work also fixes first-RAF negative elapsed time, fractional pixel-offset ambiguity, silent shoe-offset cancellation and invalid renderable-part imports that could previously unmount the authoring UI. Focused regressions cover those paths.

## Actual visual review and files

[The delivery index](reusable-rig/README.md) links every skin, template, full authoring project and independent CharacterPack. Start with [right-facing running](reusable-rig/run-lineup-right-2x.gif), [left-facing running](reusable-rig/run-lineup-left-2x.gif), [action switching](reusable-rig/action-switch-preview.gif), the [native comparison](reusable-rig/comparison-1x.png), [all run keys](reusable-rig/run-keyframes-1x.png), and [six expression examples](reusable-rig/expressions-2x.png). [The material guide](SKIN_PACK_V1.md) explains the next character's preparation and binding workflow.

Native and integer-zoom frame inspection found stable identity, head/neck proportion and costume silhouettes across the two skins. Coral's blue underskirt remains part of its fixed garment. Source ownership is retained through the larger arm poses. The new result is a reusable animation architecture, not a claim of a new illustration style: neutral/gentle expressions remain subtly different, and deep folded knees still compress the original texture. Loop order and timing were checked in the live independent player separately from the still-image review. No user visual approval is implied.

Implementation recovery point: `57cb0c7c68a92bab84c45ce73812f28db6472386`, pushed to `feat/reusable-character-rig`. The following delivery commit adds the scripts, exported assets and review records. The new draft PR targets the still-unmerged `experiment/denim-skeletal-rig` parent branch; nothing is merged or deployed.
