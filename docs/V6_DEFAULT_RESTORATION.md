# Restore V6 as the default after V7 review

The user judged V7 worse than V6. V7 is an unaccepted visual iteration, not the recommended artwork. The review exposed a disproportionate, narrow groom neck and a more exposed bride shoe/hem silhouette that weakened the long gown. Passing technical checks did not establish visual improvement.

The studio now starts with the exact existing V6 configuration and presets; the main independent-player example loads the preserved V6 wedding ZIP. V1–V5 configurations can explicitly create a V6 polished copy. Opening any V1–V7 file keeps its original version and pixels. V7 has no automatic downgrade path, remains available through saved files and a secondary player example, and retains its source art, generator, original comparisons and commits. No artwork or export files were regenerated, and no history was rewritten.

Validation executed for this restoration:

- TypeScript check and production build passed (the existing large studio-chunk warning remains).
- **13 Chromium E2E tests passed**, including pixel-exact saved V1–V7 previews/config export, V1–V5 explicit V6 copies, new V6 save/reopen and both wedding exports with independent mirrored playback.
- A separate browser smoke check loaded V6 through the main player button and V7 through the secondary comparison button.
- Generator, source-bank and prior export files are unchanged. The earlier 210 unit-test result belongs to the V7 development session; that suite was not rerun for this default-selection change.

PR #2 stays draft and unmerged. Further art work is paused; the next visual attempt should preserve V6 proportions and validate one small complete-character change before expanding it to both characters and all poses.
