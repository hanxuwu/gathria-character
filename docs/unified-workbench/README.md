# Unified character workbench

This change consolidates the editing experience around the two approved Kling
characters. It does not redraw them, retime their actions, change their clothing
or convert sprite animation into skeleton animation.

## Open and use

1. Open `/` and choose **编辑人物** on either character card.
2. **人物素材 → 原版 · 三分之四视角** retains the original sprite editor and
   **Wardrobe**. The original family has idle, walk, run, jump and celebrate.
3. **人物素材 → 侧视 · 横版动作** opens the side stage. Choose **角色** and
   **服装组** there. The material and tailored collections are separate projects;
   each keeps its own selection, motion position and open fitting work.
4. **检查穿帮 · 逐帧审阅** locates a problem. **服装校正 · 锚点与遮挡** reviews
   and repairs it. Changing a fitting pose now also positions the main stage and
   the PNG/action GIF export. Moving the stage updates an unlocked fitting panel.
5. Save the editable project in its current tool. Export PNG, GIF or CharacterPack
   for playback. The standalone `/player.html` remains available independently.

The source selector changes the available drawings; it is not a camera rotation.
Clothes, hair and anchors are not automatically transferred between source
families or registration revisions.

## Retained tools and compatibility

- Top navigation remains **Character library / Workbench / Player**.
- Every character card has one primary entry instead of six competing entries.
- Existing `mode=wardrobe`, `mode=themes`, `mode=rig`, `mode=side-view`,
  `collection=material|tailored` and `study=kling-male|kling-female` links still
  open the relevant workspace. They are normalized without reloading the page.
- Original action editing, timing, clothing/appearance, pixel conversion,
  comparison and export tools retain their existing implementations.
- **Character themes** and **Male/Female skeleton** are advanced tools in the
  common shell. Themes contain complete baked looks with their own resolutions
  and timing. Skeletons remain independent candidates with four static poses.
- New tools initialize from the visible character. Previously visited tools
  retain their own loaded document rather than silently replacing it.
- Project imports update the displayed identity without remounting that editor.
  Project, garment, source, theme and CharacterPack formats are unchanged.
- Switching a source/tool does not save to disk. Reloading or leaving the page
  still requires saving projects and any portable correction drafts first.

## State and lifecycle

`src/workspace/Workbench.tsx` now owns both original and side-view entry paths.
`SideWorkspace.tsx` lazily retains up to four side sessions. Stable slot keys are
separate from loaded document identities, so importing the other character does
not erase an open draft or mistake its source for the previous one. Navigation
prefers an already-open matching character/collection. If cross-imports occupy
all four slots with duplicate identities, a fifth context is refused with a
save/reopen message instead of overwriting work.
When multiple loaded projects share an identity, **已打开的侧视项目** lists
their stable project numbers so each imported copy remains reachable.

Only the active side session schedules animation frames or handles movement
keys. Retained correction and candidate dialogs leave the browser's modal layer
while inactive, preserving their data and pausing candidate animation. No hidden
time is added when the candidate resumes. Material is still loaded on demand.

Fitting changes use an explicit pose callback, not an effect that can echo the
same change back and forth. During a local edit, candidate preview or audit, the
parent pose/material/export controls are temporarily locked. This prevents a
correction from being applied or exported against a different pose. Applying or
closing the candidate releases the lock. Other workbench tools remain separate
retained sessions.

The retained local correction draft guarantee applies to the side workflow.
The original wardrobe keeps its existing behavior: switching away closes its
temporary modal tools, while its main project and styling history stay open.

## Validation

The implementation baseline is `3c525729f3f96d81141993a7ab933602df2dc635` from
the previous refinement PR. Current-run results and screenshots are recorded
in [verification.md](verification.md). Historical refinement reports are not
counted as tests of this change.

This is a workflow consolidation, not a new artwork revision. Existing difficult
jump-pose neckline/armhole limits remain; see
[the previous actual-artwork review](../kling-side-refinement/README.md).
