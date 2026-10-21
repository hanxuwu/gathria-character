# Male full-outfit protection profile

This is a new, separately versioned authoring/validation profile for the existing 88 Kling male source poses. It does not change the source image pixels, animation frames or durations, native dimensions (704×1056), anchor (352,998), any of the 17 registered landmarks, or any head-protection polygon.

The original male registration, original authoring template and original five garment archives remain unchanged. New full outfits and the derived copies in `docs/kling-wardrobe/garments/male-full-outfits-v1/` bind to registration SHA256 `49230e86e853aad1e053db9ca8506828218f5e27ec1a54cc0e90e8a29cf89e48`.

The old source-colour segmentation treated touching thighs as part of hanging hands in frames 36/37/39/48, shoulder caps as part of returning fists in 83–88, and cut through fingers in 64/105–110. `authored-corrections.json` records 19 reviewed hand boundaries across 17 poses. These source-native contours retain the actual fists while returning thigh/arm pixels to clothing ownership. Wrist boundaries without a visible crease deliberately retain a small source-skin margin.

- `registration.json`: exact new profile delivered to the browser.
- `hand-protection-before-after.png`: original source with old/reviewed hand-protection overlays; red is a diagnostic overlay, not new artwork.
- `protection-differences.zip`: native binary added/removed masks for each authored correction.
- `protection-review.json`: mask hashes, source/profile hashes, reasons, unchanged legacy-file hashes, and per-item derived-copy repairs.

The five derived compatibility copies preserve their original rendering except at newly protected visible hand-edge pixels. Two tops each release 483 such pixels across six poses; two shorts each release 86 pixels across two poses; shoes require no pixel repair. Only those ownership/patch pixels are zeroed, restoring the original source underneath. All other decoded ownership and RGBA pixels are asserted identical; original archives are never rewritten.

Reproduce from repository root:

```sh
python3 scripts/prepare-kling-male-full-profile.py
python3 scripts/kling_male_limb_ownership.py
```

The first command decodes all 616 template masks, verifies ZIP CRCs, source/landmark/head invariants, and original-file hashes. The second builds the separate visible-limb authoring masks and diagnostics. These technical checks are separate from outfit visual acceptance. The source itself still contains motion blur and ambiguous wrist contours in some transition frames.
