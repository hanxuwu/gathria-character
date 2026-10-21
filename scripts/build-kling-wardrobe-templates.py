#!/usr/bin/env python3
"""Package source-bound offline wardrobe authoring kits without new source art.

Prepare the male/female registration first. This script preserves the exact
source CharacterPack, registration JSON and semantic PNG bytes; no frame is
resampled, recolored, redrawn or copied into a separate tracked frame directory.
Requires Python 3 and Pillow. The result is an authoring kit, not a garment or
an editable wardrobe-project import. All timestamps and output ordering are fixed.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = ROOT / "scripts/requirements-kling-wardrobe.txt"
MAX_KIT_BYTES = 128 * 1024 * 1024
ZIP_TIME = (2020, 1, 1, 0, 0, 0)
ACTIONS = ("idle", "walk", "run", "jump", "celebrate")
ANCHORS = (
    "neck", "nearShoulder", "farShoulder", "waistLeft", "waistRight",
    "nearHip", "farHip", "nearElbow", "farElbow", "nearWrist", "farWrist",
    "nearKnee", "farKnee", "nearAnkle", "farAnkle", "nearToe", "farToe",
)
COMMON_REGIONS = ("tank", "shorts", "skin", "shoes", "head", "nearHand", "farHand")
EXTRA_FEMALE_REGIONS = ("nearArm", "farArm", "nearShoe", "farShoe")
REQUIRED_NONEMPTY = {"tank", "shorts", "skin", "shoes", "head"}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def canonical_zip(files: dict[str, bytes]) -> bytes:
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w", allowZip64=False) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, ZIP_TIME)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            # PNG and source ZIP are already compressed; keep their exact bytes.
            info.compress_type = zipfile.ZIP_STORED if name.endswith((".png", ".zip")) else zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=9)
    return result.getvalue()


def inspect_mask(data: bytes, dimensions: tuple[int, int], label: str) -> dict:
    if not data:
        raise ValueError(f"{label}: empty PNG file")
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "PNG" or image.mode != "L" or image.size != dimensions:
            raise ValueError(f"{label}: expected native {dimensions} grayscale-L PNG, got {image.format}/{image.mode}/{image.size}")
        if getattr(image, "n_frames", 1) != 1:
            raise ValueError(f"{label}: semantic mask must be a single static PNG")
        image.load()  # Decode every delivered mask, not just its header.
        histogram = image.histogram()
        return {
            "bytes": len(data), "sha256": sha(data), "mode": image.mode,
            "width": image.width, "height": image.height,
            "nonzeroPixels": sum(histogram[1:]),
            "partialCoveragePixels": sum(histogram[1:255]),
            "binary": not any(histogram[1:255]),
        }


def mask_path(character: str, prepared: Path, frame_id: int, region: str) -> Path:
    if character == "male":
        subdir = "registration" if region in {"head", "nearHand", "farHand"} else "semantic"
        return prepared / subdir / f"{frame_id:03}-{region}.png"
    source_region = "headNeck" if region == "head" else region
    for prefix in (str(frame_id), f"{frame_id:03}"):
        candidate = prepared / "masks" / prefix / f"{source_region}.png"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(prepared / "masks" / str(frame_id) / f"{source_region}.png")


def guide(character: str, source: dict, registration_sha: str, actions: dict, regions: tuple[str, ...]) -> bytes:
    counts = "\n".join(
        f"| {action} | {len(actions[action]['frames'])} | {len(set(actions[action]['frames']))} | {actions[action]['fps']} | {'loop' if actions[action]['loop'] else 'one-shot; hold last frame'} |"
        for action in ACTIONS
    )
    return f"""# Kling {character}: offline clothing authoring kit

This kit contains the exact approved source CharacterPack, its native-frame
registration, and semantic authoring masks. It is **not** a dressed character,
not an editable wardrobe project, and not an automatic fitting model. Do not
upload this ZIP through the garment/project import control; use its files to
prepare a source-bound garment ZIP offline.

## Frozen visual and motion source

- Character: `{source['characterId']}`.
- Source CharacterPack SHA-256: `{source['sha256']}`.
- Exact registration JSON SHA-256: `{registration_sha}`.
- Native canvas: {source['frameWidth']}×{source['frameHeight']}.
- Attachment: ({source['anchor']['x']}, {source['anchor']['y']}); native facing right.
- Unique source frames: {source['frameCount']}.

Keep the approved head, face, proportions, shoulder/neck relationships and
source-frame positions. Do not change the body to fit a garment. Clothing can
intentionally cover a body region, but all source RGBA outside its declared
ownership must remain byte-for-byte unchanged. Source video pixels do not
contain the surfaces hidden under the original vest/shorts: newly exposed areas
need explicitly authored underpainting, with provenance. Do not claim that
these invisible body layers were accurately extracted from the video.

The `source.character.zip` bytes are unchanged. It contains the original PNG
atlas pages, manifest and recipe; the kit does not duplicate cropped source
frames. `frame-index.json` maps exact atlas frame IDs to page/rectangle,
original video frame number and timestamp. IDs are not consecutive counters.

| Action | Timeline entries | Unique poses | FPS | Playback |
| --- | ---: | ---: | ---: | --- |
{counts}

All five action frame lists are retained exactly. Repeated IDs are deliberate
holds. The jump is a complete one-shot, not a shortened loop. Clothing must
cover **every** unique source frame, including jump and celebration. Left
playback mirrors the whole character around the original attachment; it does
not mirror each garment around a separate origin.

## Registration and uncertainty

`registration.json` contains 17 native-coordinate landmarks per source frame:
{', '.join(f'`{name}`' for name in ANCHORS)}.

The guides record visibility, confidence and derivation method. Hidden joints
and interpolated points are estimates, not original skeletal data. Inspect
these guides against each frame before preparing complex sleeves, trousers or
skirts. Registration changes must get a new SHA-256 and matching re-prepared
garments; never silently apply old clothes against changed anchors. Do not
substitute the different anchor from an older skeleton study.

Every frame includes a reviewed `head` protection polygon, and may include
`nearHand`/`farHand` polygons. The runtime checks native pixel centers, including
polygon boundaries. Garment ownership cannot intersect **nonzero-alpha source
pixels** inside those polygons; this preserves antialiased face/hand edges too.
The head protection includes the reviewed neck boundary. General skin masks
are not all foreground occluders: future sleeves may cover forearms, while
hands still need correct front/back ordering.

## Masks in this kit

`masks/<frameId>/<region>.png` contains native grayscale-L semantic guides.
Regions: {', '.join(f'`{region}`' for region in regions)}.
For this kit, the female preparation's `headNeck` filename is normalized to
`head`; PNG contents are otherwise unchanged. Each file's hash, decode result,
pixel count and whether it contains partial coverage are in `inventory.json`.

These semantic guides describe **current visible material ownership**, not
finished new clothing. Some masks retain soft source alpha rather than binary
values. Empty near/far hand or arm masks are valid when that part is hidden.
The mask inventory explicitly records these empty regions. Do not assume a
mask is faulty merely because an occluded hand has no visible pixels.

Do not blindly reuse these mask PNGs as a runtime ownership bank. Final
ownership must have alpha exactly 0 or 255. It must include the old clothing to
replace, the authored new silhouette and any approved underpainting; exclude
the protected head/foreground hands and resolve near/far limb ordering for the
actual pose. A semantic segmentation or anchor location is a review aid, not
proof that garment contours will fit.

## Build a real garment pose bank

1. Design the clothing offline in the same view, scale, lighting and drawing
   style. Record the art source/tool, prompt, processing and hidden-surface
   reconstruction. A single standing PNG cannot automatically fit every pose.
2. Prepare a native RGBA patch plus binary ownership for each exact frame ID.
   Keep cloth/cuff/joint overlaps stable; add pose-specific art where simple
   deformation cannot preserve a folded sleeve, trouser knee or skirt volume.
3. Decide occlusion explicitly. The near hand may cover a shirt; a long dress
   may cover shoes; a far arm may be behind the torso. Prepare the final patch
   accordingly rather than relying on one global foreground-color deletion.
4. Crop and pack matching patch/ownership atlases. Both use the same rectangle;
   its integer `offset` places it in the unchanged native source frame. At
   ownership=255 the compositor **replaces all RGBA channels**, including alpha
   zero for old-cloth removal. At ownership=0 the patch must be transparent and
   the original source pixel remains exact. This is not source-over blending.
5. Create a `gathria-sprite-garment`, version 1, manifest with source/registration
   hashes, stable item ID/name, slot, pages, every frame and truthful provenance.
   See the repository's `docs/kling-wardrobe/FORMAT.md` and
   `scripts/kling_wardrobe_common.py::save_garment` for the implemented format.
6. Import through the wardrobe garment control. Examine native/2× stills and
   full idle/walk/run/jump/celebrate playback in both directions. Compare to the
   source frame, checking head/neck, armpits, hands, waist, crotch, knees, hems
   and ankles. Validate all supported slot combinations, not just a hero pose.
7. Save a self-contained wardrobe project and export a baked CharacterPack.
   Close the editor and load the baked pack in the independent player. Passing
   hashes and coverage checks does not constitute visual acceptance.

## Slots, limits and compatibility

Slots: `top`, `bottom`, `fullBody`, `shoes`. A full-body outfit excludes top and
bottom; shoes remain independent. Composition order is shoes → bottom → top →
fullBody so cuffs/hem can cover footwear. Nullable slots retain source clothing.
Items are compatible only with this exact source and registration, not every
character with a similar name. Missing poses fail; they do not silently show
original clothing. New garment revisions need distinct stable IDs.

Garments allow up to four atlas pages, each dimension ≤8192, with ≤32 Mi pixels
total per patch bank and matching ownership bank; garment ZIP ≤64 MiB. An
editable wardrobe project embeds source/registration and at most 16 garments
within 128 MiB. Baked CharacterPack limits remain unchanged: ≤64 MiB ZIP and
V3 ≤4 pages/128 Mi decoded pixels/1024 cells. Use tighter crop packing rather
than changing the source canvas or bypassing limits.

## Reproducing preparation

The reviewed preparation environment was CPython 3.12.14, Pillow 12.3.0,
numpy 2.3.5, scipy 1.17.0 and opencv-python-headless 5.0.0.93
(`cv2.__version__` reports 5.0.0). The exact package pins are included as
`requirements.txt` and tracked in `scripts/requirements-kling-wardrobe.txt`.

Use those dependencies in a dedicated environment when regenerating anchors
or semantic masks. This execution used OpenCV from
`PYTHONPATH=/tmp/kling-wardrobe-python`; that temporary installation path is
not a runtime dependency of the kit or character. A normal virtual environment
with the pinned packages avoids relying on that directory. The packaging
builder alone needs Python and Pillow; it copies the supplied masks and source
bytes without re-running optical flow or inventing missing art. Different
preparation algorithms or numerical-library builds may produce new masks;
review them and rebuild hash-bound garments instead of asserting compatibility.

The repository's `docs/kling-wardrobe/templates/README.md` gives exact commands
and temporary output paths. Male preparation automatically finishes with
`scripts/refine-kling-wardrobe-male-masks.py`, applying the source-bound reviewed
contours in `artwork/kling-wardrobe/registration/male/reviewed-mask-corrections.json`.
Retain that step when reproducing the male masks; the verified local shoe
ownership cannot be replaced with a generic color threshold. The refinement
checks source and registration identity without changing source pixels or joints.

`inventory.json` hashes every delivered payload except itself. This kit is a
reproducible authoring reference; it does not promise seamless arbitrary new
clothing or repair pose transitions already present in the original source.
""".encode("utf-8")


def build(character: str, prepared: Path, output: Path) -> dict:
    source_path = ROOT / f"docs/kling-motion/exports/{character}.character.zip"
    registration_path = ROOT / f"artwork/kling-wardrobe/registration/{character}/registration.json"
    source_bytes = source_path.read_bytes()
    registration_bytes = registration_path.read_bytes()
    registration = json.loads(registration_bytes)
    with zipfile.ZipFile(io.BytesIO(source_bytes)) as source_zip:
        if source_zip.testzip() is not None:
            raise ValueError("Source CharacterPack failed its ZIP CRC verification")
        manifest = json.loads(source_zip.read("manifest.json"))
        recipe = json.loads(source_zip.read("character.json"))
        for page in [manifest["spritesheet"], *manifest.get("additionalSheets", [])]:
            with Image.open(io.BytesIO(source_zip.read(page["file"]))) as image:
                if image.mode != "RGBA" or image.size != (page["width"], page["height"]):
                    raise ValueError("Source PNG page geometry/mode differs from the manifest")
                image.load()
    frame_ids = {frame["id"] for frame in manifest["frames"]}
    registered = {frame["frameId"]: frame for frame in registration["frames"]}
    mapped = {frame["frameId"]: frame for frame in recipe["derivation"]["frames"]}
    dimensions = (manifest["spritesheet"]["frameWidth"], manifest["spritesheet"]["frameHeight"])
    if registration["sourceSha256"] != sha(source_bytes) or registration["characterId"] != recipe["characterId"]:
        raise ValueError("Registration is not bound to this exact source CharacterPack")
    if set(registered) != frame_ids or len(registration["frames"]) != len(frame_ids) or set(mapped) != frame_ids:
        raise ValueError("Registration/derivation do not cover source frame IDs exactly once")
    if (registration["frameWidth"], registration["frameHeight"]) != dimensions:
        raise ValueError("Registration changes the native source dimensions")
    if registration["anchor"] != {key: manifest["anchor"][key] for key in ("x", "y")}:
        raise ValueError("Registration changes the native source attachment")
    for frame_id, frame in registered.items():
        if frame["sourceFrame"] != mapped[frame_id]["sourceFrame"] or set(frame["points"]) != set(ANCHORS):
            raise ValueError(f"Frame {frame_id}: wrong video identity or missing native anchors")
        if "head" not in {region["label"] for region in frame["protected"]}:
            raise ValueError(f"Frame {frame_id}: missing head protection")
    if set(manifest["animations"]) != set(ACTIONS):
        raise ValueError("The initial authoring kits require all five source motions")
    referenced = {frame_id for clip in manifest["animations"].values() for frame_id in clip["frames"]}
    if referenced != frame_ids:
        raise ValueError("Source action coverage differs from the registered source frames")

    regions = COMMON_REGIONS + (EXTRA_FEMALE_REGIONS if character == "female" else ())
    files = {"source.character.zip": source_bytes, "registration.json": registration_bytes, "requirements.txt": REQUIREMENTS.read_bytes()}
    mask_records = []
    for frame_id in sorted(frame_ids):
        for region in regions:
            data = mask_path(character, prepared, frame_id, region).read_bytes()
            name = f"masks/{frame_id:03}/{region}.png"
            record = inspect_mask(data, dimensions, name)
            if region in REQUIRED_NONEMPTY and not record["nonzeroPixels"]:
                raise ValueError(f"{name}: required visible source-material mask is empty")
            files[name] = data
            mask_records.append({"file": name, "frameId": frame_id, "region": region, **record})
    if len(mask_records) != len(frame_ids) * len(regions):
        raise ValueError("Semantic mask coverage is incomplete")

    source = {
        "file": "source.character.zip", "bytes": len(source_bytes), "sha256": sha(source_bytes),
        "characterId": recipe["characterId"], "frameWidth": dimensions[0], "frameHeight": dimensions[1],
        "anchor": registration["anchor"], "frameCount": len(frame_ids),
    }
    frame_index = {
        "format": "gathria-wardrobe-authoring-frame-index", "version": 1,
        "sourceSha256": source["sha256"], "registrationSha256": sha(registration_bytes),
        "frameWidth": dimensions[0], "frameHeight": dimensions[1], "anchor": registration["anchor"],
        "actions": manifest["animations"],
        "frames": [{"frameId": frame["id"], "page": frame.get("page", 0), "rect": {key: frame[key] for key in ("x", "y", "width", "height")}, "sourceFrame": mapped[frame["id"]]["sourceFrame"], "timeSeconds": mapped[frame["id"]]["timeSeconds"]} for frame in sorted(manifest["frames"], key=lambda frame: frame["id"])],
    }
    files["frame-index.json"] = json_bytes(frame_index)
    files["GUIDE.md"] = guide(character, source, sha(registration_bytes), manifest["animations"], regions)
    files["inventory.json"] = json_bytes({
        "format": "gathria-wardrobe-authoring-template", "version": 1, "character": character,
        "source": source, "registration": {"file": "registration.json", "bytes": len(registration_bytes), "sha256": sha(registration_bytes)},
        "nativeFacing": "right", "leftPlayback": "mirror complete character around original anchor",
        "regions": list(regions), "maskCount": len(mask_records), "masks": mask_records,
        "files": [{"file": name, "bytes": len(data), "sha256": sha(data)} for name, data in sorted(files.items())],
        "verification": {"allFiveActions": True, "sourceFrames": len(frame_ids), "registeredFrames": len(registered), "decodedMaskPngs": len(mask_records), "sourceAndRegistrationBytesUnchanged": True},
        "limitations": ["Offline authoring reference, not an automatically fitted garment or wardrobe project.", "Semantic masks can have partial grayscale coverage; runtime ownership must be authored binary alpha.", "Hidden body surfaces and joints are not accurately recovered original video layers.", "Technical coverage does not establish garment visual acceptance."],
    })
    if sum(map(len, files.values())) > MAX_KIT_BYTES:
        raise ValueError("Authoring kit expanded payload exceeds 128 MiB")
    archive_bytes = canonical_zip(files)
    if len(archive_bytes) > MAX_KIT_BYTES:
        raise ValueError("Authoring kit ZIP exceeds 128 MiB")
    # Test the bytes actually being delivered, including decoding every mask again.
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != set(files):
            raise ValueError("Delivered authoring kit failed CRC or inventory checks")
        for name, data in files.items():
            delivered = archive.read(name)
            if delivered != data:
                raise ValueError(f"Delivered {name} differs from the validated bytes")
            if name.endswith(".png"):
                inspect_mask(delivered, dimensions, name)
    if canonical_zip(files) != archive_bytes:
        raise ValueError("Authoring kit ZIP is not reproducible")
    output.mkdir(parents=True, exist_ok=True)
    destination = output / f"{character}.wardrobe-template.zip"
    destination.write_bytes(archive_bytes)
    return {
        "character": character, "file": destination.name, "bytes": len(archive_bytes), "sha256": sha(archive_bytes),
        "sourceSha256": source["sha256"], "registrationSha256": sha(registration_bytes),
        "files": len(files), "sourceFrames": len(frame_ids), "regions": list(regions), "decodedMaskPngs": len(mask_records),
        "emptyOccludedMasks": sum(record["nonzeroPixels"] == 0 for record in mask_records),
        "partialCoverageMasks": sum(record["partialCoveragePixels"] > 0 for record in mask_records),
        "sourcePngPagesDecoded": 1 + len(manifest.get("additionalSheets", [])),
        "allFiveActions": True, "sourceAndRegistrationBytesUnchanged": True, "canonicalZipRebuildIdentical": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--character", choices=("male", "female", "all"), default="all")
    parser.add_argument("--male-prepared", type=Path, default=Path("/tmp/kling-wardrobe-male-repro"))
    parser.add_argument("--female-prepared", type=Path, default=Path("/tmp/kling-wardrobe-female"))
    parser.add_argument("--output", type=Path, default=ROOT / "docs/kling-wardrobe/templates")
    args = parser.parse_args()
    characters = ("male", "female") if args.character == "all" else (args.character,)
    records = []
    for character in characters:
        prepared = args.male_prepared if character == "male" else args.female_prepared
        record = build(character, prepared, args.output)
        records.append(record)
        print(json.dumps(record, ensure_ascii=False), flush=True)
    # A partial rebuild preserves the independently verified other character's entry.
    inventory_path = args.output / "inventory.json"
    previous = json.loads(inventory_path.read_text()) if inventory_path.exists() else {"kits": []}
    by_character = {item["character"]: item for item in previous["kits"]}
    by_character.update({record["character"]: record for record in records})
    inventory_path.write_bytes(json_bytes({"format": "gathria-wardrobe-template-delivery", "version": 1, "kits": [by_character[key] for key in sorted(by_character)]}))


if __name__ == "__main__":
    main()
