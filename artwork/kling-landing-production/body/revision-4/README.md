# Experimental landing recovery art V4

The selected generated bodies are107 R6 and108 R3. They lower the first recovery crouch and advance into the following running pose. They are supplemental authored drawings, not original video extractions or a recovered skeleton. Original source frames0–106, basic action clips, default characters and native24FPS remain unchanged.

Each original generated PNG is retained at1024×1536. The generated body alone is uniformly reduced to512×768 through Canvas. The assembler then copies the same37,158 visible original source89 head pixels, without resampling, at107(+4,+11) and108(-16,-2). `head-copy-audit.json` records exact body/output hashes and protected head polygons. `art-files.json` records the final raw artwork, input reference, prompt and guide hashes. Prompt preservation requests do not imply pixel identity; exact original-head preservation comes from the separate assembly step.

`107.registration.json` and `108.registration.json` are manual authoring guides. Visible attachment estimates have approximately±4px uncertainty, hidden attachments approximately±8px. Their accompanying notes retain fuller observation detail. Head polygons come from the exact assembly audit; hands were traced and reviewed on overlays. These are not inferred skeletal joints from Kling.

The old input remains byte-exact at `../inputs.v3.json`. Its old body/daily/wedding files remain intact, so V3 can still be rebuilt against a saved V3 output directory. The current `../inputs.json` binds edition4 to its previous edition3 source/registration checksums. Source provenance is frozen separately from later checks to keep source identity stable.

The daily and wedding folders contain cloth-only refits using the existing painted donors. Each garment is fitted along the new torso and hip–knee–ankle chains rather than translating an old entire outfit. Source head, hands, footwear and unowned pixels remain exact. Original garment images/crops0–106, including the existing wedding sleeve repairs, remain unchanged.

Reproduction from the repository root (Python requires Pillow, NumPy, SciPy and OpenCV):

```sh
node_modules/.bin/esbuild scripts/assemble-landing-production-base.ts --bundle --platform=node --format=esm --outfile=/tmp/landing-assemble.mjs
node /tmp/landing-assemble.mjs --body-a artwork/kling-landing-production/body/revision-4/107.body.native.png --body-b artwork/kling-landing-production/body/revision-4/108.body.native.png --input artwork/kling-landing-production/body/inputs.json --out /tmp/landing-assembly
python scripts/build-landing-production-assets.py --input artwork/kling-landing-production/body/inputs.json --source-only --out /tmp/landing-source
python scripts/build-landing-production-daily.py --source /tmp/landing-source/male.source.zip --registration /tmp/landing-source/male.registration.json --out /tmp/landing-daily
python scripts/prepare-landing-side-wedding.py --extension-daily /tmp/landing-daily --registration /tmp/landing-source/male.registration.json --output /tmp/landing-wedding
python scripts/build-landing-production-assets.py --input artwork/kling-landing-production/body/inputs.json --check
```

The final command reproduces the bound full source, registration, four garments and appearance bank using the tracked cloth patches. The preceding commands independently reproduce the exact-head assembly and fitted cloth.

Visual scope: source85→107→108→Run48 now has head rises13/13/12 native pixels. Far-toe outline world movement remains18.5px over the transition at700px/s; this is not a claim of exact foot locking. The generated107 thigh is fuller in the deep crouch. Existing donor fold/cuff roughness and the compressed wedding waistcoat remain visible. Static body and five-look review permit experimental selection; full playback, save/reopen and export checks are reported separately under `docs/kling-landing-recovery`.
