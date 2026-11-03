# CharacterPack V3: baked wardrobe playback

Load manifest.json, character.json and every declared spritesheet PNG. Page 0 is spritesheet; additionalSheets, when present, follow in order. Each frame uses its explicit page and native rectangle. Preserve the frame-relative anchor and aspect ratio. Exported frames are RGBA with smooth transparency; scale.pixelArt=false.

Play action frame IDs in their listed order at the declared FPS. Repeated IDs are intentional holds. Respect loop=false for one-shot actions, and disable missing actions. Native view is right; left mirrors the complete character around the anchor. The original authored in-frame movement and optional motionFlow metadata are retained. Do not independently recenter clothing or normalize jumping frames.

Clothing is already composited into these PNGs. capabilities.editableAppearance=false is intentional: this ZIP is standalone playback, while a gathria-wardrobe-project ZIP contains the original source, registration and editable garments. This pack does not depend on that project, the editor, a skeletal renderer or a model API. Provenance in character.json distinguishes original video artwork from authored garment patches.

Limits: up to 4 sheets, 8192 pixels per dimension, 128 Mi decoded pixels total, 1024 frame cells, 64 MiB CharacterPack ZIP and 256 KiB per text file.

This pack also contains baked head appearance. Render the exported padded dimensions and translated anchor; do not use the source frame geometry. Source body scale, native frame cadence and source-frame mappings are preserved; the gameplay profile selects the basic action clips. The original CharacterPack is retained in the editable project.

Gameplay profile: kling-female-side-single-jump-v5. The manifest jump is a single non-looping jump; sourceMetadata.gameplayMotion provides the source-bound transition routes. A jump request during idle/walk/run remembers that locomotion state. Ignore repeated jump requests through takeoff, flight and landing recovery. Complete the jump up to the selected target-specific landing exit, then return to the latest requested locomotion (or the previous one). Use each route's source exit/target entry tick and preserve fractional clock carry. Frame pixels and atlas IDs are unchanged. Existing sourceMetadata.motionFlow, when present, is legacy source playback; gameplayMotion takes precedence.

A route may declare leadIn: ordered native atlas frame IDs that play before its target entry. Render every leadIn frame once at the target action FPS while its main clock remains frozen at entry; then continue the target clip from that entry, preserving fractional time. Run-to-Jump leadIn is takeoff preparation; Jump-to-Run leadIn is landing recovery. Do not count recovery drawings toward a complete resumed run cycle or accept another Jump during recovery. Lead-ins are contextual transitions, not additions to the standalone action clips.
