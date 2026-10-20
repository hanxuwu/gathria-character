# Reference mother source record

Prepared on 19–20 October 2026 UTC. This is an independent candidate, not a
replacement for the V6 Studio default or the earlier base character.

## References and selection

The user supplied the Kling MP4 and displayed **Bald Chibi Character on Green
Screen.png** in the conversation. The PNG's local desktop path was not accessible
in this cloud workspace: its original file bytes are **not** archived here. It
was visually available to the image-generation call as a conversation image.
The original MP4 is retained as `reference-video.mp4`:

- SHA256: `ca1737b97dfc1bc91a1f24636a42bc6919f0a2f002975bf907cb49486779cc5a`
- 1920 × 1080, 24 FPS, 361 frames, 15.041667 seconds.
- Fixed shape reference: frame 348 at **14.50 seconds**. It has open eyes,
  a stable full standing contour and approximately 2.4 heads of total height.
- Pose references: walk 0.60 s, run flight 4.25 s, celebration 11.50 s.
  Their changing anatomy is not copied into the fixed master.
- `video-audit.json` and `.md` preserve the extraction and selection record.

## Development-time image generation

Three OpenAI image-generation calls were made. No runtime API is used.

| Original output             | Exact prompt              | Reference and purpose                                                                         |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `master-initial.png`        | `master.prompt.txt`       | Conversation PNG and extracted standing reference; one coherent full-body transparent master. |
| `master-cleanup-output.png` | `cleanup.prompt.txt`      | Edit of the first master to clean the alpha background while retaining the drawing.           |
| `hidden-parts.png`          | `hidden-parts.prompt.txt` | Local `master.png`; supplemental torso, arm, shorts and leg paint for occluded joints.        |

`master.png` is an exact copy of `master-cleanup-output.png`. All generated
outputs are retained unchanged, including low-alpha residue in their original
background. The clean deliverable is `../prepared/master-hd.png`.

The source figure is a new reference-guided illustration. Hidden shoulder/hip
coverage is **newly painted**, not an accurate recovery of original video layers.
Some supplemental cells are retained for future work but are not used in this
candidate. The visible original master pixels remain authoritative.

## Offline preparation

`scripts/prepare-reference-mother.py` normalizes the near-opaque interior,
removes detached alpha residue around the main character while retaining a
2-pixel antialiased fringe, and zeroes transparent RGB. It records semantic
vest/arm/shorts boundaries; it never deletes a global clothing or skin color.
Painted hidden caps are registered beneath the visible original regions.

The full 1024 × 1536 master and all 15 HD part canvases are kept. One uniform
0.1555 source-to-runtime scale fits the approved figure into 192 × 256 with
anchor (96,240). The head and limbs are not separately squeezed into an old body.
Every HD part has bounds, pivot, parent and registration in
`../prepared/layer-registration.json`. Whole continuous limbs are downsampled
before the native upper/lower split, preventing bright resampling lines at
elbows. The existing native renderer uses binary alpha and nearest-pixel mesh
sampling; the HD source retains soft antialiasing.

`compile-reference-mother.mjs` writes a normal Skin V1 / authoring V1 project,
the actual rig and four explicit static poses. Hands remain separate in the HD
assets but are compiled into forearms for the existing two-bone renderer. The
three required head slots deliberately contain the **same neutral face**; three
authored expressions are not claimed. Face/vest/shorts paint is not yet a set of
independent expression and wardrobe layers.

Source binary and prompt SHA256 values are retained in
`../prepared/layer-registration.json`; final input hashes and decoded-file
checks are in `../../../docs/reference-mother/final/evidence-index.json`.
