# Kling female: independently registered skeletal candidate

The female character now has her own editable native skeleton, selected from
**Edit Kling female skeleton** on the library card or directly at
`/workbench.html?character=female&mode=rig`. This is an independent registration
of the approved female source, not a resized male body. Original male/female
video playback and the existing male candidate remain unchanged.

## Source and implementation

The reference is the exact 704×1056 transparent female frame348 /14.50s.
Fifteen full-canvas PNGs partition every visible source pixel into head, torso,
pelvis, near/far upper arm, forearm, hand, thigh, shin and shoe. Standing is
composed from these parts, with zero RGBA difference from the source.

The female shoulders, armholes, vest hem, hips, knees and shoe openings are
registered from her image. Head and neck share the torso parent transform;
shoes follow their lower leg about the same ankle. The shared renderer is
unchanged. The new registration and parts are in
[`artwork/kling-native-female/prepared`](../artwork/kling-native-female/prepared).

One development-time image-generation call provided supplementary paint for
hidden joint surfaces. Visible original artwork is not redrawn or rescaled.
[The exact prompt, raw source and provenance](../artwork/kling-native-female/source/README.md)
are retained. The preparation report records donors, source/destination boxes,
pixel counts and an explicit mask excluding generated peripheral glow.

Actual initial exports exposed a narrow/gapped far upper arm and conspicuous
gray hip patches. The refinement restores torso ownership of the vest outline,
completes the occluded far upper-arm shaft, and uses original shorts texture
for the hidden hip allowance. Generated vest/shorts are unused source objects.
Original visible pixels always take precedence. This did not change the face,
neck, clothing design, standing proportions or the male artwork.

## Available workflow and compatibility

- Standing, walk contact, run flight and raised-arm celebration **static poses**.
- Native/2× inspection, mirrored left view, bones and dark-background display.
- Upper/lower arm and leg angle edits, undo/reset, native project save/reopen.
- Transparent PNG and CharacterPack V2 export; independent playback of all four
  one-frame holds. Each hold is 1FPS, `loop:false`; no skeletal jump is claimed.
- Separate male/female editing sessions persist when switching playback
  characters or workbench tabs. Cross-character imports update both embedded
  editor and surrounding workbench identity without replacing the session.

The existing native version1 contract gains optional `characterId`. Female
projects explicitly use `kling-female-native-study`. Old projects without the
field remain male and preserve their serialized bytes. No schema renumbering,
silent rerendering or changes to existing PNGs/ZIPs are required. Existing male
project and static CharacterPack hashes are regression-protected. Female exports
carry female metadata and truthful source/hidden-paint provenance.

## Actual exported evidence

[Review index, downloadable PNGs and packs](kling-native-female/README.md)
links the original-versus-standing comparison, both facing directions, all four
poses, near/far joint crops, initial/final comparisons, saved parts, application
screenshots and independent-player evidence. Images come from real UI exports.
The initial folder preserves the first registration; final is the reviewed
candidate. Neither is a completed animation cycle.

Verification results and commands for this batch are recorded in the review
index and `kling-native-female/verification-results.json`. Historical cleanup
or male-study test counts are not counted as new verification.

## Visual limitations and next work

The final standing identity is unchanged. The far shoulder is connected in the
selected raised-arm/running poses and its vest-outline fragment is removed.
The hidden far upper arm still has lighter/flatter shading than the original
forearm. Near-shoulder notches and compressed rounded contours remain at extreme
raises; shorts/hip folds can look angular during deep bending. The original
matte fringe is retained. An exact standing match does not prove natural motion.

Expression and outfit are fixed; separate hand pieces currently follow the
forearms. Continuous skeletal idle/walk/run/jump, pose-specific corrective
paint, facial layers, interchangeable clothing and production Gathria
integration remain future work. Original five-action video playback continues
to provide the approved motion reference. User visual acceptance is pending.

## Reproduce

```sh
python scripts/prepare-kling-native-female.py
NATIVE_STUDY_DIR=artwork/kling-native-female/prepared node scripts/compile-kling-native-study.mjs
EVIDENCE_PHASE=iterations/review node scripts/verify-kling-female-native.mjs
EVIDENCE_PHASE=iterations/review python scripts/render-kling-female-native-review.py
```

Evidence scripts require a new output directory and never overwrite previous
captures. Asset preparation uses retained source files and needs no generation
API. Runtime composition, imports and playback stay browser-local.
