# Raised wedding sleeves, PR62 revision 2

The earlier wedding bank ended several raised sleeves with a flat rectangular
edge against the hand. This revision fits an actual painted raised-arm sleeve
and curved ivory cuff to the same source poses. The new donor supplies cloth
RGB and its cuff outline only. None of its generated body, head, hands, skin,
shoes or background enters the character.

The exact changed top-frame IDs are **63–66, 74–80 and 97–101**. The other 91
original top frames are pixel-exact. The bottom base is unchanged. This operation
never edits source frames, source anchors, registration, animation timing, daily
banks or appended poses 107/108. Those appended poses are bound separately.

The donor's curved cuff releases old garment ownership where the old rectangular
patch covered the source wrist/hand. All released pixels restore the exact source
RGBA. Frame 78 also closes one fully enclosed 32-pixel skin-classification hole
inside the jacket with painted sleeve cloth. Every registered head/hand pixel is
exact, and all changes are bounded by the audited sleeve domain or that hole.
Source edges and conservative protection remain visible in a few legacy poses;
this is a bounded sleeve improvement, not a full cleanup of the source video.

`generation.json`, `donor-prompt.txt` and `raised-arm-donor.png` preserve the raw
source and exact prompt. `reference-source-75.png` is the source pose supplied
to image generation. `raised-sleeve-cloth-only.png` and `raised-sleeve-mask.png`
show the actual sampled cloth. `recipe.json` and the script record its trace,
cloth-space controls, manual target controls and ownership rules.

Reproduce from the immutable PR62 V1 base stored in commit `f67235d`:

```sh
python scripts/prepare-landing-side-wedding.py \
  --refine-raised-sleeves --output /tmp/landing-sleeve-refine/reproduce
```

An explicit `--baseline-top PATH` accepts the same V1 ZIP and checks its SHA256.
Pillow, numpy and scipy are required. The command generates a complete 107-frame
top bank, checks strict garment lint, decodes the packed bank and compares every
frame to the intended native patches. The final 109-frame binder then rebinds
this base and appends the separately authored landing poses.

`audit.json` records the baseline/result hashes, exact changed and unchanged
frame lists, per-frame PNG/pixel hashes, protected-pixel checks, ownership edits
and strict lint results. `patches/` contains the exact 16 full-native top patches
and binary-alpha ownership PNGs. The final base SHA256 is
`091b163020b4a3552f43a7be3d9b6aee61a89569329ed69555beff1bf55a2bd0`.

Review `75-comparison-2x.png` and `78-comparison-2x.png` for the clearest same-frame
comparisons. `contact-0.png` through `contact-3.png` show all 16 source/before/after
poses at native scale. `jump-before-after-24fps.gif` compares the full original
50-frame jump at 24 fps (GIF timing quantized to 10 ms, total 2,080 ms). This GIF
is visual evidence, not a runtime asset.
