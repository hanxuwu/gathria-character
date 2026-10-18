# Actual export capture attempts

These are diagnostic attempts, not passing delivery evidence.

1. The initial attempt was stopped conservatively while serial library ZIP/pixel checks were still progressing with insufficient console detail. No application defect was established by this interruption. The capture script now timestamps each legacy check, identity/item roundtrip and character export, limits UI operations to 15 seconds, and bounds browser verification evaluations to 45 seconds.
2. The next attempt completed four exact legacy comparisons, two identity imports/roundtrips, and six clothing imports/roundtrips. The first assembled Maple CharacterPack then failed the real independent pack parser: `PROVENANCE.txt` was 390,890 bytes, exceeding the existing 256 KiB text-entry limit. `src/skeletal/bake.ts` had copied encoded identity/clothing pixel libraries into prose metadata. The application had downloaded a ZIP the consumer could not reopen. See `oversized-provenance.log`.

The invalid ZIP was replaced by the final capture after writer repair `654de23`.
That complete run passed all four legacy checks, twelve new exports, eight
project reopenings, 176 editor frame/facing checks and 24 closed-editor
independent playback cases. All final PNG/GIF/ZIP files decode. The consumer
size limit and pixel checks remain intact; see `../final/evidence-index.json`
and `../final/file-integrity.json` for the passing record.

The final full capture on 2026-10-18 passed after the writer repair: 46 downloaded ZIPs, 176 editor frame/facing comparisons, 24 complete isolated playback cases, and all source/input hash freezes. All provisional packages were overwritten by successful downloads. `../final/evidence-index.json`, `capture.log`, `artifact-validation.json` and `file-integrity.json` contain the authoritative final results. Every delivered PNG/GIF/ZIP was decoded; GIF frame order and cumulative timing were verified.
