# V7 wedding production sources

Created on 17 October 2026 (Australia/Sydney) with OpenAI's built-in image-generation tool, using the committed V5 full-character bank as the identity reference and the user's earlier wedding sprite reference as the art-direction brief. These are AI-assisted **production inputs**, not application exports.

- `bride-expressions.png`: three full-character states (neutral / tender smile / joyful closed eyes), long waves, ivory tiered dress with visible cream shoes.
- `groom-expressions.png`: three full-character states, tousled crop, navy suit, cream waistcoat, coral tie and a single lapel flower. A focused second edit clarified exposed neck skin, chin shadow and the shirt collar. The first draft's neck remained too short; that intermediate draft is not used by the application.
- `dress-backplate.png`: a targeted edit of the bride sheet removes arms/hands and restores gown fabric beneath. Only its skirt/shoe pixels are used, keeping independently animated hands out of the garment layer.
- `prompts.json`: exact production/edit requests, including the rejected first groom draft request.
- `registration.json`: reproducible source-to-frame landmarks and expression offsets.
- `legacy-hashes.json`: frozen V6 renderer, bank and preparation bytes. Older protection remains in the V5/V6 tests.

`python3 scripts/prepare-harmonized-assets.py` registers each character by the chin, neck/collar, waist and sole, thresholds alpha, samples nearest-neighbor to 192×256 and derives a shared 64-color palette across its three states. It extracts complete head states and anatomical torso/limb masks; eyes, mouths, shirt/tie/flower and belt inserts are protected from inappropriate recoloring. The gown backplate excludes its static shoes, which become independent shoe layers. Palette reduction is consistent technical processing across materials, not runtime image generation or painted expression patches.

The V7 bank is separately namespaced. Source images, renderers, configs and sample packs for V1–V6 are preserved. Runtime remains local and deterministic. The artwork is distributed under the project's MIT terms to the extent rights are held by contributors; reference images are not redistributed.

Stage one stores complete sources and reproducible extraction. Integration/animation and actual exported evidence follow in separate commits; the source sheets alone do not establish V7 visual acceptance.
