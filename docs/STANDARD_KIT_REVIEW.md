# Standard body / eight-look review

This batch starts from merged main `0a0fc06`. It tests a repeatable source
production contract: two hair silhouettes over the same three face drawings,
two tops, one trouser set and two shoe designs, with one unchanged body and
four-action motion library. It adds prepared assets and development tooling;
existing runtime modules and historical artwork remain unchanged.

[Actual application exports and downloads](standard-kit/README.md) ·
[Authoring contract](STANDARD_CHARACTER_KIT.md) ·
[Source artwork and reproducible preparation](../artwork/standard-kit/README.md)

## What was made and what was reused

One development-time OpenAI image-generation call produced three bald
expression heads and two isolated hair overlays. The exact prompt, reference
and original PNG/hash are retained. The faces, short necks and hair overlays
are registered separately; either hairstyle is composited over the same face
source for a given expression. Six complete heads compile into the existing
IdentityPack V1 contract. Skin Studio selects the two variants through its
identity control; this does not add an independent runtime hair selector.

The teal jacket and ochre pullover reuse Ravi/Lina artwork, and the trousers
and boots reuse the Theo passing/ankle-follow sources. The second footwear
choice adapts the Sage three-quarter shoe painting. These are newly registered
derivatives of retained sources, not newly generated clothing designs.

Every editable project embeds both identities and all five clothing items.
Changing clothing preserves the exact source face pixels. Changing hairstyle
preserves the body and clothing. All eight projects use the exact baseline
rig, anatomical chains, motion keys, sequences, timing and supported actions.

## Issues found through assembly

| Issue                                 | Cause                                                                                 | Change                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Tops quietly changed body proportions | Previous top archives carried their own shoulder/elbow/wrist positions                | Register each source arm segment onto the fixed Theo chain; keep collar/torso painting and the original files                    |
| Sneaker looked twisted during running | The original near shoe was painted almost front-on, unlike the side-oriented run pose | Use the same source's three-quarter painting for both feet, with explicit ordinary/run registration; keep the rejected trial     |
| Bangs covered eye details             | Generated wig openings and bald-head dimensions were not calibrated                   | Fit the hair overlays locally while keeping face pixels unchanged; independently check the 426-pixel eye region                  |
| Hair touched the frame during walking | Static idle inspection missed upward movement of the tallest crown                    | Compress only the crown registration with a smooth falloff; test every action key and expression rather than cropping the output |

The final crown adjustment leaves at least four pixels above the short-hair
character and three above the swept-hair character in the preparation
216-frame check. Registered common-face pixels remain unchanged. The earlier
head fit and the first sneaker registration are preserved as clearly labeled
development comparisons.

## Verification

[Current command results](standard-kit/verification-results.json) record
TypeScript, production build, **135 relevant unit tests across 12 files** and
**seven Chromium workflow regressions**, all passing in this session. The
browser regressions include original Theo/Rose/Maple/Willow baked-pixel
compatibility. Existing large-chunk build warnings remain.

The separate [source-contract report](standard-kit/contract-validation.json)
checks shared body/motion data, independent face/hair recomposition, embedded
libraries, material ownership, cross-combination attachment invariance and all
three expressions through the complete motion library. It distinguishes
unchanged anatomy from different solved support positions caused by different
shoe silhouettes.

That check passed for **8 projects, 864 expression/action frames plus repeated
determinism checks, 192 running-shoe registrations, 28 cross-combination pairs
and six independently recomposed heads**. Source registries, generated masks
and package contents agree. No historical runtime or artwork changes were
detected against the merged baseline.

The [export/playback record](standard-kit/final/current-execution-record.json)
and [artifact inventory](standard-kit/final/file-integrity.json) record actual
Studio downloads, PNG equality, save/reopen, UI expression/recolor checks,
closed-editor independent playback and complete PNG/GIF/ZIP decoding. These
are this batch's results, not substituted historical counts.

## Remaining limits

- Neutral and gentle expressions remain subtly different. Three separate
  expression drawings retain small contour/light differences; sharing a face
  across hairstyles does not make all expressions the same geometry.
- The original Theo trousers still have crowded recovery folds and abrupt
  contours in deep bends. This kit proves fixed-body reuse, not a new gait or
  fully natural cloth simulation.
- Sleeve and footwear source detail differs slightly from the new head's
  softer finish. The shoe pair reuses one three-quarter painting, rather than
  newly drawn near/far perspective assets.
- Hair is rigidly attached here. There is no ponytail physics, independent
  front/back viewpoint, universal body retargeting or arbitrary-clothing fit.
- No production Gathria scene integration or user visual acceptance is claimed.

Functional checks and visual review have separate records. The batch remains
an unmerged review delivery; it should not be described as an accepted final
art style or as a general automatic segmentation system.
