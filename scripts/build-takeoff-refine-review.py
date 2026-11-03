#!/usr/bin/env python3
"""Compare actual UI flow GIFs on their common clock, without retiming frames.

Both exports request Jump after one complete 18-tick run cycle (750ms). The
comparison is a review presentation: a shorter panel holds, then a labelled
pause precedes replay. Original one-shot downloads are never modified.
"""
import argparse
from bisect import bisect_right
import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "landing_review", ROOT / "scripts/build-landing-run-review.py")
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)


def panel(frames, character, labels, requested, pause=False):
    width, height = frames[0].size
    image = Image.new("RGB", (2 * width + 24, height + 105), common.MATTE)
    draw = ImageDraw.Draw(image)
    draw.text((8, 5), f"{character.title()} / side - actual exports",
              font=common.FONT, fill=common.INK)
    request = "Jump requested at 750ms" if requested else "Jump request at 750ms"
    draw.text((8, 24), request, font=common.SMALL, fill=common.INK)
    for index, (frame, label) in enumerate(zip(frames, labels)):
        x = 8 + index * (width + 8)
        draw.text((x, 42), label, font=common.SMALL, fill=common.INK)
        image.paste(frame, (x, 61))
    footer = "Review pause - replay follows" if pause else "Same clock; ended panel held"
    draw.text((8, height + 77), footer, font=common.SMALL, fill=common.INK)
    return image


def build(args):
    args.output.mkdir(parents=True, exist_ok=True)
    records = []
    for character in ("male", "female"):
        proof = common.load_json(args.input / character / "pixel-verification.json")
        assert proof.get("passed") is True, "Run independent export verification first"
        old_path = args.baseline / character / "side-run-jump-run-right.gif"
        new_path = args.input / character / "side-run-jump-run-right.gif"
        input_hashes = [common.digest(old_path), common.digest(new_path)]
        old_profile = common.profile(args.baseline / character / "side.character.json")
        new_profile = common.profile(args.input / character / "side.character.zip")
        assert old_profile["id"] == f"kling-{character}-side-single-jump-v2"
        assert new_profile["id"] == f"kling-{character}-side-single-jump-v3"
        assert old_profile["actions"] == new_profile["actions"]
        assert old_profile["sourceSha256"] == new_profile["sourceSha256"]
        assert [r for r in old_profile["routes"] if r["from"] == "jump"] == [
            r for r in new_profile["routes"] if r["from"] == "jump"]
        before, after = common.decode(old_path), common.decode(new_path)
        clips = [before, after]
        assert before["size"] == after["size"]
        timelines = []
        for clip, profile in zip(clips, [old_profile, new_profile]):
            sequence, first_jump, first_return = common.native_sequence(profile)
            assert len(sequence) == len(clip["frames"])
            assert profile["actions"]["run"]["fps"] == 24
            assert len(profile["actions"]["run"]["frames"]) == 18
            assert clip["starts"][18] == 750
            timelines.append({"nativeFrames": sequence, "firstJumpTick": first_jump,
                              "firstReturnTick": first_return,
                              "firstJumpMs": clip["starts"][first_jump]})
        assert timelines[0]["firstJumpTick"] - timelines[1]["firstJumpTick"] == 7
        assert timelines[0]["firstReturnTick"] - timelines[1]["firstReturnTick"] == 7
        crop = common.fixed_crop(before["frames"] + after["frames"])
        old_frames, size, scale = common.resized_frames(before, crop, args.panel_height)
        new_frames, _, _ = common.resized_frames(after, crop, args.panel_height)
        events = sorted(set(before["starts"] + after["starts"]))
        pictures, durations, event_records = [], [], []
        for start, stop in zip(events, events[1:]):
            indices = [min(bisect_right(c["starts"], start) - 1, len(c["frames"]) - 1)
                       for c in clips]
            labels, states = [], []
            for name, clip, timeline, index in zip(["Before", "After"], clips, timelines, indices):
                state = ("ended (held)" if start >= clip["durationMs"] else
                         "run" if start < 750 else
                         "waiting" if index < timeline["firstJumpTick"] else
                         "jump" if index < timeline["firstReturnTick"] else "run")
                labels.append(f"{name}: {state}")
                states.append(state)
            pictures.append(panel([old_frames[indices[0]], new_frames[indices[1]]],
                                  character, labels, start >= 750))
            durations.append(stop - start)
            event_records.append({"startMs": start, "durationMs": stop - start,
                                  "exportFrameIndices": indices, "states": states})
        pictures.append(panel([old_frames[-1], new_frames[-1]], character,
                              ["Before: held", "After: held"], True, pause=True))
        durations.append(args.pause_ms)
        output = args.output / f"{character}-side-takeoff-before-after.gif"
        common.save_gif(output, pictures, durations)
        assert input_hashes == [common.digest(old_path), common.digest(new_path)]
        records.append({"character": character, "view": "side", "requestMs": 750,
                        "before": {"file": str(old_path), "sha256": common.digest(old_path),
                                   "profileId": old_profile["id"],
                                   "frameDurationsMs": before["durations"], **timelines[0]},
                        "after": {"file": str(new_path), "sha256": common.digest(new_path),
                                  "profileId": new_profile["id"],
                                  "frameDurationsMs": after["durations"], **timelines[1]},
                        "presentation": {"file": output.name, "bytes": output.stat().st_size,
                                         "sha256": common.digest(output), "fixedCrop": crop,
                                         "scale": scale, "panelSize": size, "loop": True,
                                         "reviewPauseMs": args.pause_ms, "events": event_records}})
        print(f"Rendered {character}: {output.stat().st_size} bytes", flush=True)
    (args.output / "comparison-inventory.json").write_text(json.dumps({
        "format": "gathria-takeoff-presentation-review", "version": 1,
        "provenance": "Only actual application GIF downloads; source one-shots unchanged.",
        "presentationOnly": True,
        "timing": "Both request Jump at 750ms. Input GIF durations are preserved on a common clock. Ended panels hold; a labelled replay pause is added.",
        "rendering": "One fixed shared crop and scale; one shared 256-color presentation palette. No per-frame alignment or pose retouching.",
        "comparisons": records}, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("/tmp/motion-refine/exports"))
    parser.add_argument("--baseline", type=Path, default=ROOT / "docs/kling-landing-run/review")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/kling-takeoff-refine/review")
    parser.add_argument("--panel-height", type=int, default=210)
    parser.add_argument("--pause-ms", type=int, default=900)
    options = parser.parse_args()
    assert options.pause_ms > 0 and options.pause_ms % 10 == 0
    build(options)
