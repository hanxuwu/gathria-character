# Gathria Character

A browser-local workspace focused on the two approved **Kling male and female
characters**. Their source-video artwork is the visual baseline. This repository
contains their original playback, portable export and the separate male native
skeletal candidate; unrelated classic characters and experiments have been
removed from the working tree.

## Open the app

Use Node.js 22.12+ (Node 24 recommended):

```sh
npm ci
npm run dev
```

Open the address Vite prints. In **Character library**, use **Open character** on
either card for playback. The male card has a prominent **Edit Kling male
skeleton** button. The female skeleton has not been created; her original
playback remains available and is never substituted with male artwork.

| Main destination                             | Available now                                                        |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `/`                                          | Two original character cards and the male skeleton button            |
| `/workbench.html?character=male` or `female` | Original playback and a persistent, explicitly male skeletal tab     |
| `/player.html`                               | Independent CharacterPack V2/V3 and Kling source ZIP playback/export |

`/workbench.html?mode=rig` opens the male skeletal tab directly.
`/skin-studio.html` is its standalone view. Existing `study=kling-male` links
still work. There are three primary destinations and four HTML build entries.

## What is ready

- Both originals: idle, walk, run, one-shot jump and celebrate at source timing;
  right/left playback, comparison, scrubbing, pause/replay and native V3 export.
- Male skeletal candidate: fifteen registered 704×1056 parts, four static poses,
  joint-angle edits, undo/reset, native project save/reopen, PNG and static V2
  CharacterPack export. Standing reconstruction matches the approved source.
- Local processing, checked ZIP/PNG imports and SHA-256 validation, including
  ordinary HTTP contexts. No runtime image-generation API or server upload.

The skeletal poses are **standing, walk contact, run flight and raised arms**;
these are not complete animation cycles. Clothing and expression are fixed.
Female skeletal registration, wardrobe, facial layers and continuous skeletal
animation remain future work. Existing shoulder/armhole/shorts deformation limits
are retained and disclosed; cleanup does not claim an art improvement.

## Files and development

- `artwork/kling-playback`: source selection, extraction recipe and four-action archive.
- `artwork/kling-jump`: unchanged five-action source, previews and provenance.
- `artwork/kling-native-study`: exact male reference, hidden-joint supplementary
  painting, fifteen parts, registration and editable project.
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
[Asset provenance](docs/ASSET_PROVENANCE.md).

Classic Art V1–V7, non-Kling skin/wardrobe projects, legacy CharacterPack V1 and
old editor/lab routes are intentionally removed. They remain recoverable from
Git history at `158efad`; the current app does not silently upgrade those files.
Kling V2/V3 packs and native candidate project files remain supported.
Production Gathria integration is still [unverified](docs/GATHRIA_COMPATIBILITY.md).
