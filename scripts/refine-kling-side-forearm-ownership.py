#!/usr/bin/env python3
"""Release two source-traced near forearm contacts from erroneous skirt ownership.

This is deterministic existing-source compositing, not new artwork or anatomy.
The immutable PR54 skirt supplies every unchanged painted pixel. Diagnostics
here are offline; actual application exports remain the acceptance reference.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
import subprocess
import zipfile

import numpy as np
from PIL import Image, ImageDraw

from kling_side_authoring import ROOT, load_context, pack_garment, runtime_polygon_mask, sha

BASELINE = "16fb1405239188a453d66cda94927106028eefbf"
SKIRT = "docs/kling-side-expansion/assets/female-skirt.garment.zip"
BLOUSE = "docs/kling-side-expansion/assets/female-blouse.garment.zip"
RECIPE = ROOT / "artwork/kling-side-refinement/female/foreground-contours.json"
DOC = ROOT / "docs/kling-side-refinement/female"


def from_git(path):
    return subprocess.run(
        ["git", "show", f"{BASELINE}:{path}"], cwd=ROOT,
        check=True, stdout=subprocess.PIPE,
    ).stdout


def unpack(ctx, data):
    """Decode V1 atlas pages with the same binary ownership overwrite rule."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["sourceSha256"] == ctx.source_sha256
        assert manifest["registrationSha256"] == ctx.registration_sha256
        pages = [np.array(Image.open(io.BytesIO(archive.read(p["file"]))).convert("RGBA")) for p in manifest["pages"]]
        masks = [np.array(Image.open(io.BytesIO(archive.read(p["maskFile"]))).convert("RGBA"))[:, :, 3] > 0 for p in manifest["pages"]]
        frames = {}
        for entry in manifest["frames"]:
            x, y, w, h = [entry["rect"][key] for key in ("x", "y", "width", "height")]
            a, b, page = entry["offset"]["x"], entry["offset"]["y"], entry["page"]
            owned = masks[page][y:y+h, x:x+w]
            frame = ctx.frames[entry["frameId"]].copy()
            frame[b:b+h, a:a+w][owned] = pages[page][y:y+h, x:x+w][owned]
            frames[entry["frameId"]] = frame
        assert set(frames) == set(ctx.frames)
        return manifest, frames


def compose(ctx, bottom, top):
    result = {}
    for fid in ctx.frames:
        image = bottom[fid].copy()
        owned = np.any(top[fid] != ctx.frames[fid], axis=2)
        image[owned] = top[fid][owned]
        result[fid] = image
    return result


def diagnostic_board(ctx, before, after, ids, output, detail=False):
    cell_w, cell_h = (400, 350) if detail else (512, 796)
    board = Image.new("RGB", (cell_w * len(ids), cell_h * 3), (235, 231, 220))
    draw = ImageDraw.Draw(board)
    for row, (label, frames) in enumerate((("source", ctx.frames), ("PR54", before), ("repair", after))):
        for col, fid in enumerate(ids):
            image = Image.fromarray(frames[fid])
            if detail:
                image = image.crop((140, 430, 340, 590)).resize((400, 320), Image.Resampling.NEAREST)
            board.paste(image, (col * cell_w, row * cell_h + 28), image)
            draw.text((col * cell_w + 5, row * cell_h + 6),
                      f"{label} / frame {fid} / {'integer 2x' if detail else 'native'} / offline", fill=(30, 40, 40))
    board.save(output)


def diagnostic_gif(before, after, clip, output, facing):
    frames = []
    for fid in clip["frames"]:
        board = Image.new("RGB", (512, 412), (235, 231, 220))
        draw = ImageDraw.Draw(board)
        for col, (label, sequence) in enumerate((("PR54", before), ("repair", after))):
            image = Image.fromarray(sequence[fid])
            if facing == "left":
                image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            image = image.resize((256, 384), Image.Resampling.LANCZOS)
            board.paste(image, (col * 256, 28), image)
            draw.text((col * 256 + 5, 5), f"{label} / {fid} / {facing} / offline", fill=(30, 40, 40))
        frames.append(board)
    atlas = Image.new("RGB", (512, 412 * len(frames)))
    for index, image in enumerate(frames):
        atlas.paste(image, (0, 412 * index))
    palette = atlas.quantize(colors=256)
    indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in frames]
    durations = [round((i + 1) * 100 / clip["fps"]) * 10 - round(i * 100 / clip["fps"]) * 10 for i in range(len(frames))]
    indexed[0].save(output, save_all=True, append_images=indexed[1:], duration=durations,
                    loop=0, disposal=2, optimize=False)
    with Image.open(output) as image:
        decoded = []
        for index in range(image.n_frames):
            image.seek(index)
            image.load()
            decoded.append(image.info["duration"])
        assert decoded == durations and image.info["loop"] == 0
    return {"file": output.name, "sha256": sha(output.read_bytes()), "frames": len(frames),
            "durationMs": sum(durations), "loop": True, "facing": facing}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / SKIRT)
    parser.add_argument("--review", type=Path, default=DOC)
    args = parser.parse_args()
    recipe = json.loads(RECIPE.read_bytes())
    assert recipe["baselineCommit"] == BASELINE
    ctx = load_context("female", registration_path=ROOT / "artwork/kling-side-expansion/templates/female.registration.json")
    assert recipe["sourceSha256"] == ctx.source_sha256
    assert recipe["registrationSha256"] == ctx.registration_sha256
    baseline = from_git(SKIRT)
    assert sha(baseline) == recipe["baselineGarmentSha256"]
    manifest, before = unpack(ctx, baseline)
    after = {fid: image.copy() for fid, image in before.items()}
    repairs = []
    for key, points in recipe["frames"].items():
        fid = int(key)
        assert fid in ctx.animations["run"]["frames"]
        region = runtime_polygon_mask([{"x": x, "y": y} for x, y in points])
        original = ctx.frames[fid]
        restore = region & (original[:, :, 3] > 0) & np.any(before[fid] != original, axis=2)
        assert restore.any() and not (restore & ctx.protected_mask(fid)).any()
        after[fid][restore] = original[restore]
        assert np.array_equal(after[fid][~restore], before[fid][~restore])
        assert np.array_equal(after[fid][restore], original[restore])
        ys, xs = np.where(restore)
        repairs.append({"frameId": fid, "sourceFrame": ctx.registered[fid]["sourceFrame"],
                        "restoredSourcePixels": int(restore.sum()),
                        "restoredAntialiasedPixels": int((restore & (original[:, :, 3] < 255)).sum()),
                        "bounds": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
                        "outsideContourExact": True, "transparentSourcePixelsErased": 0})
    changed_ids = [fid for fid in ctx.frames if not np.array_equal(before[fid], after[fid])]
    assert changed_ids == [40, 41]
    for fid in ctx.frames:
        assert np.array_equal(after[fid][ctx.protected_mask(fid)], ctx.frames[fid][ctx.protected_mask(fid)])
    provenance = manifest["provenance"] + " PR54 follow-up: release native source-traced near forearm contours at run40 and run41 from skirt ownership, retaining original ink and antialiasing. No generated skin, source warp, global color removal, timing, blouse or jump-fold changes. Reproduce with scripts/refine-kling-side-forearm-ownership.py."
    pack = pack_garment(ctx, manifest["id"], manifest["name"], manifest["slot"], after, args.output, provenance)
    _, decoded = unpack(ctx, args.output.read_bytes())
    assert all(np.array_equal(decoded[fid], after[fid]) for fid in ctx.frames)
    _, top = unpack(ctx, from_git(BLOUSE))
    old_combo, new_combo = compose(ctx, before, top), compose(ctx, after, top)
    # A complete look must retain the repair; blouse-only success is insufficient.
    for repair in repairs:
        fid = repair["frameId"]
        assert int(np.any(old_combo[fid] != new_combo[fid], axis=2).sum()) == repair["restoredSourcePixels"]
    args.review.mkdir(parents=True, exist_ok=True)
    diagnostic_board(ctx, old_combo, new_combo, [39, 40, 41, 42], args.review / "contacts-native.png")
    diagnostic_board(ctx, old_combo, new_combo, [38, 39, 40, 41, 42, 48, 49, 50], args.review / "contacts-2x.png", True)
    diagnostic_board(ctx, old_combo, new_combo, [40, 41], args.review / "contacts-focus-2x.png", True)
    gifs = [diagnostic_gif(old_combo, new_combo, ctx.animations["run"], args.review / f"run-offline-{facing}.gif", facing) for facing in ("right", "left")]
    report = {"baselineCommit": BASELINE, "baselineGarmentSha256": sha(baseline),
              "garmentSha256": sha(args.output.read_bytes()), "sourceSha256": ctx.source_sha256,
              "registrationSha256": ctx.registration_sha256, "recipeSha256": sha(RECIPE.read_bytes()),
              "blouseSha256": sha(from_git(BLOUSE)), "changedFrames": repairs,
              "unchangedFrameIds": [fid for fid in ctx.frames if fid not in changed_ids],
              "unchangedFrames": len(ctx.frames) - len(changed_ids),
              "protectedPixelsChanged": 0, "sourceTimingUnchanged": ctx.animations,
              "roundtripExact": True, "reconstructedFrames": len(decoded), "gifChecks": gifs,
              "limits": "Offline full-outfit diagnostics, not application export acceptance. Existing sleeve/bodice donor seams, source matte and jump-end crouch remain. Only run40/41 skirt ownership changes."}
    (args.review / "audit.json").write_text(json.dumps(report, indent=2) + "\n")
    (args.review / "pack-audit.json").write_text(json.dumps(pack, indent=2) + "\n")
    print(json.dumps({"sha256": report["garmentSha256"], "changes": repairs, "unchangedFrames": 100, "roundtripExact": True}))


if __name__ == "__main__":
    main()
