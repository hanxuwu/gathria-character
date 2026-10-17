"""Decode delivered media and verify exact frozen V6 pixels, motion layout and timing."""
from pathlib import Path
from io import BytesIO
import hashlib,json,subprocess,zipfile
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'docs/running-v2';B=ROOT/'docs/running-baseline'
sha=lambda data:hashlib.sha256(data).hexdigest()
index=json.loads((D/'evidence-index.json').read_text());baseline=json.loads((B/'baseline-index.json').read_text())
assert index['artworkVersion']==6 and index['motionVersion']==2
assert len(index['exports'])==10 and len(index['playback'])==4
assert index['legacyPackRunUnavailable'] is True
assert not any(index[key] for key in ('errors','external','forbidden'))
for file,digest in index['revisionFiles'].items():assert sha((ROOT/file).read_bytes())==digest,file
for file,digest in baseline['frozenFiles'].items():assert sha((ROOT/file).read_bytes())==digest,file
prior=json.loads((ROOT/'docs/running/evidence-index.json').read_text())
for file in ('src/core/running-rig.ts','src/core/generator-motion-v1.ts'):
 assert sha((ROOT/file).read_bytes())==prior['revisionFiles'][file],file
pngs=[]
for path in sorted(D.rglob('*.png')):
 assert path.stat().st_size>0
 with Image.open(path) as im:
  assert im.format=='PNG';im.load();pngs.append(dict(file=str(path.relative_to(D)),size=im.size,bytes=path.stat().st_size,sha256=sha(path.read_bytes())))
archives=[]
for item in index['exports']:
 name=item['id'];path=D/(name+'.character.zip');assert path.stat().st_size>0
 assert sha(path.read_bytes())==item['zipSha256'],name
 assert item['legacyRowsVerified'] and item['roundTripVerified'] and item['exportedRgbaVerified'] and item['motion1RowsVerified']
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None,name
  assert set(z.namelist())=={'spritesheet.png','manifest.json','character.json','INTEGRATION.md','PROVENANCE.txt'}
  for member in z.namelist():assert z.read(member)==(D/name/member).read_bytes() and len(z.read(member))>0,(name,member)
  config=json.loads(z.read('character.json'));assert config==item['config'];assert config['artworkVersion']==6 and config['motionVersion']==2
  m=json.loads(z.read('manifest.json'));assert m['schemaVersion']==1
  assert m['generator']=='gathria-polished-pixels-v6-motion-v2'
  assert m['anchor']=={'x':96,'y':240,'units':'pixels','origin':'top-left'}
  assert m['facing']=={'native':'right','right':'none','left':'mirror-x'}
  assert m['spritesheet']=={'file':'spritesheet.png','width':1536,'height':1024,'frameWidth':192,'frameHeight':256,'columns':8,'rows':4}
  assert [f['id'] for f in m['frames']]==list(range(24))
  assert m['animations']['run']=={'frames':list(range(12,24)),'fps':18,'loop':True}
  assert m['animations']['walk']=={'frames':list(range(4,12)),'fps':10,'loop':True}
  assert m['animations']['idle']=={'frames':[0,0,1,1,2,2,2,2,3,3,0,0],'fps':4,'loop':True}
  with Image.open(BytesIO(z.read('spritesheet.png'))) as im:
   im.load();assert im.size==(1536,1024) and im.mode=='RGBA';rgba=np.array(im)
  assert set(np.unique(rgba[:,:,3]))=={0,255},name
  frame_records=[]
  for f in m['frames']:
   assert f['width']==192 and f['height']==256
   assert 0<=f['x']<=1536-192 and 0<=f['y']<=1024-256
   a=rgba[f['y']:f['y']+256,f['x']:f['x']+192,3];ys,xs=np.nonzero(a)
   assert len(xs)>3000 and 0<xs.min()<xs.max()<191 and 0<ys.min()<=ys.max()<255,(name,f['id'],'empty or clipped frame')
   frame_records.append(dict(id=f['id'],bounds=[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]))
  # Atlas blanks are transparent; there are no accidental hidden painted cells.
  assert not rgba[0:256,4*192:,:].any()
  assert not rgba[768:1024,4*192:,:].any()
  baseline_verified=False
  if name.endswith('-joyful'):
   who=name.split('-')[0]
   with Image.open(B/who/'spritesheet.png') as old:assert np.array_equal(rgba[:512],np.array(old.convert('RGBA')))
   assert item['baselineVerified'] and item['motion1HistoricalVerified'];baseline_verified=True
  archives.append(dict(file=path.name,bytes=path.stat().st_size,sha256=sha(path.read_bytes()),frames=24,idleMs=3000,walkMs=800,runMs=12000/18,frozenV6Verified=baseline_verified,bounds=frame_records))
# Decode every historical iteration archive too, but do not mistake it for final art.
iterations=[]
for path in sorted((D/'iterations').rglob('*.character.zip')):
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  with Image.open(BytesIO(z.read('spritesheet.png'))) as im:im.load();assert im.size==(1536,1024)
 iterations.append(dict(file=str(path.relative_to(D)),bytes=path.stat().st_size,sha256=sha(path.read_bytes())))
gifs=[];timelines={x['file']:x for x in json.loads((D/'preview-timelines.json').read_text())}
for path in sorted(D.rglob('*.gif')):
 assert path.stat().st_size>0;durations=[];hashes=[]
 with Image.open(path) as im:
  assert im.info['loop']==0
  for i in range(im.n_frames):im.seek(i);im.load();durations.append(im.info['duration']);hashes.append(sha(im.convert('RGB').tobytes()))
  if path.parent==D:
   expected=timelines[path.name];assert durations==expected['frameDurationsMs'];assert im.n_frames==expected['decodedFrames']
   assert abs(sum(durations)-expected['unquantizedDurationMs'])<=5.001
   assert hashes==expected['decodedFrameSha256']
   if path.name!='action-switch.gif':
    assert im.n_frames<=12 and len(set(hashes))>=6 and sum(durations)==670
  gifs.append(dict(file=str(path.relative_to(D)),bytes=path.stat().st_size,sha256=sha(path.read_bytes()),decodedFrames=im.n_frames,uniqueFrames=len(set(hashes)),durationMs=sum(durations),frameDurationsMs=durations))
for who in ('dress','suit'):assert (ROOT/'public/samples/running-v2'/(who+'.character.zip')).read_bytes()==(D/(who+'-joyful.character.zip')).read_bytes()
for case in index['playback']:
 expected={'idle':list(range(4)),'walk':list(range(4,12)),'run':list(range(12,24))}[case['animation']]
 assert case['pixelVerifiedFrames']==expected
 assert len(case['transitions'])>=len(expected)
video=D/'independent-player.webm';assert video.stat().st_size>0
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,width,height','-of','json',str(video)]))
assert float(probe['format']['duration'])>8
subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(video),'-f','null','-'],check=True)
result=dict(pngs=pngs,archives=archives,iterationArchives=iterations,gifs=gifs,browserPlaybackCases=len(index['playback']),independentVideo=dict(file=video.name,bytes=video.stat().st_size,sha256=sha(video.read_bytes()),**probe),frozenV6SourceHashes='verified',frozenV6IdleWalkPixels='exactly preserved',deliveredMotion1Pixels='reproduced in browser and original sources unchanged',gifTiming='10 ms cumulative quantization; 670 ms run GIF vs 666.67 ms exported run clip')
(D/'file-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'Decoded {len(pngs)} PNGs, {len(archives)} final ZIPs, {len(iterations)} iteration ZIPs, {len(gifs)} GIFs and full consumer video; V6 baseline pixels, transparency, frame layout and timing verified.')
