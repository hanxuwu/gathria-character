"""Freeze four-action side-view source packs without altering accepted artwork."""

from pathlib import Path
import importlib.util
import json
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/kling-side-selection"
OUT = ROOT / "docs/kling-side-workspace/assets"
ART = ROOT / "artwork/kling-side-workspace"
spec = importlib.util.spec_from_file_location(
    "side_prepare", ROOT / "scripts/prepare-kling-side-selection.py"
)
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    profile = json.loads((BASE / "registered-selection.json").read_text())
    reports = []
    for identity, character in profile["characters"].items():
        character["actions"].pop("celebrate")
        character.pop("comparisons", None)
        jump = character["actions"]["jump"]
        jump.update(
            {
                "start": 200,
                "endExclusive": 250,
                "reason": "Original uninterrupted run-to-crouch approach, two consecutive jumps, and second landing compression. Preview as a two-hop action, not one jump.",
                "limitations": [
                    "Ends in shallow crouch. No neutral idle recovery or seamless repeated-jump loop is supplied.",
                    "Source blur, green spill and cross-source drawing differences remain.",
                ],
            }
        )
        images = {}
        for action, clip in character["actions"].items():
            for frame in range(clip["start"], clip["endExclusive"]):
                folder = BASE / ("continuous/frames" if action == "jump" else "frames")
                path = folder / clip["source"] / f"{frame:04d}.png"
                images[(clip["source"], frame)] = Image.open(path).convert("RGBA")
        report = prepare.compile_pack(
            identity,
            character,
            images,
            profile,
            OUT,
            actions=("idle", "walk", "run", "jump"),
        )
        intermediate = OUT / f"{identity}.character.zip"
        with zipfile.ZipFile(intermediate) as archive:
            files = {name: archive.read(name) for name in archive.namelist()}
        manifest = json.loads(files["manifest.json"])
        config = json.loads(files["character.json"])
        title = f"Kling {identity} — side-view workspace candidate"
        manifest.update(name=title, generator="gathria-side-workspace-v1")
        config.update(name=title, characterId=f"kling-{identity}-side-workspace-v1")
        config["sourceMetadata"][
            "purpose"
        ] = "Frozen four-action source for registered silhouette-preserving wardrobe tests; not a new skeleton or replacement for original defaults."
        files["manifest.json"] = prepare.js(manifest)
        files["character.json"] = prepare.js(config)
        files["INTEGRATION.md"] = (
            b"# Side-view workspace candidate\n\nNative 512x768 RGBA, 24 fps, anchor (256,710). Idle, walk and run loop; jump contains two consecutive original hops and holds a shallow crouch after landing. There is no automatic idle recovery. Mirror for left. Derived wardrobe needs this exact pack hash and its own frame registration; old wardrobe masks do not fit.\n"
        )
        target = OUT / f"{identity}.source.zip"
        with zipfile.ZipFile(target, "w") as archive:
            for name, data in files.items():
                prepare.put(archive, name, data)
        intermediate.unlink()
        report.update(
            file=target.name,
            sha256=prepare.sha(target.read_bytes()),
            bytes=target.stat().st_size,
        )
        with zipfile.ZipFile(target) as archive:
            assert archive.testzip() is None
        reports.append(report)
        for image in images.values():
            image.close()
        print(identity, report["frameCount"], report["sha256"], flush=True)
    (ART / "selection.json").write_bytes(prepare.js(profile))
    (OUT / "sources.json").write_bytes(
        prepare.js(
            {
                "format": "gathria-side-workspace-sources",
                "version": 1,
                "packs": reports,
                "passed": True,
            }
        )
    )
    (OUT / "source-bindings.json").write_bytes(
        prepare.js(
            {
                report["identity"]: {
                    "sha256": report["sha256"],
                    "frames": report["frameCount"],
                }
                for report in reports
            }
        )
    )


if __name__ == "__main__":
    main()
