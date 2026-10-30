"""Compare PR53 and fitting-workbench actual UI exports; never fit or repaint art.

Both directories contain male.character.zip and female.character.zip exported
through the workbench with the same outfit/hair/color selections. The original
source packs are separately checked. Only labels, layouts and GIF encoding are
added here. Native PNGs remain the lossless review reference.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location(
    "review_exports", Path(__file__).with_name("review-kling-side-exports.py")
)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def signature(manifest):
    return {
        "frames": [(f["id"], f["width"], f["height"]) for f in manifest["frames"]],
        "animations": manifest["animations"],
        "anchor": manifest["anchor"],
        "facing": manifest["facing"],
    }


def details(frames, labels, crop, zoom):
    panels = []
    for frame, label in zip(frames, labels):
        art = frame.crop(crop)
        art = art.resize((art.width * zoom, art.height * zoom), Image.Resampling.NEAREST)
        panel = Image.new("RGB", (art.width, art.height + 36), review.BG)
        panel.paste(art, (0, 36), art)
        ImageDraw.Draw(panel).text((8, 8), label, font=review.FONT, fill=(57, 65, 61))
        panels.append(panel)
    row = Image.new("RGB", (sum(p.width for p in panels), max(p.height for p in panels)), review.BG)
    x = 0
    for panel in panels:
        row.paste(panel, (x, 0))
        x += panel.width
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {
        "source": "Before/after actual UI exported packs; presentation only",
        "inputs": [], "gifs": [], "frames": {},
        "limitations": [
            "Comparison GIFs use a shared indexed palette and half-size display.",
            "Native PNGs are lossless; 2x detail uses nearest-neighbor scaling.",
            "Jump retains the source two-jump one-shot, including its crouched ending.",
            "Changed-pixel counts locate changes; they do not certify artistic quality.",
        ],
    }
    after_bank = {}
    for gender in ("male", "female"):
        pairs = []
        for label, directory in (("Before", args.before), ("After", args.after)):
            path = directory / f"{gender}.character.zip"
            manifest, frames = review.read_pack(path)
            pairs.append((manifest, frames))
            report["inputs"].append({
                "character": gender, "version": label, "file": str(path),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
        before, after = pairs
        assert signature(before[0]) == signature(after[0]), "Source geometry or timing changed"
        source_path = Path("docs/kling-side-workspace/assets") / f"{gender}.source.zip"
        source_manifest, _ = review.read_pack(source_path)
        assert signature(after[0]) == signature(source_manifest), "Export differs from frozen source contract"
        after_bank[gender] = after
        report["frames"][gender] = []
        for fid, old in before[1].items():
            a, b = np.asarray(old), np.asarray(after[1][fid])
            report["frames"][gender].append({
                "frameId": fid, "changedPixels": int(np.any(a != b, axis=2).sum()),
                "alphaChangedPixels": int(np.sum(a[..., 3] != b[..., 3])),
            })
        for action in ("idle", "walk", "run", "jump"):
            clip = after[0]["animations"][action]
            assert clip["fps"] == 24
            for facing in ("right", "left"):
                sequence = [review.panel(
                    [before[1][fid], after[1][fid]],
                    [f"Before / {gender} {action}", f"After / {facing} / frame {fid}"],
                    direction=facing,
                ) for fid in clip["frames"]]
                report["gifs"].append(review.save_gif(
                    args.output / f"{gender}-{action}-{facing}.gif", sequence, loop=clip["loop"],
                ))
        ids = ([0, 67, 82, 86, 89, 95] if gender == "male" else [0, 38, 39, 49, 60, 67])
        rows = [review.panel([before[1][fid], after[1][fid]],
                            [f"Before / native frame {fid}", f"After / native frame {fid}"], scale=1)
                for fid in ids]
        sheet = Image.new("RGB", (rows[0].width, sum(r.height for r in rows)), review.BG)
        y = 0
        for row in rows:
            sheet.paste(row, (0, y)); y += row.height
        sheet.save(args.output / f"{gender}-keyposes-native.png")
        crops = ([(82, (150, 400, 310, 590)), (89, (150, 400, 310, 590)),
                  (67, (130, 330, 280, 460))] if gender == "male" else
                 [(39, (140, 385, 360, 630)), (49, (140, 385, 360, 630)),
                  (60, (130, 490, 380, 700)), (67, (130, 300, 380, 560))])
        rows = [details([before[1][fid], after[1][fid]],
                        [f"Before frame {fid} / 2x", f"After frame {fid} / 2x"], crop, 2)
                for fid, crop in crops]
        sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), review.BG)
        y = 0
        for row in rows:
            sheet.paste(row, (0, y)); y += row.height
        sheet.save(args.output / f"{gender}-details-2x.png")
    sequence = []
    for action, repetitions in (("walk", 2), ("run", 2), ("jump", 1)):
        clips = {g: bank[0]["animations"][action] for g, bank in after_bank.items()}
        assert len(clips["male"]["frames"]) == len(clips["female"]["frames"])
        for _ in range(repetitions):
            for i in range(len(clips["male"]["frames"])):
                sequence.append(review.panel(
                    [after_bank[g][1][clips[g]["frames"][i]] for g in ("male", "female")],
                    [f"Male / {action}", f"Female / {action}"],
                ))
    report["gifs"].append(review.save_gif(args.output / "pair-walk-run-two-jumps.gif", sequence, loop=False))
    (args.output / "review-index.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"comparisonGifs": len(report["gifs"]), "output": str(args.output)}))


if __name__ == "__main__":
    main()
