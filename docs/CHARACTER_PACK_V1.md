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

This is the current generator's default layout:

```json
{
  "schemaVersion": 1,
  "format": "gathria-character-pack",
  "name": "Mira",
  "generator": "gathria-original-pixels-v1",
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
    "idle": { "frames": [0, 1, 2, 3], "fps": 4, "loop": true },
    "walk": { "frames": [4, 5, 6, 7, 8, 9, 10, 11], "fps": 10, "loop": true }
  },
  "facing": { "native": "right", "right": "none", "left": "mirror-x" },
  "anchor": { "x": 24, "y": 60, "units": "pixels", "origin": "top-left" },
  "scale": { "pixelArt": true, "recommended": 4, "integerOnly": true },
  "configuration": "character.json"
}
```

The first row's last four cells are unused and transparent. They are not animation frames. Source rectangles and IDs are authoritative; do not infer frame IDs from array positions or assume every grid cell is occupied.

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

Animation metadata does not encode world movement speed. A consumer may move the anchored sprite while playing `walk`, but it must use the actual pose frames. The prototype walking sequence lasts 0.8 seconds; idle lasts 1 second.

## Rendering, facing, and placement

1. Decode and validate the image and manifest. Resolve each animation reference by the frame's `id`.
2. Compute the frame-list position as `floor(elapsedSeconds * fps)`. Apply modulo by sequence length when looping, otherwise clamp to the last list position.
3. Use the selected frame rectangle as the source region. Set canvas `imageSmoothingEnabled = false` and choose an integer zoom.
4. The world position represents the frame-local anchor. Translate the drawing context to the desired world position, then scale it by `(zoom, zoom)` for right or `(-zoom, zoom)` for left.
5. Draw the frame with destination top-left `(-anchor.x, -anchor.y)` and unscaled destination dimensions `(frame.width, frame.height)` inside that transformed context. Restore the context after drawing.

This mirrors around the attachment point and preserves the same world anchor, including for an asymmetric anchor. Do not mirror the entire atlas or offset a flipped character by a guessed width. The current generator places the ground boundary at local `y = 60`; foot pixels end at `y = 59` for a planted sole. Head and torso bobbing does not move that ground boundary.

The runnable reference is `src/consumer/player.ts`, used by the independent `/player.html` entry point. The consumer imports the pack and metadata utilities, never the generator or editor state. `src/compat/gathria.ts` is the isolated place to prepare data for a future runtime adapter; its status remains unverified.

## Editable configuration

`character.json` is UTF-8 JSON with all of these fields:

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

- `schemaVersion` must be `1`.
- `name` must be nonblank and at most 60 characters before trimming. The parser trims it.
- Every color must be `#` followed by six hexadecimal digits. The parser normalizes letters to uppercase. The editor's swatches are suggestions; any valid six-digit color is allowed.
- `hairstyle`: `crop`, `bob`, `waves`, or `mohawk`.
- `upperClothing`: `tee`, `hoodie`, or `jacket`.
- `lowerClothing`: `trousers`, `shorts`, or `skirt`.

Saving and reopening this configuration preserves all editable inputs. Use the identified generator version to reproduce its pixels; later generator versions may change artwork. Import validates field values and the manifest/configuration name match. The configuration contains no cryptographic binding to image appearance, so a consumer cannot prove that a manually edited PNG was generated from that configuration. The editor exports its current configuration and its corresponding generated pixels together.

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

This MVP provides deterministic local generation only. It does not implement photo import or AI generation. A future provider can implement the small `CharacterGenerator` interface, but its normalized output must still satisfy this same manifest, pixel, and export pipeline.

Gathria compatibility is unverified until its actual loader, frame dimensions, animation names/timing, anchor, scaling, and facing rules are inspected at a recorded source revision. The standalone format and consumer remain usable independently of that work.
