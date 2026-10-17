"""Decode final deliverables and prove motion-only compatibility against frozen real exports."""
from pathlib import Path
from io import BytesIO
import hashlib,json,subprocess,zipfile
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'docs/run-connections'
sha=lambda data:hashlib.sha256(data).hexdigest()
frozen=json.loads((D/'before/frozen-source-hashes.json').read_text())
for path,digest in frozen['frozenFiles'].items():assert sha((ROOT/path).read_bytes())==digest,path
stages=[stage for stage in ('before','after','regressions') if (D/stage/'exports-validation.json').exists()]
assert stages, 'Capture actual browser exports first.'
archives=[];pngs=[];gifs=[];before={};invariants=[]
for stage in stages:
 index=json.loads((D/stage/'exports-validation.json').read_text());assert len(index['exports'])==4
 if stage in ('after','regressions'):
  for file,digest in index['revisionFiles'].items():assert sha((ROOT/file).read_bytes())==digest,file
 for item in index['exports']:
  name=item['id'];path=D/stage/(name+'.character.zip');assert path.stat().st_size>0
  assert sha(path.read_bytes())==item['zipSha256']
  assert item['legacyRowsVerified'] and item['motion1RowsVerified'] and item['roundTripVerified'] and item['exportedRgbaVerified']
  with zipfile.ZipFile(path) as z:
   assert z.testzip() is None
   assert set(z.namelist())=={'spritesheet.png','manifest.json','character.json','INTEGRATION.md','PROVENANCE.txt'}
   for member in z.namelist():assert len(z.read(member))>0 and z.read(member)==(D/stage/name/member).read_bytes()
   config=json.loads(z.read('character.json'));assert config==item['config'];assert config['artworkVersion']==6
   assert config['motionVersion']==(2 if stage=='before' else 3)
   assert config['hairAccessory']=='none' or (stage=='regressions' and name=='wedding-dress' and config['hairAccessory']=='flowers')
   m=json.loads(z.read('manifest.json'));assert m['schemaVersion']==1
   assert m['generator']==f"gathria-polished-pixels-v6-motion-v{config['motionVersion']}"
   assert m['anchor']=={'x':96,'y':240,'units':'pixels','origin':'top-left'}
   assert m['facing']=={'native':'right','right':'none','left':'mirror-x'}
   assert m['spritesheet']=={'file':'spritesheet.png','width':1536,'height':1024,'frameWidth':192,'frameHeight':256,'columns':8,'rows':4}
   assert [f['id'] for f in m['frames']]==list(range(24))
   assert m['animations']['run']=={'frames':list(range(12,24)),'fps':18,'loop':True}
   assert m['animations']['walk']=={'frames':list(range(4,12)),'fps':10,'loop':True}
   assert m['animations']['idle']=={'frames':[0,0,1,1,2,2,2,2,3,3,0,0],'fps':4,'loop':True}
   with Image.open(BytesIO(z.read('spritesheet.png'))) as im:im.load();assert im.mode=='RGBA' and im.size==(1536,1024);rgba=np.array(im)
   assert set(np.unique(rgba[:,:,3]))=={0,255}
   bounds=[]
   for f in m['frames']:
    assert f['width']==192 and f['height']==256
    assert 0<=f['x']<=1344 and 0<=f['y']<=768
    a=rgba[f['y']:f['y']+256,f['x']:f['x']+192,3];ys,xs=np.nonzero(a)
    assert len(xs)>3000 and 0<xs.min()<xs.max()<191 and 0<ys.min()<ys.max()<255,(stage,name,f['id'],'empty/clipped')
    bounds.append(dict(id=f['id'],bounds=[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]))
   assert not rgba[:256,4*192:,:].any() and not rgba[768:,4*192:,:].any()
   if stage=='before':before[name]=(config,rgba,m)
   elif stage=='after':
    original,oldpixels,oldmanifest=before[name];assert {**config,'motionVersion':2}==original
    assert item['motion2RowsVerified'] and item['matchedBeforeConfig']
    assert np.array_equal(rgba[:512],oldpixels[:512]),name+': idle/walk regressed'
    assert m['animations']==oldmanifest['animations'] and m['frames']==oldmanifest['frames']
    assert not np.array_equal(rgba[512:],oldpixels[512:]),name+': claimed repair has no pixel changes'
    with Image.open(D/'iterations/02'/name/'spritesheet.png') as candidate:
     candidate.load();assert np.array_equal(rgba,np.array(candidate)),name+': final differs from reviewed iteration02'
    upper=[]
    for f in m['frames'][12:]:
     x,y=f['x'],f['y'];changed=int(np.count_nonzero(np.any(rgba[y:y+111,x:x+192]!=oldpixels[y:y+111,x:x+192],axis=2)))
     assert changed==0,(name,f['id'],'head/neck changed')
     upper.append(dict(frame=f['id'],changedUpper111Pixels=changed))
    invariants.append(dict(id=name,finalRgbaEqualsReviewedIteration02=True,idleWalkRgbaEqualsBefore=True,upper111PixelsPerRunFrame=upper))
   elif stage=='regressions':
    assert item['representativeRegression'] and item['motion2RowsVerified']
   archives.append(dict(file=str(path.relative_to(D)),bytes=path.stat().st_size,sha256=sha(path.read_bytes()),frames=24,runMs=12000/18,frameBounds=bounds))
iterations=[]
for path in sorted((D/'iterations').rglob('*.character.zip')):
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  for member in z.namelist():assert z.read(member)==(path.with_name(path.name.removesuffix('.character.zip'))/member).read_bytes()
  config=json.loads(z.read('character.json'));assert config['artworkVersion']==6 and config['motionVersion']==3
  m=json.loads(z.read('manifest.json'));assert m['animations']['run']=={'frames':list(range(12,24)),'fps':18,'loop':True}
  with Image.open(BytesIO(z.read('spritesheet.png'))) as im:im.load();assert im.mode=='RGBA' and im.size==(1536,1024)
 iterations.append(dict(file=str(path.relative_to(D)),bytes=path.stat().st_size,sha256=sha(path.read_bytes())))
if 'after' in stages:
 for item in json.loads((D/'after/exports-validation.json').read_text())['exports']:
  assert (ROOT/'public/samples/run-connections'/(item['id']+'.character.zip')).read_bytes()==(D/'after'/(item['id']+'.character.zip')).read_bytes()
for path in sorted(D.rglob('*.png')):
 assert path.stat().st_size>0
 with Image.open(path) as im:assert im.format=='PNG';im.load();pngs.append(dict(file=str(path.relative_to(D)),size=im.size,bytes=path.stat().st_size,sha256=sha(path.read_bytes())))
timelines={x['file']:x for x in json.loads((D/'preview-timelines.json').read_text())}
for path in sorted(D.rglob('*.gif')):
 durations=[];hashes=[]
 with Image.open(path) as im:
  assert im.info['loop']==0
  for i in range(im.n_frames):im.seek(i);im.load();durations.append(im.info['duration']);hashes.append(sha(im.convert('RGB').tobytes()))
  key=str(path.relative_to(D));expected=timelines[key]
  assert durations==expected['frameDurationsMs'] and hashes==expected['decodedFrameSha256']
  assert im.n_frames==expected['decodedFrames']==12 and len(set(hashes))==12
  assert sum(durations)==670 and abs(sum(durations)-expected['unquantizedDurationMs'])<=5.001
  gifs.append(dict(file=key,bytes=path.stat().st_size,sha256=sha(path.read_bytes()),frames=im.n_frames,durationMs=sum(durations),frameDurationsMs=durations))
result=dict(baseCommit=frozen['baseCommit'],historicalSourceFilesVerified=len(frozen['frozenFiles']),stages=stages,pngs=pngs,archives=archives,iterationArchives=iterations,gifs=gifs,frozenV6IdleWalkPixels='exactly equal in before/after' if 'after' in stages else 'baseline captured',gifTiming='670 ms GIF cumulative centisecond rounding; CharacterPack unchanged 18 fps / 666.67 ms')
playback=D/'after/evidence-index.json'
if playback.exists():
 index=json.loads(playback.read_text());assert index['artworkVersion']==6 and index['motionVersion']==3
 assert len(index['playback'])==8 and len(index['exports'])==4
 assert not any(index[key] for key in ('errors','external','forbidden'))
 assert index['legacyPackRunUnavailable'] is True
 for case in index['playback']:
  assert case['animation']=='run' and case['facing'] in ('left','right')
  assert case['pixelVerifiedFrames']==list(range(12,24)) and len(case['transitions'])>=12
 video=D/'after/independent-player.webm';assert video.stat().st_size>0
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,width,height','-of','json',str(video)]))
 assert float(probe['format']['duration'])>16
 subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(video),'-f','null','-'],check=True)
 result.update(browserPlaybackCases=8,independentVideo=dict(file=str(video.relative_to(D)),bytes=video.stat().st_size,sha256=sha(video.read_bytes()),**probe))
if invariants:(D/'after/visual-invariants.json').write_text(json.dumps(invariants,indent=2)+'\n')
(D/'file-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(f"Decoded {len(pngs)} PNGs, {len(archives)} main/regression ZIPs + {len(iterations)} iteration ZIPs, {len(gifs)} GIFs; {len(frozen['frozenFiles'])} historical files intact; {result.get('browserPlaybackCases',0)} independent run playback cases.")
