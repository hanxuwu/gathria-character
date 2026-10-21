#!/usr/bin/env python3
"""Publish only internally consistent, prepared source/registration/garment sets."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/kling-wardrobe'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def select(top=None,bottom=None,fullBody=None,shoes=None):return dict(top=top,bottom=bottom,fullBody=fullBody,shoes=shoes)
characters=[]
for char in ['male','female']:
    profile='male-full-outfits-v1' if char=='male' else char
    reg=OUT/f'registration/{profile}.json'
    data=json.loads(reg.read_text())
    dest=reg
    source=ROOT/f'docs/kling-motion/exports/{char}.character.zip'
    assert data['sourceSha256']==sha(source)
    items=[]
    ids=['teal-top','ochre-shorts','navy-waistcoat','navy-shorts','brown-shoes']
    if char=='female':ids+=['coral-daydress-v3','ivory-wedding-dress-v3']
    else:ids+=['teal-camp-shirt-v1','navy-suit-jacket-v1','ochre-chinos-v1','navy-suit-trousers-v1']
    for item_id in ids:
        directory='male-full-outfits-v1' if char=='male' and item_id in ids[:5] else char
        p=OUT/f'garments/{directory}/{item_id}.zip'
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None;m=json.loads(z.read('manifest.json'))
        assert m['id']==item_id and m['sourceSha256']==sha(source) and m['registrationSha256']==sha(reg),f'Stale garment {p}'
        items.append({'id':item_id,'name':m['name'],'slot':m['slot'],'url':'/'+str(p.relative_to(ROOT))})
    presets=[{'id':'original','name':'Original','selection':select()}]
    day=select('teal-camp-shirt-v1','ochre-chinos-v1') if char=='male' else select(fullBody='coral-daydress-v3')
    wedding=select('navy-suit-jacket-v1','navy-suit-trousers-v1',shoes='brown-shoes') if char=='male' else select(fullBody='ivory-wedding-dress-v3')
    presets.extend([{'id':'day','name':'Everyday','selection':day},{'id':'wedding','name':'Wedding','selection':wedding}])
    presets.extend([{'id':'separates','name':'Everyday separates','selection':select('teal-top','ochre-shorts')},{'id':'formal-separates','name':'Formal separates','selection':select('navy-waistcoat','navy-shorts',shoes='brown-shoes')}])
    characters.append({'key':char,'name':f'Kling {char}','characterId':data['characterId'],'sourceUrl':'/'+str(source.relative_to(ROOT)),'registrationUrl':'/'+str(dest.relative_to(ROOT)),'templateUrl':f'/docs/kling-wardrobe/templates/{profile}.wardrobe-template.zip','items':items,'presets':presets})
(OUT/'catalog.json').write_text(json.dumps({'version':1,'characters':characters},indent=2)+'\n')
print(f'Published {len(characters)} registered bodies / {sum(len(c["items"]) for c in characters)} garment items / original + everyday + wedding presets')
