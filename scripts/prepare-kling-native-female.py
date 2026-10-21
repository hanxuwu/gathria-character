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
BASE = ROOT / 'artwork/kling-native-female'
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
# Explicit source-sheet boundary excludes the generated sheet's peripheral glow.
# This is a cutout mask for existing paint, not a replacement skin drawing.
arm_outline = [(322, 90), (354, 95), (386, 117), (405, 145),
               (415, 177), (413, 208), (398, 234), (372, 247),
               (357, 299), (344, 344), (320, 379), (298, 405),
               (277, 424), (247, 440), (208, 436), (186, 415),
               (195, 382), (214, 353), (221, 315), (224, 273),
               (230, 229), (234, 188), (241, 150), (258, 124),
               (287, 102)]
arm_mask = Image.new('L', supplement.size)
ImageDraw.Draw(arm_mask).polygon(arm_outline, fill=255)
arm_pixels = np.array(supplement)
arm_pixels[np.array(arm_mask) == 0] = 0
supplement_arm = Image.fromarray(arm_pixels)


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
head = (Y < 506) | polygon([
    (325, 476), (394, 490), (392, 508), (407, 516),
    (420, 534), (423, 546), (418, 553), (404, 557),
    (384, 553), (365, 545), (341, 533), (315, 515),
])
# Independently traced female armholes, not a resized male registration.
left = np.interp(Y, [515, 525, 540, 550, 565, 580, 590, 600, 610, 620, 630, 650, 670, 690, 710, 740, 790],
                 [296, 308, 319, 324, 327, 326, 321, 311, 299, 295, 293, 294, 283, 276, 266, 257, 250])
right = np.interp(Y, [518, 525, 530, 535, 540, 545, 550, 555, 560, 565, 570, 575, 580, 585, 590, 595, 600, 605, 610, 615, 620, 625, 630, 635, 640, 645, 650, 655, 675, 695, 710, 740, 790],
                  [425, 430, 434, 439, 443, 447, 453, 456, 460, 463, 467, 469, 471, 472, 472, 472, 471, 469, 467, 464, 461, 461, 460, 459, 457, 456, 456, 458, 463, 467, 478, 478, 478])
near_arm = (Y >= 515) & (Y < 790) & (X < left) & ~head
far_arm = (Y >= 518) & (Y < 790) & (X > right) & ~head
hem = np.interp(X, [265, 285, 305, 335, 365, 395, 425, 450, 470], [667, 675, 681, 688, 692, 694, 691, 687, 682])
torso = (Y < hem) & ~head & ~near_arm & ~far_arm
lower = ~(head | near_arm | far_arm | torso)
split = np.interp(Y, [690, 740, 770, 800, 850, 1000], [378, 379, 371, 367, 353, 352])
near_leg = lower & (X < split)
far_leg = lower & ~near_leg
pelvis_edge = 716 + np.minimum(35, .45 * np.minimum(np.maximum(0, X - 264), np.maximum(0, 472 - X)))
pelvis = lower & (Y < pelvis_edge)
near_leg &= ~pelvis
far_leg &= ~pelvis
near_shoe_edge = np.interp(X, [202, 218, 237, 250, 269, 282, 300, 340], [950, 927, 934, 930, 920, 920, 934, 953])
far_shoe_edge = np.interp(X, [366, 381, 398, 414, 430, 445, 465, 512], [944, 922, 928, 926, 914, 912, 929, 949])
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


def hidden_patch(name, box, destination, mask, donor='supplement'):
    """Only new hidden paint can be scaled. Never scale source visible pixels."""
    patch = Image.new('RGBA', (W, H))
    image = {'supplement': supplement, 'supplement-arm': supplement_arm,
             'source-cloth': source}[donor]
    crop = image.crop(box).resize((destination[2] - destination[0], destination[3] - destination[1]), Image.Resampling.LANCZOS)
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
                          'donor': donor,
                          'kind': 'authored hidden coverage; original visible pixels overwrite'})


# Generated hidden caps are registered beneath opaque original owners.
# Coordinates refer only to the new supplementary sheet, never altered source.
hidden_patch('near-arm', (237, 96, 416, 308), (231, 511, 323, 603),
             ((X-277)**2+(Y-557)**2 < 43**2) & ~head & (torso | near_arm), 'supplement-arm')
# In the source the far upper arm is largely hidden behind the vest. A cap
# alone leaves a thin tether when lifted: complete its occluded shaft as well.
far_axis = 443 + (Y - 558) * (33 / 86)
hidden_patch('far-arm', (200, 100, 420, 400), (419, 536, 502, 661),
             (Y >= 548) & (Y < 650) & (np.abs(X-far_axis) < 26) & torso & ~head, 'supplement-arm')
# Reuse original shorts cloth in newly exposed hip caps: the generated cloth's
# lighter shading was conspicuous. These are authored allowances, not recovered
# hidden layers. Original visible cloth stays intact.
hidden_patch('near-leg', (308, 701, 357, 730), (264, 687, 474, 774),
             pelvis & (X < split) & (((X-313)/65)**2+((Y-745)/60)**2 < 1), 'source-cloth')
hidden_patch('far-leg', (406, 703, 448, 733), (264, 687, 474, 774),
             pelvis & (X >= split) & (((X-422)/60)**2+((Y-744)/60)**2 < 1), 'source-cloth')
hidden_patch('near-leg', (225, 1200, 330, 1380), (226, 900, 284, 948),
             near_shoe & (X > 229) & (X < 282) & (Y < 943))
hidden_patch('far-leg', (225, 1200, 330, 1380), (385, 894, 440, 944),
             far_shoe & (X > 387) & (X < 438) & (Y < 937))

chains = {
    'nearArm': [[277,557],[240,646],[200,729]],
    'farArm': [[443,558],[476,644],[514,724]],
    'nearLeg': [[313,745],[291,834],[255,925]],
    'farLeg': [[422,744],[418,833],[414,921]],
}
pivot, neck, anchor = [366,716], [357,507], [352,1000]
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
    pose('run-flight','Run flight',{'nearArm':(35,-35),'farArm':(-45,-110),'nearLeg':(-58,-6),'farLeg':(38,94)},(0,-65),7),
    pose('celebrate','Celebrate',{'nearArm':(110,135),'farArm':(-110,-125)},(0,-5),0),
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
document={'format':'gathria-native-pose-study','version':1,'name':'Kling female — native layered candidate','characterId':'kling-female-native-study',
          'frame':{'width':W,'height':H},'anchor':anchor,'pivot':pivot,'neck':neck,'chains':chains,
          'mesh':{'blendRadius':32,'volume':.65,'shoulderBlend':28},'drawOrder':draw_order,'parts':records,'poses':poses,
          'source':{'name':'Original Kling female frame348 with separately authored hidden coverage',
                    'sha256':sha(SOURCE/'reference.png'),'referenceSha256':sha(SOURCE/'reference.png'),
                    'frameIndex':348,'timeSeconds':14.5,
                    'provenance':'Visible artwork is copied pixel-for-pixel from approved female source frame 348; source PNG SHA256 is recorded. Hidden shoulder, upper-arm and ankle coverage uses newly authored OpenAI image_gen paint, explicitly masked and registered offline. Hip allowances reuse sampled original shorts cloth after generated cloth produced a shading mismatch; these reconstructed hidden surfaces are not recovered original layers. Generated vest and shorts remain source material only. Female joints, armholes, hems and shoe openings are registered separately from the male. These derived skeletal static poses are not original video frames or a completed animation library.'}}
(OUT/'registration.json').write_text(json.dumps(document,indent=2)+'\n')
integrity={'sourceSha256':sha(SOURCE/'reference.png'),'supplementSha256':sha(SOURCE/'hidden-joints.png'),
           'supplementArmOutline':arm_outline,
           'visiblePixelOwnership':'complete disjoint source partition; no recoloring or rescaling',
           'restDifferentRgbaPixels':int(different.sum()),'restTotalPixels':W*H,
           'patches':patch_records,'parts':[{'id':name,'sha256':sha(OUT/'parts'/f'{name}.png'),'bounds':image.getbbox()} for name,image in hd.items()]}
(OUT/'preparation-report.json').write_text(json.dumps(integrity,indent=2)+'\n')
print('Prepared',len(hd),'native parts and',len(poses),'static poses')
