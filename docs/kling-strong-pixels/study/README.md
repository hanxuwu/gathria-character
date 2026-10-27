# Strong pixel authoring study

This is an **offline API conversion study**, not production browser evidence.
Inputs are the exact composed male wedding and female everyday CharacterPacks
saved through the application in the preceding pixel-refinement batch. No new
character artwork, anatomy, poses or timing were generated.

Three candidates retain those complete frame banks:

| Candidate  | Sampling                                     | Shared colors         | Finish                                     |
| ---------- | -------------------------------------------- | --------------------- | ------------------------------------------ |
| `legacy4`  | Detail, one output pixel per 4×4 source cell | 128                   | Existing v1, unchanged                     |
| `plain6`   | Detail, one output pixel per 6×6 source cell | 96                    | None                                       |
| `cluster6` | Same 6×6 source cells                        | Same 96-color palette | One conservative shade-island cleanup pass |

**Selection:** retain the existing 4:1 default. Offer 6:1 / 96 colors with the
optional cluster finish as a stronger-pixel candidate. The stronger grain comes
primarily from the lower native resolution; the cleanup itself is subtle and is
not a successful redesign of hair highlights, fabric folds or silhouette lines.

## Actual probe pixels

- Native-size comparison: [male](male-wedding-native.png) · [female](female-everyday-native.png).
- Equal displayed scale, run position 0: [male](male-wedding-run-0-same-display.png) · [female](female-everyday-run-0-same-display.png).
- Equal displayed scale, female jump position 19: [comparison](female-everyday-jump-19-same-display.png).

The equal-display boards use integer **2×** enlargement for the 4:1 candidate
and **3×** for the 6:1 candidates. Both therefore show the same source-space
scale without interpolation. Native boards intentionally retain differing output
sizes. All panels are lossless decoded candidate PNGs; labels and a matte are
presentation only. They are not newly captured application exports.

Visual inspection of these poses found coarser, more legible pixel grain at 6:1
and only small differences between plain and cleaned 6:1. No obvious new joint
seam was visible in these inspected poses. Existing source motion blur, gray
neckline remnants and garment contour steps remain. This does not certify every
pose, every continuous transition or user visual acceptance.

## Cleanup and limited motion findings

The `supported-shade-islands-v1` pass can change only an isolated 8-connected
one- or two-pixel color component surrounded by opaque pixels. It chooses an
existing low-contrast palette color supported by at least two thirds of the
component's unique boundary neighbors and at least two cardinal contacts. Dark
ink, high-contrast boundaries, connected strokes and transparency-adjacent pixels
are protected. Decisions read the original buffer; writes never cascade.

Independent checking of all target frames found exact alpha and transparent
RGBA preservation, no colors outside the unchanged shared palette, and RGB
channel changes at most 28. Cleanup changed 2,760 male pixels (0.424% of opaque
pixels across the bank) and 1,640 female pixels (0.184%). It does not redraw or
move any silhouette edge.

The diagnostic below uses the same eligibility for plain/cleaned 6:1: a fixed
screen pixel with mean source alpha at least 240 at both endpoints, source
alpha-weighted RGB change no greater than two channel values, and both outputs
opaque. An output RGB jump is a maximum channel change of at least 12. All 16
run transitions, including last-to-first, are included. It is **not optical-flow
correspondence or a perceptual flicker score** and excludes most moving details.

| Look            | Eligible / visible-union coverage | Plain 6:1 jumps | Cleaned 6:1 jumps |
| --------------- | --------------------------------- | --------------: | ----------------: |
| Male wedding    | 14,746 / 11.60%                   |             112 |               115 |
| Female everyday | 14,684 / 9.09%                    |             134 |               135 |

These small increases are retained honestly: the cleanup is **not a measured
temporal-stability improvement**. Its low-contrast changes are limited and it
stays optional. No temporal blending, head locking or altered playback schedule
was used to hide the difference. The 4:1 candidate has a different native grid
and is not assigned a directly comparable jump count in this table.

[analysis.json](analysis.json) records every run transition and all per-frame
cleanup counts. [selection.json](selection.json) binds source inputs, candidate
ZIPs, reports, helpers and retained figures by SHA-256. The six reports contain
the exact palettes, fixed mapping, action-preservation declarations and cleanup
counts.

## Reproduce

The large source ZIPs and six probe packs/GIFs are retained under the temporary
paths recorded in `selection.json`; they are intentionally not duplicated in
Git. A fresh clone needs the two source archives with the recorded hashes.
The preceding batch's `docs/kling-pixel-refinement/evidence/final-v1/` records
prove these were actual application downloads, but those JSON records alone do
not reconstruct the missing binary inputs.

With matching inputs, installed project dependencies and Python with Pillow and
NumPy, run from the repository root:

```sh
PIXEL_STUDY_SOURCE_DIR=/tmp/kling-pixel-refinement/final-v1 \
PIXEL_STUDY_DIR=/tmp/kling-strong-pixels/study-reproduction \
node docs/kling-strong-pixels/study/run-study.mjs

PIXEL_STUDY_SOURCE_DIR=/tmp/kling-pixel-refinement/final-v1 \
PIXEL_STUDY_DIR=/tmp/kling-strong-pixels/study-reproduction \
/tmp/kling-polish-venv/bin/python docs/kling-strong-pixels/study/analysis.py
```

The conversion helper checks exact input and candidate ZIP hashes. A mismatch
must be investigated as a version/provenance change, not silently relabeled as
this retained study. Timing measurements may differ. `analysis.py` reconstructs
the eligibility independently from source RGBA; it does not invoke the TypeScript
converter for its checks.

`capture-run-original.mjs`, `capture-entry-original.ts` and `run.log` retain the
small original capture helper sources/log. Their absolute paths describe that
historical local run. The portable helper above adds output-directory controls
and hash checks without changing the conversion algorithm.

[Reproduction check](reproduction.json) matched all six candidate ZIP hashes, the
independent analysis JSON and all five retained figures exactly. This check is
specific to the offline study and is separate from production browser evidence.
