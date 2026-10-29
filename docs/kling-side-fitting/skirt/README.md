# Side-view skirt ownership and jump fitting

This pass continues the immutable `220ea2f` garment baseline. It uses existing
painted cloth and exact Kling source pixels; it does not add video frames,
change playback speed, modify body registration or repaint skin.

## Lower forearm clipping

The squared near-forearm joins at run frames 39 and 49 came from **skirt
ownership**, not the blouse. The old skirt compositor used partial arm hints
only above a horizontal `wrist_y + 4` cutoff. In these poses, part of the lower
forearm lies below that line, so the skirt covered real arm pixels.

Source-traced contours in
[foreground-contours.json](../../../artwork/kling-side-fitting/skirt/foreground-contours.json)
release this ownership, including the dark lower-arm ink and narrow antialiased
edge. They restore 214 source pixels in frame 39 and 396 in frame 49. No skin
colors are generated or globally erased. Other run poses retain their old skirt
pixels. The separate blouse pass owns any sleeve changes.

## Jump fold identity

The old skirt selected complete pleats for idle/walk/run and a different lifted
fold drawing for the entire jump. This creates a visible change of garment
shape at the action boundary even when frame timing is correct.

The retained version keeps the existing complete pleated donor through jump and
uses smoothed source knee positions to shorten and lift its front hem during
compression. The waistband remains source-attached. A bounded upper-hip fit covers the actual source shorts envelope with existing
painted folds. This removes the flat rose strip created by the old nearest-edge
fill. The broad inverse map is verified to have a positive Jacobian in all 50
jump frames; it cannot fold over. Its upper front edge is clipped to the actual
source waist, preventing a new peak beside the hand.

The first simple pleated trial exposed that inherited strip more clearly. A
narrow trial removed the strip but compressed folds too hard, so it was rejected.
The retained broad fit preserves continuous cloth lines. These trials do not
constitute additional source frames or animation retiming.

## Evidence and reproduction

- [Complete run, before/after](run-offline-before-after.gif)
- [Original two-jump one-shot, before/after](jump-offline-before-after.gif)
- [Run/jump and jump/idle boundaries at native size](action-boundaries-native.png)
- [Forearm and crouch details at integer 2×](contacts-crouch-2x.png)
- [Exact frame audit](audit.json) and [V1 package preflight](preflight.json)

These images are **offline garment diagnostics**. Their blouse is deliberately
held at the old baseline to isolate the skirt change. The root review separately
checks the final combined browser exports and standalone player.

```sh
PYTHONPATH=/tmp/side-polish/python-deps python scripts/refine-kling-side-skirt.py \
  --output /tmp/side-fitting/skirt/female-skirt.garment.zip
python scripts/kling_side_tools.py --identity female lint \
  /tmp/side-fitting/skirt/female-skirt.garment.zip --report /tmp/skirt-lint.json
```

The main preparer also supports `--slot bottom --output-directory /tmp/review`.
That path reuses prepared cloth, skips blouse generation, and writes its review
and audits under the chosen output directory. It does not overwrite top donor
artwork or top provenance.

The source jump still ends crouched; moving directly to idle changes the source
pose. A consistent skirt drawing cannot remove that source discontinuity.
The retained pleats have less flutter than the previous lifted drawing, and the
fit is not physical cloth simulation. Source blur and matte fringes remain.

## Current checks

All 102 native garment poses decode and match the packed RGBA. The 50 jump
frames and run 39/49 change; the other 50 frames are byte-exact in native
composition. Protected head/hand source pixels remain exact. V1 preflight
reports no issues across all 102 poses. Both diagnostic GIFs decode with the
original frame order, 24 fps rounded to GIF centiseconds and unchanged loop
flags. Browser export acceptance is a separate parent-review result.
