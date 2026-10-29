# Male painted side-view outfit

Warm terracotta short-sleeve shirt and warm stone trousers, fitted to all 107
original native 512×768 frames. The original idle, walk, run and two-jump action
stay at 24 fps. Native facing is right; left is the exact horizontal mirror.

The final files are `../assets/male-shirt.garment.zip` and
`../assets/male-trousers.garment.zip`, with IDs
`side-male-oxford-shirt-v1` and `side-male-stone-trousers-v1`.

Both bind to source SHA-256
`7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42`
and reviewed registration SHA-256
`7fa05a051d6dc1aa7184aaf484f82bb512042d276189606eee9da366d65cb43e`.
The original source ZIP and original registration remain unchanged.

Final archive SHA-256:

- Shirt: `a60facb398868da3bdbe9bac6e45cdc36a29b755f76129633a4a5ec0cded25de`
- Trousers: `08e70577b1875cd55ca85c4da1218d448a63d19877c5ac41eae0efc4b30df692`

`delivery-audit.json` records the independently decoded 107-frame check.
Every decoded garment matches its painting audit. Protected head/hand pixels,
pixels outside garment ownership, and reviewed source foot guards remain exact.
`rebind-audit.json` records the final run-hand update: only frames 39–48 and
55–56 were recomputed; all other 95 native paintings and ownership masks
were reused byte-for-byte. Independent archive decoding also verifies that both
garment patches and ownership remain exact outside the reviewed hand-contact
regions in those twelve frames. The contact margin is four native pixels;
frame 55 uses six to include three reviewed cloth-edge pixels beside the thumb.

`run-hand-correction.png` compares source, prior outfit and corrected run40.
Original dark hand ink and mixed antialiasing remain at the source hand edge.
Two source-measured leg widths and 29 retained cloth pixels in frame56 keep
this hand repair from changing accepted cloth elsewhere. These are reproduced
by the authoring script and the source-bound `stable-outer-cloth-pixels.json`;
no temporary checkpoint files are needed by the regeneration command.

`difficult-poses.png` reviews standing, running and second-jump poses.
The four `*-contact.png` sheets cover every frame; `*-review.gif` shows native
right and mirrored left together. These are offline authoring reviews;
application/export verification is recorded separately by the workspace QA.

The small underarm openings in frames 95–96 already exist in source alpha.
`underarm-source-gap.json` records that no originally opaque source pixel was
made transparent in either pose.

The fresh image-generation prompt, full garment reference, manually traced
cloth-only cutouts and sampling provenance are under
`artwork/kling-side-expansion/male/`. Generated faces, skin, hands, shoes and body
geometry are excluded from garment sampling. Reproduce the complete bank with:

```sh
python scripts/prepare-kling-side-male-clothing.py \
  --registration artwork/kling-side-expansion/templates/male.registration.json
```
