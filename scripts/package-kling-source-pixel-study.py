#!/usr/bin/env python3
"""Wrap deterministic offline samples in isolated, partial V4 theme archives.

Never modifies the published catalog, an existing archive or runtime code.
The source motion's frame IDs, order, holds and FPS are preserved exactly.
"""
import hashlib
import io
import json
from pathlib import Path
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artwork/kling-source-pixel-study"
OUT = ROOT / "docs/kling-source-pixel-study/bundles"
VARIANTS = {"detail": "detail-128", "compact": "compact-64"}
SHA = lambda b: hashlib.sha256(b).hexdigest()
JSON = lambda value: (json.dumps(value, indent=2) + "\n").encode()


def archive(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
    return output.getvalue()


def main():
    catalog_path = ROOT / "artwork/kling-themes/catalog-index.json"
    catalog_hash = SHA(catalog_path.read_bytes())
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for character in ["male", "female"]:
        source_file = f"docs/kling-motion/exports/{character}.character.zip"
        source_raw = (ROOT / source_file).read_bytes()
        with zipfile.ZipFile(io.BytesIO(source_raw)) as z:
            source_manifest = json.loads(z.read("manifest.json"))
            source_config = json.loads(z.read("character.json"))
        source_derivation = {f["frameId"]: f for f in source_config["derivation"]["frames"]}
        for short, variant in VARIANTS.items():
            metadata_file = ART / f"variants/{variant}/{character}/atlas.json"
            meta = json.loads(metadata_file.read_bytes())
            png = (metadata_file.parent / "atlas.png").read_bytes()
            assert SHA(source_raw) == meta["sourceSha256"]
            assert SHA(png) == meta["spritesheet"]["sha256"]
            with Image.open(io.BytesIO(png)) as image:
                image.load(); assert image.mode == "RGBA"
                assert image.size == (meta["spritesheet"]["width"], meta["spritesheet"]["height"])
            assert meta["anchor"] == {"x": 88, "y": 250, "units": "pixels", "origin": "top-left"}
            assert (meta["spritesheet"]["frameWidth"], meta["spritesheet"]["frameHeight"]) == (176, 266)
            assert set(meta["animations"]) == ({"idle", "walk", "run"} if character == "male" else {"idle", "walk"})
            for action, clip in meta["animations"].items():
                assert clip == source_manifest["animations"][action], (character, action)
            palette_path = (metadata_file.parent / meta["paletteFile"]).resolve()
            assert SHA(palette_path.read_bytes()) == meta["paletteSha256"]
            identity = f"source-pixel-{short}-study"
            character_id = f"kling-{character}-{identity}-v1"
            name = f"Kling {character} · Source pixel {short} study"
            sheet = {k: v for k, v in meta["spritesheet"].items() if k != "sha256"}
            sheet["file"] = "spritesheet.png"
            manifest = {
                "schemaVersion": 4, "format": "gathria-character-pack", "name": name,
                "generator": "gathria-offline-source-pixel-study-v1", "spritesheet": sheet,
                "additionalSheets": [], "frames": meta["frames"], "animations": meta["animations"],
                "facing": source_manifest["facing"], "anchor": meta["anchor"],
                "scale": {"pixelArt": True, "integerOnly": True, "recommended": 2},
                "capabilities": {"renderMode": "baked", "editableAppearance": False}, "configuration": "character.json",
            }
            provenance = (
                "Independent offline pixelization study, not a newly illustrated or image-generated character. "
                "Uses the existing approved catalog-original Kling motion CharacterPack, retaining the exact selected frame IDs, order, existing holds and FPS. "
                "A fixed transparent top2/bottom6 source padding precedes premultiplied-alpha BOX sampling. "
                f"Variant {variant}: source divisor {meta['parameters']['sourceDivisor']}, one shared {meta['parameters']['paletteSize']}-color palette across both characters and all study actions, no dithering, "
                f"nearest integer expansion {meta['parameters']['nearestExpansion']}. "
                "No pose fitting, anatomy redraw, head lock, warping, optical-flow interpolation, new motion or per-frame palette. "
                "Output retains the source silhouette at its declared spatial sampling, including source motion, blur and imperfections. "
                "These partial study packs are excluded from the built-in catalog and do not replace either ordinary or Pixel storybook defaults."
            )
            config = {
                "format": "gathria-baked-character", "schemaVersion": 1, "name": name, "characterId": character_id,
                "source": {"kind": "unified-archive", "name": source_file, "sha256": SHA(source_raw)},
                "provenance": provenance,
                "derivation": {"method": provenance, "frames": [source_derivation[f["id"]] for f in meta["frames"]]},
                "sourceMetadata": {
                    "sourcePixelStudy": {"status": "independent-review-only", "character": character, "variant": variant,
                        "sourceCharacterId": source_config["characterId"], "sourcePack": source_file,
                        "sourceSize": [704, 1056], "sourceAnchor": [352, 998],
                        "sourcePadding": {"top": 2, "bottom": 6, "left": 0, "right": 0},
                        "bodyTransform": "(x/4, (y+2)/4)", "nativeFrame": [176, 266],
                        "parameters": meta["parameters"], "paletteFile": str(palette_path.relative_to(ROOT)), "paletteSha256": meta["paletteSha256"],
                        "atlasMetadata": str(metadata_file.relative_to(ROOT)), "atlasMetadataSha256": SHA(metadata_file.read_bytes()),
                        "primaryAction": meta["primaryAction"], "auxiliaryActions": meta["auxiliaryActions"],
                        "timelineUnchanged": True, "publishedInCatalog": False},
                },
            }
            integration = (
                "# Offline source pixel study — partial CharacterPack V4\n\n"
                "Use the declared176x266 canvas and integer anchor(88,250). The content uses uniform source scale1/4, with fixed transparent source padding top2/bottom6. "
                "Render at positive integer zoom with nearest-neighbor sampling; do not resize separate poses. Left is a complete horizontal mirror. "
                "Play each declared frame ID at24FPS; repeated IDs are original holds, not new drawings. "
                "Idle and walk are required by the existing pack format; the male study also includes run. Other actions are unavailable, not substituted. "
                "These are in-place baked frames without wardrobe layers or a skeleton. No runtime generation or pixelization is required.\n"
            )
            pack = archive({"manifest.json": JSON(manifest), "character.json": JSON(config), "spritesheet.png": png,
                "PROVENANCE.txt": (provenance + "\nSource SHA256: " + SHA(source_raw) + "\n").encode(), "INTEGRATION.md": integration.encode()})
            theme_manifest = {
                "format": "gathria-character-theme", "version": 1, "id": identity, "revision": 1,
                "name": f"Source pixel {short} study", "character": character, "characterId": character_id,
                "rendering": "pixel", "reference": {"sourceSha256": SHA(source_raw), "description": "Exact current catalog-original motion archive; retained holds and native timing."},
                "provenance": provenance,
                "looks": [{"logicalId": "base", "name": "Original tank & shorts", "file": "look-0.character.zip", "sha256": SHA(pack)}],
            }
            theme = archive({"theme.json": JSON(theme_manifest), "look-0.character.zip": pack})
            pack_path, theme_path = OUT / f"{character}-{short}.character.zip", OUT / f"{character}-{short}.theme.zip"
            pack_path.write_bytes(pack); theme_path.write_bytes(theme)
            entries.append({"character": character, "variant": short, "themeFile": str(theme_path.relative_to(ROOT)),
                "themeSha256": SHA(theme), "packFile": str(pack_path.relative_to(ROOT)), "packSha256": SHA(pack),
                "sourceFile": source_file, "sourceSha256": SHA(source_raw), "primaryAction": meta["primaryAction"],
                "animations": meta["animations"], "frames": len(meta["frames"]), "catalogPublished": False})
            print(theme_path.relative_to(ROOT), SHA(theme))
    assert SHA(catalog_path.read_bytes()) == catalog_hash
    (OUT / "index.json").write_bytes(JSON({"format": "gathria-source-pixel-study-packages", "version": 1,
        "catalogSha256": catalog_hash, "runtimeChanged": False, "entries": entries}))


if __name__ == "__main__":
    main()
