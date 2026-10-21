# Review motion and transitions

This candidate restores moving poses that looked stepped in the 52-drawing
study, and waits for reviewed support/landing poses when changing actions.
It uses only the approved existing Kling male/female artwork.

## Open it

Run this branch with `npm ci` and `npm run dev`. Open either library character,
then choose **Review motion & transitions** in the Sprite actions workspace.
Direct paths on the running app:

- `/player.html?kling=male&variant=motion`
- `/player.html?kling=female&variant=motion`

During playback, click Walk, Run, Jump or Idle. A `Next:` message shows a queued
action until the reviewed exit. Jump finishes its full recovery and returns to
Idle if nothing else is queued. Toggle **Wait for a matching pose** to compare
instant cuts. Pause before selecting an action for immediate frame inspection.

The original playback remains the default. The visible **continuous-hop study**
link opens the previous all-loop candidate. The new motion candidate's Jump is
a full one-shot; these behaviors are deliberately separate.

Download [male.character.zip](exports/male.character.zip) or
[female.character.zip](exports/female.character.zip). Import either into
`/player.html` to use it independently. Add `&authoring=1` to a motion URL to
save/reopen or edit its action project. Edited clip settings disable stale
transition routes; source images remain unchanged.

## Compare actual exported frames

GIFs show **before at left, after at right**, at normal playback speed with the
same fixed canvas/anchor and half-native display size. The four looping actions
compare the earlier keyframe candidate with restored poses. Jump instead shows
the unchanged full original beside the new full-jump clip, **playing once**.
Actual automatic return and queued action changes are in the browser evidence.

| Action    | Male                                                                                                                       | Female                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Idle      | [Right](review/male-idle-right.gif) · [Left](review/male-idle-left.gif) · [Keys](review/male-idle-keys.png)                | [Right](review/female-idle-right.gif) · [Left](review/female-idle-left.gif) · [Keys](review/female-idle-keys.png)                |
| Walk      | [Right](review/male-walk-right.gif) · [Left](review/male-walk-left.gif) · [Keys](review/male-walk-keys.png)                | [Right](review/female-walk-right.gif) · [Left](review/female-walk-left.gif) · [Keys](review/female-walk-keys.png)                |
| Run       | [Right](review/male-run-right.gif) · [Left](review/male-run-left.gif) · [Keys](review/male-run-keys.png)                   | [Right](review/female-run-right.gif) · [Left](review/female-run-left.gif) · [Keys](review/female-run-keys.png)                   |
| Jump once | [Right](review/male-jump-right.gif) · [Left](review/male-jump-left.gif) · [Keys](review/male-jump-keys.png)                | [Right](review/female-jump-right.gif) · [Left](review/female-jump-left.gif) · [Keys](review/female-jump-keys.png)                |
| Celebrate | [Right](review/male-celebrate-right.gif) · [Left](review/male-celebrate-left.gif) · [Keys](review/male-celebrate-keys.png) | [Right](review/female-celebrate-right.gif) · [Left](review/female-celebrate-left.gif) · [Keys](review/female-celebrate-keys.png) |

Reviewed transition poses: [male](review/male-transition-poses.png) ·
[female](review/female-transition-poses.png).

[Actual browser flow comparisons and independent playback](browser/README.md) ·
[Implementation, counts and limits](../KLING_MOTION_REVIEW.md) ·
[Verification](verification-results.json) ·
[Source selection and provenance](../../artwork/kling-motion/README.md).

There are 88 distinct male drawings and 96 female drawings. Clothing is still
baked into each image. Source blur, torso-angle variation, scalp clipping at the
jump apex and missing neutral transition drawings remain; the candidate is not
a claim of perfectly seamless animation or completed wardrobe support.

Reproduce after installing `artwork/requirements.txt`:

```sh
python3 scripts/compile-kling-motion.py
python3 scripts/render-kling-motion.py
CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-kling-motion.mjs
```
