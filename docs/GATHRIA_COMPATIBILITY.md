# Gathria runtime compatibility: UNVERIFIED

This project exports and independently plays **Gathria Character Pack v1**, its own documented interchange format. A successful run in `/player.html` demonstrates this format's portability; it does not demonstrate compatibility with the actual Gathria game runtime.

On 2026-10-15, a read-only `git ls-remote https://github.com/hanxuwu/gathria.git HEAD` check returned HTTP 403 (`Write access to repository not granted`). The available Git authentication could not read that repository. No runtime source or existing character assets were available to inspect, and no runtime APIs, frame dimensions, filenames, or import conventions have been assumed to be verified.

## Isolated proposed adapter

`src/compat/gathria.ts` is the sole proposed integration boundary. Its exported `GATHRIA_COMPATIBILITY.status` is `UNVERIFIED`. `toProposedGathriaCharacter` maps the standalone manifest to a neutral descriptor; that descriptor is **not an established Gathria loader API**.

| Standalone pack field                | Proposed descriptor field | Meaning                                                      |
| ------------------------------------ | ------------------------- | ------------------------------------------------------------ |
| `spritesheet.file`                   | `texture`                 | Spritesheet path, overridable by the caller after extraction |
| `spritesheet.frameWidth/frameHeight` | `frameSize`               | Source frame dimensions in pixels                            |
| `frames[]`                           | `atlas[]`                 | Explicit source pixel rectangles and frame IDs               |
| `animations.idle/walk.frames`        | `clips.*.frameIds`        | Ordered animation frame IDs                                  |
| `animations.*.fps`                   | `clips.*.framesPerSecond` | Timing from the exported metadata                            |
| `animations.*.loop`                  | `clips.*.repeat`          | Loop or hold the final frame                                 |
| `anchor.x/y`                         | `origin.x/y`              | Anchor normalized by frame width and height                  |
| `facing.native`, `facing.left`       | `facing`                  | Right-facing source and horizontal flip for left             |
| `scale.pixelArt`                     | `pixelArt`                | Disable texture smoothing and use integer display scale      |

To complete a real integration, obtain read access and inspect the actual game's asset loader, renderer, texture filtering, animation contract, anchor coordinates, and naming conventions. Replace only the adapter mapping as needed, then load a real exported ZIP into that game and verify idle/walk, both directions, timing, foot position, and texture transparency. Record the tested runtime revision and evidence before changing this status.

## Independent consumer boundary

`src/consumer/main.tsx` is a separate entrypoint at `/player.html`. It imports the shared pack decoder/validator and manifest types, but imports no generator, editor state, or editor component. The canvas only samples the loaded PNG with the manifest's frame rectangles; it never regenerates the character.

The player accepts an exported ZIP or a PNG plus parsed manifest JSON. `character.json` is optional in the separate-file flow. The bundled example button downloads a real ZIP and follows the same decoder path as an uploaded ZIP. Animation honors declared frame order, frame rate, looping, and horizontal mirroring. Mirroring occurs around the metadata anchor, including asymmetric anchors. Image smoothing is disabled, and pixel scale is an integer.
