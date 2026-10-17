# Four basic skeletal actions

The same project-owned skeleton and motion library now drives **idle, walk, run, and a one-shot jump** on Denim daytrip and Coral afternoon. These are actual Skin Studio downloads and actual skeleton-guide canvas captures. No new illustration was generated.

- [Four-action character tour, 2×](four-actions-tour-2x.gif) · [Skeleton-only action tour, 2×](skeleton-four-actions-2x.gif).
- [Four actions at native size](four-actions-1x.png) · [2×](four-actions-2x.png).
- [Actual skeleton-only UI](skeleton-studio.png) · [Native skeleton poses](skeleton-four-actions-1x.png) · [2×](skeleton-four-actions-2x.png).
- [Jump right, native](jump-right-1x.gif) · [Jump left, native](jump-left-1x.gif) · [Right 2×](jump-right-2x.gif) · [Left 2×](jump-left-2x.gif).
- [12 jump key phases, native](jump-keyframes-1x.png) · [2×](jump-keyframes-2x.png).
- [Desktop](studio-desktop.png) · [Mobile](studio-mobile.png).

| Skin | Editable project | Independent CharacterPack | Player: jump complete |
| --- | --- | --- | --- |
| Denim daytrip | [Project ZIP](denim-daytrip.rig.zip) | [CharacterPack ZIP](denim-daytrip.character.zip) | [Right](denim-daytrip/independent-jump-right.png) · [Left](denim-daytrip/independent-jump-left.png) |
| Coral afternoon | [Project ZIP](coral-afternoon.rig.zip) | [CharacterPack ZIP](coral-afternoon.character.zip) | [Right](coral-afternoon/independent-jump-right.png) · [Left](coral-afternoon/independent-jump-left.png) |

Jump is 12 poses at 15 FPS (800 ms). It plays once, holds the final ready pose, and restarts only on replay or another explicit action selection. The individual jump GIFs have **no loop extension**, preserving that contract; reopen them to replay. The two action-tour GIFs deliberately repeat for review, with a labelled 800 ms end hold. Their playback timing is rounded cumulatively to GIF centiseconds. Characters are animated in place; the ground guide remains fixed. The preview does not simulate movement through a scene.

The previous 24 idle/walk/run source frames and their manifest frame/animation entries were compared with `docs/reusable-rig` and remain exact. The new atlas appends 12 jump frames. Both complete project ZIPs were reopened through the UI, with jump selected, and exported again. The `*-reopened.character.zip` files preserve that roundtrip evidence; their decoded pixels and manifests match.

After closing the authoring page, the independent player loaded the two new packs and exercised all four actions in both directions (16 cases). Every sampled native frame was matched against the actual exported PNG including the player's ground/anchor guide. Idle/walk/run were checked through a wrap. Jump was checked for every phase, sequence, final hold, and replay from the first pose. The identical first/final ready images were disambiguated by their legal sequence position, not by an independently committed text label. Generator and authoring modules were blocked and none were requested.

Every delivered PNG/GIF/ZIP is nonempty and decodable. ZIP members have CRC and SHA256 checks, character frames retain binary alpha and clear borders, and decoded GIF frames/order/durations match their intended palette-converted presentation. Skeleton guide PNGs may contain antialiasing; those guides do not enter exported character art.

- [Browser capture, source hashes and live playback](evidence-index.json)
- [Artifact and timing verification](artifact-validation.json)
- [Complete file integrity inventory](file-integrity.json)

This is a compact reusable skeleton and four basic motions, not a full Spine replacement. Jump is a small in-place hop constrained by the existing 192×256 frame and source art. Existing texture compression at deep bends is retained. These artifacts are for review and do not claim user visual acceptance.
