# Gathria runtime compatibility: UNVERIFIED

The independent player demonstrates portable CharacterPack V2/V3 playback. It
does not establish compatibility with the production Gathria game runtime.
That integration has not been exercised against an inspected game revision.
The old speculative V1 adapter was removed with the unrelated character system.

The current player samples exported native PNG frames, honors frame order,
timing, loop/one-shot behavior, atlas pages, anchors and facing metadata, and
supports smooth-alpha artwork. It imports no authoring UI or character generator.
The original Kling pack exports retain their original bytes. Native skeletal
stills export a separate V2 pack with explicit derived provenance.

Before production integration, inspect the game's actual loader, texture limits,
filtering and animation contract. Load both real exported original packs and a
native still pack, check every supported action and facing, and record the game
revision and visual evidence. Until then compatibility remains unverified.
