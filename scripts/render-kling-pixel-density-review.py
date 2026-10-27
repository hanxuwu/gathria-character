"""Present three actual app-exported pixel settings at identical physical scale.

6:1 pixels use3x nearest enlargement;8:1 pixels use4x. Different transparent
padding is placed by the declared anchors, never fitted to a pose. Runtime,
source artwork, frame clocks and the preceding review helpers stay unchanged.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts/render-kling-strong-pixels-review.py"
SPEC = importlib.util.spec_from_file_location("strong_pixel_review", HELPER)
SHARED = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SHARED)
Pack, solid, save_gif = SHARED.Pack, SHARED.solid, SHARED.gif
BG, INK = SHARED.BG, SHARED.INK
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
SMALL = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
TINY = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10)
LABELS = ["Current: 6:1 / 96 colors", "6:1 / 64 colors", "8:1 / 64 colors"]
ZOOMS = [3, 3, 4]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def strip(images, title, footer, labels=LABELS, font=SMALL):
    assert all(im.size == images[0].size for im in images)
    w, h = images[0].size
    board = Image.new("RGB", (w * len(images), h + 88), BG)
    draw = ImageDraw.Draw(board)
    draw.text((8, 8), title, font=FONT if w > 160 else TINY, fill=INK)
    for n, (im, label) in enumerate(zip(images, labels)):
        draw.text((n * w + 8, 32), label, font=font, fill=INK)
        board.paste(im, (n * w, 56))
    draw.text((8, h + 64), footer, font=font, fill=INK)
    return board


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="docs/kling-pixel-density/review")
    args = parser.parse_args()
    index_paths = [
        ROOT / "docs/kling-strong-pixels/evidence/final-v2/evidence-index.json",
        ROOT / "docs/kling-pixel-density/evidence/six-64/evidence-index.json",
        ROOT / "docs/kling-pixel-density/evidence/eight-64/evidence-index.json",
    ]
    captures = [json.loads(p.read_text()) for p in index_paths]
    assert all(c["passed"] and c["production"] for c in captures)
    tables = [{item["case"]: item for item in c["builds"]} for c in captures]
    assert set(tables[0]) == set(tables[1]) == set(tables[2])
    out = ROOT / args.output
    assert not out.exists() or not any(out.iterdir()), "Keep earlier review outputs"
    out.mkdir(parents=True, exist_ok=True)
    records, inputs = [], []

    def record(path, **metadata):
        with Image.open(path) as im:
            shape = {"width": im.width, "height": im.height, "frames": getattr(im, "n_frames", 1)}
            for frame in ImageSequence.Iterator(im):
                frame.load()
        records.append({"file": path.name, "bytes": path.stat().st_size,
                        "sha256": sha(path), **shape, **metadata})

    for key in tables[0]:
        items = [table[key] for table in tables]
        paths = [ROOT / item["pixelPack"]["file"] for item in items]
        report_paths = [ROOT / item["buildReport"]["file"] for item in items]
        reports = [json.loads(p.read_text()) for p in report_paths]
        assert [r["settings"] for r in reports] == [
            {"factor": 6, "colors": 96, "sampling": "detail", "finish": "cluster"},
            {"factor": 6, "colors": 64, "sampling": "detail", "finish": "cluster"},
            {"factor": 8, "colors": 64, "sampling": "detail", "finish": "cluster"},
        ]
        assert len({item["sourcePack"]["sha256"] for item in items}) == 1
        for path, item in zip(paths, items):
            assert sha(path) == item["pixelPack"]["sha256"]
        packs = [Pack(path) for path in paths]
        assert all(p.manifest["animations"] == packs[0].manifest["animations"] for p in packs)
        maps = [r["mapping"] for r in reports]
        anchors = [(m["anchor"]["x"] * z, m["anchor"]["y"] * z) for m, z in zip(maps, ZOOMS)]
        left, top = max(a[0] for a in anchors), max(a[1] for a in anchors)
        width = left + max(m["width"] * z - a[0] for m, z, a in zip(maps, ZOOMS, anchors))
        height = top + max(m["height"] * z - a[1] for m, z, a in zip(maps, ZOOMS, anchors))
        assert (width, height, left, top) == (384, 596, 192, 564)
        # Every source point's displacement from its anchor is multiplied by.5.
        assert all(z / m["factor"] == .5 for m, z in zip(maps, ZOOMS))

        def placed(fid):
            results = []
            for pack, z, anchor in zip(packs, ZOOMS, anchors):
                canvas = Image.new("RGB", (width, height), BG)
                canvas.paste(solid(pack.frame(fid), z), (left-anchor[0], top-anchor[1]))
                results.append(canvas)
            return results

        inputs.append({"case": key, "sourceSha256": items[0]["sourcePack"]["sha256"],
                       "settings": [r["settings"] for r in reports],
                       "packFiles": [str(p.relative_to(ROOT)) for p in paths],
                       "packSha256": [sha(p) for p in paths],
                       "reportSha256": [sha(p) for p in report_paths],
                       "integerZooms": ZOOMS, "displayCanvas": [width, height],
                       "displayAnchor": [left, top], "noFrameFittingOrRetiming": True})
        run = packs[0].manifest["animations"]["run"]
        poses = [placed(fid) for fid in run["frames"]]
        for facing in ["right", "left"]:
            boards = []
            for n, images in enumerate(poses):
                if facing == "left":
                    images = [im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for im in images]
                boards.append(strip(images, f"{key} | run {facing} | same displayed size",
                                    f"Position {n:02d} / source {run['frames'][n]} | original {run['fps']:g} FPS | 3x / 3x / 4x nearest display | in place"))
            path = out / f"{key}-run-three-settings-{facing}.gif"
            timing = save_gif(path, boards, [r["palette"] for r in reports], run["fps"], run["loop"], height)
            record(path, case=key, facing=facing, action="run", **timing)

        idle_id = packs[0].manifest["animations"]["idle"]["frames"][0]
        path = out / f"{key}-idle-three-settings.png"
        strip(placed(idle_id), f"{key} | same idle pose | three pixel settings",
              "Same source art and displayed scale. Detail sampling + cluster finish are held constant.").save(path)
        record(path, case=key, action="idle", frameId=idle_id)

        # Native crops retain their actual output pixels; smaller8:1 is clearly labeled.
        native = []
        nw = max(m["width"] for m in maps)
        nh = max(m["height"] for m in maps)
        nx, ny = max(m["anchor"]["x"] for m in maps), max(m["anchor"]["y"] for m in maps)
        for pack, m in zip(packs, maps):
            canvas = Image.new("RGB", (nw, nh), BG)
            canvas.paste(solid(pack.frame(idle_id)), (nx-m["anchor"]["x"], ny-m["anchor"]["y"]))
            native.append(canvas)
        path = out / f"{key}-native-three-settings.png"
        strip(native, f"{key} | actual native pixels, no enlargement",
              "128x198 / 128x198 / 96x149 native pixels",
              ["6:1 / 96 colors", "6:1 / 64 colors", "8:1 / 64 colors"], TINY).save(path)
        record(path, case=key, action="idle", native=True)

        alpha = packs[0].frame(run["frames"][0]).getchannel("A")
        bounds = alpha.resize((maps[0]["width"]*3, maps[0]["height"]*3), Image.Resampling.NEAREST).getbbox()
        crop_top = max(0, bounds[1]-8)
        crop = (max(0, bounds[0]-10), crop_top, min(width, bounds[2]+10),
                min(height, crop_top+round((bounds[3]-bounds[1])*.52)))
        heads = [im.crop(crop).resize(((crop[2]-crop[0])*2, (crop[3]-crop[1])*2), Image.Resampling.NEAREST) for im in poses[0]]
        path = out / f"{key}-head-three-settings.png"
        strip(heads, f"{key} | identical head crop | additional integer2x",
              "Same crop and anchor; effective6x /6x /8x enlargement. No per-face alignment.").save(path)
        record(path, case=key, cropInSharedDisplay=crop, additionalZoom=2)

        for variant, pack in zip(["six-64", "eight-64"], packs[1:]):
            thumbs = [solid(pack.frame(fid), 2) for fid in run["frames"]]
            w, h = thumbs[0].size
            columns = min(8, len(thumbs));rows = (len(thumbs)+columns-1)//columns
            board = Image.new("RGB", (w*columns, (h+24)*rows+32), BG)
            draw = ImageDraw.Draw(board)
            draw.text((8, 5), f"{key} | {variant} | complete run cycle | integer2x", font=FONT, fill=INK)
            for n, im in enumerate(thumbs):
                x, y = n%columns*w, 32+n//columns*(h+24)
                draw.text((x+8, y), f"Position {n:02d} / source {run['frames'][n]}", font=SMALL, fill=INK)
                board.paste(im, (x, y+24))
            path = out / f"{key}-{variant}-all-run-2x.png"
            board.save(path)
            record(path, case=key, variant=variant, positions=list(range(len(thumbs))), zoom=2)
        for pack in packs:
            pack.close()
        print(f"{key}: all comparison GIF character pixels exact, source IDs/clocks/anchors unchanged", flush=True)

    result = {"format": "gathria-pixel-density-review", "version": 1,
              "scriptSha256": sha(Path(__file__)), "helperSha256": sha(HELPER),
              "legacyHelperSha256": sha(ROOT/"scripts/render-kling-pixel-refinement-review.py"),
              "captureIndexes": [{"file":str(p.relative_to(ROOT)),"sha256":sha(p)} for p in index_paths],
              "inputs": inputs,"files": records,
              "provenance": "All character artwork decoded from actual application-exported packs. Columns6:1/96,6:1/64,8:1/64 at3x/3x/4x integer enlargement. One source-relative scale and declared anchor, no pose fitting or retiming. Comparison GIF character colors are exact; labels may be palette-mapped."}
    (out/"index.json").write_text(json.dumps(result, indent=2)+"\n")
    cards="\n".join(f'<figure><a href="{r["file"]}"><img loading="lazy" src="{r["file"]}" alt="{r["file"]}"></a><figcaption>{r["file"]}</figcaption></figure>' for r in records)
    (out/"index.html").write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pixel settings comparison</title><style>body{font:16px system-ui;background:#f0ede2;color:#2a352e;margin:24px}figure{margin:24px 0}img{max-width:100%;height:auto}figcaption{margin:8px 0}a{color:inherit}</style><h1>6:1/96 ·6:1/64 ·8:1/64</h1><p>Same displayed character size, source art and timing. Detail sampling and cluster finish held constant. Native previews intentionally show the actual different pixel dimensions. No runtime or default settings changed.</p>'+cards)


if __name__ == "__main__":
    main()
