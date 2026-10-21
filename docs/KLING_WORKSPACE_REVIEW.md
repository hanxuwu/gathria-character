# Kling-focused workspace

The app has three primary destinations: **Character library**, **Workbench** and
**Player**. The library contains only the original male/female Kling characters.
The male card now includes a prominent **Edit Kling male skeleton** button.
Female skeletal assets do not yet exist; the UI says so explicitly.

The workbench retains two mounted sessions: original playback and the explicitly
male native skeletal candidate. Tab changes preserve paused playback and edited
pose state. Messages are accepted only from the expected same-origin child.
There is no automatic conversion of the female original into a male skeleton.

| Entry                                        | Function                                        |
| -------------------------------------------- | ----------------------------------------------- |
| `/`                                          | Two Kling cards and the male skeleton button    |
| `/workbench.html?character=male` or `female` | Original character playback                     |
| `/workbench.html?mode=rig`                   | Male native skeletal candidate                  |
| `/player.html`                               | Independent V2/V3 and Kling source ZIP playback |
| `/skin-studio.html`                          | Standalone male skeletal candidate              |

There are four built HTML entries. Classic editor, rig lab, older mother study
and non-Kling Skin Studio are removed. Existing `study=kling-male` query links
continue to work. New configuration is not silently substituted for removed
legacy project formats.

Prepared original packs load lazily, keeping the unchanged source-video artwork
and avoiding rebaking on every selection. Native atlas memory remains substantial;
this cleanup is not a new compression or mobile-performance milestone.

[Cleanup evidence and compatibility](KLING_FOCUS_REVIEW.md) ·
[Five-action packs](kling-jump/README.md) ·
[Native candidate limits](KLING_NATIVE_STUDY_REVIEW.md).
