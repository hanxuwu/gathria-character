"""Partition exact source pixels; register separately authored hidden coverage.

This offline asset compiler does not redraw the approved visible character.
All shapes below are ownership/occlusion masks, never replacement artwork.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'artwork/kling-native-study'
SOURCE = BASE / 'source'
OUT = BASE / 'prepared'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'parts').mkdir(exist_ok=True)
W, H = 704, 1056
source = Image.open(SOURCE / 'reference.png').convert('RGBA')
assert source.size == (W, H)
A = np.array(source)
Y, X = np.indices((H, W))
supplement = Image.open(SOURCE / 'hidden-joints.png').convert('RGBA')


def polygon(points):
    mask = Image.new('L', (W, H))
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return np.array(mask) > 0


def masked(array, mask):
    out = array.copy()
    out[~mask] = 0
    return Image.fromarray(out)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


# Follow actual anatomical/clothing boundaries, not RGB color guesses.
head = (Y < 520) | polygon([
    (308, 496), (401, 503), (393, 529), (411, 540),
    (411, 551), (394, 557), (370, 554), (338, 541), (307, 527),
])
left = np.interp(Y, [533, 540, 550, 560, 580, 600, 610, 620, 630, 640, 650, 660, 680, 700, 720, 740, 760, 780, 809],
                 [278, 295, 307, 313, 319, 317, 313, 307, 289, 285, 280, 281, 272, 266, 251, 247, 246, 244, 232])
right = np.interp(Y, [535, 540, 550, 560, 570, 580, 600, 610, 620, 630, 640, 650, 660, 680, 700, 720, 740, 760, 790, 809],
                  [430, 435, 443, 449, 455, 459, 465, 467, 465, 461, 459, 457, 457, 465, 467, 475, 479, 484, 484, 484])
near_arm = (Y >= 533) & (Y < 809) & (X < left) & ~head
far_arm = (Y >= 535) & (Y < 809) & (X > right) & ~head
hem = np.interp(X, [250, 280, 320, 360, 400, 440, 470], [699, 706, 714, 718, 715, 706, 700])
torso = (Y < hem) & ~head & ~near_arm & ~far_arm
lower = ~(head | near_arm | far_arm | torso)
split = np.interp(Y, [710, 780, 810, 870, 1000], [374, 374, 369, 360, 355])
near_leg = lower & (X < split)
far_leg = lower & ~near_leg
pelvis_edge = 746 + np.minimum(44, .52 * np.minimum(np.maximum(0, X - 251), np.maximum(0, 484 - X)))
pelvis = lower & (Y < pelvis_edge)
near_leg &= ~pelvis
far_leg &= ~pelvis
near_shoe_edge = np.interp(X, [210, 230, 255, 280, 300, 330, 350], [951, 938, 927, 925, 936, 949, 960])
far_shoe_edge = np.interp(X, [368, 385, 405, 425, 445, 470, 512], [958, 937, 929, 925, 933, 943, 957])
near_shoe = near_leg & (Y >= near_shoe_edge)
far_shoe = far_leg & (Y >= far_shoe_edge)
ownership = {
    'head': head, 'torso': torso, 'pelvis': pelvis,
    'near-arm': near_arm, 'far-arm': far_arm,
    'near-leg': near_leg & ~near_shoe, 'far-leg': far_leg & ~far_shoe,
    'near-shoe': near_shoe, 'far-shoe': far_shoe,
}
assert np.all(sum(mask.astype(int) for mask in ownership.values()) == 1)
parts = {name: masked(A, mask) for name, mask in ownership.items()}
patch_records = []


def hidden_patch(name, box, destination, mask):
    """Only new hidden paint can be scaled. Never scale source visible pixels."""
    patch = Image.new('RGBA', (W, H))
    crop = supplement.crop(box).resize((destination[2] - destination[0], destination[3] - destination[1]), Image.Resampling.LANCZOS)
    patch.paste(crop, destination[:2])
    # No supplement outside the original opaque silhouette at rest. Original
    # owner in front covers each patch; AA edges retain exactly one owner.
    pixels = np.array(patch)
    pixels[~mask | (A[:, :, 3] != 255)] = 0
    patch = Image.fromarray(pixels)
    patch.alpha_composite(parts[name])
    parts[name] = patch
    patch_records.append({'part': name, 'supplementBox': box, 'registeredBox': destination,
                          'pixels': int(np.count_nonzero(pixels[:, :, 3])),
                          'kind': 'newly-authored hidden coverage; original visible pixels overwrite'})


# Both upper arms sit behind the vest. Complete caps extend beneath its opaque
# shoulder straps; they are not chopped at the original exposed-skin boundary.
hidden_patch('far-arm', (190, 125, 402, 360), (414, 539, 490, 625),
             ((X-452)**2+(Y-583)**2 < 30**2) & ~head & (torso | far_arm))
hidden_patch('near-arm', (190, 125, 402, 360), (228, 537, 320, 629),
             ((X-270)**2+(Y-582)**2 < 46**2) & ~head & (torso | near_arm))
# The source vest side already has a complete silhouette. An early vest-side
# supplement wrongly occupied the transparent arm/body gap when the arm moved;
# keep only the original vest instead of inventing fabric in that gap.
# Upper leg caps stay below the rigid pelvis and are revealed only by posing.
# Only shorts cloth is added here; no bare skin can leak through a hem.
hidden_patch('near-leg', (477, 950, 995, 1280), (248, 707, 486, 802),
             pelvis & (X < split) & (((X-310)/65)**2+((Y-773)/62)**2 < 1))
hidden_patch('far-leg', (477, 950, 995, 1280), (248, 707, 486, 802),
             pelvis & (X >= split) & (((X-425)/60)**2+((Y-773)/60)**2 < 1))
# Shin allowances lie behind the original shoe opening, inherit the same shin
# transform, and cannot change the original shoe silhouette at rest.
hidden_patch('near-leg', (162, 1130, 348, 1360), (231, 903, 294, 960),
             near_shoe & (X > 239) & (X < 285) & (Y < 946))
hidden_patch('far-leg', (162, 1130, 348, 1360), (390, 901, 450, 956),
             far_shoe & (X > 402) & (X < 439) & (Y < 942))

chains = {
    'nearArm': [[270,582],[228,669],[199,752]],
    'farArm': [[452,583],[476,670],[513,751]],
    'nearLeg': [[310,773],[290,855],[260,936]],
    'farLeg': [[425,773],[425,856],[420,934]],
}
pivot, neck, anchor = [365,741], [356,526], [352,1000]
hd = {key: parts[key] for key in ['head','torso','pelvis','near-shoe','far-shoe']}
for side in ['near', 'far']:
    arm = np.array(parts[side+'-arm'])
    leg = np.array(parts[side+'-leg'])
    elbow, wrist = chains[side+'Arm'][1][1], chains[side+'Arm'][2][1]
    knee = chains[side+'Leg'][1][1]
    # Single-owner contiguous cuts are recombined before mesh deformation;
    # there is no alpha-overlap seam inside the limb texture.
    hd[side+'-upper-arm'] = masked(arm, Y < elbow)
    hd[side+'-forearm'] = masked(arm, (Y >= elbow) & (Y < wrist))
    hd[side+'-hand'] = masked(arm, Y >= wrist)
    hd[side+'-thigh'] = masked(leg, Y < knee)
    hd[side+'-shin'] = masked(leg, Y >= knee)
for name, image in hd.items():
    image.save(OUT/'parts'/f'{name}.png')
(OUT/'reference.png').write_bytes((SOURCE/'reference.png').read_bytes())

draw_order = ['far-arm','far-leg','near-leg','pelvis','near-upper-arm','torso','near-forearm','head']
rest = Image.new('RGBA', (W,H))
for name in ['far-arm','far-leg','far-shoe','near-leg','near-shoe','pelvis','near-upper-arm','torso','near-forearm','near-hand','head']:
    rest.alpha_composite(hd[name] if name in hd else parts[name])
rest.save(OUT/'rest-composite.png')
R = np.array(rest)
different = np.any(R != A, axis=2)
print('Standing differing RGBA pixels:', int(different.sum()))


def rotate(v, angle):
    c,s=math.cos(angle),math.sin(angle)
    return [c*v[0]-s*v[1],s*v[0]+c*v[1]]


def pose(identifier, label, angles, translation=(0,0), body_degrees=0):
    body_angle=math.radians(body_degrees)
    posed={}
    for key, triple in chains.items():
        root=rotate([triple[0][i]-pivot[i] for i in range(2)],body_angle)
        root=[root[i]+pivot[i]+translation[i] for i in range(2)]
        out=[root]
        for i,angle in enumerate(angles.get(key,(0,0))):
            delta=rotate([triple[i+1][j]-triple[i][j] for j in range(2)],math.radians(angle)+body_angle)
            out.append([out[-1][j]+delta[j] for j in range(2)])
        posed[key]=[[round(v,6) for v in p] for p in out]
    return {'id':identifier,'label':label,'body':{'translation':list(translation),'rotation':body_angle},'chains':posed}


poses=[
    pose('standing','Standing',{}),
    pose('walk-contact','Walk contact',{'nearArm':(-20,-45),'farArm':(25,15),'nearLeg':(20,14),'farLeg':(-25,-20)},(0,0),2),
    pose('run-flight','Run flight',{'nearArm':(35,-35),'farArm':(-45,-110),'nearLeg':(-63,-5),'farLeg':(40,102)},(0,-65),7),
    pose('celebrate','Celebrate',{'nearArm':(105,135),'farArm':(-110,-125)},(0,-5),0),
]
records=[]
for name in hd:
    if name=='head': parent,point='torso',neck
    elif name=='torso': parent,point='pelvis',pivot
    elif name=='pelvis': parent,point='root',pivot
    else:
        side=name.split('-')[0]
        if 'upper-arm' in name: parent,point='torso',chains[side+'Arm'][0]
        elif 'forearm' in name: parent,point=side+'-upper-arm',chains[side+'Arm'][1]
        elif 'hand' in name: parent,point=side+'-forearm',chains[side+'Arm'][2]
        elif 'thigh' in name: parent,point='pelvis',chains[side+'Leg'][0]
        elif 'shin' in name: parent,point=side+'-thigh',chains[side+'Leg'][1]
        else: parent,point=side+'-shin',chains[side+'Leg'][2]
    records.append({'id':name,'file':f'parts/{name}.png','parent':parent,'pivot':point})
document={'format':'gathria-native-pose-study','version':1,'name':'Kling male — native layered candidate',
          'frame':{'width':W,'height':H},'anchor':anchor,'pivot':pivot,'neck':neck,'chains':chains,
          'mesh':{'blendRadius':30,'volume':.65,'shoulderBlend':35},'drawOrder':draw_order,'parts':records,'poses':poses,
          'source':{'name':'Original Kling male frame348 with separately authored hidden coverage',
                    'sha256':sha(SOURCE/'reference.png'),'referenceSha256':sha(SOURCE/'reference.png'),
                    'frameIndex':348,'timeSeconds':14.5,
                    'provenance':'Visible artwork is copied pixel-for-pixel from approved male source frame 348; source PNG SHA256 is recorded. Hidden shoulder, shorts and ankle coverage is newly authored using OpenAI image_gen, masked and registered offline. A generated vest-side supplement was tested and removed because the original vest silhouette is already complete. These derived skeletal static poses are not original video frames, not a completed animation library, and not an extracted original layer file.'}}
(OUT/'registration.json').write_text(json.dumps(document,indent=2)+'\n')
integrity={'sourceSha256':sha(SOURCE/'reference.png'),'supplementSha256':sha(SOURCE/'hidden-joints.png'),
           'visiblePixelOwnership':'complete disjoint source partition; no recoloring or rescaling',
           'restDifferentRgbaPixels':int(different.sum()),'restTotalPixels':W*H,
           'patches':patch_records,'parts':[{'id':name,'sha256':sha(OUT/'parts'/f'{name}.png'),'bounds':image.getbbox()} for name,image in hd.items()]}
(OUT/'preparation-report.json').write_text(json.dumps(integrity,indent=2)+'\n')
print('Prepared',len(hd),'native parts and',len(poses),'static poses')
