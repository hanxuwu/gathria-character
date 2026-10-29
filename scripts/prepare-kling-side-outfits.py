"""Prepare source-bound daily material outfits on the reviewed side-view masks.

These are silhouette-preserving material/color studies, not newly painted cuts.
All source-alpha and pixels outside the registered garment ownership stay exact.
"""

from pathlib import Path
import hashlib
import io
import json
import shutil
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/kling-side-workspace/assets"
REGISTRATION = ROOT / "artwork/kling-side-workspace/registration"
LOOKS = {
    "male": {
        "id": "seabreeze",
        "name": "海盐日常",
        "slots": {
            "top": {
                "name": "海盐蓝背心",
                "rgb": [80, 139, 158],
                "reference": 158,
                "outline": 48,
            },
            "bottom": {
                "name": "沙色短裤",
                "rgb": [139, 117, 88],
                "reference": 44,
                "outline": 13,
            },
            "shoes": {
                "name": "奶油白便鞋",
                "rgb": [233, 223, 202],
                "reference": 225,
                "outline": 55,
            },
        },
    },
    "female": {
        "id": "apricot",
        "name": "杏桃日常",
        "slots": {
            "top": {
                "name": "杏桃背心",
                "rgb": [204, 135, 120],
                "reference": 154,
                "outline": 48,
            },
            "bottom": {
                "name": "雾蓝短裤",
                "rgb": [75, 104, 128],
                "reference": 44,
                "outline": 13,
            },
            "shoes": {
                "name": "米白粉边便鞋",
                "rgb": [239, 218, 213],
                "reference": 225,
                "outline": 55,
            },
        },
    },
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(image):
    out = io.BytesIO()
    Image.fromarray(image, "RGBA").save(out, format="PNG")
    return out.getvalue()


def load_source(identity):
    data = (ASSETS / f"{identity}.source.zip").read_bytes()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        config = json.loads(archive.read("character.json"))
        pages = [
            np.array(Image.open(io.BytesIO(archive.read(meta["file"]))).convert("RGBA"))
            for meta in [manifest["spritesheet"], *manifest.get("additionalSheets", [])]
        ]
        frames = {
            f["id"]: pages[f.get("page", 0)][
                f["y"] : f["y"] + f["height"], f["x"] : f["x"] + f["width"]
            ].copy()
            for f in manifest["frames"]
        }
    return data, manifest, config, frames


def recolor(source, mask, material):
    """Keep original folds/outline contrast; material is deterministic, not AI art."""
    result = source.copy()
    rgb = source[:, :, :3].astype(float)
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722])
    # Fixed reference per material across the whole sequence prevents flicker
    # from fitting a new palette or brightness to each pose independently.
    ratio = luminance / material["reference"]
    target = np.minimum(255, ratio[:, :, None] * np.array(material["rgb"]))
    preserve_ink = np.clip((luminance - material["outline"]) / 24, 0, 1)
    target = rgb * (1 - preserve_ink[:, :, None]) + target * preserve_ink[:, :, None]
    result[mask, :3] = np.rint(target[mask]).astype(np.uint8)
    assert np.array_equal(result[:, :, 3], source[:, :, 3])
    assert np.array_equal(result[~mask], source[~mask])
    return result


def package(identity, slot, settings, registration_bytes, registration, frames):
    entries, pieces, checks = [], {}, []
    page_width, page_height = 2048, 4096
    page, x, y, row_height = 0, 0, 0, 0
    heights = []
    for frame_id, source in sorted(frames.items()):
        path = REGISTRATION / identity / "masks" / f"{frame_id:04d}-{slot}.png"
        mask_image = np.array(Image.open(path).convert("L"))
        assert set(np.unique(mask_image)).issubset({0, 255}), path
        mask = mask_image == 255
        assert mask.any() and not (mask & (source[:, :, 3] == 0)).any(), path
        styled = recolor(source, mask, settings)
        ys, xs = np.where(mask)
        left, top, right, bottom = (
            int(xs.min()),
            int(ys.min()),
            int(xs.max() + 1),
            int(ys.max() + 1),
        )
        width, height = right - left, bottom - top
        if x + width > page_width:
            x, y, row_height = 0, y + row_height, 0
        if y + height > page_height:
            heights.append(y + row_height)
            page, x, y, row_height = page + 1, 0, 0, 0
        patch = np.zeros_like(styled)
        patch[mask] = styled[mask]
        pieces[frame_id] = (patch[top:bottom, left:right], mask[top:bottom, left:right])
        entries.append(
            {
                "frameId": frame_id,
                "page": page,
                "rect": {"x": x, "y": y, "width": width, "height": height},
                "offset": {"x": left, "y": top},
            }
        )
        checks.append(
            {
                "frameId": frame_id,
                "ownedPixels": int(mask.sum()),
                "changedRgbPixels": int(
                    np.any(styled[:, :, :3] != source[:, :, :3], axis=2).sum()
                ),
                "sourceAlphaExact": True,
                "outsideOwnershipExact": True,
            }
        )
        x += width + 2
        row_height = max(row_height, height + 2)
    heights.append(y + row_height)
    assert (
        len(heights) <= 4 and sum(page_width * h for h in heights) <= 32 * 1024 * 1024
    )
    files, pages = {}, []
    for page, height in enumerate(heights):
        rgba = np.zeros((height, page_width, 4), np.uint8)
        ownership = np.zeros_like(rgba)
        for entry in entries:
            if entry["page"] != page:
                continue
            rect = entry["rect"]
            x, y, w, h = (rect[k] for k in ["x", "y", "width", "height"])
            patch, mask = pieces[entry["frameId"]]
            rgba[y : y + h, x : x + w] = patch
            ownership[y : y + h, x : x + w, 3] = mask.astype(np.uint8) * 255
        filename, maskname = f"patches-{page}.png", f"ownership-{page}.png"
        files[filename], files[maskname] = encoded(rgba), encoded(ownership)
        pages.append(
            {
                "file": filename,
                "maskFile": maskname,
                "width": page_width,
                "height": height,
            }
        )
    look = LOOKS[identity]
    item_id = f"side-{identity}-{look['id']}-{slot}-v1"
    provenance = (
        "Offline material/color study on the character's own source-video garment pixels, using separately reviewed side-view ownership. "
        "Same cut and silhouette; original shading retained with a fixed luminance mapping across frames. No new sleeves, skirt, anatomy, or generative redraw. "
        "Anchors and masks belong only to the exact source/registration hashes below. Estimated hidden anchors are authoring guides, not recovered skeleton joints."
    )
    manifest = {
        "format": "gathria-sprite-garment",
        "version": 1,
        "id": item_id,
        "name": settings["name"],
        "slot": slot,
        "sourceSha256": registration["sourceSha256"],
        "registrationSha256": sha(registration_bytes),
        "characterId": registration["characterId"],
        "frameWidth": 512,
        "frameHeight": 768,
        "pages": pages,
        "frames": entries,
        "provenance": provenance,
    }
    files["manifest.json"] = (
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode()
    path = ASSETS / f"{identity}-{slot}.garment.zip"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
    return {
        "id": item_id,
        "file": path.name,
        "sha256": sha(path.read_bytes()),
        "bytes": path.stat().st_size,
        "material": settings,
        "frames": checks,
        "provenance": provenance,
    }


def main():
    results = []
    for identity in LOOKS:
        source_bytes, manifest, config, frames = load_source(identity)
        registration_bytes = (
            REGISTRATION / identity / "registration.json"
        ).read_bytes()
        registration = json.loads(registration_bytes)
        assert registration["sourceSha256"] == sha(source_bytes)
        assert registration["characterId"] == config["characterId"]
        assert {frame["frameId"] for frame in registration["frames"]} == set(frames)
        shutil.copyfile(
            REGISTRATION / identity / "registration.json",
            ASSETS / f"{identity}.registration.json",
        )
        for slot, settings in LOOKS[identity]["slots"].items():
            result = package(
                identity, slot, settings, registration_bytes, registration, frames
            )
            results.append(result)
            print(result["id"], result["bytes"], flush=True)
    (ASSETS / "outfits-audit.json").write_text(
        json.dumps(
            {"passed": True, "looks": LOOKS, "items": results},
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
