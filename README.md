# Gathria Character

A browser-local workspace focused on the two approved **Kling male and female
characters**. Their source-video artwork is the visual baseline. This repository
contains their original playback, portable export and the separate male and female native
skeletal candidates; unrelated classic characters and experiments have been
removed from the working tree.

## Open the app

Use Node.js 22.12+ (Node 24 recommended):

```sh
npm ci
npm run dev
```

Open the address Vite prints. In **Character library**, use **Open character** on
either card to inspect and arrange its **Sprite actions**. The default action
settings preserve the original video playback. **Dress Kling male/female** opens
the registered wardrobe; separate **Edit Kling male/female skeleton** buttons
retain the optional skeletal candidates.

| Main destination                             | Available now                                                        |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `/`                                          | Two originals, wardrobe and optional skeleton entries                |
| `/workbench.html?character=male` or `female` | Sprite actions, wardrobe and persistent skeletal sessions            |
| `/player.html`                               | Independent CharacterPack V2/V3 and Kling source ZIP playback/export |

`/workbench.html?character=female&mode=wardrobe` opens the female wardrobe;
use `character=male` for the male. Choose **Everyday** or **Wedding**, then inspect
all five actions in either direction. **Original** restores the source pixels.
Save an editable project to continue changing clothes, or export a CharacterPack
for the independent player. [Latest clothing comparisons and downloads](docs/kling-wardrobe/fit-polish/README.md) · [Wardrobe guide](docs/kling-wardrobe/README.md).

The [cold-start review](docs/kling-wardrobe/cold-start/README.md) records faster
opening and reduced interface blocking through background source preparation,
with unchanged exported artwork. The earlier
[loading-reuse review](docs/kling-wardrobe/loading-reuse/README.md) covers faster
first clothing selection and repeat switching.

`/workbench.html?character=female&mode=rig` opens the female skeleton directly;
use `character=male` for the male. `/skin-studio.html?character=female` is the
standalone view. Existing male links retain their default behavior. There are three primary destinations and four HTML build entries.

## What is ready

- Source-bound wardrobe: 17 authoring anchors per pose, registered tops, bottoms,
  full-body dresses and shoes, complete male casual/wedding outfits, five actions, source
  comparison, anchor overlay, portable editable projects and baked CharacterPack
  exports. Future clothing imports require a complete registered pose bank;
  one standing PNG is not automatically fitted to every action.

- Motion-flow candidates restore fast moving source poses and schedule action
  changes at reviewed support/landing boundaries. Full jump recovery returns
  to idle in the independent player; prior loop studies remain separate.
  [Open motion and transition review](docs/kling-motion/README.md).
- Separate keyframe loop candidates: **52 original drawings per character**,
  five repeating actions, explicit review entry and portable V2 packs. The
  repeated-hop jump is separate from the unchanged original one-shot.
  [View comparisons and open the candidates](docs/kling-keyframes/README.md).
- Sprite actions: contiguous source-frame selection, FPS and loop settings,
  frame stepping, first/last inspection, undo/reset, self-contained project
  save/reopen and existing-format CharacterPack export. Original PNG bytes stay
  unchanged. [Usage and review](docs/SPRITE_ACTIONS_REVIEW.md).
- Both originals: idle, walk, run, one-shot jump and celebrate at source timing;
  right/left playback, comparison, scrubbing, pause/replay and native V3 export.
- Each skeletal candidate: fifteen registered 704×1056 parts, four static poses,
  joint-angle edits, undo/reset, native project save/reopen, PNG and static V2
  CharacterPack export. Standing reconstruction matches the approved source.
- Local processing, checked ZIP/PNG imports and SHA-256 validation, including
  ordinary HTTP contexts. No runtime image-generation API or server upload.

The skeletal poses are **standing, walk contact, run flight and raised arms**;
these are not complete animation cycles. Clothing and expression in the skeletal
candidates are fixed. Wardrobe uses separate source-sprite motion packs and does
not change those skeletons. Facial layers and continuous skeletal animation
remain future work.
Shoulder/armhole/shorts deformation and hidden-paint shading limitations remain
visible and are documented; this is not a claim of natural finished animation.

## Files and development

- `artwork/kling-playback`: source selection, extraction recipe and four-action archive.
- `artwork/kling-jump`: unchanged five-action source, previews and provenance.
- `artwork/kling-keyframes`: phase-based selection, source IDs and pose holds;
  no new artwork. Candidate exports and evidence are in `docs/kling-keyframes`.
- `artwork/kling-motion`: restored source poses and explicit action-transition
  routes; actual V3 packs and evidence are in `docs/kling-motion`.
- `artwork/kling-native-study`: exact male reference, hidden-joint supplementary
  painting, fifteen parts, registration and editable project.
- `artwork/kling-native-female`: female-specific source, supplementary paint,
  fifteen parts, registrations and editable project.
- `artwork/kling-wardrobe`: garment design provenance, registrations and preparation review.
- `docs/kling-wardrobe`: clothing library, authoring kits, review and actual exports.
- `src/wardrobe`: source-bound project, compositor and wardrobe editor.
- `src/core`: bounded archive/PNG validation, native packs and source conversion.
- `src/consumer`: independent player and two-character catalog.
- `src/skeletal`: native candidate and character-neutral limb geometry.
- `src/workspace`: library, workbench and navigation.

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Preparation requirements are in `artwork/requirements.txt`. Source extraction
also needs FFmpeg and the original videos; retained source archives and packs
can be used without re-extracting or regenerating any art.

[Cleanup scope, compatibility and verification](docs/KLING_FOCUS_REVIEW.md) ·
[Five-action previews and packs](docs/kling-jump/README.md) ·
[Male skeletal candidate and downloads](docs/kling-native-study/README.md) ·
[Female skeleton, comparisons and downloads](docs/kling-native-female/README.md) ·
[Asset provenance](docs/ASSET_PROVENANCE.md).

Classic Art V1–V7, non-Kling skin/wardrobe projects, legacy CharacterPack V1 and
old editor/lab routes are intentionally removed. They remain recoverable from
Git history at `158efad`; the current app does not silently upgrade those files.
Kling V2/V3 packs and native candidate project files remain supported.
Production Gathria integration is still [unverified](docs/GATHRIA_COMPATIBILITY.md).
