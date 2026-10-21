# Full male outfit garment reference

`designs.png` was made with the OpenAI image-generation tool on 2026-10-21,
using `artwork/kling-native-study/source/reference.png` as the visual reference.
The exact prompt is saved in `prompt.txt`. The two designs are a teal short-sleeve
camp shirt with ochre chinos and a navy wedding jacket/ivory waistcoat/coral tie
with navy full-length trousers.

This is a **garment authoring reference**, not application output. Generated
faces, necks, skin, limbs, shoes and backdrop are discarded. The two characters
in this source sheet are not accepted replacements for the approved Kling body.
The tool was asked for transparency; the delivered image contains partial alpha
and a tinted backdrop. Offline fitting therefore samples only RGB from explicitly
traced clothing contours and supplies separate native-pose ownership/alpha.

`prepare-kling-male-tops.py` and `prepare-kling-male-trousers.py` document their
clothing-only donor coordinates. Hidden fabric completion is derived from
nearby painted cloth. Source-visible limb ownership comes from the exact male
authoring kit and recorded garment-local corrections, not recovered original
layers. These are offline preparation steps; the browser composes complete
source-bound pose banks locally and does not call an image API.

The immutable source poses, body proportions, head/hand pixels, frame cadence,
facing convention and anchor continue to come from the original Kling source
pack. New item IDs keep existing saved garments and exported packs reproducible.
Only actual application exports count as integration/visual review evidence.
