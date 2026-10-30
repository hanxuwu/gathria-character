#!/usr/bin/env python3
"""Review two bounded holes in the existing side-view skirt.

The source, registration and every previously owned garment pixel stay fixed.
Without --publish this writes only review material, never a runtime garment.
"""
from pathlib import Path
import argparse
import importlib.util
import io
import json
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

from kling_side_authoring import ROOT, load_context, sha

ART = ROOT / "artwork/dual-looks-cloth"
SEED = ROOT / "docs/kling-side-expansion/assets/female-skirt.garment.zip"
TOP = ROOT / "docs/kling-side-expansion/assets/female-blouse.garment.zip"
REG = ROOT / "artwork/kling-side-expansion/templates/female.registration.json"
ACTUAL = ROOT / "docs/dual-tailored/review/female/side.character.zip"
ROIS = {32: (292, 581, 300, 590), 92: (253, 382, 270, 405)}
EXPECTED_COUNTS = {32: 33, 92: 315}
SIZE = (512, 768)


def read_bank(path):
    with zipfile.ZipFile(path) as z:
        files = {name: z.read(name) for name in z.namelist()}
    manifest = json.loads(files["manifest.json"])
    pages = [np.array(Image.open(io.BytesIO(files[p["file"]])).convert("RGBA")) for p in manifest["pages"]]
    masks = [np.array(Image.open(io.BytesIO(files[p["maskFile"]])).convert("RGBA")) for p in manifest["pages"]]
    result = {}
    for f in manifest["frames"]:
        r, o = f["rect"], f["offset"]
        patch = np.zeros((SIZE[1], SIZE[0], 4), np.uint8)
        own = np.zeros((SIZE[1], SIZE[0]), bool)
        src = np.s_[r["y"]:r["y"] + r["height"], r["x"]:r["x"] + r["width"]]
        dst = np.s_[o["y"]:o["y"] + r["height"], o["x"]:o["x"] + r["width"]]
        patch[dst] = pages[f["page"]][src]
        own[dst] = masks[f["page"]][src][:, :, 3] > 0
        result[f["frameId"]] = (patch, own)
    return manifest, files, pages, masks, result


def read_pack(path):
    with zipfile.ZipFile(path) as z:
        m = json.loads(z.read("manifest.json"))
        pages = [np.array(Image.open(io.BytesIO(z.read(p["file"]))).convert("RGBA")) for p in [m["spritesheet"], *m.get("additionalSheets", [])]]
    return {f["id"]: pages[f.get("page", 0)][f["y"]:f["y"] + f["height"], f["x"]:f["x"] + f["width"]].copy() for f in m["frames"]}


def palette(rgb):
    """Same recorded owned-chromatic-ratio-v1 rule, for review pixels only."""
    source = np.array([201, 130, 137], float)
    target = np.array([75, 104, 128], float)
    mean = np.maximum(1, rgb.mean(axis=-1))
    distance = np.linalg.norm(rgb / mean[:, None] - source / source.mean(), axis=-1)
    weight = np.clip((.5 - distance) / (.5 * .35), 0, 1) * np.clip((mean - 28) / 42, 0, 1)
    return np.rint(rgb * (1 - weight[:, None]) + np.clip(rgb * target / source, 0, 255) * weight[:, None]).astype(np.uint8)


def original_unclipped(ctx, fid):
    """Capture the existing donor sample before its later upper-front cutoff."""
    path = ROOT / "scripts/prepare-kling-side-female-clothing.py"
    spec = importlib.util.spec_from_file_location("side_skirt_original", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    donor = np.array(Image.open(module.OUT / "source/000-bottom-cloth.png").convert("RGBA"))
    captured = []
    original_sample = module.sample

    def capture(*args):
        value = original_sample(*args)
        captured.append(value.copy())
        return value

    module.sample = capture
    try:
        module.fit_bottom(ctx, fid, 0, donor)
    finally:
        module.sample = original_sample
    assert len(captured) == 1
    return captured[0]


def png_bytes(array):
    out = io.BytesIO()
    Image.fromarray(array).save(out, format="PNG", compress_level=9)
    return out.getvalue()


def verify_palettes():
    old_catalog = json.loads((ROOT / "docs/dual-tailored/assets/female/catalog.json").read_text())
    new_catalog = json.loads((ROOT / "docs/dual-looks-cloth/assets/female/catalog.json").read_text())
    old_row = next(row for row in old_catalog["representations"] if row["view"] == "side")
    new_row = next(row for row in new_catalog["representations"] if row["view"] == "side")
    for key in ("sourceSha256", "registrationSha256", "frameWidth", "frameHeight", "frameCount"):
        assert old_row[key] == new_row[key]
    results = []
    for item in new_row["items"]:
        before_item = next(i for i in old_row["items"] if i["slot"] == item["slot"] and i["palette"] == item["palette"])
        before_path, after_path = ROOT / before_item["url"].lstrip("/"), ROOT / item["url"].lstrip("/")
        assert sha(before_path.read_bytes()) == before_item["sha256"]
        assert sha(after_path.read_bytes()) == item["sha256"]
        _, _, _, _, before = read_bank(before_path)
        _, _, _, _, after = read_bank(after_path)
        changes = []
        for fid, (rgba, owned) in before.items():
            new_rgba, new_owned = after[fid]
            changed = np.any(rgba != new_rgba, axis=2) | (owned != new_owned)
            assert np.array_equal(rgba[owned], new_rgba[owned])
            assert not np.any(owned & ~new_owned)
            if item["slot"] == "bottom" and fid in ROIS:
                left, up, right, down = ROIS[fid]
                roi = np.zeros(owned.shape, bool)
                roi[up:down, left:right] = True
                assert not np.any(changed & ~roi)
                assert int(changed.sum()) == EXPECTED_COUNTS[fid]
                changes.append({"frameId": fid, "changedPixels": int(changed.sum())})
            else:
                assert not changed.any(), (item["slot"], item["palette"], fid)
        results.append({"slot": item["slot"], "palette": item["palette"], "beforeSha256": before_item["sha256"], "afterSha256": item["sha256"], "framesChecked": len(before), "changed": changes})
    (ART / "palette-preservation.json").write_text(json.dumps({"sourceAndRegistrationExact": True, "allPriorOwnedRgbaExact": True, "results": results}, indent=2) + "\n")
    print("Four palette banks independently checked: tops exact; skirts only native32/92 (33/315 pixels).")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--verify-palettes", action="store_true")
    args = parser.parse_args()
    ART.mkdir(parents=True, exist_ok=True)
    if args.verify_palettes:
        verify_palettes()
        return
    ctx = load_context("female", registration_path=REG)
    assert sha(SEED.read_bytes()) == "8a16669c49822e4c442560db6948278e8dd7b4b5c708146fbb87ee9be1c60e7b"
    assert sha(ACTUAL.read_bytes()) == "eee36beecfdbb8b3d8bd1c5cce5b5fc09cd0d206364eb99dafba56e2e66c1ec1"
    manifest, files, pages, masks, bank = read_bank(SEED)
    _, _, _, _, top = read_bank(TOP)
    actual = read_pack(ACTUAL)
    after_frames = {fid: im.copy() for fid, im in actual.items()}
    assert manifest["sourceSha256"] == ctx.source_sha256
    assert manifest["registrationSha256"] == ctx.registration_sha256
    audit = []
    for fid, box in ROIS.items():
        old, owned = bank[fid]
        left, up, right, down = box
        roi = np.zeros(owned.shape, bool)
        roi[up:down, left:right] = True
        patch = old.copy()
        new_owned = owned.copy()
        repair = roi & ~owned & ~top[fid][1]
        assert int(repair.sum()) == EXPECTED_COUNTS[fid]
        assert not np.any(repair & ctx.protected_mask(fid))
        if fid == 92:
            raw = original_unclipped(ctx, fid)
            # The recorded donor has alpha253, also used by the original
            # compositor. Preserve that exact source-over operation rather
            # than falsely describing the donor as fully opaque artwork.
            assert np.all(raw[repair, 3] >= 250), "A hole needs painted donor cloth"
            source = ctx.frames[fid]
            assert np.all(source[repair, 3] == 255)
            a = raw[repair, 3:4].astype(float) / 255
            patch[repair, :3] = np.rint(raw[repair, :3] * a + source[repair, :3] * (1 - a)).astype(np.uint8)
            patch[repair, 3] = 255
        else:
            # A 33-pixel donor-alpha pinhole, at most three pixels from existing
            # opaque skirt. Fill only this reviewed component, never all holes.
            valid = owned & (old[:, :, 3] == 255)
            distance, nearest = nd.distance_transform_edt(~valid, return_indices=True)
            assert distance[repair].max() <= 4
            patch[repair] = old[nearest[0][repair], nearest[1][repair]]
        new_owned[repair] = True
        assert np.array_equal(old[owned], patch[owned])
        assert np.array_equal(old[~roi], patch[~roi])
        f = next(f for f in manifest["frames"] if f["frameId"] == fid)
        r, o = f["rect"], f["offset"]
        assert left >= o["x"] and up >= o["y"] and right <= o["x"] + r["width"] and down <= o["y"] + r["height"]
        yy, xx = np.where(repair)
        ay, ax = yy - o["y"] + r["y"], xx - o["x"] + r["x"]
        pages[f["page"]][ay, ax] = patch[repair]
        masks[f["page"]][ay, ax, 3] = 255
        after = actual[fid].copy()
        after[repair, :3] = palette(patch[repair, :3].astype(float))
        after[repair, 3] = 255
        assert np.array_equal(after[~repair], actual[fid][~repair])
        after_frames[fid] = after
        source = ctx.frames[fid]
        cx = (left + right) // 2
        cy = (up + down) // 2
        crop = (cx - 75, cy - 60, cx + 85, cy + 90)
        board = Image.new("RGB", (3 * 320, 338), "#eee9df")
        draw = ImageDraw.Draw(board)
        for i, (label, im) in enumerate([("Original source", source), ("Actual exported baseline", actual[fid]), ("OFFLINE cloth candidate", after)]):
            cut = Image.fromarray(im).crop(crop).resize((320, 300), Image.Resampling.NEAREST)
            board.paste(cut, (i * 320, 38), cut)
            draw.text((i * 320 + 6, 8), f"Native {fid} / {label} / 2x", fill="#304036")
        board.save(ART / f"female-side-{fid}-candidate-2x.png")
        Image.fromarray(after).save(ART / f"female-side-{fid}-candidate-native.png")
        audit.append({"frameId": fid, "bounds": list(box), "newOwnedPixels": int(repair.sum()), "changedExistingOwnedPixels": 0, "changedProtectedPixels": 0, "outsideReviewedRegionChanges": 0, "sourceOpaquePixelsCoveredByClothing": int((source[:, :, 3] > 0)[repair].sum()), "changedFinalAlphaPixels": int((after[:, :, 3] != actual[fid][:, :, 3]).sum())})
    for center in ROIS:
        ids = [center - 1, center, center + 1]
        board = Image.new("RGB", (3 * 512, 2 * 812), "#eee9df")
        draw = ImageDraw.Draw(board)
        for row, (label, frames) in enumerate([("Actual exported baseline", actual), ("OFFLINE candidate", after_frames)]):
            for column, fid in enumerate(ids):
                im = Image.fromarray(frames[fid])
                board.paste(im, (column * 512, row * 812 + 44), im)
                draw.text((column * 512 + 8, row * 812 + 8), f"{label} / native {fid} / 1x", fill="#304036")
        board.save(ART / f"female-side-{center}-neighbors-native.png")
    manifest = {**manifest, "id": "side-female-reviewed-skirt-v2", "name": "Rose skirt · reviewed small holes", "provenance": "Two source-reviewed local ownership additions to side-female-rose-skirt-v1. Native walk32 33px donor-alpha pinhole uses existing neighboring cloth; jump92 315px hard-clipping hole restores the original unclipped painted donor sample. Existing owned RGBA, registration, source, timing and all other100 frames remain exact. Recipe scripts/prepare-dual-looks-cloth.py; artwork/dual-looks-cloth/audit.json."}
    report = {"sourceSha256": ctx.source_sha256, "registrationSha256": ctx.registration_sha256, "baselineSeed": str(SEED.relative_to(ROOT)), "baselineSeedSha256": sha(SEED.read_bytes()), "baselineActualExport": str(ACTUAL.relative_to(ROOT)), "baselineActualExportSha256": sha(ACTUAL.read_bytes()), "donorSamplingScriptSha256": sha((ROOT / "scripts/prepare-kling-side-female-clothing.py").read_bytes()), "changedFrames": list(ROIS), "unchangedFrameCount": len(bank) - len(ROIS), "poses": audit, "visualStatus": "offline candidates reviewed and accepted; final actual application export verification is separate"}
    if args.publish or args.check:
        files["manifest.json"] = (json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
        for i, page in enumerate(manifest["pages"]):
            files[page["file"]] = png_bytes(pages[i])
            files[page["maskFile"]] = png_bytes(masks[i])
        target = ROOT / "docs/dual-looks-cloth/assets/female-side-skirt-reviewed.garment.zip"
        target.parent.mkdir(parents=True, exist_ok=True)
        encoded = io.BytesIO()
        with zipfile.ZipFile(encoded, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, data)
        if args.check:
            assert target.read_bytes() == encoded.getvalue(), "Seed regeneration differs from published bytes"
        else:
            target.write_bytes(encoded.getvalue())
        report["published"] = {"path": str(target.relative_to(ROOT)), "sha256": sha(target.read_bytes())}
        _, _, _, _, saved = read_bank(target)
        deltas = []
        for fid, (old_rgba, old_owned) in bank.items():
            new_rgba, new_owned = saved[fid]
            changed = np.any(old_rgba != new_rgba, axis=2) | (old_owned != new_owned)
            assert np.array_equal(old_rgba[old_owned], new_rgba[old_owned])
            assert not np.any(old_owned & ~new_owned)
            assert not np.any(changed & ctx.protected_mask(fid))
            if fid in ROIS:
                x0, y0, x1, y1 = ROIS[fid]
                roi = np.zeros(old_owned.shape, bool)
                roi[y0:y1, x0:x1] = True
                assert not np.any(changed & ~roi)
                assert int(changed.sum()) == EXPECTED_COUNTS[fid]
                deltas.append({"frameId": fid, "changedPixels": int(changed.sum())})
            else:
                assert not changed.any()
        report["roundtripAudit"] = {"framesChecked": len(bank), "changed": deltas, "allPriorOwnedPixelsExact": True, "allOther100FramesExact": True, "protectedChanges": 0}
    (ART / "audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
