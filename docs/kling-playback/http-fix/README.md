# Kling source import on HTTP previews

Ordinary HTTP LAN origins do not expose `crypto.subtle`. The previous source
importer called `crypto.subtle.digest` unconditionally, causing the reported
`Cannot read properties of undefined (reading 'digest')` error. Localhost is a
potentially trustworthy origin, so the original localhost browser checks did not
exercise this browser restriction.

`src/core/sha256.ts` keeps native Web Crypto when available and lazily loads
`@noble/hashes` SHA-256 otherwise. Source fingerprints, pixel deduplication and
validation are preserved. No frames, recipes, animation timings, character
proportions or export formats change. The fallback is bundled locally, not loaded
from a third-party service at runtime. Its production chunk is about 4.79 kB
before gzip.

## Verification performed for this fix

- Typecheck and production build passed (the existing large-chunk warning remains).
- 133 focused unit tests passed across SHA-256, source import, V1/V2 packs and
  player logic. Independent Node SHA-256 comparisons cover empty inputs, padding
  boundaries, binary subarray offsets and a full native-sized RGBA frame.
- 3 Chromium E2E tests passed, including import → comparison → export → fresh
  independent reopen both with and without `crypto.subtle`, plus rejection of an
  incomplete source without replacing a loaded legacy character.
- `node scripts/verify-kling-http.mjs`, run after the production build, used an
  actual non-loopback HTTP address. Chromium reported `isSecureContext: false`
  and no `crypto.subtle`; no browser APIs were mocked for this check.
- Clicking **Try the Kling character pair** loaded the complete native source.
  Initial male import took about 38.35 seconds in this run.
- Both exported spritesheet PNGs were byte-identical to the pre-fix packs.
  Both manifests and recipes matched their baselines, and source SHA-256 matched
  Node's independent hash of the original ZIP.
- After closing the importing browser context, fresh contexts loaded only the
  newly exported packs and advanced frames in all 16 character/action/direction
  combinations, with zero browser errors.

[Machine-readable result](verification.json) ·
[Male independent player](male-http-player.png) ·
[Female independent player](female-http-player.png)

This is a loading compatibility fix, not a new visual iteration. Native import
cost, memory usage, source motion blur and source loop limitations remain. These
are the tests executed for this fix; the earlier full-suite records elsewhere
remain historical.

For an older player build, directly opening one of the already exported native
CharacterPack ZIPs avoids source conversion and this failing hash path. Updating
the player is required for the source-pair button fix.
