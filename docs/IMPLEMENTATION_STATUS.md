# Implementation status

Current batch: **Kling-only workspace cleanup**, based on merged main `158efad`,
branch `refactor/kling-only-workspace`.

The active project contains two original Kling characters and one independently
editable male skeletal candidate. Original playback remains the approved visual
baseline. Source assets, frame timings, native resolution, alpha and existing
export archives are retained unchanged.

Implemented:

- Original male/female idle, walk, run, jump and celebrate, comparison and portable V3 export.
- Male native skeletal candidate: fifteen parts, four static poses, joint edits,
  undo/reset, project save/reopen, PNG and V2 still-pack export.
- Three primary navigation destinations; prominent male skeleton button.
- Independent V2/V3 and Kling source ZIP loader, local validation and HTTP SHA fallback.

Removed from the active tree: classic pixel-art characters, generated travelers,
Theo/Denim/Coral/roster variants, old skin/identity/wardrobe authoring, earlier
redrawn mother studies, their samples, experiments, tests and documentation.
These are recoverable from the pre-cleanup commit. Shared geometry and native
pack validation remain because the Kling implementation depends on them.

Not implemented: female skeleton, interchangeable outfits/expressions on either
Kling character, complete skeletal animation cycles, or production game integration.
The male pose candidate's documented visual defects have not been disguised by
this cleanup.

[Current scope and verification](KLING_FOCUS_REVIEW.md) ·
[Original source playback](KLING_JUMP_REVIEW.md) ·
[Native candidate](KLING_NATIVE_STUDY_REVIEW.md).

Historical Kling review folders retain source/provenance and visual evidence.
Their older test counts describe previous commits, not this cleanup run.
