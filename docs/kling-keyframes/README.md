# Review the selected loop candidates

The two original Kling characters remain the defaults. This separate candidate
keeps **52 distinct source drawings per character** and repeats all five actions.
No artwork was generated or changed. Jump is a **continuous crouched hop**;
the original full jump still plays once and ends upright.

## Open in the app

Run `npm ci` and `npm run dev`, then open a character from the library. In the
Sprite actions workspace, click **Review keyframe loops**. It opens a separate
player tab. Both character choices in that tab use the candidate set.

Direct paths on the running app:

- `/player.html?kling=male&variant=keyframes`
- `/player.html?kling=female&variant=keyframes`
- Add `&authoring=1` to inspect, trim, save and reopen a candidate action project.
- `/player.html?kling=male` or `female` returns to the unchanged original.

Choose **Export CharacterPack** in the independent player, or download
[male.character.zip](exports/male.character.zip) and
[female.character.zip](exports/female.character.zip). Both load in the independent
player with no editor. Clothing and expressions remain baked into the images.

## Actual exported comparisons

Each GIF shows the **source at left, selected frames with holds at right**,
using the same fixed canvas and anchor at 0.5× native size. Jump compares the
same trimmed source hop with the reduced hop; it does not pretend the full
original 39-frame jump loops. GIFs use a limited palette and centisecond delays;
native ZIP pixels and 24 FPS metadata are authoritative.

| Action    | Male                                                                                                                       | Female                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Idle      | [Right](review/male-idle-right.gif) · [Left](review/male-idle-left.gif) · [Keys](review/male-idle-keys.png)                | [Right](review/female-idle-right.gif) · [Left](review/female-idle-left.gif) · [Keys](review/female-idle-keys.png)                |
| Walk      | [Right](review/male-walk-right.gif) · [Left](review/male-walk-left.gif) · [Keys](review/male-walk-keys.png)                | [Right](review/female-walk-right.gif) · [Left](review/female-walk-left.gif) · [Keys](review/female-walk-keys.png)                |
| Run       | [Right](review/male-run-right.gif) · [Left](review/male-run-left.gif) · [Keys](review/male-run-keys.png)                   | [Right](review/female-run-right.gif) · [Left](review/female-run-left.gif) · [Keys](review/female-run-keys.png)                   |
| Jump      | [Right](review/male-jump-right.gif) · [Left](review/male-jump-left.gif) · [Keys](review/male-jump-keys.png)                | [Right](review/female-jump-right.gif) · [Left](review/female-jump-left.gif) · [Keys](review/female-jump-keys.png)                |
| Celebrate | [Right](review/male-celebrate-right.gif) · [Left](review/male-celebrate-left.gif) · [Keys](review/male-celebrate-keys.png) | [Right](review/female-celebrate-right.gif) · [Left](review/female-celebrate-left.gif) · [Keys](review/female-celebrate-keys.png) |

Native 1× jump wrap comparisons: [male](review/male-jump-wrap-1x.png) ·
[female](review/female-jump-wrap-1x.png). The upper row illustrates the rejected
forced wrap of the original one-shot; the lower row is the repeated-hop candidate.

[Actual editor, independent-player screenshots and continuously observed seams](browser/README.md).

## What to judge

Check contact/flight readability, the return from the final pose to the first,
and whether the held poses feel acceptable at normal playback speed. The hop
seam retains a small arm/torso change; source blur, walking torso rotation and
slight jump-apex scalp clipping remain. This is a review candidate, not a claim
of perfectly seamless animation or completed wardrobe support.

[Selection method and provenance](../../artwork/kling-keyframes/README.md) ·
[Implementation, counts and limitations](../KLING_KEYFRAMES_REVIEW.md) ·
[Current verification](verification-results.json).

Reproduce after installing `artwork/requirements.txt`:

```sh
python3 scripts/compile-kling-keyframes.py
python3 scripts/render-kling-keyframes.py
CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-kling-keyframes.mjs
```
