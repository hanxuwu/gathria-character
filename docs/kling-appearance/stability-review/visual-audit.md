# Complete head-frame audit and boundary diagnosis

This audit reinspects **retained actual application exports** from commit
`055e95116cd441be7a630554409738b4a0b67ef9`. The PNGs below are the diagnostic
**before** baseline, not exports of the subsequent boundary correction. No hair
or source artwork was generated for this audit. The final workflow review in
this directory records the later corrected exports separately.

## What was visually inspected

All 368 head tiles were read in source-frame order: 88 male poses × two short
hairstyles and 96 female poses × two short hairstyles. This covers every unique
pose used by idle, walk, run, jump and celebrate. Original repeated frame holds
are retained in the packs. The existing full head contact sheets were divided
into readable temporary strips during inspection:

- [All male head poses](../ear-edge-review/male-all-heads.png).
- [All female head poses](../ear-edge-review/female-all-heads.png).

Native-pixel crops were then inspected for poses 0, 51, 75, 86, 90, 102, 108 and
121, covering reference, run contact, raised hands, squashed face, fast jump,
landing/recovery and return to rest:

- Male: [soft crop](male-soft-crop-native-detail.png) /
  [soft bob](male-soft-bob-native-detail.png).
- Female: [soft crop](female-soft-crop-native-detail.png) /
  [soft bob](female-soft-bob-native-detail.png).

These boards crop the decoded exported frame without rescaling it. Browsers may
fit the large board to the viewport; opening it at 100% restores native detail.
This is a complete **framewise** head review, not a claim of realtime playback
acceptance or a fresh browser/export execution. The current browser verification
is recorded separately. Input pack hashes, pose IDs, action timing, crop boxes
and PNG hashes are in [visual-audit.json](visual-audit.json).

## New defect found at native scale

The earlier extra scalp crescent above the ear remains resolved in both short
styles. However, a thin light vertical or horizontal seam appears inside the
hair at the **outer boundary of the observed head rectangle**. It is easiest to
see at female pose 0 on the far-side fringe, male pose 90 on the far-side fringe,
and female poses 101–102 near the crown. It is easy to miss at contact-sheet size.

The source has sparse antialiased/chroma-key fringe pixels just outside that
rectangle. The old front-hair compositor treats *any* nonzero source alpha
outside the head rectangle as foreground body, and skips the new hair there.
That makes the old fringe appear as a rectangular line through the new hairstyle.
This is a head-ownership/composition defect; it is not an intentional scalp gap.

Concrete source-space samples:

| Character / pose | Position | Original and old composite RGBA | Reason |
| --- | --- | --- | --- |
| Female / 0 | (547, 285) | (255, 0, 255, 4) | Pixel center lies outside right edge 547 |
| Female / 0 | (547, 300) | (121, 121, 81, 233) | Same line; high alpha rules out a low-alpha-only fix |
| Female / 0 | (547, 315) | (255, 0, 255, 16) | Same line |
| Male / 90 | (603, 332) | (175, 132, 111, 70) | Pixel center lies outside right edge 603 |

Run `python scripts/audit-kling-head-boundaries.py` to reproduce the numerical
diagnosis from the fixed baseline bank in Git history.

The [boundary diagnostic](head-boundary-diagnostics.json) enumerates candidate
pixels under actual front-hair ownership for all 368 style/pose pairs. Outside
celebration, the maximum top/side distance is **1.5 native pixels for male** and
**2.5 for female**. A separately registered three-pixel top/side allowance can
cover those source-head remnants while leaving the bottom/body boundary fixed.
The allowance must remain distinct from face editing bounds and be explicit in
new banks so old embedded banks reproduce their prior output.

Celebration also contains source hand edges 40–80 pixels outside the head box.
Those are **not** scalp and must not be swallowed by a larger head rectangle.
The diagnostic excludes explicit hand/forearm polygons using Pillow rasterization;
its numeric counts are diagnostic, while runtime uses pixel-center polygon
rasterization. Corrected actual exports must check the foreground hand outlines.

## Second confirmed defect: hand ownership in celebration

After the three-pixel boundary correction was exported, a source-versus-export
review of every changed celebration pose revealed a separate **preexisting**
defect in female soft bob poses **78 and 79**. A triangular piece of front hair
covers the inside of the near thumb/wrist. This is already visible in the prior
V2 output and was not introduced by the boundary correction. It is not source
blur or a pale alpha fringe: the original source contains uninterrupted opaque
skin in those locations.

The [6× source/before crops](hand-foreground-before-6x.png) show the distinction.
At source pixel (152, 413) in pose 78, original RGBA (248, 167, 129, 255) became
(68, 29, 18, 255). At (155, 441) in pose 79, (248, 129, 95, 255) became
(81, 36, 23, 255). The old foreground polygons contain inward notches cutting
through the thumb, allowing front hair to paint those exposed skin pixels.

The implemented correction appends one source-traced hand polygon in each of those
two poses, leaving every existing polygon intact. Pixel-center rasterization
adds 111 and 361 protected pixels respectively; **every pixel in both added
polygons is opaque in the original source**. No transparent gap, face area or
hair color is removed. The exact coordinates, source/pack hashes and diagnosis
are in [hand-foreground-diagnostics.json](hand-foreground-diagnostics.json),
reproducible with `python scripts/audit-kling-hand-foreground.py`.

The immediate selected neighboring poses 75 and 80 were also reviewed against
the source at native scale. No equivalent interior hair wedge was found there;
pose 77 is absent from the selected export frame set. The final actual browser PNGs were reviewed for both hair styles at 78/79 and
soft bob at 75/80. The [source/before/final 4× comparison](hand-source-before-after-4x.png)
shows both brown wedges removed with the original thumb contour restored. The
[neighbor comparison](hand-neighbors-source-before-after-4x.png) shows the nearby
hand and ear contours preserved. The short crop was already mostly clear here;
its two restored pixels in pose 78 improve the same ownership boundary without
changing the style. These are application exports, not the earlier diagnostic
simulation. File hashes and exact sample RGBA are in
[hand-review-validation.json](hand-review-validation.json).

The renderer includes pixel centers exactly on polygon edges. Including that
boundary produces 111 added protected pixels at pose 78, correcting an initial
strict-ray diagnostic count of 110; pose 79 remains 361. All 472 are opaque source
pixels. Only 111/241 of those pixels in soft bob actually had hair paint to remove;
the remainder were already unchanged source. Full actual-pack delta checks are
recorded in [final-visual-validation.json](final-visual-validation.json).

## Final actual-export verification

The completed browser export run was then checked against the retained baseline:
**184 unique frames** from the two everyday CharacterPacks and **12 actual PNGs**
covering both styles at reference/problem poses and the neighboring hand poses.
The earlier 368-tile inspection covered both styles in the retained baseline;
the final exhaustive pack comparison covers male soft crop and female soft bob,
with targeted actual PNG checks for the alternate styles. These scopes should
not be conflated.

Male has 315 changed pixels across 18 of 88 frames, all inside the explicit
three-pixel top/side allowance. Female has 2,370 changed pixels across 62 of 96
frames: 2,018 in that same allowance plus 352 original-hand pixels restored in
poses 78/79. All face-polygon pixels and all other pixels remain exact against
the same-configuration baseline. Anchors, action sequences and timing are exact.
The initial boundary-only export results remain available in
[iteration-1-boundary-only.json](iteration-1-boundary-only.json).

At native scale and integer enlargement, the thin far-fringe lines are gone in
both styles at female pose 0 and male pose 90. The new hand comparisons show no
remaining brown thumb wedge at female 78/79. This inspection confirms the two
specific corrections; it does not certify the original video extraction as
blemish-free, or constitute user visual acceptance. Browser playback, ZIP/GIF
decoding and timing verification are documented by the separate workflow report.

## Existing source limitations, not new face paint

The [source-versus-hair ear details](source-blur-edge-comparison-2x.png) show
original blur and colored alpha fringes at poses 90 and 102. Those remain in the
original ear, jaw and neck and were not repainted during hair preparation.

White speckles on the closed eyelids are also present in the extracted source.
For both characters, both hairstyles and poses 75, 86 and 108, the corresponding
80×44 near-eye crop was compared byte-for-byte: **12 comparisons, zero changed
RGBA pixels**. The [4× source comparison](closed-eyes-source-4x.png) shows the
same speckles. Preserving these is distinct from leaving the new hair-boundary
seam untreated.

Raised-hand/hairstyle edges in poses 73–79 retain a thin pale fringe because the
source hand has partially transparent edge pixels and the current foreground
protection leaves those pixels unchanged. A future refinement would composite
the hand's edge *over* hair behind it, with explicit ownership; it should not
remove source hand pixels or broadly expand the head box.

The short hairstyles continue to track the head without secondary hair motion.
The framewise review found no repeat of the earlier ear crescent, lost crown,
or gross head detachment, but the boundary and hand defects above prevent calling this
baseline visually finished. User visual acceptance remains separate from both
this inspection and automated checks.
