# V5 recovery and delivery — 16 October 2026

The original implementation commit `ef1a378065f1ce4edd00da9d92b51e3baaddc79b` was recovered intact from the user-supplied Git bundle and pushed to `fix/character-art-cohesion`. Its parent is `5846d59004183d6c250baebfb83fe4e86169052a`. No source art, renderer, configuration, exported PNG or CharacterPack was regenerated or changed during recovery.

The received bundle's SHA256 matches the supplied value:

```text
1731e923cbe15c315acf6870f118f3734b179accdf994f46154cb8629882b1e0
```

`git bundle verify` passed with the existing baseline. Import restored the exact requested commit; the original commit was successfully pushed before the review-artifact repair below.

## Checks performed in this recovery session

- Source-expression image, garment backplate and prepared-bank SHA256 values match `docs/art-cohesive/evidence-index.json`.
- All six entries in `artwork/cohesive-source/legacy-hashes.json` match both their recorded hashes and the V4 baseline; the V1/V2 renderer files also match that baseline.
- All 20 committed CharacterPack ZIPs pass CRC checking. Their five members match the corresponding extracted files byte-for-byte, and configurations match the evidence index. Before-comparison packs explicitly use V4; new output packs explicitly use V5.
- Exported PNGs decode, retain binary alpha, use a 1536×512 sheet with 192×256 frames, and declare anchor (96,240).
- Reviewed the actual before/after and head/neck panels and decoded animation frames. All review PNG/GIF files decode after the isolated repair below.

## Isolated review-artifact repair

The imported commit contained a **zero-byte `docs/art-cohesive/walk-left.gif`**. It was rebuilt solely by cropping and mirroring the existing exported PNG frames according to their manifests, using the same composition, integer zoom, labels and GIF encoding as `scripts/render-cohesive-review.py`. No model or generator was invoked.

The repaired preview contains eight frames, loops continuously, measures 816×584, and lasts 800 ms at the manifest's 10 fps. The other previews remain unchanged: right walk has eight frames/800 ms; idle has three encoded frames/3000 ms (adjacent identical frames are coalesced by GIF encoding).

This follow-up changes only the repaired GIF and this delivery record. The original implementation commit remains in branch history without amendment.

## Historical verification — not rerun in this recovery session

The previous implementation session recorded passing typecheck/build, **193 unit tests**, **9 Chromium E2E tests**, 20 generator-to-export pixel checks and eight independent-player cases. Those claims are preserved in [ART_COHESION_V5.md](ART_COHESION_V5.md) and the [evidence index](art-cohesive/evidence-index.json); they are not new test executions by this session. No implementation changes required repeating that suite.

## Review

- [Native comparison](art-cohesive/before-after-1x.png) / [2× comparison](art-cohesive/before-after-2x.png)
- [Idle](art-cohesive/idle-right.gif) / [walk right](art-cohesive/walk-right.gif) / [repaired walk left](art-cohesive/walk-left.gif)
- [Bride pack](art-cohesive/dress-joyful.character.zip) / [groom pack](art-cohesive/suit-joyful.character.zip)
- [Implementation, provenance and remaining limits](ART_COHESION_V5.md)

Keep the repair PR as a draft against the still-unmerged `feat/character-art-v2` branch. User visual acceptance and production Gathria integration remain outstanding; new authored expressions cover waves/crop only, with the other hairstyles and everyday garments retaining their documented limitations.
