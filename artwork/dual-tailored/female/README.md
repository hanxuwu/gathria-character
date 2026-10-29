# Female paired daily outfit: artwork preparation

This folder records the new **original three-quarter view** cream puff-sleeve blouse and rose short skirt. Side-view blouse and skirt use the previously painted `docs/kling-side-expansion/assets/female-{blouse,skirt}.garment.zip` pieces; they are separate pose banks rather than mirrored or warped original-view pictures.

## Sources and authorship

- Immutable character: `docs/kling-motion/exports/female.character.zip`, 704 × 1056 native frames.
- Original registration: `docs/kling-wardrobe/registration/female.json`, unchanged. The new outfit uses a separate `docs/dual-tailored/assets/female/original-tailored-v1.registration.json`; only six mistaken `nearHand` contours are corrected. Source anchors, frame references and timing stay identical.
- Source-pose study: `source/original-poses.png`, frame IDs 0, 51, 58, 75, 87, 95, 103, 111.
- New artwork: OpenAI image generation output `exec-fafffe6d-b899-46ff-b829-1f9227e454ba`, preserved byte-for-byte as `source/original-cream-rose-donors.png`. See `source/provenance.json` for hashes. The exact generation prompt was not retained; no reconstructed prompt is presented as the original.
- Generated faces, skin, limb anatomy, hands, shoes and background are discarded. These are newly generated **clothing donors**, not original layers extracted from Kling.
- Eight pose donors were explored. The final fitted bank uses the standing donor continuously, with independent sleeve attachments and one skirt fold layout. It does not switch between unrelated generated drawings during playback. The other donor crops remain reproducible study material.

## Fitting and ownership

`scripts/build-dual-tailored-female.py` traces the blouse, near sleeve and skirt in donor coordinates. Each native source pose uses its own recorded shoulders, elbows, waist and knees. Near and far puff sleeves follow the upper arms separately. The far sleeve is foreshortened in cloth-local coordinates. Visible foreground arms and hands remain in front of the cloth; an occluded back arm stays behind the skirt.

The blouse bodice follows the original tank ownership contour. Its collar, placket and fold texture are fitted inside that contour. This avoids importing generated neck skin, and avoids moving the source head to accommodate the blouse. The original frame 87 neck guide lies on the cheek; the final collar fit instead follows the visible source tank contour, bounded by the shoulders and waist. It does not change the shared registration or body. Waist estimates use the source tank hem with outlier rejection so an arm crossing the waist does not abruptly shorten the blouse.

The short skirt uses one painted fold pattern; its width, length and modest front lift follow waist and knee positions. Geometry is smoothed within each clip, with wrap behavior only for source clips declared as loops. Hidden cloth is completed from actual donor cloth. Skirt ownership may extend beyond source shorts and cover portions of thigh as clothing naturally would, while visible head and hands stay protected.

Actual application exports revealed source annotations that included thigh or shoe pixels inside `nearHand` on frames 36, 37, 47, 48, 53 and 54. The new registration follows the visible fist contour on those six frames. Original registration files and old garment banks are retained. `source/hand-foreground-v1.json` records the reviewed polygons; `prepared/guard-review/six-pose-source-guards-before-candidate.png` records source, annotation and same-frame cloth comparisons.

The raised rear shoe stays in the foreground on frames 53 and 54 through an explicit offline shoe mask. This is a clothing ownership exclusion, not a new runtime protected-region type. Every masked shoe RGBA pixel is checked against the source. Walking far-arm guides also put a 40-pixel inference radius into the neighboring thigh. For the walking clip only, forearm foreground masks now end at the wrist plane; actual hands retain their source protection. When the source has no visible far-hand region, the skirt occludes the back arm below the waist instead of reserving thigh pixels as arm. The far skirt panel follows the original shorts envelope using the same painted cloth, with a vertically smoothed expansion bounded to 40 native pixels. This replaces the isolated frame-37 flare and avoids a hard material-union strip in adjacent frames. Running, jumping, idle and celebration keep their prior fits except the reviewed shoe corrections. The small painted hem fold and fitted far-waist texture transition remain visual limitations.

A final source-vs-export review found the opposite annotation error: incomplete hand protection let cloth cover real thumb and diagonal wrist pixels on native IDs 37, 38, 41, 43–47. `foregroundHand` in the same reviewed JSON records their visible source contours and the pixel-center rasterization rule. Both blouse and skirt exclude these regions from ownership, preserving the source hand RGBA. The blouse changes only on IDs 41 and 43–46; all 91 other blouse frames and every blouse pixel outside the reviewed hand regions remain exact. The skirt correction stays inside the existing 25 walking poses and running frame 54. Frame 47 was reviewed separately to exclude neighboring thigh skin; an earlier candidate that retained a thigh crescent was rejected. `prepared/guard-review/hand-completion/published-repair-audit.json` binds the accepted traces and seeds, including per-slot removed ownership counts.

Prepared PNG patches replace RGBA only under explicit ownership masks. No source frame is stretched, retimed, regenerated or reordered. Outside clothing ownership the original RGBA is exact. There is no runtime image generation, skeletal deformation or interpolated animation frame. Donor-cloth resampling happens only in the offline preparation script.

## Reproduce

From the repository root:

```sh
python3 scripts/build-dual-tailored-female.py
```

The default output is `artwork/dual-tailored/female/staged/`, so generating a candidate does not change the runtime collection while browser verification is running. `--prototype` renders the selected difficult poses only; `--output <directory>` selects a destination inside the repository. Staged duplicates are not committed. To reproduce the published seeds and final original/side sea/apricot banks from a fresh checkout, run:

```sh
python3 scripts/build-dual-tailored-female.py --output docs/dual-tailored/assets/female
node scripts/build-dual-tailored-female.mjs
```

`prepared/audit.json` records protected-pixel and outside-ownership checks for all 96 native poses. `prepared/reproducibility.json` records byte-identical ZIP regeneration (including atlas and ownership PNGs). `prepared/original-*-all.jpg` and `prepared/original-*.gif` are offline authoring reviews from those native source composites. They are **not substitutes for the actual application exports** under `docs/dual-tailored/review`.

## Visual limits

The source jump contains blur and changing facial expression; these remain unchanged. A sleeve rotating far toward the camera exposes different amounts of its puff and cuff, and its original painted folds are fitted rather than individually redrawn in every frame. The skirt has a stable fold layout with limited pose-dependent lift, not a cloth simulation. These limits should be judged in the actual exported GIFs, separately from the pixel and package checks. Old colored cotton pieces are a separate registration group and are not offered as cross-group mixed items.
