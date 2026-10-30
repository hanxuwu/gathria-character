"""Reproduce manually reviewed male-jump head protection corrections only.

Each splice removes a reviewed shoulder/arm excursion from the frozen polygon.
Original upper-head vertices remain exact; inserted lower contours are explicit
native-coordinate estimates inspected on the actual source frame. No art edits.
"""
from pathlib import Path
import hashlib
import io
import json
import zipfile
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[4]
REG_SHA = "678aaab17e209add4c349008cc400d028db241ec5607e8877b69c4aee98472f5"
PACK_SHA = "7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42"
# start inclusive, end exclusive, replacement native vertices. Empty replacement
# directly joins the two retained source contour vertices around an excursion.
SPLICES = {
    59: [(20, 30, [])],
    61: [(22, 34, [(263, 428), (282, 439), (296, 441), (292, 428), (317, 429), (340, 424), (360, 415)])],
    62: [(11, 15, []), (22, 32, [(321, 443), (346, 444), (365, 436), (380, 424)])],
    63: [(8, 16, []), (23, 28, [(329, 462), (349, 462), (372, 454), (389, 442)])],
    64: [(10, 19, []), (27, 38, [(326, 483), (351, 484), (377, 478), (393, 466), (401, 450)])],
    65: [(10, 20, []), (27, 36, [(326, 497), (346, 505), (368, 504), (388, 497), (402, 484), (410, 466)])],
    66: [(12, 21, []), (29, 41, [(321, 499), (342, 508), (364, 507), (386, 498), (401, 483), (407, 465)])],
    67: [(11, 15, []), (23, 26, [(290, 478), (298, 476), (299, 462), (307, 463), (326, 472), (350, 473), (370, 465)])],
    71: [(25, 34, [])],
    72: [(20, 28, []), (33, 41, [])],
    73: [(24, 33, []), (40, 49, [])],
    74: [(15, 23, []), (29, 41, [])],
    75: [(11, 20, [(219, 275), (221, 285)]), (25, 38, [(274, 286)])],
    76: [(17, 30, [(221, 300)]), (39, 44, [(300, 315), (324, 314), (341, 306), (354, 295)])],
    77: [(11, 21, [(226, 332)]), (30, 46, [(288, 353), (309, 356), (331, 353), (350, 343), (363, 329), (365, 310)])],
    78: [(18, 26, [(235, 389)]), (34, 51, [(315, 412), (337, 414), (356, 408), (373, 395), (382, 377), (383, 359)])],
    79: [(12, 23, [(249, 444)]), (28, 35, [(311, 474), (332, 478), (353, 476), (374, 469), (391, 457)])],
    80: [(7, 15, []), (21, 32, [])],
    81: [(16, 27, []), (34, 39, [])],
    82: [(20, 31, []), (37, 44, [])],
    83: [(18, 29, []), (37, 41, [])],
    84: [(18, 26, []), (34, 38, [])],
    85: [(23, 31, []), (38, 43, [])],
    86: [(25, 32, []), (40, 44, [])],
    87: [(20, 28, []), (37, 44, [])],
    88: [(22, 31, []), (36, 42, [])],
    89: [(22, 29, []), (36, 44, [])],
    90: [(7, 16, []), (22, 35, [])],
    91: [(24, 35, []), (39, 49, [])],
    92: [(18, 30, []), (36, 38, [])],
    93: [(25, 34, []), (41, 48, [])],
    94: [(24, 38, []), (43, 50, [])],
    95: [(24, 34, []), (41, 47, [])],
    96: [(23, 34, [])],
    97: [(24, 34, [])],
    98: [(11, 15, []), (20, 33, [(292, 315)])],
    99: [(17, 28, []), (36, 42, [(307, 347), (324, 349), (343, 343), (359, 333)])],
    100: [(24, 34, [(310, 392), (335, 393), (356, 382), (372, 367), (376, 348), (371, 337)])],
    101: [(8, 16, []), (25, 31, [(309, 442), (329, 442), (349, 434), (362, 424)])],
    102: [(27, 38, []), (45, 52, [])],
    103: [(23, 34, []), (42, 46, [])],
    104: [(22, 32, []), (39, 44, [])],
    105: [(16, 26, []), (35, 41, [])],
    106: [(14, 23, []), (30, 34, [])],
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def raster(polygon):
    """Pixel-center polygon test; audit only, not an artwork mask."""
    ys, xs = np.mgrid[0:768, 0:512]
    x, y = xs + 0.5, ys + 0.5
    inside = np.zeros((768, 512), bool)
    for i, b in enumerate(polygon):
        a = polygon[i - 1]
        if a["y"] != b["y"]:
            crossing = ((a["y"] > y) != (b["y"] > y))
            hit = a["x"] + (y - a["y"]) * (b["x"] - a["x"]) / (b["y"] - a["y"])
            inside ^= crossing & (x < hit)
    return inside


def main():
    reg_bytes = (ROOT / "artwork/kling-side-workspace/registration/male/registration.json").read_bytes()
    pack_bytes = (ROOT / "docs/kling-side-workspace/assets/male.source.zip").read_bytes()
    assert sha(reg_bytes) == REG_SHA and sha(pack_bytes) == PACK_SHA
    registration = json.loads(reg_bytes)
    with zipfile.ZipFile(io.BytesIO(pack_bytes)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        pages = [Image.open(io.BytesIO(archive.read(p["file"]))).convert("RGBA")
                 for p in [manifest["spritesheet"], *manifest.get("additionalSheets", [])]]
        frames = {f["id"]: pages[f.get("page", 0)].crop((f["x"], f["y"], f["x"] + 512, f["y"] + 768))
                  for f in manifest["frames"]}
    corrections, checks = [], []
    original, reviewed = {}, {}
    for frame_id in range(57, 107):
        frame = registration["frames"][frame_id]
        old = next(p["polygon"] for p in frame["protected"] if p["label"] == "head")
        original[frame_id] = old
        new = old.copy()
        for start, end, vertices in reversed(SPLICES.get(frame_id, [])):
            new[start:end] = [{"x": x, "y": y} for x, y in vertices]
        reviewed[frame_id] = new
        before_mask, after_mask = raster(old), raster(new)
        visible = np.asarray(frames[frame_id])[:, :, 3] > 0
        changed = before_mask != after_mask
        changed_rows = np.where(changed)[0]
        checks.append({"frameId": frame_id, "sourceFrame": frame["sourceFrame"],
            "sourceRgbaSha256": sha(frames[frame_id].tobytes()),
            "status": "reviewed-correction" if frame_id in SPLICES else "reviewed-unchanged",
            "removedProtectedSourcePixels": int((before_mask & ~after_mask & visible).sum()),
            "addedProtectedSourcePixels": int((after_mask & ~before_mask & visible).sum()),
            "upperRowsExactThroughInclusive": int(changed_rows.min() - 1) if len(changed_rows) else 767,
            "upperContourVerticesRetainedExactly": True,
            "artworkChanged": False, "handsOrAnchorsChanged": False})
        if frame_id not in SPLICES:
            continue
        corrections.append({
            "frameId": frame_id, "sourceFrame": frame["sourceFrame"], "sourceId": "male-2360",
            "label": "head", "polygon": new, "pointUpdates": {},
            "reason": "Native source review: remove head-protection excursions onto shoulders/raised arms. Retain original upper cranium, face and ear contour; explicitly reviewed lower head/neck splice. This corrects protection metadata, not source artwork.",
            "sourcePackSha256": PACK_SHA, "sourceRegistrationSha256": REG_SHA,
            "sourceRgbaSha256": sha(frames[frame_id].tobytes()),
            "reviewedSplices": [{"startInclusive": start, "endExclusive": end, "insertedNativeVertices": vertices}
                                for start, end, vertices in SPLICES[frame_id]],
        })
    out = ROOT / "artwork/kling-side-expansion/templates/source-review"
    out.mkdir(exist_ok=True, parents=True)
    (out / "male-jump-head-corrections.json").write_text(json.dumps(corrections, indent=2) + "\n")
    (out / "male-jump-head-audit.json").write_text(json.dumps({
        "format": "gathria-source-native-protection-review", "version": 1,
        "sourcePackSha256": PACK_SHA, "sourceRegistrationSha256": REG_SHA,
        "scope": "All 50 male jump head-protection regions, native boundary contacts plus full native difficult poses. Hands/anchors and other actions are reviewed separately by garment_templates/QA.",
        "sourceId": "male-2360", "reviewedFrames": 50, "correctedFrames": len(corrections),
        "frozenInputsUnchanged": True, "newRegistrationIntegrationRequired": True,
        "limitations": "Lower head/neck joins are manually reviewed protection estimates, not recovered anatomy. Warm skin proof and actual visible fist protection remain separate checks; this file does not authorize skin painting or alteration of source art.",
        "frames": checks,
    }, indent=2) + "\n")
    temporary = Path("/tmp/side-expansion/source/head-review")
    temporary.mkdir(exist_ok=True, parents=True)
    evidence = ROOT / "docs/kling-side-expansion/templates/source-review"
    evidence.mkdir(exist_ok=True, parents=True)
    for offset in range(0, 50, 10):
        sheet = Image.new("RGB", (1360, 1000), "#eee7db")
        draw = ImageDraw.Draw(sheet)
        for i, frame_id in enumerate(range(57 + offset, min(67 + offset, 107))):
            polygons = [original[frame_id], reviewed[frame_id]]
            bottom = max(p["y"] for p in original[frame_id])
            crop = (90, bottom - 120, 430, bottom + 40)
            for column, polygon in enumerate(polygons):
                image = Image.new("RGBA", (512, 768), "#eee7db")
                image.alpha_composite(frames[frame_id])
                overlay = Image.new("RGBA", image.size)
                ImageDraw.Draw(overlay).polygon([(v["x"], v["y"]) for v in polygon], fill=(0, 150, 70, 65), outline=(0, 130, 50, 255))
                image.alpha_composite(overlay)
                x, y = (i % 2) * 680 + column * 340, (i // 2) * 200
                sheet.paste(image.crop(crop), (x, y + 30))
                draw.text((x + 4, y + 8), f"ID{frame_id} src{frame_id+143} " + ("old" if column == 0 else "reviewed"), fill="black")
        sheet.save(temporary / f"reviewed-{offset:02}.png")
        sheet.save(evidence / f"male-jump-head-{offset:02}.png")
    image = frames[97]
    sheet = Image.new("RGB", (680, 390), "#eee7db")
    draw = ImageDraw.Draw(sheet)
    for i, polygon in enumerate([original[97], reviewed[97]]):
        base = Image.new("RGBA", image.size, "#eee7db")
        base.alpha_composite(image)
        overlay = Image.new("RGBA", image.size)
        ImageDraw.Draw(overlay).polygon([(v["x"], v["y"]) for v in polygon], fill=(0, 150, 70, 65), outline=(0, 130, 50, 255))
        base.alpha_composite(overlay)
        sheet.paste(base.crop((100, 40, 420, 400)), (i * 340, 30))
        draw.text((i * 340 + 5, 8), "Frozen head" if i == 0 else "Reviewed: shoulder island removed", fill="black")
    sheet.save(evidence / "male97-head-before-after.png")
    assert sha((ROOT / "artwork/kling-side-workspace/registration/male/registration.json").read_bytes()) == REG_SHA
    assert sha((ROOT / "docs/kling-side-workspace/assets/male.source.zip").read_bytes()) == PACK_SHA
    print(f"Wrote {len(corrections)} reviewed head corrections; unchanged jump frames: {[i for i in range(57,107) if i not in SPLICES]}")


if __name__ == "__main__":
    main()
