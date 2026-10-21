# Kling-focused workspace

The app has three primary destinations: **Character library**, **Workbench** and
**Player**. The library contains only the original male/female Kling characters.
Each card includes its own prominent **Edit Kling male/female skeleton** button.
Female assets are registered independently from the male source.

The workbench lazily mounts original playback and separate male/female native
skeletal sessions. Switching characters and tabs preserves each session’s joint
edits and undo history. A cross-character project import updates the loaded
identity without replacing its session. Messages are accepted only from the
expected same-origin child. Original playback is never automatically rigged.

| Entry                                        | Function                                          |
| -------------------------------------------- | ------------------------------------------------- |
| `/`                                          | Two Kling cards and their skeleton buttons        |
| `/workbench.html?character=male` or `female` | Original character playback                       |
| `/workbench.html?character=female&mode=rig`  | Selected native skeletal candidate                |
| `/player.html`                               | Independent V2/V3 and Kling source ZIP playback   |
| `/skin-studio.html?character=female`         | Standalone female candidate (male is the default) |

There are four built HTML entries. Classic editor, rig lab, older mother study
and non-Kling Skin Studio are removed. Existing `study=kling-male` query links
continue to work. New configuration is not silently substituted for removed
legacy project formats.

Prepared original packs load lazily, keeping the unchanged source-video artwork
and avoiding rebaking on every selection. Native atlas memory remains substantial;
this cleanup is not a new compression or mobile-performance milestone.

[Cleanup evidence and compatibility](KLING_FOCUS_REVIEW.md) ·
[Five-action packs](kling-jump/README.md) ·
[Male candidate limits](KLING_NATIVE_STUDY_REVIEW.md) ·
[Female candidate and new verification](KLING_FEMALE_NATIVE_REVIEW.md).
