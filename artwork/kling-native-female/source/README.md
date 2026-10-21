# Native Kling female study sources

`reference.png` is copied **verbatim** from the approved transparent female
standing frame 348 (14.50 s), retained as
`artwork/kling-jump/prepared/female-library-preview.png`. Its 704×1056 RGBA
canvas, face, neck, body proportions, clothing, shading and smooth alpha remain
unchanged. This is the female original, not a recolored or reshaped male asset.

`hidden-joints.png` is one development-time OpenAI image-generation result
conditioned on this exact female reference. The original generated PNG is
retained unchanged. It contains separately painted arm, vest, leg and shorts
coverage intended only for occluded joint allowances. These regions are newly
authored supplementary paint, **not** recovered original layers or video pixels.
The complete request is retained in `generation-prompt.txt`; exact file hashes
are in `provenance.json`.

Although a transparent background was requested and the image has an alpha
channel, the generated sheet includes peripheral translucent glow. Asset
preparation must use explicitly registered interior samples and masks, excluding
that glow; no generated background should enter the rendered character. The
sheet is a source bank, not a claim that every pictured object is used. Actual
selected regions, destination positions and ownership masks are recorded by the
preparation script and its report.

Visible original artwork is partitioned into registered parts. Supplemental
coverage belongs behind the original visible owners and may become visible
only when a new joint pose uncovers it. Posed renders are skeletal derivatives,
not source-video frames. Neither standing reconstruction integrity nor technical
checks establish artistic acceptance or natural continuous animation.

The completed female preparation uses the generated arm/leg paint for shoulder,
upper-arm and ankle allowances. An explicit traced arm-sheet mask excludes the
generated glow. Hip allowances instead sample small interior patches of the
original female shorts: initial generated cloth was visibly lighter. This is
newly constructed hidden coverage using original texture, not a recovered layer.
The generated vest and shorts remain unused source-bank objects. Original
visible pixels always overwrite supplementary coverage. Exact boxes, donor
names, masks and pixel counts are in `../prepared/preparation-report.json` and
`scripts/prepare-kling-native-female.py`.
