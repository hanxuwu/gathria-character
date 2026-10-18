# Motion library V2: centered run support

`gathria-motion-library` version 2 explicitly opts into a revised **run**
solver. The project, rig, skin and CharacterPack envelope versions do not change.
The original factory and all V1 projects keep their existing behavior; importing
artwork or changing clothing never upgrades the motion library.

## Run coordinates

- `footX` measures horizontal ankle travel from the transformed midpoint of the
  two registered source hips. Each leg retains its own anatomical hip and source
  segment lengths. This removes the unequal reach introduced by measuring the
  same motion separately from two different hip positions.
- `shoePitch` rotates the actual shoe artwork around its source ankle. The
  solver finds its lowest opaque pixel with the renderer's nearest-neighbor
  sampling, then places that support at `anchor.y - 1 - footLift`. The same
  translation moves the ankle target before solving the knee. The shoe and shin
  therefore share the posed ankle even when the heel or toe is tilted.
- Optional `torsoLean` is an additional upper-body angle in radians, restricted
  to `[-0.12, 0.12]`. Its default is zero. Head, torso and arms rotate together
  above the shared source hip midpoint; pelvis and leg targets retain the base
  `lean`. This field is accepted only in V2 run keys.

Idle, walk and jump use the V1 rendering path. Source dimensions, anchor,
half-cycle limb opposition, interpolation policy and clip timing remain
unchanged. An opaque shoe is required for the V2 support calculation.

## Authoring and compatibility

`createMotionLibrary()` remains V1. `createMotionLibraryV2()` is an explicit
starting point, not a promise that one clip fits arbitrary imported anatomy.
The reviewed Theo project contains its own tuned V2 run. Users can edit its
upper-body angle in Skin Studio; Reset retains V2 coordinates and version,
while Undo restores the tuned clip. The editor saves the complete library.

The importer rejects unknown versions, out-of-range angles and V2-only fields
in V1 or other actions. An older app cannot edit a V2 motion project. It can
still play its baked CharacterPack: the independent player reads ordinary
frame IDs, timing, mirroring and pixels, with no skeleton solver dependency.
Save the separate `.rig.zip` to reproduce or edit an imported character.

This authoring version is separate from legacy `CharacterConfig.motionVersion`
and from the baked pack's reusable-rig generator ID. Exported authoring
provenance records the actual project-owned motion library.

See [the Theo run repair review](THEO_RUN_REPAIR_REVIEW.md) for the actual
outputs, validation and remaining visual limitations.
