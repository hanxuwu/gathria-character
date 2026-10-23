# Volume hair and nine clothing donors

Authored 2026-10-23 for the two approved Kling characters. The source CharacterPacks, original face/ears/anatomy, head registrations and action timelines are not regenerated.

## Source artwork

Four OpenAI image-generation calls produced `hair-design.png`, `male-clothes-design.png`, `female-clothes-design.png` and `female-hair-design.png`. Exact prompts are adjacent `*-prompt.txt` files. These are supplementary new hair/clothing paintings, not layers recovered from the original videos. Generated faces, ears and bodies are discarded.

- `hair-design.png`: top row supplies Airy tousle, Soft curls and Swept quiff. Bottom row was rejected because close packing introduced neighboring locks and insufficient ponytail clearance.
- `female-hair-design.png`: replacement, widely separated Romantic waves, Ribbon pony and Braided crown. It preserves the approved Kling face by donating hair only.
- Male cloth: Oat henley, Harbor polo, Terracotta overshirt and Moss knit vest. Buttons, cable knit, open layering and piping distinguish the garments beyond color.
- Female cloth: Honey garden, Harbor sailor, Rose picnic, Ivory celebration and Sage pinafore. Collars, bows, bib/pockets and hems have separate painted designs.

`hair-donors.json` records front/rear ownership, eye-based source fitting, original-ear registration and explicit rear overlap. Hidden hair beneath donor ear openings is completed from neighboring rear hair. It is supplementary artwork, not an accurate extraction of an occluded original layer. Only the new ponytail rear mass is compressed horizontally 10% about its root to fit the existing padded export frame; the source head and body do not move or scale. Disconnected front-layer specks are excluded. The jaw curl in Braided crown belongs in front so its attachment does not disappear behind the original wider face.

`cloth-donors.json` records per-garment cloth polygons, shoulder chains, widths, axes, skirt waist/hem and donor hand exclusions. Extrapolation of adjacent cloth fills occluded donor areas. Hem-only donor skin refinement avoids carrying donor legs into scallops; it never edits the original character's skin. Female designs use the released sleeveless body ownership: generated puff sleeves are not advertised as runtime sleeves. `looks.json` lists nine actual outfit presets plus suggested hairstyle/color pairings for review. Applying an outfit in the editor keeps the current hairstyle independent.

## Reproduction

Use the Python/Pillow/NumPy/SciPy/OpenCV environment used by the existing authoring scripts:

```sh
python3 scripts/prepare-kling-volume-clothes.py
python3 scripts/prepare-kling-volume-hair.py
python3 scripts/build-kling-wardrobe-catalog.py
```

New garment banks reuse the released source-bound male V2 sleeves / female V4 skirt fitting. Six new appearance banks live under `docs/kling-appearance/banks/volume/`, one hairstyle per bank with exact copied Gentle face crops. They do not replace the released male/female banks. Packing is bounded to eight pages, 64 Mi pixels total and 24 Mi pixels per male page / 12 Mi pixels per female page; it does not resample the artwork to meet limits.

Prepared contact sheets are **offline authoring checks**, not application/export evidence. Application PNGs, GIFs, CharacterPacks, source-protection checks and standalone playback evidence belong under `docs/kling-collection/volume-v1/`.

## Limits

These remain source-bound 2D overlays. New locks follow existing registered head motion; there is no independent strand or ponytail physics. Female dress silhouette follows the existing skirt fitter, including its approximation at deep crouch. Fine lace and cable detail can soften under source motion blur or GIF quantization. Original facial expression/pose pixels and proportions are retained; the pixel-art references guide volume/detail, not a conversion of the approved Kling cartoon style.
