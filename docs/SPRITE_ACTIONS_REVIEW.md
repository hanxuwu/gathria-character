# Arrange actions from original sprite frames

The Workbench now starts with **Sprite actions**, using the existing original
Kling packs and player. The separate male/female skeleton tabs remain optional
and unchanged. This batch does not generate artwork or extend the skeleton.

Open a library character, choose a motion, then use **Sprite action settings**.
The original pack's five actions are initially preserved exactly. For an action,
select its start/end positions, FPS and loop/one-shot behavior, then apply the
settings. Frame selection is a contiguous range of that action's original
sequence, not a renumbering of atlas frame IDs. A one-frame range is valid.
Unavailable actions remain unavailable.

## Inspect and review

Existing pause/replay, scrubbing, slow preview speed, smooth zoom, comparison and
left/right facing are retained. Frame stepping and first/last-frame comparison
make source-frame selection and loop seams inspectable. Source frame/time
information is shown when supplied by the pack. Preview speed is separate from
the action FPS written to an export.

The original atlas PNG files, frame rectangles, anchor, resolution, alpha and
source frame/time mapping remain unchanged. Editing playback timing does not
claim to repair pose drift, foot sliding, source motion blur or loop mismatch.
Automatic interpolation, per-frame alignment, per-frame durations, arbitrary
frame reordering, facial changes and clothing changes are outside this batch.

## Save and export

**Save action project** creates an explicit version1
`gathria-sprite-action-project` ZIP with two files:

- `document.json`: source ZIP SHA-256 and all available action settings.
- `original.character.zip`: complete unchanged original CharacterPack.

Start/end are inclusive zero-based positions internally and one-based in the
interface. The project is canonical and self-contained; it can be reopened
without the source folder or internet. Original clips stay available for reset.
ZIP entries and expanded sizes are bounded, CRC and source SHA-256 are verified,
and invalid metadata cannot silently redefine an original clip.

**Export edited CharacterPack** keeps the source V2/V3 format. The independent
player needs no authoring code: it already honors the resulting frame list,
FPS and loop/one-shot metadata. All original PNG pages remain byte-identical.
An untouched or fully reset project exports the exact original ZIP. Edited
packs append truthful timing-edit provenance; their original image/source
provenance is retained. ZIP compression/timestamps for edited packs follow the
existing writer, while the editable project archive is canonical.

The default `/player.html` remains a playback/import/export consumer. Authoring
is loaded lazily only for `/player.html?authoring=1`, including the embedded
Workbench. The workbench's separate-player link opens the source player;
to inspect modified timing independently, load the edited CharacterPack.

## Implementation and review evidence

- `src/core/sprite-actions.ts`: original-source contract, validation, derivation,
  project persistence and existing-format export.
- `src/consumer/SpriteActionEditor.tsx`: editing, first/last inspection and project
  controls; `PackPlayer.tsx` reuses the existing decoded images and playback.
- `src/workspace`: primary sprite workflow and retained optional skeleton tabs.
- `sprite-actions.test.ts`, `tests/e2e/sprite-actions.spec.ts`: source preservation,
  archive safety, UI save/reopen, modified timing and independent playback.

[Actual screenshots, artifact checks and this batch's verification](sprite-actions/README.md).

This batch is based on `d583cda`, the female skeleton candidate in PR#22. Its
separate PR targets that feature branch while PR#22 remains unmerged. No main
history is rewritten and no deployment or merge is part of this delivery.
