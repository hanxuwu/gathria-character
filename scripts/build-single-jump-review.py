#!/usr/bin/env python3
"""Collect browser downloads and decode their seam frames; never repaint art."""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def collect(exports, destination):
    destination.mkdir(parents=True, exist_ok=True)
    inventory = []
    for character in ("male", "female"):
        source = exports / character
        target = destination / character
        target.mkdir(parents=True, exist_ok=True)
        proof = json.loads((source / "pixel-verification.json").read_text())
        assert proof.get("passed") is True, "Run the independent export audit first"
        for path in sorted(source.iterdir()):
            if path.suffix in (".gif", ".png", ".json"):
                shutil.copy2(path, target / path.name)
        for row in json.loads((source / "exports.json").read_text()):
            pack = Path(row["pack"])
            checked = next(r for r in proof["results"] if r["view"] == row["view"])
            assert checked["packSha256"] == sha(pack)
            assert checked["nativeAtlasBytesUnchanged"] is True
            for item in checked["gifFiles"]:
                assert sha(Path(item["file"])) == item["sha256"]
            with zipfile.ZipFile(pack) as archive:
                assert archive.testzip() is None
                manifest = json.loads(archive.read("manifest.json"))
                config = json.loads(archive.read("character.json"))
                for name in ("manifest", "character"):
                    (target / f'{row["view"]}.{name}.json').write_bytes(
                        archive.read(f"{name}.json")
                    )
            profile = config["sourceMetadata"]["gameplayMotion"]
            run = profile["actions"]["run"]
            jump = profile["actions"]["jump"]
            # This review requests Jump just after a complete run cycle.
            # Choose the earliest reviewed exit, independently of runtime code.
            exits = [r["exit"] for r in profile["routes"]
                     if r["from"] == "run" and r["to"] == "jump"]
            first_jump = len(run["frames"]) + min(exits)
            first_return = first_jump + len(jump["frames"])
            gif = Image.open(row["gifs"]["flow"]["right"])
            indices = [first_jump + offset for offset in range(-3, 5)]
            indices += [first_return + offset for offset in range(-4, 4)]
            panel = gif.size
            sheet = Image.new("RGB", (panel[0] * 8, (panel[1] + 24) * 2), "#eee9df")
            draw = ImageDraw.Draw(sheet)
            for i, tick in enumerate(indices):
                assert 0 <= tick < gif.n_frames
                gif.seek(tick)
                x, y = (i % 8) * panel[0], (i // 8) * (panel[1] + 24)
                sheet.paste(gif.convert("RGB"), (x, y + 24))
                draw.text((x + 4, y + 4), f"Export tick {tick}", fill="#243b32")
            seam = target / f'{row["view"]}-actual-flow-seams.png'
            sheet.save(seam)
            inventory.append({
                "character": character, "view": row["view"],
                "packSha256": sha(pack), "packBytes": pack.stat().st_size,
                "atlasBaseline": row["baseline"],
                "profileId": profile["id"], "sourceSha256": profile["sourceSha256"],
                "jump": jump, "firstJumpTick": first_jump,
                "firstReturnTick": first_return, "flowTicks": gif.n_frames,
                "seamPreview": str(seam.relative_to(destination)),
                "nativeAtlasAndFrameCellsUnchanged": True,
                "fullPackLocation": "Download CharacterPack from the application; native atlas is identical to the cited baseline.",
            })
    media = []
    for path in sorted(destination.rglob("*")):
        if path.is_file() and path.name != "inventory.json":
            media.append({"file": str(path.relative_to(destination)),
                          "bytes": path.stat().st_size, "sha256": sha(path)})
    report = {"format": "gathria-single-jump-review", "version": 1,
              "artwork": "Application downloads; seam PNGs decode the actual exported GIF at native GIF size.",
              "exports": inventory, "files": media}
    (destination / "inventory.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"files": len(media), "bytes": sum(f["bytes"] for f in media)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exports", type=Path, default=Path("/tmp/single-jump/exports"))
    parser.add_argument("--destination", type=Path, default=ROOT / "docs/kling-single-jump/review")
    args = parser.parse_args()
    collect(args.exports, args.destination)
