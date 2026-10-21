# Prepared female dresses

These are clothing-only cutouts from `../../source/outfit-designs.png`. The full
reference sheet was made with the OpenAI image generation tool during this
development batch, using the existing Kling characters as visual references.
No generated head, face, neck, arm, leg, or shoe is used in the delivered dresses.

`*-skirt-source.png` retains the painted garment pixels.
Their silhouettes were traced during preparation. Small cloth areas hidden by
the reference hands were filled from neighbouring clothing colours; they are
authored completions, not original layers extracted from the Kling video.
Transparent pixels retain extrapolated RGB to avoid dark fringes during offline
resampling. This RGB is discarded outside final patch ownership.

Regenerate after creating the female registration/masks:

```sh
python scripts/prepare-kling-wardrobe-dresses.py
```

The script consumes the immutable female motion source pack, the exact current
registration JSON, and `/tmp/kling-wardrobe-female/masks` produced by the female
registration script. It creates complete `fullBody` item ZIPs for all 96 unique
source frames. Timing, frame IDs, source body position and the `(352, 998)` ground
anchor are not modified. Original arms/hands remain in front of the dresses.
The generated reference's skin is explicitly excluded before fitting cloth.

The bodice retains the original tank's exact neckline, armhole contours and
pose-specific shading, recolored to a material palette sampled from the generated
garment. A trial that stretched the entire generated standing bodice over each
pose was rejected: neckline cutouts produced brown angular samples, white
straps moved onto the shoulder, and a crossing forearm moved the waist sash.
The final dresses use the generated skirt artwork and its waistband/folds with
the original body garment's shading for the bodice. They do not claim to transfer
every decorative button from the reference design.

Skirts keep a consistent flare angle, follow the tilted waist, allow space for
the source hip silhouette and shorten only to avoid crossing the ground during
crouches. Exposed-skin pixels under fractional
cloth edges are composed offline; shoes and other clothing are excluded from
this edge treatment so interchangeable items are not baked together.

During a deep crouch, parts of the original shorts can extend above an inferred
waist guide. The preparation adds waistband overlap within that original garment
silhouette. It does not lift the whole skirt, which would create a protruding
side flap. Forearms crossing the chest retain their source pixels, while coarse
arm regions cannot preserve unrelated tank pixels inside the new bodice.

Small isolated upper-thigh slivers at a skirt side are covered by locally
extending the outer 24 pixels of painted cloth. Large visible legs and limbs
emerging below the hem are retained. Interior fold coordinates stay fixed;
an earlier whole-row fitting trial was rejected because it bent all folds into
wavy bands during running. The final seven pixels at the cloth-to-cloth waist
overlap are blended to reduce the stepped source-mask boundary.

Preparation refuses to publish a dress ZIP if visible original tank/shorts
pixels are left uncovered. This is a material-coverage check, not a declaration
of perfect animation. The 2D fitted folds do not simulate fabric inertia or
replace hand-drawn pose-specific folds. The source video's blur and colour
fringes on untouched body parts remain. Source and final composed previews must
still be reviewed at native size and in motion.

Known visual limitations include a slightly stepped waist contour in the deep
crouch around source frame 89, a locally rounded skirt side where it covers the
crouched thigh, and uneven strokes along parts of the generated hem. The final
boundary is covered, but it is not described as seamless or physically simulated.

`catalog-items.json` records generated item hashes and paths. Actual application
export/replay evidence is maintained separately in `docs/kling-wardrobe`.
