#!/usr/bin/env python3
"""Compare actual V3/V4 application GIF downloads on the same source clock."""
import argparse
from bisect import bisect_right
import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "review", ROOT / "scripts/build-landing-run-review.py")
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)


def timeline(profile):
    run = profile["actions"]["run"]["frames"]
    jump = profile["actions"]["jump"]["frames"]
    takeoff = min((r for r in profile["routes"] if r["from"] == "run" and r["to"] == "jump"),
                  key=lambda r: r["exit"])
    landing = min((r for r in profile["routes"] if r["from"] == "jump" and r["to"] == "run"),
                  key=lambda r: r["exit"])
    lead_in = takeoff.get("leadIn", [])
    first_approach = len(run) + takeoff["exit"]
    first_jump = first_approach + len(lead_in)
    first_return = first_jump + landing["exit"]
    ids = run + run[:takeoff["exit"]] + lead_in + jump[:landing["exit"]]
    ids += [run[(landing["entry"] + i) % len(run)] for i in range(len(run))]
    return {"nativeFrames": ids, "firstApproachTick": first_approach,
            "firstMainJumpTick": first_jump, "firstReturnTick": first_return}


def panel(frames, character, labels, pause=False):
    width, height = frames[0].size
    image = Image.new("RGB", (2 * width + 24, height + 102), common.MATTE)
    draw = ImageDraw.Draw(image)
    draw.text((8, 5), f"{character.title()} / side - actual GIF exports",
              font=common.FONT, fill=common.INK)
    draw.text((8, 24), "Both request Jump at 750ms; native 24 FPS",
              font=common.SMALL, fill=common.INK)
    for index, (frame, label) in enumerate(zip(frames, labels)):
        x = 8 + index * (width + 8)
        draw.text((x, 43), label, font=common.SMALL, fill=common.INK)
        image.paste(frame, (x, 61))
    draw.text((8, height + 76), "Review pause - replay follows" if pause
              else "Same clock; shorter panel held after ending",
              font=common.SMALL, fill=common.INK)
    return image


def seam_sheet(path, clips, timings, character):
    ticks = [[t["firstApproachTick"] + offset for offset in range(-2, 6)] for t in timings]
    selected = [clips[r]["frames"][i] for r in range(2) for i in ticks[r]]
    crop = common.fixed_crop(selected)
    width, height = crop[2] - crop[0], crop[3] - crop[1]
    scale = min(120 / width, 220 / height)
    size = (round(width * scale), round(height * scale))
    sheet = Image.new("RGB", (8 * 128, 2 * 264 + 44), common.MATTE)
    draw = ImageDraw.Draw(sheet)
    draw.text((6, 5), f"{character.title()}: actual export frames around Run exit", font=common.FONT, fill=common.INK)
    draw.text((6, 24), "Each row aligned to its own Run exit; fixed crop/scale, unchanged drawings", font=common.SMALL, fill=common.INK)
    for r in range(2):
        for c, tick in enumerate(ticks[r]):
            x, y = c * 128, 44 + r * 264
            draw.text((x + 4, y + 4), f"{'Before' if r == 0 else 'After'} ID {timings[r]['nativeFrames'][tick]}", font=common.FONT, fill=common.INK)
            draw.text((x + 4, y + 23), f"{clips[r]['starts'][tick]}ms", font=common.SMALL, fill=common.INK)
            frame = clips[r]["frames"][tick].crop(crop).resize(size, Image.Resampling.LANCZOS)
            sheet.paste(frame, (x + (128 - size[0]) // 2, y + 42))
    sheet.save(path, optimize=True)
    return {"file": path.name, "sha256": common.digest(path), "exportTicks": ticks, "fixedCrop": crop}


def build(args):
    args.output.mkdir(parents=True, exist_ok=True)
    records = []
    for character in ("male", "female"):
        proof = common.load_json(args.input / character / "pixel-verification.json")
        assert proof["passed"] is True
        old_path = args.baseline / character / "side-run-jump-run-right.gif"
        new_path = args.input / character / "side-run-jump-run-right.gif"
        old = common.profile(args.baseline / character / "side.character.json")
        new = common.profile(args.input / character / "side.character.zip")
        assert old["id"] == f"kling-{character}-side-single-jump-v3"
        assert new["id"] == f"kling-{character}-side-single-jump-v4"
        assert old["actions"] == new["actions"]
        assert old["sourceSha256"] == new["sourceSha256"]
        assert [r for r in old["routes"] if r["from"] != "run" or r["to"] != "jump"] == [
            r for r in new["routes"] if r["from"] != "run" or r["to"] != "jump"]
        audit = next(row for row in proof["results"] if row["view"] == "side")
        assert audit["nativeAtlasBytesUnchanged"] is True
        assert next(g for g in audit["gifFiles"] if g["name"] == "run-jump-run" and
                    g["facing"] == "right")["sha256"] == common.digest(new_path)
        clips = [common.decode(old_path), common.decode(new_path)]
        timelines = [timeline(old), timeline(new)]
        for clip, timing in zip(clips, timelines):
            assert len(clip["frames"]) == len(timing["nativeFrames"])
            assert clip["starts"][18] == 750
            for key in ("firstApproach", "firstMainJump", "firstReturn"):
                timing[key + "Ms"] = clip["starts"][timing[key + "Tick"]]
        assert timelines[0]["firstMainJumpTick"] - timelines[1]["firstMainJumpTick"] == 2
        crop = common.fixed_crop(clips[0]["frames"] + clips[1]["frames"])
        pictures = [common.resized_frames(c, crop, args.panel_height)[0] for c in clips]
        events = sorted(set(clips[0]["starts"] + clips[1]["starts"]))
        frames, durations, events_proof = [], [], []
        for start, stop in zip(events, events[1:]):
            indices = [min(bisect_right(c["starts"], start) - 1, len(c["frames"]) - 1)
                       for c in clips]
            labels = []
            for name, clip, timing, index in zip(["Before", "After"], clips, timelines, indices):
                state = ("ended (held)" if start >= clip["durationMs"] else
                         "run" if start < 750 else
                         "waiting" if index < timing["firstApproachTick"] else
                         "approach" if index < timing["firstMainJumpTick"] else
                         "jump" if index < timing["firstReturnTick"] else "run")
                labels.append(f"{name}: {state}")
            frames.append(panel([pictures[i][indices[i]] for i in range(2)], character, labels))
            durations.append(stop - start)
            events_proof.append({"startMs": start, "durationMs": stop - start,
                                 "exportFrameIndices": indices, "labels": labels})
        frames.append(panel([p[-1] for p in pictures], character,
                            ["Before: held", "After: held"], pause=True))
        durations.append(900)
        output = args.output / f"{character}-side-run-jump-before-after.gif"
        common.save_gif(output, frames, durations)
        sheet = seam_sheet(args.output / f"{character}-side-takeoff-seams.png", clips, timelines, character)
        record = {"character": character, "requestMs": 750,
                  "before": {"sha256": common.digest(old_path), "profile": old["id"], **timelines[0]},
                  "after": {"sha256": common.digest(new_path), "profile": new["id"], **timelines[1]},
                  "presentation": {"file": output.name, "sha256": common.digest(output),
                                   "fixedCrop": crop, "reviewPauseMs": 900, "events": events_proof},
                  "seamSheet": sheet}
        records.append(record)
    (args.output / "comparison-inventory.json").write_text(json.dumps({
        "provenance": "Actual application GIF downloads, compared on a common clock. Shared fixed crop/scale/palette; no pose synthesis, per-frame alignment or retiming. Labelled end holds and replay pause are presentation only.",
        "comparisons": records}, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("/tmp/takeoff-bridge/exports"))
    parser.add_argument("--baseline", type=Path, default=ROOT / "docs/kling-takeoff-refine/review")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/kling-takeoff-bridge/review")
    parser.add_argument("--panel-height", type=int, default=240)
    build(parser.parse_args())
