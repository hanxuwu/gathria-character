#!/usr/bin/env python3
"""Build a read-only collection from actual runtime renders; no artwork changes."""
import csv, hashlib, html, io, json, math, subprocess, zipfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
R=Path(__file__).resolve().parents[1]
OUT=R/'docs/character-collection'
REV=subprocess.check_output(['git','rev-parse','origin/main'],cwd=R,text=True).strip()
RAW=f'https://raw.githubusercontent.com/hanxuwu/gathria-character/{REV}/'
GITHUB=f'https://github.com/hanxuwu/gathria-character/blob/{REV}/'
KINDS={'preset':'整套搭配','garment':'单件服装','hair':'发型与发色','expression':'表情','theme':'完整主题','appearance':'外观'}
SLOTS={'top':'上衣','bottom':'下装','fullBody':'连衣裙 / 整身','shoes':'鞋子'}
VIEWS={'original':'原视角','side':'侧视'}
FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
BOLD='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def group_name(g):
    if g.startswith('original-'):return '原视角衣橱'
    if g.startswith('side-material-'):return '侧视 · 基础棉质'
    if g.startswith('side-tailored-'):return '侧视 · 衬衫与裙裤'
    if 'landing' in g:return '男版落地候选'
    for key,label in [('cotton','双视角 · 轻便日常'),('tailored','双视角 · 新款日常'),('complete','双视角 · 完整日常'),('polished','双视角 · 接缝修订')]:
        if key in g:return label
    return g

def picture(src, target, pixel=False, fixed_box=None):
    im=Image.open(src).convert('RGBA')
    # Presentation only: crop to visible bounds, retain native source untouched.
    box=tuple(fixed_box) if fixed_box else im.getbbox()
    if box:im=im.crop(box)
    scale=min(1,420/im.height,300/im.width)
    if pixel:
        factor=max(1,min(3,math.floor(min(420/im.height,300/im.width))))
        im=im.resize((im.width*factor,im.height*factor),Image.Resampling.NEAREST)
    else:im=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(320,460),(0,0,0,0));canvas.alpha_composite(im,((320-im.width)//2,440-im.height))
    target.parent.mkdir(parents=True,exist_ok=True);canvas.save(target)
    return {'path':str(target.relative_to(OUT)),'sha256':sha(target),'nativePath':str(src.relative_to(R)),'nativeSha256':sha(src),'nativeSize':list(Image.open(src).size),'displayCrop':list(box) if box else None,'displayOnly':True}

def make_sheet(cards,title,file,cols=5):
    if not cards:return
    cw,ch=244,370;rows=math.ceil(len(cards)/cols);im=Image.new('RGB',(cw*cols+64,rows*ch+140),'#f4f1e9');d=ImageDraw.Draw(im)
    f=ImageFont.truetype(FONT,15);b=ImageFont.truetype(BOLD,31);small=ImageFont.truetype(FONT,13)
    d.text((32,24),title,font=b,fill='#29483e');d.text((32,72),f'{len(cards)} 个展示项 · 当前素材实际合成 · 含配色与修订 · 静态总览不代表所有动作无穿帮',font=f,fill='#6f756c')
    for n,c in enumerate(cards):
        x=32+n%cols*cw;y=116+n//cols*ch
        d.rounded_rectangle((x,y,x+cw-12,y+ch-12),12,fill='#ffffff')
        src=Image.open(OUT/c['images']['idle']['path']).convert('RGBA');src.thumbnail((220,275),Image.Resampling.NEAREST if c.get('rendering')=='pixel' else Image.Resampling.LANCZOS)
        im.paste(src,(x+(cw-12-src.width)//2,y+8),src)
        name=c['name'];parts=[]
        while name:
            j=1
            while j<len(name) and d.textlength(name[:j+1],font=f)<cw-30:j+=1
            parts.append(name[:j]);name=name[j:]
        for k,line in enumerate(parts[:2]):d.text((x+10,y+283+k*20),line,font=f,fill='#263f35')
        d.text((x+10,y+328),c['viewLabel']+' · '+('候选' if c.get('candidate') else c['groupLabel'][:14]),font=small,fill='#758071')
    (OUT/'sheets').mkdir(exist_ok=True);im.save(OUT/'sheets'/file)


def main():
    inv=json.loads((R/'docs/wardrobe-coverage/inventory.json').read_text())
    cloth=json.loads((OUT/'clothing/manifest.json').read_text())
    appearance=json.loads((OUT/'appearance/manifest.json').read_text())
    meta=json.loads((OUT/'inventory.json').read_text())
    names={(x['groupId'],x['presetId']):x for x in meta['looks']}
    fixed={}
    for e in cloth['entries']:
        for frame in e['frames'].values():
            box=Image.open(OUT/'clothing'/frame['file']).getbbox()
            if not box:continue
            old=fixed.get(e['sourceSha256'],box)
            fixed[e['sourceSha256']]=[min(old[0],box[0]),min(old[1],box[1]),max(old[2],box[2]),max(old[3],box[3])]
    cards=[]
    for entry in cloth['entries']:
        g=entry['groupId'];kind=entry['kind'];name=entry.get('name') or entry['id']
        if kind=='preset' and entry['id'] in ('original','daily','wedding'):name={'original':'原人物 · 基础造型','daily':'日常搭配','wedding':'婚礼搭配'}[entry['id']]
        if kind=='preset' and entry['id'].endswith(('-sea','-apricot')):name=group_name(g).split(' · ')[-1]+' / '+('海盐蓝 · 沙色' if entry['id'].endswith('-sea') else '暖杏 · 蓝灰')
        if kind=='preset':name=names.get((g,entry['id']),{}).get('nameZh',name)
        card={'key':entry['key'],'kind':kind,'name':name,'id':entry['id'],'character':entry['character'],'view':entry['view'],'viewLabel':VIEWS.get(entry['view'],entry['view']),'group':g,'groupLabel':group_name(g),'candidate':bool(entry.get('candidate')),'selection':entry['selection'],'slot':next((k for k,v in entry['selection'].items() if v),None) if kind=='garment' else None,'images':{},'assets':entry['garments'],'sourceSha256':entry['sourceSha256'],'registrationSha256':entry['registrationSha256'],'note':'仅替换本件衣物，其他部位保留原衣；统一原头展示。' if kind=='garment' else '按目录配方搭配，统一原头展示；发型可独立选择。'}
        for pose,frame in entry['frames'].items():
            target=OUT/'preview'/f'{len(cards):03}-{pose}.png'
            card['images'][pose]=picture(OUT/'clothing'/frame['file'],target,fixed_box=fixed[entry['sourceSha256']])
            card['images'][pose]['frameId']=frame['frameId']
        cards.append(card)
    for e in appearance['cards']:
        k=e.get('kind','appearance');k='expression' if k in ('face','expression') else ('hair' if k in ('hair','hair-color','hairstyle','color') else ('appearance' if k=='source' else k))
        c={'key':e['id'],'kind':k,'name':e['name'],'id':e['id'],'character':e['character'],'view':e.get('view','original'),'viewLabel':VIEWS.get(e.get('view','original'),e.get('view','original')),'group':e.get('group',k),'groupLabel':e.get('groupLabel',KINDS.get(k,k)),'candidate':e.get('candidate',False),'selection':e.get('selection',{}),'images':{},'assets':e.get('assets',[]),'source':e.get('source'),'status':e.get('status'),'note':e.get('note','原素材与实际外观图层合成；与衣服分开选用。')}
        c['rendering']=e.get('rendering','smooth')
        c['groupLabel']=e.get('groupName',c['groupLabel'])
        c['candidate']=c.get('candidate',False) or e.get('status')=='experimental'
        c['assets']=e.get('assets',[]) or ([{'id':'完整人物包','url':e['source']}] if k=='theme' else ([{'id':'外观素材','url':e['bank']}] if e.get('bank') else []))
        src=OUT/'appearance'/(e.get('portrait') or e['image']) if k in ('hair','expression') else OUT/'appearance'/e['image']
        if isinstance(e.get('portrait'),dict) and k in ('hair','expression'):src=OUT/'appearance'/e['portrait']['file']
        c['images']['idle']=picture(src,OUT/'preview'/f'{len(cards):03}-idle.png',e.get('rendering')=='pixel')
        cards.append(c)
    assert len([c for c in cards if c['kind']=='garment'])==113
    assert len([c for c in cards if c['kind']=='preset'])==88
    data={'format':'gathria-current-character-collection','revision':REV,'date':'2026-11-10','cards':cards,'counts':{k:sum(c['kind']==k for c in cards) for k in set(c['kind'] for c in cards)},'scope':'当前内置目录全部预设与独立衣物；外观与主题分列。包括仍可选择的旧修订，不穷举任意混搭。','archived':inv['historicalNonCatalogGarments'],'rawBase':RAW,'githubBase':GITHUB}
    (OUT/'collection.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    for gender,label in [('male','男版'),('female','女版')]:
        make_sheet([c for c in cards if c['kind']=='preset' and c['group']==f'original-{gender}'],f'{label} · 原视角全部搭配',f'{gender}-original-looks.png')
        make_sheet([c for c in cards if c['kind']=='preset' and c['character']==gender and c['view']=='side'],f'{label} · 侧视全部搭配',f'{gender}-side-looks.png')
        make_sheet([c for c in cards if c['kind']=='hair' and c['character']==gender and c['view']=='original'],f'{label} · 发型与发色',f'{gender}-hair.png',6)
    make_sheet([c for c in cards if c['kind']=='theme'],'男女 · 完整主题造型','themes.png',4)
    make_sheet([c for c in cards if c['kind']=='preset' and c['group'].startswith('dual-')],'男女 · 双视角配对系列','paired-looks.png',4)
    with (OUT/'collection.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f,lineterminator="\n");w.writerow(['编号','类型','人物','视角','系列','名称','候选','搭配配方','原始资产'])
        for c in cards:w.writerow([c['key'],KINDS.get(c['kind'],c['kind']),c['character'],c['viewLabel'],c['groupLabel'],c['name'],c.get('candidate'),json.dumps(c['selection'],ensure_ascii=False),json.dumps(c['assets'],ensure_ascii=False)])
    template=(R/'scripts/character-collection-template.html').read_text()
    encoded=json.dumps(data,ensure_ascii=False).replace('<','\\u003c')
    (OUT/'index.html').write_text(template.replace('__COLLECTION_DATA__',encoded))
    print(json.dumps(data['counts'],ensure_ascii=False))

if __name__=='__main__':main()
