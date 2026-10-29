# Visual review of the actual exports

Reviewed the final `browser/round-4/` browser downloads, not just preparation
script reconstructions. Original and daily packs have matching frame IDs/timing.
The scope below is native-frame/contact-sheet inspection. Browser playback and
recordings are separate technical evidence; these notes do not claim a human
watched every loop in real time.

## Corrections made during this iteration

- Browser rendering rejected a male bottom pixel at `(304,582)` in frame 0:
  Pillow polygon coverage differed from the runtime's pixel-center scanline
  boundary. Ownership now excludes the runtime protection raster with an
  additional 2 px guard. Head/hand protection polygons were not relaxed.
- Male jump source242 had a warm-colored tank interior mistaken for skin,
  leaving an obvious peach hole after recoloring. A manually reviewed cloth
  polygon records the exact source identity and removes only that cloth from
  the skin-seed proof; the tank region now receives its material consistently.
- Male jump source200 had a raised shoe heel wrongly classified as top cloth.
  Its slot was corrected to shoe ownership. Waist guides for that pose now
  follow the observed tank hem. Source242's reviewed shorts seam also has an
  explicit material-ownership polygon. Reasons, vertices and hashes are saved
  with the reviewed keyposes and audit.

## Final sample coverage and findings

Male inspection covered native source jump poses 200, 208, 214, 224, 231, 238,
242 and 249 from the downloaded daily pack, plus all 18 run and 50 jump GIF
frames as contacts. The large tank hole and blue heel fragment are gone. No
visible new face or exposed-skin recoloring was found in those samples.

Female native second-jump inspection covered source 234, 238, 240, 242, 243,
244, 245 and 249, the downloaded PNG at source208, and all 18 run and 50 jump
GIF frames as contacts. The raised-arm tank and waist follow the original
silhouette; no large gray cloth holes or visible new face/skin recoloring were
found. Native original/daily sample comparisons also retained exact alpha.

The full technical audit separately checks **all 209 frames**, including alpha,
registered head/hands, independently marked skin seeds and pixels outside
selected garment ownership. Those checks are not an exhaustive anatomical or
artistic quality score.

## Visible limitations retained

- Male source242 still has a narrow dark purple/ink fringe on the outer shorts
  edge. The conservative material mapping preserves some original dark color.
- Female source242 retains a tiny gray strip at the left hem. Small neckline
  and underarm strips remain where ownership/protection is conservative.
- Source lighting remains in the materials: male walking shorts can appear
  substantially darker than standing shorts. The fixed color mapping preserves
  source shading rather than normalizing brightness separately for each pose.
- Original olive/green fringe remains near the neck and raised hand in some
  jumping poses; source blur and changing contours remain, particularly around
  the inter-jump recovery. These are visible source limitations.
- Different source clips still change viewpoint, shading and proportions at
  action cuts. The final double-jump pose is a shallow crouch, not idle. A queued
  return to idle can visibly cut; no invented recovery drawings conceal it.

The result is a reviewable side-view movement and same-cut wardrobe candidate.
It is not approval of seamless new garment silhouettes, physical foot planting,
or completely artifact-free source animation.
