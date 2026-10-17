# Maple: generated source to a shared skeleton

This is an original daily-wear character made for the end-to-end preparation
trial. It is not a recolored catalog character. The whole head, sweater, arms,
trousers and boots come from newly generated artwork. The existing 11-bone rig,
four actions and all runtime code remain unchanged from main `51c708a`.

## Sources

Three OpenAI image-generation calls on 2026-10-17 UTC produced the following
transparent PNGs. Exact prompts are in [source/prompts.json](source/prompts.json).
The existing actual-export image `docs/wardrobe-items/item-lineup-2x.png` was
the first call's style/proportion reference; the following calls referenced the
preceding generated source. No external artist's pixels are bundled.

| File | Role and outcome |
| --- | --- |
| `source/maple-sheet.png` | Original complete design, three heads and isolated body groups. Used for all final parts except torso. Its supposedly isolated torso still has sleeves; its pelvis includes rigid short trouser ends. |
| `source/torso-backplate-draft.png` | First torso correction. Still contains a folded sleeve; rejected as a production attachment. Retained so the failed attempt is visible. |
| `source/torso-backplate.png` | Second correction, requested as a sleeveless underlying body. Supplies continuous sweater fabric behind the separate animated arms. |

These are AI-assisted development assets, not a claim of wholly hand-drawn
illustration. Original project contributions follow the repository MIT notice
to the extent rights are held. Imported third-party artwork retains its own
terms. No image-generation service is used in the browser or exported player.

## Technical preparation

Run `PREPARE_PHASE=final node scripts/prepare-generated-traveler.mjs` from the
repository root. `final` is also the default. Node dependencies and Chromium are required. The script starts
and closes its own Vite/Chromium instance on port 5191. Set `CHROMIUM_PATH` when
Chromium is not `/usr/bin/chromium`. `PREPARE_PHASE=phase-1` deliberately
reproduces the faulty initial registration; it overwrites the working prepared
directory, so restore `final` before using or delivering the files.

The script measures named source regions, thresholds alpha at 192, retains the
largest connected object **within each isolated part region**, samples nearest
pixels into full 192×256 canvases and writes 15 slots. This is an explicit,
source-specific adapter, not automatic image segmentation. No new pixels from
legacy character banks are mixed into the new skin. `sourceAppearance` is only
the existing V6-compatible legacy metadata needed by CharacterPack; it cannot
recreate Maple.

- Head and short neck end at y119; jaw scale/length are both 1.
- Arms overlap across elbow rows 146–154; legs overlap across knee rows 194–202.
  Both pieces carry the same underlying texture in those intervals.
- Legs exclude the model sheet's open tube rims above the hip. The fixed pelvis
  retains a tapered central bridge; rigid shorts cuffs are excluded.
- Shoes have separate ownership, ankle landmarks at y227 and soles at y239.
  Clean shin/boot overlap opts into `preserveAnkleOverlap`.
- Source-specific hand and cuff polygons separate skin from fixed cream trim.
  Other cloth/shoe material IDs are assigned offline. Runtime reads the saved
  masks; it does not guess materials from colors.
- Each complete head is registered as its own expression image. Head PNGs,
  rig, motion timing and curves are identical between the before/final trials.

`prepared/registration.json` records source hashes, crop bounds, target bounds,
material polygons and source landmarks. `prepared/slots/` contains the final
registered PNGs. `prepared/diagnostics/` are direct renderer diagnostics, **not**
the actual UI-export review evidence.

## Reusable results

- `prepared/traveler.skin.zip`: full new identity and appearance, 15 attachments.
- `prepared/traveler.rig.zip`: that skin plus unchanged rig/actions/preview state.
- `prepared/traveler-{top,bottom,shoes}.wardrobe.zip`: three independent clothing
  items, usable with the existing Crop/Waves identities and color controls.

Import the full project in Skin Studio to inspect Maple. Import the three item
ZIPs into an open wardrobe to test them on the built-in identities. The current
wardrobe **does not register a new identity**; opening it on Maple switches to a
built-in identity. Keep the full project to preserve the new head and raw colors.

The actual application exports, before/after PNGs, timed GIFs and independent
player evidence are in [docs/generated-traveler](../../docs/generated-traveler/README.md).
See the [review](../../docs/GENERATED_CHARACTER_REVIEW.md) for what was fixed,
what still shows through, and current-session verification.
