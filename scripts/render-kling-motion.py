"""Review actual exported motion packs beside the unchanged prior candidates."""
from pathlib import Path
import argparse
import importlib.util
import json

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("review", ROOT / "scripts/render-kling-keyframes.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
base = review.compiler


def save_gif(images, path, fps, loop):
    palette_sheet = Image.new("RGB", (images[0].width // 2, images[0].height // 2 * len(images)))
    for i, image in enumerate(images):
        palette_sheet.paste(image.resize((image.width // 2, image.height // 2)), (0, i * (image.height // 2)))
    palette = palette_sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    durations = [round((i + 1) * 100 / fps) * 10 - round(i * 100 / fps) * 10 for i in range(len(images))]
    kwargs = {"loop": 0} if loop else {}
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations, disposal=2, optimize=False, **kwargs)
    with Image.open(path) as gif:
        assert gif.n_frames == len(images)
        assert gif.info.get("loop") == (0 if loop else None)
        actual = []
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.convert("RGB").load()
            actual.append(gif.info["duration"])
        assert actual == durations
    assert abs(sum(durations) - len(images) * 1000 / fps) <= 5
    return {"file": path.name, "frames": len(images), "durationsMs": durations, "loop": loop,
            "decoded": True, "sha256": base.sha(path.read_bytes())}


def compare(identity, name, before_frames, after_frames, before, after, facing, output):
    assert len(before["frames"]) == len(after["frames"])
    images = []
    for tick, (first, second) in enumerate(zip(before["frames"], after["frames"])):
        image = review.checker((704, 628))
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, 704, 81), fill="#f3f0e7")
        draw.text((12, 8), f"{identity} / {name} / {facing} / 1x speed / 0.5x size", font=review.font(16), fill="#30453b")
        for column, (frame_id, frames, label) in enumerate([
            (first, before_frames, "Original one-shot (unchanged)" if name == "jump" else "Before: 52-drawing loop study"),
            (second, after_frames, "After: motion-flow candidate"),
        ]):
            draw.text((column * 352 + 10, 36), label, font=review.font(13), fill="#48584b")
            draw.text((column * 352 + 10, 59), f"tick {tick + 1} / frame {frame_id}", font=review.font(13), fill="#48584b")
            sprite = review.display(frames[frame_id], .5, facing)
            image.paste(sprite, (column * 352, 82), sprite)
            draw.line((column * 352 + 8, 581, (column + 1) * 352 - 8, 581), fill="#9ca893")
        note = "Plays once; no forced jump wrap. Actual auto-return is in browser previews." if name == "jump" else "Same source clock and anchor; restored images reduce held-motion steps."
        draw.text((10, 612), note, font=review.font(11), fill="#48584b")
        images.append(image)
    return save_gif(images, output / f"{identity}-{name}-{facing}.gif", after["fps"], after["loop"])


def route_boards(identity, frames, routes, output):
    # Show reviewed source exit + target entry at the same native frame/anchor.
    selected = [r for r in routes if (r["from"], r["to"]) in [("walk", "run"), ("run", "walk"), ("jump", "idle"), ("celebrate", "idle")]]
    board = review.checker((704, len(selected) * 320))
    draw = ImageDraw.Draw(board)
    for row, route in enumerate(selected):
        y = row * 320
        draw.rectangle((0, y, 704, y + 55), fill="#f3f0e7")
        draw.text((10, y + 6), f"{identity} / {route['from']} -> {route['to']} / reviewed source cut", font=review.font(16), fill="#30453b")
        for column, key in enumerate(["exitFrameId", "entryFrameId"]):
            frame_id = route[key]
            draw.text((column * 352 + 10, y + 30), f"{'Exit last shown' if column == 0 else 'Entry first shown'}: frame {frame_id}", font=review.font(14), fill="#48584b")
            sprite = review.display(frames[frame_id], .25)
            board.paste(sprite, (column * 352 + 88, y + 56), sprite)
    board.save(output / f"{identity}-transition-poses.png")


def diagnostic(source, old_clip, new_clip, source_clip):
    features = {frame_id: review.features(source[frame_id]) for frame_id in set(old_clip["frames"] + new_clip["frames"])}
    def error(clip):
        return float(np.mean([review.distance(features[a], review.features(source[b])) for a, b in zip(clip["frames"], source_clip["frames"])]))
    def steps(clip):
        values = [review.distance(features[a], features[b]) for a, b in zip(clip["frames"], clip["frames"][1:] + clip["frames"][:1])]
        return {"maxStep": max(values), "wrap": values[-1]}
    return {"metric": "Quarter-size premultiplied RGBA RMSE at the original clock; not a naturalness score",
            "beforeMeanSourceDifference": error(old_clip), "afterMeanSourceDifference": error(new_clip),
            "before": steps(old_clip), "after": steps(new_clip)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "docs/kling-motion/review")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    profile_bytes = (ROOT / "artwork/kling-motion/selection.json").read_bytes()
    profile = json.loads(profile_bytes)
    compiled = json.loads((ROOT / "docs/kling-motion/exports/compilation-report.json").read_text())
    assert compiled["profileSha256"] == base.sha(profile_bytes)
    report = {"format": "gathria-kling-motion-media", "version": 1, "animations": [], "diagnostics": [], "media": [],
              "note": "Actual exported PNG frame crops. Normal speed, fixed 0.5x display. Jump GIF is a non-looping copy of the full original; other GIFs compare the old keyframe candidate with revised loops."}
    for identity in ["male", "female"]:
        selection = profile["characters"][identity]
        _, original, _, source = base.source_frames(ROOT / selection["sourcePack"])
        _, old, _, previous = base.source_frames(ROOT / selection["previousPack"])
        data, manifest, _, current = base.source_frames(ROOT / f"docs/kling-motion/exports/{identity}.character.zip")
        row = next(item for item in compiled["packs"] if item["character"] == identity)
        assert base.sha(data) == row["packSha256"]
        for frame_id, image in current.items():
            assert image.tobytes() == source[frame_id].tobytes()
        for name in base.ACTIONS:
            before = original["animations"][name] if name == "jump" else old["animations"][name]
            before_frames = source if name == "jump" else previous
            after = manifest["animations"][name]
            for facing in ["right", "left"]:
                report["animations"].append({"character": identity, "action": name, "facing": facing,
                    **compare(identity, name, before_frames, current, before, after, facing, args.output)})
            review.key_sheet(identity, name, current, selection["actions"][name]["keys"], args.output)
            if name != "jump":
                report["diagnostics"].append({"character": identity, "action": name,
                    **diagnostic(source, before, after, original["animations"][name])})
        route_boards(identity, current, selection["routes"], args.output)
        for frames in [source, previous, current]:
            for image in frames.values():
                image.close()
    for path in sorted(args.output.iterdir()):
        if path.suffix not in [".png", ".gif"]:
            continue
        with Image.open(path) as image:
            count = getattr(image, "n_frames", 1)
            for index in range(count):
                image.seek(index)
                image.load()
            report["media"].append({"file": path.name, "frames": count, "size": list(image.size), "decoded": True, "sha256": base.sha(path.read_bytes())})
    report["passed"] = True
    (args.output / "media-validation.json").write_bytes(base.json_bytes(report))
    print(json.dumps({"passed": True, "gifs": len(report["animations"]), "media": len(report["media"])}))


if __name__ == "__main__":
    main()
