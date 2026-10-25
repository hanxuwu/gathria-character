# Selectable face states

Natural keeps the original source face (`faceId: null`). Gentle smile retains the
existing `gentle` painting and mapping exactly. Joyful (`joyful`) adds an authored
smiling expression to the same male and female source poses.

Joyful uses each character's own celebration-mouth painting from native frame 78
(source-video frame 264 at 11 seconds), including its teeth, tongue, ink and
shading. A manually outlined mouth donor is
registered to each source pose's mouth guide at 72% scale. Compact native-pixel
warps lift the source brows and cheeks slightly; a restrained cheek tint and a
feathered skin transition connect the expression. The eye and nose regions are
explicitly excluded. No eye rectangles, geometric replacement faces, new heads,
source pose deformation, or runtime generation are used.

The smile continues through the original blink and half-blink frames while their
eye artwork stays intact. Existing celebration laughter remains exact source.
Transferred mouth paint follows the existing blur on fast jump frames; those
frames are not silently substituted with a different pose. Frame IDs, repeated
holds, action order, FPS, loop flags, anchors and source time mapping stay with
the original source pack.

The eight new banks in `banks/` append a new atlas page and style to copies of the
two current base banks and six active hairstyle banks. All previous bank files,
old PNG entries, old style/frame mappings (including Gentle), pose records and
padding remain unchanged. Saved projects continue to use their embedded bytes;
the existing explicit appearance-update copy flow exposes new choices without
silently changing an old saved result. `release-index.json` pins original and new
bank URLs, hashes, IDs and inventories for selective catalog publication.

Reproduce locally with the existing Pillow/NumPy/OpenCV dependencies:

```sh
python scripts/append-kling-expression-states.py --prototype --package
python scripts/verify-kling-expression-assets.py
```

The `review/*-states-*-1x.png` and `2x.png` boards are offline authoring prototypes,
using previously captured application exports only for frozen hair/context. They
are labeled as prototypes and do not serve as browser export evidence. Native
frame 0, run frame 55, celebration frame 78 and crouched blink frame 86 show the
three selections. Browser captures and independent pack playback are separate
validation steps.

`asset-validation.json` records an independent read of all eight shipped ZIPs
and all 184 unique source poses. It checks old page bytes and mappings, face
ownership, original alpha, foreground protection and conservative registered
eye/nose regions. Those guides are not anatomical segmentation; the accompanying
native-size visual review checks the remaining edges. The shipped-bank blur
boards include frames 89, 90, 101, 102 and 103. Mouth paint is slightly sharper
than the most blurred original features on 89/90, which remains a motion-review
consideration.
