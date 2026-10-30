#!/usr/bin/env python3
"""Source-bound side-view painting guides and garment V1 preflight.

This is an offline authoring aid, not a replacement renderer or art approval.
Existing strict browser import/export remains the final format authority.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
import re
import struct
import sys
import zipfile

import numpy as np
from PIL import Image

from kling_side_authoring import (
    ROOT, W, H, LIMIT_BYTES, LIMIT_PIXELS, SideContext,
    encode_rgba, export_templates, load_context, sha,
)

LABELS = ("head", "nearHand", "farHand")
LIMIT_METADATA = 1024 * 1024
MANIFEST_KEYS = {"format", "version", "id", "name", "slot", "sourceSha256",
                 "registrationSha256", "characterId", "frameWidth", "frameHeight",
                 "pages", "frames", "provenance"}
LIMITATION = (
    "Preflight checks declared V1 structure, source binding and observable ownership. "
    "It cannot establish correct anatomy, cloth continuity, depth ordering or visual quality. "
    "Open the package in the application, inspect complete loops and verify actual exports."
)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def integer(value):
    return isinstance(value, int) and not isinstance(value, bool)


def context_for(identity, root=ROOT, registration=None):
    root = Path(root)
    candidate = root / f"artwork/kling-side-expansion/templates/{identity}.registration.json"
    return load_context(identity, root, registration_path=registration or candidate)


def select_frames(ctx, action=None, frame_ids=None):
    """Action frames retain original clip order; explicit IDs never imply video IDs."""
    selected = (list(ctx.animations[action]["frames"]) if action else list(ctx.frames))
    if frame_ids is not None:
        if not frame_ids or len(frame_ids) != len(set(frame_ids)):
            raise ValueError("--frames must list distinct pack frame IDs")
        unknown = set(frame_ids) - set(ctx.frames)
        if unknown:
            raise ValueError(f"Unknown pack frame IDs: {sorted(unknown)}")
        outside = set(frame_ids) - set(selected)
        if outside:
            raise ValueError(f"Pack frame IDs outside --action {action}: {sorted(outside)}")
        selected = [fid for fid in selected if fid in set(frame_ids)]
    return selected


def write_guides(ctx: SideContext, output: Path, frame_ids):
    output = Path(output)
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("Guide output must be a new or empty directory; existing artwork is never overwritten")
    index = export_templates(ctx, output, frame_ids)
    for entry in index["frames"]:
        fid = entry["frameId"]
        stem = Path(entry["files"]["metadata"]).stem
        masks = {}
        union = np.zeros((H, W), bool)
        overlay = np.zeros((H, W, 4), np.uint8)
        for label, rgb in zip(LABELS, [(204, 60, 134), (247, 162, 40), (44, 167, 216)]):
            mask = ctx.protected_mask(fid, label)
            union |= mask
            overlay[mask] = [*rgb, 120]
            filename = f"{stem}-protect-{label}.png"
            data = io.BytesIO()
            Image.fromarray(mask.astype(np.uint8) * 255).save(data, format="PNG")
            encoded = data.getvalue()
            (output / filename).write_bytes(encoded)
            masks[label] = {"file": filename, "sha256": sha(encoded),
                            "pixels": int(mask.sum()), "maskSha256": sha(mask.astype(np.uint8).tobytes())}
        filename = f"{stem}-protection-overlay.png"
        (output / filename).write_bytes(encode_rgba(overlay))
        metadata_path = output / entry["files"]["metadata"]
        metadata = json.loads(metadata_path.read_bytes())
        metadata["exactProtection"] = {
            "rule": "Runtime pixel-center polygon raster AND original source alpha > 0; 255 means do not own.",
            "masks": masks, "overlay": filename, "unionPixels": int(union.sum()),
            "unionMaskSha256": sha(union.astype(np.uint8).tobytes()),
        }
        metadata["preflightLimitations"] = LIMITATION
        metadata_path.write_bytes(json_bytes(metadata))
        entry["protection"] = metadata["exactProtection"]
        entry["fileSha256"] = {
            name: sha((output / path).read_bytes()) for name, path in entry["files"].items()
        }
    index["limitations"] = LIMITATION
    index["selection"] = "Pack frame IDs in original action order; source video frame IDs are separately recorded."
    (output / "index.json").write_bytes(json_bytes(index))
    return index


def _png(data, width, height):
    """Bound dimensions before decoding. Pillow verifies CRC/stream; runtime remains authority."""
    if (len(data) < 45 or data[:8] != b"\x89PNG\r\n\x1a\n" or
            data[12:16] != b"IHDR" or struct.unpack(">II", data[16:24]) != (width, height) or
            data[24:29] != bytes([8, 6, 0, 0, 0])):
        raise ValueError("Expected static non-interlaced RGBA8 PNG with declared dimensions")
    offset = 8
    while offset < len(data):
        if offset + 12 > len(data):
            raise ValueError("Truncated PNG chunk")
        size = struct.unpack(">I", data[offset:offset + 4])[0]
        if offset + size + 12 > len(data):
            raise ValueError("PNG chunk exceeds file")
        if data[offset + 4:offset + 8] in {b"acTL", b"fcTL", b"fdAT"}:
            raise ValueError("Animated PNG is not a garment page")
        offset += size + 12
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        return np.array(image.convert("RGBA"))


def lint_garment(ctx: SideContext, path: Path):
    path = Path(path)
    report = {
        "format": "gathria-side-garment-preflight", "version": 1,
        "identity": ctx.identity, "file": path.name,
        "sourceSha256": ctx.source_sha256, "registrationSha256": ctx.registration_sha256,
        "expectedFrames": len(ctx.frames), "checkedFrames": 0,
        "issues": [], "frames": [], "limitations": LIMITATION,
    }

    def issue(code, message, fid=None, **extra):
        value = {"severity": "error", "code": code, "message": message, **extra}
        if fid is not None:
            value["frameId"] = fid
            if fid in ctx.registered:
                meta = ctx.frame_metadata(fid)
                value.update({k: meta[k] for k in ("action", "position", "sourceFrame", "sourceVideo")})
        report["issues"].append(value)

    def finish():
        report["ok"] = not any(i["severity"] == "error" for i in report["issues"])
        return report

    try:
        if path.stat().st_size > LIMIT_BYTES:
            issue("archive-budget", "Garment ZIP exceeds 64 MiB")
            return finish()
        data = path.read_bytes()
        report["garmentSha256"] = sha(data)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members = archive.infolist()
            names = [entry.filename for entry in members]
            allowed = {"manifest.json"} | {f"{prefix}-{i}.png" for i in range(4) for prefix in ("patches", "ownership")}
            if (not 3 <= len(names) <= 9 or len(set(names)) != len(names) or
                    set(names) - allowed or "manifest.json" not in names or
                    any(entry.flag_bits & 1 for entry in members)):
                issue("archive-members", "Expected unique manifest.json and up to four patch/ownership pairs, without extra paths or encryption")
                return finish()
            if sum(entry.file_size for entry in members) > LIMIT_BYTES:
                issue("expanded-budget", "Expanded ZIP exceeds 64 MiB")
                return finish()
            if archive.getinfo("manifest.json").file_size > LIMIT_METADATA:
                issue("metadata-budget", "Manifest exceeds 1 MiB")
                return finish()
            manifest = json.loads(archive.read("manifest.json"))
            if not isinstance(manifest, dict) or set(manifest) != MANIFEST_KEYS:
                issue("manifest-fields", "Expected existing garment V1 manifest fields exactly")
                return finish()
            if (manifest["format"] != "gathria-sprite-garment" or
                    not integer(manifest["version"]) or manifest["version"] != 1):
                issue("unsupported-version", "This side-view preflight supports garment V1 only; use the application for other versions")
                return finish()
            for key, expected in (("sourceSha256", ctx.source_sha256),
                                  ("registrationSha256", ctx.registration_sha256),
                                  ("characterId", ctx.registration["characterId"]),
                                  ("frameWidth", W), ("frameHeight", H)):
                if manifest[key] != expected:
                    issue("binding-mismatch", f"{key} does not match selected source/registration", field=key, expected=expected, actual=manifest[key])
            if not isinstance(manifest["id"], str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}", manifest["id"]):
                issue("garment-id", "Garment ID must use 1–64 letters, digits, dots, underscores or hyphens")
            for key, max_length in (("name", 120), ("provenance", 8192)):
                if not isinstance(manifest[key], str) or not manifest[key].strip() or len(manifest[key]) > max_length:
                    issue("garment-text", f"{key} must contain 1–{max_length} characters", field=key)
            if manifest["slot"] not in ("top", "bottom", "shoes", "fullBody"):
                issue("garment-slot", "Unknown garment slot")
            pages = manifest["pages"]
            if not isinstance(pages, list) or not 1 <= len(pages) <= 4:
                issue("page-count", "Expected 1–4 atlas pages")
                return finish()
            decoded, declared, pixel_count = {}, {"manifest.json"}, 0
            for number, page in enumerate(pages):
                if (not isinstance(page, dict) or set(page) != {"file", "maskFile", "width", "height"} or
                        page.get("file") != f"patches-{number}.png" or page.get("maskFile") != f"ownership-{number}.png" or
                        any(not integer(page.get(k)) or not 1 <= page[k] <= 8192 for k in ("width", "height"))):
                    issue("page-metadata", "Page needs consecutive filenames and integer dimensions 1–8192", page=number)
                    continue
                declared.update((page["file"], page["maskFile"]))
                pixel_count += page["width"] * page["height"]
                if pixel_count > LIMIT_PIXELS:
                    issue("pixel-budget", "Atlas kind exceeds 32 Mi pixels; decoding stopped")
                    return finish()
                if page["file"] not in names or page["maskFile"] not in names:
                    issue("missing-page", "Declared patch/ownership pair is absent", page=number)
                    continue
                try:
                    patch = _png(archive.read(page["file"]), page["width"], page["height"])
                    owner = _png(archive.read(page["maskFile"]), page["width"], page["height"])[:, :, 3]
                except (OSError, ValueError, SyntaxError, zipfile.BadZipFile) as error:
                    issue("page-decode", str(error), page=number)
                    continue
                decoded[number] = patch, owner
                if np.any((owner != 0) & (owner != 255)):
                    issue("nonbinary-page-ownership", "Ownership alpha must be 0 or 255", page=number)
                if np.any((owner == 0) & (patch[:, :, 3] != 0)):
                    issue("unowned-page-art", "Visible atlas artwork exists outside ownership", page=number)
            if set(names) != declared:
                issue("undeclared-pages", "ZIP members differ from declared patch/ownership pages", missing=sorted(declared - set(names)), extra=sorted(set(names) - declared))
            report["decodedPixelsPerAtlasKind"] = pixel_count
            records = manifest["frames"]
            if not isinstance(records, list) or len(records) > 4096:
                issue("frame-records", "Expected a bounded array of frame records")
                return finish()
            seen, used_pages = set(), set()
            for record in records:
                if not isinstance(record, dict) or set(record) != {"frameId", "page", "rect", "offset"}:
                    issue("frame-fields", "Expected frameId/page/rect/offset")
                    continue
                fid, page_number = record["frameId"], record["page"]
                if not integer(fid):
                    issue("frame-id", "Frame ID must be an integer")
                    continue
                if fid not in ctx.frames:
                    issue("unknown-frame", "Frame is absent from selected source", fid)
                    continue
                if fid in seen:
                    issue("duplicate-frame", "Source frame occurs more than once", fid)
                    continue
                seen.add(fid)
                if not integer(page_number) or not 0 <= page_number < len(pages):
                    issue("frame-page", "Frame references an invalid atlas page", fid)
                    continue
                used_pages.add(page_number)
                rect, offset = record["rect"], record["offset"]
                if (not isinstance(rect, dict) or set(rect) != {"x", "y", "width", "height"} or
                        not isinstance(offset, dict) or set(offset) != {"x", "y"} or
                        any(not integer(v) for v in [*rect.values(), *offset.values()])):
                    issue("frame-geometry", "Rect and offset must contain the declared integer fields", fid)
                    continue
                x, y, w, h = (rect[k] for k in ("x", "y", "width", "height"))
                ox, oy = offset["x"], offset["y"]
                page = pages[page_number]
                if page_number not in decoded:
                    issue("unavailable-frame-page", "Cannot inspect frame because its atlas did not decode", fid)
                    continue
                if min(x, y) < 0 or min(w, h) < 1 or x + w > page["width"] or y + h > page["height"]:
                    issue("atlas-bounds", "Frame crop exceeds its atlas", fid, rect=rect)
                    continue
                if min(ox, oy) < 0 or ox + w > W or oy + h > H:
                    issue("native-bounds", "Cloth/ownership crop exceeds native 512×768 canvas", fid, offset=offset, rect=rect)
                    continue
                patch_page, owner_page = decoded[page_number]
                patch, alpha = patch_page[y:y + h, x:x + w], owner_page[y:y + h, x:x + w]
                owned = alpha == 255
                if np.any((alpha != 0) & (alpha != 255)):
                    issue("nonbinary-frame-ownership", "Frame ownership alpha must be binary 0/255", fid)
                if np.any((alpha == 0) & (patch[:, :, 3] != 0)):
                    issue("unowned-frame-art", "Frame contains visible paint outside ownership", fid)
                for label in LABELS:
                    overlap = owned & ctx.protected_mask(fid, label)[oy:oy + h, ox:ox + w]
                    if overlap.any():
                        ys, xs = np.where(overlap)
                        issue("protected-overlap", f"Cloth owns source-visible {label}; review ownership rather than deleting a color", fid,
                              label=label, pixels=int(overlap.sum()),
                              bounds={"x": int(xs.min()) + ox, "y": int(ys.min()) + oy, "width": int(xs.max() - xs.min() + 1), "height": int(ys.max() - ys.min() + 1)},
                              samplePixels=[[int(xx) + ox, int(yy) + oy] for yy, xx in zip(ys[:8], xs[:8])])
                source = ctx.frames[fid][oy:oy + h, ox:ox + w]
                report["frames"].append({"frameId": fid, "ownedPixels": int(owned.sum()),
                                         "visibleOwnedPixels": int((owned & (patch[:, :, 3] != 0)).sum()),
                                         "erasedSourcePixels": int((owned & (source[:, :, 3] != 0) & (patch[:, :, 3] == 0)).sum()),
                                         "extendedSilhouettePixels": int((owned & (source[:, :, 3] == 0) & (patch[:, :, 3] != 0)).sum())})
                report["checkedFrames"] += 1
            for fid in sorted(set(ctx.frames) - seen):
                issue("missing-frame", "Registered frame has no garment record; no implicit fallback", fid)
            for number in sorted(set(range(len(pages))) - used_pages):
                issue("unused-page", "Every declared page must be referenced by a frame", page=number)
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, KeyError) as error:
        issue("archive-read", str(error))
    return finish()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--identity", choices=["male", "female"], required=True)
    parser.add_argument("--registration", type=Path, help="Explicit registration; defaults to current tailored candidate")
    commands = parser.add_subparsers(dest="command", required=True)
    guides = commands.add_parser("guides", help="Export locked source, blank paint layer, fitting hints and exact protection")
    guides.add_argument("--action", choices=["idle", "walk", "run", "jump"])
    guides.add_argument("--frames", help="Comma-separated pack frame IDs, NOT original video frame numbers")
    guides.add_argument("--output", required=True, type=Path)
    lint = commands.add_parser("lint", help="Preflight an existing V1 garment without changing it")
    lint.add_argument("garment", type=Path)
    lint.add_argument("--report", type=Path, help="Write the full structured report; exit code still reports errors")
    args = parser.parse_args(argv)
    try:
        ctx = context_for(args.identity, args.root, args.registration)
        if args.command == "guides":
            ids = None if args.frames is None else [int(value.strip()) for value in args.frames.split(",")]
            selected = select_frames(ctx, args.action, ids)
            index = write_guides(ctx, args.output, selected)
            print(json.dumps({"identity": ctx.identity, "frames": len(selected), "output": str(args.output),
                              "sourceSha256": index["sourceSha256"], "registrationSha256": index["registrationSha256"]}))
            return 0
        report = lint_garment(ctx, args.garment)
        if args.report:
            if args.report.suffix.lower() != ".json":
                raise ValueError("--report must be a JSON path, never a source or garment file")
            protected_paths = {Path(args.garment).resolve(),
                               (args.root / f"artwork/kling-side-expansion/templates/{args.identity}.registration.json").resolve(),
                               (args.root / f"artwork/kling-side-workspace/registration/{args.identity}/registration.json").resolve(),
                               (args.root / f"docs/kling-side-workspace/assets/{args.identity}.registration.json").resolve()}
            if args.registration:
                protected_paths.add(args.registration.resolve())
            if args.report.resolve() in protected_paths:
                raise ValueError("Report must not overwrite garment or source registration")
            if args.report.exists():
                try:
                    previous = json.loads(args.report.read_bytes())
                except (OSError, ValueError) as error:
                    raise ValueError("Existing report path is not a preflight report; use a new path") from error
                if not isinstance(previous, dict) or previous.get("format") != "gathria-side-garment-preflight":
                    raise ValueError("Report must not overwrite unrelated JSON or approved artwork metadata")
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_bytes(json_bytes(report))
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["ok"] else 1
    except (OSError, ValueError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
