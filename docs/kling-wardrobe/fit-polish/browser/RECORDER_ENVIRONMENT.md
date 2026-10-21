# Independent recorder recovery

The first production UI capture completed all 38 downloads, four new-project
reopenings, four historical pixel comparisons and eight workbench transitions.
It then stopped before independent playback because Playwright's expected
`/home/agent/.cache/ms-playwright/ffmpeg-1013/ffmpeg-linux` was missing.

`evidence-index.environment-failure.json` is the unmodified failed report.
`capture-before-resume.mjs` preserves the exact harness whose SHA appears in that
report. This was an environment recorder failure, not a failed garment or
application-resource check.

Installing the official Playwright recorder into a writable task cache was
attempted; its download endpoints returned 403 (`Domain forbidden`). Downloads
were stopped. The already installed `/usr/bin/ffmpeg` supports the required VP9
encoder. A temporary task-local executable link was created:

```sh
mkdir -p /tmp/gathria-playwright/ffmpeg-1013
ln -s /usr/bin/ffmpeg /tmp/gathria-playwright/ffmpeg-1013/ffmpeg-linux
```

This uses system FFmpeg 7.1.5 with Playwright's unchanged ordinary recorder
arguments. It does not claim to install the official bundled binary. Before
continuing, a real Playwright viewport recording was made and decoded with
FFmpeg; ffprobe reported VP9 and 59 decoded frames. This smoke video is an
environment check, not character-art evidence.

The explicit continuation command was:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/gathria-playwright \
  WARDROBE_PRODUCTION=1 WARDROBE_FIT_RESUME_INDEPENDENT=1 \
  node scripts/verify-kling-fit-polish.mjs
```

The narrow continuation guard requires this exact missing-ffmpeg failure,
zero prior page/console/resource errors, a completed authoring matrix, no prior
independent cases/recordings, the original harness snapshot, unchanged asset
and source inputs, and fresh SHA/size/PNG decoding/nested ZIP CRC checks on all 38
completed downloads. A new browser records four fresh independent contexts;
no wardrobe window is open in that run. It preserves all original authoring
fields and adds only independent-player cases, transitions, screenshots and
recordings. The final export auditor separately verifies these continuity
claims and the preserved failed-report hash.

`evidence-index.json` records both phases in `resumedIndependent`, including the
recorder's real executable path/version. It does not claim that the original
capture succeeded or that its authoring/export phase was unnecessarily rerun.
For a new reproduction, prepare a working Playwright recorder before capture,
use a fresh `WARDROBE_FIT_RUN` name and run the normal command without the
continuation flag.
