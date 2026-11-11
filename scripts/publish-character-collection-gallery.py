#!/usr/bin/env python3
"""Create GitHub-rendered image galleries alongside the portable interactive gallery."""
from pathlib import Path
import html,json
R=Path(__file__).resolve().parents[1];P=R/'docs/character-collection'
data=json.loads((P/'collection.json').read_text())
labels={'preset':'全部搭配','garment':'单件服装','hair':'发型与发色','expression':'表情','theme':'完整主题','appearance':'原人物'}
files={'preset':'looks.md','garment':'garments.md','hair':'hair.md','expression':'faces.md','theme':'themes.md','appearance':'originals.md'}
nav=' · '.join(f'[{labels[k]}]({v})' for k,v in files.items())
def esc(v):return html.escape(str(v)).replace('|','&#124;')
for kind,name in labels.items():
 cards=[c for c in data['cards'] if c['kind']==kind]
 lines=[f'# {name} · {len(cards)} 项','',f'[返回总集](README.md) · {nav}','','图片可直接在线查看；点击图片放大。分组保留视角、配色与修订，展示项不等于独立设计数。','']
 for gender,title in [('male','男版'),('female','女版')]:
  subset=[c for c in cards if c['character']==gender]
  lines.extend([f'## {title}',''])
  groups=list(dict.fromkeys(c['group'] for c in subset))
  for group in groups:
   entries=[c for c in subset if c['group']==group]
   lines.extend([f"### {entries[0]['groupLabel']} · {entries[0]['viewLabel']}",'','|  |  |  |  |','| --- | --- | --- | --- |'])
   cells=[]
   for c in entries:
    image=c['images']['idle']['path']
    status=' · 实验候选' if c.get('candidate') else (' · 早期版本' if 'earlier' in (c.get('status') or '') else '')
    cell=f'<a href="{image}"><img src="{image}" width="190" alt="{esc(c["name"])}"></a><br>**{esc(c["name"])}**<br>{esc(c["viewLabel"]+status)}<br><code>{esc(c["id"])}</code>'
    if 'run' in c['images']:cell+=f'<br>[查看跑步姿势]({c["images"]["run"]["path"]})'
    if kind=='garment' and c['assets']:cell+=f'<br>[下载该件素材]({data["rawBase"]+c["assets"][0]["url"].lstrip("/")})'
    cells.append(cell)
   for i in range(0,len(cells),4):lines.append('| '+' | '.join(cells[i:i+4]+['']*(4-len(cells[i:i+4])))+' |')
   lines.append('')
 lines.extend(['','完整配方与来源：[清单 CSV](collection.csv) · [素材索引 JSON](collection.json)。',''])
 (P/files[kind]).write_text('\n'.join(lines))
p=P/'README.md';text=p.read_text()
old='[打开可筛选总集](index.html) · [下载离线浏览包](collection-preview.zip) · [完整清单 CSV](collection.csv)'
new='**在线图册：** '+nav+'\n\n**[下载可筛选的离线浏览包（约58 MB）](https://github.com/hanxuwu/gathria-character/raw/refs/heads/docs/character-collection/docs/character-collection/collection-preview.zip)** · [完整清单 CSV](collection.csv)\n\n上方图册在 GitHub 里直接显示图片。可交互的筛选页面在 ZIP 内；GitHub 上的 `index.html` 只是源码预览，不是已托管的网站。'
text=text.replace(old,new)
text=text.replace('浏览包只装展示图、总览和索引，不含大体积原生核验图。','浏览包只装展示图、总览和索引，不含大体积原生核验图。原生核验 PNG 也未重复提交到 GitHub；清单中的 `nativePath` 是可用脚本重建的本地核验路径，不是在线下载链接。')
text=text.replace('python scripts/package-character-collection.py','python scripts/publish-character-collection-gallery.py\npython scripts/package-character-collection.py')
text=text.split('\n## 直接看总览\n')[0]
text+='\n## 直接看总览\n\n### 男版原视角\n\n![男版全部搭配](sheets/male-original-looks.png)\n\n### 女版原视角\n\n![女版全部搭配](sheets/female-original-looks.png)\n\n更多视角与单件服装请使用页首分类图册。\n'
p.write_text(text)
(P/'.gitignore').write_text('# Regenerable native verification renders; published previews are tracked.\nclothing/native/\nappearance/*.png\n')
print('Created six online Markdown galleries and a clear download entry.')
