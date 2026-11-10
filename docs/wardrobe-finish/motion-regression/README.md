# Motion export compatibility after garment coverage repairs

The previous single-jump, landing-run and takeoff checks compared new dressed
exports to old dressed atlas bytes and GIF hashes. Those whole-image comparisons
became invalid when the approved coverage pass changed clothing. Source frames,
head/face artwork and the gameplay routes still need their original protection.

The updated checks keep the old committed packs and GIFs as historical evidence.
They do not replace historical hashes with newly captured hashes:

1. Actual UI downloads include an editable wardrobe-project witness for each
   native view. Its source, registration, appearance selection and garment hashes
   must agree with the exported CharacterPack.
2. An independent Python compositor reconstructs both the historical baked
   frames and current baked frames from source, clothing and appearance layers.
   Historical fixtures and garment inputs are read from the fixed merged commit
   `5d63ae233ca83e61dc354e122a8708044f4e2653`. The current downloaded garments must
   be exact catalog archives, already covered by the separate artwork-recipe
   regression checks.
3. Every output pixel outside the exact clothing revision remains equal to the
   historical image. Appearance bank, hair/face selection, source binding,
   registration, frame identities, atlas geometry and anchors stay unchanged.
   Current garment ownership is checked against its source-bound hand and
   neckline permissions, not against an unconditional V1-only assumption.
4. The current run–jump–run review includes the native closing tail through the
   last Run pose, so replay begins at its real first pose. Its frame count and
   order are derived independently from the declared entry phase. Historical
   review GIFs retain their original shorter ending.
5. Old basic-jump GIFs are decoded against the old pack; current basic-jump and
   run–jump–run GIFs are decoded against the current pack. Quantized pixels,
   frame order, facing, native 24 FPS timing and one-shot flags are checked
   independently. A clothing revision may change the palette and encoded hash.
6. Existing UI input, jump/landing-route and independent historical-player
   checks are retained. Historical player imports keep their original artwork
   and motion profiles; current re-export must remain byte-identical.

The shared coverage helper verifies exact published archives; the motion
verifier reconstructs pixels without importing the app compositor or motion
controller. Neither test path publishes new artwork or rewrites old evidence.

Run the relevant browser checks with an installed Chromium:

```sh
CHROMIUM_PATH=/usr/bin/chromium npx playwright test \
  tests/e2e/single-jump.spec.ts tests/e2e/landing-run.spec.ts \
  tests/e2e/takeoff-refine.spec.ts --workers=1
```

Temporary downloaded ZIPs, native frames and pixel-verification reports are kept
outside the repository. `scripts/verify-motion-coverage-artwork.py` can also
re-check any captured export row with its editable-project witness.

A negative check changes one opaque head/hair pixel in a downloaded pack and
requires rejection by raw-layer reconstruction. A separate 24→12 FPS mutation
must fail the declared-action check. See [destructive guard evidence](destructive-guards.json).

[Targeted validation results](validation.json) distinguish the two complete male
flow browser passes from the first male single-jump capture and its corrected
standalone audit. Final frozen-tree female/full-suite results belong to the
integration validation; they are not implied by this targeted report.
