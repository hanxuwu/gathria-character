# Gathria Character

A standalone, browser-local pixel-art character studio. Customize a character, preview idle and walking animations, save editable configuration, and export a portable **CharacterPack v1** ZIP. A separate player consumes the exported PNG and metadata without invoking the generator.

![Character studio with Mira](docs/images/studio.png)

## Run

Use Node.js 22.12+ (Node 24 recommended; `.nvmrc` selects 24).

```sh
npm ci
npm run dev
```

Open the address Vite prints. The studio is at `/`; the independent player is at `/player.html`. No API keys, account, backend, external artwork, or runtime network services are needed. All editing, generation, and file processing happens in the browser. Changes are not autosaved: **Save config** preserves your editable character.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

For the browser suite, install Playwright's browser once:

```sh
npx playwright install chromium
npm run test:e2e
```

In a cloud image with system Chromium already installed, use `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` instead. Playwright starts its own Vite server on port 5175; it does not reuse a running development server. The GitHub Actions workflow installs the browser and Linux libraries before testing.

## Try the complete workflow

1. Start with **Mira**, **Rowan**, or **Jun**. Change the skin, hairstyle, hair color, clothing cuts/colors, and shoes. The actual pixels update immediately.
2. Select **Idle** or **Walk**, face left/right, play/pause, adjust speed, and select an integer zoom. The ground line and frame strip show alignment and poses.
3. Name the character and choose **Save config**. Make other changes, then **Open saved configuration** to reopen the downloaded `.character.json`.
4. Choose **Export character** to download a ZIP containing `spritesheet.png`, `manifest.json`, `character.json`, `PROVENANCE.txt`, and `INTEGRATION.md`. **Download PNG only** is also available.
5. Open the independent player, choose the downloaded ZIP, and play both animations/directions. Alternatively, extract it and choose the actual PNG and manifest files. Configuration is optional for playback.

The player’s **Try Mira’s example pack** button loads a real bundled ZIP through the same file validator. Example outputs for all three presets are committed under [`public/samples/`](public/samples), both as ZIPs and extracted files. Regenerate them using the real browser exporter with the dev server running:

```sh
npm run samples
# Or: CHROMIUM_PATH=/usr/bin/chromium npm run samples
```

## Architecture and scope

| Location                | Responsibility                                                           |
| ----------------------- | ------------------------------------------------------------------------ |
| `src/core/config.ts`    | Versioned, validated configuration, palettes, presets                    |
| `src/core/generator.ts` | Original deterministic RGBA pixel rasterizer and animation poses         |
| `src/core/types.ts`     | Small `CharacterGenerator` interface and shared contracts                |
| `src/core/pack.ts`      | Manifest/ZIP validation, PNG encoding/decoding, downloads                |
| `src/editor/`           | Customization UI, animated canvas, frame strip                           |
| `src/consumer/`         | Separate file-driven playback entrypoint, no generator/editor dependency |
| `src/compat/gathria.ts` | Isolated, explicitly unverified proposed integration boundary            |

The generator uses one body silhouette, four hairstyles, three upper garments, and three lower garments. Native artwork faces right; the consumer mirrors it around the metadata anchor to face left. Prototype defaults are **48×64** frames, **four idle frames at 4 fps**, **eight walking frames at 10 fps**, a **384×128** sheet, and anchor **(24, 60)**. They are standalone choices, not verified Gathria requirements. Changing names affects metadata; changing appearance affects exported pixels.

A future provider can implement `CharacterGenerator.generate(config)` and return normalized pixels plus the same validated manifest. No photo or AI generation is implemented, and no speculative backend is included. Untrusted inputs have explicit schema, size, dimension, and decompression limits; errors preserve the last valid loaded character.

## Format, provenance, and compatibility

- [CharacterPack v1 contract](docs/CHARACTER_PACK_V1.md): exact fields, frame IDs, timing, mirroring, anchors, validation, consumer example.
- [Artwork provenance](docs/ASSET_PROVENANCE.md): original programmatically drawn layers/poses and MIT reuse terms. MIT notice is included in each pack; no visible in-game credit is required.
- [Gathria compatibility](docs/GATHRIA_COMPATIBILITY.md): **UNVERIFIED**. Read access to the candidate Gathria repository returned HTTP 403. No Gathria source was modified, and the proposed adapter is not an established runtime API.
- [Implementation status and handoff](docs/IMPLEMENTATION_STATUS.md): completed milestones, verification, delivery, and next action.

Verification covers deterministic pixels, all customization fields, frame margins/anchors, config round trips, malformed imports, manifest mapping, bounded ZIP loading, and actual download/reopen/playback in Chromium. The browser suite also checks mobile layout, PNG transparency, high zoom, and corrupt-image rejection. Firefox, Safari, and actual Gathria integration are not verified.

Source and original generated artwork are released under the [MIT License](LICENSE). React, Vite, fflate, Lucide, and the other packages retain their own licenses. This MVP does not include authentication, cloud storage, AI generation, or a general animation editor.
