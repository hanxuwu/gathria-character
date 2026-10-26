# Refined source-mouth expressions

This additive release keeps Natural, Gentle and Joyful available and appends
**Gentle smile (refined)** (`gentle-v2`) and **Joyful (soft motion)**
(`joyful-v2`) for both characters. Natural remains the original source face.
The prior expression release and every previously published bank stay intact.

Gentle v2 widens and deepens each pose's own painted smile with a compact local
pixel remap. A constant scale across the mouth preserves the original rounded
curve; a smooth falloff connects its surrounding skin. Eyes, eyelids, eyebrows,
nose, head silhouette, alpha and foreground hands are not repainted. The mouth
treatment continues through original blink and half-blink poses while retaining
their eye artwork. Source celebration laughter remains exact. This is a more
readable closed-mouth smile, not a new character or a generated replacement face.

Joyful v2 retains the character's own frame-78 celebration-mouth donor from v1.
Only source jump frames **88, 89, 90, 91, 100, 101, 102 and 103** receive additional
local softness. The strongest treatment is on 89/90 and 101/102; the surrounding
frames receive less. The operation is confined to the existing donor-mouth
envelope, retaining the prior brows, cheeks and every other Joyful frame exactly.
No source pose, frame ID, hold, action order, FPS, anchor or source timestamp is
changed.

## Native authoring review

These are offline prototypes made from original source pixels and the released
v1 banks. They are not browser-export evidence:

- Gentle, Natural / v1 / v2: [male](review/male-gentle-prototype-1x.png) · [female](review/female-gentle-prototype-1x.png).
- All eight softened jump poses, Natural / v1 / v2: [male](review/male-joyful-prototype-1x.png) · [female](review/female-joyful-prototype-1x.png).

The Gentle boards show source frames 0, 55, 86 and 78, including a native blink
and preserved laughter. Review was bounded to two prototype attempts. The first
stronger corner warp made the curve too pointed; the shipped second attempt
scales the original mouth curve smoothly. The Joyful treatment was retained
from the first attempt. Prototype JSON records native changed-pixel counts.

## Compatibility and storage

Eight new bank ZIPs contain copies of the current base and hairstyle banks.
Every original style entry and frame mapping remains exact. The final Joyful
atlas is extended downward; its complete old paint and ownership pixel regions
remain exact, including unused padding. The earlier atlas PNG files remain
byte-identical. The extended PNG's bytes necessarily change with its dimensions.
No earlier bank file is overwritten.

This layout keeps the male base within its existing eight-page limit and keeps
all banks within the existing 64 Mi-pixel and 64 MiB archive limits. The two new
styles coexist with the old variants. Existing projects keep their embedded bank
bytes and selections; the explicit appearance-update copy flow can expose the
new variants without silently upgrading a saved result.

| Base bank | Pages | Total atlas pixels | Added atlas pixels |
| --- | ---: | ---: | ---: |
| Male | 8 | 65,946,624 | 883,456 |
| Female | 7 | 64,819,200 | 1,112,064 |

The eight new ZIPs total 265,019,016 bytes (about 253 MiB). No page-count,
pixel-count, archive-size or runtime-cache limit is increased.

[release-index.json](release-index.json) pins the original and new URLs, hashes,
bank IDs, style inventories and atlas budgets. The independent
[asset-validation.json](asset-validation.json) reads the shipped ZIPs and
reconstructs both new styles across all 184 unique source poses. It verifies old
style mappings and atlas regions, source alpha, face ownership, foreground
protection, conservative eye/nose regions and the eight exact Joyful exceptions.
Equivalent new expression pixels are checked across all eight banks. The source
guides are inferred authoring annotations, not anatomical segmentation; native
visual review remains necessary at feature boundaries.

## Reproduce

Use the existing Pillow, NumPy and OpenCV authoring environment. The original
release index is the frozen baseline even after catalog publication:

```sh
python scripts/refine-kling-expressions.py --prototype
python scripts/refine-kling-expressions.py --package
python scripts/verify-kling-expression-refined.py
```

Browser captures, saved-project reopens and independent CharacterPack playback
are separate validation steps. These prototypes do not claim them, and technical
checks do not constitute user visual acceptance. Source motion blur, source
anatomy and the prior painting's limitations remain visible.
