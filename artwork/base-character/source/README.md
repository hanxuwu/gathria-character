# Base character source

One development-time OpenAI image generation call created `model-sheet.png`
from the existing registered bald neutral head. The exact prompt, reference,
date and SHA256 inventory are in `model-sheet.prompt.txt` and
`generation-record.json`. The original PNG is retained. No runtime image API
is used. The generated complete character in the upper-left cell is a source
guide only; review evidence comes from the application export.

Production uses the separate torso, arm, hip/short, leg and shoe cells.
`scripts/prepare-base-character.mjs` records crop boxes, source landmarks and
destination joints in `../prepared/registration.json`. Source alpha >= 210 and
the largest connected component per isolated part remove transparent fringe
and disconnected debris. Nearest-neighbor registration keeps binary output
alpha. Arms and legs retain continuous source painting across the overlapped
upper/lower slot boundary, before the existing renderer builds their mesh.
Generated bare feet below the source ankles are excluded; independent shoes
own no skin. The fixed hip part has a rounded lower boundary, while both short
hems belong to their moving thighs. This is source-specific registration, not
a general-purpose automatic segmentation algorithm.

Material ownership is baked offline: bare limbs are skin; shoes are shoe;
the known torso/shorts cells distinguish warm skin from their sage/slate cloth
using their source-specific palette. Runtime recoloring reads the resulting
semantic bytes and never infers ownership from RGB.

All three production heads and their masks are reused from
`artwork/standard-kit/prepared/identities/shared-face/` (hashes recorded).
No new face was cut from this source sheet. Source-relative colors preserve
the original head and body painting at their source colors.

The source legs are straight. There is no authored bent-knee corrective,
muscle simulation or universal body/clothes fit. Existing renderer, historical
art and other projects' motions are unchanged. This base remains a 2D,
three-quarter-view template with mirrored left-facing playback.
