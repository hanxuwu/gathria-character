The repository previously contained only a README. This adds a working browser-local character studio: users can customize original pixel people, preview idle/walk in either direction, save/reopen configuration, and export a CharacterPack v1 ZIP. A separate page loads the actual exported PNG and metadata without importing the generator.

## Included

- Deterministic original 48×64 artwork, three presets, practical appearance controls, coherent four-frame idle and eight-frame walking animations.
- Live checkerboard preview, ground anchor, frame strip, play/pause, speed, integer zoom, preset/reset, and actionable file feedback.
- Versioned manifest, transparent PNG, editable config, provenance/license, and integration guide in each ZIP; bounded schema/archive/image validation.
- Independent ZIP and PNG+manifest consumer, MIT-licensed sample packs, format documentation, and resumable implementation status.
- A small generation-provider interface and isolated provisional Gathria adapter. No backend, API credentials, AI, or photo generation.

## Verification

- Clean `npm ci` succeeds.
- `npm run typecheck` passes.
- `npm test`: 103 passing tests.
- `npm run build` passes for both entrypoints.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`: 4 passing Chromium tests, including customize → save/reopen → export → independent playback, malformed files, transparency, mobile layout, and high zoom.
- Production-served studio export and independent playback pass with no page errors.
- Desktop/mobile UI and enlarged animation frames inspected visually. Screenshots are in `docs/images/`.

Gathria runtime compatibility remains **unverified**: read access to the candidate runtime repository returned HTTP 403. The frame size, timings, anchors, and proposed adapter are explicitly provisional. Firefox/Safari and remote CI are not claimed as verified. Recommended next milestone: review the artwork/interaction, then validate a real adapter against the accessible Gathria runtime and record its source commit.
