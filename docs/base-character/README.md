# Base character: review files

Open **Skin Studio → Open base model**. Toggle **Bones** or **Skeleton only**;
choose **Idle / Walk / Run / Jump**, direction and expression. Undo restores
the prior project. The plain vest, shorts and bare limbs are intentional:
inspect the body before adding elaborate clothes or hair.

- [Four actions, right, 2× GIF](final/four-actions-right-2x.gif)
- [Four actions, left, 2× GIF](final/four-actions-left-2x.gif)
- [Native overview](final/four-actions-1x.png) · [2× overview](final/four-actions-2x.png)
- [Bones overlay](final/four-actions-bones-2x.png)
- [Expressions](final/expressions-2x.png)
- [Run keys, native](final/run-keyframes-1x.png) · [2×](final/run-keyframes-2x.png)
- [Walk keys](final/walk-keyframes-2x.png) · [Jump keys](final/jump-keyframes-2x.png)
- [First → final, matched application exports](final/first-final-2x.png)
- [Editable project](final/base-character.rig.zip)
- [Independent CharacterPack](final/base-character.character.zip)
- [Closed-editor player evidence, right](final/base-character/independent-run-right.png)
- [Current browser verification](final/evidence-index.json)
- [PNG / GIF / ZIP decoding checks](final/artifact-validation.json)

Separate `idle`, `walk`, `run`, `jump` GIFs are available in `final/`, in both
directions and at 1×/2×. The individual jump GIF and exported action play once.
The four-panel comparison explicitly replays jump every two seconds for review;
other actions retain their own manifest timing. All motion is in place.

The `.rig.zip` retains anatomy, attachments, three expressions, material masks,
three clothing items and editable clips. Use it to continue authoring. The
`.character.zip` is a baked playback package, not a replacement for the project.
See [implementation review](../BASE_CHARACTER_REVIEW.md) for the scope and limits.
