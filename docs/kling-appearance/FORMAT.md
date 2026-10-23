# Head appearance format and compatibility

Head customization is an optional source-sprite tool inside the existing
wardrobe. It does not change the original source packs or the optional skeletons.

## Editable project

Wardrobe project V1 continues to contain `wardrobe.json`, the exact original
`source.character.zip`, original `registration.json` and embedded garment ZIPs.
It has no head selection and remains original by default.

V2 adds one embedded `appearance.zip` and the following document member:

```json
{
  "appearance": {
    "bankSha256": "SHA-256 of the exact embedded appearance ZIP",
    "hairId": "soft-crop",
    "faceId": "gentle",
    "hairColor": "chestnut"
  }
}
```

`hairId` and `faceId` may be null. Colors are `chestnut`, `espresso` and `copper`.
Loading a bank is explicit; old V1 projects are not silently upgraded. Clothing
presets preserve the independent head choice; **Reset appearance** clears hair
and face. A loaded but inactive bank does not change source frame geometry.

The catalog pins the current bank and its released predecessor hashes alongside
the exact source/registration hashes. **Preview updated appearance** checks those
bindings and keeps the candidate separate from the open project. **Save updated
copy** preserves the original clothing, hair/face/color and saved action/facing.
Dialog inspection controls do not change those saved settings. Unknown/custom
banks cannot be inferred to be older from their ID and are not automatically
replaced. Cancelling or saving a copy leaves the current session unchanged.

## Appearance bank V1

Content revision 2 (`kling-male-appearance-v2` / `kling-female-appearance-v2`)
repairs the ear-follow registration and donor cutout edges without changing this
schema. Existing V2 wardrobe projects use their embedded bank bytes and SHA,
so their appearance is not silently regenerated from the newer catalog bank.

Content revision 3 adds an optional per-pose `hairOcclusionBounds`. It extends
the original `headBounds` only upward and sideways by at most three source pixels;
its bottom is identical. This distinguishes original scalp raster remnants from
body/garment occlusion without alpha or skin-color thresholds. Explicit foreground
hand/arm masks still take precedence, and facial ownership still uses the unchanged
`headBounds` and inner-face polygon. Absent this field, the renderer uses the old
head bounds exactly. All revision-2 atlas/ownership PNG bytes are retained in
revision 3; only bank metadata changes. Older application builds that reject
unknown bank fields require this updated reader for new V3-content projects;
baked CharacterPack exports remain independent of appearance-bank metadata.

Male content revision 4 (`kling-male-appearance-v4`) refits the existing front
hair over the upper ear and restores the soft bob's existing donor rear lock as
an explicit `hair-back` layer. The existing renderer places that lock behind the
original ear, head and clothing. This is an authored hair update, not another
schema or source-body change: the original face layer, anchors, source frames,
padding and action timing are retained. Female content remains revision 3 and
its bank bytes are unchanged. Male revisions 1, 2 and 3 remain reproducible from
their embedded banks; an exact-hash catalog match offers an explicit preview and
separate updated copy. No saved file is silently upgraded or rewritten.

`manifest.json` identifies `gathria-sprite-appearance-bank`, version 1. It binds
both the exact original source ZIP SHA and original clothing-registration SHA,
character ID and native dimensions. It contains:

- Complete per-frame pose records: original frame/source-frame IDs, six head
  anchors, observed head bounds, inner-face polygon, hair bounds and foreground
  hand/forearm polygons. Coordinates remain in the original source frame.
- Versioned hairstyle/face IDs and their layer inventory. Every layer covers
  every source frame. `mode: "source"` explicitly keeps original action expressions.
- Cropped patch rectangles and source-space offsets in `patches-N.png`; paired
  `ownership-N.png` alpha is strictly binary. Transparency and ownership are
  separate; antialiased hair edges use source-over rather than opaque replacement.
- Explicit transparent padding, provenance and page budgets. The initial banks
  have 5 pages each and cover 88 male / 96 female source poses.

Only hair uses the hair-color transform. Face patches preserve source alpha and
are confined to the inner face; garments still cannot paint the head or hands.
Front hair respects foreground hands and body/clothes. Rear-hair layers, when
present, compose behind existing pixels. The original short-style banks use
front layers only; male revision 4 soft bob adds a rear layer. Soft crop and
the unchanged female revision 3 styles retain front-only layers.

Imports verify bounded ZIP structure, complete PNG streams, ownership and every
pose before acceptance. A bounded cache remembers a successful full validation
by copied content SHA + registration SHA; changed bytes, failed or canceled
imports cannot reuse it. Runtime composition still checks selected patch regions
against source pixels. There is no runtime AI, face detection or optical flow.

## Independent export

The consumer continues to load ordinary baked CharacterPack V2/V3. It does not
need the wardrobe, appearance bank, image-generation service or a skeleton.
Active head looks use 768×1184 frames and anchor (384,1126), translated from
704×1056 and (352,998) by transparent left=32/top=128 padding. Source pixels are
not scaled; frame IDs, order, FPS, loop/one-shot flags and transition routes are
preserved. The padded atlas is repacked into three bounded pages. `character.json`
records the bank/selection/padding provenance; appearance is baked into PNGs.

Original/default source export remains byte-identical. Newly encoded PNGs now
use bounded Pako streaming compression after an independent decode check exposed
an invalid-distance defect in the earlier Fflate streaming encoder for sparse
padded frames. Compressed bytes (including a historical still-pack ZIP checksum)
can differ; decoded pixels and PNG color metadata remain unchanged. Existing
exported files stay readable. Tests retain both deterministic new encoding and
the earlier native-study RGBA hash.
