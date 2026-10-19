# Incomplete first capture: material-coordinate check

This directory preserves a stopped diagnostic capture. It is **not** the final
review delivery, and its partial exports do not imply that Nora or independent
playback was verified during this attempt.

The Studio successfully imported/exported three identities and four garments;
Ravi and Lina exported real neutral/recolored packs. The capture then stopped
at the Lina recolor assertion. The harness used a raw shoe mask at an assembled
coordinate, ignoring the existing ankle/sole fitting transform. For example,
assembled `(105,233)` samples source `(105,232)`, material 5, rather than the
material-0 source pixel at `(105,233)`. All 105 mapped fixed far-shoe pixels
remain exactly their source RGBA. No runtime or artwork correction was needed.

- `capture.log` and `failure.png`: actual failure and UI state.
- `capture-status.json`: incomplete scope and diagnosis.
- `material-mapping-diagnosis.json`: independent four-shoe audit.
- `mapped-ownership-recheck.json`: focused rerun against these actual exports,
  including base-shoe fitting and inherited shin overlap. Every opaque pixel
  retains an explicit source owner; fixed RGBA checks are preserved.
- `file-integrity.json`: decode/CRC inventory of these partial files. Integrity
  is distinct from completion of the aborted browser workflow.

The complete rerun is in `../../final/`. Its execution record distinguishes
this harness failure from the later full verification.
