# Base character study 1

Started from merged `main` at `19623f5`, on `feat/base-character-study`.
This batch makes one simple, editable mother model with standing/idle, walking,
running and a one-shot jump. It is a foundation for refining the body, not a
claim that the final character art or movement has received visual acceptance.

## What changed

The new development-time source sheet supplies a plain sage training vest,
slate shorts, bare limbs and simple thin-soled shoes. The existing standard-kit
bald expression heads retain the identity and keep the neck exposed. The
production assembly uses individual registered parts, not the sheet's complete
character. See [source provenance](../artwork/base-character/source/README.md).

The authoring project explicitly stores the source anatomy in both rig chains
and skin bindings. Shoulder/elbow/wrist and hip/knee/ankle landmarks are visible
with **Bones**; **Skeleton only** removes the artwork for inspection. Frame size
is 192×256, anchor (96,240), neck (96,118). It has 4 idle, 8 walk, 12 run and
12 jump source poses. Left-facing output mirrors complete right-facing frames.

Two preparation iterations followed the first actual UI export. The first
short split carried too much waist onto the moving thighs. A narrower straight
cut revealed its own edge; the retained version uses rounded hip and upper-thigh
boundaries with overlap. The first export and matched final comparison remain
available. This does not invent a new joint shader or alter other garments.

Thin shoes cannot reach all thick-boot contact targets with fixed leg lengths.
This project's run reduces horizontal travel to 80% of the Theo clip and lowers
the body by six pixels through the cycle. The same 12-key/18 FPS rhythm remains;
run shoes inherit the solved shin rotation and ankle. Jump's project-owned root
arc lifts the torso up to 14 pixels, providing a visible hop while keeping the
bald head inside the frame. Idle and walk clip parameters are unchanged.

Skin Studio adds **Open base model**, loads the packaged project through the
ordinary validator, and supports undo. Failed loads leave the open project
intact. The existing action editor, material colors, expression selection,
project round-trip and independent CharacterPack export are reused.

## Compatibility and reproduction

No global renderer, motion defaults, file schemas, V1–V7 art or previous source
libraries change. The new project uses existing identity V1, source-relative
clothing V3, shoe item V5, skin V4 and motion-library V2 contracts. The new
anatomy and clip ID are opt-in inside this project. They do not silently change
older projects. General cross-body clothing retargeting is not claimed.

```sh
node scripts/prepare-base-character.mjs
node scripts/generate-base-character-evidence.mjs
python scripts/render-base-character-review.py
```

The evidence command refuses to overwrite a phase; use a new
`EVIDENCE_PHASE=iterations/<name>` for later candidates. Its `final` phase also
checks actual UI frames, source slots, save/reopen, recoloring and independent
playback after closing Studio. The review compositor decodes the downloaded
atlas and captures; it does not use the conceptual source illustration.

## Visual findings

Native and 2× keyframes, 4× joint crops during preparation, both mirrored output
directions and all four actions were inspected. Source arm/leg artwork is
continuous across split boundaries; the vest has complete hidden shoulder
coverage and the hip has its own backing. The run support solve keeps shoes at
their declared height without disconnecting the ankle. The jump starts and
finishes on exactly the same ready pose. Full playback order and timing were
verified separately in the independent browser consumer.

Remaining visible limitations:

- Deep run recovery (especially keys 8–9) crowds the two legs and shoes. A
  dedicated passing pose and clearer near/far silhouette would improve it.
- Bare knees make the mesh's rounded but soft deformation visible. The inner
  knee/short hem still has angular pixels at deep bends; no painted corrective
  pose has been added in this batch.
- The near shoulder is drawn in front of the vest and can read as a separate
  cap at extreme arm swings. It stays attached, but needs further shading work.
- Idle/walk/jump retain the existing shoe-pitch and arm-motion semantics; strict
  shin-following footwear and fixed limb lengths are only asserted for run.
- Neutral/gentle expression difference is subtle. Head/face finish is inherited;
  this batch concentrates on the body. No front/back views, hair physics, world
  locomotion or production Gathria integration are added.

See [review files](base-character/README.md). Functional verification is recorded
separately in `base-character/verification-results.json`; passed tests do not
establish final naturalness or user visual approval.
