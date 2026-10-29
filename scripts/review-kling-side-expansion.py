"""Make review layouts from actual UI-downloaded side-view CharacterPacks.

No clothing fitting or source repair runs here. All artwork comes from the
three exported packs; labels, layout, integer magnification and GIF palette
encoding are the only presentation operations.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location(
    "side_review", Path(__file__).with_name("review-kling-side-exports.py")
)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--before", type=Path, help="Actual UI snapshots of the rejected fitting iteration")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {
        "source": "Actual UI-downloaded CharacterPacks; presentation only.",
        "inputs": [],
        "gifs": [],
        "notes": [
            "Comparison GIFs show native artwork at half display size, at source 24 fps.",
            "Keyposes are native size. Detail crops use integer 2x nearest-neighbor enlargement.",
            "Jump is the unaltered two-jump one-shot and does not loop or recover upright.",
        ],
    }
    bank = {}
    for gender in ("male", "female"):
        bank[gender] = {}
        for look in ("original", "daily", "styled"):
            path = args.evidence / f"{gender}-{look}.character.zip"
            bank[gender][look] = review.read_pack(path)
            report["inputs"].append({
                "file": path.name,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
        source = bank[gender]["original"][0]
        assert source["facing"] == {"native": "right", "right": "none", "left": "mirror-x"}
        for manifest, _ in bank[gender].values():
            assert manifest["animations"] == source["animations"]
            # A baked export can repack atlas pages without changing native frames.
            # Compare frame identity and dimensions; read_pack resolves each rect.
            assert [(f["id"], f["width"], f["height"]) for f in manifest["frames"]] == [
                (f["id"], f["width"], f["height"]) for f in source["frames"]
            ]
            assert manifest["anchor"] == source["anchor"]
            assert manifest["facing"] == source["facing"]
        for action in ("idle", "walk", "run", "jump"):
            clip = source["animations"][action]
            assert clip["fps"] == 24
            for facing in ("right", "left"):
                sequence = [review.panel(
                    [bank[gender][look][1][fid] for look in ("original", "daily", "styled")],
                    [f"{gender} original / {action}", "new clothing", f"clothing + hair / {i + 1}"],
                    direction=facing,
                ) for i, fid in enumerate(clip["frames"])]
                report["gifs"].append(review.save_gif(
                    args.output / f"{gender}-{action}-{facing}.gif", sequence, loop=clip["loop"],
                ))
        poses = [("idle", 0), ("walk", 5), ("run", 8), ("jump", 14), ("jump", 38), ("jump", 49)]
        rows = []
        for look, (_, frames) in bank[gender].items():
            ids = [source["animations"][action]["frames"][i] for action, i in poses]
            rows.append(review.panel(
                [frames[fid] for fid in ids],
                [f"{look} / {action} [{i}] / pack frame {fid}" for (action, i), fid in zip(poses, ids)],
                scale=1,
            ))
        sheet = Image.new("RGB", (rows[0].width, sum(row.height for row in rows)), review.BG)
        for i, row in enumerate(rows):
            sheet.paste(row, (0, i * row.height))
        sheet.save(args.output / f"{gender}-keyposes-native.png")

        # Fixed same-frame head/cuff/waist crops, never independently realigned.
        detail_ids = [0, 42 if gender == "male" else 34, 48 if gender == "male" else 42,
                      97 if gender == "male" else 90]
        detail_rows = []
        for fid in detail_ids:
            source_frame = bank[gender]["original"][1][fid]
            boxes = [bank[gender][look][1][fid].getbbox() for look in ("original", "daily", "styled")]
            x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
            x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
            crop = (max(0, x0 - 18), max(0, y0 - 18), min(512, x1 + 18), min(768, y1 + 18))
            panels = []
            for look in ("original", "daily", "styled"):
                frame = bank[gender][look][1][fid].crop(crop)
                frame = frame.resize((frame.width * 2, frame.height * 2), Image.Resampling.NEAREST)
                canvas = Image.new("RGB", (frame.width, frame.height + 34), review.BG)
                canvas.paste(frame, (0, 34), frame)
                ImageDraw.Draw(canvas).text((8, 8), f"{gender} {look} / frame {fid} / 2x", font=review.FONT, fill=(57, 65, 61))
                panels.append(canvas)
            row = Image.new("RGB", (sum(p.width for p in panels), max(p.height for p in panels)), review.BG)
            x = 0
            for panel in panels:
                row.paste(panel, (x, 0))
                x += panel.width
            detail_rows.append(row)
        details = Image.new("RGB", (max(r.width for r in detail_rows), sum(r.height for r in detail_rows)), review.BG)
        y = 0
        for row in detail_rows:
            details.paste(row, (0, y))
            y += row.height
        details.save(args.output / f"{gender}-details-2x.png")

    sequence = []
    for action, repetitions in (("walk", 2), ("run", 2), ("jump", 1)):
        clip = bank["male"]["styled"][0]["animations"][action]
        for _ in range(repetitions):
            for i in range(len(clip["frames"])):
                frames = []
                for gender in ("male", "female"):
                    manifest, sprites = bank[gender]["styled"]
                    frames.append(sprites[manifest["animations"][action]["frames"][i]])
                sequence.append(review.panel(frames, [f"male / {action}", f"female / {action}"]))
    report["gifs"].append(review.save_gif(args.output / "pair-walk-run-two-jumps.gif", sequence, loop=False))
    if args.before:
        cases = [
            ("male", "walk", 35, (160, 460, 360, 650)),
            ("male", "run", 40, (150, 390, 400, 590)),
            ("female", "walk", 31, (150, 405, 410, 610)),
        ]
        rows = []
        report["fittingRepairs"] = []
        for gender, action, fid, crop in cases:
            paths = [args.before / f"{gender}-{action}-{fid}-before.png",
                     args.evidence / f"{gender}-daily-{action}-frame-{fid}.png"]
            panels = []
            for label, path in zip(("Before candidate", "Reviewed candidate"), paths):
                with Image.open(path) as decoded:
                    assert decoded.size == (512, 768)
                    art = decoded.convert("RGBA").crop(crop)
                art = art.resize((art.width * 2, art.height * 2), Image.Resampling.NEAREST)
                panel = Image.new("RGB", (art.width, art.height + 40), review.BG)
                panel.paste(art, (0, 40), art)
                ImageDraw.Draw(panel).text((8, 9), f"{label} / {gender} {action} {fid} / 2x", font=review.FONT, fill=(57, 65, 61))
                panels.append(panel)
            row = Image.new("RGB", (sum(p.width for p in panels), panels[0].height), review.BG)
            row.paste(panels[0], (0, 0)); row.paste(panels[1], (panels[0].width, 0))
            rows.append(row)
            report["fittingRepairs"].append({"character": gender, "action": action, "frameId": fid,
                "nativeCrop": list(crop), "scale": 2,
                "inputs": [{"file": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]})
        sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), review.BG)
        y = 0
        for row in rows:
            sheet.paste(row, (0, y)); y += row.height
        sheet.save(args.output / "fitting-repairs-before-after-2x.png")
    (args.output / "review-index.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"gifs": len(report["gifs"]), "output": str(args.output)}))


if __name__ == "__main__":
    main()
