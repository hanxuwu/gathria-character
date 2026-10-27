"""Compare actual legacy/strong application exports at one physical display scale.

4:1 pixels enlarged 2x and 6:1 pixels enlarged 3x occupy the same source-space
grid. No per-frame fitting, resampling of candidate pixels, or changed timing.
The character palettes are retained exactly in the comparison GIFs; only labels
may be palette-mapped. Original UI downloads remain separate and untouched.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts/render-kling-pixel-refinement-review.py"
SPEC = importlib.util.spec_from_file_location("legacy_pixel_review", HELPER)
LEGACY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LEGACY)
Pack = LEGACY.Pack
BG = (240, 237, 226)
INK = (42, 53, 46)
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
SMALL = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def solid(image, zoom=1):
    enlarged = image.resize((image.width * zoom, image.height * zoom), Image.Resampling.NEAREST)
    canvas = Image.new("RGB", enlarged.size, BG)
    canvas.paste(enlarged, (0, 0), enlarged)
    return canvas


def pair(left, right, title, caption, labels=None):
    assert left.size == right.size
    width, height = left.size
    board = Image.new("RGB", (width * 2, height + 88), BG)
    draw = ImageDraw.Draw(board)
    draw.text((12, 8), title, font=FONT, fill=INK)
    labels = labels or ["Previous: 4:1 / 128 colors / 2x", "Strong: 6:1 / 96 colors / 3x"]
    draw.text((12, 32), labels[0], font=SMALL, fill=INK)
    draw.text((width + 12, 32), labels[1], font=SMALL, fill=INK)
    board.paste(left, (0, 56))
    board.paste(right, (width, 56))
    draw.text((12, height + 64), caption, font=SMALL, fill=INK)
    return board


def gif(path, boards, palettes, fps, loop, body_height):
    # Preserve both exported character palettes. Quantization affects text only.
    colors = sorted({tuple(c) for palette in palettes for c in palette} | {BG, INK})
    assert len(colors) <= 256
    palette = Image.new("P", (1, 1))
    flat = [v for c in colors for v in c]
    palette.putpalette(flat + [0] * (768 - len(flat)))
    frames = [board.quantize(palette=palette, dither=Image.Dither.NONE) for board in boards]
    delays = [10 * (int((n + 1) * 100 / fps + .5) - int(n * 100 / fps + .5)) for n in range(len(frames))]
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=delays,
                   disposal=1, optimize=False, **({"loop": 0} if loop else {}))
    with Image.open(path) as decoded:
        assert decoded.n_frames == len(frames)
        assert (decoded.info.get("loop") == 0) == loop
        actual = []
        for n, frame in enumerate(ImageSequence.Iterator(decoded)):
            frame.load()
            actual.append(frame.info["duration"])
            # The whole character area, including the opaque matte, is exact.
            box = (0, 56, boards[n].width, 56 + body_height)
            assert frame.convert("RGB").crop(box).tobytes() == boards[n].crop(box).tobytes()
        assert actual == delays
    return {"durationMs": sum(delays), "delaysMs": delays,
            "loop": loop, "characterPixelsExact": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", default="final-v2")
    parser.add_argument("--output", default="docs/kling-strong-pixels/review")
    args = parser.parse_args()
    current_path = ROOT / "docs/kling-strong-pixels/evidence" / args.run / "evidence-index.json"
    previous_path = ROOT / "docs/kling-pixel-refinement/evidence/final-v1/evidence-index.json"
    current = json.loads(current_path.read_text())
    previous = json.loads(previous_path.read_text())
    assert current["passed"] and previous["passed"]
    old_by_case = {item["case"]: item for item in previous["builds"]}
    out = ROOT / args.output
    assert not out.exists() or not any(out.iterdir()), "Keep previous review evidence"
    out.mkdir(parents=True, exist_ok=True)
    records = []
    inputs = []

    def record(path, **metadata):
        with Image.open(path) as im:
            dimensions = {"width": im.width, "height": im.height, "frames": getattr(im, "n_frames", 1)}
            for frame in ImageSequence.Iterator(im):
                frame.load()
        records.append({"file": path.name, "sha256": sha(path), "bytes": path.stat().st_size,
                        **dimensions, **metadata})

    for item in current["builds"]:
        key = item["case"]
        old = old_by_case[key]
        old_path, new_path = ROOT / old["pixelPack"]["file"], ROOT / item["pixelPack"]["file"]
        assert sha(old_path) == old["pixelPack"]["sha256"]
        assert sha(new_path) == item["pixelPack"]["sha256"]
        old_report_path, new_report_path = ROOT / old["buildReport"]["file"], ROOT / item["buildReport"]["file"]
        before_report, after_report = json.loads(old_report_path.read_text()), json.loads(new_report_path.read_text())
        assert before_report["settings"] == {"factor": 4, "colors": 128, "sampling": "detail"}
        assert after_report["settings"] == {"factor": 6, "colors": 96, "sampling": "detail", "finish": "cluster"}
        before, after = Pack(old_path), Pack(new_path)
        assert before.manifest["animations"] == after.manifest["animations"]
        old_grid, new_grid = before_report["mapping"], after_report["mapping"]
        assert old_grid["sourceWidth"] == new_grid["sourceWidth"]
        assert old_grid["sourceHeight"] == new_grid["sourceHeight"]
        assert old_grid["padding"] == new_grid["padding"]
        assert old_grid["width"] * 2 == new_grid["width"] * 3
        assert old_grid["height"] * 2 == new_grid["height"] * 3
        assert {k: v * 2 for k, v in old_grid["anchor"].items()} == {k: v * 3 for k, v in new_grid["anchor"].items()}
        inputs.append({"case": key, "previousPackSha256": sha(old_path), "newPackSha256": sha(new_path),
                       "previousReportSha256": sha(old_report_path), "newReportSha256": sha(new_report_path),
                       "previousZoom": 2, "newZoom": 3, "sameDisplayedScaleAndAnchor": True})
        run = after.manifest["animations"]["run"]
        pairs = [(solid(before.frame(fid), 2), solid(after.frame(fid), 3)) for fid in run["frames"]]
        for direction in ["right", "left"]:
            boards = []
            for n, (left, right) in enumerate(pairs):
                if direction == "left":
                    left, right = [im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for im in (left, right)]
                boards.append(pair(left, right, f"{key} | run {direction} | same displayed scale",
                                   f"Position {n:02d} | source {run['frames'][n]} | original {run['fps']:g} FPS | in place"))
            path = out / f"{key}-run-comparison-{direction}.gif"
            timing = gif(path, boards, [before_report["palette"], after_report["palette"]], run["fps"], run["loop"], pairs[0][0].height)
            record(path, case=key, action="run", facing=direction, presentationOnly=True, **timing)

        for zoom in [1, 3]:
            chosen = [0, len(run["frames"]) // 4, len(run["frames"]) // 2, 3 * len(run["frames"]) // 4]
            thumbs = [solid(after.frame(run["frames"][n]), zoom) for n in chosen]
            w, h = thumbs[0].size
            board = Image.new("RGB", (w * 4, h + 60), BG)
            draw = ImageDraw.Draw(board)
            draw.text((8, 5), f"{key} | Strong pixels | {zoom}x", font=SMALL, fill=INK)
            for column, (n, im) in enumerate(zip(chosen, thumbs)):
                draw.text((column * w + 8, 27), f"Run position {n}", font=SMALL, fill=INK)
                board.paste(im, (column * w, 52))
            path = out / f"{key}-run-keyframes-{zoom}x.png"
            board.save(path)
            record(path, case=key, zoom=zoom, positions=chosen, presentationOnly=True)

        # Use one source-relative crop for both candidates, never align faces.
        frame_id = run["frames"][0]
        alpha = before.frame(frame_id).getchannel("A").resize(pairs[0][0].size, Image.Resampling.NEAREST)
        bounds = alpha.getbbox()
        top = max(0, bounds[1] - 8)
        crop = (max(0, bounds[0] - 10), top, min(alpha.width, bounds[2] + 10),
                min(alpha.height, top + round((bounds[3] - bounds[1]) * .52)))
        crops = [im.crop(crop).resize(((crop[2]-crop[0])*2, (crop[3]-crop[1])*2), Image.Resampling.NEAREST) for im in pairs[0]]
        path = out / f"{key}-head-comparison.png"
        head = pair(*crops, f"{key} | same head crop | additional 2x enlargement",
                    "One source-relative crop; no independent head alignment.",
                    ["Previous: 4:1 / 128 colors / 4x", "Strong: 6:1 / 96 colors / 6x"])
        head.save(path)
        record(path, case=key, cropInSharedDisplay=crop, additionalZoom=2, presentationOnly=True)
        before.close()
        after.close()
        print(f"{key}: comparison GIF character pixels exact; native and enlarged keyframes decoded", flush=True)

    index = {"format": "gathria-strong-pixels-review", "version": 1,
             "scriptSha256": sha(Path(__file__)), "helperSha256": sha(HELPER),
             "currentEvidenceSha256": sha(current_path), "previousEvidenceSha256": sha(previous_path),
             "provenance": "Actual application-exported CharacterPacks. Previous pixels enlarged2x, strong pixels3x, identical display scale and anchor. No retiming, pose fitting or smoothing. GIF character regions match source pack RGB exactly.",
             "inputs": inputs, "files": records}
    (out / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    cards = "\n".join(f'<figure><a href="{r["file"]}"><img loading="lazy" src="{r["file"]}" alt="{r["file"]}"></a><figcaption>{r["file"]}</figcaption></figure>' for r in records)
    (out / "index.html").write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Stronger Kling pixels</title><style>body{font:16px system-ui;background:#f0ede2;color:#2a352e;margin:24px}figure{margin:24px 0}img{max-width:100%;height:auto}figcaption{margin:8px 0}a{color:inherit}</style><h1>Stronger pixel finish</h1><p>Left: previous4:1/128colors at2x. Right: strong6:1/96colors at3x. Same displayed size, source pose and original timing. All character artwork comes from actual app exports; this gallery does not redraw it. Visual acceptance remains for review.</p>' + cards)


if __name__ == "__main__":
    main()
