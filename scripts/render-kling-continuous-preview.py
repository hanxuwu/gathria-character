"""Review walk -> run -> two original consecutive jumps, without changing packs.

Walk/run are decoded from the existing CharacterPacks. Double jumps retain the
uninterrupted source range [200,250), including the running-to-crouch approach.
The same fixed registration and matte as the reviewed candidate are reused.
"""

import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/kling-side-selection"
OUT = BASE / "continuous"
FPS = 24
CELL_W, CELL_H = 320, 480
HEADER, FOOTER = 64, 66
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
SOURCES = {"male": "male-2360", "female": "female-2394"}
JUMP_START, JUMP_END = 200, 250

spec = importlib.util.spec_from_file_location(
    "side_prepare", ROOT / "scripts/prepare-kling-side-selection.py"
)
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def font(size):
    return ImageFont.truetype(FONT, size)


def load_loops(identity):
    """Use the exact packed artwork and frame order that were browser-verified."""
    pack_path = BASE / "exports" / f"{identity}.character.zip"
    payload = pack_path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        recipe = json.loads(archive.read("character.json"))
        definitions = {frame["id"]: frame for frame in manifest["frames"]}
        sheets = [manifest["spritesheet"], *manifest.get("additionalSheets", [])]
        cached = {}
        result = {}
        for action in ["walk", "run"]:
            clip = manifest["animations"][action]
            assert clip["fps"] == FPS and clip["loop"]
            frames = []
            for frame_id in clip["frames"]:
                f = definitions[frame_id]
                page = f.get("page", 0)
                if page not in cached:
                    cached[page] = Image.open(
                        io.BytesIO(archive.read(sheets[page]["file"]))
                    ).convert("RGBA")
                image = cached[page].crop(
                    (f["x"], f["y"], f["x"] + f["width"], f["y"] + f["height"])
                )
                frames.append((image, {"action": action, "packFrameId": frame_id}))
            assert (
                len(frames) == 18
            ), "This review schedule expects a full 18-frame loop."
            result[action] = frames
        for page in cached.values():
            page.close()
    return result, {
        "packSha256": sha(payload),
        "selection": recipe["sourceMetadata"]["selection"],
    }


def extract_jumps(identity, profile):
    source_id = SOURCES[identity]
    source = profile["sources"][source_id]
    video = ROOT / source["video"]
    assert sha(video.read_bytes()) == source["sha256"]
    records, frames = [], []
    target = OUT / "frames" / source_id
    target.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kling-double-jump-") as temporary:
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(video),
                "-vf",
                f"select=between(n\\,{JUMP_START}\\,{JUMP_END - 1})",
                "-fps_mode",
                "passthrough",
                f"{temporary}/%04d.png",
            ],
            check=True,
        )
        files = sorted(Path(temporary).glob("*.png"))
        assert len(files) == JUMP_END - JUMP_START
        for source_frame, file in zip(range(JUMP_START, JUMP_END), files):
            rgb = np.asarray(Image.open(file).convert("RGB"))
            # f242 has a detached dark waist outline in the blurred source.
            # Retain its original pixels instead of treating it as green-screen
            # debris. The shared default matte and all prior packed frames stay
            # unchanged. Coordinates are in the original 1920 x 1080 video.
            retained = (
                [(846, 640, 858, 649)]
                if (source_id, source_frame) == ("male-2360", 242)
                else []
            )
            matte, stats = prepare.matte(
                rgb, source["matte"], retained_regions=retained
            )
            image = prepare.register(matte, profile["registration"][source_id])
            previous = BASE / "frames" / source_id / f"{source_frame:04d}.png"
            if previous.exists():
                assert image.tobytes() == Image.open(previous).convert("RGBA").tobytes()
            path = target / f"{source_frame:04d}.png"
            image.save(path)
            record = {
                "action": "double-jump",
                "sourceId": source_id,
                "sourceFrame": source_frame,
                "sourceTimeSeconds": source_frame / FPS,
                "rgbaSha256": sha(image.tobytes()),
                "bounds": image.getbbox(),
                **stats,
            }
            records.append(record)
            frames.append((image, record))
            matte.close()
    return frames, {
        "source": source,
        "registration": profile["registration"][source_id],
        "frames": records,
    }


def render(sprites, identities, phase):
    width = CELL_W * len(sprites)
    im = Image.new("RGB", (width, HEADER + CELL_H + FOOTER), "#f3f0e7")
    draw = ImageDraw.Draw(im)
    stage = {
        "walk": "走路",
        "run": "跑步",
        "double-jump": "连续跳跃 · 原片两次",
        "hold": "落地末帧 · 审阅停留",
        "restart": "本轮结束 · 即将重播",
    }[phase]
    draw.text((12, 7), stage, font=font(20), fill="#294338")
    draw.text((12, 36), "原速 24 fps · 原地动作", font=font(13), fill="#59665b")
    if phase == "restart":
        draw.text((16, 230), "走路 → 跑步 → 连跳两次", font=font(20), fill="#294338")
        draw.text(
            (16, 265), "这是预览重播分隔，不是动作过渡。", font=font(15), fill="#59665b"
        )
        return im
    for col, (sprite, identity) in enumerate(zip(sprites, identities)):
        x0 = col * CELL_W
        for y in range(HEADER, HEADER + CELL_H, 16):
            for x in range(x0, x0 + CELL_W, 16):
                color = (
                    "#e7e8e1"
                    if ((x - x0) // 16 + (y - HEADER) // 16) % 2
                    else "#f3f0e7"
                )
                draw.rectangle(
                    (x, y, x + 15, min(y + 15, HEADER + CELL_H - 1)), fill=color
                )
        resized = sprite.resize((CELL_W, CELL_H), Image.Resampling.LANCZOS)
        im.paste(resized, (x0, HEADER), resized)
        draw.text(
            (x0 + 12, HEADER + 8),
            "男版" if identity == "male" else "女版",
            font=font(14),
            fill="#59665b",
        )
        ground = HEADER + round(710 * CELL_H / 768)
        draw.line((x0 + 12, ground, x0 + CELL_W - 12, ground), fill="#b5bcae")
    draw.text(
        (12, HEADER + CELL_H + 7),
        "混合来源 · 保留真实切换差异",
        font=font(14),
        fill="#59665b",
    )
    note = (
        "保留原片两跳之间的衔接"
        if phase == "double-jump"
        else "无插帧、无身体变形；服装固定"
    )
    draw.text((12, HEADER + CELL_H + 31), note, font=font(13), fill="#59665b")
    return im


def save_media(frames, name, temporary):
    # Shared global palette for stable preview colors; no per-frame palette drift.
    thumb_w, thumb_h = frames[0].width // 3, frames[0].height // 3
    sample = Image.new("RGB", (thumb_w, thumb_h * len(frames)))
    for i, frame in enumerate(frames):
        sample.paste(frame.resize((thumb_w, thumb_h)), (0, i * thumb_h))
    palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [
        frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames
    ]
    durations = [
        round((i + 1) * 100 / FPS) * 10 - round(i * 100 / FPS) * 10
        for i in range(len(frames))
    ]
    path = OUT / f"{name}.gif"
    indexed[0].save(
        path,
        save_all=True,
        append_images=indexed[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )
    actual_durations = []
    with Image.open(path) as gif:
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.convert("RGB").load()
            actual_durations.append(gif.info["duration"])
        assert gif.info.get("loop") == 0
        assert sum(actual_durations) == sum(durations)
        count = gif.n_frames
    output = [
        {
            "file": path.name,
            "sha256": sha(path.read_bytes()),
            "sourceTicks": len(frames),
            "encodedFrames": count,
            "durationMs": sum(actual_durations),
            "decoded": True,
            "loop": True,
            "presentationHoldTicks": 18,
            "restartCardTicks": 12,
        }
    ]
    # Pair MP4 provides a seekable preview with true 24 fps and richer color than GIF.
    if name.startswith("pair"):
        for i, frame in enumerate(frames):
            frame.save(Path(temporary) / f"{i:04d}.png")
        mp4 = OUT / f"{name}.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-framerate",
                str(FPS),
                "-i",
                f"{temporary}/%04d.png",
                "-c:v",
                "libx264",
                "-crf",
                "16",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-an",
                str(mp4),
            ],
            check=True,
        )
        stream = json.loads(
            subprocess.check_output(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-count_frames",
                    "-show_streams",
                    "-of",
                    "json",
                    str(mp4),
                ]
            )
        )["streams"][0]
        assert stream["avg_frame_rate"] == "24/1" and int(
            stream["nb_read_frames"]
        ) == len(frames)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(mp4), "-f", "null", "-"], check=True
        )
        output.append(
            {
                "file": mp4.name,
                "sha256": sha(mp4.read_bytes()),
                "fps": 24,
                "frames": len(frames),
                "durationSeconds": float(stream["duration"]),
                "decoded": True,
            }
        )
    return output


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    profile = json.loads((BASE / "registered-selection.json").read_text())
    schedules, evidence = {}, {}
    for identity in ["male", "female"]:
        loops, pack_info = load_loops(identity)
        jumps, jump_info = extract_jumps(identity, profile)
        # Full existing cycles plus uninterrupted original double jump, then explicit review UI.
        sequence = loops["walk"] * 3 + loops["run"] * 4 + jumps
        sequence += [(jumps[-1][0], {"action": "hold"})] * 18
        sequence += [(jumps[-1][0], {"action": "restart"})] * 12
        schedules[identity] = sequence
        evidence[identity] = {
            **pack_info,
            "jump": jump_info,
            "timeline": [metadata for _, metadata in sequence],
        }
        print(
            f"{identity}: {len(sequence)} preview ticks; two uninterrupted source jumps.",
            flush=True,
        )
    assert len(schedules["male"]) == len(schedules["female"]) == 206
    media = []
    for identities in [["male"], ["female"], ["male", "female"]]:
        name = (
            identities[0] if len(identities) == 1 else "pair"
        ) + "-walk-run-double-jump-right"
        frames = []
        for tick in range(206):
            sprites = [schedules[identity][tick][0] for identity in identities]
            phases = [schedules[identity][tick][1]["action"] for identity in identities]
            assert len(set(phases)) == 1
            frames.append(render(sprites, identities, phases[0]))
        with tempfile.TemporaryDirectory(
            prefix="kling-continuous-review-"
        ) as temporary:
            media.extend(save_media(frames, name, temporary))
        if len(identities) == 2:
            # Contact sheet exposes both cuts and the real between-jump passage.
            indices = [53, 54, 125, 126, 159, 160, 170, 175]
            board = Image.new("RGB", (640 * 2, 610 * 4), "#f3f0e7")
            for i, tick in enumerate(indices):
                board.paste(frames[tick], ((i % 2) * 640, (i // 2) * 610))
            board.save(OUT / "transition-keyframes.png")
        for frame in frames:
            frame.close()
    # Confirm previous candidates have not been overwritten by this review extension.
    for identity in ["male", "female"]:
        assert (
            sha((BASE / "exports" / f"{identity}.character.zip").read_bytes())
            == evidence[identity]["packSha256"]
        )
    report = {
        "passed": True,
        "scope": "Preview only; existing CharacterPacks and runtime unchanged.",
        "fps": FPS,
        "sources": evidence,
        "media": media,
        "limitations": [
            "Hard cuts between different sources remain visible.",
            "Double jumps end in shallow crouch, not neutral standing.",
            "Source blur/green spill remains. No wardrobe compatibility implied.",
            "18-tick hold and 12-tick restart card are presentation, not source animation.",
        ],
    }
    (OUT / "validation.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    )
    print(json.dumps({"passed": True, "outputs": [item["file"] for item in media]}))


if __name__ == "__main__":
    main()
