#!/usr/bin/env python3
"""Offline native-pose authoring for the frozen 107/102-frame side sources.

No inferred rig, no source mutation, no relaxed protection.  Painted RGBA frames
and explicit binary ownership are packed into the existing strict garment V1.
Use ``python scripts/kling_side_authoring.py --help`` for template export/checks.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from dataclasses import dataclass, field
import hashlib
import io
import json
import math
from pathlib import Path
import re
import struct
from typing import Mapping
import zipfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
W, H = 512, 768
ANCHORS = ("neck", "nearShoulder", "farShoulder", "waistLeft", "waistRight",
           "nearHip", "farHip", "nearElbow", "farElbow", "nearWrist", "farWrist",
           "nearKnee", "farKnee", "nearAnkle", "farAnkle", "nearToe", "farToe")
FROZEN = {
    "male": {"count": 107, "source": "7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42",
             "registration": "678aaab17e209add4c349008cc400d028db241ec5607e8877b69c4aee98472f5"},
    "female": {"count": 102, "source": "ee6d20ac1b6c973043a28bc7b0508cf4f3b1ea4f373424b0de75d88d724f955d",
               "registration": "32952ef432693553cf36ed6c257041e663ecdf33054265789dbdc6ec0e262f7e"},
}
LIMIT_PIXELS = 32 * 1024 * 1024
LIMIT_BYTES = 64 * 1024 * 1024
COLOR_CHUNKS = {b"sRGB", b"gAMA", b"cHRM", b"iCCP"}
SEGMENTS = {
    "nearUpperArm": ("nearShoulder", "nearElbow", 28),
    "nearForearm": ("nearElbow", "nearWrist", 27),
    "farUpperArm": ("farShoulder", "farElbow", 28),
    "farForearm": ("farElbow", "farWrist", 27),
    "nearThigh": ("nearHip", "nearKnee", 34),
    "nearShin": ("nearKnee", "nearAnkle", 28),
    "farThigh": ("farHip", "farKnee", 34),
    "farShin": ("farKnee", "farAnkle", 28),
}
SEGMENT_COLORS = [(235, 117, 72), (248, 184, 86), (106, 164, 234), (123, 214, 235),
                  (193, 113, 217), (238, 152, 207), (109, 173, 121), (174, 211, 105)]
DEFAULT_TEMPLATES = {"male": [25, 39, 48, 57, 97, 101], "female": [20, 40, 49, 95]}
KNOWN_PROTECTION_LIMITS = {
    ("male", 48): "Frozen nearHand region intersects the apparent bent-knee area. Keep these exact source pixels even though this can interrupt long trousers; do not shrink protection.",
    ("male", 97): "Frozen head region includes a lower rectangular-looking patch at the near shoulder. Keep these exact source pixels even though this can interrupt a new sleeve; do not shrink protection.",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _require(value, message):
    if not value:
        raise ValueError(message)


def _json(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def _color_chunks(data: bytes) -> list[bytes]:
    chunks, pos = [], 8
    while pos + 12 <= len(data):
        size = struct.unpack(">I", data[pos:pos + 4])[0]
        chunk = data[pos:pos + size + 12]
        if data[pos + 4:pos + 8] in COLOR_CHUNKS:
            chunks.append(chunk)
        pos += size + 12
    return chunks


def encode_rgba(pixels: np.ndarray, color_chunks: list[bytes] | None = None) -> bytes:
    """Static RGBA8 PNG, carrying exactly the source color chunks if provided."""
    _require(pixels.dtype == np.uint8 and pixels.ndim == 3 and pixels.shape[2] == 4,
             "PNG pixels must be uint8 RGBA")
    output = io.BytesIO()
    Image.fromarray(pixels, "RGBA").save(output, format="PNG", compress_level=6)
    data = output.getvalue()
    return data[:33] + b"".join(color_chunks or []) + data[33:]


def runtime_polygon_mask(polygon, width=W, height=H) -> np.ndarray:
    """Exact pixel-center scanline rule in src/wardrobe/protection.ts."""
    mask = np.zeros((height, width), dtype=bool)
    if not polygon:
        return mask
    top = max(0, math.ceil(min(p["y"] for p in polygon) - .5))
    bottom = min(height - 1, math.floor(max(p["y"] for p in polygon) - .5))
    for y in range(top, bottom + 1):
        cy, crossings = y + .5, []

        def add(a, b):
            left = max(0, math.ceil(min(a, b) - .5 - 1e-9))
            right = min(width - 1, math.floor(max(a, b) - .5 + 1e-9))
            if left <= right:
                mask[y, left:right + 1] = True

        for i, b in enumerate(polygon):
            a = polygon[i - 1]
            if (a["y"] > cy) != (b["y"] > cy):
                crossings.append(a["x"] + (cy - a["y"]) * (b["x"] - a["x"]) / (b["y"] - a["y"]))
            if abs(a["y"] - cy) < 1e-9 and abs(b["y"] - cy) < 1e-9:
                add(a["x"], b["x"])
            elif abs(a["y"] - cy) < 1e-9:
                add(a["x"], a["x"])
        crossings.sort()
        for i in range(0, len(crossings) - 1, 2):
            add(crossings[i], crossings[i + 1])
    return mask


@dataclass
class SideContext:
    identity: str
    root: Path
    source_bytes: bytes
    registration_bytes: bytes
    manifest: dict
    config: dict
    registration: dict
    frames: dict[int, np.ndarray]
    registered: dict[int, dict]
    audit: dict[int, dict]
    color_chunks: list[bytes]
    _masks: dict = field(default_factory=dict, repr=False)
    _protected: dict = field(default_factory=dict, repr=False)

    @property
    def source_sha256(self):
        return sha(self.source_bytes)

    @property
    def registration_sha256(self):
        return sha(self.registration_bytes)

    @property
    def animations(self):
        return self.manifest["animations"]

    def masks(self, frame_id: int) -> dict[str, np.ndarray]:
        """Original-cut cloth masks and independent PARTIAL warm-skin proof."""
        if frame_id not in self._masks:
            base = self.root / "artwork/kling-side-workspace/registration" / self.identity / "masks"
            masks = {}
            for slot in ("top", "bottom", "shoes", "skin"):
                data = (base / f"{frame_id:04d}-{slot}.png").read_bytes()
                _require(sha(data) == self.audit[frame_id]["maskSha256"][slot],
                         f"Source-bound {slot} guide changed in frame {frame_id}")
                im = np.array(Image.open(io.BytesIO(data)).convert("L"))
                _require(im.shape == (H, W) and np.isin(im, [0, 255]).all(), "Guide must be native binary")
                masks[slot] = im == 255
                masks[slot].flags.writeable = False
            self._masks[frame_id] = masks
        return self._masks[frame_id]

    def protected_mask(self, frame_id: int, label: str | None = None) -> np.ndarray:
        """Original head/hands that runtime V1 rejects: polygon AND source alpha>0."""
        key = (frame_id, label)
        if key not in self._protected:
            mask = np.zeros((H, W), bool)
            for region in self.registered[frame_id]["protected"]:
                if label is None or region["label"] == label:
                    mask |= runtime_polygon_mask(region["polygon"])
            mask &= self.frames[frame_id][:, :, 3] != 0
            mask.flags.writeable = False
            self._protected[key] = mask
        return self._protected[key]

    def frame_metadata(self, frame_id: int) -> dict:
        a, r = self.audit[frame_id], self.registered[frame_id]
        action = a["action"]
        return {"frameId": frame_id, "sourceFrame": r["sourceFrame"], "sourceVideo": a["source"],
                "action": action, "position": self.animations[action]["frames"].index(frame_id),
                "sourceRgbaSha256": sha(self.frames[frame_id].tobytes()),
                "sourceSha256": self.source_sha256, "registrationSha256": self.registration_sha256,
                "reviewedSeed": a["reviewedSeed"], "trackedSteps": a["trackedSteps"],
                "anchors": r["points"], "protected": r["protected"]}

    def source_visible_segments(self, frame_id: int) -> dict:
        return source_visible_segments(self, frame_id)


def load_context(identity: str, root: Path | str = ROOT,
                 registration_path: Path | str | None = None) -> SideContext:
    """Extract frozen source pixels; fail on any source/registration/hash drift."""
    _require(identity in FROZEN, "Identity must be male or female")
    root = Path(root)
    assets = root / "docs/kling-side-workspace/assets"
    base = root / "artwork/kling-side-workspace/registration" / identity
    source_bytes = (assets / f"{identity}.source.zip").read_bytes()
    frozen_registration_bytes = (base / "registration.json").read_bytes()
    registration_bytes = Path(registration_path).read_bytes() if registration_path else frozen_registration_bytes
    _require(sha(source_bytes) == FROZEN[identity]["source"], "Frozen source SHA mismatch")
    _require(sha(frozen_registration_bytes) == FROZEN[identity]["registration"], "Frozen registration SHA mismatch")
    _require((assets / f"{identity}.registration.json").read_bytes() == frozen_registration_bytes,
             "Runtime registration differs from reviewed registration")
    registration = json.loads(registration_bytes)
    _require(len(registration_bytes) <= 1024 * 1024, "Registration exceeds 1MiB metadata")
    _require(set(registration) == {"format", "version", "sourceSha256", "characterId", "frameWidth",
                                  "frameHeight", "anchor", "frames"}, "Unexpected registration fields")
    audit_document = json.loads((base / "audit.json").read_bytes())
    _require(audit_document["sourceSha256"] == sha(source_bytes) and
             audit_document["registrationSha256"] == sha(frozen_registration_bytes), "Registration audit binding mismatch")
    with zipfile.ZipFile(io.BytesIO(source_bytes)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        config = json.loads(archive.read("character.json"))
        pngs = [archive.read(p["file"]) for p in [manifest["spritesheet"], *manifest.get("additionalSheets", [])]]
        colors = _color_chunks(pngs[0])
        _require(all(_color_chunks(data) == colors for data in pngs), "Source PNG profiles differ")
        pages = [np.array(Image.open(io.BytesIO(png)).convert("RGBA")) for png in pngs]
        frames = {}
        for frame in manifest["frames"]:
            x, y, w, h = (frame[k] for k in ("x", "y", "width", "height"))
            _require((w, h) == (W, H), "Source is not native 512x768")
            frames[frame["id"]] = pages[frame.get("page", 0)][y:y + h, x:x + w].copy()
            frames[frame["id"]].flags.writeable = False
    registered = {f["frameId"]: f for f in registration["frames"]}
    audit = {f["frameId"]: f for f in audit_document["frames"]}
    _require(len(frames) == len(registration["frames"]) == FROZEN[identity]["count"] and
             set(frames) == set(registered) == set(audit),
             "Missing or duplicate frame/registration/audit coverage")
    _require(registration["sourceSha256"] == sha(source_bytes), "Registration source mismatch")
    _require(registration["format"] == "gathria-wardrobe-registration" and registration["version"] == 1,
             "Registration must use existing strict V1")
    _require(registration["frameWidth"] == W and registration["frameHeight"] == H, "Registration canvas changed")
    _require(registration["characterId"] == config["characterId"], "Source character mismatch")
    _require({k: manifest["anchor"][k] for k in ("x", "y")} == registration["anchor"] ==
             {"x": 256, "y": 710}, "Native anchor changed")
    _require(set(manifest["animations"]) == {"idle", "walk", "run", "jump"}, "Expected four source actions")
    _require(all(c["fps"] == 24 for c in manifest["animations"].values()), "Source timing changed")
    for fid, pixels in frames.items():
        _require(sha(pixels.tobytes()) == audit[fid]["sourceRgbaSha256"], f"Source RGBA differs in frame {fid}")
        _require(set(registered[fid]["points"]) == set(ANCHORS), f"Expected all 17 anchors in frame {fid}")
        _require(registered[fid]["sourceFrame"] == audit[fid]["sourceFrame"], f"Registration source frame changed in {fid}")
        _require(set(registered[fid]) == {"frameId", "sourceFrame", "points", "protected"}, "Unexpected registered frame fields")
        for point in registered[fid]["points"].values():
            _require(set(point) <= {"x", "y", "visibility", "confidence", "method"}, "Unexpected anchor fields")
            _require(all(isinstance(point[k], (int, float)) and math.isfinite(point[k]) and 0 <= point[k] <= limit
                         for k, limit in [("x", W), ("y", H)]), "Anchor exceeds native frame")
            _require(point["visibility"] in {"visible", "occluded"}, "Invalid anchor visibility")
            _require("confidence" not in point or 0 <= point["confidence"] <= 1, "Invalid anchor confidence")
        labels = []
        for region in registered[fid]["protected"]:
            _require(set(region) == {"label", "polygon"} and region["label"] in {"head", "nearHand", "farHand"}, "Invalid protected region")
            labels.append(region["label"])
            polygon = region["polygon"]
            _require(3 <= len(polygon) <= 64, "Protected polygon needs 3-64 vertices")
            _require(all(set(p) == {"x", "y"} and all(isinstance(p[k], (int, float)) and
                         math.isfinite(p[k]) and 0 <= p[k] <= limit for k, limit in [("x", W), ("y", H)])
                         for p in polygon), "Invalid protected polygon coordinates")
            area = sum(a["x"] * b["y"] - b["x"] * a["y"] for a, b in zip(polygon, polygon[1:] + polygon[:1]))
            _require(abs(area) >= .0001, "Protected polygon has no area")
        _require("head" in labels and len(labels) == len(set(labels)), "Head protection required; region labels must be unique")
    return SideContext(identity, root, source_bytes, registration_bytes, manifest, config,
                       registration, frames, registered, audit, colors)


def source_visible_segments(ctx: SideContext, frame_id: int) -> dict:
    """Partial skin-contour hints, never recovered anatomy or ownership permission.

    Only independently marked source skin is assigned; nearest registered limb
    segments propose labels. Crossing alternatives within 5px and hidden/weak
    endpoints are uncertain. Hidden limbs are not painted into these masks.
    """
    source, points, masks = ctx.frames[frame_id], ctx.registered[frame_id]["points"], ctx.masks(frame_id)
    candidate = masks["skin"].copy() & (source[:, :, 3] != 0) & ~ctx.protected_mask(frame_id)
    candidate &= ~(masks["top"] | masks["bottom"] | masks["shoes"])
    yy, xx = np.indices((H, W), dtype=np.float32)
    distances, fractions, metadata = [], [], {}
    for name, (start, end, radius) in SEGMENTS.items():
        a, b = points[start], points[end]
        vx, vy = b["x"] - a["x"], b["y"] - a["y"]
        t = np.clip(((xx - a["x"]) * vx + (yy - a["y"]) * vy) / max(1, vx * vx + vy * vy), 0, 1)
        d = np.hypot(xx - (a["x"] + t * vx), yy - (a["y"] + t * vy))
        distances.append(np.where(d <= radius, d, np.inf))
        fractions.append(t)
        metadata[name] = {"from": start, "to": end, "searchRadius": radius,
                          "endpointVisibility": [a["visibility"], b["visibility"]],
                          "endpointConfidence": [a.get("confidence"), b.get("confidence")],
                          "method": "partial source warm-skin proof, nearest estimated anchor segment"}
    distances = np.stack(distances)
    best = np.argmin(distances, axis=0)
    assigned = candidate & np.isfinite(np.min(distances, axis=0))
    out, uncertain = {}, np.zeros((H, W), bool)
    names = list(SEGMENTS)
    for i, name in enumerate(names):
        chosen = assigned & (best == i)
        out[name] = chosen
        start, end, _ = SEGMENTS[name]
        # Segments within the same arm/leg can meet safely at their shared elbow/knee;
        # alternative limbs around a crossing require explicit visual review.
        limb = name.replace("UpperArm", "Arm").replace("Forearm", "Arm").replace("Thigh", "Leg").replace("Shin", "Leg")
        alternatives = [j for j, other in enumerate(names) if other.replace("UpperArm", "Arm").replace("Forearm", "Arm").replace("Thigh", "Leg").replace("Shin", "Leg") != limb]
        near_alternative = np.min(distances[alternatives], axis=0) <= distances[i] + 5
        weak_a = points[start]["visibility"] == "occluded" or points[start].get("confidence", 0) < .6
        weak_b = points[end]["visibility"] == "occluded" or points[end].get("confidence", 0) < .6
        endpoint_uncertain = (weak_a & (fractions[i] < .5)) | (weak_b & (fractions[i] >= .5))
        uncertain |= chosen & (near_alternative | endpoint_uncertain)
        metadata[name]["sourceVisibleHintPixels"] = int(chosen.sum())
        metadata[name]["uncertainPixels"] = int((chosen & uncertain).sum())
    return {"masks": out, "uncertain": uncertain, "unassigned": candidate & ~assigned,
            "segments": metadata,
            "limitations": "Partial source-visible skin hints only. Pale/blurred skin may be absent; near/far labels and hidden attachment anchors are estimates. These masks do not authorize edits and do not establish limb depth order."}


def apply_registration_reviews(ctx: SideContext, changes: list[dict], output_path: Path | str) -> dict:
    """Write a SEPARATE source-bound registration from explicit native reviews.

    Callers must review source evidence first. This applies supplied polygons;
    it never invents edits, re-segments a body, or weakens runtime protection.
    """
    path = Path(output_path).resolve()
    forbidden = {(ctx.root / "artwork/kling-side-workspace/registration" / ctx.identity / "registration.json").resolve(),
                 (ctx.root / "docs/kling-side-workspace/assets" / f"{ctx.identity}.registration.json").resolve()}
    _require(path not in forbidden, "Reviewed candidate must not overwrite frozen registration")
    registration = deepcopy(ctx.registration)
    registered = {f["frameId"]: f for f in registration["frames"]}
    seen, audit = set(), []
    for change in changes:
        fid, label = change["frameId"], change["label"]
        _require(fid in registered and label in {"head", "nearHand", "farHand"}, "Invalid reviewed region")
        _require((fid, label) not in seen, "Duplicate reviewed region")
        seen.add((fid, label))
        _require(change.get("sourceRgbaSha256") == sha(ctx.frames[fid].tobytes()), "Reviewed source RGBA hash mismatch")
        _require(change.get("sourceFrame", registered[fid]["sourceFrame"]) == registered[fid]["sourceFrame"], "Reviewed source frame mismatch")
        _require(bool(change.get("reason", "").strip()), "Reviewed region requires source-based reason")
        polygon = change["polygon"]
        _require(label != "head" or polygon is not None, "Reviewed registration must retain head protection")
        before = next((r for r in registered[fid]["protected"] if r["label"] == label), None)
        if polygon is not None:
            _require(3 <= len(polygon) <= 64, "Reviewed polygon must have 3-64 points")
            _require(all(0 <= p["x"] <= W and 0 <= p["y"] <= H for p in polygon), "Reviewed polygon exceeds native frame")
            _require(runtime_polygon_mask(polygon).any(), "Reviewed polygon has no coverage")
        registered[fid]["protected"] = [r for r in registered[fid]["protected"] if r["label"] != label]
        if polygon is not None:
            registered[fid]["protected"].append({"label": label, "polygon": polygon})
        old_points = deepcopy(registered[fid]["points"])
        for name, fields in change.get("pointUpdates", {}).items():
            _require(name in ANCHORS, "Unknown reviewed anchor")
            registered[fid]["points"][name].update(fields)
        source_alpha = ctx.frames[fid][:, :, 3] != 0
        old_mask = runtime_polygon_mask(before["polygon"]) & source_alpha if before else np.zeros((H, W), bool)
        new_mask = runtime_polygon_mask(polygon) & source_alpha if polygon else np.zeros((H, W), bool)
        audit.append({**change, "beforePolygon": before["polygon"] if before else None,
                      "beforeAnchors": {name: old_points[name] for name in change.get("pointUpdates", {})},
                      "afterAnchors": {name: registered[fid]["points"][name] for name in change.get("pointUpdates", {})},
                      "beforeSourcePixels": int(old_mask.sum()), "afterSourcePixels": int(new_mask.sum()),
                      "removedSourcePixels": int((old_mask & ~new_mask).sum()),
                      "addedSourcePixels": int((new_mask & ~old_mask).sum())})
    for frame in registration["frames"]:
        frame["protected"].sort(key=lambda r: ["head", "nearHand", "farHand"].index(r["label"]))
    # All 17 anchors plus native contours must remain below the runtime's 1MiB
    # registration metadata cap; JSON whitespace carries no authoring semantics.
    data = (json.dumps(registration, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    _require(len(data) <= 1024 * 1024, "Reviewed registration exceeds 1MiB metadata")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"format": "gathria-side-reviewed-registration-audit", "version": 1, "identity": ctx.identity,
            "sourceSha256": ctx.source_sha256, "originalRegistrationSha256": ctx.registration_sha256,
            "registrationSha256": sha(data), "file": path.name, "changes": audit,
            "sourcePixelsUnchanged": True, "frameIdsAndSourceMappingUnchanged": True,
            "runtimeProtectionUnchanged": True,
            "limitations": "Separately reviewed garment-authoring registration; original registration and projects remain immutable. Visible hand contours include conservative wrist margins; hidden anatomy is not recovered."}


def _native_pixels(pixels, label):
    value = np.asarray(pixels)
    _require(value.shape == (H, W, 4) and value.dtype == np.uint8,
             f"{label} must be uint8 native 512x768 RGBA")
    return value


def _binary_mask(mask, label):
    value = np.asarray(mask)
    _require(value.shape == (H, W), f"{label} must be native 512x768 binary")
    _require(value.dtype == bool or np.isin(value, [0, 255]).all(), f"{label} must be bool or 0/255")
    return value.astype(bool)


def pack_garment(ctx: SideContext, item_id: str, name: str, slot: str,
                 paintings: Mapping[int, np.ndarray], output_path: Path | str,
                 provenance: str, ownership: Mapping[int, np.ndarray] | None = None,
                 painting_mode: str = "composite") -> dict:
    """Validate complete native paintings and pack sparse lossless garment V1.

    ``paintings`` are final composited native frames by default. For isolated
    cloth RGBA use ``painting_mode='patch'`` and explicit ownership; every RGBA
    byte outside ownership must then be zero.
    When ``ownership`` is omitted every byte-changed pixel is owned. With explicit
    masks, paintings must equal source outside ownership. Owned transparent pixels
    erase source cloth; source-transparent ownership may extend the silhouette.
    Returns an external audit with archive SHA/size and per-frame pixel counts.
    """
    _require(bool(re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}", item_id)), "Invalid garment ID")
    _require(isinstance(name, str) and bool(name.strip()) and len(name) <= 120, "Invalid garment name")
    _require(slot in {"top", "bottom", "shoes", "fullBody"}, "Invalid garment slot")
    _require(painting_mode in {"composite", "patch"}, "painting_mode must be composite or patch")
    _require(painting_mode != "patch" or ownership is not None, "Patch mode needs explicit ownership")
    _require(isinstance(provenance, str) and 0 < len(provenance.strip()) <= 4000, "Provenance must have 1-4000 characters")
    _require(set(paintings) == set(ctx.frames), "Paintings must cover every registered frame exactly once")
    _require(ctx.registration == json.loads(ctx.registration_bytes), "In-memory registration changed after binding")
    _require(ownership is None or set(ownership) == set(ctx.frames), "Ownership must cover every registered frame exactly once")
    entries, crops, checks, sizes = [], {}, [], []
    page_width, max_height = 2048, 4096
    page, x, y, row_height, used_width = 0, 0, 0, 0, 0
    for fid in sorted(ctx.frames):
        source = ctx.frames[fid]
        painting = _native_pixels(paintings[fid], f"Frame {fid}")
        if painting_mode == "patch":
            owned = _binary_mask(ownership[fid], f"Frame {fid} ownership")
            _require(not painting[~owned].any(), f"Frame {fid} patch has RGBA outside ownership")
            composite = source.copy()
            composite[owned] = painting[owned]
            painting = composite
        changed = np.any(painting != source, axis=2)
        owned = changed if ownership is None else _binary_mask(ownership[fid], f"Frame {fid} ownership")
        _require(not (changed & ~owned).any(), f"Frame {fid} changes pixels outside ownership")
        forbidden = owned & ctx.protected_mask(fid)
        _require(not forbidden.any(), f"Frame {fid} owns {int(forbidden.sum())} protected head/hand source pixels")
        ys, xs = np.where(owned)
        if len(xs):
            left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        else:
            left, top, right, bottom = 0, 0, 1, 1
        width, height = right - left, bottom - top
        if x + width > page_width:
            x, y, row_height = 0, y + row_height, 0
        if y + height > max_height:
            sizes.append((used_width, y + row_height - 2))
            page, x, y, row_height, used_width = page + 1, 0, 0, 0, 0
        _require(page < 4, "Garment requires more than 4 atlas pages")
        crop_mask = owned[top:bottom, left:right]
        patch = np.zeros((height, width, 4), np.uint8)
        patch[crop_mask] = painting[top:bottom, left:right][crop_mask]
        crops[fid] = patch, crop_mask
        entries.append({"frameId": fid, "page": page,
                        "rect": {"x": x, "y": y, "width": width, "height": height},
                        "offset": {"x": left, "y": top}})
        masks = ctx.masks(fid)
        checks.append({"frameId": fid, "sourceFrame": ctx.registered[fid]["sourceFrame"],
                       "sourceRgbaSha256": sha(source.tobytes()), "paintedRgbaSha256": sha(painting.tobytes()),
                       "ownershipSha256": sha(owned.astype(np.uint8).tobytes()),
                       "ownedPixels": int(owned.sum()), "changedPixels": int(changed.sum()),
                       "extensionPixels": int((owned & (source[:, :, 3] == 0) & (painting[:, :, 3] != 0)).sum()),
                       "erasedSourcePixels": int((owned & (source[:, :, 3] != 0) & (painting[:, :, 3] == 0)).sum()),
                       "coveredPartialSkinProofPixels": int((changed & masks["skin"] & (painting[:, :, 3] != 0)).sum()),
                       "protectedPixelsExact": True, "outsideOwnershipExact": True})
        used_width = max(used_width, x + width)
        x += width + 2
        row_height = max(row_height, height + 2)
    sizes.append((used_width, y + row_height - 2))
    pixel_count = sum(w * h for w, h in sizes)
    _require(pixel_count <= LIMIT_PIXELS, "Garment exceeds 32 Mi pixels")
    files, pages = {}, []
    for page, (width, height) in enumerate(sizes):
        rgba, ownership_rgba = np.zeros((height, width, 4), np.uint8), np.zeros((height, width, 4), np.uint8)
        for entry in entries:
            if entry["page"] != page:
                continue
            r = entry["rect"]
            x, y, w, h = (r[k] for k in ("x", "y", "width", "height"))
            patch, mask = crops[entry["frameId"]]
            rgba[y:y + h, x:x + w] = patch
            ownership_rgba[y:y + h, x:x + w, 3] = mask.astype(np.uint8) * 255
        filename, maskname = f"patches-{page}.png", f"ownership-{page}.png"
        files[filename] = encode_rgba(rgba, ctx.color_chunks)
        files[maskname] = encode_rgba(ownership_rgba)
        pages.append({"file": filename, "maskFile": maskname, "width": width, "height": height})
    manifest = {"format": "gathria-sprite-garment", "version": 1, "id": item_id, "name": name,
                "slot": slot, "sourceSha256": ctx.source_sha256, "registrationSha256": ctx.registration_sha256,
                "characterId": ctx.registration["characterId"], "frameWidth": W, "frameHeight": H,
                "pages": pages, "frames": entries, "provenance": provenance}
    files["manifest.json"] = _json(manifest)
    _require(len(files["manifest.json"]) <= 1024 * 1024, "Metadata exceeds 1MiB")
    _require(sum(map(len, files.values())) <= LIMIT_BYTES, "Expanded garment exceeds 64MiB")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, data in sorted(files.items()):
            info = zipfile.ZipInfo(filename, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    data = buffer.getvalue()
    _require(len(data) <= LIMIT_BYTES, "Garment archive exceeds 64MiB")
    path = Path(output_path)
    immutable_paths = [ctx.root / "docs/kling-side-workspace/assets" / f"{ctx.identity}.source.zip",
                       ctx.root / "docs/kling-side-workspace/assets" / f"{ctx.identity}.registration.json",
                       ctx.root / "artwork/kling-side-workspace/registration" / ctx.identity / "registration.json"]
    _require(path.resolve() not in {p.resolve() for p in immutable_paths}, "Garment output must not overwrite immutable source/registration")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"format": "gathria-side-authoring-audit", "version": 1, "id": item_id, "file": path.name,
            "sha256": sha(data), "bytes": len(data), "decodedPixelsPerAtlasKind": pixel_count,
            "sourceSha256": ctx.source_sha256, "registrationSha256": ctx.registration_sha256,
            "pages": pages, "frames": checks, "provenance": provenance,
            "limitations": "Partial skin-proof overlap counts are descriptive, not exhaustive anatomy evidence. Original head/hands and outside-ownership bytes remain exact; source shape may be covered or extended only by explicit owned cloth."}


def _draw_dashed(draw, a, b, color, width=2):
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    for i in range(0, max(1, math.ceil(length)), 9):
        lo, hi = i / max(length, 1), min(i + 4, length) / max(length, 1)
        draw.line([(a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo),
                   (a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi)], fill=color, width=width)


def export_templates(ctx: SideContext, output_dir: Path | str, frame_ids=None) -> dict:
    """Export native source+guides+blank paint layer; metadata never enters V1 ZIP."""
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    index = {"format": "gathria-side-painting-templates", "version": 1, "identity": ctx.identity,
             "sourceSha256": ctx.source_sha256, "registrationSha256": ctx.registration_sha256,
             "frameWidth": W, "frameHeight": H, "anchor": {"x": 256, "y": 710}, "frames": []}
    for fid in frame_ids or DEFAULT_TEMPLATES[ctx.identity]:
        metadata = ctx.frame_metadata(fid)
        source = ctx.frames[fid]
        segments = ctx.source_visible_segments(fid)
        prefix = f"{ctx.identity}-{metadata['action']}-frame{fid:03d}-source{metadata['sourceFrame']}"
        guide_rgba = np.zeros_like(source)
        labels = np.zeros((H, W), np.uint8)
        for i, (_, mask) in enumerate(segments["masks"].items()):
            guide_rgba[mask] = [*SEGMENT_COLORS[i], 165]
            labels[mask] = i + 1
        guide_rgba[segments["uncertain"]] = [255, 194, 35, 200]
        # Checker/hatch marks flag disputed labels without inventing missing skin.
        yy, xx = np.indices((H, W))
        guide_rgba[segments["uncertain"] & ((xx + yy) % 8 < 2)] = [53, 39, 17, 220]
        guide = Image.alpha_composite(Image.fromarray(source), Image.fromarray(guide_rgba))
        draw = ImageDraw.Draw(guide)
        points = metadata["anchors"]
        for _, (start, end, _) in SEGMENTS.items():
            a, b = points[start], points[end]
            coords = [(a["x"], a["y"]), (b["x"], b["y"])]
            if any(p["visibility"] == "occluded" or p.get("confidence", 0) < .6 for p in (a, b)):
                _draw_dashed(draw, *coords, color=(255, 178, 40, 255))
            else:
                draw.line(coords, fill=(64, 210, 246, 255), width=2)
        for region in metadata["protected"]:
            coords = [(p["x"], p["y"]) for p in region["polygon"]]
            draw.line(coords + [coords[0]], fill=(40, 220, 123, 255), width=2)
        for number, key in enumerate(ANCHORS, 1):
            p = points[key]
            weak = p["visibility"] == "occluded" or p.get("confidence", 0) < .6
            x, y = p["x"], p["y"]
            color = (255, 175, 30, 255) if weak else (247, 77, 143, 255)
            draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=color)
            draw.text((x + 4, y - 8), str(number), fill=color, stroke_width=1, stroke_fill=(20, 20, 20, 255))
        draw.rectangle((6, 6, 505, 70), fill=(24, 29, 34, 240))
        draw.text((13, 12), f"{ctx.identity} | {metadata['action']} | frame {fid} | {metadata['sourceVideo']}:{metadata['sourceFrame']}", fill="white")
        draw.text((13, 29), "Pink: visible estimates | Orange/dashes: hidden or weak", fill="white")
        draw.text((13, 46), "Green: original head/hands | Hatch: ambiguous skin guide", fill="white")
        paths = {"source": prefix + "-source.png", "guide": prefix + "-guides.png",
                 "paintLayer": prefix + "-paint.png", "segmentLabels": prefix + "-segments.png",
                 "uncertainty": prefix + "-uncertain.png", "metadata": prefix + ".json"}
        (output / paths["source"]).write_bytes(encode_rgba(source, ctx.color_chunks))
        (output / paths["guide"]).write_bytes(encode_rgba(np.array(guide)))
        (output / paths["paintLayer"]).write_bytes(encode_rgba(np.zeros_like(source)))
        Image.fromarray(labels).save(output / paths["segmentLabels"])
        Image.fromarray(segments["uncertain"].astype(np.uint8) * 255).save(output / paths["uncertainty"])
        metadata.update({"segmentLabels": {str(i + 1): key for i, key in enumerate(SEGMENTS)},
                         "segments": segments["segments"], "limitations": segments["limitations"],
                         "anchorNumberKey": {str(i + 1): key for i, key in enumerate(ANCHORS)},
                         "paintingInstructions": ["Keep the source as a locked native layer. Paint cloth on the blank transparent layer.",
                             "Author explicit ownership for new cloth and erased old cloth; render final native RGBA before packing.",
                             "Green protected source pixels must stay exact. Cloth may cover arm/leg skin or extend source silhouette within the native canvas.",
                             "Inspect crossings and overlaps in this actual source pose; near/far labels do not prove a universal depth order.",
                             "Orange and hatched hints are uncertain, not recovered anatomy. Do not move or reshape source body parts."],
                         "files": paths})
        if ctx.registration_sha256 == FROZEN[ctx.identity]["registration"] and (ctx.identity, fid) in KNOWN_PROTECTION_LIMITS:
            metadata["frozenProtectionCaveat"] = KNOWN_PROTECTION_LIMITS[ctx.identity, fid]
        (output / paths["metadata"]).write_bytes(_json(metadata))
        index["frames"].append({"frameId": fid, "sourceFrame": metadata["sourceFrame"], "action": metadata["action"],
                                "sourceVideo": metadata["sourceVideo"], "files": paths,
                                "sourceRgbaSha256": metadata["sourceRgbaSha256"]})
    (output / "index.json").write_bytes(_json(index))
    return index


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["templates", "check"])
    parser.add_argument("--identity", choices=["male", "female", "both"], default="both")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=Path("/tmp/side-expansion/templates"))
    parser.add_argument("--frames", help="Comma-separated source-pack frame IDs (one identity only)")
    args = parser.parse_args()
    _require(not args.frames or args.identity != "both", "--frames needs one identity")
    for identity in (["male", "female"] if args.identity == "both" else [args.identity]):
        ctx = load_context(identity, args.root)
        if args.command == "templates":
            ids = [int(n) for n in args.frames.split(",")] if args.frames else None
            index = export_templates(ctx, args.output / identity, ids)
            print(json.dumps({"identity": identity, "templates": len(index["frames"]), "output": str(args.output / identity)}))
        else:
            for fid in ctx.frames:
                ctx.masks(fid)
                ctx.protected_mask(fid)
            print(json.dumps({"identity": identity, "frames": len(ctx.frames), "sourceSha256": ctx.source_sha256,
                              "registrationSha256": ctx.registration_sha256, "status": "frozen source/registration/RGBA/mask bindings verified"}))


if __name__ == "__main__":
    main()
