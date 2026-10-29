import sys,json,copy,hashlib
from pathlib import Path
import numpy as np
from scipy.spatial import ConvexHull
from scipy import ndimage as ndi
sys.path.insert(0,str(Path.cwd()/'scripts'))
from kling_side_authoring import load_context,runtime_polygon_mask
c=load_context('male');out=Path('artwork/kling-side-expansion/templates/source-review/male-hands')
# Native source-visible hand review windows. These are individual reviewed poses,
# not interpolated anatomy. Bounds include conservative wrist/ink-edge margins.
boxes={
21:([270,515,332,574],[152,518,192,565]),22:([270,513,337,571],[151,518,194,563]),23:([270,514,335,571],[159,526,195,566]),
24:([249,529,319,584],None),25:([224,531,301,583],None),26:([205,534,279,587],None),27:([184,533,250,590],[301,532,340,585]),
28:([159,532,226,587],[316,522,376,580]),29:([141,527,208,585],[310,510,375,568]),30:([128,518,195,578],[322,495,384,556]),
31:([126,515,195,576],[317,490,396,550]),32:([128,525,197,586],[321,502,379,559]),33:([139,537,208,594],[308,526,374,585]),
34:([158,535,228,596],[300,537,346,596]),35:([184,535,252,592],None),36:([216,535,293,592],None),37:([229,520,304,581],None),38:([246,512,324,575],[159,511,193,557]),
39:([221,495,288,558],[276,503,326,568]),40:([247,480,314,545],None),41:([262,462,330,525],None),42:([266,441,335,508],[172,484,196,525]),
43:([269,433,343,498],[167,478,197,521]),44:([272,442,342,507],None),45:([272,465,338,530],None),46:([267,489,328,554],[291,518,329,569]),
47:([226,502,295,566],[284,500,346,568]),48:([204,506,264,567],[312,483,365,550]),49:([161,496,229,558],[320,459,384,528]),
50:([135,488,201,555],[320,442,386,510]),51:([124,474,196,535],[319,420,388,490]),52:([118,475,188,537],[322,423,388,490]),
53:([118,482,188,543],[319,434,389,499]),54:([134,505,203,565],[313,461,384,529]),55:([166,514,228,562],[310,495,365,550]),56:([207,510,274,567],[296,513,350,572]),
57:([287,473,357,539],None),58:([265,521,329,578],None),59:([273,495,343,562],None),60:([311,441,375,509],[173,488,203,528]),
61:([331,400,406,472],[122,477,199,538]),62:([364,410,422,475],[95,451,164,513]),63:([385,416,438,479],[97,433,170,495]),
64:([99,429,171,492],[384,434,438,496]),65:([99,423,172,488],[378,440,438,506]),66:([100,430,173,496],[381,447,438,514]),
67:([102,464,170,524],[369,444,430,508]),68:([134,454,208,519],[331,432,406,501]),69:([145,414,220,482],[323,414,390,480]),
70:([142,379,213,450],[317,382,381,451]),71:([134,355,210,421],[310,347,378,414]),72:([122,323,200,392],[324,316,381,381]),
73:([109,318,186,385],[319,288,386,353]),74:([101,305,169,370],[323,267,398,344]),75:([79,287,157,360],[333,258,402,333]),
76:([74,300,159,361],[345,282,415,347]),77:([78,328,150,378],[352,317,424,377]),78:([91,367,165,421],[368,360,438,422]),
79:([95,415,168,493],[390,426,461,494]),80:([90,477,170,551],[385,498,459,567]),81:([127,528,203,592],[374,527,446,600]),
82:([153,528,222,596],[366,530,440,604]),83:([171,509,245,582],[345,525,420,596]),84:([191,510,270,582],[326,519,400,594]),
85:([180,500,257,572],[317,514,396,589]),86:([200,493,276,570],[320,507,400,584]),87:([202,482,282,559],[319,499,401,576]),
88:([202,481,281,558],[319,497,403,574]),89:([186,464,264,540],[312,475,391,553]),90:([173,458,253,539],[317,441,402,519]),
91:([159,405,239,485],[316,380,399,473]),92:([155,381,236,461],[317,365,399,447]),93:([139,362,217,431],[300,360,378,427]),
94:([133,344,214,418],[307,347,388,426]),95:([122,320,201,400],[314,330,397,407]),96:([112,301,192,381],[320,326,404,402]),
97:([108,321,178,369],[342,296,421,374]),98:([101,294,181,368],[362,298,441,375]),99:([104,302,183,377],[344,304,422,382]),
100:([117,324,198,401],[345,327,424,408]),101:([113,389,190,464],[354,392,430,467]),102:([138,499,217,566],[360,473,447,552]),
103:([182,524,264,596],[347,517,427,595]),104:([201,521,284,594],[328,517,405,598]),105:([195,521,280,596],[331,515,406,591]),106:([197,512,282,586],[331,506,407,585]),
}
proposals=[]
for fid,pair in boxes.items():
 for side,b in zip(['near','far'],pair):
  original=c.registered[fid];meta=c.frame_metadata(fid)
  item={'frameId':fid,'sourceFrame':meta['sourceFrame'],'sourceRgbaSha256':meta['sourceRgbaSha256'],'label':side+'Hand','manualNativeWindow':b,'reviewEvidence':f'male-{meta["action"]}-grid-{(meta["position"]//8)*8:02}.jpg','reason':'Native source hand and conservative wrist margin reviewed individually; replace displaced or incomplete moving-hand protection. Source pixels, limb silhouette and occluded anatomy are not redrawn.'}
  if b is None:
   item['polygon']=None;item['reason']='Native source review shows this far hand fully hidden behind the torso/near arm in this pose; omit the misplaced skin component rather than protecting the thigh.'
   item['pointUpdates']={side+'Wrist':{'visibility':'occluded','confidence':0.25,'method':'native source review: hand hidden behind torso/near arm; position retained as uncertain attachment estimate'}}
  else:
   x0,y0,x1,y1=b;roi=np.zeros((768,512),bool);roi[max(0,y0):min(768,y1),max(0,x0):min(512,x1)]=True
   # A reviewed source window disambiguates the actual hand from nearby thigh.
   seed=c.masks(fid)['skin'] & roi
   labels,n=ndi.label(seed);sizes=np.bincount(labels.ravel());sizes[0]=0
   if not sizes.max():raise ValueError((fid,side,'no observed warm skin'))
   seed=labels==sizes.argmax()
   # Include pale highlights, outline and source antialiasing near that observed hand;
   # the manual window remains an explicit limit, not automatic anatomical inference.
   mask=ndi.binary_dilation(ndi.binary_fill_holes(seed),iterations=5)&roi&(c.frames[fid][:,:,3]>0)
   yy,xx=np.where(mask);xy=np.column_stack((xx,yy));corners=np.vstack([xy+[dx,dy] for dx,dy in [(0,0),(1,0),(0,1),(1,1)]])
   hull=ConvexHull(corners);poly=corners[hull.vertices]
   assert len(poly)<=64
   item['polygon']=[{'x':int(p[0]),'y':int(p[1])} for p in poly]
   # Keep original visible guides already inside the reviewed actual hand;
   # only displaced guides receive a source-contour attachment proposal.
   old_wrist=original['points'][side+'Wrist'];covered=runtime_polygon_mask(item['polygon'])
   wx,wy=int(round(old_wrist['x'])),int(round(old_wrist['y']))
   if old_wrist['visibility']=='visible' and covered[min(767,max(0,wy)),min(511,max(0,wx))]:
    item['pointUpdates']={}
   else:
    elbow=original['points'][side+'Elbow'];e=np.array([elbow['x'],elbow['y']]);xy=np.array([[p['x'],p['y']] for p in item['polygon']],float)
    candidates=[]
    for a,b in zip(xy,np.roll(xy,-1,axis=0)):
     v=b-a;t=np.clip(np.dot(e-a,v)/max(1,float(np.dot(v,v))),0,1);q=a+t*v;candidates.append(q)
    q=min(candidates,key=lambda q:float(np.sum((q-e)**2)))
    item['pointUpdates']={side+'Wrist':{'x':round(float(q[0]),1),'y':round(float(q[1]),1),'visibility':'visible','confidence':0.55,'method':'native hand window reviewed; proximal contour attachment proposal for displaced original guide, not an anatomical joint center'}}
  proposals.append(item)
# Source-reviewed concave contact boundaries supersede convex bridge regions.
# Keep the reviewed wrist metadata: these refinements change only protection.
for refinement_path in [out/'concave-refinements.json',out.parent/'qa-male-hand-refinement.json',out.parent/'qa-male-run-boundary-refinement.json']:
 if refinement_path.exists():
  for refinement in json.loads(refinement_path.read_bytes()):
   item=next(p for p in proposals if (p['frameId'],p['label'])==(refinement['frameId'],refinement['label']))
   item['polygon']=refinement['polygon'];item['reason']=refinement['reason'];item['contactBoundaryRefinement']=refinement
data={'format':'gathria-side-source-protection-review','version':1,'identity':'male','sourceSha256':c.source_sha256,'originalRegistrationSha256':c.registration_sha256,'status':'reviewed native source and after overlays; conservative wrist margins','method':'Native-source visual windows per moving frame with conservative source ink guards; explicit reviewed concave contact contours override36 convex bridges through tank, elbow or thigh. Existing idle polygons and reviewed wrist guides remain unchanged. Hand/forearm junctions are not anatomical joint measurements.','reviewedFrameIds':list(range(107)),'changes':proposals}
(out/'proposals.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(len(proposals),'proposals')
