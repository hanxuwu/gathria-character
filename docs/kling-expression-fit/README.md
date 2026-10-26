# Kling expression and clothing refinement

This additive batch follows merged PR #44, baseline
`2d6f147d763881f3af63be69ec6dcd86ba9914c2`. It refines existing face choices and
the Midnight sailor shirt, and uses the female sleeveless template to author
one Plum pintuck blouse. Original source frames, proportions and action clocks
remain authoritative. The female blouse is a review candidate with documented
neckline limits, not a replacement default outfit.

## Open the new choices

Open `/workbench.html?character=male&mode=wardrobe` or use `character=female`.

- **Hair & face → Face expression → Current expressions** contains
  **Gentle smile (refined)** and **Joyful (soft motion)**. Natural retains the
  source face; **Earlier expressions** keeps the previous Gentle and Joyful.
- Existing projects retain their embedded bank. Use **Preview updated
  appearance**, save a separate updated copy and reopen it to access new
  choices. The selected old expression remains selected until explicitly changed.
- **Find an outfit → Midnight sailor refined** selects the new male top with
  ochre chinos. Original **Midnight sailor** remains available.
- **Find an outfit → Plum pintuck day** or **Plum pintuck ochre** selects the
  new female top with navy or ochre shorts. The original shoes remain selected.

## Artwork changes and limits

**Gentle v2** reshapes the character's own painted mouth curve into a fuller
smile. Original eye/nose pixels, blinks, silhouette and laughter remain exact.
This is a mouth-focused expression treatment; it is not a newly redrawn face.
**Joyful v2** reuses the old Joyful painting except for mouth softness on eight
fast jump poses (88–91 and 100–103). It follows the source blur rather than
substituting a different source drawing.

[Expression source, native prototypes and independent audit](../kling-expression-refined/README.md)
document two bounded prototype attempts and eight new bank copies. Existing
bank ZIPs remain intact. New copies retain all old style/frame mappings and
decoded atlas regions, extending only the last atlas within unchanged limits.
Existing styles therefore remain reproducible even in the new bank.

**Midnight sailor V2** corrects repeated upper-neckline texture and shoulder
color mixing. Donor Y sampling above the neckline uses the existing navy cloth;
trim remains attached to its own torso/sleeve surface. All 88 poses retain exact
ownership, alpha, protected source pixels and lower torso/waist paint. Pose 104
still has a short angular collar termination caused by the fixed source cut.
[Authoring iterations and independent archive validation](../../artwork/kling-sailor-refinement/README.md).

**Plum pintuck blouse** uses one recorded development-time image-generation
donor for cloth RGB only. Generated head, skin, anatomy, background and alpha
are discarded. The painted buttons, fine seams and fabric are registered to
all 96 source poses. Explicit cloth-only ownership repairs add 2,117 pixels
across poses 62, 102 and 112; the other 93 native crop mappings remain exact.
Both shorts combinations retain original source alpha and strict protection.
[Source, recipe, repairs and limits](../../artwork/kling-female-top/source/README.md).

The frozen head-protection boundary includes original gray cloth in female
poses **89, 90, 93, 101, 102 and 103**. Those patches remain visible, especially
during blurred landing. The new top does not overwrite protected pixels to hide
them. [Native limitation comparison](../../artwork/kling-female-top/prepared/protected-neckline-limits.png)
shows the original, earlier top, candidate and protection overlay; this is an
offline diagnostic, separate from the actual application evidence below.

## Reusable authoring workflow

[Template reuse guide](TEMPLATE_WORKFLOW.md) records what can be reused, what
must be reviewed for each new design, and why one standing donor does not solve
every sleeve/neckline shape. The new blouse's recipe rebuild is byte-exact.
No shared recipe/import validator, renderer or registration was relaxed.

## Actual application review and validation

The [review gallery](review/index.html) contains eight comparisons made from
actual production downloads, with original export links and pixel provenance.
Open it through a local static server; GitHub's file view shows HTML source.
These comparison layouts do not repaint character pixels. Their GIFs use the
application's half-native matte exports; the detail boards use native PNGs and
two explicitly identified pack frames. Original exports remain alongside them.

| Review | What to inspect |
| --- | --- |
| [Male Natural / Gentle v1 / Gentle v2](review/male-gentle-run.gif) | Fuller smile while retaining original eyes, face and run timing |
| [Female Natural / Gentle v1 / Gentle v2](review/female-gentle-run.gif) | Same distinction on the female face |
| [Both Joyful versions in jump](review/joyful-jump.gif) | Mouth softness follows the blurred source poses |
| [Sailor v1 / v2 run](review/sailor-run.gif) | Cream neckline strip and shoulder blending |
| [Sailor jump / celebration comparison](review/sailor-jump-celebrate.gif) | Raised arms and difficult collar poses; labeled montage cuts are not action transitions |
| [Plum blouse with two shorts](review/female-plum-run.gif) | New top in continuous motion with navy and ochre bottoms |
| [Native details](review/actual-details-1x.png) · [integer 2× details](review/actual-details-2x.png) | Same-frame faces, shoulders and all six known protected-neckline cases |

**Visual review:** the fuller Gentle mouth is more distinct from Natural; the
new Joyful mouth is less sharp than the surrounding source motion blur. Sailor
V2 removes the repeated cream strip and reduces pale shoulder smearing while
preserving the existing garment cut. The plum top supports both tested shorts,
but original gray cloth remains visibly exposed at the protected neckline in
six jump poses. These are bounded improvements, not a claim of seamless final
artwork. User visual acceptance remains pending.

### Portable downloads

| Saved look | Independent player pack | Editable wardrobe project |
| --- | --- | --- |
| Male refined sailor, Gentle v2 | [CharacterPack](evidence/final-v1/male-midnight-sailor-v2-gentle-v2.character.zip) | [Saved project](projects/male-midnight-sailor-v2-gentle-v2.wardrobe.zip) |
| Female plum / navy, Joyful v2 | [CharacterPack](evidence/final-v1/female-plum-pintuck-top-v1-navy-shorts-joyful-v2.character.zip) | [Saved project](projects/female-plum-pintuck-top-v1-navy-shorts-joyful-v2.wardrobe.zip) |
| Female plum / ochre, Joyful v2 | [CharacterPack](evidence/final-v1/female-plum-pintuck-top-v1-ochre-shorts-joyful-v2.character.zip) | Select existing Ochre shorts in the female saved project |

All three packs contain the unchanged five action schedules and were loaded in
the independent player **after every editor context closed**. All three editable
projects were saved and reopened with an exact same-frame comparison; two exact
downloads are retained here. The third remains a temporary capture input.
[Delivered-project hashes](projects/delivered-projects.json) distinguish retained
files from temporary evidence without altering the original capture record.

### Checks executed for this batch

- TypeScript and production build passed; **398 unit tests** and **22 Chromium
  regression cases** passed. Five browser cases are new in this batch.
- Actual production UI capture passed: **122 native PNGs, 30 GIFs, eight UI
  screenshots, three exact project reopens, three CharacterPacks and 30
  independent-player action/direction cases**. No application errors or failed
  asset requests were recorded; a missing favicon diagnostic is listed separately.
- The independent Pillow/NumPy artifact audit decoded and checked **166 files**,
  reconstructed **280 pack frames and all 122 native PNGs exactly**, checked GIF
  frame order/timing and four exact right/left run mirror pairs. GIF palettes are
  lossy: decoded appearance is checked with recorded tolerances, not falsely
  described as pixel-identical to the source PNGs.
- Eight expression banks, all 88 sailor poses and all 96 female top poses passed
  their separate asset audits. Both female shorts mixes were checked. Frozen
  source/rendering files and old published assets remain protected by recorded
  baseline hashes.

[Verification summary](verification.json), [capture protocol](evidence/CAPTURE.md),
[actual browser record](evidence/final-v1/evidence-index.json), and
[independent artifact audit](artifact-validation.json) record the commands,
hashes, observations and limitations. This capture used implementation commit
`fb428c136d42aa7db925504a720075ee72848e57`; final delivery adds evidence and
review-script/documentation changes only. Remote CI passed for that implementation
commit; a delivery commit may have its own check status on the draft PR.

The three outfit thumbnails were captured separately from the Vite development
server using unchanged, hash-verified asset responses. The successful v3 record
and two failed helper attempts remain under `evidence/thumbnails-*`; they are not
counted as the production capture above. To repeat the full independent audit,
retain the matching production build and all three temporary saved projects, or
perform a fresh capture into a new run directory after building the same source.
