# Kling fit and material workflow — Sprints 16–20

Previous PR #32 merged as `7f76524`; this batch starts from that exact main.
The approved two Kling sources, anatomy, source frame order and action timings
remain fixed. This is additive clothing authoring and workflow maintenance.

## Scope and visual decisions

- **Male shirt V4:** narrow rolled-hem shading is confined to existing cloth
  beside the short-sleeve boundary. Exposed arm/forearm pixels are unchanged.
- **Male jacket V4:** supplementary navy folds wrap bent elbows and a narrow
  ivory inner cuff stays behind the original wrist. First trial wrapped too far
  around the fist; the retained candidate reduces that extent. Existing RGBA
  alpha and clothing ownership are unchanged in every source pose.
- **Female dresses:** two compressed-waist trials were rejected. A generic
  generated cloth band created an outer-ink wedge, then a pale fleck and broken
  folds. Keep **V6** for both dresses. This batch does **not** claim a new female
  waist correction. The next art step needs accurately painted native pose
  patches, reviewed with adjacent poses. No further stretch patch is stacked.

New male presets are **Everyday soft cuff** and **Wedding soft cuff**. Earlier
versions remain selectable and old saved projects keep their exact artwork.
Source donors and rejected offline trials are documented in
[provenance](../../artwork/kling-fit-workflow/source/README.md).

## Actual export review

| Outfit | Five actions / right | Five actions / left | Details |
| --- | --- | --- | --- |
| Male everyday, V3 → V4 cuff | [GIF](review/male-day-five-actions-right.gif) | [GIF](review/male-day-five-actions-left.gif) | [Native keyframes](review/male-day-keyframes-1x.png) · [cuff/waist 2x](review/male-day-connections-2x.png) |
| Male wedding, V3 → V4 cuff | [GIF](review/male-wedding-five-actions-right.gif) | [GIF](review/male-wedding-five-actions-left.gif) | [Native keyframes](review/male-wedding-keyframes-1x.png) · [cuff/elbow 2x](review/male-wedding-connections-2x.png) |
| Female everyday, retained V6 | [GIF](review/female-day-five-actions-right.gif) | [GIF](review/female-day-five-actions-left.gif) | [Native keyframes](review/female-day-keyframes-1x.png) · [waist 2x](review/female-day-connections-2x.png) |
| Female wedding, retained V6 | [GIF](review/female-wedding-five-actions-right.gif) | [GIF](review/female-wedding-five-actions-left.gif) | [Native keyframes](review/female-wedding-keyframes-1x.png) · [waist 2x](review/female-wedding-connections-2x.png) |

The two female comparisons are intentionally unchanged regression references.
All review pixels come from application PNG/CharacterPack downloads. Compact GIFs
are labeled 0.5x; the `before-after-1x.png` / `before-after-2x.png` files and detail
boards use native/integer scales. Repeating five-action review montages do not
turn the actual one-shot jump/celebrate actions into looping gameplay animations.

Two additional mix checks retain Gentle, copper hair and independently selected
shoes. The male mixes the new teal shirt with navy suit trousers. The female
combines the retained coral dress with brown shoes.

| Ready-to-open mix | Preview | Editable wardrobe | Independent CharacterPack |
| --- | --- | --- | --- |
| Male | [Right](review/male-mixed-five-actions-right.gif) · [Left](review/male-mixed-five-actions-left.gif) | [Wardrobe ZIP](evidence/mixes-v4/male-male-mixed.wardrobe.zip) | [CharacterPack ZIP](evidence/mixes-v4/male-male-mixed.character.zip) |
| Female | [Right](review/female-mixed-five-actions-right.gif) · [Left](review/female-mixed-five-actions-left.gif) | [Wardrobe ZIP](evidence/mixes-v4/female-female-mixed.wardrobe.zip) | [CharacterPack ZIP](evidence/mixes-v4/female-female-mixed.character.zip) |

Open editable ZIPs with **Open wardrobe project**. Open CharacterPacks in
`/player.html` with **Choose character pack**. Primary before/after packs and
individual native PNGs are retained under [cuff-v4](evidence/cuff-v4/).

## Saved artwork

**Saved looks → Artwork stored in this browser** shows archive-byte usage and
lets users remove unreferenced managed artwork. Both characters' saved looks
and every material in the open project are protected. Save, recipe update and
cleanup share a browser write lock across tabs. Unreadable recipes stop cleanup.
Entries written by earlier versions are conservatively retained; cleanup needs
HTTPS/localhost Web Locks. There is no automatic eviction and the 256 MiB cap
is unchanged. **Save wardrobe** remains the portable backup.

Applying a saved look now prefers its hash-verified local archive even while
the exact catalog item remains available. Missing bytes may use the matching
catalog download; unavailable browser storage can fall back to that download.
Corrupt stored bytes fail rather than silently substituting another revision.
This avoids clothing downloads for retained looks; loading the app and original
source still requires access to their files. This is not a complete offline app.

## Loading and verification

PNG None/Sub/Up row filters now use specialized reconstruction loops. The
inflation bounds, checksums, complete stream checks, hidden RGB, alpha and cache
limits stay unchanged. [Production measurements](performance/README.md) compare
the merged runtime with this candidate, using the same existing outfit and
catalog snapshot, disabled HTTP caching and exact preview pixels. Two
order-balanced samples per build/character give modest, mixed results: first
female hair preparation is 31.01 → 28.96 s; first male hair is 8.79 → 8.62 s;
male outfit preparation is slower, 3.52 → 3.74 s. This is not a broad speed claim;
the first female hair load remains a substantial wait. Cache budgets did not grow.

Checks actually executed for this batch:

- TypeScript and production build pass; **240 unit tests**, **64 Chromium E2E
  tests**, and **6 Python recipe tests** pass. E2E includes concurrent save/cleanup
  across tabs, cross-character protection, legacy material retention, corrupt
  local material handling, and restoring a saved catalog look with clothing
  downloads blocked.
- **64 prior archives** retain their recorded SHA-256; **176 new male garment
  poses** retain ownership, alpha and all unowned pixels.
- **10 actual CharacterPacks / 920 decoded poses** pass archive, RGBA, geometry
  and unchanged action/timing checks. Source pixels outside the selected clothing
  and appearance remain exact. Within the four before/after studies, changes
  are confined to selected clothing; both female V6 studies are RGBA-identical.
- **50 directly downloaded PNGs** match their corresponding pack frames,
  including left-facing mirrors. **24 GIFs / 18 review PNGs** are decoded;
  GIF frame order, total duration, individual delays and looping are checked.
  GIF centisecond rounding and combined consecutive holds are recorded.
- **10 project reopen checks**, **6 saved-look refreshes**, and **60 independent
  player action/direction checks** pass. Editors are closed before those player
  checks, and requests to editor, wardrobe, appearance and skeleton dependencies
  are blocked. Player sampling confirms playback/wrap or one-shot completion;
  the decode checks, rather than sampled browser timing, cover every pack frame.

See [this-run validation](validation-this-run.json),
[export verification](verification.json), [test logs](test-logs/),
[four-outfit browser record](evidence/cuff-v4/evidence-index.json), and
[mix browser record](evidence/mixes-v4/evidence-index.json).
Actual UI screenshots show [stored artwork controls](evidence/mixes-v4/female-saved-artwork-storage.png)
and [independent playback](evidence/mixes-v4/female-female-mixed-independent-player.png).

To recapture, use `scripts/capture-kling-polish.mjs` with
`SPRINT_BATCH=kling-fit-workflow SPRINT_FIT_V4=1`, `SPRINT_RUN=cuff-v4` and
`SPRINT_CASE=male-day,male-wedding,female-day,female-wedding`; repeat with
`SPRINT_RUN=mixes-v4 SPRINT_CASE=male-mix,female-mix`. `SPRINT_TEMP` selects the
temporary project directory and `CHROMIUM_PATH` the browser. Then run
`SPRINT_BATCH=kling-fit-workflow python scripts/render-kling-polish.py` in the
existing Pillow/NumPy/OpenCV authoring environment. The capture step regenerates
the temporary primary wardrobe projects used by the renderer. The two mix
wardrobe projects, all CharacterPacks, configuration JSON and actual PNG/GIF
evidence are retained in this review directory.

## Visual limits and next art decision

The male changes are local cuff/elbow refinements, not a new sleeve silhouette.
Some short-sleeve boundaries still have a hard corner. In the
[male wedding keyframes](review/male-wedding-keyframes-1x.png), **run position 5 /
source frame 56** still exposes an unusually large skin-colored area across the
waist, visible both before and after. Its hand/forearm ownership needs a separate
review with adjacent frames; this RGB-only revision deliberately does not redraw
or reassign the approved source anatomy. It is an unresolved visual issue, not
evidence that passing pixel-protection checks proves the outfit is complete.

Extreme female dress-waist compression remains at V6 after both rejected trials.
The next useful art change is a native-pose cloth patch with its occlusion mask
and adjacent-pose comparison. Source jump motion blur also remains. No final
user visual acceptance is implied.
