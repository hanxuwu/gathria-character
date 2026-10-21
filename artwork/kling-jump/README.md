# Original Kling jump source variant

This is a new prepared variant of the user's two original Kling videos. It
adds the genuine jump at zero-based source frames **171–209 inclusive**, at the
original **24 fps**. A jump is **39 frames / 1.625 seconds**, played once and then
held at the recovered final stance. It is separate from the existing celebration.

Sources and hashes remain in [source/selection.json](source/selection.json).
The male video is reused from `artwork/kling-playback/source/male.mp4`;
the female video is reused from `artwork/kling-playback/source/female.mp4`.
No AI drawing, skeleton fitting, frame interpolation or new artwork is involved.

The existing crop would cut the airborne scalp. The new canvas adds **32 pixels
above every frame**, becoming 704×1056, with the anchor moving from (352,966) to
(352,998). Crops are fixed: male (586,-20), female (586,-4), with out-of-video
regions transparent. This translates only the canvas; artwork relative to its
anchor retains its source position and scale. Original RGB/alpha processing is
unchanged, and all old 166 frames are checked byte-for-byte after stripping the
32px padding.

The original videos themselves cut a small scalp arc at the top edge in frames
183–186. Every available source pixel is retained; missing source artwork is
not reconstructed. Source motion blur and changes between the last jump stance
and idle remain. These are source limitations, not newly generated corrections.

Reproduce with:

```sh
python3 scripts/prepare-kling-playback.py --recipe artwork/kling-jump/source/selection.json
```

`prepared/kling-source.zip` contains 244 RGBA source frames plus source metadata.
`prepared/extraction-report.json` records hashes, bounds, original opaque RGB
preservation and the 166-frame historical pixel comparison. The original
four-action archive remains untouched. The player produces native multipage
CharacterPack exports and actual playback evidence under `docs/kling-jump`.
