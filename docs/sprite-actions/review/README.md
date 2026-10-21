# Sprite action workflow evidence

These are actual browser displays and UI downloads from the sprite action editor. The male/female demonstration selects original Run positions **2–6**, at **12 FPS**, playing **once**. These deliberately edited settings test the workflow; they are not replacements for the approved original motion or a claim of visual improvement.

- `workbench-desktop.png` and `workbench-narrow.png`: the real Workbench entry at 1440 and 390 CSS pixels wide.
- `workbench-editor-desktop.png` and `workbench-editor-narrow.png`: the actual Workbench viewport after scrolling to the settings. These show unchanged source Run settings, including all 16 frames at 24 FPS.
- `male-action-editor.png` and `female-action-editor.png`: full editor panels and first/last frame comparisons for the edited demonstration.
- `male-preview.png` and `female-preview.png`: the actual player and editor together.
- `*-independent-{left,right}.png`: edited packs playing in a separate player after closing the editor.
- `*-project-document.json`, `*-edited.manifest.json`, and `*-edited.character.json`: exact settings and exported metadata from the two real character workflows.
- `imported-v2-stills.sprite-project.zip` and `imported-v2-stills.character.zip`: small portable examples exported by the UI using the existing female skeletal stills pack. Its Run is a **single static frame** set to 2 FPS, once; missing Jump remains unavailable. This fixture demonstrates importing/exporting another compatible pack, not new character animation.

`evidence-index.json` records runtime/source hashes, each actual download and ZIP CRC check, decoded PNG dimensions, original/exported atlas byte hashes, saved-project embedded source hashes, original reset checks, screenshots, and independent playback results. This capture passed **8 UI download validations**, **6 independent character/direction cases**, and **12 PNG screenshot decodes**. Both Workbench widths had no horizontal document overflow. No external requests, authoring-module requests in the independent player, or page errors were observed.

The six approximately 30 MB male/female project, edited-pack, and reset downloads were validated in temporary storage and are deliberately not duplicated here. Their checksums and metadata are retained. The two small V2 exports are retained. Original character sources remain at `docs/kling-jump/exports/`.

To reproduce the complete capture without overwriting prior evidence:

```sh
EVIDENCE_PHASE=review-new CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-sprite-actions.mjs
```

The script starts Vite on an ephemeral local port, uses the real UI, verifies downloaded PNG data without changing it, closes each authoring page before independent playback, and checks that the runtime/source files stayed unchanged during capture. A targeted recapture corrected the two Workbench screenshots to use viewport captures rather than oversized cross-iframe element captures; runtime fingerprints stayed identical.
