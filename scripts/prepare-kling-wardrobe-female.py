"""DRAFT offline registration research. Source RGBA is never edited.
Manually reviewed keyposes + dense optical-flow proposals, image-derived semantic masks.
This is not validated motion capture and not production accepted artwork.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
import numpy as np,json,hashlib,math,importlib.util,argparse,zipfile,shutil,sys
import cv2
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=Path('/tmp/kling-wardrobe-female'))
parser.add_argument('--registration-output',type=Path,default=ROOT/'artwork/kling-wardrobe/registration/female')
parser.add_argument('--pack',type=Path,default=ROOT/'docs/kling-motion/exports/female.character.zip')
args=parser.parse_args();P=args.output;P.mkdir(parents=True,exist_ok=True);W,H=704,1056
spec=importlib.util.spec_from_file_location('kling_source',ROOT/'scripts/compile-kling-keyframes.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
_,source_manifest,source_config,source_frames=base.source_frames(args.pack)
(P/'frames').mkdir(exist_ok=True)
for frame_id,frame in source_frames.items():frame.save(P/'frames'/f'{frame_id}.png')
(P/'manifest.json').write_text(json.dumps(source_manifest,indent=2))
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
# nS,fS,nE,fE,nW,fW,nK,fK,nA,fA: visible joint centers reviewed on actual source keyposes.
# Occluded joints remain approximate anatomical locations; no hidden artwork is recovered.
K={
0:[(285,550),(442,550),(249,640),(478,645),(201,730),(511,726),(292,838),(424,833),(243,923),(416,918)],
18:[(285,550),(442,550),(249,640),(478,645),(201,730),(511,726),(292,838),(424,833),(243,923),(416,918)],
24:[(289,544),(446,543),(239,626),(483,640),(206,706),(535,697),(365,818),(307,829),(351,900),(304,906)],
28:[(293,553),(456,550),(213,625),(506,641),(166,690),(555,680),(384,811),(301,826),(413,910),(261,888)],
32:[(293,552),(452,548),(242,637),(490,641),(211,709),(548,706),(386,818),(286,836),(388,930),(250,862)],
36:[(290,545),(449,548),(269,634),(465,645),(266,738),(488,737),(296,830),(424,810),(285,929),(366,885)],
40:[(301,551),(430,550),(306,634),(430,635),(354,706),(447,690),(255,817),(455,804),(213,905),(491,897)],
44:[(303,560),(437,563),(323,639),(431,632),(390,698),(452,692),(278,819),(449,817),(195,887),(448,929)],
48:[(298,546),(445,548),(277,641),(463,648),(285,721),(472,734),(347,806),(438,819),(264,861),(421,930)],
50:[(290,542),(449,543),(261,638),(475,648),(239,721),(507,718),(363,807),(351,828),(341,903),(343,914)],
51:[(279,516),(445,516),(172,543),(502,580),(139,620),(546,533),(243,775),(411,766),(163,799),(450,858)],
54:[(293,568),(450,571),(228,641),(485,674),(243,713),(529,650),(389,835),(300,816),(361,929),(250,820)],
58:[(333,521),(294,537),(372,592),(265,595),(470,565),(244,625),(273,787),(482,735),(171,871),(479,844)],
62:[(331,571),(416,584),(324,650),(447,673),(425,650),(463,700),(355,830),(465,814),(253,804),(452,926)],
66:[(282,515),(449,514),(175,544),(503,576),(151,622),(548,537),(245,803),(418,746),(188,867),(437,853)],
67:[(276,575),(444,577),(181,612),(525,598),(147,545),(562,548),(307,842),(450,832),(247,926),(421,922)],
71:[(282,555),(443,555),(180,561),(546,556),(127,483),(587,489),(294,840),(437,831),(244,927),(417,919)],
75:[(282,505),(442,498),(183,449),(532,435),(104,387),(590,368),(274,820),(425,816),(249,901),(430,896)],
79:[(283,539),(443,539),(175,536),(549,530),(116,448),(580,431),(291,840),(430,833),(250,920),(417,921)],
82:[(278,576),(442,578),(181,613),(531,594),(150,545),(566,536),(307,842),(448,833),(247,925),(422,919)],
83:[(312,619),(467,621),(241,681),(500,687),(335,674),(534,650),(313,851),(447,838),(254,927),(420,919)],
87:[(319,655),(468,654),(239,687),(503,697),(330,652),(522,648),(308,857),(447,838),(255,926),(419,917)],
91:[(292,475),(466,479),(218,537),(506,557),(209,607),(557,610),(267,772),(412,773),(256,882),(415,870)],
95:[(279,387),(454,387),(178,433),(526,449),(119,497),(565,511),(298,625),(456,650),(263,701),(381,716)],
99:[(279,395),(450,395),(170,437),(524,450),(111,480),(573,502),(292,675),(445,676),(270,749),(418,753)],
103:[(274,605),(447,606),(156,638),(529,665),(148,697),(591,677),(296,831),(447,826),(241,921),(421,916)],
107:[(309,658),(469,661),(239,718),(510,729),(336,713),(545,701),(305,857),(446,840),(254,928),(418,919)],
111:[(289,583),(449,586),(232,647),(495,676),(285,704),(552,680),(300,835),(444,824),(245,918),(418,915)],
115:[(288,545),(445,550),(232,632),(494,647),(230,709),(540,697),(288,822),(424,816),(247,920),(416,920)],
121:[(281,551),(434,551),(240,639),(470,644),(201,729),(504,726),(291,836),(421,832),(240,924),(412,920)]}
# Additional visually reviewed run phases avoid interpolating across folded legs.
K.update({
52:[(282,532),(445,535),(174,559),(501,584),(145,639),(538,550),(237,787),(410,799),(164,779),(450,900)],
53:[(290,553),(450,555),(202,572),(511,614),(193,690),(552,585),(392,829),(292,809),(409,929),(230,775)],
55:[(298,569),(446,573),(267,644),(478,691),(337,689),(507,704),(337,841),(429,825),(306,931),(307,849)],
56:[(330,553),(429,558),(323,634),(454,642),(434,653),(457,675),(297,824),(464,787),(271,925),(390,866)],
57:[(337,520),(295,543),(361,602),(280,605),(466,599),(265,643),(285,797),(480,750),(208,905),(432,835)],
59:[(330,515),(284,532),(366,586),(245,591),(456,545),(221,612),(226,775),(449,747),(134,826),(490,850)],
60:[(326,527),(284,548),(361,595),(245,612),(459,565),(220,634),(301,785),(472,798),(200,776),(520,873)],
61:[(333,555),(293,576),(348,623),(289,637),(446,598),(282,674),(327,801),(473,815),(234,769),(475,916)],
63:[(298,564),(444,565),(258,631),(485,668),(319,691),(508,675),(401,809),(449,836),(298,808),(408,924)],
64:[(291,554),(447,560),(226,623),(488,645),(263,715),(543,645),(392,785),(365,869),(304,844),(321,916)],
65:[(283,518),(450,523),(196,557),(497,593),(192,672),(548,582),(271,825),(434,744),(243,889),(428,835)]
})
N=['nearShoulder','farShoulder','nearElbow','farElbow','nearWrist','farWrist','nearKnee','farKnee','nearAnkle','farAnkle']
# Explicit waist endpoints, including inferred hidden endpoints under crossing hands.
# These preserve the sloped shirt/shorts seam rather than deriving a width from visible islands.
WAIST={
0:[(296,678),(460,685)],18:[(296,678),(460,685)],
24:[(284,660),(452,666)],28:[(293,682),(446,690)],32:[(295,681),(447,688)],36:[(279,665),(448,672)],40:[(275,674),(447,686)],44:[(281,685),(448,692)],48:[(283,668),(454,675)],50:[(291,660),(459,668)],
51:[(289,645),(438,663)],52:[(281,657),(442,671)],53:[(289,684),(447,704)],54:[(288,700),(439,718)],55:[(273,707),(451,717)],56:[(300,687),(455,698)],57:[(290,647),(448,667)],58:[(284,637),(449,671)],59:[(252,630),(431,663)],60:[(285,644),(448,676)],61:[(302,679),(455,705)],62:[(282,700),(450,720)],63:[(287,699),(455,714)],64:[(287,679),(439,703)],65:[(283,640),(442,667)],66:[(287,635),(447,667)],
67:[(283,713),(444,723)],71:[(284,686),(447,699)],75:[(285,647),(451,663)],79:[(283,679),(448,693)],82:[(283,710),(445,723)],
83:[(251,736),(428,758)],87:[(236,746),(416,774)],91:[(272,605),(452,620)],95:[(270,521),(434,543)],99:[(276,544),(435,561)],103:[(255,731),(431,751)],107:[(248,756),(420,785)],111:[(276,707),(443,728)],115:[(285,671),(451,685)],121:[(291,674),(460,687)]}
for frame_id in K:K[frame_id]+=WAIST[frame_id]
N+=['waistLeft','waistRight']
manifest=json.loads((P/'manifest.json').read_text()); actions={i:name for name,a in manifest['animations'].items() for i in a['frames']}
yy,xx=np.indices((H,W));
def largest(mask):
 lab,n=ndi.label(mask);sz=np.bincount(lab.ravel());sz[0]=0
 return lab==np.argmax(sz) if n else mask

def bbox(mask):
 y,x=np.where(mask); return [int(x.min()),int(y.min()),int(x.max()),int(y.max())] if len(x) else [0,0,0,0]

def segdist(a,b):
 a,b=np.array(a,float),np.array(b,float);v=b-a;t=np.clip(((xx-a[0])*v[0]+(yy-a[1])*v[1])/(v@v+1e-8),0,1)
 return np.sqrt((xx-a[0]-t*v[0])**2+(yy-a[1]-t*v[1])**2)

def nearline(pts):return np.minimum.reduce([segdist(a,b) for a,b in zip(pts,pts[1:])])

small={fid:cv2.cvtColor(cv2.resize(np.array(im)[:,:,:3],(352,528)),cv2.COLOR_RGB2GRAY) for fid,im in source_frames.items()}
flows={}
def interp(k,action):
 ids=list(dict.fromkeys(manifest['animations'][action]['frames']));keys=[i for i in K if i in ids]
 seed=min(keys,key=lambda i:abs(ids.index(i)-ids.index(k)));pts=np.array(K[seed],float)/2
 a,b=ids.index(seed),ids.index(k);step=1 if b>a else -1
 for i in range(a,b,step):
  pair=(ids[i],ids[i+step])
  if pair not in flows:flows[pair]=cv2.calcOpticalFlowFarneback(small[pair[0]],small[pair[1]],None,.5,5,35,6,7,1.5,0)
  flow=flows[pair];updated=[]
  for point in pts:
   x,y=np.round(point).astype(int);x=np.clip(x,3,348);y=np.clip(y,3,524)
   updated.append(point+np.median(flow[y-3:y+4,x-3:x+4],axis=(0,1)))
  pts=np.array(updated)
 pts*=2
 return {name:[round(float(x),1) for x in p] for name,p in zip(N,pts)},seed,k

def finish_mask(seed,allowed,other=None,dist=4):
 fill=ndi.binary_fill_holes(seed)
 if other is not None: fill &= ~other
 d=ndi.distance_transform_edt(~fill);out=(d<=dist)&allowed
 if other is not None:out &= ~ndi.binary_erosion(other,iterations=1)
 return out

records=[];(P/'registration').mkdir(exist_ok=True);(P/'masks').mkdir(exist_ok=True);(P/'overlays').mkdir(exist_ok=True)
for path in sorted((P/'frames').glob('*.png'),key=lambda p:int(p.stem)):
 k=int(path.stem); action=actions[k];im=Image.open(path).convert('RGBA');a=np.array(im);r,g,b=[a[:,:,i].astype(float) for i in range(3)];alpha=a[:,:,3];fg=alpha>12
 pts,lo,hi=interp(k,action)
 skin_seed=fg&(r-g>20)&(r-b>38)&(r>120)
 gray=fg&(r-b>=-6)&(r-b<48)&(r-g<28)&(r>65)&(r<238)&(yy>220)&(yy<920)
 core=largest(gray);box=bbox(core);x0,y0,x1,y1=box
 # Preserve separate vest islands on the other side of a crossing arm.
 tank_seed=gray&(xx>x0-35)&(xx<x1+35)&(yy>y0-100)&(yy<y1+4)
 labels,n=ndi.label(tank_seed);counts=np.bincount(labels.ravel());keep=np.where(counts>55)[0];keep=keep[keep>0];tank_seed=np.isin(labels,keep)
 shorts_seed=fg&(b-r>3)&(b-g>-8)&(r<120)&(yy>y0+50)&(yy<y1+180)&(xx>x0-90)&(xx<x1+90)
 slab,sn=ndi.label(shorts_seed);ssize=np.bincount(slab.ravel());skeep=np.where(ssize>60)[0];skeep=skeep[skeep>0];shorts_core=np.isin(slab,skeep)
 sbox=bbox(shorts_core);sx0,sy0,sx1,sy1=sbox
 shorts=finish_mask(shorts_core,fg,skin_seed,5)
 tank=finish_mask(tank_seed,fg,skin_seed|shorts,4)
 # Head component includes visible neck and neckline skin, excluding separated raised hands.
 shoulder_y=min(pts['nearShoulder'][1],pts['farShoulder'][1]);top=int(np.where(fg)[0].min()); topband=fg&(yy>top+25)&(yy<top+100);cx=float(np.median(np.where(topband)[1]));
 hp=Image.new('1',(W,H));hd=ImageDraw.Draw(hp);hd.polygon([(cx-25,top-8),(cx+90,top+8),(cx+170,top+65),(cx+208,top+150),(cx+195,top+260),(cx+165,top+310),(cx+112,top+353),(cx-27,top+353),(cx-110,top+325),(cx-185,top+290),(cx-215,top+220),(cx-200,top+130),(cx-140,top+50)],fill=1)
 head_region=np.array(hp,dtype=bool)|((xx>cx-5)&(xx<cx+65)&(yy>top+310)&(yy<top+425))
 head_seed=largest(skin_seed&head_region&(r>150))
 head=finish_mask(head_seed,fg,tank|shorts,5)
 skin=finish_mask(skin_seed,fg,tank|shorts,3)&~head
 # Source silhouette, not an invented underwear/body layer.
 shoe_roi=(np.hypot(xx-pts['nearAnkle'][0],yy-pts['nearAnkle'][1])<170)|(np.hypot(xx-pts['farAnkle'][0],yy-pts['farAnkle'][1])<170)
 shoes_seed=fg&(r>135)&(g>125)&(b>125)&(r-b<43)&(abs(r-g)<38)&shoe_roi&(yy>min(pts['nearAnkle'][1],pts['farAnkle'][1])-85)&(~tank)&(~shorts)
 lab,n=ndi.label(shoes_seed);counts=np.bincount(lab.ravel());keep=np.where(counts>120)[0];keep=keep[keep>0]
 skin_labels,skin_count=ndi.label(skin_seed);skin_sizes=np.bincount(skin_labels.ravel());body_skin_ids=np.where(skin_sizes>=4000)[0];body_skin_ids=body_skin_ids[body_skin_ids>0];body_skin=np.isin(skin_labels,body_skin_ids)
 shoes=np.zeros((H,W),bool);sole_guard=np.zeros((H,W),bool)
 for shoe_id in keep:
  seed=lab==shoe_id;sy,sx=np.where(seed);center=np.array([sx.mean(),sy.mean()])
  ankle=min([np.array(pts['nearAnkle']),np.array(pts['farAnkle'])],key=lambda p:np.linalg.norm(center-p));axis=(center-ankle)/max(np.linalg.norm(center-ankle),1)
  along=(xx-ankle[0])*axis[0]+(yy-ankle[1])*axis[1]
  local=(xx>=sx.min()-12)&(xx<=sx.max()+12)&(yy>=sy.min()-6)&(yy<=sy.max()+16)
  # Warm beige/pink soles belong to the shoe; a skin-color rule cannot erase
  # them. Extend locally toward the toe/sole while retaining ankle skin.
  complete=ndi.binary_dilation(ndi.binary_fill_holes(seed),iterations=11)&fg&local&(~tank)&(~shorts)
  shoes|=complete&((~body_skin)|seed)
  sole_guard|=local&~body_skin
 shoes|=ndi.binary_dilation(shoes,iterations=5)&fg&sole_guard&(~tank)&(~shorts)

 # Waist/neck/hips derived from actual visible apparel pixels.
 # Use the sloped lower contour, not the lowest global percentile: a crossing
 # arm or curved hem must not shrink the waist to the center of the vest.
 ys,xs=np.where(tank);bottom=np.max(np.where(tank,yy,-1),axis=0);columns=np.where((bottom>=int(ys.max())-max(45,int((ys.max()-ys.min())*.30)))&(tank.sum(axis=0)>6))[0]
 wl=float(np.percentile(columns,2));wr=float(np.percentile(columns,98))
 def waist_y(x):
  close=columns[np.abs(columns-x)<=4]
  return float(np.median(bottom[close])) if len(close) else float(np.median(bottom[columns]))
 wly,wry=waist_y(wl),waist_y(wr);wy=(wly+wry)/2
 # Keep the observed/inferred seam endpoints tracked from reviewed poses.
 wl,wly=pts['waistLeft'];wr,wry=pts['waistRight'];wy=(wly+wry)/2
 top_skin=head&(yy>shoulder_y-30);hy,hx=np.where(top_skin)
 pts['neck']=[round(float(np.median(hx)),1),round(float(np.percentile(hy,45)),1)] if len(hx) else [round((wl+wr)/2,1),round(shoulder_y-35,1)]
 pts['nearHip']=[round(sx0+(sx1-sx0)*.30,1),round(sy0+(sy1-sy0)*.50,1)]
 pts['farHip']=[round(sx0+(sx1-sx0)*.72,1),round(sy0+(sy1-sy0)*.50,1)]
 nd=nearline([pts['nearShoulder'],pts['nearElbow'],pts['nearWrist']]);fd=nearline([pts['farShoulder'],pts['farElbow'],pts['farWrist']]);armeligible=skin&(yy<max(pts[n][1] for n in ['nearShoulder','farShoulder','nearElbow','farElbow','nearWrist','farWrist'])+75)
 # Resolve limb ownership before adding dark outlines: nearby thigh components are not arms.
 nearseed=skin_seed&~head&(nd<80)&((nd<=fd)|(fd>80))&armeligible
 farseed=skin_seed&~head&(fd<80)&~nearseed&armeligible
 nearseed=largest(nearseed);farseed=largest(farseed)
 narm=finish_mask(nearseed,fg,tank|shorts|head,3)&(nd<84)
 farm=finish_mask(farseed,fg,tank|shorts|head,3)&(fd<84)&~narm
 # Here the far arm is behind the torso, not a foreground cutout through the skirt.
 if action=='walk' and 36<=k<=48:farm[:]=False
 def handmask(side,arm):
  wrist=np.array(pts[side+'Wrist']);elbow=np.array(pts[side+'Elbow']);u=(wrist-elbow)/max(np.linalg.norm(wrist-elbow),1)
  along=(xx-wrist[0])*u[0]+(yy-wrist[1])*u[1];radius=np.hypot(xx-wrist[0],yy-wrist[1])
  m=arm&(along>=-15)&(radius<100)
  return largest(m) if m.any() else m
 nhand=handmask('near',narm);fhand=handmask('far',farm)
 ad0=np.hypot(xx-pts['nearAnkle'][0],yy-pts['nearAnkle'][1]);ad1=np.hypot(xx-pts['farAnkle'][0],yy-pts['farAnkle'][1]);nshoe=shoes&(ad0<=ad1);fshoe=shoes&~nshoe
 for name,m in [('near',nshoe),('far',fshoe)]:
  sy,sx=np.where(m)
  pts[name+'Toe']=[round(float(np.percentile(sx,94)),1),round(float(np.median(sy[sx>=np.percentile(sx,85)])),1)] if len(sx) else [pts[name+'Ankle'][0]+30,pts[name+'Ankle'][1]+30]
 masks={'tank':tank,'shorts':shorts,'skin':skin,'headNeck':head,'shoes':shoes,'nearArm':narm,'farArm':farm,'nearHand':nhand,'farHand':fhand,'nearShoe':nshoe,'farShoe':fshoe}
 outdir=P/'masks'/str(k);outdir.mkdir(exist_ok=True)
 for name,m in masks.items():Image.fromarray(np.where(m,alpha,0).astype('uint8')).save(outdir/f'{name}.png')
 source_sha=hashlib.sha256(path.read_bytes()).hexdigest()
 rec={'frameId':k,'action':action,'sourcePngSha256':source_sha,'canvas':[W,H],'groundAnchor':[352,998],'anchors':pts,'anchorStatus':{name:('visible-material-derived-draft' if name in ['neck','nearHip','farHip'] or name.endswith('Toe') else 'visually-placed-keypose-draft' if k in K else f'optical-flow-from-reviewed-keypose:{lo}') for name in pts},'hiddenAnchorPolicy':'Occluded joint coordinates are inferred, not extracted original anatomy. All landmarks are candidate registration, not production accepted tracking.','maskMethod':'Color candidates within source-position ROIs, connected component selection, small outline extension; source alpha retained. Requires per-frame boundary review.','maskAreas':{n:int(m.sum()) for n,m in masks.items()},'maskPaths':{n:f'masks/{k}/{n}.png' for n in masks},'requiresReview':True}
 records.append(rec);(P/'registration'/f'{k}.json').write_text(json.dumps(rec,indent=2))
 overlay=Image.new('RGBA',(W,H),'#eee9df');overlay.alpha_composite(im)
 colorlayer=np.zeros_like(a)
 for name,color in [('tank',(30,170,255)),('shorts',(180,80,245)),('nearArm',(0,210,110)),('farArm',(250,150,0)),('shoes',(255,60,180))]:
  m=masks[name];colorlayer[m,:3]=color;colorlayer[m,3]=90
 overlay.alpha_composite(Image.fromarray(colorlayer));d=ImageDraw.Draw(overlay)
 for side,color in [('near','#009652'),('far','#e98316')]:
  for chain in [[side+'Shoulder',side+'Elbow',side+'Wrist'],[side+'Hip',side+'Knee',side+'Ankle',side+'Toe']]:d.line([tuple(pts[n]) for n in chain],fill=color,width=3)
 for name,p in pts.items():
  x,y=p;d.ellipse((x-5,y-5,x+5,y+5),fill='#ffffff',outline='#003c57',width=2)
  if name in ['neck','waistLeft','waistRight']:d.text((x+6,y),name,fill='#003c57',font=F)
 d.text((12,12),f'{action} / {k} | DRAFT anchors + semantic masks',fill='#003c57',font=F)
 overlay.convert('RGB').save(P/'overlays'/f'{k}.jpg',quality=93)
 print(k,action,box,sbox,flush=True)
(P/'registration.json').write_text(json.dumps({'schema':'kling-wardrobe-anchor-research-v1','status':'draft-not-certified','character':'female','frameSize':[W,H],'groundAnchor':[352,998],'keyposes':list(K),'frames':records},indent=2))
for action,clip in manifest['animations'].items():
 ids=list(dict.fromkeys(clip['frames']));cw,ch=176,284;cols=min(8,len(ids));board=Image.new('RGB',(cw*cols,ch*math.ceil(len(ids)/cols)),'#eee9df');d=ImageDraw.Draw(board)
 for j,k in enumerate(ids):
  im=Image.open(P/'overlays'/f'{k}.jpg').resize((176,264),Image.Resampling.LANCZOS);x=j%cols*cw;y=j//cols*ch;board.paste(im,(x,y+20));d.text((x+4,y+2),f'{action} {k} / draft',fill='#003c57',font=F)
 board.save(P/f'{action}-registration-review.jpg',quality=95)

# Export the strict browser contract separately from detailed review metadata.
target=args.registration_output;target.mkdir(parents=True,exist_ok=True);pack=args.pack;config=source_config
sourceframe={f['frameId']:f['sourceFrame'] for f in config['derivation']['frames']}
def contour(mask):
 contours,_=cv2.findContours(mask.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
 if not contours:return None
 original=max(contours,key=cv2.contourArea)
 if cv2.contourArea(original)<20:return None
 epsilon=1.2;points=cv2.approxPolyDP(original,epsilon,True)
 while len(points)>64:
  epsilon+=.4;points=cv2.approxPolyDP(original,epsilon,True)
 return [{'x':int(p[0][0]),'y':int(p[0][1])} for p in points]

j=json.loads((P/'registration.json').read_text());frames=[]
ownership_corrections=json.loads((ROOT/'artwork/kling-wardrobe/registration/female/manual-ownership-corrections.json').read_text())
reviewed_tank_contours={int(k):polygon for k,polygon in ownership_corrections['garmentContours'].items()}
# Reviewer-observed drift is corrected only on frame 89; it must not change
# interpolation or any other frame's anchors. The real head boundary is kept.
for metadata in [j['frames'],records]:
 corrected=next(f for f in metadata if f['frameId']==89)
 for name,calibration in ownership_corrections['frame89']['points'].items():
  corrected['anchors'][name]=calibration['new'];corrected['anchorStatus'][name]='visually-calibrated-source89-joint-after-flow-drift'
hand_canvas=Image.new('1',(W,H));ImageDraw.Draw(hand_canvas).polygon(ownership_corrections['frame89']['handContour'],fill=1)
vest_canvas=Image.new('1',(W,H));ImageDraw.Draw(vest_canvas).polygon(reviewed_tank_contours[89],fill=1)
arm89=np.array(Image.open(P/'masks/89/nearArm.png'))>0;arm89&=~np.array(vest_canvas)
hand89=arm89&np.array(hand_canvas);alpha89=np.array(source_frames[89])[:,:,3]
for name,mask in [('nearArm',arm89),('nearHand',hand89)]:
 Image.fromarray(np.where(mask,alpha89,0).astype('uint8')).save(P/'masks/89'/f'{name}.png')
 for metadata in [j['frames'],records]:next(f for f in metadata if f['frameId']==89)['maskAreas'][name]=int(mask.sum())
(P/'registration.json').write_text(json.dumps(j,indent=2));(P/'registration/89.json').write_text(json.dumps(next(f for f in records if f['frameId']==89),indent=2))
for f in j['frames']:
 pts={}
 for name,(x,y) in f['anchors'].items():
  method=f['anchorStatus'][name]
  hidden=name.endswith('Hip') or (name=='waistLeft' and f['action']=='walk' and 38<=f['frameId']<=46) or (name.startswith('far') and f['action']=='run' and 56<=f['frameId']<=62 and name not in ['farKnee','farAnkle','farToe']) or (name in ['farKnee','farHip'] and f['frameId']==64) or (name=='farShoulder' and f['action']=='walk' and 36<=f['frameId']<=48)
  pts[name]={'x':x,'y':y,'visibility':'occluded' if hidden else 'visible','confidence':.4 if hidden else .75 if 'material' in method else .65 if 'keypose' in method else .55,'method':method+'; candidate authoring guide; not motion capture'}
  if f['frameId']==89 and name in ownership_corrections['frame89']['points']:pts[name]['confidence']=ownership_corrections['frame89']['points'][name]['confidence']
 protected=[]
 for label,maskname in [('head','headNeck'),('nearHand','nearHand'),('farHand','farHand')]:
  m=np.asarray(Image.open(P/'masks'/str(f['frameId'])/f'{maskname}.png'))>0;poly=contour(m)
  if poly:protected.append({'label':label,'polygon':poly})
 frames.append({'frameId':f['frameId'],'sourceFrame':sourceframe[f['frameId']],'points':pts,'protected':protected})
result={'format':'gathria-wardrobe-registration','version':1,'sourceSha256':hashlib.sha256(pack.read_bytes()).hexdigest(),'characterId':config['characterId'],'frameWidth':704,'frameHeight':1056,'anchor':{'x':352,'y':998},'frames':frames}
(target/'registration.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
print(target/'registration.json');print(len(frames),'frames',len((target/'registration.json').read_bytes()),'bytes')

# FINAL_SEMANTIC_CLEANUP_START
# Match the renderer's exact pixel-centre protection. Teeth/eye whites may
# resemble cloth colors, but they remain owned by the protected source head.
from kling_wardrobe_common import protected_mask
cleanup_counts={};shoe_cleanup_counts={};tank_hole_counts={};tank_contour_counts={};shoe_review_images={}
# Source-local ownership corrections, reviewed against the visible shoe/ankle
# contours. These are segmentation guides, not replacement character artwork.
# Pale pink heels fail the original near-white test; strongly warm/blurred
# soles need these five explicit silhouettes rather than a global skin rule.
shoe_completion_polygons={
 50:[[(294,879),(295,888),(301,895),(312,899),(326,902),(338,898),(350,893),(361,891),(371,894),(377,913),(398,929),(417,945),(418,971),(383,980),(314,976),(265,963),(259,950),(265,930),(271,915),(270,902),(277,886)]],
 55:[[(264,790),(277,806),(291,827),(295,836),(285,852),(279,872),(278,904),(265,902),(248,884),(242,857),(249,829)]],
 56:[[(349,848),(365,856),(386,863),(386,883),(399,918),(394,937),(378,943),(357,936),(339,923),(327,904),(320,885),(329,866)]],
 57:[[(381,817),(383,831),(391,843),(410,849),(430,845),(435,861),(450,877),(479,893),(493,916),(489,932),(463,937),(435,927),(408,910),(385,890),(359,877),(349,863),(350,839),(363,824)]],
 64:[[(287,805),(292,825),(294,840),(306,852),(331,857),(355,855),(378,846),(392,837),(391,852),(380,870),(363,888),(363,904),(381,922),(395,939),(401,954),(397,978),(233,978),(233,939),(246,914),(258,893),(256,866),(250,846),(251,829),(265,815)]]}
# Eight reviewed warm/blurred vest contours repair garment ownership.
# Protected original skin is retained; no source drawing is synthesized.
tank_completion_polygons={k:[polygon] for k,polygon in reviewed_tank_contours.items()}
research_by_id={f['frameId']:f for f in records}
for final_frame in result['frames']:
 k=final_frame['frameId'];head_only={'protected':[region for region in final_frame['protected'] if region['label']=='head']};protected_head=protected_mask(head_only)
 path=P/'masks'/str(k)/'tank.png';old=np.array(Image.open(path));new=old.copy();new[protected_head]=0
 cleanup_counts[str(k)]=int(((old>0)&(new==0)).sum());Image.fromarray(new).save(path)
 research_by_id[k]['maskAreas']['tank']=int((new>0).sum())
 (P/'registration'/f'{k}.json').write_text(json.dumps(research_by_id[k],indent=2))
 im=source_frames[k];a=np.array(im);action=actions[k];pts={name:[point['x'],point['y']] for name,point in final_frame['points'].items()}
 masks={name:np.array(Image.open(P/'masks'/str(k)/f'{name}.png'))>0 for name in research_by_id[k]['maskPaths']}
 r,g,b=a[:,:,:3].astype('int16').transpose(2,0,1);fg=a[:,:,3]>0
 old_shoes=masks['shoes'].copy()
 pale=fg&(r>135)&(g>115)&(b>115)&(g-b<18)&(r-b<80)&(abs(r-g)<75)
 candidates=pale&ndi.binary_dilation(old_shoes,iterations=22)
 components,_=ndi.label(candidates|old_shoes);ids=np.unique(components[old_shoes]);completed_shoes=np.isin(components,ids[ids>0])
 for polygon in shoe_completion_polygons.get(k,[]):
  canvas=Image.new('1',(W,H));ImageDraw.Draw(canvas).polygon(polygon,fill=1);completed_shoes|=np.array(canvas)&fg
 completed_shoes&=~protected_mask(final_frame)&~masks['tank']&~masks['shorts']
 masks['shoes']=completed_shoes;shoe_cleanup_counts[str(k)]=int((completed_shoes&~old_shoes).sum())
 yy,xx=np.mgrid[:H,:W];near_distance=np.hypot(xx-pts['nearAnkle'][0],yy-pts['nearAnkle'][1]);far_distance=np.hypot(xx-pts['farAnkle'][0],yy-pts['farAnkle'][1])
 masks['nearShoe']=completed_shoes&(near_distance<=far_distance);masks['farShoe']=completed_shoes&(near_distance>far_distance)
 masks['skin']&=~completed_shoes
 # Only small, enclosed, cloth-colored holes may change ownership. Foreground
 # arms/hands and the exact protected head remain excluded, even across a vest.
 holes=ndi.binary_fill_holes(masks['tank'])&~masks['tank'];hole_labels,_=ndi.label(holes);sizes=np.bincount(hole_labels.ravel());small_ids=np.where((sizes>0)&(sizes<=1000))[0];small_ids=small_ids[small_ids>0]
 fill=np.isin(hole_labels,small_ids)&fg&(r-g<38)&(g-b<30)&~protected_mask(final_frame)&~masks['nearArm']&~masks['farArm']&~masks['headNeck']&~masks['shorts']
 masks['tank']|=fill;masks['skin']&=~fill;tank_hole_counts[str(k)]=int(fill.sum())
 contour_fill=np.zeros((H,W),bool)
 for polygon in tank_completion_polygons.get(k,[]):
  canvas=Image.new('1',(W,H));ImageDraw.Draw(canvas).polygon(polygon,fill=1);contour_fill|=np.array(canvas)&fg
 # These source-reviewed contours are authoritative garment ownership,
 # unlike an inferred arm-color component. Preserve actual protected skin,
 # remove cloth fragments accidentally claimed by an arm/head semantic mask.
 contour_fill&=~protected_mask(final_frame)&~masks['shorts']
 tank_contour_counts[str(k)]=int((contour_fill&~masks['tank']).sum());masks['tank']|=contour_fill
 for name in ['skin','nearArm','farArm','nearHand','farHand','headNeck']:masks[name]&=~contour_fill
 if k in [50,51,55,56,57,64]:
  sy,sx=np.where(completed_shoes);box=(max(0,sx.min()-10),max(0,sy.min()-35),min(W,sx.max()+10),min(H,sy.max()+15));shoe_review_images[k]=[]
  for diagnostic_mask in [old_shoes,completed_shoes]:
   diagnostic=a.copy();diagnostic[diagnostic_mask,:3]=[125,60,35];crop=Image.fromarray(diagnostic).crop(box);crop.thumbnail((300,260));tile=Image.new('RGBA',(300,270),'#eee9df');tile.alpha_composite(crop,((300-crop.width)//2,(270-crop.height)//2));shoe_review_images[k].append(tile.convert('RGB'))
 for name in ['shoes','nearShoe','farShoe','skin','tank','nearArm','farArm','nearHand','farHand','headNeck']:
  Image.fromarray(np.where(masks[name],a[:,:,3],0).astype('uint8')).save(P/'masks'/str(k)/f'{name}.png');research_by_id[k]['maskAreas'][name]=int(masks[name].sum())
 (P/'registration'/f'{k}.json').write_text(json.dumps(research_by_id[k],indent=2))
 overlay=Image.new('RGBA',(W,H),'#eee9df');overlay.alpha_composite(im)
 colorlayer=np.zeros_like(a)
 for name,color in [('tank',(30,170,255)),('shorts',(180,80,245)),('nearArm',(0,210,110)),('farArm',(250,150,0)),('shoes',(255,60,180))]:
  m=masks[name];colorlayer[m,:3]=color;colorlayer[m,3]=90
 overlay.alpha_composite(Image.fromarray(colorlayer));d=ImageDraw.Draw(overlay)
 for side,color in [('near','#009652'),('far','#e98316')]:
  for chain in [[side+'Shoulder',side+'Elbow',side+'Wrist'],[side+'Hip',side+'Knee',side+'Ankle',side+'Toe']]:d.line([tuple(pts[n]) for n in chain],fill=color,width=3)
 for name,p in pts.items():
  x,y=p;d.ellipse((x-5,y-5,x+5,y+5),fill='#ffffff',outline='#003c57',width=2)
  if name in ['neck','waistLeft','waistRight']:d.text((x+6,y),name,fill='#003c57',font=F)
 d.text((12,12),f'{action} / {k} | DRAFT anchors + semantic masks',fill='#003c57',font=F)
 overlay.convert('RGB').save(P/'overlays'/f'{k}.jpg',quality=93)
research=json.loads((P/'registration.json').read_text());research['frames']=records;(P/'registration.json').write_text(json.dumps(research,indent=2))
(target/'semantic-cleanup.json').write_text(json.dumps({'method':'exact protected-head subtraction; shoe-local pale-pink completion plus five reviewed warm-sole contours; small enclosed cloth-colored tank holes and source-reviewed warm-vest contours excluding arms and protected regions','registrationSha256':hashlib.sha256((target/'registration.json').read_bytes()).hexdigest(),'removedPixelsByFrame':cleanup_counts,'totalRemovedPixels':sum(cleanup_counts.values()),'shoeAddedPixelsByFrame':shoe_cleanup_counts,'shoeTotalAddedPixels':sum(shoe_cleanup_counts.values()),'manualShoeContourFrames':list(shoe_completion_polygons),'tankHolePixelsByFrame':tank_hole_counts,'tankTotalHolePixels':sum(tank_hole_counts.values()),'manualTankContourFrames':list(tank_completion_polygons),'tankContourAddedPixelsByFrame':tank_contour_counts,'sourceArtworkUnchanged':True,'registrationUnchangedDuringSemanticCleanup':True},indent=2)+'\n')
for action,clip in manifest['animations'].items():
 ids=list(dict.fromkeys(clip['frames']));cw,ch=176,284;cols=min(8,len(ids));board=Image.new('RGB',(cw*cols,ch*math.ceil(len(ids)/cols)),'#eee9df');d=ImageDraw.Draw(board)
 for j,k in enumerate(ids):
  im=Image.open(P/'overlays'/f'{k}.jpg').resize((176,264),Image.Resampling.LANCZOS);x=j%cols*cw;y=j//cols*ch;board.paste(im,(x,y+20));d.text((x+4,y+2),f'{action} {k} / draft',fill='#003c57',font=F)
 board.save(P/f'{action}-registration-review.jpg',quality=95)

# FINAL_SEMANTIC_CLEANUP_END
review=target/'review';review.mkdir(exist_ok=True)
shoe_board=Image.new('RGB',(1800,600),'#eee9df');shoe_draw=ImageDraw.Draw(shoe_board)
for j,k in enumerate([50,51,55,56,57,64]):
 for row,tile in enumerate(shoe_review_images[k]):
  shoe_board.paste(tile,(j*300,row*300+25));shoe_draw.text((j*300+4,row*300+6),f'{k} / '+('before' if row==0 else 'after'),fill='black')
shoe_board.save(review/'shoe-ownership-comparison.jpg',quality=95)
for action in manifest['animations']:
 shutil.copyfile(P/f'{action}-registration-review.jpg',review/f'{action}-registration-review.jpg')
for frame_id in [0,40,58,75,95,105]:
 shutil.copyfile(P/'overlays'/f'{frame_id}.jpg',review/f'frame-{frame_id}.jpg')
summary={'sourceSha256':hashlib.sha256(pack.read_bytes()).hexdigest(),'registrationSha256':hashlib.sha256((target/'registration.json').read_bytes()).hexdigest(),'frames':len(records),'landmarkCount':17,'manuallyPlacedKeyposeIds':list(K),'postFlowCalibrations':ownership_corrections['frame89']['points'],'reviewStatus':'candidate registration; contact sheets reviewed; detailed hand boundaries and flow-proposed limb landmarks still require garment-specific verification','limitations':['Source has near/far occlusion and view changes; hidden joint coordinates are inferred.','Garment masks are color/region-derived and include antialias edge estimates, not original authoring layers.','Some source jump/run frames already contain motion blur and green fringe.','No new body artwork or clothing is generated by this script.']}
(target/'review-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
