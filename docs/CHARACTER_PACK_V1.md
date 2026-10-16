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

The pack format remains version 1 for all seven artwork versions and the optional V6 running extension. Dimensions are metadata, not fixed format constants. V1/V2 use 48×64 frames, a 384×128 sheet, and anchor (24, 60). Historical detailed V3–V7 use 192×256 frames, a 1536×512 sheet, and anchor (96, 240), at recommended scale 1. V6 with `motionVersion: 1` uses the same frame size and anchor in a 1536×1024 sheet. This is the preserved Art V2 generator's layout:

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

### Optional running animation

New V6 running packs identify their generator as `gathria-polished-pixels-v6-motion-v1`. They keep the original V6 first two atlas rows, frame rectangles 0–11, and idle/walk sequences unchanged. They append these twelve drawing rectangles:

| Frame IDs | Source row | Source x coordinates                     |
| --------- | ---------- | ---------------------------------------- |
| 12–19     | `y = 512`  | `0, 192, 384, 576, 768, 960, 1152, 1344` |
| 20–23     | `y = 768`  | `0, 192, 384, 576`                       |

Every rectangle is 192×256. The sheet declares `columns: 8`, `rows: 4`, `width: 1536`, `height: 1024`. The last four cells of the first and fourth rows are unused and transparent. There are **24 drawing rectangles**, not 32 frames. The appended animation is:

```json
"run": {
  "frames": [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  "fps": 18,
  "loop": true
}
```

The exact run cycle is `12 / 18` seconds (2/3 second, approximately 666.67 ms). The pack carries this frame rate without GIF timing quantization. Review GIFs use whole-centisecond cumulative rounding and therefore last 670 ms; their individual delays are recorded in `docs/running/preview-timelines.json`.

`animations.run` is optional in the version 1 contract. If present, it must satisfy the same frame-reference, frame-rate and loop validation as idle/walk; malformed run metadata is rejected. If absent, this player disables Run and explains that the pack does not contain running. It does not speed up walking as a substitute. Consumers should check availability before selecting an animation. An older consumer that ignores unrecognized animation entries can still play the preserved idle/walk sequences using the declared image dimensions.

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
| `animations.run`                      | Optional; if present, requires valid `frames`, `fps`, and `loop`. Missing means running is unavailable.                                   |
| Animation `frames`                    | 1–1024 existing frame IDs in playback order. Repeated references are allowed.                                                             |
| Animation `fps`                       | Finite number from 0.1 to 60. This is frame changes per second.                                                                           |
| Animation `loop`                      | Boolean. `false` means hold the last frame after completing the sequence.                                                                 |
| `facing`                              | Exactly right-native, right=`none`, left=`mirror-x` for v1.                                                                               |
| `anchor.x`, `anchor.y`                | Finite frame-local coordinates, from 0 to frame width/height inclusive. Boundary anchors are supported.                                   |
| `anchor.units`, `anchor.origin`       | Literals `"pixels"`, `"top-left"`.                                                                                                        |
| `scale.pixelArt`, `scale.integerOnly` | Both literal `true`.                                                                                                                      |
| `scale.recommended`                   | Integer 1–16. Consumers may choose another positive integer display scale.                                                                |
| `configuration`                       | Literal `"character.json"`.                                                                                                               |

Animation metadata does not encode world movement speed. The Studio, independent player and delivered review GIFs play in place at a fixed anchor. A consuming scene may separately move the anchored sprite while playing `walk` or `run`, but travel-speed/stride matching is outside these clips. All artwork versions use a 0.8-second walking sequence. Timing is read from each manifest:

| Artwork | Manifest `generator`           | Idle sequence                                                | Idle duration |
| ------- | ------------------------------ | ------------------------------------------------------------ | ------------- |
| V1      | `gathria-original-pixels-v1`   | `[0, 1, 2, 3]` at 4 fps                                      | 1 second      |
| V2      | `gathria-warm-pixels-v2`       | `[0, 0, 0, 1, 1, 2, 2, 1, 0, 0, 3, 0]` at 4 fps              | 3 seconds     |
| V3      | `gathria-detailed-pixels-v3`   | `[0, 0, 0, 1, 1, 2, 2, 1, 0, 0, 3, 0]` at 4 fps              | 3 seconds     |
| V4      | `gathria-expressive-pixels-v4` | `[0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,2,3,2,0,0,0]` at 8 fps | 3 seconds     |

V5 uses `gathria-cohesive-pixels-v5` with the same idle sequence/timing as V4 (whole-face portraits replace its procedural blink). V6 uses `gathria-polished-pixels-v6` and V7 uses `gathria-harmonized-pixels-v7`, both with idle `[0,0,1,1,2,2,2,2,3,3,0,0]` at 4 fps, also three seconds. Historical artwork exports retain twelve drawing rectangles; repeated references express holds, not extra image cells. The V6 motion extension adds twelve run rectangles and leaves those original sequences intact.

A repeated reference holds the same drawing for another sequence step. Consumers must preserve these references rather than deduplicate the animation list.

## Rendering, facing, and placement

1. Decode and validate the image and manifest. Resolve each animation reference by the frame's `id`.
2. Compute the frame-list position as `floor(elapsedSeconds * fps)`. Apply modulo by sequence length when looping, otherwise clamp to the last list position.
3. Use the selected frame rectangle as the source region. Set canvas `imageSmoothingEnabled = false` and choose an integer zoom.
4. The world position represents the frame-local anchor. Translate the drawing context to the desired world position, then scale it by `(zoom, zoom)` for right or `(-zoom, zoom)` for left.
5. Draw the frame with destination top-left `(-anchor.x, -anchor.y)` and unscaled destination dimensions `(frame.width, frame.height)` inside that transformed context. Restore the context after drawing.

This mirrors around the attachment point and preserves the same world anchor, including for an asymmetric anchor. Do not mirror the entire atlas or offset a flipped character by a guessed width. V1/V2 place the ground boundary at local `y = 60`, with planted sole pixels ending at `y = 59`; V3–V7 use `y = 240` and `y = 239` respectively. Head and torso bobbing does not move that ground boundary. Running contact phases retain it; airborne feet and the lifted gown may end above it. Switching animation resets clip time while keeping the same anchor.

The runnable reference is `src/consumer/player.ts`, used by the independent `/player.html` entry point. The consumer imports the pack and metadata utilities, never the generator or editor state. `src/compat/gathria.ts` is the isolated place to prepare data for a future runtime adapter; its status remains unverified.

## Editable configuration

`character.json` is UTF-8 JSON. Configuration schema versions and pack format versions are separate: both configurations below export a CharacterPack manifest with `schemaVersion: 1`.

### Art V2 configuration

Preserved Art V2 characters use this complete configuration:

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

- `schemaVersion` is `2`; `artworkVersion` is explicitly `2` for the preserved warm pixels `3` for preserved detailed illustrations, or `4` for expressive illustrations. V4 additionally requires `expression` (`gentle` or `joyful`) and `hairAccessory` (`none` or `flowers`). These fields are not required for older artwork.
- Current default V6 and retained V5/V7 use `schemaVersion: 2` and require `expression` (`neutral`, `gentle`, `joyful`) and `hairAccessory` (`none`, `flowers`), in addition to the appearance fields below. V1–V7 files are never silently converted. For V1–V5 inputs, **Create polished copy** explicitly creates a V6 configuration; every exported package plays using its saved pixels.
- `faceVariant`: `heart`, `oval`, or `round`.
- `hairstyle`: `crop`, `bob`, `waves`, or `mohawk`.
- `upperClothing`: `tee`, `hoodie`, `jacket`, `suit`, or `bodice`.
- `lowerClothing`: `trousers`, `shorts`, `skirt`, or `dress`.
- `name` must be nonblank and at most 60 characters before trimming. The parser trims it.
- Every color must be `#` followed by six hexadecimal digits. The parser normalizes letters to uppercase. The editor's swatches are suggestions; any valid six-digit color is allowed.

The polished casual, wedding suit, and wedding dress buttons are editable starting points. Garments, face shapes, hairstyles, and colors remain independently selectable; no option is restricted by another appearance choice.

### V6 motion version 1 and saved playback

Running is an explicit configuration extension, separate from artwork version. New Studio characters use V6 with `motionVersion: 1`; existing V6 files without the field still produce their original 1536×512 idle/walk pack. **Add running** creates an enabled configuration without changing its V6 appearance. V1–V5 users first choose **Create polished copy**, then **Add running**; V7 files stay V7 and have no automatic conversion or Run action.

The fields below supplement the complete V6 appearance configuration:

```json
{
  "schemaVersion": 2,
  "artworkVersion": 6,
  "motionVersion": 1,
  "preview": { "animation": "run", "facing": "left" }
}
```

This snippet is an extension example, not a complete importable character. `motionVersion` accepts only `1`, only with artwork V6. `preview` is optional and requires that explicit motion version; its animation must be `idle`, `walk` or `run`, and facing must be `left` or `right`. Invalid values are rejected. Preview choices do not affect generated pixels. The editor saves its current action/facing in running-enabled files and restores them on reopen. Without saved preview choices it opens at idle/right. Historical files are saved without injecting these fields. The independent player discovers available clips from the manifest and permits explicit action/direction selection; playback does not depend on a configuration's preview choice.

When a pack includes configuration with `motionVersion: 1`, its manifest must contain a valid run animation. A mismatched configuration and manifest is rejected. A PNG/manifest-only pack remains playable without configuration.

### Preserving V1 and V2 configurations and packages

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

The dispatcher in `src/core/generator.ts` sends schema 1 to the frozen V1 renderer; schema 2 dispatches by `artworkVersion` to its preserved V2–V7 renderer. Only explicit V6 `motionVersion: 1` selects the running extension. Reopening, editing, resetting, choosing presets, and saving an older configuration keeps its artwork version and motion capabilities. **Create polished copy** explicitly opts into V6; opening a file never invokes that conversion. V1 gains a face variant on conversion, while later versions retain their selected face. No implicit downgrade is provided.

Generation is deterministic for a given appearance, artwork version and motion version. Regression tests compare decoded V1 and V2 RGBA against fixed hashes from published examples and protect subsequent frozen renderer/source files. Running tests compare the complete first two atlas rows against the original V6 generator. Existing exported packages retain their original pixels and timing because the independent player reads their PNG and manifest without regeneration.

Examples remain separated: `public/samples/` for V1, `v2/` for V2, `detailed/` for V3, `expressive/` for V4, `polished/` for V6, `harmonized/` for V7 and `running/` for V6 motion version 1. V5 evidence packs remain in `docs/art-cohesive/`. `npm run samples` regenerates only V1. Version-specific evidence scripts retain their explicit historical configurations. New Studio presets default to V6 with motion version 1; the running evidence is generated by `scripts/generate-running-evidence.mjs`.

Saving and reopening a configuration preserves all editable inputs. Import validates fields and the manifest/configuration name match. The manifest's `generator` is an informational provenance identifier, not executable code or a substitute for configuration validation. There is no cryptographic binding between configuration and appearance: a consumer cannot prove that a manually edited PNG came from that configuration. The editor exports its current configuration and corresponding generated pixels together.

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

V1/V2 use original procedural pixel shapes. V3–V7 use AI-assisted illustration banks created during development and prepared into local masked layers. The V6 running extension uses the existing V6 layers with run-only technical masks and articulated poses; it introduces no new illustration source or image-generation call. The detailed renderer composes these assets deterministically; it makes no runtime model calls. See [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md) for the source locations and workflow. `PROVENANCE.txt` identifies the appropriate origin and includes the MIT License in every export. Retain its copyright and permission notice when redistributing; visible in-game credit is not required.

The application does not implement photo input or AI generation as a user feature. A future provider can implement `CharacterGenerator`, but its output must satisfy the same manifest, pixel, and export contract.

Gathria compatibility is unverified until its actual loader, frame dimensions, animation names/timing, anchor, scaling, and facing rules are inspected at a recorded source revision. The standalone format and consumer remain usable independently of that work.
