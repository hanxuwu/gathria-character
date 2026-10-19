# Theo: registered running leg and boot alternatives

This batch adds explicit running source alternatives to the actual Studio
project `docs/theo-run-repair/final/theo-run.rig.zip`. It preserves all of that
project's original skin parts, identity, top, source palette, anatomical chains,
and complete MotionLibrary V2. The original Theo source and previous exported
projects remain available unchanged.

Run `node scripts/prepare-theo-passing-poses.mjs` from the repository root.
Preparation opens an isolated local Vite/Chromium process, registers source
pixels, composes portable items through the real application APIs and saves
an editable project. It never rewrites the original source or previous evidence.

## Sources and registration

The second candidate uses one new isolated navy bent-trouser source,
`source/complete-bent-leg.png`, generated with the original Theo artwork as a
visual reference. The untouched image, exact prompt and provenance are recorded
in [source/README.md](source/README.md) and
[source/complete-bent-leg.prompt.txt](source/complete-bent-leg.prompt.txt).

The isolated drawing includes a rounded hidden hip cap, continuous knee,
centered cuff and no boot, hand, coat, body or background component. Its source
centerline is hip `(590,320)`, knee `(972,490)`, ankle `(773,850)`. This is about a
95 degree source turn; the requested prompt angle is not substituted for the
measured source registration. A uniform scale of `0.078` fits the authored cloth width to the existing suit.
The renderer maps its independently registered bone lengths to the unchanged
anatomical chain while preserving the source transverse cloth width.
The same source is registered separately to each existing hip; destination
anatomical chains and every motion key remain unchanged.

The boot still comes from the upper-right running illustration in
`artwork/theo-pose-study/source/complete-pose-model.png`, registered at the
original uniform `121 / 250 = 0.484` scale. Its source ankle is `(1268,456)`;
the boot is isolated with an explicit ownership polygon that excludes the
trouser cuff and adjacent rear foot. No artificial near/far darkening is used.

Both sources use nearest-neighbor sampling and alpha threshold 192. Output
alpha is binary; transparent pixels have zero RGB and material. The leg owns
material 4 (lower clothing); the boot owns material 5 (shoe). No global color
removal, final-frame paint, anatomical squash or runtime pixel classification
is used. Recoloring uses the explicit source-relative palette contract.

`prepared/registration.json` records source hashes, every source/target pixel
sample, ownership polygons, joint registrations, source equality checks,
non-running regressions, rendered bounds and output hashes. Mesh topology is
reproducible from the saved project; compact inspections retain posed bones and
selected source slots instead of duplicating mesh arrays for every frame. New RGBA source
parts and corresponding material masks are under `prepared/slots/` and `masks/`.
The source registration and renderer diagnostics are separate from actual
application export evidence.

## Portable alternatives and compatibility

- `custom-theo-passing-bottom`: wardrobe item V4, exact old bottom parts plus
  `near-leg-bent` and `far-leg-bent` with independent source joint triples.
- `custom-theo-passing-shoes`: wardrobe item V4, exact old standing shoes plus
  `near-shoe-run` and `far-shoe-run` with their own source ankles.
- `prepared/theo-passing.rig.zip` combines both items using explicit Skin V3.
- No old base part, head, identity, repaired top, palette or motion key changes.
- Idle, walk and jump use their existing parts and are checked for exact output
  equality. Historical projects are never implicitly upgraded.

Preparation also saves legs-only and shoes-only diagnostic projects, allowing
source-leg deformation and shoe-perspective changes to be reviewed separately.
Final Studio exports and independent playback evidence are delivered under
`docs/`; preparation contact sheets do not replace that validation.

## Two bounded source candidates

Candidate 1 is preserved at `iterations/candidate1/`, including its complete
editable project, original source mapping and renderer diagnostics. It reused
an ordinary bent leg from the complete character source. The whole source had
a roughly 71 degree turn, while deep recovery demanded approximately 120
degrees. It still self-folded under that residual deformation.

Independent inspection also corrected an early visual guess: the protruding
flap in key 4 came from the terminal cuff, not the hip cut. Its source cuff was
skewed relative to the registered shin axis and did not remain covered by the
shoe. The second source specifically supplies a deeper coherent bend and a
centered cuff with continuous hidden cloth.

The initial `0.059` registration is preserved at `iterations/candidate2a/`.
It reduced the folds but made the calves visibly too thin. The final bounded
registration comparison uses uniform `0.078`, retaining the same measured source
joints, destination anatomy, motion and boot. This better matches the old suit
width while keeping the cleaner knee contour. No third source generation or
frame-specific fix is introduced.

The final study retains a visible boot overlap in key 9 and some cloth-width
change where the geometric selector switches between the old straight source
and the new bent source. Those limits are not claimed solved. Final native-size,
integer-zoom and animation evidence is reviewed separately from test results.

The final source cuff's opaque transverse extent is approximately 20.10 px,
compared with 15.26 px in the narrow registration and 29.86 px in the old near
shin. This measures the terminal band at projection 0.9–1.1 along knee→ankle;
it is a source registration metric, not an assertion of identical posed width.
The final geometric source can still produce small inner folds under the
strongest bends. `prepared/diagnostics/mesh-fold-proxy.json` records the
independent diagnostic counts and their limits; rendered pixels and continuous
playback remain the visual review objects.
