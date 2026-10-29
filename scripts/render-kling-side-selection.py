"""Render transparent-pose evidence from the actual side-selection CharacterPacks."""

from pathlib import Path
import io, json, zipfile, hashlib, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/kling-side-selection"
OUT = BASE / "review"
OUT.mkdir(exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(n=14):
    return ImageFont.truetype(FONT, n)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def load_pack(identity):
    with zipfile.ZipFile(BASE / "exports" / f"{identity}.character.zip") as z:
        m = json.loads(z.read("manifest.json"))
        c = json.loads(z.read("character.json"))
        pages = [
            Image.open(io.BytesIO(z.read(s["file"]))).convert("RGBA")
            for s in [m["spritesheet"], *m.get("additionalSheets", [])]
        ]
        frames = {
            f["id"]: pages[f.get("page", 0)].crop(
                (f["x"], f["y"], f["x"] + f["width"], f["y"] + f["height"])
            )
            for f in m["frames"]
        }
        for p in pages:
            p.close()
    return m, c, frames


def checker(size):
    im = Image.new("RGB", size, "#f3f0e7")
    d = ImageDraw.Draw(im)
    for y in range(0, size[1], 16):
        for x in range(0, size[0], 16):
            if (x // 16 + y // 16) % 2:
                d.rectangle((x, y, x + 15, y + 15), fill="#e7e8e1")
    return im


def panel(images, labels, title, notes="", facing="right", scale=0.5):
    cw = round(512 * scale)
    ch = round(768 * scale)
    im = checker((cw * len(images), ch + 94))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, im.width, 62), fill="#f3f0e7")
    d.text((8, 6), title, fill="#294338", font=font(15))
    for col, (sprite, label) in enumerate(zip(images, labels)):
        d.text((col * cw + 8, 30), label, fill="#445447", font=font(12))
        if facing == "left":
            sprite = ImageOps.mirror(sprite)
        display = sprite.resize((cw, ch), Image.Resampling.LANCZOS)
        im.paste(display, (col * cw, 62), display)
        gy = 62 + round(710 * scale)
        d.line((col * cw + 8, gy, (col + 1) * cw - 8, gy), fill="#a0ada2")
    d.rectangle((0, ch + 63, im.width, im.height), fill="#f3f0e7")
    d.text((8, ch + 71), notes, fill="#445447", font=font(11))
    return im


media = []


def gif(frames, path, loop=True):
    # One palette for the whole animation, not independently quantized frames.
    sheet = Image.new(
        "RGB", (frames[0].width // 2, (frames[0].height // 2) * len(frames))
    )
    for i, im in enumerate(frames):
        sheet.paste(
            im.resize((im.width // 2, im.height // 2)), (0, i * (im.height // 2))
        )
    palette = sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in frames]
    durations = [
        round((i + 1) * 100 / 24) * 10 - round(i * 100 / 24) * 10
        for i in range(len(frames))
    ]
    kwargs = {"loop": 0} if loop else {}
    indexed[0].save(
        path,
        save_all=True,
        append_images=indexed[1:],
        duration=durations,
        disposal=2,
        optimize=False,
        **kwargs,
    )
    actual = []
    with Image.open(path) as g:
        for i in range(g.n_frames):
            g.seek(i)
            g.convert("RGB").load()
            actual.append(g.info["duration"])
        assert sum(actual) == sum(durations)
        assert g.info.get("loop") == (0 if loop else None)
        record = {
            "file": path.name,
            "size": list(g.size),
            "sourceTicks": len(frames),
            "encodedFrames": g.n_frames,
            "durationMs": sum(actual),
            "durationsMs": actual,
            "loop": loop,
            "decoded": True,
            "sha256": sha(path.read_bytes()),
        }
    media.append(record)
    return record


def png(im, path):
    im.save(path)
    Image.open(path).load()
    media.append(
        {
            "file": path.name,
            "size": list(im.size),
            "decoded": True,
            "sha256": sha(path.read_bytes()),
        }
    )


def metric(a, b):
    aa = np.asarray(a.resize((128, 192)), dtype=float) / 255
    bb = np.asarray(b.resize((128, 192)), dtype=float) / 255
    aa[:, :, :3] *= aa[:, :, 3:]
    bb[:, :, :3] *= bb[:, :, 3:]
    return float(np.sqrt(np.mean((aa - bb) ** 2)))


profile = json.loads((BASE / "registered-selection.json").read_text())
loaded = {}
diagnostics = []
for identity in ["male", "female"]:
    m, c, frames = load_pack(identity)
    loaded[identity] = (m, c, frames)
    for action, clip in m["animations"].items():
        ids = clip["frames"]
        limit = (
            "Loop candidate" if clip["loop"] else "Plays ONCE; holds last source pose"
        )
        for facing in ["right", "left"]:
            sequence = [
                panel(
                    [frames[f]],
                    [f"{identity} / {action}"],
                    f"{action} / {facing} / 24 fps",
                    limit,
                    facing,
                )
                for f in ids
            ]
            gif(sequence, OUT / f"{identity}-{action}-{facing}.gif", clip["loop"])
        # Full chronological poses in the actual exported atlas, sampled for readability.
        selected = list(
            dict.fromkeys(
                np.linspace(0, len(ids) - 1, min(8, len(ids))).round().astype(int)
            )
        )
        board = checker((160 * len(selected), 258))
        draw = ImageDraw.Draw(board)
        for col, k in enumerate(selected):
            im = frames[ids[k]].resize((160, 240), Image.Resampling.LANCZOS)
            board.paste(im, (col * 160, 18), im)
            draw.text(
                (col * 160 + 4, 2), f"{action} tick {k}", fill="black", font=font(11)
            )
        png(board, OUT / f"{identity}-{action}-keyframes.png")
        if clip["loop"]:
            steps = [metric(frames[a], frames[b]) for a, b in zip(ids, ids[1:])]
            wrap = metric(frames[ids[-1]], frames[ids[0]])
            diagnostics.append(
                {
                    "identity": identity,
                    "action": action,
                    "metric": "Quarter-size premultiplied RGBA RMSE; inspection signal, NOT visual acceptance",
                    "wrap": wrap,
                    "meanAdjacent": float(np.mean(steps)),
                    "maxAdjacent": max(steps),
                    "wrapVsMean": wrap / max(1e-8, float(np.mean(steps))),
                }
            )
            positions = [len(ids) - 2, len(ids) - 1, 0, 1]
            boundary = panel(
                [frames[ids[k]] for k in positions],
                [f"tick {k}" for k in positions],
                f"{identity} / {action}: last two -> first two",
                "Same fixed anchor. No blend or generated in-between.",
                scale=0.25,
            )
            png(boundary, OUT / f"{identity}-{action}-boundary.png")
    # Explicit hard-cut transition review. Loop copies and final holds are presentation only.
    schedule = []
    for action, repeats, tail in [
        ("idle", 2, 0),
        ("walk", 3, 0),
        ("run", 3, 0),
        ("jump", 1, 12),
        ("idle", 2, 0),
        ("celebrate", 1, 0),
        ("idle", 2, 0),
    ]:
        ids = m["animations"][action]["frames"]
        schedule += [(action, k) for _ in range(repeats) for k in ids]
        schedule += [(action, ids[-1])] * tail
    seq = [
        panel(
            [frames[k]],
            [action],
            f"{identity} / action changes / 24 fps",
            "Hard cuts; source differences visible.",
        )
        for action, k in schedule
    ]
    gif(seq, OUT / f"{identity}-action-switches.gif", False)
    # Static action boundaries, including both sides of the known jump gap.
    board = checker((1024, 956))
    draw = ImageDraw.Draw(board)
    for row, (before, after) in enumerate(
        [("idle", "walk"), ("walk", "run"), ("run", "jump"), ("jump", "idle")]
    ):
        a = m["animations"][before]["frames"][-1]
        b = m["animations"][after]["frames"][0]
        images = [frames[a], frames[b]]
        p = panel(
            images,
            [f"{before} last", f"{after} first"],
            f"{identity}: {before} -> {after}",
            "Direct source cut; changed face/pose is not concealed.",
            scale=0.5,
        )
        board.paste(p, ((row % 2) * 512, (row // 2) * 478))
    png(board, OUT / f"{identity}-transition-boundaries.png")

# Two characters at the same source playback clock; their source phases differ.
for action in ["walk", "run", "jump"]:
    clips = [loaded[s][0]["animations"][action] for s in ["male", "female"]]
    ticks = max(len(c["frames"]) for c in clips)
    seq = []
    for t in range(ticks):
        poses = []
        for identity, clip in zip(["male", "female"], clips):
            k = (
                t % len(clip["frames"])
                if clip["loop"]
                else min(t, len(clip["frames"]) - 1)
            )
            poses.append(loaded[identity][2][clip["frames"][k]])
        seq.append(
            panel(
                poses,
                ["male", "female"],
                f"Pair / {action} / original 24 fps",
                "Fixed 512 x 768 frame; shared (256,710) ground reference.",
            )
        )
    gif(seq, OUT / f"pair-{action}-right.gif", all(c["loop"] for c in clips))

# Compare old selected cadence against latest raw run intervals, no retiming.
for identity in ["male", "female"]:
    m, c, frames = loaded[identity]
    ids = m["animations"]["run"]["frames"]
    alts = [
        (name, clip)
        for name, clip in profile["characters"][identity]["comparisons"].items()
        if name.startswith("run-")
    ]
    sequences = [[frames[k] for k in ids]]
    labels = [
        f'Selected: {profile["characters"][identity]["actions"]["run"]["source"]}'
    ]
    for name, clip in alts:
        sequences.append(
            [
                Image.open(BASE / "frames" / clip["source"] / f"{i:04d}.png").convert(
                    "RGBA"
                )
                for i in range(clip["start"], clip["endExclusive"])
            ]
        )
        labels.append(clip["source"])
    ticks = max(map(len, sequences))
    seq = []
    for t in range(ticks):
        seq.append(
            panel(
                [s[t % len(s)] for s in sequences],
                labels,
                f"{identity}: source cadence comparison / unchanged 24 fps",
                "Selected loop repeats; alternative is a contiguous 1-second source excerpt.",
            )
        )
    gif(seq, OUT / f"{identity}-run-source-comparison.gif", False)

# Male walking alternatives; run-jump vs two-foot first-jump candidate.
m, c, frames = loaded["male"]
alts = profile["characters"]["male"]["comparisons"]
for action, key in [("walk", "walk-alternate"), ("jump", "jump-running")]:
    clip = alts[key]
    other = [
        Image.open(BASE / "frames" / clip["source"] / f"{i:04d}.png").convert("RGBA")
        for i in range(clip["start"], clip["endExclusive"])
    ]
    selected = [frames[k] for k in m["animations"][action]["frames"]]
    ticks = 72 if action == "walk" else max(len(selected), len(other))
    seq = []
    for t in range(ticks):
        sprites = [
            s[t % len(s)] if action == "walk" else s[min(t, len(s) - 1)]
            for s in [selected, other]
        ]
        seq.append(
            panel(
                sprites,
                [
                    profile["characters"]["male"]["actions"][action]["source"],
                    clip["source"],
                ],
                f"Male {action} alternatives / same size, source speed",
                (
                    "One-shot comparison holds final pose; no invented recovery."
                    if action == "jump"
                    else "Independent original loop periods; no speed matching."
                ),
            )
        )
    gif(seq, OUT / f"male-{action}-alternatives.gif", False)

# Light and dark backgrounds reveal alpha edges at the normalized export scale.
for identity in ["male", "female"]:
    m, c, frames = loaded[identity]
    ids = [m["animations"][a]["frames"][0] for a in ["idle", "walk", "run", "jump"]]
    board = Image.new("RGB", (4 * 256, 2 * 384))
    for row, bg in enumerate(["#faf7ef", "#223247"]):
        for col, k in enumerate(ids):
            cell = Image.new("RGB", (256, 384), bg)
            im = frames[k].resize((256, 384), Image.Resampling.LANCZOS)
            cell.paste(im, (0, 0), im)
            board.paste(cell, (col * 256, row * 384))
    png(board, OUT / f"{identity}-alpha-light-dark.png")

    # Native export size: expose the jump's blurred/spilled source edges,
    # especially the final rebound pose; no retouching of the candidate.
    jump_ids = m["animations"]["jump"]["frames"]
    positions = [0, 8, len(jump_ids) - 1]
    edge_board = Image.new("RGB", (3 * 512, 798), "#223247")
    draw = ImageDraw.Draw(edge_board)
    for col, position in enumerate(positions):
        sprite = frames[jump_ids[position]]
        edge_board.paste(sprite, (col * 512, 30), sprite)
        draw.text(
            (col * 512 + 12, 5),
            f"{identity} jump / tick {position} / native 512 x 768",
            fill="#ffffff",
            font=font(14),
        )
    png(edge_board, OUT / f"{identity}-jump-edge-check.png")

(BASE / "media-validation.json").write_text(
    json.dumps(
        {
            "passed": True,
            "scope": "Actual exported atlas crops; 24fps preserved. GIF palettes and 10ms timing are preview approximations. Identical indexed frames may coalesce without changing duration. No visual acceptance claimed.",
            "media": media,
            "loopDiagnostics": diagnostics,
        },
        indent=2,
    )
    + "\n"
)
print(
    json.dumps(
        {
            "passed": True,
            "media": len(media),
            "gifs": sum(x["file"].endswith(".gif") for x in media),
        }
    )
)
