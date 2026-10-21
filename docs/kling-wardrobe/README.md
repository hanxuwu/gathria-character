# Kling wardrobe: casual and wedding

This batch adds a usable wardrobe around the **two approved Kling characters**.
It keeps their source-drawn faces, body proportions, motions and native attachment
point. Clothing is authored offline for every source pose, then composed locally
in the browser. The existing original playback and optional skeleton studies
remain available and unchanged.

## Open and use

Run `npm ci` and `npm run dev`. In the character library, choose **Dress Kling
male** or **Dress Kling female**. Direct routes:

- `/workbench.html?character=male&mode=wardrobe`
- `/workbench.html?character=female&mode=wardrobe`

Choose **Everyday** or **Wedding**, or choose individual top, bottom, full-body
outfit and shoe slots. Full-body outfits replace top/bottom selections; shoes
can be combined with either. **Original** restores the unchanged source.

Inspect Idle, Walk, Run, Jump and Celebrate, either facing, pause/scrub frames,
show the original beside the result, or show the registered anchors. Jump keeps
its complete one-shot recovery; action changes use the motion source's support
and landing routes. These are in-place sprites, not a simulated world movement.

**Save project** keeps the original source, registration, loaded garment banks,
selection and action/direction in one self-contained ZIP. Reopen it to continue
editing without the catalog. **Export CharacterPack** bakes the selected clothes
into ordinary V3 PNG pages for `/player.html`; the player does not need wardrobe
code. A baked pack is not itself an editable wardrobe project.
Save before leaving or refreshing the page: unsaved edits are held in memory,
not automatically persisted. Imported items stay in that project; the current
UI does not remove or overwrite them, and a project supports at most 16 items.
Use distinct versioned IDs for new garment revisions.

## Clothing and anchors

| Character | Available items                                                           | Presets                                                           |
| --------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Male      | Teal top, ochre shorts, navy wedding waistcoat, navy shorts, brown shoes  | Original, Everyday, Wedding                                       |
| Female    | The five compatible separates above, coral day dress, ivory wedding dress | Original, Everyday, Wedding, Everyday separates, Formal separates |

These are 12 separately registered items across the two bodies. The first male
formal design is a sleeveless waistcoat with tailored shorts; it is not a new
long-sleeved suit. Teal top, shorts and shoes are explicitly material/palette
variants of the original contours. The waistcoat transfers painted bow tie and
tailoring details; the dresses preserve original bodice shading with a new
material palette and add painted skirt, fold and hem artwork. Sleeveless designs preserve the original drawn arm poses.

Each of the 88 male / 96 female unique source poses has 17 native-coordinate
points: neck, shoulders, waist ends, hips, elbows, wrists, knees, ankles and toes.
Manual key-pose review and optical-flow propagation establish the guides;
occluded joints are marked as estimates. A shared canvas of 704×1056 and anchor
(352,998) remain fixed. No guide transforms the approved body at runtime.

The registrations also protect the original opaque head/neck and hand pixels.
Separate per-pose ownership masks determine which pixels clothing may replace.
Foreground arms remain in front of dress bodices, hems cover the appropriate
legs/shoes, and full-body clothes remove the old top/shorts inside ownership.
Guide points alone cannot solve occlusion or recover hidden anatomy.

[Format and validation](FORMAT.md) · [Male registration](registration/male.json)
· [Female registration](registration/female.json) · [Authoring kits](templates/README.md).

## Artwork and corrections

One development-time image-generation result supplies four garment design
references. Generated heads, bodies and backdrop are discarded; they are never
used as evidence of the composed characters. [Source and processing record](../../artwork/kling-wardrobe/source/README.md).

Actual pose inspection drove the following corrections:

- Crossing forearms divide the shirt into disconnected visible regions. Both
  regions now belong to the torso; hand protection does not erase the exposed
  cloth beneath an arm.
- Raised hands and facial highlights were initially mistaken for pale cloth.
  Exact head/hand protection and torso-local ownership remove that contamination.
- Pink shoe uppers and warm soles needed local ankle-aware ownership; global
  light-color selection missed them or selected a light shirt hem.
- The visible bottom of a partly covered shirt is not its waist. Registered
  waist endpoints hold the vest details and dress sash stable through crossing
  arms and crouches.
- Dress waistband overlap covers the original shorts in jump recovery without
  widening the skirt into a triangular side flap. Arm/hand occlusion is resolved
  before packaging, not patched during browser playback.
- A second native-size review of real UI exports found remaining warm shoe
  pixels and shirt fragments that passed structural validation but had the
  wrong material owner. Reviewed per-pose contours and pixel regression probes
  correct these. In female jump frame89, a propagated wrist had drifted into
  the shirt; its guide and hand protection boundary require a new registration
  hash and rebuilt garments. This leaves the approved source body and head
  protection unchanged. [Actual export correction comparisons](review/iterations/README.md).

## Actual application evidence

The `exports/` directory contains the four actual UI-downloaded CharacterPacks,
editable projects and transparent PNGs. `review/` images and GIFs are decoded
from those exported packs, not the generation reference or preparation previews.

- [Four looks / five actions GIF](review/four-looks-actions-right.gif)
- [Four looks / running together GIF](review/four-looks-run-right.gif)

These overview GIFs use 0.375× display and cut between action samples; they do
not demonstrate motion transitions. Jump plays once in each overview cycle.
`scripts/render-kling-wardrobe-overview.py` reproduces them from the four exported
ZIPs; [overview validation](review/overview-index.json) records source hashes,
decoded frame counts and exact preview durations.

- [Male original / casual / wedding, 1×](review/male-comparison-1x.png)
- [Female original / casual / wedding, 1×](review/female-comparison-1x.png)
- [Male comparison, 2×](review/male-comparison-2x.png) · [Female comparison, 2×](review/female-comparison-2x.png)
- [Male casual pack](exports/male-day.character.zip) · [Male wedding pack](exports/male-wedding.character.zip)
- [Female casual pack](exports/female-day.character.zip) · [Female wedding pack](exports/female-wedding.character.zip)
- [Browser actions, persistence and independent player evidence](browser/evidence-index.json)
- [Asset/ownership verification](verification-assets.json) · [Actual export verification](verification.json)
- [Decoded PNG/GIF inventory and timings](review/media-index.json)

| Actual exported look | Run right                                  | Run left                                  | Full jump                                   | Editable project                           |
| -------------------- | ------------------------------------------ | ----------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| Male everyday        | [GIF](review/male-day-run-right.gif)       | [GIF](review/male-day-run-left.gif)       | [GIF](review/male-day-jump-right.gif)       | [ZIP](exports/male-day.wardrobe.zip)       |
| Male wedding         | [GIF](review/male-wedding-run-right.gif)   | [GIF](review/male-wedding-run-left.gif)   | [GIF](review/male-wedding-jump-right.gif)   | [ZIP](exports/male-wedding.wardrobe.zip)   |
| Female everyday      | [GIF](review/female-day-run-right.gif)     | [GIF](review/female-day-run-left.gif)     | [GIF](review/female-day-jump-right.gif)     | [ZIP](exports/female-day.wardrobe.zip)     |
| Female wedding       | [GIF](review/female-wedding-run-right.gif) | [GIF](review/female-wedding-run-left.gif) | [GIF](review/female-wedding-jump-right.gif) | [ZIP](exports/female-wedding.wardrobe.zip) |

The review directory also includes idle, walk and celebrate GIFs for each look
and facing. GIF previews are explicitly labeled **0.5× display size**, with
timing rounded only to GIF's centisecond resolution; jump plays once. Native
704×1056 run contact sheets and 2× connection crops support close inspection.
The browser directory contains four complete independent-player recordings
with action changes after the workbench has been closed.

## Verification in this batch

- TypeScript, production Vite build, **152 unit tests** and **32 Chromium E2E
  tests** passed on this working tree. The four focused wardrobe E2E cases use
  small fixtures for rejection, slot conflicts, persistence and offline reopen;
  those fixtures are not the visual evidence above.
  The unit/E2E suite ran on the final runtime code before the last offline mask
  refinements; the final asset set was subsequently rebuilt and checked in the
  separate real-asset, production-browser and export runs below.
- The separate real-asset audit decoded all 12 garment archives and checked
  **1,112 prepared clothing poses**. Every item covers its complete registered
  frame bank and overlaps zero protected source pixels. All eight catalog
  presets preserve every pixel outside clothing ownership, and both Original
  resets export the exact source ZIP bytes.
- Both authoring kits passed CRC/hash checks, source-page decoding and decoding
  of all **1,672 semantic masks**. They copy the exact immutable source and final
  reviewed registration bytes, including the explicit female registration revision.
- The final production browser run completed **82 playback cases**, **22
  decoded downloads** and **four independent-player recordings**. All four
  primary outfits saved/reopened and played five actions in both directions
  after the workbench was closed. Two mixed dress/brown-shoe looks also passed
  all-frame preflight and exported eight explicitly selected native PNGs.
  No uncaught error occurred; the recorded console error is a missing
  `/favicon.ico`, not a character-asset failure.
- Browser observation retained one **98.6 ms** interval in female everyday
  idle-left, with no missing observed positions. Maximum per-case warm P95
  observation interval was **59 ms**. This records a real timing limitation;
  it is not a promise of constant frame delivery on every device. Source opens
  took **12.7–14.1 s**, first outfit preflight **5.1–11.3 s**, and independent
  pack import **2.4–3.8 s** on this machine.
- All **four actual UI-exported CharacterPacks** (eight PNG atlas pages), four
  native outfit PNGs and eight mixed-outfit PNGs decoded and matched local
  composition pixel-for-pixel. Source frame metadata, timing, anchor, mirroring
  and motion-flow routes remain intact. Male everyday was re-exported once and
  matched the actual browser ZIP byte-for-byte; the other three were not
  redundantly re-encoded for that representative determinism check.
- Review media includes **40 decoded GIFs, 20 PNGs and four additional matched
  correction PNGs**. GIF complete-clip durations and loop/one-shot behavior are
  checked separately from the lossless native PNG comparisons.
- On this machine, warm CPU composition of the four primary dressed looks had
  P95 of 3.00–3.82 ms (maximum 18.16 ms), with no measured composition exceeding the 41.67 ms budget
  of a 24 FPS source frame. This is an isolated CPU check, not a browser frame
  delivery guarantee or a measurement on the user's device.

The real production-browser export/playback and final media results are recorded
with their input hashes in the linked reports. Historical test counts elsewhere
belong to their own batches. The incomplete first recording attempt is retained
in `browser/attempt-1`: a missing Playwright FFmpeg executable stopped video
capture; using the installed system FFmpeg resolved that environment issue
without changing the app or artwork.

## Future clothing workflow and limits

Download the selected body's authoring kit. It contains the exact source pack,
registration and per-pose semantic masks with inventories. Author complete
clothing patches and ownership masks against that registration, review every
pose and action loop, package them using the documented garment format, and
import the garment ZIP in the wardrobe. A source or registration mismatch is
rejected. The existing complete-pose contract deliberately does not pretend that
an arbitrary single PNG can become a correct animated outfit automatically.

The current body, facial expression and original motions are fixed source art.
Dresses use registered painted folds, not cloth physics or individually redrawn
folds in every frame. Source motion blur, matte fringe and pose variation remain.
In the deep crouch (female frame89), the corrected dress still has a small
stepped waist edge and a local side bulge where cloth covers the upper thigh.
These are visible review limitations, not a claim of a seamless finished gown.
Some blurred ankle/hand boundaries contain mixed material colors in the source;
they cannot be perfectly separated without new underpainting. First-load
decoding and full-pose garment validation also take seconds on this machine;
the browser report separates these cold-load timings from warm playback.
New long sleeves, long trousers, exposed hidden skin or different body views
need additional pose-specific artwork and visual review. Anchor validity,
protected-pixel equality and passing tests do not prove aesthetic perfection.
Production Gathria integration and user visual acceptance remain unverified.

For reproducible preparation use the pinned Python packages in
`scripts/requirements-kling-wardrobe.txt`; see the template guide for the source
mask/registration commands. Then run the separates and dress preparation scripts,
`build-kling-wardrobe-templates.py`, and `build-kling-wardrobe-catalog.py`.
Keep exact registration bytes: editing them invalidates bound garment archives.
Runtime and evidence commands:

```sh
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
node scripts/verify-kling-wardrobe-assets.mjs --stage=assets
npx playwright install ffmpeg
WARDROBE_PRODUCTION=1 node scripts/verify-kling-wardrobe-browser.mjs
python scripts/render-kling-wardrobe-review.py
python scripts/render-kling-wardrobe-corrections.py
node scripts/verify-kling-wardrobe-assets.mjs --stage=exports
```

An editable project's original embedded registration remains authoritative when
reopened. Updated catalog garments cannot silently replace older source-bound
items: a different registration hash is rejected, even if the body looks the
same. Start a new catalog project to use the newly reviewed registration.
