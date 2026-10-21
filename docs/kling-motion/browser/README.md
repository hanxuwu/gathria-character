# Actual browser motion evidence

These files show the two existing Kling characters through the application and independent player. They are recorded displays of the source artwork, not new illustrations. Passing the checks below is not user visual acceptance.

## Review

| Character | Right                                    | Left                                    | Nearest observed switch samples                                                    |
| --------- | ---------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| Male      | [Action-flow GIF](male-flow-right.gif)   | [Action-flow GIF](male-flow-left.gif)   | [Right](male-flow-right-boundaries.png), [left](male-flow-left-boundaries.png)     |
| Female    | [Action-flow GIF](female-flow-right.gif) | [Action-flow GIF](female-flow-left.gif) | [Right](female-flow-right-boundaries.png), [left](female-flow-left-boundaries.png) |

Each GIF compares instant switching on the left with **Wait for a matching pose** on the right. Both receive the same request schedule: start Walk, request Run at 250 ms, Jump at 900 ms, Celebrate at 3300 ms, and Idle at 3650 ms. Actual request and observation times are retained in [evidence-index.json](evidence-index.json).

Playback runs at normal **1× time**, with the source displayed at **0.5× size**. The GIF records 4.8 seconds as 116 review frames at approximately 24 FPS; GIF delays are rounded to 10 ms. It **plays once**. Its ending Idle pose is not advertised as a seamless loop back into the opening Walk pose.

The GIF uses the most recently observed actual canvas image at each review tick. The boundary PNGs show the nearest observed samples before and after a switch; they are not proof that every engine tick or the exact configured exit frame was observed. Exact route boundaries and remaining-time handling are verified separately in the motion-flow unit and browser tests. No intermediate poses or blended character images are synthesized for this evidence.

## What was executed

- Export each candidate through the authoring UI, save its self-contained action project, reopen that project, and export again. All CharacterPack bytes match the compiled candidates.
- Close the authoring browser context. Load the actual downloaded pack in a fresh independent context, without loading the action editor or skeleton modules.
- Observe idle, walk, run and celebrate for both characters and both directions at normal speed: 16 cases. Each case has four bounded cycles and requires two adjacent cycles containing every declared timeline tick. The JSON retains coverage for all four cycles and identifies the reviewed pair.
- Observe the complete original 39-tick one-shot jump and automatic recovery to Idle in both directions: four cases. Every jump tick and the final recovery frame were observed.
- Independently export again and verify unchanged bytes. Confirm both default original packs still hold the completed one-shot jump and export unchanged.
- Validate 10 downloaded ZIP/project archives, including nested source ZIPs: CRC, JSON parsing, and complete RGBA PNG decoding. Duplicates are checked in temporary storage; the deliverable packs are retained once in [../exports](../exports).
- Decode all 24 delivered PNGs and all four GIFs, including every GIF frame and delay. Check runtime and source-pack hashes before/after, with no external requests, page errors, or independent editor/skeleton requests.

The first Celebrate/right warmup cycle missed four observed ticks for each character; cycles 1 and 2 were complete. This is recorded rather than claiming complete observation of every warmup cycle. All other reviewed loop pairs are also complete.

The first flow recorder compressed PNGs during playback and recorded a 264–271 ms stall in the male celebration samples. There was one bounded recapture: playback only copies the canvas into cached offscreen images, and PNG encoding happens after playback stops. `flowRecapture` records this attempt; the already successful loop, jump, download and original-default checks remain from the initial complete run. Fresh recapture imports are checked against the SHA-256 of the previously verified UI downloads. No runtime or source asset changed between these captures.

The final review preserves the best **complete recordings**, with per-side provenance and hashes in `captureProvenance`:

- Both male previews use the complete initial instant recording beside the complete deferred-encoding queued recording. The same 116-frame/4.8-second review timeline is retained; individual poses were not selected or replaced.
- Female/right retains its complete clean initial comparison; female/left uses the complete clean deferred comparison.
- Every selected recording observed all 39 jump ticks. Male/left queued playback still has a 247 ms observation gap during celebration. The other selected active recordings have no gaps above 90 ms. The deliberate final jump hold in instant mode is excluded from this gap metric.

`compose-recordings.py` performs this bounded selection from saved actual-canvas GIF columns and PNG boards, verifies timing, and updates media hashes. GIF colors are quantized again during whole-column composition. The headless recording gap is not evidence of a better or worse pose route; use the full-frame exported GIFs in [../review](../review) for authoritative clip cadence. No further capture attempts were made.

## Visual findings

The phase-aware walk-to-run switch selects a more compatible step than starting every Run at frame zero. Both directions preserve the original figure and are visibly mirrored. Jump includes the landing/recovery artwork before returning to Idle.

There are still visible cuts in the original pose vocabulary: run-to-jump changes abruptly into a crouch; idle-to-celebrate changes both face and arms immediately; celebrate-to-idle drops the raised arms and restores the neutral face. Waiting for a selected pose does not create the missing in-between artwork. Source-video proportions, lighting variation and movement remain present. The system has not produced a new continuous hand-drawn transition between these actions.

The `*-seam.png` files show the last two and first two actual observed ticks around a reviewed loop boundary. The independent and candidate-editor PNGs show the application's real display. Human approval of the visuals remains outstanding.

## Reproduce

From the repository root, use an empty output phase:

```sh
CHROMIUM_PATH=/usr/bin/chromium EVIDENCE_PHASE=browser-review node scripts/verify-kling-motion.mjs
```

The script requires local Chromium, Python/Pillow and installed project dependencies. A deliberate flow-only recapture of an already successful phase uses `FLOW_ONLY=1`; it verifies identical runtime/source hashes and preserves prior non-flow checks. Archive earlier flow evidence before intentionally replacing it. The final checked output here selects complete recordings from the initial run and one recapture as described above; all selected observation logs are retained in the index.
