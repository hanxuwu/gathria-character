#!/usr/bin/env python3
"""Publish only internally consistent, prepared source/registration/garment sets."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/kling-wardrobe'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def select(top=None,bottom=None,fullBody=None,shoes=None):return dict(top=top,bottom=bottom,fullBody=fullBody,shoes=shoes)
characters=[]
volume_source=ROOT/'artwork/kling-collection/source/volume-v1'
volume_looks=json.loads((volume_source/'looks.json').read_text())
volume_hair=json.loads((volume_source/'hair-donors.json').read_text())
# Released first-batch, ear-fit and boundary/ear-overlap revision banks. Exact hashes
# make custom/future assets ineligible for an accidental downgrade.
previous_appearance={
    'male':[
        '3dc7c537beea678be7cf5e707713b755fbb0694aa441cb0579105c962aad6bef',
        '2da8187aca98d6245cc7fad1ac0b93b3a0bad52e175a35fc22f6c7c51e72a794',
        'f79a742a88eb5001418154307025303e91899c08058263e87ad54d8995c937f9',
        '0a443a618a9744650f3aa45168aa5469b396d5d07c9887e97428d50e77d629b3',
    ],
    'female':[
        '2cb788fcbe9bd623b57ccb3cb7385199a7bd04213af2c726e12c738d219e84fa',
        '257098ca3777d56fbbb1bd261eba65c0374d52b6917aaea333e808df447de3e6',
        'bce748e1e8afea823e23e51b15491d8f02f9ba4d04e3cb53f18ca8c77e8a1ee9',
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
    if char=='female':ids+=['coral-daydress-v4','ivory-wedding-dress-v4','mist-blue-dress-v1','lavender-pleat-dress-v1']
    else:ids+=['teal-camp-shirt-v2','navy-suit-jacket-v2','ochre-chinos-v1','navy-suit-trousers-v1','cream-camp-shirt-v1','forest-work-shirt-v1']
    ids += [look['selection']['top'] or look['selection']['fullBody'] for look in volume_looks if look['character']==char]
    refined_dress=None
    if char=='female':
        for version in [2,3]:
            if (OUT/f'garments/female/ivory-celebration-dress-v{version}.zip').exists():refined_dress=f'ivory-celebration-dress-v{version}'
        if refined_dress:ids.append(refined_dress)
    new_primary=['teal-camp-shirt-v3','navy-suit-jacket-v3','ocean-linen-shirt-v1'] if char=='male' else ['coral-daydress-v5','ivory-wedding-dress-v5']
    ids += [item for item in new_primary if (OUT/f'garments/{char}/{item}.zip').exists()]
    soft_waist=['coral-daydress-v6','ivory-wedding-dress-v6'] if char=='female' else []
    ids += [item for item in soft_waist if (OUT/f'garments/{char}/{item}.zip').exists()]
    for item_id in ids:
        directory='male-full-outfits-v1' if char=='male' and item_id in ids[:5] else char
        p=OUT/f'garments/{directory}/{item_id}.zip'
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None;m=json.loads(z.read('manifest.json'))
        assert m['id']==item_id and m['sourceSha256']==sha(source) and m['registrationSha256']==sha(reg),f'Stale garment {p}'
        items.append({'id':item_id,'name':m['name'],'slot':m['slot'],'url':'/'+str(p.relative_to(ROOT)), 'sha256':sha(p)})
    presets=[{'id':'original','name':'Original','selection':select()}]
    day=select('teal-camp-shirt-v2','ochre-chinos-v1') if char=='male' else select(fullBody='coral-daydress-v4')
    wedding=select('navy-suit-jacket-v2','navy-suit-trousers-v1',shoes='brown-shoes') if char=='male' else select(fullBody='ivory-wedding-dress-v4')
    presets.extend([{'id':'day','name':'Everyday','selection':day},{'id':'wedding','name':'Wedding','selection':wedding}])
    if all(item in ids for item in new_primary[:2]):
        presets.extend([
            {'id':'day-refined','name':'Everyday refined','selection':select('teal-camp-shirt-v3','ochre-chinos-v1') if char=='male' else select(fullBody='coral-daydress-v5')},
            {'id':'wedding-refined','name':'Wedding refined','selection':select('navy-suit-jacket-v3','navy-suit-trousers-v1',shoes='brown-shoes') if char=='male' else select(fullBody='ivory-wedding-dress-v5')},
        ])
    if char=='male' and 'ocean-linen-shirt-v1' in ids:
        presets.append({'id':'ocean-linen','name':'Ocean linen','selection':select('ocean-linen-shirt-v1','ochre-chinos-v1')})
    if soft_waist and all(item in ids for item in soft_waist):
        presets.extend([
            {'id':'day-soft-waist','name':'Everyday soft waist','selection':select(fullBody=soft_waist[0])},
            {'id':'wedding-soft-waist','name':'Wedding soft waist','selection':select(fullBody=soft_waist[1])},
        ])
    if char=='male':
        presets.extend([
            {'id':'cream-navy','name':'Cream & navy','selection':select('cream-camp-shirt-v1','navy-suit-trousers-v1')},
            {'id':'forest-weekend','name':'Forest weekend','selection':select('forest-work-shirt-v1','ochre-chinos-v1',shoes='brown-shoes')},
        ])
    else:
        presets.extend([
            {'id':'mist-blue','name':'Mist blue','selection':select(fullBody='mist-blue-dress-v1')},
            {'id':'lavender-afternoon','name':'Lavender afternoon','selection':select(fullBody='lavender-pleat-dress-v1')},
        ])
    presets.extend([{'id':'separates','name':'Everyday separates','selection':select('teal-top','ochre-shorts')},{'id':'formal-separates','name':'Formal separates','selection':select('navy-waistcoat','navy-shorts',shoes='brown-shoes')}])
    presets.extend([{k:look[k] for k in ('id','name','selection')} for look in volume_looks if look['character']==char])
    if refined_dress:presets.append({'id':'ivory-refined','name':'Ivory refined','selection':select(fullBody=refined_dress)})
    characters.append({'key':char,'name':f'Kling {char}','characterId':data['characterId'],'sourceUrl':'/'+str(source.relative_to(ROOT)),'registrationUrl':'/'+str(dest.relative_to(ROOT)),'templateUrl':f'/docs/kling-wardrobe/templates/{profile}.wardrobe-template.zip','items':items,'presets':presets})
    appearance=ROOT/f'docs/kling-appearance/banks/{char}.zip'
    if appearance.exists():
        with zipfile.ZipFile(appearance) as z:
            assert z.testzip() is None
            head=json.loads(z.read('manifest.json'))
        assert head['characterId']==data['characterId'] and head['sourceSha256']==sha(source) and head['registrationSha256']==sha(reg),f'Stale appearance {appearance}'
        characters[-1]['appearanceBankUrl']='/'+str(appearance.relative_to(ROOT))
        characters[-1]['appearanceStyles']=[{key:style[key] for key in ('id','name','slot')} for style in head['styles']]
        characters[-1]['appearanceRevision']={
            'characterId':head['characterId'],'sourceSha256':head['sourceSha256'],
            'registrationSha256':head['registrationSha256'],'bankId':head['id'],
            'bankSha256':sha(appearance),
            'previousBankSha256s':[value for value in previous_appearance[char] if value!=sha(appearance)],
        }
    libraries=[]
    for style,definition in volume_hair.items():
        if definition['character']!=char:continue
        p=ROOT/f'docs/kling-appearance/banks/volume/{char}-{style}.zip'
        previous=[]
        for revision in ['volume-v2','volume-v3','volume-v4','volume-v5']:
            revised=ROOT/f'docs/kling-appearance/banks/{revision}/{char}-{style}.zip'
            if revised.exists():previous.append(sha(p));p=revised
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None
            m=json.loads(z.read('manifest.json'))
        assert m['characterId']==data['characterId'] and m['sourceSha256']==sha(source) and m['registrationSha256']==sha(reg)
        libraries.append({'url':'/'+str(p.relative_to(ROOT)), 'sha256':sha(p), 'bankId':m['id'], 'styles':[{k:s[k] for k in ('id','name','slot')} for s in m['styles']], **({'previousBankSha256s':previous} if previous else {})})
    characters[-1]['appearanceLibraries']=libraries
(OUT/'catalog.json').write_text(json.dumps({'version':1,'characters':characters},indent=2)+'\n')
print(f'Published {len(characters)} registered bodies / {sum(len(c["items"]) for c in characters)} garment items / {sum(len(c["presets"]) for c in characters)} outfit presets')
