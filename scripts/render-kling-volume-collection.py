#!/usr/bin/env python3
"""Validate native app exports, then create review images only from those exports."""
from pathlib import Path
import argparse, importlib.util, io, json, zipfile
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'docs/kling-collection/volume-v1'
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
helper=module('casual_review_helper',ROOT/'scripts/render-kling-appearance-review.py')
stability=module('casual_protection',ROOT/'scripts/render-kling-appearance-stability.py')

def rows(boards):
 out=Image.new('RGB',(max(b.width for b in boards),sum(b.height for b in boards)),helper.BG);y=0
 for b in boards:out.paste(b,(0,y));y+=b.height
 return out

def main(runs):
 review=DEST/'review';review.mkdir(parents=True,exist_ok=True)
 indexes=[]
 for run in runs:
  path=DEST/'evidence'/run/'evidence-index.json';index=json.loads(path.read_text());assert index['passed'];indexes.append((path,index))
 report={'format':'gathria-volume-collection-artifacts','version':1,'inputs':[],'packs':[],'mirrors':[],'artifacts':[],
 'gifTiming':'Review montages repeat. CharacterPack retains original loop/one-shot flags and exact fps. GIF centiseconds use cumulative rounding; identical consecutive holds may merge without changing total duration.'}
 base=json.loads((DEST/'baseline-hashes.json').read_text())
 for item in base['files']:assert helper.sha(ROOT/item['file'])==item['sha256'],(item['file'],'legacy changed')
 report['legacyFilesUnchanged']=len(base['files']);pack_frames={};gallery=[]
 for path,index in indexes:
  report['inputs'].append({'file':str(path.relative_to(ROOT)),'sha256':helper.sha(path)})
  for p in index['packs']:
   captured=Path(p['capturedPath']);retained=ROOT/p['file'];project=Path(p['projectPath'])
   assert helper.sha(captured)==helper.sha(retained)==p['sha256'];assert helper.sha(project)==p['projectSha256']
   m,frames=helper.decode_pack(retained)
   report['packs'].append({'character':p['character'],'look':p['look'],**stability.protected_source(project,retained)})
   for fid in p['poses']:
    png=path.parent/f'{p["character"]}-{p["look"]}-{fid}-right.png'
    im=Image.open(png);im.load();assert im.mode=='RGBA' and im.tobytes()==frames[fid].tobytes()
   left=Image.open(path.parent/f'{p["character"]}-{p["look"]}-55-left.png').convert('RGBA')
   assert left.tobytes()==frames[55].transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()
   report['mirrors'].append({'look':p['look'],'frameId':55,'actualLeftPngIsExactRightMirror':True,'actualPngMatchesPack':True})
   hair_rows=[]
   for fid in [0,55,86]:
    before=Image.open(path.parent/f'{p["character"]}-{p["look"]}-before-hair-{fid}-right.png').convert('RGBA')
    crop=(90,170,710,710)
    pair=[helper.sheet_tile(im.crop(crop),f'{label} / {p["name"]} / source {fid} / 1x',1) for label,im in [('Previous hairstyle',before),('New volume hairstyle',frames[fid])]]
    hair_rows.append(helper.join_row(pair))
   rows(hair_rows).save(review/f'{p["look"]}-hair-before-after-1x.png')
   pack_frames[p['look']]=(p,m,frames);gallery.append(helper.sheet_tile(frames[0],p['name']+' / native 1x',1))
   keys=[0,51,55,62,86,78];tiles=[helper.sheet_tile(frames[fid],f'{p["name"]} / source {fid} / native 1x',1) for fid in keys]
   rows([helper.join_row(tiles[:3]),helper.join_row(tiles[3:])]).save(review/f'{p["look"]}-keyframes-1x.png')
   run_tiles=[helper.sheet_tile(frames[fid],f'run / source {fid} / 0.5x') for fid in m['animations']['run']['frames']]
   rows([helper.join_row(run_tiles[i:i+8]) for i in range(0,len(run_tiles),8)]).save(review/f'{p["look"]}-complete-run-frames.png')
   # Fixed source-coordinate crop, integer pixels, no per-frame recentering.
   crop=(175,660,615,1010)
   tiles=[helper.sheet_tile(frames[fid].crop(crop).resize((880,700),Image.Resampling.NEAREST),f'{p["name"]} / {fid} / waist-cuff-hem / 2x',1) for fid in [0,51,86]]
   helper.join_row(tiles).save(review/f'{p["look"]}-connections-2x.png')
   for facing in ['right','left']:
    images=[];durations=[]
    for action in helper.ACTIONS:
     clip=m['animations'][action]
     for fid in clip['frames']:
      frame=frames[fid]
      if facing=='left':frame=frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
      images.append(helper.sheet_tile(frame,f'{p["name"]} / {action} / {facing} / 0.5x'))
      durations.append(1000/clip['fps'])
    helper.write_gif(review/f'{p["look"]}-five-actions-{facing}.gif',images,durations,report['artifacts'])
    clip=m['animations']['run'];run_frames=[]
    for fid in clip['frames']:
     frame=frames[fid] if facing=='right' else frames[fid].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
     run_frames.append(helper.sheet_tile(frame,f'{p["name"]} / run / {facing} / 0.5x'))
    helper.write_gif(review/f'{p["look"]}-run-{facing}.gif',run_frames,[1000/clip['fps']]*len(run_frames),report['artifacts'])
  for item in index['downloads']:
   if item['kind']=='png':
    imagepath=ROOT/item['file'];assert helper.sha(imagepath)==item['sha256'];report['artifacts'].append(stability.artifact(imagepath))
  for item in index['screenshots']:
   imagepath=ROOT/item['file'];assert helper.sha(imagepath)==item['sha256'];report['artifacts'].append(stability.artifact(imagepath))
 rows([helper.join_row(gallery[i:i+3]) for i in range(0,len(gallery),3)]).save(review/'nine-outfits-1x.png')
 # Gallery at half resolution is explicitly a compact overview, not native proof.
 native=rows([helper.join_row(gallery[i:i+3]) for i in range(0,len(gallery),3)]);native.resize((native.width//2,native.height//2),Image.Resampling.LANCZOS).save(review/'nine-outfits-overview.png')
 # Per-character run comparisons synchronize only identical source timelines.
 for character in sorted({p['character'] for p,m,frames in pack_frames.values()}):
  variants=[(p,m,f) for p,m,f in pack_frames.values() if p['character']==character]
  clip=variants[0][1]['animations']['run'];assert all(m['animations']['run']==clip for p,m,f in variants)
  for facing in ['right','left']:
   images=[]
   for fid in clip['frames']:
    tiles=[]
    for p,m,frames in variants:
     im=frames[fid]
     if facing=='left':im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
     tiles.append(helper.sheet_tile(im,f'{p["name"]} / run / {facing} / 0.5x'))
    images.append(helper.join_row(tiles))
   helper.write_gif(review/f'{character}-outfits-run-{facing}.gif',images,[1000/clip['fps']]*len(images),report['artifacts'])
 for path in sorted(review.glob('*.png')):report['artifacts'].append(stability.artifact(path))
 report['counts']={'packs':len(report['packs']),'nativeFrames':sum(len(p['frameChecks']) for p in report['packs']),'mirrorPairs':len(report['mirrors']),'artifacts':len(report['artifacts']),'independentPlaybackCases':sum(len(i['playback']) for _,i in indexes),'savedProjectRoundtrips':sum(len(i['reopened'])for _,i in indexes)}
 (DEST/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['counts']))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--runs',nargs='+',default=['final']);a=p.parse_args();main(a.runs)
