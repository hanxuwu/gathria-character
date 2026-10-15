# CharacterPack v1

CharacterPack is a standalone, browser-generated asset format. It is **not a verified Gathria runtime contract**. The frame size, timing, layout, and attachment point below are prototype defaults. A Gathria adapter must be checked against the actual runtime before compatibility can be claimed.

## Files

A `.zip` contains exactly these five files at its root:

| File              | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `spritesheet.png` | Lossless PNG; generated sheets use transparent RGBA pixels. |
| `manifest.json`   | Versioned image, frame, animation, and placement metadata.  |
| `character.json`  | Complete editable source configuration.                     |
| `PROVENANCE.txt`  | Artwork origin and generated-asset usage permission.        |
| `INTEGRATION.md`  | Short, self-contained playback instructions.                |

There are no external asset URLs, executable scripts, paid services, or credentials. Filenames are case-sensitive. Additional files, folders, duplicate filenames, and path traversal are rejected by this implementation. Re-zipping a containing directory instead of its five files will fail validation.

PNG and manifest can also be imported directly into the standalone player without `character.json`. Playback always uses the imported PNG pixels. It never calls the generator. When configuration is supplied, it is validated as described below.

## Manifest

The pack format remains version 1 for both artwork versions. This is the Art V2 generator's default layout:

```json
{
  "schemaVersion": 1,
  "format": "gathria-character-pack",
  "name": "Mira",
  "generator": "gathria-warm-pixels-v2",
  "spritesheet": {
    "file": "spritesheet.png",
    "width": 384,
    "height": 128,
    "frameWidth": 48,
    "frameHeight": 64,
    "columns": 8,
    "rows": 2
  },
  "frames": [
    { "id": 0, "x": 0, "y": 0, "width": 48, "height": 64 },
    { "id": 1, "x": 48, "y": 0, "width": 48, "height": 64 },
    { "id": 2, "x": 96, "y": 0, "width": 48, "height": 64 },
    { "id": 3, "x": 144, "y": 0, "width": 48, "height": 64 },
    { "id": 4, "x": 0, "y": 64, "width": 48, "height": 64 },
    { "id": 5, "x": 48, "y": 64, "width": 48, "height": 64 },
    { "id": 6, "x": 96, "y": 64, "width": 48, "height": 64 },
    { "id": 7, "x": 144, "y": 64, "width": 48, "height": 64 },
    { "id": 8, "x": 192, "y": 64, "width": 48, "height": 64 },
    { "id": 9, "x": 240, "y": 64, "width": 48, "height": 64 },
    { "id": 10, "x": 288, "y": 64, "width": 48, "height": 64 },
    { "id": 11, "x": 336, "y": 64, "width": 48, "height": 64 }
  ],
  "animations": {
    "idle": {
      "frames": [0, 0, 0, 1, 1, 2, 2, 1, 0, 0, 3, 0],
      "fps": 4,
      "loop": true
    },
    "walk": { "frames": [4, 5, 6, 7, 8, 9, 10, 11], "fps": 10, "loop": true }
  },
  "facing": { "native": "right", "right": "none", "left": "mirror-x" },
  "anchor": { "x": 24, "y": 60, "units": "pixels", "origin": "top-left" },
  "scale": { "pixelArt": true, "recommended": 4, "integerOnly": true },
  "configuration": "character.json"
}
```

The first row contains four distinct idle drawings. Art V2 holds some drawings through repeated frame references for a three-second idle cycle. The first row's last four cells are unused and transparent. They are not animation frames. Source rectangles and IDs are authoritative; do not infer frame IDs from array positions or assume every grid cell is occupied.

### Required values and limits

All fields shown above are required. Validation returns a copy containing recognized fields, ignoring additional metadata fields. There are no implicit defaults for missing fields.

| Field                                 | Contract                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                       | Integer `1`; other versions are rejected.                                                                                                 |
| `format`                              | Literal `"gathria-character-pack"`.                                                                                                       |
| `name`                                | Nonblank string, at most 80 characters; must equal the parsed configuration name when configuration is present.                           |
| `generator`                           | Nonblank provenance identifier, at most 120 characters. It is informational, not executable.                                              |
| `spritesheet.file`                    | Literal `"spritesheet.png"`.                                                                                                              |
| `spritesheet.width`, `height`         | Integers 1–4096, matching the decoded image.                                                                                              |
| `frameWidth`, `frameHeight`           | Positive integers, no larger than their corresponding sheet dimensions.                                                                   |
| `columns`, `rows`                     | Positive integers; their product is at most 1024. Sheet dimensions must exactly equal frame dimensions multiplied by the grid dimensions. |
| `frames`                              | Between 1 and `columns × rows` rectangles; unused grid cells are allowed.                                                                 |
| Frame `id`                            | Unique integer 0–65535. No requirement that IDs be contiguous or array-ordered.                                                           |
| Frame `x`, `y`                        | Nonnegative integer source offsets, aligned to the frame grid and fully inside the sheet. Rectangles cannot overlap.                      |
| Frame `width`, `height`               | Exactly the declared `frameWidth` and `frameHeight`.                                                                                      |
| `animations.idle`, `animations.walk`  | Both required. Each supplies `frames`, `fps`, and `loop`.                                                                                 |
| Animation `frames`                    | 1–1024 existing frame IDs in playback order. Repeated references are allowed.                                                             |
| Animation `fps`                       | Finite number from 0.1 to 60. This is frame changes per second.                                                                           |
| Animation `loop`                      | Boolean. `false` means hold the last frame after completing the sequence.                                                                 |
| `facing`                              | Exactly right-native, right=`none`, left=`mirror-x` for v1.                                                                               |
| `anchor.x`, `anchor.y`                | Finite frame-local coordinates, from 0 to frame width/height inclusive. Boundary anchors are supported.                                   |
| `anchor.units`, `anchor.origin`       | Literals `"pixels"`, `"top-left"`.                                                                                                        |
| `scale.pixelArt`, `scale.integerOnly` | Both literal `true`.                                                                                                                      |
| `scale.recommended`                   | Integer 1–16. Consumers may choose another positive integer display scale.                                                                |
| `configuration`                       | Literal `"character.json"`.                                                                                                               |

Animation metadata does not encode world movement speed. A consumer may move the anchored sprite while playing `walk`, but it must use the actual pose frames. Both artwork versions use a 0.8-second walking sequence. Timing is read from each manifest:

| Artwork | Manifest `generator`         | Idle sequence                                   | Idle duration |
| ------- | ---------------------------- | ----------------------------------------------- | ------------- |
| V1      | `gathria-original-pixels-v1` | `[0, 1, 2, 3]` at 4 fps                         | 1 second      |
| V2      | `gathria-warm-pixels-v2`     | `[0, 0, 0, 1, 1, 2, 2, 1, 0, 0, 3, 0]` at 4 fps | 3 seconds     |

A repeated reference holds the same drawing for another sequence step. Consumers must preserve these references rather than deduplicate the animation list.

## Rendering, facing, and placement

1. Decode and validate the image and manifest. Resolve each animation reference by the frame's `id`.
2. Compute the frame-list position as `floor(elapsedSeconds * fps)`. Apply modulo by sequence length when looping, otherwise clamp to the last list position.
3. Use the selected frame rectangle as the source region. Set canvas `imageSmoothingEnabled = false` and choose an integer zoom.
4. The world position represents the frame-local anchor. Translate the drawing context to the desired world position, then scale it by `(zoom, zoom)` for right or `(-zoom, zoom)` for left.
5. Draw the frame with destination top-left `(-anchor.x, -anchor.y)` and unscaled destination dimensions `(frame.width, frame.height)` inside that transformed context. Restore the context after drawing.

This mirrors around the attachment point and preserves the same world anchor, including for an asymmetric anchor. Do not mirror the entire atlas or offset a flipped character by a guessed width. The current generator places the ground boundary at local `y = 60`; foot pixels end at `y = 59` for a planted sole. Head and torso bobbing does not move that ground boundary.

The runnable reference is `src/consumer/player.ts`, used by the independent `/player.html` entry point. The consumer imports the pack and metadata utilities, never the generator or editor state. `src/compat/gathria.ts` is the isolated place to prepare data for a future runtime adapter; its status remains unverified.

## Editable configuration

`character.json` is UTF-8 JSON. Configuration schema versions and pack format versions are separate: both configurations below export a CharacterPack manifest with `schemaVersion: 1`.

### Art V2 configuration

New characters use this complete configuration:

```json
{
  "schemaVersion": 2,
  "artworkVersion": 2,
  "name": "Mira",
  "skinTone": "#E5AE87",
  "hairstyle": "waves",
  "hairColor": "#8A4935",
  "faceVariant": "heart",
  "upperClothing": "hoodie",
  "upperColor": "#447F79",
  "lowerClothing": "trousers",
  "lowerColor": "#484F68",
  "shoeColor": "#E9DFCC"
}
```

- `schemaVersion` and `artworkVersion` must both be `2`.
- `faceVariant`: `heart`, `oval`, or `round`.
- `hairstyle`: `crop`, `bob`, `waves`, or `mohawk`.
- `upperClothing`: `tee`, `hoodie`, `jacket`, `suit`, or `bodice`.
- `lowerClothing`: `trousers`, `shorts`, `skirt`, or `dress`.
- `name` must be nonblank and at most 60 characters before trimming. The parser trims it.
- Every color must be `#` followed by six hexadecimal digits. The parser normalizes letters to uppercase. The editor's swatches are suggestions; any valid six-digit color is allowed.

The polished casual, wedding suit, and wedding dress buttons are editable starting points. Garments, face shapes, hairstyles, and colors remain independently selectable; no option is restricted by another appearance choice.

### Preserving V1 configurations and packages

Original saved configurations remain supported without migration:

```json
{
  "schemaVersion": 1,
  "name": "Mira",
  "skinTone": "#E5AE87",
  "hairstyle": "waves",
  "hairColor": "#8A4935",
  "upperClothing": "hoodie",
  "upperColor": "#447F79",
  "lowerClothing": "trousers",
  "lowerColor": "#484F68",
  "shoeColor": "#E9DFCC"
}
```

V1 uses the same name, color, and hairstyle validation, but only `tee`, `hoodie`, and `jacket` for upper clothing and `trousers`, `shorts`, and `skirt` for lower clothing. V1 configurations cannot contain `artworkVersion` or `faceVariant`; contradictory hybrid files are rejected with an explicit migration message.

The dispatcher in `src/core/generator.ts` sends schema 1 to the frozen renderer in `src/core/generator-v1.ts` and schema 2 to `src/core/generator-v2.ts`. Reopening, editing, and saving a V1 configuration retains its original artwork. The editor's **Create Art V2 copy** action explicitly opts into the new renderer and adds a face variant; loading a file never invokes that conversion. Generation is deterministic for a given configuration and artwork version. V1 regression tests compare decoded RGBA output with the original sample hashes.

Existing exported packages retain their original pixels and animation timing. The independent player reads the imported PNG and manifest; it does not regenerate either artwork version. The original examples remain in `public/samples/`, and Art V2 examples are separate in `public/samples/v2/`. `npm run samples` uses `LEGACY_PRESETS` to regenerate only V1 examples; `node scripts/generate-art-v2-evidence.mjs` produces V2 examples and review evidence.

Saving and reopening either configuration preserves all editable inputs. Import validates field values and the manifest/configuration name match. The manifest's `generator` is a provenance identifier, not a command or a substitute for configuration version validation. The configuration contains no cryptographic binding to image appearance, so a consumer cannot prove that a manually edited PNG was generated from that configuration. The editor exports its current configuration and its corresponding generated pixels together.

## Import validation and resource limits

`src/core/pack.ts` implements the shared validation and browser PNG pipeline:

- The ZIP must be at most 32 MiB with at most the five specified files. Missing files are errors.
- PNG entries may be at most 32 MiB uncompressed. Each JSON or documentation file may be at most 256 KiB. Total declared uncompressed size may not exceed 33 MiB.
- ZIP store and deflate compression are supported. Encrypted, multi-volume, ZIP64, overlapping, malformed, or inconsistent local/central headers are rejected. Filenames must be valid UTF-8 and exactly match the allowed root names.
- Inflation uses small input chunks and stops when actual output exceeds the declared size. Every file's output size and CRC32 are checked. CRC32 detects accidental corruption; it is not a signature proving authorship.
- JSON is decoded as strict UTF-8 and parsed without evaluating code. Configuration and metadata are validated before image decoding.
- PNG signature and header dimensions are checked before decoding; the browser must then successfully decode the complete image and report the expected dimensions. Maximum decoded dimensions are 4096 × 4096.
- Object URLs used for import are revoked after decoding. The returned decoded `HTMLImageElement` remains usable for drawing. Temporary download URLs are also revoked.

Imports reject malformed input with actionable messages. The pure `readCharacterPackArchive` helper validates archive bytes, configuration, metadata, PNG signature, and header dimensions; only `loadCharacterPack` and `loadCharacterFiles` additionally perform real browser image decoding. Tests of the pure helper must not be mistaken for complete PNG decoding tests.

## Asset provenance and integration status

The built-in artwork consists of original procedural pixel shapes, palettes, and poses authored for this project. Generated output requires no external image assets. `PROVENANCE.txt` in every exported package grants use, modification, and redistribution of that original generated artwork, including commercial use, under the included MIT License. Retain its copyright and permission notice when redistributing; visible in-game credit is not required. It does not grant third-party trademark or identity rights.

The generator provides deterministic local generation only. It does not implement photo import or AI generation. A future provider can implement the small `CharacterGenerator` interface, but its normalized output must still satisfy this same manifest, pixel, and export pipeline.

Gathria compatibility is unverified until its actual loader, frame dimensions, animation names/timing, anchor, scaling, and facing rules are inspected at a recorded source revision. The standalone format and consumer remain usable independently of that work.
