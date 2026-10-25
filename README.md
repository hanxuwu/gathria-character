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
the registered wardrobe. **Explore Kling male/female themes** opens the new
authored theme workspace; separate **Edit Kling male/female skeleton** buttons
retain the optional skeletal candidates.

| Main destination                             | Available now                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `/`                                          | Two originals, wardrobe and optional skeleton entries                   |
| `/workbench.html?character=male` or `female` | Sprite actions, wardrobe, themes and persistent skeletal sessions       |
| `/player.html`                               | Independent CharacterPack V2/V3/V4 and Kling source ZIP playback/export |

`/workbench.html?character=male&mode=themes` opens **Character themes** directly;
use `character=female` for the other character. Choose **Kling original** or
**Pixel storybook**, then a **Theme look** (base or wedding). Both themes contain
all five actions. Original restores the accepted source artwork; the pixel
theme is independently authored artwork with its own native resolution and
timing. Theme looks are complete painted variants, not automatically restyled
wardrobe pieces. The existing wardrobe remains available for layer editing.
[Theme usage, actual exports, compatibility and limitations](docs/kling-themes/README.md).

`/workbench.html?character=female&mode=wardrobe` opens the female wardrobe;
use `character=male` for the male. Choose a recommended everyday or wedding look, then inspect
all five actions in either direction. **Original** restores the original clothing.
**More outfits and earlier versions** reveals the rest of the catalog; existing
projects retain their original assets. The [Sprints 11–15 review](docs/kling-polish/README.md)
covers softer crouched waist joins, two sculpted hair shading revisions,
downloadable paintable poses and exact custom-material look restoration.
The [Sprints 16–20 review](docs/kling-fit-workflow/README.md) adds two male cuff
revisions, safe cleanup of unused saved artwork and exact local-material loading.
In that batch, female dresses retained V6 after two rejected waist trials.
The [Sprints 21–25 review](docs/kling-pose-review/README.md) adds an item-scoped
male crossing-sleeve repair and native female crouch-fold revisions, with old
looks retained. It also adds neighboring-pose painting kits and direct action
GIF downloads; actual comparisons and remaining contour limits are recorded.
The [Sprints 26–30 review](docs/kling-contour-review/README.md) follows with a
curved male crossing cuff and small female waist-edge repairs. **Inspect
connections** offers contrasting backgrounds and silhouettes; **Download
comparison GIF** saves synchronized original/current animation panels.
The [Sprints 31–35 workflow](docs/kling-look-workflow/README.md) adds exact
**Undo styling / Redo styling**, **Pin current look** and pinned/current PNG/GIF
comparisons. **Find an outfit** searches all versions; 37 outfit pictures come
from actual application exports. History and pinned references stay in the
current session; portable wardrobe and CharacterPack formats remain unchanged.
The [Sprints 36–45 review workbench](docs/kling-review-workbench/README.md) adds
**Open look review** below the character preview: anchored overlays and pixel
differences, cancellable action scans, exact-look issue notes with local persistence,
and portable notes/contact-sheet review bundles. Notes bind to actual material
revisions; changed-pixel metrics help locate differences and are not art scores.
The [Sprints 46–55 repairs](docs/kling-repair-handoff/README.md) add optional
**Teal joined sleeve**, **Coral reviewed arm join** and **Ivory reviewed arm join**
clothing pieces. **Preview imported clothing** compares all actions before
explicit apply/discard. Review notes can be explicitly carried to a compatible
new look with every copied issue reopened; existing presets remain unchanged.
The [Sprints 56–65 browser painting workflow](docs/kling-paint-roundtrip/README.md)
adds **Preview painted poses** under **Fitting guides**: reimport native painting
kits, preserve ownership/alpha, inspect a candidate, and save a reusable garment
without running a script. **Motion continuity** inside **Open look review**
compares consecutive drawings, holds and loop closure against the original or
pinned look, with native PNG pairs, original-timing GIFs and hashed reports.
In **Hair & face**, choose the original styles or the six fuller styles:
**Airy tousle**, **Soft curls**, **Swept quiff**, **Romantic waves**, **Ribbon pony**,
and **Braided crown**, then a hair color and an optional **Gentle** face.
The two original hairstyles work on either character. **Reset
appearance** restores the original head; clothing and head choices are independent.
Save an editable project to continue changing clothes, or export a CharacterPack
for the independent player. [Earlier clothing fit review](docs/kling-wardrobe/fit-polish/README.md) · [Wardrobe guide](docs/kling-wardrobe/README.md).

**Face expression** now offers **Natural (original)**, **Gentle smile** and
**Joyful** for both characters and all existing hairstyles. Joyful uses the
character's own original celebration mouth with registered brow/cheek treatment;
source blinks and laughter remain. Old saved projects keep their embedded
artwork; use **Preview updated appearance**, save a separate copy, then reopen
that copy to access the new choice. [Expression artwork and preservation checks](docs/kling-expression/README.md).
Search **Find an outfit → Midnight sailor** to try the new male sailor shirt,
or choose **Midnight sailor shirt** in the top slot and mix existing trousers.
Its garment bank was saved through the browser's painting-kit workflow.

The [nine-outfit collection](docs/kling-collection/volume-v1/README.md) adds daily
and occasion looks. The [five-sprint review](docs/kling-sprints/README.md) adds a
refined ponytail and **Ivory refined** outfit, exact-frame connection inspection,
named looks and cancellable loading. In the wardrobe, **Inspect connections**
shows original/current crops; arrows and **Preview speed** help examine motion
without changing exports. **Saved looks** stores up to 12 combinations per
character and their exact artwork in this browser. Refreshing preserves custom
materials saved this way; browser-data clearing does not. **Save wardrobe** remains the portable backup with
the actual artwork. Verified downloads are reused within a bounded 96 MiB
session cache; **Cancel preparation** retains the last accepted outfit.
**Saved looks → Artwork stored in this browser** shows storage usage and removes
unused managed materials while keeping both characters' saved looks and the open
project. Older entries are retained; safe cleanup requires HTTPS or localhost.

[Hair, face, actual animation previews and downloads](docs/kling-appearance/README.md).
Hair cards and named color swatches offer a quick selection alongside the existing
controls. Older saved appearances have **Preview updated appearance** for a
same-frame comparison, followed by **Save updated copy**. Reopen the downloaded
copy to use it; the original open project and unsaved edits stay unchanged.
[Current hairstyle expansion, motion review and limits](docs/kling-appearance/expansion-review/README.md).
Existing projects open with their original appearance. New head choices are
stored with their source-bound assets in an editable V2 wardrobe project;
ordinary baked CharacterPacks still play independently.

The [cold-start review](docs/kling-wardrobe/cold-start/README.md) records faster
opening and reduced interface blocking through background source preparation,
with unchanged exported artwork. The earlier
[loading-reuse review](docs/kling-wardrobe/loading-reuse/README.md) covers faster
first clothing selection and repeat switching.

`/workbench.html?character=female&mode=rig` opens the female skeleton directly;
use `character=male` for the male. `/skin-studio.html?character=female` is the
standalone view. Existing male links retain their default behavior. There are three primary destinations and four HTML build entries.

[Eight current combinations: feature summary and actual five-action GIFs](docs/kling-combination-gallery/README.md) compare everyday, wedding and mixed looks with independently selected hair and colors.

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
not change those skeletons. Its optional head layers provide registered short,
curled and tied hairstyles, three hair colors and a restrained gentle facial preset, while original action
blinks/laughter remain intact. Freeform face editing, long-hair simulation and
continuous skeletal animation remain future work.
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
- `src/appearance`: checked head-appearance banks, selection and alpha composition.
- `artwork/kling-appearance`: hair donors, prompts, head guides and preparation provenance.
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
