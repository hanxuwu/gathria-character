# Character library and workbench review

Open `/` after `npm ci` and `npm run dev`. Choose either Kling character, or
**Open skeleton workspace**. The workbench's **Skeleton & motion** tab contains
the existing working authoring tools. It is separate from fixed-appearance
original Kling playback; no new Kling bone binding is claimed.

- [Desktop library](library-desktop.png) · [Mobile library](library-mobile.png)
- [Original playback workbench](workbench-original.png)
- [Skeleton workbench](workbench-skeleton.png) · [Mobile workbench](workbench-mobile.png)
- [Male independent player](male-player.png) · [Female independent player](female-player.png)
- [Actual browser/export evidence](evidence-index.json)
- [Current verification](verification-results.json)
- [Artifact integrity checks](artifact-validation.json)
- [Saved and reopened skeletal project](verified-skeleton.rig.zip)
- [Implementation and compatibility](../KLING_WORKSPACE_REVIEW.md)

The original exported packs are unchanged:
[male](../kling-jump/exports/male.character.zip) ·
[female](../kling-jump/exports/female.character.zip).
The current UI's exports are checked byte-for-byte against those files; duplicate
copies are not added to the repository. Original animation GIFs remain available
in the [five-action review](../kling-jump/README.md).

Save skeletal projects through **Save project ZIP** before leaving. Tab changes
retain the open session, but reloading does not save edits. The classic editor
and all historical art remain accessible through **Advanced tools & earlier
versions**; its new explicit address is `/editor.html`.

In the final local desktop measurement, native prepared loading took 3.90 seconds
for male and 3.88 seconds for female; raw-source file import/conversion took
47.45 seconds. These are individual fresh browser contexts on a local server,
not internet or mobile benchmarks. The full-size original atlases are still
memory-heavy. On narrow screens, the existing skeletal canvases scroll sideways;
use a desktop viewport for detailed authoring.

Reproduce the native capture with
`KLING_WORKSPACE_BASELINE=1 node scripts/verify-kling-workspace.mjs`
(Chromium defaults to `/usr/bin/chromium`; override with `CHROMIUM_PATH`).
