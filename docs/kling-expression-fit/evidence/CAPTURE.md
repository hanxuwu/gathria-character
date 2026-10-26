# Production capture protocol

The new helper is `scripts/capture-kling-expression-fit.mjs`. It exports images
through the production application's controls. It does not mount `/docs`, mock
requests, synthesize character images, or replace the runtime artwork.

Run only after publishing the final catalog and building it. `--plan` is safe
before publication: it prints the bounded matrix and opens no browser.

```sh
node scripts/capture-kling-expression-fit.mjs --plan
node scripts/capture-kling-expression-fit.mjs --run final-v1 \
  --temp /tmp/kling-expression-fit-final-v1
```

Every run must use a fresh evidence directory. The helper refuses overwrites and
checks that the production-served catalog matches the current catalog byte for
byte. It records the script, catalog, compiled JavaScript and source hashes,
then rechecks the build and source files before passing. Keep that production
build unchanged throughout capture and any independent artifact audit.

| Scope | Native PNG exports | GIF exports |
| --- | ---: | ---: |
| Both characters, current everyday recommendation, first existing hairstyle, all five appearance IDs at 0/59/86/78; Joyful old/new also at 90/102 | 48 | 14 |
| Both characters, current wedding recommendation, second existing hairstyle, all five appearance IDs at 0/86 | 20 | 0 |
| Male sailor v1/v2 at 59/78/86/96/104 and each neighboring native pose | 30 | 8 |
| Female plum top with navy and ochre shorts at 0/58/62/86/89/96/101/102/103/112/78/79 | 24 | 8 |
| Total | 122 | 30 |

Expression GIFs include all five rightward runs, plus old/new Joyful jumps, for
each character. Male garment GIFs include both run directions and rightward jump/celebration
for each version. Female GIFs include both run directions and
rightward jump/celebration for each bottom. GIF dimensions and centisecond
schedules are checked against the unchanged native animation schedules; GIFs
use the application's half-native matte export. PNGs retain native dimensions.

Appearance IDs are explicit: Natural is `null` (empty UI option), `gentle` and
`joyful` are the shipped baseline styles, and `gentle-v2` / `joyful-v2` are the
additive candidate styles. All comparisons occur in one final production build.
Joyful-v2 changes the mouth only at jump poses 88–91 and 100–103; the dedicated
90/102 PNGs and full jump GIFs exercise those changes directly.

The exact current outfit IDs are `day-soft-cuff` and `wedding-curved-cuff` for
male, and `day-smooth-waist` / `wedding-smooth-waist` for female. First/second hair
choices are `side-part` / `airy-tousle` and `tucked-bun` / `ribbon-pony`.
Final editable projects use `midnight-sailor-refined` with Gentle v2 and Airy
tousle, and `plum-pintuck-day` / `plum-pintuck-ochre` with Joyful v2 and Ribbon
pony. Hair color is chestnut. Exact garment IDs and hashes are recorded in the
capture index rather than inferred from display names.

The three projects are actual browser downloads saved in the temporary run
directory. Each is reopened, its source/registration/appearance hashes and
selection checked, and its native run-55-left canvas compared exactly with the
pre-save canvas. Only then is its CharacterPack exported. All editor contexts
close before a fresh independent player loads each ZIP and exercises all five
actions in both directions (30 cases). The index rejects authoring-module
requests from the independent player and records clock/loop observations.

Hard limits are 280 MiB retained capture evidence, 260 MiB temporary project
files, 122 native PNG exports, eight UI screenshots, 30 GIFs and three packs.
The two editable project copies selected for delivery are accounted separately
by the handoff, after capture and audit. UI screenshots document controls and
are not labeled app image exports. Each actual download is marked in the index.
The eight screenshots cover three reopens, two mobile layouts and three players.

The helper preserves failed runs and records failures. A passing capture proves
its recorded workflow and invariants; it does not itself establish artistic
acceptance. The root handoff records the separate visual review and artifact
audit. No capture has been run merely by creating this protocol.
