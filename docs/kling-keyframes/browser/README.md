# Actual browser loop observations

This evidence uses the application's real candidate loader, project save/reopen,
ZIP download and independent player. It does not generate or repaint character
artwork. The candidate is explicitly separate from the original Kling playback.

`evidence-index.json` records the executed checks and their final status:

- Both candidate source-pack UI downloads match `../exports/{male,female}.character.zip` byte for byte.
- Saving and reopening the action project retains the candidate archive and exports the same bytes.
- The authoring browser context is closed before each independent-player session.
- Five actions × two directions × two characters are played through at least two continuous wraps. Every declared timing tick is observed in both cycles, including repeated frame IDs used as holds.
- Sampling uses **0.5× playback speed** for reliable inspection of individual ticks; manifests retain **24 FPS**. Measured cycle wall times are compared with the expected duration at that speed.
- Original character URLs still load the original pack, whose Jump remains a one-shot and stops at its landing/recovery frame. Original pack export remains byte-identical.
- Runtime/source fingerprints are unchanged during capture. Independent sessions do not request authoring or skeletal modules; all requests stay local.

The `*-seam.png` filmstrips contain four actual canvas observations: the last two
ticks of one cycle and the first two ticks of the next. Each observation is
cropped to the displayed frame rectangle at half native resolution and labeled
with timing position, frame ID and cycle. They come from **continuous playback**,
not from manually displaying unrelated static poses. The player attachment
reference line is intentionally visible.

`*-candidate-editor.png` and `*-independent.png` show the real user interfaces.
All PNG files are decoded after capture. UI ZIP downloads, nested original ZIPs,
JSON members and RGBA PNG members are validated with CRC and full image decoding.
Identical ZIP copies are checked in temporary storage rather than duplicated in
this directory; the reusable candidates remain in `../exports/`.

These observations establish playback ordering, timing, repeat behavior and
source fidelity. They do not establish user visual acceptance or repair source
motion blur, pose drift or clipping. In particular, candidate Jump is a repeated
crouched hop; the separately preserved original is the full standing-recovery
one-shot.

Reproduce without overwriting existing evidence:

```sh
EVIDENCE_PHASE=browser-next CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-kling-keyframes.mjs
```
