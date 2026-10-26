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

The current capture protocol is in [evidence/CAPTURE.md](evidence/CAPTURE.md).
The production capture, independent export audit, same-frame comparisons and
portable downloads are added here after their checks finish. Offline prototype
images above do not substitute for that application review. Technical checks
and pending user visual acceptance are reported separately.
