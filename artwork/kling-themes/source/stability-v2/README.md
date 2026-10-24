# Pixel motion continuity trials

These are **new image-generation edits of the retained pixel sprite sheets**.
They are not source-video extraction and do not inherit the original Kling
video's visual approval. Every PNG has an adjacent `.generation.json` recording
the exact edit prompt, referenced image, tool, transparent-background request and
output SHA256. Original sheets remain unchanged one directory above.

The requested correction is consistent skull/face perspective, neck connection
and head-to-body proportions across an existing motion cycle. Limb pose order,
outfit design and rendering style are retained as closely as the tool permits.
This is whole-character authored art; there is no separately pasted head,
runtime smoothing, geometry stretch or generated in-between frame.

## Trial decisions

| Trial | Decision | Observed result |
| --- | --- | --- |
| `male-walk-stable-v1.png` | Superseded by the second trial | Much steadier face perspective; a smaller but still visible first/second half-stride height mismatch remained. |
| `male-walk-stable-v2.png` | Selected for the V2 recipe | Matched face/ear/skull model. With the support soles registered to the common ground, native crown range falls from 9 px to 3 px; a roughly 3 px half-stride height difference remains. |
| `female-run-stable-v1.png` | Selected for the V2 recipe | More consistent face perspective and opposite-stride head heights. Complete shoes require the reviewed 530 px row gutter rather than blindly slicing at 512 px. |
| `male-run-stable-v1.png` | Rejected | Facial detail becomes a little more consistent, but grounded crown range rises from 7 to 8 native px and the maximum cycle step from 6 to 8 px. The previous bank with horizontal registration is preferable for the user's wobble complaint. |
| `male-wedding-run-stable-v1.png` | Rejected | The registered crown range and maximum adjacent step increase. Small changes to facial/hair consistency do not justify a worse complete-body motion trajectory. The original wedding run is retained. |
| `female-wedding-run-stable-v1.png` | Selected for the V2 recipe | Crown range and maximum adjacent step both decrease from 5 to 4 native px while retaining the established braided crown, dress, pose order and timing. This is a modest improvement, not elimination of authored-frame variation. |

The operative sources, exact crops, translations and generation-record hashes
are in the V2 recipes in the parent directory. The table describes authoring
trials; application-exported PNG/GIF evidence is kept in the delivery documents.

## Measurement limits

Crown height is a useful registration diagnostic, not a complete measure of
animation quality. A running character should retain intentional body rise and
fall, and visible foot contacts must remain grounded. Pinning the crown by moving
the entire body upward would make the soles float. Changes in face angle, eye
position, hair volume and garment folds also need visual review.

The source sheets may retain nonzero RGB values in alpha-zero pixels. A viewer
that ignores alpha can show a brown haze; production preparation retains the
actual RGBA and reviews the visible artwork on a neutral matte.
