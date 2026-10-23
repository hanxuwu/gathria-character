#!/usr/bin/env python3
"""Publish only internally consistent, prepared source/registration/garment sets."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/kling-wardrobe'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def select(top=None,bottom=None,fullBody=None,shoes=None):return dict(top=top,bottom=bottom,fullBody=fullBody,shoes=shoes)
characters=[]
# Released first-batch, ear-fit revision 2 and male boundary revision 3 banks. Exact hashes
# make custom/future assets ineligible for an accidental downgrade.
previous_appearance={
    'male':[
        '3dc7c537beea678be7cf5e707713b755fbb0694aa441cb0579105c962aad6bef',
        '2da8187aca98d6245cc7fad1ac0b93b3a0bad52e175a35fc22f6c7c51e72a794',
        'f79a742a88eb5001418154307025303e91899c08058263e87ad54d8995c937f9',
    ],
    'female':[
        '2cb788fcbe9bd623b57ccb3cb7385199a7bd04213af2c726e12c738d219e84fa',
        '257098ca3777d56fbbb1bd261eba65c0374d52b6917aaea333e808df447de3e6',
    ],
}
for char in ['male','female']:
    profile='male-full-outfits-v1' if char=='male' else char
    reg=OUT/f'registration/{profile}.json'
    data=json.loads(reg.read_text())
    dest=reg
    source=ROOT/f'docs/kling-motion/exports/{char}.character.zip'
    assert data['sourceSha256']==sha(source)
    items=[]
    ids=['teal-top','ochre-shorts','navy-waistcoat','navy-shorts','brown-shoes']
    if char=='female':ids+=['coral-daydress-v4','ivory-wedding-dress-v4']
    else:ids+=['teal-camp-shirt-v2','navy-suit-jacket-v2','ochre-chinos-v1','navy-suit-trousers-v1']
    for item_id in ids:
        directory='male-full-outfits-v1' if char=='male' and item_id in ids[:5] else char
        p=OUT/f'garments/{directory}/{item_id}.zip'
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None;m=json.loads(z.read('manifest.json'))
        assert m['id']==item_id and m['sourceSha256']==sha(source) and m['registrationSha256']==sha(reg),f'Stale garment {p}'
        items.append({'id':item_id,'name':m['name'],'slot':m['slot'],'url':'/'+str(p.relative_to(ROOT))})
    presets=[{'id':'original','name':'Original','selection':select()}]
    day=select('teal-camp-shirt-v2','ochre-chinos-v1') if char=='male' else select(fullBody='coral-daydress-v4')
    wedding=select('navy-suit-jacket-v2','navy-suit-trousers-v1',shoes='brown-shoes') if char=='male' else select(fullBody='ivory-wedding-dress-v4')
    presets.extend([{'id':'day','name':'Everyday','selection':day},{'id':'wedding','name':'Wedding','selection':wedding}])
    presets.extend([{'id':'separates','name':'Everyday separates','selection':select('teal-top','ochre-shorts')},{'id':'formal-separates','name':'Formal separates','selection':select('navy-waistcoat','navy-shorts',shoes='brown-shoes')}])
    characters.append({'key':char,'name':f'Kling {char}','characterId':data['characterId'],'sourceUrl':'/'+str(source.relative_to(ROOT)),'registrationUrl':'/'+str(dest.relative_to(ROOT)),'templateUrl':f'/docs/kling-wardrobe/templates/{profile}.wardrobe-template.zip','items':items,'presets':presets})
    appearance=ROOT/f'docs/kling-appearance/banks/{char}.zip'
    if appearance.exists():
        with zipfile.ZipFile(appearance) as z:
            assert z.testzip() is None
            head=json.loads(z.read('manifest.json'))
        assert head['characterId']==data['characterId'] and head['sourceSha256']==sha(source) and head['registrationSha256']==sha(reg),f'Stale appearance {appearance}'
        characters[-1]['appearanceBankUrl']='/'+str(appearance.relative_to(ROOT))
        characters[-1]['appearanceRevision']={
            'characterId':head['characterId'],'sourceSha256':head['sourceSha256'],
            'registrationSha256':head['registrationSha256'],'bankId':head['id'],
            'bankSha256':sha(appearance),
            'previousBankSha256s':[value for value in previous_appearance[char] if value!=sha(appearance)],
        }
(OUT/'catalog.json').write_text(json.dumps({'version':1,'characters':characters},indent=2)+'\n')
print(f'Published {len(characters)} registered bodies / {sum(len(c["items"]) for c in characters)} garment items / original + everyday + wedding presets')
