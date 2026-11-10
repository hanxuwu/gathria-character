"""Verify and peel the explicit female neckline finish layer for old CI guards.

No Git or historical ZIP fetch is needed. Every change is newly owned cloth:
its prior patch is exactly transparent black. Before/after native patch and
ownership hashes bind the reversible edit; old manifests are frozen alongside
these records. A caller should run its existing historical assertions on the
returned prior layer. This does NOT replace those assertions.
"""
from pathlib import Path
import hashlib,json
from functools import lru_cache
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'docs/wardrobe-finish/female/repair-report.json'
REPORT_SHA256='9ad7069cafdfd8f941d01c0e6dc1144ca551dbee58d5847940d31452ba8da64b'
PROFILE_SHA256='41b94905eb00f7224091a4b75ec52ed1c00f5c0ddd5ae02df91aa4fdcc27675d'

def _sha(b):return hashlib.sha256(b).hexdigest()
def _path(path):
 p=Path(path)
 if p.is_absolute():
  if str(p).startswith(str(ROOT)+'/'):p=p.relative_to(ROOT)
  elif str(p).startswith('/docs/'):p=Path(str(p).lstrip('/'))
  else:raise ValueError('Finish path must be repository-relative')
 return str(p).lstrip('/')
@lru_cache(maxsize=1)
def _records():
 assert REPORT.exists(), 'Missing frozen finish report'
 assert _sha(json.dumps(json.loads(REPORT.read_text()),sort_keys=True,separators=(',',':')).encode())==REPORT_SHA256, 'Finish report pin changed'
 assert _sha((ROOT/'artwork/wardrobe-finish/female/neckline-profiles-v2.json').read_bytes())==PROFILE_SHA256, 'Finish permission pin changed'
 return {r['path']:r for r in json.loads(REPORT.read_text())['items']}
def is_finished(path):return _path(path) in _records()
def _record(path):
 path=_path(path);records=_records();assert path in records,f'No explicit finish layer for {path}';return records[path]
def asset_revision(path):
 r=_record(path);return {'beforeSha256':r['beforeSha256'],'sha256':r['afterSha256'],'bytes':r['bytes']}
def validated_previous_manifest(path,manifest):
 r=_record(path)
 # Frozen parser-level equality avoids treating JSON whitespace as permission.
 expected=r['afterManifest'];assert manifest==expected,f'Unexpected finished manifest: {path}'
 assert manifest['sourceSha256']==r['beforeManifest']['sourceSha256'];assert manifest['registrationSha256']==r['beforeManifest']['registrationSha256']
 return json.loads(json.dumps(r['beforeManifest']))
def undo_finish_frame(path,fid,rgba,owned):
 r=_record(path);change=next((f for f in r['changedFrames'] if f['frameId']==fid),None)
 if change is None:return rgba,owned
 assert rgba.dtype==np.uint8 and rgba.shape==(1056,704,4)
 owned=np.asarray(owned,dtype=bool)
 assert _sha(rgba.tobytes())==change['afterPatchSha256'],(path,fid,'finish patch differs')
 assert _sha(owned.tobytes())==change['afterOwnershipSha256'],(path,fid,'finish ownership differs')
 previous=rgba.copy();mask=owned.copy()
 for row in change['addedRuns']:
  y,x0,x1=row['y'],row['x0'],row['x1'];assert mask[y,x0:x1+1].all();previous[y,x0:x1+1]=0;mask[y,x0:x1+1]=False
 assert _sha(previous.tobytes())==change['beforePatchSha256'],(path,fid,'prior pixels differ')
 assert _sha(mask.tobytes())==change['beforeOwnershipSha256'],(path,fid,'prior ownership differs')
 return previous,mask
