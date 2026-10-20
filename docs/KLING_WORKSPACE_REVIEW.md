# Kling character workspace: first integration batch

The app now starts with the two approved original Kling characters. Three main
destinations organize the existing tools: **Character Library**, **Workbench**
and **Player**. Skeleton editing remains a first-class workbench tab. This batch
does not claim that the Kling videos have become editable skeletal characters.

## Destinations and preserved workflows

| Address | Purpose |
| --- | --- |
| `/` | Character library: original male/female previews, open character, open skeletal workspace |
| `/workbench.html?character=male` or `female` | Native original playback with five actions and portable export |
| `/workbench.html?mode=rig` | Complete existing skeletal editor, without loading a Kling pack first |
| `/player.html` | Independent V1/V2/V3 pack playback and raw source ZIP import |
| `/editor.html` | Unchanged classic V1–V7 character configuration editor; previously at `/` |
| `/skin-studio.html` | Existing standalone skin, wardrobe, identity and skeleton authoring |
| `/rig-lab.html`, `/mother-study.html` | Existing experiments and earlier four-static-pose study |

There are three main navigation destinations and seven HTML build entries.
Advanced tools retain their individual URLs. The classic editor's control and
export behavior is unchanged; its regression tests and UI evidence scripts now
explicitly use `/editor.html`.

The workbench hosts the real player and Skin Studio in isolated, same-origin
frames. Each session mounts only when first opened, and stays mounted across
tab changes. This preserves edits, undo history, loaded art and playback position
without mixing the old pixel-art styles or renderer into the Kling player.
Hidden tabs suspend animation work, then resume from their retained position.
Messages are accepted only from the expected same-origin parent/child window.
Changing the selected original also updates the outer name and separate-player
link without reloading the frame.

The full skeleton tab retains clothing, identities, expressions, joints, bones,
mesh, motion editing, undo/redo, project save/reopen and CharacterPack export.
Kling artwork is clearly identified as fixed-appearance playback. Loading an
arbitrary pack uses a generic supported-actions notice rather than claiming
five actions or editable anatomy. Switching tabs is not autosave: save the full
authoring project before reloading or leaving. There is no new project database
or automatic original-to-rig conversion in this batch.

## Native loading without artwork changes

The sample now loads the previously verified
[`male.character.zip`](kling-jump/exports/male.character.zip) or
[`female.character.zip`](kling-jump/exports/female.character.zip) directly.
It no longer converts the 62.4 MiB source archive on every sample open. The
library loads only two static previews; the other character is fetched when
selected or compared. Turning comparison off releases its retained decoded
entry. Imports use request guards/cancellation, and failed imports retain the
current character. Export of a prepared original reuses the original ZIP bytes.

Library portraits are exact copies of original transparent frame 348. Their
archive members and hashes are recorded in
[`library-preview-provenance.json`](../artwork/kling-jump/prepared/library-preview-provenance.json).
No character source frame, crop, pose, alpha, anchor, frame timing or legacy
renderer was repainted or reinterpreted. The full 704×1056 original packs still
use approximately 346 MiB of decoded atlas pixels per character, before extra
browser allocations. This change reduces unnecessary loading and conversion;
it does not claim that the native originals are now lightweight mobile assets.

## Review and verification

In this batch's final local desktop run, first prepared-pack loads took **3.90 seconds
for male** and **3.88 seconds for female**. The existing raw-source conversion
took **47.45 seconds** in the same browser/environment without concurrent heavy
jobs. Prepared timings include page navigation and local HTTP download; raw
source timing includes local file selection and conversion but no network
download. These are individual fresh-context measurements on a local server,
not a mobile benchmark or a claim about internet download speed.

[Actual screenshots and current checks](kling-workspace/README.md) include the
library, native player and real skeletal workbench. Measurements are taken
from the real application and shipped packs, not miniature test fixtures.
The existing complete Kling animation evidence remains in
[the jump review](kling-jump/README.md).

Current checks passed: 585 unit tests, TypeScript, production build, seven focused
loader browser cases, and native verification of both characters across five
actions and two directions. Exported original ZIP bytes match the existing packs;
the skeletal project was saved and reopened through the real editor. All seven
screenshots and the project's PNG members decode successfully.

The full local browser run had 71 passes and one navigation regression: the
standalone mother-study link opened a new tab. Commit `82d5f9d` restores its
existing same-page behavior while protecting the embedded workspace. Seven
targeted mother-study/workspace checks passed after that fix. The full suite was
not rerun locally afterward. [Verification details and logs](kling-workspace/verification-results.json)
distinguish these runs; [artifact checks](kling-workspace/artifact-validation.json)
match the final native capture to the current runtime and unchanged baseline.

Mobile library/navigation fits a 390-pixel viewport. Detailed skeletal authoring
remains desktop-oriented: its existing side-by-side canvases scroll horizontally
inside the editor. Native pack memory and large build chunks remain limitations.

The next independent milestone is native-resolution, smooth-alpha Kling part
registration and rest/raised-arm/bent-knee reconstruction. Existing V6 skeleton
dimensions are not silently stretched to fit the originals. The two original
video characters remain the visual reference throughout that later work.
