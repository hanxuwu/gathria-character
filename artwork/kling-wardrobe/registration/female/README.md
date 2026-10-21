# Female Kling wardrobe registration

This is a native-frame authoring guide for the **existing** `docs/kling-motion/exports/female.character.zip`. It does not replace the approved source character, invent a new body, or represent a completed runtime skeleton.

- Source frame size: **704 × 1056**; ground anchor: **(352, 998)**.
- Coverage: all **96 distinct source frames**, across idle, walk, run, jump, and celebrate. Repeated playback frames reuse their source registration.
- `registration.json` is the strict browser contract. `sourceFrame` is the original video frame number, not an atlas index. Its checksum binds it to the immutable source pack.
- Shoulder/elbow/wrist/knee/ankle centers are placed on reviewed source poses. Every run frame is individually placed; other frames use dense image motion from the nearest reviewed pose. Low-confidence or hidden joints are explicitly marked as proposals/inferred positions. They are not exact motion capture.
- Waist guides are placed against the **sloped lower vest contour** on the reviewed keyposes, then carried with image motion. Hidden waist ends beneath crossing hands are explicitly inferred. Global bottom-pixel percentiles were rejected because they collapsed the width around curved or occluded hems.
- A guide is not a body layer: hidden skin and garment surfaces cannot be recovered from the video. Garment-specific silhouette and occlusion checks remain necessary.

## Reproduce

Python dependencies are Pillow, NumPy, SciPy, and `opencv-python-headless`.

```sh
python scripts/prepare-kling-wardrobe-female.py \
  --output /tmp/kling-wardrobe-female \
  --registration-output artwork/kling-wardrobe/registration/female
```

The current session installed OpenCV in `/tmp/kling-wardrobe-python`; here the equivalent command is prefixed with `PYTHONPATH=/tmp/kling-wardrobe-python`.

The script decodes the original CharacterPack, writes lossless source crops, creates provisional semantic masks, records 17 anchors per frame, exports contract metadata, and produces labeled contact sheets. It does not edit the original ZIP. The large temporary frame/mask bank is regenerated rather than copied into the repository.

Temporary masks, all at source size:

- `tank`, `shorts`, `shoes`: visible source clothing only, with restrained outline coverage.
- `skin`: visible body skin, excluding the protected head/neck.
- `headNeck`: source face/head/neck protection.
- `nearArm`, `farArm`: visible arm ownership, resolved before outline expansion to avoid capturing nearby thighs.
- `nearHand`, `farHand`: wrist-directed hand regions used for foreground occlusion.
- `nearShoe`, `farShoe`: candidate foot regions; crossed/hidden feet require pose-specific review.

The hand/head polygons follow actual mask contours and are capped at 64 vertices. Original source pixels inside them are protected by the wardrobe contract. Protected polygons are conservative authoring constraints, not synthesized anatomy.

## Visual findings

- Walk 36–48 and run 56–64 turn substantially more side-on than the idle pose. A translated standing rig does not fit these frames.
- Run 58 has a foreground forearm across the vest, leaving **two disconnected visible vest regions**. Both must survive segmentation.
- Walk 39–45 puts a hand over the waistband; warm thigh pixels near a hand must not become foreground hand cutouts in a dress.
- Jump includes crouch, lift, airborne folded knees, landing, and recovery. Skirts need garment-specific width/hem behavior; ankle position is not a skirt hem rule.
- Raised arms in celebrate lie beside the head. Head protection cannot be the largest unrestricted warm-color region, and arm regions cannot be clipped at wrist height.
- Some source run/jump frames already contain motion blur, green fringe, or cropping. This preparation preserves the original source; it does not silently repaint those frames.

## Final ownership corrections

The final semantic pass preserves source artwork. Most corrections only change masks; the explicitly reviewed frame 89 calibration changes the registration checksum:

- Pink heel highlights were misclassified as skin by the initial near-white shoe seed. A shoe-local, connected color region restores them; five strongly warm/blurred sole silhouettes (frames 50, 55, 56, 57, 64) have explicitly reviewed ownership polygons. No global skin-color deletion is used. Frame 51's reported heel pixels `(166,841)`, `(170,852)`, and `(174,851)` now belong to shoes, not skin.
- Small enclosed vest-shadow holes are filled only when their colors match cloth and they are outside foreground arms, head/neck, and protected polygons. This repairs frame 112's chest pixel `(367,635)` without covering the hands crossing other frames.
- The original head is subtracted with the same pixel-center protection rule as the browser compositor, keeping teeth and eye whites out of the clothing mask.
- Final material inspection found warm, blurred vest areas incorrectly assigned to skin or arms in frames **56, 63, 64, 89, 90, 100, 101, 105**. Their bounded source-reviewed cloth contours restore garment ownership. These contours do not synthesize anatomy or change the original silhouette.
- Frame 89's optical-flow wrist proposal landed on the shoulder strap. Its near wrist is calibrated from **(335.9, 620.8) to (279, 672)** and its adjacent near elbow from **(245.3, 657.4) to (208, 662)**. The near-hand semantic mask and protection contour now follow the actual visible fist. No other anchor changes. **All 96 head protection objects remain byte-for-byte identical** to the preceding registration. The misleading combined protection diagnostic was checked by individual label: the erroneous vest protection belonged to `nearHand`, not `head`.

`manual-ownership-corrections.json` records these finite contour and joint decisions, exact source-coordinate regression probes, and the unchanged head-protection digest. After preparing the masks, run:

```sh
python scripts/verify-kling-wardrobe-female-registration.py
```

This checks the observed cloth/shoe defects, actual face/neck/hand skin, the calibrated joints, and unchanged head protection. `ownership-regression.json` records the result. `review/frame-89-protection-and-material.png` shows the old/new protection and joint guides plus the actual preparation material shader. The five `material-preparation-*.jpg` sheets cover all 96 frames; these are preparation previews, with application export review performed separately.

`semantic-cleanup.json` records the affected pixel counts. `validation.json` records decoding and original-alpha checks for all 1,056 masks, plus source and registration hashes. `review/shoe-ownership-comparison.jpg` is a flat-color **segmentation diagnostic**, not a generated outfit or application export; the final wardrobe export must still be reviewed separately.

Contact sheets document the review. They are not user visual approval or a guarantee that every future garment will fit these anchors without adaptation.
