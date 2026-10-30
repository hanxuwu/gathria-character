# Lower nape fit and fresh hair preservation audit

This is a small continuation of the previously accepted male frame **67 / video
210** rear-hair repair. It does not replace the hairstyle or move the head.
The current female bank is deliberately preserved.

## Cause and retained change

The previous fitting strip limited source rows to `x < 224`. At the lower nape,
the actual painted locks continue through `x = 211–242`. Parts of those locks
therefore received no correction, leaving two serrated peach scalp slivers
behind the ear. The visible neck below them is legitimate original artwork.

The new strip is limited to rows **380–428**, with a maximum **8 native pixels**
of displacement and a fixed ear-side endpoint. Only already-painted hair is
sampled. The ear, facial drawing, shoulder and neck remain the original source
pixels; no geometry is added and no source frame is warped. Extending the old
vertical range alone did not address the skipped lower locks and was rejected.
The retained version keeps the small natural nape opening and the haircut tips.

[Actual-renderer native before/after](male67-native.png),
[3× native details across the three colors](male67-colors-3x.png),
[neighboring jump poses](male-jump-neighbors.png), and
[full original jump clip](male-jump-hair-runtime.gif) document the result.
These focused previews use the application's real `AppearanceRenderer` over the
original body. Full dressed workbench exports belong to the parent review.

## Reproduce

```sh
python scripts/refine-kling-side-nape.py
node scripts/verify-kling-side-nape.mjs
python scripts/review-kling-side-nape.py
```

Python requires NumPy, Pillow, OpenCV and SciPy, as does the preceding authoring
workflow. The exact accepted pre-correction hair layer and recipe are persisted
under `artwork/kling-side-fitting/hair/`; the step is idempotent. It verifies all
unrelated native layers against pinned hashes before publishing and keeps the
existing atlas layout and pose metadata. It refuses unreviewed third-party
changes instead of overwriting them. The runtime comparison reads the baseline
bank from Git commit `220ea2fd7588c1fe784c8454d66469d60fba096a`.

## Current evidence

- [Native audit](native-audit.json): **1,128 composed pixels** change only in male
  frame 67. The other **106 male frames** remain exact. Atlas layout, registration
  and head transforms remain unchanged. Repeating the script produces the same
  ZIP SHA-256.
- [Runtime audit](runtime-audit.json): strict source/bank parsing and the actual
  `AppearanceRenderer` check **209 poses × 3 colors = 627 color poses** against
  the previous banks. Every opaque protected face/foreground pixel and every
  pixel outside authored hair remain exact. Every female pose and every male
  pose except 67 are identical to the previous corresponding colored render.
- Male bank SHA-256:
  `cda6233af07c89d7614060b51b89a3201d01866d9fe5487da2e8b5e1091f3c99`.
- Female bank SHA-256 remains:
  `e09b5bdd06aed7053198ada973f657aef34ea6767d732a9a3d7da532b16784af`.

## Visual limits

The blurred compressed face in the source is still softer than the painted hair.
Original edge fringing at the shoulder and neck is not recolored or removed.
The female bob still follows the head rigidly; original foreground hands and
shoulders can make its lower overlap abrupt. No additional secondary motion,
haircut change or broad recoloring is introduced. Numeric preservation checks
are separate from visual acceptance.
