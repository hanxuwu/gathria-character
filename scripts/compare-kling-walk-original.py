#!/usr/bin/env python3
"""Compare female native walk clocks without retiming any of the three packs.

Ordinary Kling walk is 27 positions / 24 FPS (1.125 seconds); both pixel
revisions use 8 positions / 8 FPS (1 second). Their shared repeat is 9 seconds.
This script makes presentation-only, anchored comparisons from actual exports.
It does not alter character drawings or substitute generated art for exports.
"""
from fractions import Fraction
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / os.environ.get("KLING_THEME_CONTINUITY_DIR", "docs/kling-theme-continuity/evidence")
OUT = EVIDENCE.parent / "native-walk-review"
# Keep optional JSON outside the primary image-only review directory; the main
# capture and verifier are frozen evidence and do not require any alteration.
spec = importlib.util.spec_from_file_location("theme_helpers", ROOT / "scripts/verify-kling-themes.py")
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
sha = lambda data: hashlib.sha256(data).hexdigest()
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
MATTE = (238, 233, 223)


def round_half_up(value):
    return math.floor(value + Fraction(1, 2))


def main():
    capture_path = EVIDENCE / "capture.json"
    validation_path = EVIDENCE.parent / "validation.json"
    assert capture_path.exists() and validation_path.exists(), "Run and verify the new production UI capture before making this optional comparison."
    capture_bytes = capture_path.read_bytes(); capture = json.loads(capture_bytes)
    validation = json.loads(validation_path.read_bytes())
    assert capture["passed"] and capture["production"] and validation["passed"]
    assert validation["captureSha256"] == sha(capture_bytes)
    current = next(case for case in capture["cases"] if case["character"] == "female" and case["lookId"] == "base")
    revision = int(current["themeKey"].rsplit("@", 1)[1]); assert revision >= 3
    originals = {row["kind"]: row for row in capture["baselinePacks"] if row["character"] == "female" and row["lookId"] == "base"}
    inputs = [
        {**originals["original"], "label": "Original / retained actual export"},
        {**originals["r2"], "label": "Pixel R2 / retained actual export"},
        {"file": current["packFile"], "sha256": current["packSha256"], "label": f"Pixel R{revision} / current UI export", "retainedHistoricalExport": False},
    ]
    for row in inputs:
        assert sha((ROOT / row["file"]).read_bytes()) == row["sha256"], (row["file"], "changed after actual UI capture")
    packs = [helper.helpers.Pack(ROOT / row["file"]) for row in inputs]
    try:
        clips = [pack.m["animations"]["walk"] for pack in packs]
        assert all(clip["loop"] for clip in clips)
        fps = [Fraction(str(clip["fps"])) for clip in clips]
        assert all(value.denominator == 1 and 1 <= value <= 60 for value in fps)
        periods = [Fraction(len(clip["frames"]), 1) / rate for clip, rate in zip(clips, fps)]
        assert periods == [Fraction(9, 8), Fraction(1), Fraction(1)], "Unexpected walk cadence: inspect a new input before adapting this comparison."
        common = Fraction(math.lcm(*(value.numerator for value in periods)), math.gcd(*(value.denominator for value in periods)))
        tick_rate = math.lcm(*(int(value) for value in fps))
        ticks = int(common * tick_rate)
        assert common * tick_rate == ticks and common <= 10 and ticks <= 600
        delays = [10 * (round_half_up(Fraction((i + 1) * 100, tick_rate)) - round_half_up(Fraction(i * 100, tick_rate))) for i in range(ticks)]
        assert all(delay > 0 for delay in delays) and sum(delays) == int(common * 1000)
        mapping = []
        for tick in range(ticks):
            positions = [(tick * int(rate) // tick_rate) % len(clip["frames"]) for clip, rate in zip(clips, fps)]
            mapping.append({"tick": tick, "timeSeconds": float(Fraction(tick, tick_rate)), "positions": positions, "frameIds": [clip["frames"][position] for clip, position in zip(clips, positions)]})
        for column, clip in enumerate(clips):
            assert {row["positions"][column] for row in mapping} == set(range(len(clip["frames"])))
        height = 272 * 2
        scales = [height / packs[0].m["spritesheet"]["frameHeight"], 2, 2]
        sizes = [(round(pack.m["spritesheet"]["frameWidth"] * scale), height) for pack, scale in zip(packs, scales)]
        anchors = [(round(pack.m["anchor"]["x"] * scale), round(pack.m["anchor"]["y"] * scale)) for pack, scale in zip(packs, scales)]
        left = max(anchor[0] for anchor in anchors)
        right = max(size[0] - anchor[0] for size, anchor in zip(sizes, anchors))
        above = max(anchor[1] for anchor in anchors)
        below = max(size[1] - anchor[1] for size, anchor in zip(sizes, anchors))
        width, display_height, gap, header = left + right, above + below, 12, 84
        canvas_size = (width * 3 + gap * 2, display_height + header)
        assert canvas_size[0] * canvas_size[1] <= 2_000_000
        OUT.mkdir(parents=True, exist_ok=True)
        result = {
            "passed": False, "action": "female base walk", "sourceCapture": str(capture_path.relative_to(ROOT)),
            "sourceCaptureSha256": sha(capture_bytes), "sourceCaptureCommit": capture["commitAtCapture"],
            "inputs": inputs, "nativeTimelines": [{"count": len(clip["frames"]), "fps": float(rate), "cycleSeconds": float(period), "cyclesInPresentation": int(common / period)} for clip, rate, period in zip(clips, fps, periods)],
            "nativeClocksRetimed": False, "newOrInterpolatedDrawings": False,
            "note": "Three independent native clocks. Original cycles every 1.125s; pixels every 1s. Their phases intentionally diverge between the common 9s loop boundaries. Pixel columns use exact integer 2x; original display height alone is normalized.",
            "commonRepeatSeconds": float(common), "presentationTickRate": tick_rate, "mapping": mapping, "durationsMs": delays,
            "displayScales": scales, "sharedAnchor": {"x": left, "y": above + header}, "outputs": [],
        }
        for facing in ["right", "left"]:
            prepared = []
            for column, pack in enumerate(packs):
                bank = {}
                for fid in set(clips[column]["frames"]):
                    frame = pack.frame(fid)
                    if facing == "left": frame = ImageOps.mirror(frame)
                    bank[fid] = frame.resize(sizes[column], Image.Resampling.LANCZOS if column == 0 else Image.Resampling.NEAREST)
                prepared.append(bank)
            template = Image.new("RGBA", canvas_size, (*MATTE, 255)); draw = ImageDraw.Draw(template)
            for column, (row, clip, rate, period) in enumerate(zip(inputs, clips, fps, periods)):
                x = column * (width + gap)
                draw.text((x + 5, 5), row["label"], font=FONT, fill=(40, 60, 53))
                draw.text((x + 5, 25), f"Female walk / {facing} / own native clock", font=FONT, fill=(40, 60, 53))
                draw.text((x + 5, 45), f"{len(clip['frames'])} positions / {int(rate)} FPS / {float(period):g}s cycle", font=FONT, fill=(40, 60, 53))
                draw.text((x + 5, 65), "Display height normalized" if column == 0 else "Exact integer 2x / no retiming", font=FONT, fill=(40, 60, 53))
            def make_frame(row):
                board = template.copy()
                for column, fid in enumerate(row["frameIds"]):
                    anchor = anchors[column]
                    board.alpha_composite(prepared[column][fid], (column * (width + gap) + left - anchor[0], header + above - anchor[1]))
                return board.convert("RGB")
            # Bound memory: build a small palette sample, then keep only indexed
            # frames. Never retain 216 full RGBA presentation canvases at once.
            sw, sh = canvas_size[0] // 4, canvas_size[1] // 4
            sample = Image.new("RGB", (sw, sh * ticks))
            for i, row in enumerate(mapping):
                sample.paste(make_frame(row).resize((sw, sh), Image.Resampling.BOX), (0, i * sh))
            palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
            del sample
            frames = [make_frame(row).quantize(palette=palette, dither=Image.Dither.NONE) for row in mapping]
            path = OUT / f"female-base-walk-original-r2-r{revision}-{facing}-native-clocks-2x.gif"
            frames[0].save(path, save_all=True, append_images=frames[1:], duration=delays, loop=0, disposal=1, optimize=False)
            del frames
            elapsed = 0; sample_index = 0; errors = []
            with Image.open(path) as gif:
                assert gif.info.get("loop") == 0 and gif.size == canvas_size
                decoded = gif.n_frames
                for i in range(decoded):
                    gif.seek(i); gif.load()
                    delay = gif.info["duration"]; assert delay > 0
                    actual = np.asarray(gif.convert("RGB"), dtype=np.int16)
                    consumed = 0
                    # Pillow may coalesce identical adjacent canvases; verify
                    # every scheduled tick's pixels against the decoded frame.
                    while consumed < delay:
                        assert sample_index < ticks
                        expected = np.asarray(make_frame(mapping[sample_index]), dtype=np.int16)
                        error = float(np.abs(actual - expected).mean()); assert error < 4, (path.name, i, sample_index, error)
                        errors.append(error); consumed += delays[sample_index]; sample_index += 1
                    assert consumed == delay
                    elapsed += delay
            assert elapsed == int(common * 1000) and sample_index == ticks
            result["outputs"].append({"file": str(path.relative_to(ROOT)), "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size, "decodedFrames": decoded, "scheduledTicksVerified": ticks, "decodedDurationMs": elapsed, "maxMeanPaletteError": max(errors), "facing": facing})
        result["passed"] = True
        (OUT / "walk-original-comparison.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({"passed": True, "nativeCycleSeconds": [float(period) for period in periods], "commonRepeatSeconds": float(common), "ticks": ticks, "files": [row["file"] for row in result["outputs"]]}))
    finally:
        for pack in packs: pack.close()


if __name__ == "__main__": main()
