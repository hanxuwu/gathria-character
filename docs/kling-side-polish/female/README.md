# Female cloth continuity pass

Baseline: `4fd27f9f21009af556734ae87e52d82b94c6d5f4` (PR #53's first
reviewable export). This pass changes only prepared female clothing. The frozen
source, its 102 frame IDs, 24 fps timing, jump one-shot, head/body proportions,
registration and hairstyle bindings are unchanged.

## Cause and correction

The old nearest-pose selector independently chose a skirt donor on every frame.
It switched between a straight pleated skirt and a lifted folded skirt during
one continuous action: 8 switches in walk, 8 in run and 23 in jump. The previous
smoothed width/length curves could not stabilize a completely different painted
fold pattern.

Keep one coherent painted skirt through each full action: donor 0 for idle/walk/run
and 79 for jump. Existing source-guided width, length and shear still
move the cloth offline; no source pixel is warped and no motion frames are
blended, added or retimed. All six original skirt donors remain available as art
sources. This is a bounded approximation using existing painted cloth, not new
anatomy or a simulation.

Two isolated blouse choices also caused a broad sleeve at run frame 40 and a
one-frame collar change at 47. They now use backward-arm donor 42, matching their
adjacent poses. The other 100 blouse frames are byte-exact in reconstructed RGBA.
The exact changed-frame list is in the audit; all 16 idle frames remain exact.

## Review and reproducibility

These are **offline compositor diagnostics**, decoded from the actual garment
ZIPs and combined with the frozen source. Browser-export acceptance is reported
separately by the parent review, not inferred from these previews.

- [Walk before/after](walk-compositor-before-after.gif)
- [Run before/after](run-compositor-before-after.gif)
- [Complete two-jump one-shot before/after](jump-compositor-before-after.gif)
- [Source / before / after at native size](difficult-poses-native.png)
- [Same-frame cloth details at integer 2×](cloth-details-2x.png)
- [Checks, hashes and continuity diagnostics](continuity-audit.json)

```sh
python scripts/prepare-kling-side-female-clothing.py
python scripts/review-kling-side-female-continuity.py
```

The second command reads the saved baseline ZIPs directly from Git. It verifies
ZIP CRCs and decodes every frame, then generates labeled layouts without
repainting them. The review GIFs use a shared palette per clip, native frame
order and 10 ms GIF timing rounding; jump does not loop. Native PNG/ZIP RGBA
remains the lossless reference. Whole-clip and detail layouts preserve the
source's position rather than independently centering every image.

Both new pack audits check all 102 frames: protected source pixels remain exact
and every changed pixel belongs to the explicit garment ownership. The source
SHA is `ee6d20ac1b6c973043a28bc7b0508cf4f3b1ea4f373424b0de75d88d724f955d`;
registration SHA is `7f49437c617e01141622e1ca3d463347edf51adce068a344c01d545e58567cef`.

After alignment to the rounded source waist, mean adjacent changed-cloth
silhouette XOR falls from 0.24983 to 0.15890 for walk, 0.19463 to 0.11248 for run,
and 0.15094 to 0.06481 for jump. These measurements are a continuity diagnostic,
not a perceptual quality score; they include real motion and foreground
occlusion and do not establish physical cloth behavior.

## Visual assessment and remaining limits

Three bounded trials were reviewed. The first stabilized walking/running skirts;
the second also stabilized the full jump and corrected the two isolated blouse
choices. Independent review then rejected run donor 42: its lifted front flap
looked detached behind the foreground fist at frames 38/39/49. The third trial
uses the existing complete pleated donor 0 through the entire run, removing that
orphan flap without weakening hand protection. [Trial rejection and retained
cloth at 2×](run-donor-trial-2x.png) compares source, rejected lifted hem and
retained complete pleats at frames 37/38/39/49.

The retained version removes repeated whole-pattern substitutions inside each
clip, including the jump's crouch, apex and landing poses. Walking and running
also share the same fold identity. The running skirt is less wind-lifted; a full
continuous fold simulation is outside this pass.

Blouse donors still change at arm-pose boundaries. A squared forearm-to-fist
seam at frames 39/49 is present in both baseline and retained result; it belongs
to the existing protected-hand / blouse boundary and is not repaired here. Source
matte/green fringes and forearm edges also remain visible at 2×.
The skirt remains more lifted through jump than the previous standing-donor
frames, and its silhouette changes when entering/leaving jump. These are explicit
art limits, not evidence that the complete wardrobe is free of seams. No claim
of final user art approval is made.
