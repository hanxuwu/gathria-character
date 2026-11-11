#!/usr/bin/env python3
"""Package the self-contained read-only gallery (previews, not original ZIP banks)."""
import hashlib,json,re,zipfile
from pathlib import Path
from PIL import Image
R=Path(__file__).resolve().parents[1];P=R/'docs/character-collection'
data=json.loads((P/'collection.json').read_text())
assert data['counts']['garment']==113 and data['counts']['preset']==88
seen=set()
for card in data['cards']:
 for im in card['images'].values():
  path=P/im['path'];assert path.is_file()
  assert hashlib.sha256(path.read_bytes()).hexdigest()==im['sha256']
  with Image.open(path) as p:p.verify()
  seen.add(im['path'])
files=[P/x for x in ['index.html','README.md','collection.json','collection.csv','inventory.json','browser-review.json']]
files+=sorted(P.glob('*.md'))
files=list(dict.fromkeys(files))
files+=sorted((P/'preview').glob('*.png'))+sorted((P/'sheets').glob('*.png'))
archive=P/'collection-preview.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in files:
  rel=f.relative_to(P).as_posix();content=f.read_bytes()
  if rel=='index.html':
   content=content.decode().replace('<a href="collection-preview.zip" download>下载离线浏览包</a>','<span>当前已是离线浏览包</span>').encode()
  if rel=='README.md':
   text=content.decode().replace(' · [下载离线浏览包](collection-preview.zip)','')
   text=text.replace('**[下载可筛选的离线浏览包（约58 MB）](https://github.com/hanxuwu/gathria-character/raw/refs/heads/docs/character-collection/docs/character-collection/collection-preview.zip)**', '**当前已是离线浏览包，打开 index.html 可筛选预览。**')
   text=text.replace('../wardrobe-finish/README.md',data['githubBase']+'docs/wardrobe-finish/README.md')
   content=text.encode()
  z.writestr(rel,content)
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 names=set(z.namelist())
 assert seen<=names
 for ref in re.findall(r'(?:href|src)="([^"]+)"',z.read('index.html').decode()):
  if not ref or ref.startswith(('http:','https:','#')):continue
  assert ref in names,ref
report={'format':'gathria-collection-package-check','version':1,'sourceRevision':data['revision'],'cards':len(data['cards']),'counts':data['counts'],'previewImages':len(seen),'allPreviewHashesAndImagesValid':True,'allStaticOfflineLinksPresent':True,'zipCrcValid':True,'zipBytes':archive.stat().st_size,'zipSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'scope':'Browsable preview package with exact recipes and version-pinned original asset links. Original raw garment ZIPs and native verification renders remain outside this package.'}
(P/'package-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
