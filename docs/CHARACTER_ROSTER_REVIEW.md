# Three more characters through the modular rig

This batch builds Ravi, Lina and Nora through the existing identity, clothing,
motion and CharacterPack system, starting from `38cfaa8`. It tests reuse with
new heads and tops rather than changing the anatomy or replacing the renderer.
It is a review batch, not a claim that arbitrary source art now fits every pose.

## Characters and actual exports

| Character | New illustration                                              | Final assembled outfit                                                         |
| --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Ravi      | Short curls, three expressions, teal utility jacket and arms  | New jacket with Theo's existing trousers and following boots                   |
| Lina      | Rounded black bob, three expressions, ochre pullover and arms | New pullover with newly packaged Sage shorts and following sneakers            |
| Nora      | Auburn low ponytail and three expressions                     | Existing Rose blouse in ivory with Sage shorts in coral and following sneakers |

The [download index](character-roster/README.md) links actual application exports,
editable projects, all four actions and independent-player evidence. The source
design board is not an export: Nora's originally proposed skirt was not retained
in the final playable outfit.

## Problems found and changes made

- **Wrong material at the jaw and fringe.** Dark skin shadows were classified as
  hair, so dark-skin/blonde combinations produced pale marks around the lower
  face. Source-specific ownership regions now keep skin shadows with the skin
  and Nora's fringe with the hair. Complete expression artwork remains intact.
- **Sleeve fragments and pointed elbow tails.** Lina's generated arm pieces
  included ivory collar fragments near the shoulders. Local ownership polygons
  exclude those pixels. Rounded, hidden sleeve overlap reduces the tails during
  bent-arm poses. Ravi's undershirt, exposed chest and jacket have separate
  material ownership; no global color deletion is used.
- **Legacy lower-body ownership.** Newly packaging the Sage source exposed old
  hoodie pixels at the waist and footwear pixels attached to the shin. Those
  pixels are excluded in the new derivative only. Frozen V6 sources stay intact.
- **One motion does not fit every body source.** Theo's unmodified run works for
  Ravi's trousers but exceeds support/reach constraints on the shorter legs.
  Lina and final Nora explicitly save a compact Motion V2 profile: `footX × .85`
  and `footLift × .95`. The body-bob keys, arms, cadence, anatomy and all other
  actions stay unchanged. This is a fitted profile, not automatic retargeting.
- **Nora's skirt trial is unsupported.** Reduced stride and bounded body-lowering
  trials could not produce all run poses with fixed bone lengths and following
  shoes. A separate hip-local Motion V1 test still failed run keys 1, 11 and 12.
  The failed projects and diagnostic reports remain in the iteration archive.
  The final character uses the proven shorts/shoe pair; it does not silently
  switch back to independently rotating footwear.
- **Build validation.** TypeScript rejected an impossible-state error branch
  after discriminated-union narrowing. Capturing the version before that check
  preserves the existing error message and runtime behavior.

## Source and compatibility

Five development-time OpenAI image-generation calls produced the design board,
three-expression bank, two garment boards and one rejected Ravi head revision.
[Originals, exact prompts and hashes](../artwork/character-roster/source/README.md)
are retained. The rejected revision only modestly reduced the facial color
difference and weakened native-size eye clarity, so the original heads remain.
[Preparation and registration](../artwork/character-roster/README.md) preserve
part boundaries, source axes, material masks and the source-to-slot mapping.

The browser still uses local deterministic composition. New identities are
portable IdentityPack V1 assets; new tops use wardrobe item V3; shoes use the
existing item V5 / Skin V4 following contract. Saved project libraries contain
the identities and clothing needed to reopen and customize them. No new schema
or silent upgrade is introduced. Old artwork, projects and exports are retained.

## Verification and visual limits

Current-session results and initial failures are recorded in
[verification-results.json](character-roster/verification-results.json). Historical
test counts from the Theo batch are not substituted for this execution.

The final browser run exports six semantic CharacterPacks (three original
palettes and three recolored joyful variants), checks 216 editor pose/direction
images against the downloaded PNGs, and reopens all three complete projects.
Three identities and four garment items round-trip through the normal UI.
Two cross-character shoe swaps work; the incompatible skirt and original skirt
project are rejected without changing saved work. After Studio closes, 24 player
cases cover all four actions in both directions for all three characters.

Build/typecheck and seven relevant Chromium regression tests pass. The selected
unit suite covers 68 unique cases: one initial five-second timeout under load
passed in the unchanged seven-case isolated recheck. No assertions or timeouts
were weakened. The final review also decodes GIF frame order/timing and all
delivered PNG/ZIP contents; exact totals are in the verification record.

The first application capture stopped on a material-check assertion: Lina's
ordinary far shoe is fitted from source sole y238 to y239, but the check used
the untransformed source mask at the destination coordinate. At `(105,233)` the
actual source sample is `(105,232)`, a recolorable shoe pixel. The corrected
check maps ownership through shoe fitting and shin allowance and keeps strict
fixed-pixel checks. The incomplete capture and concrete diagnosis are retained
under `character-roster/iterations/capture-material-check`; this was a validation
coordinate error, not a material or runtime repair.

The visual review checks native size, integer zoom, full frame sequences and
timed playback separately from functional tests. Remaining limitations include:

- Ravi's neutral and gentle heads retain visible skin-tone/lighting variation;
  expressions are complete separate drawings rather than one shared face mesh.
- The old Sage bare-knee mesh has a visible inward notch in a deep jump bend.
  New bent-knee source artwork is still needed for a clean extreme silhouette.
- Ravi retains the earlier trousers' compressed folds and crowded recovery
  pose. New heads and tops do not repair those historical lower-body drawings.
- Nora's rear ponytail has limited rigid sway. The discarded skirt still needs
  an anatomically compatible lower-body/footwear source and fitted gait.
- Clothing changes can invalidate a contact pose even when the rig identifier
  matches. The system needs explicit fit ranges or retarget assistance; source
  registration remains an authoring responsibility.

This delivery has not received user visual acceptance and has not been tested
inside production Gathria scenes. Previews use a labeled neutral background.
