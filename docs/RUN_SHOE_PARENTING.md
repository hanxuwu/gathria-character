# Running shoes attached to the shin

Skin V4 and shoe item V5 explicitly bind running shoes to the final solved
shin direction. Existing Skin V1–V3 and item V1–V4 files keep their original
rendering. Opening an older file does not upgrade it.

## Source registration

Each running shoe declares its source ankle and a second point along the
source shin. Both near/far entries are required:

```json
{
  "nearLeg": {
    "slot": "near-shoe-run",
    "ankle": [66, 222],
    "sourceShin": [74, 197]
  },
  "farLeg": {
    "slot": "far-shoe-run",
    "ankle": [111, 222],
    "sourceShin": [119, 197]
  }
}
```

These coordinates describe the retained Theo boot illustration, not a universal
template. The second point records an angle; its distance does not stretch the
shoe or alter anatomical bone lengths. Measure the direction from the shoe's
own source drawing. Copying the bent-trouser source knee would assign the boot
the wrong rest angle because those two source poses differ.

## Shared rotation and support

For each running leg, the rigid shoe rotation is:

```text
angle(final ankle - final knee) - angle(source ankle - source shin)
```

The shoe's source ankle maps to the exact same final ankle as the leg mesh.
This preserves its authored angle relative to the shin while preventing an
independent motion-key angle from twisting it away from the cuff. The clip's
existing `shoePitch` values are retained for ordinary shoes and other actions;
following running shoes do not use them. Studio explains this and disables
the separate shoe-pitch control while this mode is active.

Changing shoe angle also changes which opaque pixel is lowest. The running
solver therefore solves ankle height, knee pose, shoe angle and opaque support
together. It never rotates or translates the shoe separately after solving the
leg. Horizontal foot travel, body motion and timing retain the saved clip's
semantics. Solved ankle height and knee position can change to maintain support;
preserving anatomy does not mean preserving every posed lower-leg coordinate.

The search is bounded to 32 px around the nominal ankle height and to the
fixed-length leg's reachable domain. It evaluates the actual nearest-neighbor
opaque sole, accepting at most 1 px of support error (fractional motion heights
can require rounding to a native pixel). Unsupported travel or registration
is rejected rather than stretching the leg. Studio preflights every run key
before accepting an import or edit, preserving the previous project and undo
history if a later key cannot be solved.

Inspection reports the shoe transform, registered/posed ankle, source axis and
support residual. Verify the actual rasterized foot and cuff through the whole
loop, including both directions. A mathematical overlap count alone does not
establish a convincing clothing connection.

## Portable editing

Studio exposes source-shin and source-ankle handles when the alternative shoe
is selected. Those edits affect only the attachment registration and use the
existing save, reopen and undo workflow. A shoe item carries both points along
with its original images and material masks. Replacing it with an older shoe
restores the older shoe behavior while retaining the selected trousers.

Idle, walk and jump use the original shoe attachments and rendering. Source
project/skin versions identify the new behavior; baked CharacterPack pixels,
timing and mirroring still use the existing independent-player format.

This mode is rigid shin parenting. It does not add a separate animated ankle
flexion or heel-roll control, change garment ownership, or redraw missing
cloth. Those would be explicit later features rather than hidden adjustments
to existing motion keys.

The [Theo actual-export review](THEO_ANKLE_FOLLOW_REVIEW.md) records the concrete
registration, before/after animation and compatibility verification.
