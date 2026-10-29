# Side-view tailored clothing and hair

**Follow-up:** current candidate assets include the
[side-view polish iteration](../kling-side-polish/README.md). The review packs,
QA reports and known-limitation evidence on this page describe the prior
`4fd27f9` checkpoint and are retained for comparison. Use the follow-up page
for current exports and acceptance results.

This is a separate fitting edition for the approved Kling side-view sources:
male terracotta Oxford shirt / stone trousers, female cream blouse / rose skirt,
and one painted side-view hairstyle per character. Clothing, hair and three hair
colors can be selected independently. Existing same-cut material studies,
three-quarter characters, saved projects, skeleton tools and player formats stay
available.

## Open and inspect

While this is a draft, use branch `feat/kling-side-tailored-wardrobe`; the new
entry is not present on `main` until the pull request is merged.

Run `npm ci` and `npm run dev`, then use **侧视新款试装与发型** on either library
card ([actual library screenshot](review/library-entry.png)). Direct routes:

- `/workbench.html?character=male&mode=side-view&collection=tailored`
- `/workbench.html?character=female&mode=side-view&collection=tailored`

The new outfit starts selected; **发型** adds the new hair, and **发色** changes
its tint. **原片服装** restores the source tank/shorts while retaining the chosen
hair. Choose **原片发型** separately for the complete original. Individual top
and bottom slots support mixing with the original tank/shorts. Original shoes
remain unchanged. The older material collection retains its separate source-bound
garments and registration; it is not silently migrated into the new edition.

Use idle/walk/run/jump, left/right, pause and frame stepping, or focus the stage
and use arrows/A/D, Shift and Space. In-place and camera-follow travel remain
distinct previews. Source playback is always 24 fps; travel speed changes stage
displacement, not drawing timing. The queue states when the next action starts.
The two-jump clip is a one-shot ending in a shallow crouch, explicitly identified
by the UI. It is not a fabricated seamless standing recovery.

Save the editable wardrobe ZIP to reopen the exact embedded sources, registration,
four applicable slots, hair/color and action/facing. Export CharacterPack for the
independent `/player.html`; it needs no authoring workspace or garment bank.

## Source and ownership

The original source ZIPs and original registration bytes were not changed.
Male has 107 frames; female has 102. Both remain 512×768 at anchor `(256,710)`,
with the original frame IDs, action ranges, timing and jump source frames 200–249.

Trying actual sleeves, long trousers and a separate skirt exposed errors hidden
by the previous same-cut recolors: some hand regions protected thighs/knees;
some head regions included raised shoulders. The new edition therefore has an
independently reviewed registration, not relaxed compositor guards. Source-bound
head/hand corrections and guide reviews are in
[templates](../../artwork/kling-side-expansion/templates/) and
[source review](templates/source-review/README.md).
Every new bank is bound to those exact registration bytes. Older banks and projects
retain their original bindings.

Clothed review also exposed a second failure: convex hand boundaries bridged
hand-to-thigh and forearm-to-shirt concavities. Exact pixel preservation then
preserved the wrong skin/old-cloth islands. Source-traced concave contact edges
replace those hulls in the candidate. The female walk-31 right waist guide was
also on the far forearm; its reviewed position now follows the actual torso.
Fitting guides are still estimates. Orange UI markers identify hidden or
low-confidence positions; actual clothed-frame review remains necessary.

The reusable Python authoring helper produces explicit sparse garment ownership
and replacement RGBA. Inside ownership, real-cut garments can extend or replace a
silhouette; outside ownership, source RGBA stays exact. Protected visible head and
hands remain source artwork. New cuts must still be painted and reviewed per pose;
these templates do not make arbitrary clothing fit automatically.

- [Male clothing artwork and fitting](male/README.md)
- [Female painted blouse and skirt](female/README.md)
- [Hair artwork, per-pose fit and face preservation](hair/README.md)
- [Action/input changes](motion.md)
- [Optional extraction repair study](cleanup/README.md): a male shorts matte patch
  is recorded separately and **not enabled** in the runtime or frozen source.

Generated donors supply only new clothing or hair. Generated faces, hands and
body proportions are discarded. Hidden cloth, new folds and hairstyle volumes
are authored additions, not claims of original video-layer extraction.

## Actual-export review and verification

Current-run evidence and commands are recorded in [QA.md](QA.md). Historical test
counts elsewhere in the repository do not certify this edition.

| Review                                   | Male                                                                    | Female                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Run, source / clothing / clothing + hair | [Right](review/male-run-right.gif) · [Left](review/male-run-left.gif)   | [Right](review/female-run-right.gif) · [Left](review/female-run-left.gif)   |
| Walk                                     | [Right](review/male-walk-right.gif) · [Left](review/male-walk-left.gif) | [Right](review/female-walk-right.gif) · [Left](review/female-walk-left.gif) |
| Original two-jump one-shot               | [Right](review/male-jump-right.gif) · [Left](review/male-jump-left.gif) | [Right](review/female-jump-right.gif) · [Left](review/female-jump-left.gif) |
| Native key poses                         | [PNG](review/male-keyposes-native.png)                                  | [PNG](review/female-keyposes-native.png)                                    |
| Integer 2× detail                        | [PNG](review/male-details-2x.png)                                       | [PNG](review/female-details-2x.png)                                         |
| Standalone CharacterPack                 | [ZIP](review/male.character.zip)                                        | [ZIP](review/female.character.zip)                                          |
| Editable styled project                  | [ZIP](review/male.wardrobe.zip)                                         | [ZIP](review/female.wardrobe.zip)                                           |
| Independent player after workbench close | [Screenshot](review/male-independent-player.png)                        | [Screenshot](review/female-independent-player.png)                          |

[Pair: walk → run → two jumps](review/pair-walk-run-two-jumps.gif) is a labeled
presentation timeline assembled from the actual exported packs. It is separate
from the interactive action-switch evidence in the QA reports.

[Same-frame fitting corrections at 2×](review/fitting-repairs-before-after-2x.png)
compares actual UI PNGs: male walk35's thigh rectangle, male run40's old-tank
triangle, and female walk31's misplaced waist. The original before files and
their frozen request-snapshot hashes are retained in [before](review/before/).
The repaired male jumping sleeve is also visible in the full jump comparisons;
source-based hand regions now leave the upper arm available for actual sleeves.

The original source geometry and drawing rhythm remain visible throughout.
The walk-35 rectangle, run-40 tank notch and reviewed jump sleeve cutouts are
corrected; small source matte fringes and blur remain.
Male compressed sleeves can still look angular at native size, and female fold
patterns change between the finite authored donor poses. These are reviewable
outfit candidates, not a claim of physically continuous fabric motion or final
user art approval.

One remaining ownership defect is confirmed in male walk frame 26 (walk position
5, source frame 52): a dark piece of the original shorts remains behind the near
hand because its protection still includes that cloth. It is not a painted
trouser shadow. [Actual-frame evidence](review/known-limitations/) and [QA](QA.md)
record it explicitly; this candidate does not claim all outfit seams are clean.

`scripts/verify-kling-side-expansion.mjs` drives the actual UI downloads and a fresh
independent player after the workbench is closed. It separately decodes all source
frames, garment ownership/alpha, appearance blending, left mirrors, GIF timing,
and saved-project bindings. Bulk trial downloads stay in `/tmp/side-expansion/qa`.
`scripts/review-kling-side-expansion.py` creates labeled comparison layouts from
those downloaded packs; it never fits or repaints artwork.

The final review folder contains native same-pose PNGs, integer 2× details and
original/new-clothing/new-clothing-with-hair GIF comparisons. GIF presentation
uses an indexed palette; the exported native RGBA PNGs and CharacterPack pages
are the lossless visual reference. Jump comparisons play once because the source
clip does not form a seamless loop.

Technical preservation checks and visual review are separate. Remaining limits:
source blur and small matte/green fringes, lighting/proportion changes between
source clips, a non-neutral jump endpoint, source-specific painted pose banks,
and no physical cloth or hair simulation. No extra animation frames, interpolation,
body warp or new facial redraw was introduced to conceal these limitations.
