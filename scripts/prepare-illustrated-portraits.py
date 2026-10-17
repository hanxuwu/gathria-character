"""Prepare the four original portrait assets for the deterministic pixel rig.

This is an offline build step. Runtime layers contain binary alpha and material
ids, with the source eye/eyelash/jewelry colors protected from recoloring.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
import zlib

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artwork/illustrated-source/portrait-bank.png"
FRAME = (192, 256)
SCALE = 0.25

# Coordinates describe anatomy in the original bank, not inferred bounding boxes.
# The waves and bob overlap their nominal cells, so each gets its own silhouette.
PORTRAITS = {
    "waves": {
        "crop": (155, 0, 790, 615),
        "neck": (520, 462),
        "skin": [
            [(443, 282), (473, 254), (523, 234), (576, 219), (612, 157), (657, 188), (675, 237), (672, 356), (651, 384), (622, 401), (548, 409), (482, 395), (454, 370)],
            [(367, 310), (385, 293), (406, 295), (430, 319), (441, 348), (432, 365), (408, 371), (380, 356)],
            [(487, 394), (552, 408), (551, 436), (560, 451), (551, 464), (513, 463), (476, 450), (474, 439)],
        ],
        "eyes": [(475, 250, 566, 338), (620, 244, 673, 328)],
        "irises": [(515, 269, 559, 334), (632, 261, 662, 323)],
        "brows": [(475, 229, 553, 249), (630, 207, 671, 231)],
        "mouth": (560, 348, 620, 377),
        "faceCenter": (569, 319),
        "jawStart": 365,
        "backSplit": 402,
        "palette": {"skin": "#F5BC96", "hair": "#9B5538"},
    },
    "crop": {
        "crop": (807, 0, 1360, 497),
        "neck": (1085, 479),
        "skin": [
            [(991, 321), (1032, 292), (1084, 255), (1133, 186), (1167, 190), (1203, 243), (1248, 279), (1244, 375), (1222, 414), (1167, 434), (1113, 431), (1063, 413), (1022, 389)],
            [(932, 331), (950, 310), (973, 308), (996, 328), (1028, 361), (1007, 386), (976, 394), (944, 375)],
            [(1051, 408), (1116, 429), (1116, 455), (1128, 468), (1116, 482), (1074, 478), (1036, 467), (1031, 454)],
        ],
        "eyes": [(1045, 275, 1141, 364), (1189, 270, 1250, 362)],
        "irises": [(1084, 299, 1128, 361), (1202, 291, 1236, 357)],
        "brows": [(1058, 267, 1135, 282), (1195, 245, 1242, 261)],
        "mouth": (1124, 377, 1187, 406),
        "faceCenter": (1150, 344),
        "jawStart": 393,
        "palette": {"skin": "#F0AB7E", "hair": "#BAB6C7"},
    },
    "bob": {
        "crop": (202, 542, 790, 1004),
        "neck": (520, 990),
        "silhouette": [(450, 548), (560, 548), (650, 580), (720, 650), (777, 727), (784, 893), (770, 985), (657, 1004), (318, 1004), (202, 944), (211, 795), (252, 701), (300, 610)],
        "skin": [
            [(447, 813), (486, 780), (539, 761), (585, 739), (620, 681), (652, 721), (674, 773), (674, 879), (650, 918), (615, 940), (551, 942), (493, 926), (462, 904)],
            [(366, 846), (382, 823), (400, 821), (421, 839), (444, 873), (438, 895), (409, 904), (382, 890), (370, 866)],
            [(488, 924), (553, 940), (552, 965), (563, 981), (548, 994), (508, 989), (478, 979), (474, 968)],
        ],
        "eyes": [(475, 787, 565, 868), (620, 778, 676, 866)],
        "irises": [(514, 807, 557, 864), (631, 799, 664, 860)],
        "brows": [(481, 763, 552, 781), (629, 738, 674, 757)],
        "mouth": (558, 882, 620, 909),
        "faceCenter": (569, 852),
        "jawStart": 904,
        "backSplit": 926,
        "palette": {"skin": "#F7C39E", "hair": "#454151"},
    },
    "mohawk": {
        "scale": 0.24,
        "crop": (818, 499, 1350, 1005),
        "neck": (1086, 985),
        "skin": [
            [(1018, 795), (1070, 769), (1148, 731), (1201, 674), (1243, 701), (1261, 778), (1259, 893), (1231, 929), (1180, 945), (1118, 944), (1058, 919), (1022, 888)],
            [(953, 846), (970, 823), (991, 820), (1012, 835), (1034, 870), (1022, 894), (991, 901), (966, 884)],
            [(1052, 923), (1118, 943), (1116, 962), (1128, 978), (1117, 986), (1080, 985), (1044, 975), (1036, 965)],
        ],
        "eyes": [(1052, 783, 1147, 871), (1205, 781, 1259, 864)],
        "irises": [(1092, 805, 1139, 867), (1215, 799, 1250, 861)],
        "brows": [(1061, 758, 1147, 778), (1218, 741, 1259, 759)],
        "mouth": (1133, 882, 1199, 909),
        "faceCenter": (1152, 856),
        "jawStart": 905,
        "palette": {"skin": "#F6BE96", "hair": "#945036"},
    },
}


def polygon_mask(size, polygons):
    image = Image.new("1", size)
    draw = ImageDraw.Draw(image)
    for points in polygons:
        draw.polygon(points, fill=1)
    return np.asarray(image, dtype=bool)


def rectangle_mask(shape, rectangle):
    mask = np.zeros(shape, dtype=bool)
    left, top, right, bottom = rectangle
    mask[top:bottom, left:right] = True
    return mask


def target_point(point, description):
    nx, ny = description["neck"]
    scale = description.get("scale", SCALE)
    return [round(96 + (point[0] - nx) * scale), round(120 + (point[1] - ny) * scale)]


def target_rect(rectangle, description):
    left, top = target_point(rectangle[:2], description)
    right, bottom = target_point(rectangle[2:], description)
    return [left, top, right - left, bottom - top]


def pack_layer(layer_id, rgba, material, description):
    """Trim a target-space layer and encode RGBA/material tuples losslessly."""
    occupied = np.argwhere(rgba[:, :, 3] > 0)
    if not len(occupied):
        raise ValueError(f"Empty portrait layer: {layer_id}")
    top, left = occupied.min(axis=0)
    bottom, right = occupied.max(axis=0) + 1
    packed = np.concatenate((rgba, material[:, :, None]), axis=2)[top:bottom, left:right]
    return {
        "id": layer_id,
        "x": int(left), "y": int(top),
        "width": int(right - left), "height": int(bottom - top),
        "data": base64.b64encode(zlib.compress(packed.tobytes(), 9)).decode("ascii"),
        "palette": description["palette"],
    }


def project_to_frame(source, material, mask, description):
    left, top, right, bottom = description["crop"]
    region = source[top:bottom, left:right].copy()
    region_mask = mask[top:bottom, left:right]
    region[:, :, 3] = np.where(region_mask, 255, 0)
    region[~region_mask] = 0
    materials = material[top:bottom, left:right].copy()
    materials[~region_mask] = 0
    scale = description.get("scale", SCALE)
    size = (round((right - left) * scale), round((bottom - top) * scale))
    pixels = Image.fromarray(region, "RGBA").resize(size, Image.Resampling.NEAREST)
    ids = Image.fromarray(materials, "L").resize(size, Image.Resampling.NEAREST)
    at = target_point((left, top), description)
    target = Image.new("RGBA", FRAME)
    target_material = Image.new("L", FRAME)
    target.paste(pixels, at)
    target_material.paste(ids, at)
    rgba, ids = np.asarray(target).copy(), np.asarray(target_material).copy()
    # Downsampling wispy source edges can leave a few unattached flecks. Keep
    # actual locks (including separate left/right tails), remove tiny islands.
    alpha = rgba[:, :, 3] > 0
    seen = np.zeros(alpha.shape, dtype=bool)
    for start_y, start_x in np.argwhere(alpha):
        if seen[start_y, start_x]:
            continue
        todo = [(int(start_x), int(start_y))]
        component = []
        seen[start_y, start_x] = True
        while todo:
            x, y = todo.pop()
            component.append((x, y))
            for dx, dy in ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < FRAME[0] and 0 <= ny < FRAME[1] and alpha[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    todo.append((nx, ny))
        if len(component) <= 12:
            for x, y in component:
                rgba[y, x] = 0
                ids[y, x] = 0
    return rgba, ids


def prepare_portraits(source_path=SOURCE):
    """Return (IllustratedLayer[], Record<Hairstyle, IllustratedPortrait>)."""
    source_image = Image.open(source_path).convert("RGBA")
    source = np.asarray(source_image).copy()
    height, width = source.shape[:2]
    yy, xx = np.mgrid[:height, :width]
    red, green, blue = (source[:, :, index].astype(np.int16) for index in range(3))
    brightness = (red + green + blue) / 3
    layers, portraits = [], {}
    for name, description in PORTRAITS.items():
        left, top, right, bottom = description["crop"]
        valid = (source[:, :, 3] >= 128) & (xx >= left) & (xx < right) & (yy >= top) & (yy < bottom)
        if "silhouette" in description:
            valid &= polygon_mask(source_image.size, [description["silhouette"]])
        if name == "waves":
            # The adjacent bob begins behind the bottommost brown curls.
            valid &= ~((blue > red + 3) | ((yy > 555) & (xx > 380) & (xx < 620)))

        skin = polygon_mask(source_image.size, description["skin"]) & valid
        material = np.where(valid, 2, 0).astype(np.uint8)
        material[skin] = 1
        fixed = np.zeros((height, width), dtype=bool)
        for eye, iris in zip(description["eyes"], description["irises"]):
            eye_area = rectangle_mask((height, width), eye)
            iris_area = rectangle_mask((height, width), iris)
            # Preserve iris, lashes and eye whites; surrounding peach pixels
            # stay skin so darker complexions do not acquire pale eye patches.
            whites = (brightness > 185) & (np.abs(red - green) < 25) & (np.abs(green - blue) < 30)
            ink = brightness < 100
            iris_color = (green < 155) & (blue < 120) & (red < 225)
            fixed |= eye_area & (whites | ink | (iris_area & iris_color))
        mouth_area = rectangle_mask((height, width), description["mouth"])
        fixed |= mouth_area & (red - green > 35) & (green < 135)
        for brow in description["brows"]:
            material[rectangle_mask((height, width), brow) & skin & (brightness < 130)] = 2
        if name == "waves":
            jewelry = (xx >= 415) & (xx <= 434) & (yy >= 360) & (yy <= 390)
            fixed |= jewelry & (brightness > 125)
        material[fixed & valid] = 0

        head_id = f"portrait-{name}-head"
        rig = {
            "head": head_id,
            "faceCenter": target_point(description["faceCenter"], description),
            "jawStart": target_point((0, description["jawStart"]), description)[1],
            "eyes": [target_rect(eye, description) for eye in description["eyes"]],
        }
        if "backSplit" in description:
            split = description["backSplit"]
            back_mask = valid & (material == 2) & (yy >= split - 10)
            head_mask = valid & ((yy < split + 10) | (material != 2))
            back_id = f"portrait-{name}-back"
            rgba, ids = project_to_frame(source, material, back_mask, description)
            layers.append(pack_layer(back_id, rgba, ids, description))
            rig["backHair"] = back_id
        else:
            head_mask = valid
        rgba, ids = project_to_frame(source, material, head_mask, description)
        # The garment rig owns the collar and exposed neck below this seam.
        # Back-hair tails remain full length in their independent rear layer.
        rgba[114:] = 0
        ids[114:] = 0
        layers.append(pack_layer(head_id, rgba, ids, description))
        portraits[name] = rig
    return layers, portraits


def unpack_preview(layer):
    packed = np.frombuffer(zlib.decompress(base64.b64decode(layer["data"])), dtype=np.uint8)
    packed = packed.reshape(layer["height"], layer["width"], 5)
    return Image.fromarray(packed[:, :, :4], "RGBA")


if __name__ == "__main__":
    layers, portraits = prepare_portraits()
    destination = Path("/tmp/gathria-illustrated")
    destination.mkdir(parents=True, exist_ok=True)
    lookup = {layer["id"]: layer for layer in layers}
    lineup = Image.new("RGBA", (FRAME[0] * 4, 160), "#F2E8D9")
    for index, (name, rig) in enumerate(portraits.items()):
        preview = Image.new("RGBA", FRAME)
        for key in ("backHair", "head"):
            if key in rig:
                layer = lookup[rig[key]]
                preview.alpha_composite(unpack_preview(layer), (layer["x"], layer["y"]))
        preview.save(destination / f"portrait-{name}.png")
        lineup.alpha_composite(preview.crop((0, 0, FRAME[0], 160)), (index * FRAME[0], 0))
    lineup.resize((lineup.width * 2, lineup.height * 2), Image.Resampling.NEAREST).save(destination / "portraits-2x.png")
    print(json.dumps({"layers": len(layers), "portraits": portraits, "preview": str(destination / "portraits-2x.png")}, indent=2))
