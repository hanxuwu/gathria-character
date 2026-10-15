"""Reproducible technical extraction of the committed illustrated production bank.

No artwork is generated here. Cropping, material masks, binary transparency and
overlapping articulated cuts turn the supplied source art into runtime layers.
Requires Pillow for this offline preparation; the application does not.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import base64, importlib.util, json, zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Image.open(ROOT / "artwork/illustrated-source/body-bank.png").convert("RGBA")
W, H = 192, 256
LAYERS = []
PREVIEW = Path("/tmp/gathria-illustrated")
PREVIEW.mkdir(exist_ok=True)


def polygon(points):
    mask = Image.new("L", (W, H))
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def rect(x0, y0, x1, y1):
    return polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def keep_main_component(image):
    pixels=image.load()
    remaining={(x,y) for y in range(H) for x in range(W) if pixels[x,y][3]}
    components=[]
    while remaining:
        start=remaining.pop(); points={start}; pending=[start]
        while pending:
            x,y=pending.pop()
            for dx in (-1,0,1):
                for dy in (-1,0,1):
                    candidate=(x+dx,y+dy)
                    if candidate in remaining:
                        remaining.remove(candidate);points.add(candidate);pending.append(candidate)
        components.append(points)
    keep=max(components,key=len)
    for component in components:
        if component is not keep:
            for point in component: pixels[point]=(0,0,0,0)


def layer(name, image, materials, region, palette):
    rgba = image.copy()
    alpha = rgba.getchannel("A")
    a = alpha.load()
    keep = region.load()
    for y in range(H):
        for x in range(W):
            if not keep[x, y]: a[x, y] = 0
    rgba.putalpha(alpha)
    # A semantic limb/torso cut has one connected piece. Remove neighboring
    # garment-edge flecks, which otherwise become floating strips after posing.
    if alpha.getbbox():
        keep_main_component(rgba)
        alpha=rgba.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise ValueError(f"Empty illustrated layer: {name}")
    rgba = rgba.crop(bounds)
    mask = materials.crop(bounds)
    packed = bytearray()
    for color, material in zip(rgba.getdata(), mask.getdata()):
        packed.extend(color if color[3] else (0, 0, 0, 0))
        packed.append(material if color[3] else 0)
    entry = dict(id=name, x=bounds[0], y=bounds[1], width=rgba.width, height=rgba.height,
                 data=base64.b64encode(zlib.compress(packed, 9)).decode(), palette=palette)
    LAYERS.append(entry)
    rgba.save(PREVIEW / f"{name.replace(':', '-')}.png")
    return name


# All bodies share neck, waist and sole attachment coordinates after preparation.
# The short formal bodice supplies free arms; the gown cell supplies only its skirt.
SPECS = {
    "hoodie": dict(crop=(140, 12, 459, 505), cx=307, top=27, waist=257, sole=493,
                   shoulder=(226, 106, 395, 110), elbow=(203, 203, 421, 201), wrist=(195, 270, 427, 271),
                   hips=(274, 280, 352, 280), knees=(251, 363, 348, 363), ankles=(229, 454, 354, 454),
                   upper="#497778", lower="#444C66", shoe="#D2B89A"),
    "jacket": dict(crop=(605, 12, 935, 505), cx=771, top=27, waist=250, sole=495,
                   shoulder=(701, 105, 861, 107), elbow=(665, 200, 886, 201), wrist=(651, 270, 898, 271),
                   hips=(733, 269, 807, 269), knees=(715, 358, 804, 358), ankles=(700, 437, 802, 437),
                   upper="#6F8980", lower="#85583C", shoe="#805039"),
    "tee": dict(crop=(1080, 12, 1415, 506), cx=1243, top=27, waist=194, sole=498,
                   shoulder=(1175, 105, 1323, 107), elbow=(1142, 199, 1354, 202), wrist=(1116, 269, 1381, 269),
                   hips=(1205, 293, 1270, 293), knees=(1181, 367, 1270, 367), ankles=(1170, 438, 1272, 438),
                   upper="#C57578", lower="#697E9C", shoe="#303C52"),
    "suit": dict(crop=(144, 505, 466, 996), cx=306, top=515, waist=735, sole=982,
                   shoulder=(228, 575, 389, 578), elbow=(202, 676, 419, 675), wrist=(190, 742, 433, 744),
                   hips=(270, 758, 349, 758), knees=(248, 843, 348, 843), ankles=(224, 937, 354, 937),
                   upper="#3B465E", lower="#414B61", shoe="#303847"),
    "bodice": dict(crop=(1080, 505, 1409, 995), cx=1242, top=515, waist=677, sole=982,
                   shoulder=(1175, 589, 1320, 588), elbow=(1140, 680, 1351, 678), wrist=(1115, 741, 1376, 742),
                   hips=(1204, 701, 1276, 701), knees=(1182, 812, 1276, 812), ankles=(1171, 926, 1278, 926),
                   upper="#E9BBA5", lower="#85583C", shoe="#805039"),
    "gown": dict(crop=(450, 505, 1073, 999), cx=765, top=515, waist=665, sole=990,
                 upper="#E9BBA5", lower="#E9BBA5", shoe="#D2B89A", sx=.277),
}


def mapped(spec, point):
    x, y = point
    sx = spec.get("sx", .30)
    if y <= spec["waist"]:
        yy = 99 + (y - spec["top"]) * 66 / (spec["waist"] - spec["top"])
    else:
        yy = 165 + (y - spec["waist"]) * 74 / (spec["sole"] - spec["waist"])
    return (round(96 + (x - spec["cx"]) * sx), round(yy))


def pair(spec, field):
    x1, y1, x2, y2 = spec[field]
    return mapped(spec, (x1, y1)), mapped(spec, (x2, y2))


def normalize(name, spec):
    image = Image.new("RGBA", (W, H))
    materials = Image.new("L", (W, H))
    out, ids = image.load(), materials.load()
    source = SOURCE.load()
    sx = spec.get("sx", .30)
    for y in range(H):
        sy = spec["top"] + (y - 99) * (spec["waist"] - spec["top"]) / 66 if y <= 165 else spec["waist"] + (y - 165) * (spec["sole"] - spec["waist"]) / 74
        sy = round(sy)
        for x in range(W):
            px = round(spec["cx"] + (x - 96) / sx)
            x0, y0, x1, y1 = spec["crop"]
            if not (x0 <= px < x1 and y0 <= sy < y1): continue
            r, g, b, a = source[px, sy]
            if a < 128: continue
            # The gown overlaps adjacent cells, whose dark footwear must not enter it.
            if name == "gown" and y > 180 and b > r * .97 and r < 130: continue
            out[x, y] = (r, g, b, 255)
            light = .2126*r + .7152*g + .0722*b
            skin_color = r > g * 1.08 and g > b * 1.06
            # Skin areas are anatomical, not inferred solely from garment color.
            skin_area = y < 114 and 84 < x < 112
            if name == "hoodie": skin_area |= y > 163 and y < 180 and (x < 76 or x > 123)
            if name == "jacket": skin_area |= (142 < y < 183 and (x < 76 or x > 124)) or (184 < y < 218)
            if name == "tee": skin_area |= (114 <= y <= 127 and 80 <= x <= 116) or (150 < y < 196 and (x < 77 or x > 122)) or (168 <= y <= 171 and 121 <= x <= 122) or (195 < y < 222)
            if name == "suit": skin_area |= 153 < y < 181 and (x < 74 or x > 125)
            if name == "bodice": skin_area |= (116 < y < 194 and (x < 80 or x > 119)) or (190 < y < 220) or (y < 133 and 78 < x < 121)
            if name == "gown": skin_area |= y < 132
            if skin_area and skin_color:
                # Anatomical warm shadows are skin too. Falling through here
                # would incorrectly recolor fingers when trousers change color.
                ids[x, y] = 1 if light > 55 else 0
            elif light < 39: ids[x, y] = 0
            elif y < 168:
                # Preserve cream shirt fronts, gold buttons, lace, and boutonniere.
                neutral = max(r,g,b)-min(r,g,b) < 22 and light > 185
                shirt = name in ("jacket", "suit") and 87 < x < 113 and r > b * 1.12 and light > 137
                flower = name == "suit" and x > 110 and y < 140 and r > b * 1.25
                ids[x,y] = 0 if neutral or shirt or flower else 3
            elif y > (221 if name in ("jacket", "tee", "bodice") else 225):
                ids[x,y] = 0 if max(r,g,b)-min(r,g,b) < 15 and light > 220 else 5
            else: ids[x,y] = 4
            # Below the cuffs, non-warm skin-region pixels are fixed ink or
            # highlights, never a material inherited from the neighboring skirt.
            if skin_area and y >= 168 and ids[x,y] in (3,4,5): ids[x,y] = 0
    if name == "gown":
        # Isolate the two source hands. The little fabric areas hidden by them
        # are completed from the adjacent original lace rows, rather than
        # deleting a rectangular chunk of the skirt silhouette.
        hand_regions=[[(625,714),(646,699),(671,704),(679,720),(665,740),(649,754),(633,750),(621,739)],
                      [(881,705),(899,709),(917,725),(921,744),(908,753),(890,739),(881,724)]]
        hands=polygon([mapped(spec,p) for p in hand_regions[0]])
        ImageDraw.Draw(hands).polygon([mapped(spec,p) for p in hand_regions[1]],fill=255)
        hm=hands.load(); donor=image.copy().load()
        for y in range(166,191):
            for x in range(W):
                if hm[x,y]: out[x,y]=donor[x,y+12]
        for y in range(165, H):
            for x in range(W):
                if out[x,y][3]:
                    r,g,b,_=out[x,y]
                    ids[x,y] = 0 if min(r,g,b)>225 and max(r,g,b)-min(r,g,b)<25 else 4
    keep_main_component(image)
    image.save(PREVIEW / f"normalized-{name}.png")
    return image, materials


BODIES = {name: normalize(name, spec) for name, spec in SPECS.items()}


def palette(spec):
    return {"skin": "#EFC099", "upper": spec["upper"], "lower": spec["lower"], "shoe": spec["shoe"]}


def upper(name):
    spec, (image, materials) = SPECS[name], BODIES[name]
    shoulder_n, shoulder_f = pair(spec,"shoulder")
    elbow_n, elbow_f = pair(spec,"elbow")
    wrist_n, wrist_f = pair(spec,"wrist")
    # Arm cuts follow the original inside sleeve edges with shoulder overlap.
    hand_bottom=max(wrist_n[1],wrist_f[1])+10
    left_boundary = [(shoulder_n[0]+8,107), (shoulder_n[0]+10,shoulder_n[1]+11), (elbow_n[0]+9,elbow_n[1]), (wrist_n[0]+9,hand_bottom)]
    right_boundary = [(shoulder_f[0]-8,107), (shoulder_f[0]-9,shoulder_f[1]+11), (elbow_f[0]-8,elbow_f[1]), (wrist_f[0]-8,hand_bottom)]
    near_mask = polygon([(0,96), (shoulder_n[0]+6,96), *left_boundary, (0,hand_bottom)])
    far_mask = polygon([(191,96), (shoulder_f[0]-6,96), *right_boundary, (191,hand_bottom)])
    torso_mask = polygon([(shoulder_n[0]+2,97),(shoulder_f[0]-1,97), *right_boundary, (right_boundary[-1][0],168), (left_boundary[-1][0],168), *reversed(left_boundary)])
    # Keep the torso silhouette up to the waist, excluding hand pixels below it.
    d=ImageDraw.Draw(torso_mask); d.rectangle((0,169,191,255), fill=0)
    def segment(mask, y0, y1):
        value=mask.copy(); pen=ImageDraw.Draw(value)
        if y0>0: pen.rectangle((0,0,191,y0-1),fill=0)
        if y1<255: pen.rectangle((0,y1+1,191,255),fill=0)
        return value
    prefix=f"upper:{name}"
    result={
        "torso":layer(prefix+":torso",image,materials,torso_mask,palette(spec)),
        "nearUpperArm":layer(prefix+":near-upper",image,materials,segment(near_mask,99,elbow_n[1]+3),palette(spec)),
        "nearForearm":layer(prefix+":near-fore",image,materials,segment(near_mask,elbow_n[1]-3,hand_bottom),palette(spec)),
        "farUpperArm":layer(prefix+":far-upper",image,materials,segment(far_mask,99,elbow_f[1]+3),palette(spec)),
        "farForearm":layer(prefix+":far-fore",image,materials,segment(far_mask,elbow_f[1]-3,hand_bottom),palette(spec)),
        "shoulderNear":shoulder_n,"elbowNear":elbow_n,"wristNear":wrist_n,
        "shoulderFar":shoulder_f,"elbowFar":elbow_f,"wristFar":wrist_f,
    }
    return result


def lower(name, source_name):
    spec, (image, materials) = SPECS[source_name], BODIES[source_name]
    hip_n, hip_f = pair(spec,"hips")
    knee_n, knee_f = pair(spec,"knees")
    ankle_n, ankle_f = pair(spec,"ankles")
    split=round((hip_n[0]+hip_f[0])/2)
    # Overlap each joint by three source pixels to hide seams during articulation.
    prefix=f"lower:{name}"
    result={"hips":layer(prefix+":hips", image,materials,rect(76,163,123,179),palette(spec))}
    for near in (True,False):
        side="near" if near else "far"
        knee=knee_n if near else knee_f
        ankle=ankle_n if near else ankle_f
        hip=hip_n if near else hip_f
        x0,x1=(0,split+1) if near else (split,191)
        thigh=polygon([(max(x0,hip[0]-15),174),(min(x1,hip[0]+15),174),(min(x1,knee[0]+14),knee[1]+3),(max(x0,knee[0]-14),knee[1]+3)])
        result[side+"Thigh"]=layer(prefix+":"+side+"-thigh",image,materials,thigh,palette(spec))
        result[side+"Shin"]=layer(prefix+":"+side+"-shin",image,materials,rect(x0,knee[1]-3,x1,ankle[1]+3),palette(spec))
        result[side+"Shoe"]=layer(prefix+":"+side+"-shoe",image,materials,rect(x0,ankle[1]-2,x1,240),palette(spec))
    result.update(hipNear=hip_n,kneeNear=knee_n,ankleNear=ankle_n,hipFar=hip_f,kneeFar=knee_f,ankleFar=ankle_f)
    if name=="skirt":
        skirt=polygon([(80,163),(120,163),(135,191),(128,199),(67,199),(63,191)])
        result["garment"]=layer(prefix+":garment",image,materials,skirt,palette(spec))
    if name=="dress":
        gown, gown_mask=BODIES["gown"]
        result["garment"]=layer(prefix+":garment",gown,gown_mask,rect(0,163,191,240),palette(SPECS["gown"]))
    return result


def main():
    upper_bank={name: upper(name) for name in ("tee","hoodie","jacket","suit","bodice")}
    lower_bank={"trousers":lower("trousers","hoodie"),"shorts":lower("shorts","bodice"),"skirt":lower("skirt","tee"),"dress":lower("dress","bodice")}
    path=Path(__file__).with_name("prepare-illustrated-portraits.py")
    if not path.exists():
        raise FileNotFoundError(f"Required portrait preparer is missing: {path}")
    module_spec=importlib.util.spec_from_file_location("portraits",path)
    module=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(module)
    head_layers,portraits=module.prepare_portraits()
    formal=lower("formal-trousers","suit")
    bank=dict(format=1,frameWidth=W,frameHeight=H,layers=LAYERS+head_layers,upper=upper_bank,lower=lower_bank,formalTrousers=formal,portraits=portraits)
    output=ROOT/"src/core/illustrated-assets.generated.ts"
    output.write_text('// Generated by scripts/prepare-illustrated-assets.mjs from committed production art.\n// Do not hand-edit compressed image bytes.\nimport type { IllustratedAssetBank } from "./illustrated-types";\nexport const ILLUSTRATED_ASSETS = '+json.dumps(bank,separators=(",",":"))+' as unknown as IllustratedAssetBank;\n')
    print(f"Prepared {len(bank['layers'])} source-art layers: {output.stat().st_size:,} bytes.")


if __name__=="__main__": main()
