"""Extract the reviewed side-view candidates from original uploaded videos.

Technical processing only: chroma key, one fixed uniform registration per source,
consecutive original frames at 24 fps, transparent PNG and ordinary V2/V3 packs.
No drawing, frame interpolation, temporal smoothing, per-frame stabilization,
body warping, duplicated holds or crossfades. Defaults and wardrobe stay intact.
"""

from pathlib import Path
import argparse, hashlib, io, json, math, subprocess, tempfile, zipfile
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT, ANCHOR = 512, 768, (256, 710)
ACTIONS = ("idle", "walk", "run", "jump", "celebrate")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def js(data):
    return (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode()


def png(im):
    b = io.BytesIO()
    im.save(b, format="PNG", compress_level=6)
    return b.getvalue()


def put(z, name, data):
    info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
    info.compress_type = (
        zipfile.ZIP_STORED if name.endswith(".png") else zipfile.ZIP_DEFLATED
    )
    info.external_attr = 0o100644 << 16
    z.writestr(info, data)


def matte(source, profile):
    """Adapted from prepare-kling-playback.py; opaque source RGB is immutable."""
    rgb = source.astype(np.float32)
    r, g, b = [rgb[:, :, i] for i in range(3)]
    score = (g - np.maximum(r, b)) / np.maximum(g, 1)
    t = np.clip(
        (score - profile["greenStart"]) / (profile["greenEnd"] - profile["greenStart"]),
        0,
        1,
    )
    alpha = 1 - t * t * (3 - 2 * t)
    components, _ = label(alpha > 0.5)
    sizes = np.bincount(components.ravel())
    sizes[0] = 0
    main = components == sizes.argmax()
    keep = binary_dilation(main, iterations=3)
    # Thin outline islands within the overlap margin are retained, not discarded.
    # Audit only opaque pixels actually outside that retained margin.
    removed = np.bincount(components[~keep], minlength=len(sizes))
    removed[0] = 0
    discarded = sorted((int(n) for n in removed if n), reverse=True)
    if discarded and discarded[0] > 32:
        raise ValueError(
            f"Inspect disconnected foreground before proceeding: {discarded[:8]}"
        )
    alpha[~keep] = 0
    a = np.rint(alpha * 255).astype(np.uint8)
    alpha = a.astype(np.float32) / 255
    edge = (a > 0) & (a < 255)
    background = np.median(rgb[20:100, 20:100].reshape(-1, 3), axis=0)
    out = rgb.copy()
    out[edge] = (rgb[edge] - (1 - alpha[edge, None]) * background) / alpha[edge, None]
    out[edge, 1] = np.minimum(out[edge, 1], np.maximum(out[edge, 0], out[edge, 2]))
    out = np.clip(np.rint(out), 0, 255).astype(np.uint8)
    out[a == 0] = 0
    assert np.array_equal(out[a == 255], source[a == 255])
    return Image.fromarray(np.dstack((out, a))), {
        "discardedSmallComponents": discarded,
        "opaqueRgbPreservedBeforeRegistration": True,
        "backgroundRgb": background.tolist(),
    }


def registration(image):
    a = np.asarray(image)[:, :, 3]
    y, x = np.where(a >= 128)
    top, bottom = int(y.min()), int(y.max() + 1)
    foot = a[int(bottom - 0.14 * (bottom - top)) : bottom] >= 128
    fy, fx = np.where(foot)
    center = (int(fx.min()) + int(fx.max()) + 1) / 2
    scale = 480 / (bottom - top)
    return {
        "referenceFrame": 0,
        "sourceHeadTop": top,
        "sourceGroundY": bottom,
        "sourceFootCenterX": center,
        "scale": scale,
        "targetStandingHeight": 480,
        "targetAnchor": list(ANCHOR),
        "method": "one_uniform_affine_per_source_from_opening_stance; no per-frame recentering",
        "inverseAffine": [
            1 / scale,
            0,
            center - ANCHOR[0] / scale,
            0,
            1 / scale,
            bottom - ANCHOR[1] / scale,
        ],
    }


def register(image, reg):
    # Premultiplied interpolation avoids dark fringes from transparent RGB.
    result = (
        image.convert("RGBa")
        .transform(
            (WIDTH, HEIGHT),
            Image.Transform.AFFINE,
            reg["inverseAffine"],
            resample=Image.Resampling.BICUBIC,
        )
        .convert("RGBA")
    )
    bounds = result.getbbox()
    assert (
        bounds
        and 0 < bounds[0] < bounds[2] < WIDTH
        and 0 < bounds[1] < bounds[3] < HEIGHT
    ), ("Clipped normalized source", bounds)
    source_bounds = image.getbbox()
    s = reg["scale"]
    cx = reg["sourceFootCenterX"]
    gy = reg["sourceGroundY"]
    transformed = [
        (source_bounds[0] - cx) * s + ANCHOR[0],
        (source_bounds[1] - gy) * s + ANCHOR[1],
        (source_bounds[2] - cx) * s + ANCHOR[0],
        (source_bounds[3] - gy) * s + ANCHOR[1],
    ]
    assert (
        transformed[0] > 1
        and transformed[1] > 1
        and transformed[2] < WIDTH - 1
        and transformed[3] < HEIGHT - 1
    ), ("Source extent clips", transformed)
    return result


def compile_pack(identity, character, images, profile, out):
    definitions = []
    animations = {}
    records = []
    ordered = []
    for action in ACTIONS:
        clip = character["actions"][action]
        ids = []
        for source_frame in range(clip["start"], clip["endExclusive"]):
            frame_id = len(ordered)
            key = (clip["source"], source_frame)
            ordered.append(key)
            ids.append(frame_id)
            records.append(
                {
                    "frameId": frame_id,
                    "sourceFrame": source_frame,
                    "timeSeconds": source_frame / 24,
                    "sourceId": clip["source"],
                    "action": action,
                }
            )
        animations[action] = {"frames": ids, "fps": 24, "loop": clip["loop"]}
    assert animations["jump"]["loop"] is False
    # <= 48 cells per page keeps native decode memory bounded, at most four pages.
    capacity = 48
    pages = math.ceil(len(ordered) / capacity)
    assert pages <= 4
    sheets = []
    files = {}
    fidelity = []
    for page in range(pages):
        chunk = ordered[page * capacity : (page + 1) * capacity]
        cols = min(8, len(chunk))
        rows = math.ceil(len(chunk) / cols)
        atlas = Image.new("RGBA", (cols * WIDTH, rows * HEIGHT))
        for j, key in enumerate(chunk):
            frame_id = page * capacity + j
            x = (j % cols) * WIDTH
            y = (j // cols) * HEIGHT
            atlas.paste(images[key], (x, y))
            definition = {
                "id": frame_id,
                "x": x,
                "y": y,
                "width": WIDTH,
                "height": HEIGHT,
            }
            if pages > 1:
                definition["page"] = page
            definitions.append(definition)
        name = "spritesheet.png" if page == 0 else f"spritesheet-{page}.png"
        encoded = png(atlas)
        files[name] = encoded
        decoded = Image.open(io.BytesIO(encoded))
        decoded.load()
        for j, key in enumerate(chunk):
            x = (j % cols) * WIDTH
            y = (j // cols) * HEIGHT
            cell = decoded.crop((x, y, x + WIDTH, y + HEIGHT))
            assert cell.tobytes() == images[key].tobytes()
            fidelity.append(
                {
                    "frameId": page * capacity + j,
                    "rgbaSha256": sha(cell.tobytes()),
                    "exactRegisteredFrame": True,
                }
            )
        sheets.append(
            {
                "file": name,
                "width": atlas.width,
                "height": atlas.height,
                "frameWidth": WIDTH,
                "frameHeight": HEIGHT,
                "columns": cols,
                "rows": rows,
            }
        )
        atlas.close()
        decoded.close()
    name = f"Kling {identity} — side-view selection candidate"
    manifest = {
        "schemaVersion": 3 if pages > 1 else 2,
        "format": "gathria-character-pack",
        "name": name,
        "generator": "gathria-side-selection-v1",
        "spritesheet": sheets[0],
        "frames": definitions,
        "animations": animations,
        "anchor": {
            "x": ANCHOR[0],
            "y": ANCHOR[1],
            "units": "pixels",
            "origin": "top-left",
        },
        "facing": {"native": "right", "right": "none", "left": "mirror-x"},
        "scale": {"pixelArt": False, "integerOnly": False, "recommended": 0.5},
        "capabilities": {"renderMode": "baked", "editableAppearance": False},
        "configuration": "character.json",
    }
    if pages > 1:
        manifest["additionalSheets"] = sheets[1:]
    provenance = "User-uploaded Kling side-view videos. Separate mixed-source REVIEW CANDIDATE; no default replacement or visual acceptance. Original consecutive frames at 24 fps. Technical chroma-key alpha and edge unmix/despill, followed by a fixed uniform premultiplied affine registration per source. Opaque RGB is exact before resampling; normalized frames intentionally resample source pixels. No new artwork, skeleton fitting, body deformation, temporal interpolation, per-frame stabilization, crossfade or forced jump loop. Primary source below is not the only source; sourceMetadata maps EVERY frame to its video hash. Walk quality and jump-to-idle continuity remain under review. Clothing is baked and cannot use existing wardrobe masks."
    source_ids = sorted({key[0] for key in ordered})
    primary = profile["sources"][character["actions"]["run"]["source"]]
    config = {
        "format": "gathria-baked-character",
        "schemaVersion": 1,
        "name": name,
        "characterId": f"kling-{identity}-side-selection-v1",
        "source": {
            "kind": "video-extraction",
            "name": Path(primary["video"]).name,
            "sha256": primary["sha256"],
        },
        "provenance": provenance,
        "derivation": {
            "method": provenance,
            "frames": [
                {k: r[k] for k in ["frameId", "sourceFrame", "timeSeconds"]}
                for r in records
            ],
        },
        "sourceMetadata": {
            "status": "review-candidate-not-user-approved",
            "sources": {sid: profile["sources"][sid] for sid in source_ids},
            "frameSources": {str(r["frameId"]): r["sourceId"] for r in records},
            "selection": character["actions"],
            "registration": {sid: profile["registration"][sid] for sid in source_ids},
            "limitations": character["limitations"],
        },
    }
    assert len(js(config["sourceMetadata"])) < 64 * 1024
    integration = "# Side-view selection candidate\n\nPlay at declared 24 fps. Mirror around the fixed anchor for left. Jump and celebration play once and hold their final source pose; replay explicitly. No automatic idle return or motion-flow routes have been fabricated. Loop candidates are reviewed selections, not guarantees of a seamless transition between actions. See character.json for each source and registration. Existing wardrobe assets belong to old poses and are not compatible with these baked frames.\n"
    files.update(
        {
            "manifest.json": js(manifest),
            "character.json": js(config),
            "PROVENANCE.txt": provenance.encode(),
            "INTEGRATION.md": integration.encode(),
        }
    )
    path = out / f"{identity}.character.zip"
    with zipfile.ZipFile(path, "w") as z:
        for name, data in files.items():
            put(z, name, data)
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
    assert path.stat().st_size < 64 * 1024 * 1024
    return {
        "identity": identity,
        "file": path.name,
        "sha256": sha(path.read_bytes()),
        "bytes": path.stat().st_size,
        "frameCount": len(ordered),
        "sheets": sheets,
        "animations": animations,
        "frameFidelity": fidelity,
        "sourceRecords": records,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--profile",
        type=Path,
        default=ROOT / "artwork/kling-side-selection/selection.json",
    )
    ap.add_argument("--output", type=Path, default=ROOT / "docs/kling-side-selection")
    args = ap.parse_args()
    profile = json.loads(args.profile.read_text())
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    (out / "exports").mkdir(exist_ok=True)
    wanted = {sid: {0} for sid in profile["sources"]}
    for char in profile["characters"].values():
        for clip in [*char["actions"].values(), *char.get("comparisons", {}).values()]:
            wanted[clip["source"]].update(range(clip["start"], clip["endExclusive"]))
    images = {}
    report = {
        "format": "gathria-side-selection-extraction",
        "version": 1,
        "profileSha256": sha(args.profile.read_bytes()),
        "sources": {},
        "packs": [],
    }
    profile["registration"] = {}
    for sid, source in profile["sources"].items():
        path = ROOT / source["video"]
        assert sha(path.read_bytes()) == source["sha256"], f"Wrong source {sid}"
        stream = json.loads(
            subprocess.check_output(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_streams",
                    "-of",
                    "json",
                    str(path),
                ]
            )
        )["streams"][0]
        assert (stream["width"], stream["height"], stream["avg_frame_rate"]) == (
            1920,
            1080,
            "24/1",
        )
        ids = sorted(wanted[sid])
        ranges = []
        for i in ids:
            if ranges and i == ranges[-1][1] + 1:
                ranges[-1][1] = i
            else:
                ranges.append([i, i])
        selection = "+".join(f"between(n,{lo},{hi})" for lo, hi in ranges)
        frame_report = []
        with tempfile.TemporaryDirectory(prefix=f"gathria-side-{sid}-") as temp:
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-i",
                    str(path),
                    "-vf",
                    f'select={selection.replace(",", chr(92)+",")}',
                    "-fps_mode",
                    "passthrough",
                    f"{temp}/%04d.png",
                ],
                check=True,
            )
            files = sorted(Path(temp).glob("*.png"))
            assert len(files) == len(ids)
            for i, file in zip(ids, files):
                rgb = np.array(Image.open(file).convert("RGB"))
                im, stats = matte(rgb, source["matte"])
                if i == 0:
                    profile["registration"][sid] = registration(im)
                normalized = register(im, profile["registration"][sid])
                images[(sid, i)] = normalized
                target = out / "frames" / sid / f"{i:04d}.png"
                target.parent.mkdir(parents=True, exist_ok=True)
                data = png(normalized)
                target.write_bytes(data)
                frame_report.append(
                    {
                        "sourceFrame": i,
                        "path": str(target.relative_to(out)),
                        "pngSha256": sha(data),
                        "rgbaSha256": sha(normalized.tobytes()),
                        "bounds": normalized.getbbox(),
                        **stats,
                    }
                )
                if i == 0:
                    (out / "review").mkdir(exist_ok=True)
                    Image.fromarray(rgb).save(
                        out / "review" / f"{sid}-raw-standing.png"
                    )
                    im.save(out / "review" / f"{sid}-native-matte.png")
                im.close()
        report["sources"][sid] = {
            "sha256": source["sha256"],
            "registration": profile["registration"][sid],
            "frames": frame_report,
        }
        print(
            f'{sid}: {len(ids)} source frames; fixed scale={profile["registration"][sid]["scale"]:.5f}',
            flush=True,
        )
    for identity, char in profile["characters"].items():
        report["packs"].append(
            compile_pack(identity, char, images, profile, out / "exports")
        )
    report["passed"] = True
    (out / "extraction-report.json").write_bytes(js(report))
    (out / "registered-selection.json").write_bytes(js(profile))
    for im in images.values():
        im.close()
    print(
        json.dumps(
            {
                "passed": True,
                "packs": [
                    {
                        "identity": p["identity"],
                        "frames": p["frameCount"],
                        "bytes": p["bytes"],
                    }
                    for p in report["packs"]
                ],
            }
        )
    )


if __name__ == "__main__":
    main()
