# Fit polish evidence procedure

This directory starts from merged main
`c89e5add8d8b1a134e7cb3d7576c6370590cb57e`. The before images and four complete
before packs/projects are the **actual production UI downloads from the previous
full-outfits batch**. `baseline.json` records 26 immutable file references,
SHA-256 hashes and Git blob identities. Recording/rechecking those hashes in this
batch is not a new capture of the historical before images.

## Capture after the artwork/catalog freeze

The expected outfit selections come from the frozen catalog's Everyday/Wedding
presets. The harness rejects any of the four presets if its selection still
matches the historical saved project. This allows untouched V1 trousers to be
combined with new V2 tops; it does not assume all slots need new assets.

```sh
npm run build
WARDROBE_PRODUCTION=1 node scripts/verify-kling-fit-polish.mjs
node scripts/verify-kling-fit-polish-exports.mjs
python scripts/render-kling-fit-polish.py
```

Use a separate name for an attempt instead of overwriting delivered evidence:

```sh
WARDROBE_FIT_RUN=attempt-1 WARDROBE_PRODUCTION=1 node scripts/verify-kling-fit-polish.mjs
WARDROBE_FIT_RUN=attempt-1 node scripts/verify-kling-fit-polish-exports.mjs
WARDROBE_FIT_RUN=attempt-1 python scripts/render-kling-fit-polish.py
```

The capture uses port5194 by default (`WARDROBE_PORT` overrides it), Chromium
(`/usr/bin/chromium`, or `CHROMIUM_PATH`) and FFmpeg/ffprobe. It writes one set of
four current CharacterPacks and four editable projects. It references historical
before packs directly instead of copying them into the new delivery. Full raw
recordings are only retained alongside their named copies after a failed run;
successful runs remove those temporary duplicate recording files.

The browser harness fulfills **only the exact same-origin `/favicon.ico` URL**
with HTTP204 and records that setup in its report. This avoids the historical
ancillary missing-icon error without suppressing any console errors, failed
application resources, external requests or forbidden authoring requests in the
independent player. The new capture must pass its strict checks; the historical
reviewed exception is not reused as a new success result.

## Verification scope

- Four updated looks, six selected male poses and four selected female poses
  per look, plus six mixed male outfit PNGs.
- Four historical project reopenings, compared against the exact prior UI PNGs.
- Four new project save/reopen checks, including restored Run/Left settings.
- Source bytes, anchors, frame order, FPS, holds, facing and queued-action metadata
  preserved in each ordinary baked CharacterPack.
- All wardrobe windows closed before four fresh independent-player sessions:
  five actions × two facings × four looks = 40 cases, plus 16 queued transitions
  across workbench and player.
- Four complete independent viewport recordings, eight screenshots; all downloads
  decoded, nested ZIP CRCs checked, recordings decoded with FFmpeg and probed.
- Independent export audit compares every decoded atlas RGBA pixel against the
  saved-project compositor; verifies native/mixed PNGs, prior-project pixels,
  source protection and original opaque-clothing coverage.
- Per-file capture input/output hashes bind the report to the final assets.
  No claim of smooth aesthetics or zero dropped frames follows from passing
  format/pixel tests. Observed timing gaps and unobserved positions remain in
  the report for inspection.

The previous male54 semantic overlap remains a narrowly documented audit rule:
four exact source shoe pixels were also tagged nearHand. The audit checks their
source values, registered protection, current top/bottom ownership, standalone
old shoe pixels and previous full-outfits wedding export. No other protected
pixel is exempted, and the current batch does not modify these old masks.

## Review images

The renderer only reads actual before/current UI CharacterPacks and the immutable
Kling source pack embedded in their projects. It does not paint garments.

- GIF columns: Kling original / day before / day current / wedding before /
  wedding current. All five actions and both directions; labelled0.375× views.
- Native matched-frame boards and integer2× collar, shoulder, waist, cuff and
  skirt details. Current idle/walk/run/jump key-pose boards use native pixels.
- Every PNG and GIF is decoded. GIF verification compares the complete quantized
  pixel/time sequence; repeated hold frames may be coalesced by the encoder.
  Centisecond rounding is explicit. Jump remains a one-shot, with no loop flag.

Capture/render/audit scripts refuse existing completed report paths. The media
renderer supports `WARDROBE_MEDIA_RESUME=1` only to validate already written
images against the exact same inputs and finish a previously interrupted run
whose `media-index.json` has not been written.

## Execution status

Harness preparation and syntax checks only. The new final artwork has not been
captured or approved by this document. After execution, record the actual counts,
command results, visual findings and remaining limitations in the batch review.
