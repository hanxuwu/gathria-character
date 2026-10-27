# 6:1 / 64 colors versus 8:1 / 64 colors

These are actual application exports of the same four existing Kling looks.
No artwork, runtime code or default settings changed in this batch. Detail
sampling and the current optional cluster finish are held constant; only the
sampling factor and palette limit differ.

Every comparison has three columns:

| Column | Settings | Native frame | Integer display enlargement |
| --- | --- | --- | --- |
| Left | Current Strong pixels: 6:1 / 96 colors | 128×198 | 3× |
| Middle | 6:1 / 64 colors | 128×198 | 3× |
| Right | 8:1 / 64 colors | 96×149 | 4× |

All three characters have the same displayed scale and anchor: (192,564) in a
384×596 panel. The first two receive two extra empty display rows at the bottom
to accommodate the 8:1 canvas padding. No head or body is fitted independently,
and no frame is dropped, retimed, warped or smoothed. Native-size PNGs separately
show the actual smaller dimensions of the 8:1 option.

| Look | Right run comparison | Left run comparison | Still preview |
| --- | --- | --- | --- |
| Male everyday | [GIF](review/male-everyday-run-three-settings-right.gif) | [GIF](review/male-everyday-run-three-settings-left.gif) | [PNG](review/male-everyday-idle-three-settings.png) |
| Male wedding | [GIF](review/male-wedding-run-three-settings-right.gif) | [GIF](review/male-wedding-run-three-settings-left.gif) | [PNG](review/male-wedding-idle-three-settings.png) |
| Female everyday | [GIF](review/female-everyday-run-three-settings-right.gif) | [GIF](review/female-everyday-run-three-settings-left.gif) | [PNG](review/female-everyday-idle-three-settings.png) |
| Female wedding | [GIF](review/female-wedding-run-three-settings-right.gif) | [GIF](review/female-wedding-run-three-settings-left.gif) | [PNG](review/female-wedding-idle-three-settings.png) |

[Full gallery](review/index.html) also includes head crops, native PNGs and
complete run-frame contact sheets for both 64-color variants. Candidate-only
GIFs, native PNGs, build reports and complete five-action CharacterPacks are in
[6:1 / 64 exports](evidence/six-64/) and [8:1 / 64 exports](evidence/eight-64/).

Try either option in **Try pixel finish → Strong pixels**, then choose
**Color limit: 64** and **Detail size: 1/6 or 1/8**, followed by **Build pixel
candidate**. A manually adjusted preset is labeled **Custom pixels**. The
default finish is unchanged.

The same-size head and idle comparisons suggest **6:1 / 64** as the more
conservative choice: the silhouette remains on the current 6:1 grid, with simpler
shading bands. **8:1 / 64** is visibly coarser, but small curls, the mouth, eye
whites and ear lines become less distinct. These are visual tradeoffs; reducing
resolution does not automatically produce artist-designed pixel clusters or
improve animation stability. Existing source blur and garment seams remain.

## Verification

[verification.json](verification.json) records this batch's actual export and
decode checks. Each parameter set uses the unchanged production capture and
independent verifier from the preceding batch. The same source hashes, source
poses, action clocks, binary alpha mapping and left/right semantics are checked.
The comparison GIFs preserve all exported character RGB values exactly; their
text labels may be palette-mapped. These checks do not imply visual approval.

Both captures passed their independent audits: **8 complete CharacterPacks,
736 native frames, 64 PNGs, 24 raw GIFs, eight exact left/right mirror pairs and
80 independent player action/facing cases**. Editors were closed before player
checks. All source packages match the previous batch’s artwork bytes; both
64-color variants retain the original source frame IDs, timing and derivation.
The gallery contains 28 decoded images, including eight three-column run GIFs
whose character pixels match the exported packs exactly.

No runtime source changes were made, so the unit/build results from earlier
batches are not reported as newly executed here. Existing production JS and
HTML hashes were verified before capture. Current raw evidence binds those
exact files; only presentation assets and this new review script are added.

## Reproduce

```sh
node scripts/capture-kling-strong-pixels.mjs --run six-64 --output docs/kling-pixel-density/evidence --factor 6 --colors 64 --port 5246
node scripts/capture-kling-strong-pixels.mjs --run eight-64 --output docs/kling-pixel-density/evidence --factor 8 --colors 64 --port 5248
python scripts/verify-kling-strong-pixels.py --index docs/kling-pixel-density/evidence/six-64/evidence-index.json
python scripts/verify-kling-strong-pixels.py --index docs/kling-pixel-density/evidence/eight-64/evidence-index.json
python scripts/render-kling-pixel-density-review.py
```

Use fresh output names rather than overwriting existing evidence. The source
packages retained under `/tmp/kling-pixel-refinement/final-v1/` must match their
recorded hashes. They are not reconstructed from JSON or regenerated artwork.
The gallery imports the previous exact-palette rendering helper, with its hash
bound in the gallery index. Python tooling requires Pillow and NumPy.
