# Source-visible male limb ownership

Offline garment-authoring aids for the exact `male-full-outfits-v1` source/protection profile. These masks do not move source pixels, recover hidden anatomy, or introduce a runtime skeleton.

`masks.zip` contains 17 native binary masks per pose for all 88 source poses. `index.json` records every PNG's count, native bounds and SHA256, plus source/profile/template and archive hashes. The archive was CRC-tested and every delivered PNG decoded and checked for 704×1056 dimensions and binary values.

Diagnostic sheets use green for the near arm, orange for the far arm, pink for the near leg and blue for the far leg. They overlay the unchanged source image. `keyposes-ownership-review.png` includes standing, crossing legs, rear-arm occlusion, run, raised arms, crouch, flight and landing poses.

The helper partitions connected warm source-skin surfaces rather than allowing a hidden opposite-leg guide to cut triangular regions out of a foreground leg. It retains source neck, head, fists, shoes and uncertain source matte fringe. All 88 poses have zero remaining unclassified eligible skin pixels; preserved neck and fringe remain explicitly separate from clothing ownership.

Local authoring-only axis corrections expose small visible rear-arm slivers 37/48/57, register the hidden rear shoulder 58–60, and position returned wrists 64/105–110. Frame 64 has an explicit source-reviewed far-leg sliver behind the crossing front shoe. None of these local fitting points edits the 17 frozen registration landmarks.

```python
from kling_male_limb_ownership import MaleLimbOwnership

author = MaleLimbOwnership()  # Exact delivered male-full-outfits-v1 template
semantic = author.semantic(frame_id)  # tank, shorts, skin, shoes, head, hands
masks = author.for_frame(frame_id, source_rgba)
points = author.points(frame_id)  # local fitting axes, including authored corrections
original_guide = author.guides[frame_id]  # immutable 17-point registration
```

Major masks `nearArm`, `farArm`, `nearLeg`, `farLeg` are mutually exclusive and exclude the protected/source-clothing regions. `neckSkin` and `preservedSourceFringe` must remain original. `protected` is the exact profile raster. `UpperArm`/`Forearm` and `Thigh`/`Shin` subdivisions use nearest finite segments and are only fitting hints: folded forearms need garment-specific overlap/crease rules. They do not encode anatomical hidden layers or certify final clothing quality.
