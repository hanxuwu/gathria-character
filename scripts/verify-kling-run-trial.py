#!/usr/bin/env python3
"""Verify actual UI exports of the rejected sixteen-drawing run experiment.

Passing this script is file/playback verification, never visual acceptance.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import zipfile

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / os.environ.get("KLING_RUN_TRIAL_DIR", "docs/kling-theme-continuity/trial/evidence")
os.environ["KLING_THEME_CONTINUITY_DIR"] = str(OUT)
spec = importlib.util.spec_from_file_location("continuity", ROOT / "scripts/verify-kling-theme-continuity.py")
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
sha = lambda data: hashlib.sha256(data).hexdigest()


def main():
    raw = (OUT / "capture.json").read_bytes(); evidence = json.loads(raw)
    assert evidence["passed"] and evidence["production"] and not evidence["adopted"] and not evidence["catalogPublished"]
    assert sha((ROOT / evidence["input"]["file"]).read_bytes()) == evidence["input"]["sha256"]
    for file, expected in evidence["sourceHashes"].items(): assert sha((ROOT / file).read_bytes()) == expected
    catalog = (ROOT / "artwork/kling-themes/catalog-index.json").read_bytes()
    assert sha(catalog) == evidence["catalogSha256"]
    assert all(entry["key"] != evidence["input"]["themeKey"] for entry in json.loads(catalog))
    for field in ["errors", "failedRequests", "externalRequests"]: assert not evidence[field]
    assert len(evidence["downloads"]) == 35
    for row in evidence["downloads"]:
        data = (ROOT / row["file"]).read_bytes(); assert len(data) == row["bytes"] and sha(data) == row["sha256"]
    pack_row = next(row for row in evidence["downloads"] if row["kind"] == "pack")
    pack_path = ROOT / pack_row["file"]
    after = helper.helpers.Pack(pack_path)
    helper.helpers.nested_zip(pack_path.read_bytes())
    assert after.m == evidence["manifest"]
    with zipfile.ZipFile(ROOT / evidence["input"]["file"]) as theme:
        manifest = json.loads(theme.read("theme.json")); look = next(row for row in manifest["looks"] if row["logicalId"] == "base")
        assert theme.read(look["file"]) == pack_path.read_bytes()
    before = helper.helpers.Pack(ROOT / "docs/kling-theme-stability/evidence/male-pixel-v2-base.character.zip")
    regression = helper.compare_regression(before, after, "male", "base")
    clip = after.m["animations"]["run"]
    assert len(clip["frames"]) == 16 and clip["fps"] == 24 and clip["loop"]
    assert len({sha(after.frame(fid).tobytes()) for fid in clip["frames"]}) == 16
    assert {row["position"] for row in evidence["observed"]} == set(range(16))
    result = {"passed": False, "adopted": False, "visualDecision": "Rejected; anatomical and limb silhouette defects remain. Male shipping pixel R2 is unchanged.", "captureSha256": sha(raw), "capturedCommit": evidence["commitAtCapture"], "pngs": [], "gifs": [], "presentations": [], "actionRegressions": regression}
    for row in evidence["downloads"]:
        path = ROOT / row["file"]
        if row["kind"] == "frame":
            expected = after.frame(row["frameId"])
            if row["facing"] == "left": expected = ImageOps.mirror(expected)
            with Image.open(path) as image:
                image.load(); assert image.mode == "RGBA" and image.size == (192, 272) and image.tobytes() == expected.tobytes()
            result["pngs"].append({"file": row["file"], "nativeRgbaExact": True})
        elif row["kind"] == "gif": result["gifs"].append(helper.old.check_gif(path, after, "run", row["facing"]))
    for facing in ["left", "right"]:
        assert {row["position"] for row in evidence["downloads"] if row["kind"] == "frame" and row["facing"] == facing} == set(range(16))
        path = helper.REVIEW / f"male-base-run-r2-vs-rejected16-{facing}-2x.gif"
        result["presentations"].append(helper.comparison([before, after], ["Shipping R2 / retained actual export", "Rejected 16-drawing study / NOT adopted"], "run", "male", "base", facing, path))
    gifs = {row["facing"]: ROOT / row["file"] for row in evidence["downloads"] if row["kind"] == "gif"}
    helper.old.mirror_gifs(gifs["left"], gifs["right"])
    # No keyframe title claims this rejected art is a shipping revision.
    w, h, header = 192, 272, 28
    from PIL import ImageDraw
    sheet = Image.new("RGB", (w * 8, (h + header) * 3), helper.MATTE); draw = ImageDraw.Draw(sheet)
    rows = [(before, before.m["animations"]["run"]["frames"], "Shipping R2"), (after, clip["frames"][:8], "Rejected study 0-7"), (after, clip["frames"][8:], "Rejected study 8-15")]
    for row_index, (pack, ids, title) in enumerate(rows):
        for i, fid in enumerate(ids):
            x, y = i * w, row_index * (h + header)
            sheet.paste(helper.old.expected_gif(pack.frame(fid), True, "right"), (x, y + header)); draw.text((x + 3, y + 5), f"{title} / {i if row_index < 2 else i + 8}", font=helper.font, fill=(40, 60, 53))
    sheet.save(helper.REVIEW / "male-run-rejected-keyframes-1x.png")
    result["landmarks"] = {"before": helper.landmarks(before, "run"), "rejectedTrial": helper.landmarks(after, "run")}
    result["decodedPresentations"] = []
    for path in sorted(helper.REVIEW.iterdir()):
        with Image.open(path) as image:
            for i in range(getattr(image, "n_frames", 1)): image.seek(i); image.load()
        result["decodedPresentations"].append({"file": str(path.relative_to(ROOT)), "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size})
    before.close(); after.close(); result["passed"] = True
    (OUT.parent / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"passed": True, "adopted": False, "pngs": len(result["pngs"]), "gifs": len(result["gifs"]), "presentations": len(result["decodedPresentations"])}))


if __name__ == "__main__": main()
