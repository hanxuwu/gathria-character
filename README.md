# Gathria Character

Current studio default: **Polished Art V6**. V7 was not accepted in visual review and is retained for comparison and saved-file compatibility. New characters and the main player example use V6; opening any saved V1–V7 configuration preserves its original artwork.

A standalone, browser-local pixel-art character studio. Customize a character, preview idle and walking animations, save editable configuration, and export a portable **CharacterPack v1** ZIP. A separate player consumes the exported PNG and metadata without invoking the generator.

![Bride and groom: actual V6 exported walking animation](docs/art-polished/walk-right.gif)

[V6 review](docs/ART_POLISH_V6.md) · [V7 comparison and rejection record](docs/ART_HARMONY_V7.md) · [Default restoration](docs/V6_DEFAULT_RESTORATION.md)

## Run

Use Node.js 22.12+ (Node 24 recommended; `.nvmrc` selects 24).

```sh
npm ci
npm run dev
```

Open the address Vite prints. The studio is at `/`; the independent player is at `/player.html`. No API keys, account, backend, or runtime generation services are needed. Prepared artwork ships with the app. All editing, generation, and file processing happens in the browser. Changes are not autosaved: **Save config** preserves your editable character.

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

1. Start with **Mira**, **Rowan**, or **Jun**. Choose a face shape, expression, hair accessory, skin, hairstyle, hair color, clothing cuts/colors, and shoes. Start with **Polished casual**, **Wedding suit**, or **Wedding dress**, then combine garments freely. The actual pixels update immediately.
2. Select **Idle** or **Walk**, face left/right, play/pause, adjust speed, and select an integer zoom. The ground line and frame strip show alignment and poses.
3. Name the character and choose **Save config**. Make other changes, then **Open saved configuration** to reopen the downloaded `.character.json`.
4. Choose **Export character** to download a ZIP containing `spritesheet.png`, `manifest.json`, `character.json`, `PROVENANCE.txt`, and `INTEGRATION.md`. **Download PNG only** is also available.
5. Open the independent player, choose the downloaded ZIP, and play both animations/directions. Alternatively, extract it and choose the actual PNG and manifest files. Configuration is optional for playback.

The player offers the V6 wedding sample plus the retained V7 comparison and V4, V3, V2 and V1 examples. Current [bride and groom ZIPs](public/samples/polished/) are self-contained; [V6 expression/outfit exports](docs/art-polished/) and [V7 comparison exports](docs/art-harmonized/) also include extracted files. Older sample directories remain unchanged.

Opening any V1–V7 configuration keeps its original renderer and options. For V1–V5 files, **Create polished copy** explicitly opts into V6. V6/V7 files are never automatically converted. New configuration uses `schemaVersion: 2`, `artworkVersion: 6`, `faceVariant`, `expression` (`neutral`, `gentle`, `joyful`) and `hairAccessory`. The portable **CharacterPack manifest remains version 1**. Whole-face expressions cover waves/crop; the other two hairstyles retain their original open-eye face and show a studio notice.

Regenerate V6 export evidence with `node scripts/generate-polished-evidence.mjs`, then `python3 scripts/render-polished-review.py` and `python3 scripts/verify-polished-evidence.py`. The corresponding `harmonized` scripts reproduce the retained V7 comparison. The first command starts its own server. Requirements and verified commands are in the [V6 review](docs/ART_POLISH_V6.md). `npm run samples` still regenerates only original V1 samples.

## Architecture and scope

| Location                | Responsibility                                                           |
| ----------------------- | ------------------------------------------------------------------------ |
| `src/core/config.ts`    | Versioned, validated configuration, palettes, presets                    |
| `src/core/generator.ts` | Version dispatcher; frozen V1–V6 and harmonized V7 renderers             |
| `src/core/types.ts`     | Small `CharacterGenerator` interface and shared contracts                |
| `src/core/pack.ts`      | Manifest/ZIP validation, PNG encoding/decoding, downloads                |
| `src/editor/`           | Customization UI, animated canvas, frame strip                           |
| `src/consumer/`         | Separate file-driven playback entrypoint, no generator/editor dependency |
| `src/compat/gathria.ts` | Isolated, explicitly unverified proposed integration boundary            |

The detailed renderer uses one articulated body rig, three face shapes, four hairstyles, five upper garments, and four lower garments. Hair, skin, clothing, and shoe colors remain editable. Native artwork faces right; playback mirrors it around the metadata anchor to face left.

| Artwork         | Frame   | Sheet    | Ground anchor | Recommended zoom |
| --------------- | ------- | -------- | ------------- | ---------------- |
| Preserved V1/V2 | 48×64   | 384×128  | (24, 60)      | 4×               |
| Detailed V3–V7  | 192×256 | 1536×512 | (96, 240)     | 1×               |

The larger detailed frame retains eye highlights, curling strands, and layered cloth at native size. V6/V7 idle holds four drawings over twelve steps at 4 fps (3 seconds); walking has eight drawings at 10 fps (0.8 seconds). All older pixels and timings remain unchanged. These dimensions are standalone choices, not verified Gathria requirements. Names affect metadata; appearance options affect exported pixels.

A future provider can implement `CharacterGenerator.generate(config)` and return normalized pixels plus the same validated manifest. The detailed source illustrations were created with AI assistance during development, then prepared into bundled layers. Runtime generation is deterministic and local; photo input and AI generation as product features are not implemented. Untrusted inputs have explicit schema, size, dimension, and decompression limits; errors preserve the last valid loaded character.

## Format, provenance, and compatibility

- [CharacterPack v1 contract](docs/CHARACTER_PACK_V1.md): exact fields, frame IDs, timing, mirroring, anchors, validation, consumer example.
- [Artwork provenance](docs/ASSET_PROVENANCE.md): preserved procedural art, AI-assisted detailed source assets, preparation, and MIT reuse terms. MIT notice is included in each pack; no visible in-game credit is required.
- [Gathria compatibility](docs/GATHRIA_COMPATIBILITY.md): **UNVERIFIED**. Read access to the candidate Gathria repository returned HTTP 403. No Gathria source was modified, and the proposed adapter is not an established runtime API.
- [Implementation status and handoff](docs/IMPLEMENTATION_STATUS.md): completed milestones, verification, delivery, and next action.

Verification covers pixel-exact V1–V7 preservation and explicit V6-copy migration for older files, deterministic pixels, distinct face silhouettes, outfit connectivity, all customization fields, frame margins/anchors, config round trips, malformed imports, manifest mapping, bounded ZIP loading, and actual download/reopen/playback in Chromium. The browser suite also checks mobile layout, PNG transparency, high zoom, and corrupt-image rejection. Firefox, Safari, and actual Gathria integration are not verified.

Source and original generated artwork are released under the [MIT License](LICENSE). React, Vite, fflate, Lucide, and the other packages retain their own licenses. The app does not include authentication, cloud storage, photo/AI input, or a general animation editor.
