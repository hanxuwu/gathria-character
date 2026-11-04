#!/usr/bin/env python3
"""Author only candidate107/108 daily cloth from the existing painted donor.

The final candidate source and manual registration are inputs. A shared
ExtensionContext derives source-visible masks for these authored poses; their
IDs are never interpreted as old video frame numbers. No original garment bank
or source file is written. Output patches are full native 512x768 RGBA.

Example:
  python scripts/build-landing-production-daily.py --source SOURCE.zip \
    --registration REGISTRATION.json --out /tmp/landing-production/daily
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IDS = (107, 108)
SIZE = (512, 768)
DONOR = ROOT / "artwork/kling-side-expansion/male/painted-donor.png"
DONOR_SHA256 = "5198b3ed5c9c3139d0e61606be89d2f8290787074b8c639680c1db5f5cc31185"
PALETTES = {
    "top": {"sourceRgb": [220, 125, 94], "targetRgb": [80, 139, 158]},
    "bottom": {"sourceRgb": [206, 182, 154], "targetRgb": [139, 117, 88]},
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def module(path: Path, name: str):
    """Import definition-only authoring modules; never call their main()."""
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    imported = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(imported)
    return imported


def encode_png(pixels: np.ndarray) -> bytes:
    output = io.BytesIO()
    Image.fromarray(pixels).save(output, format="PNG", compress_level=9)
    return output.getvalue()


def save(path: Path, data: bytes, check: bool) -> None:
    if check:
        assert path.read_bytes() == data, f"Reproduction mismatch: {path}"
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def recolor(patch: np.ndarray, owned: np.ndarray, slot: str) -> np.ndarray:
    """Exact published owned-chromatic-ratio-v1 palette, ties-to-even rounding.

    This is the same material calculation as garment-authoring.ts and the
    male side seed in build-dual-tailored-male.mjs. Ownership/alpha are retained.
    """
    output = patch.copy()
    allowed = owned & (patch[:, :, 3] > 0)
    rgb = patch[:, :, :3].astype(np.float64)
    material = PALETTES[slot]
    source_rgb = np.array(material["sourceRgb"], np.float64)
    target_rgb = np.array(material["targetRgb"], np.float64)
    mean = np.maximum(1.0, rgb.mean(axis=2))
    distance = np.linalg.norm(rgb / mean[:, :, None] - source_rgb / source_rgb.mean(), axis=2)
    tolerance = 0.5
    weight = np.clip((tolerance - distance) / (tolerance * 0.35), 0, 1)
    weight *= np.clip((mean - 28) / 42, 0, 1)
    replacement = np.clip(rgb * target_rgb / source_rgb, 0, 255)
    painted = np.rint(rgb * (1 - weight[:, :, None]) + replacement * weight[:, :, None]).astype(np.uint8)
    output[allowed, :3] = painted[allowed]
    assert np.array_equal(output[:, :, 3], patch[:, :, 3])
    assert np.array_equal(output[~allowed], patch[~allowed])
    return output


def ownership_rgba(owned: np.ndarray) -> np.ndarray:
    pixels = np.zeros((*owned.shape, 4), np.uint8)
    pixels[owned] = [255, 255, 255, 255]
    return pixels


def load_source(source_path: Path, registration_path: Path, out: Path, check: bool, fixture: bool):
    source = source_path.read_bytes()
    registration_bytes = registration_path.read_bytes()
    registration = json.loads(registration_bytes)
    assert registration["sourceSha256"] == sha(source), "Registration/source checksum mismatch"
    assert registration["characterId"] == "kling-male-side-landing-candidate-v1"
    assert registration["frameWidth"] == 512 and registration["frameHeight"] == 768
    assert sorted(frame["frameId"] for frame in registration["frames"]) == list(range(109))
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        recipe = json.loads(archive.read("character.json"))
        assert recipe["characterId"] == registration["characterId"]
        candidate = recipe.get("sourceMetadata", {}).get("landingCandidate", {})
        expected_status = "schema-fixture-only" if fixture else "generated-review-candidate"
        assert candidate.get("status") == expected_status, "Fixture testing requires explicit --fixture-only; final cloth requires authored candidate inputs"
        assert candidate.get("visualAcceptance") == "pending"
        assert sorted(frame["id"] for frame in manifest["frames"]) == list(range(109))
        sheets = [manifest["spritesheet"], *manifest.get("additionalSheets", [])]
        pages = {}
        paths = {}
        for frame_id in IDS:
            frame = next(item for item in manifest["frames"] if item["id"] == frame_id)
            assert (frame["width"], frame["height"]) == SIZE
            page = frame.get("page", 0)
            if page not in pages:
                pages[page] = Image.open(io.BytesIO(archive.read(sheets[page]["file"]))).convert("RGBA")
            native = pages[page].crop((frame["x"], frame["y"], frame["x"] + 512, frame["y"] + 768))
            paths[frame_id] = out / f"source-{frame_id}.png"
            save(paths[frame_id], encode_png(np.asarray(native)), check)
    return source, registration_bytes, registration, paths


def board(originals: dict, dressed: dict) -> bytes:
    """Fixed native display scale only; this review board is not runtime art."""
    image = Image.new("RGB", (512 * 2, 790 * 2), "#eee8dd")
    draw = ImageDraw.Draw(image)
    for column, frame_id in enumerate(IDS):
        for row, (label, frames) in enumerate((("original", originals), ("daily", dressed))):
            rgba = Image.fromarray(frames[frame_id])
            image.paste(rgba, (column * 512, row * 790 + 22), rgba)
            draw.text((column * 512 + 12, row * 790 + 6), f"{label} / {frame_id} / native 1x", fill="#352d28")
    output = io.BytesIO()
    image.save(output, format="PNG", compress_level=9)
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "docs/kling-landing-production/assets/male.source.zip")
    parser.add_argument("--registration", type=Path, default=ROOT / "docs/kling-landing-production/assets/male.registration.json")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--masks", type=Path, help="Optional separately reviewed L masks named FRAME-{top,bottom,shoes,skin}.png")
    parser.add_argument("--guides", type=Path, help="Optional cloth-only shoulder guides JSON: {107:{near:[x,y]},108:{near:[x,y]}}")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--fixture-only", action="store_true", help="Technical contract exercise only; requires explicitly marked schema-fixture source")
    args = parser.parse_args()
    assert sha(DONOR.read_bytes()) == DONOR_SHA256, "Use the recorded existing cloth-only donor"
    source, registration_bytes, registration, paths = load_source(args.source, args.registration, args.out, args.check, args.fixture_only)
    wedding = module(ROOT / "scripts/prepare-landing-side-wedding.py", "landing_wedding_daily_context")
    assert hasattr(wedding, "ExtensionContext"), "Shared authored-pose ExtensionContext is not ready"
    # The imported modules define functions/constants and read their immutable
    # donor recipes. Their guarded main() publishing routines are never invoked.
    cloth = wedding.cloth
    context = wedding.ExtensionContext(paths, registration, args.masks)
    guides = json.loads(args.guides.read_bytes()) if args.guides else {}
    dressed = {}
    records = []
    garment_inputs = {"dailyTop": {"frames": []}, "dailyBottom": {"frames": []}}
    for frame_id in IDS:
        masks = context.masks(frame_id)
        assert set(masks) >= {"top", "bottom", "shoes", "skin"}
        for name, mask in masks.items():
            assert mask.shape == (768, 512), f"{frame_id}/{name}: wrong mask dimensions"
            save(args.out / "masks" / f"{frame_id}-{name}.png", encode_png(mask.astype(np.uint8) * 255), args.check)
        assert masks["top"].any() and masks["bottom"].any() and masks["shoes"].any(), f"{frame_id}: incomplete semantic mask"
        limbs = cloth.limbs(context, frame_id, masks)
        top, top_owned = cloth.shirt(context, frame_id, masks, limbs, guides.get(str(frame_id)))
        bottom, bottom_owned = cloth.trousers(context, frame_id, masks, limbs)
        top = recolor(top, top_owned, "top")
        bottom = recolor(bottom, bottom_owned, "bottom")
        original = context.frames[frame_id]
        after = original.copy()
        after[bottom_owned] = bottom[bottom_owned]
        after[top_owned] = top[top_owned]
        protected = context.protected_mask(frame_id)
        union = top_owned | bottom_owned
        assert not (union & protected).any(), f"{frame_id}: protected pixels were claimed as clothing"
        assert np.array_equal(after[protected], original[protected])
        assert np.array_equal(after[~union], original[~union])
        assert np.array_equal(after[masks["shoes"]], original[masks["shoes"]]), f"{frame_id}: source footwear changed"
        dressed[frame_id] = after
        files = {}
        for slot, patch, owned in (("top", top, top_owned), ("bottom", bottom, bottom_owned)):
            assert not patch[~owned].any()
            names = {"patch": f"{frame_id}-{slot}-patch.png", "ownership": f"{frame_id}-{slot}-ownership.png"}
            for kind, name in names.items():
                data = encode_png(patch if kind == "patch" else ownership_rgba(owned))
                save(args.out / name, data, args.check)
                files[name] = {"sha256": sha(data), "bytes": len(data)}
            key = "dailyTop" if slot == "top" else "dailyBottom"
            garment_inputs[key]["frames"].append({"frameId": frame_id, **names, "offset": {"x": 0, "y": 0}})
        save(args.out / f"{frame_id}-daily.png", encode_png(after), args.check)
        records.append({"frameId": frame_id, "sourceFrameMeaning": "authored archive collection entry, not original video index",
                        "topOwnedPixels": int(top_owned.sum()), "bottomOwnedPixels": int(bottom_owned.sum()),
                        "protectedPixelChanges": 0, "outsideOwnershipChanges": 0, "sourceFootwearExact": True,
                        "sourceRgbaSha256": sha(original.tobytes()), "compositeRgbaSha256": sha(after.tobytes()), "files": files})
    save(args.out / "daily-new-poses.png", board(context.frames, dressed), args.check)
    recipe = {"format": "gathria-landing-production-daily-extension", "version": 1,
              "status": "schema-fixture-only" if args.fixture_only else "authored-review-candidate",
              "sourceSha256": sha(source), "registrationSha256": sha(registration_bytes),
              "visualAcceptance": "pending", "existing107DailyBanksUnchanged": True,
              "donor": str(DONOR.relative_to(ROOT)), "donorSha256": DONOR_SHA256,
              "clothOnlyDonorTraces": cloth.TRACE, "paletteAlgorithm": "owned-chromatic-ratio-v1",
              "materialTolerance": 0.5, "palettes": PALETTES, "shoulderGuides": guides,
              "maskSource": "reviewed supplied masks" if args.masks else "shared ExtensionContext classification on final authored pixels and manual registration",
              "records": records,
              "limits": "Offline cloth-only fit for review. Existing painted cloth is sampled; donor anatomy is excluded. Protected head/hands, footwear and uncovered source pixels remain exact. No old video frame labels, source geometry changes, runtime generation, or art acceptance implied."}
    save(args.out / "daily-extension-audit.json", (json.dumps(recipe, ensure_ascii=False, indent=2) + "\n").encode(), args.check)
    save(args.out / "daily-garment-inputs.json", (json.dumps({"garments": garment_inputs}, ensure_ascii=False, indent=2) + "\n").encode(), args.check)
    print(json.dumps({"sourceSha256": sha(source), "registrationSha256": sha(registration_bytes),
                      "frames": list(IDS), "out": str(args.out), "checked": args.check,
                      "status": recipe["status"]}))


if __name__ == "__main__":
    main()
