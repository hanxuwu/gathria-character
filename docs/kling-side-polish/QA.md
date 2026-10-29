# Current polish verification

This record belongs to the follow-up to `4fd27f9`, not the earlier expansion's
historical test counts. Original source ZIPs, frame order, native dimensions,
24 fps, ground anchor and loop/one-shot flags remain unchanged.

## Functional checks

- **160 unit tests / 11 files**: side motion, keyboard input, review notes/crops,
  bounded source cache, wardrobe persistence/composition/GIF, appearance parsing
  and rendering, CharacterPack V3 and the independent player.
- **19 Python authoring tests**: real-source guide/protection roundtrip and
  malformed package, binding, coverage, bounds and ownership cases.
- **13 distinct browser cases**: four legacy side-view, five tailored-edition,
  two review-tool and two previous-tailored-project compatibility cases.
- TypeScript, production build and scoped formatting checks pass.
- All four final garment preflights cover their full 107/102 native frame sets.
- The real TypeScript appearance renderer checks **627 color poses**:
  209 frames × chestnut, espresso and copper.

Logs are retained in [checks](checks/). The first combined browser run passed
12 cases and failed one GIF download after Vite reported a dynamically imported
module fetch failure while several development/SSR servers shared a cache.
The two review cases were rerun in a fresh server and both passed without any
product-code or assertion change. Count each case once, not each successful run.
The final performance harness uses its own Vite cache to avoid that interference.

The review tests prove PNG and GIF bytes are identical before/after slow-preview
inspection, integer detail mirrors exactly, notes persist with source/look
context, locating a note restores the paused pose without changing clothes, and
the 390-pixel layout does not overflow. Old tailored male/female projects are
opened from the previous actual exports: walk/run/jump in both directions match
their old baked packs, and resaving retains every embedded file and binding.

## Actual exports and independent playback

Final per-character reports are retained in [qa](qa/). Each uses the real
workbench's download controls, not a test-only renderer, and independently
decodes every exported frame and GIF. Their recorded input hashes identify the
accepted runtime and assets; final delivery checks rehash those files.

| Coverage                                                    | Male    | Female  |
| ----------------------------------------------------------- | ------- | ------- |
| Source and garment frame audit                              | 107     | 102     |
| Styled/mixed hair frame audits                              | 2 × 107 | 2 × 102 |
| Original/clothed/styled GIFs, four actions, both directions | 24      | 24      |
| Mixed project and legacy project reopen                     | Passed  | Passed  |
| Fresh independent player contexts after workbench closes    | 2       | 2       |

Checks include source RGBA equality, exact pixels outside ownership, protected
head/hand preservation, authored alpha, exact left mirrors, native frame order,
GIF delays and loop flags, full original jump frames 200–249, independent
playback of every action/direction and byte-exact re-export of the uploaded pack.
Standalone contexts may not request authoring or skeletal modules.

The first female capture was rejected by the runtime-freeze guard after a
storage-warning wording change during capture. It is historical evidence only.
The first male capture was stopped when a separate audit found nonlocal trouser
sampling changes during hand repair. The corrected final runs are explicitly
named `polish-female-final-b` and `polish-male-final-b`; neither discarded run
contributes to acceptance. No protection, frame or freeze checks were relaxed.

## Visual findings

- Male walking: the large old-shorts wedges beside the hand are reduced across
  12 reviewed poses. All 95 unrelated garment frames remain byte exact; changed
  garment pixels stay within three native pixels of the corrected contact mask.
- Female: coherent complete pleats remove repeated straight/ruffled donor jumps.
  A first trial created a detached-looking front flap beside the fist and was
  rejected. The final running skirt has a continuous complete hem, with less
  wind lift. Two isolated blouse donor jumps are also corrected.
- Male jump 67: the large rear scalp strip is covered by existing authored hair;
  the other 106 native hair poses remain exact. Original facial/foreground pixels
  and female hair are preserved.

Technical success is not an all-seams art approval. The female squared forearm
boundary at run 39/49 remains, some blouse/sleeve donor changes are visible, and
entering jump changes the skirt silhouette. Male compressed sleeves and a small
lower nape transition remain. Source blur, matte fringes, source-specific drawing
variation and the jump's shallow-crouch endpoint are not altered.

The parent page links actual-export before/after GIFs, native key poses, integer
2× details, standalone CharacterPacks and editable projects. Offline authoring
diagnostics are labeled separately. Changed-pixel and silhouette metrics locate
differences; they are not aesthetic scores.
