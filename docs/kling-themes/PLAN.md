# Character theme iteration

Baseline: `774ebfa856ecf8cabf8c9cbce8f6a6ce883faff5` (draft PR #39, retained).
Branch: `feat/kling-character-themes`. This batch does not merge prior work.

1. Audit exact source, wardrobe, appearance, scaling and export contracts.
2. Establish an independently authored pixel theme art direction for both Kling identities. Preserve original assets; retain rejected trials and provenance.
3. Produce actual pose drawings for idle, walk, run, jump and celebrate, then inspect temporal/identity consistency. No image filter is presented as new artwork.
4. Add a bounded, versioned theme envelope with exact pack hashes and semantic look compatibility. Baked look variants and independently interchangeable clothing are distinct capabilities.
5. Add an explicit authored-pixel CharacterPack version; old smooth V2/V3 behavior stays reproducible.
6. Integrate theme selection, action/facing controls, native/integer preview and a comparison using each theme's own anchor and normalized action phase.
7. Preserve accepted theme on failed/canceled imports and prevent silent outfit substitution. Returning to original must restore exact original bytes.
8. Save/reopen self-contained theme sessions; export native PNG, timed GIF and selected CharacterPack with exact metadata.
9. Test malformed assets, switching races, missing looks/actions, both characters and independent playback; inspect actual generated/exported drawings and iterate defects.
10. Publish review animations, source provenance, executed checks, limitations and a new draft PR. Do not claim user visual approval or unlimited automatic style conversion.

Implementation is parallelized across pack compatibility, theme contract, UI and asset preparation. Original wardrobe and skeleton workspaces remain separate and unchanged. New theme look variants must contain matching art for a supported outfit; unavailable variants are shown explicitly. A one-shot jump is not forced into a seamless loop.
