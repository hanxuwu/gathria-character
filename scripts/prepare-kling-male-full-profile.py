"""Build the reviewed male full-outfit registration without rewriting old profiles.

Only source-visible hand/body protection boundaries change. The exact source,
17 landmark records, head polygons and old delivered archives remain unchanged.
"""
from copy import deepcopy
import io
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import numpy as np
from PIL import Image, ImageDraw
from kling_wardrobe_common import ROOT, json_bytes, sha, load_source, protected_mask

BASE = ROOT / 'docs/kling-wardrobe/templates/male.wardrobe-template.zip'
ART = ROOT / 'artwork/kling-wardrobe/registration/male-full-outfits-v1'
REG = ROOT / 'docs/kling-wardrobe/registration/male-full-outfits-v1.json'
KIT = ROOT / 'docs/kling-wardrobe/templates/male-full-outfits-v1.wardrobe-template.zip'
IDS = ('teal-top', 'ochre-shorts', 'navy-waistcoat', 'navy-shorts', 'brown-shoes')

def png(mask):
    b=io.BytesIO();Image.fromarray(mask.astype(np.uint8)).save(b,format='PNG',compress_level=9);return b.getvalue()

def canonical(files):
    b=io.BytesIO()
    with ZipFile(b,'w',compression=ZIP_DEFLATED,compresslevel=6) as z:
        for name,data in sorted(files.items()):
            info=ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;z.writestr(info,data)
    return b.getvalue()

def one_region(region):return protected_mask({'protected':[region]})

def main():
    authored=json.loads((ART/'authored-corrections.json').read_text())
    oldfiles={}
    with ZipFile(BASE) as z:
        assert z.testzip() is None
        files={name:z.read(name) for name in z.namelist()}
    oldfiles[str(BASE.relative_to(ROOT))]=sha(BASE.read_bytes())
    oldreg=files['registration.json'];reg=json.loads(oldreg);previous=deepcopy(reg)
    guides={f['frameId']:f for f in reg['frames']};oldguides={f['frameId']:f for f in previous['frames']}
    source,_,_,frames=load_source('male');assert source==files['source.character.zip']
    changed={};reviewfiles={};records=[]
    for correction in authored['corrections']:
        fid=correction['frameId'];label=correction['label'];g=guides[fid]
        oldregion=next(r for r in g['protected'] if r['label']==label)
        newregion={'label':label,'polygon':correction['polygon']}
        oldmask=one_region(oldregion);newmask=one_region(newregion)
        g['protected']=[newregion if r['label']==label else r for r in g['protected']]
        name=f'masks/{fid:03}/{label}.png';oldsemantic=np.asarray(Image.open(io.BytesIO(files[name])).convert('L')).copy()
        skin=np.asarray(Image.open(io.BytesIO(files[f'masks/{fid:03}/skin.png'])).convert('L'))
        # Add newly protected visible fingers; release the incorrectly classified
        # thigh/shoulder pixels. No source colours, silhouettes or guide points move.
        newsemantic=np.where(newmask,np.maximum(oldsemantic,skin),0).astype(np.uint8)
        files[name]=png(newsemantic)
        removed=oldmask&~newmask;added=newmask&~oldmask
        for kind,mask in [('removed',removed),('added',added)]:
            path=f'{fid:03}-{label}-{kind}.png';data=png(mask*255);reviewfiles[path]=data
        records.append({**correction,'removedPixels':int(removed.sum()),'addedPixels':int(added.sum()),'removedVisiblePixels':int((removed&(frames[fid][:,:,3]>0)).sum()),'addedVisiblePixels':int((added&(frames[fid][:,:,3]>0)).sum()),'removedMask':f'{fid:03}-{label}-removed.png','removedMaskSha256':sha(reviewfiles[f'{fid:03}-{label}-removed.png']),'addedMask':f'{fid:03}-{label}-added.png','addedMaskSha256':sha(reviewfiles[f'{fid:03}-{label}-added.png'])})
        changed[fid]=True
    for fid,g in guides.items():
        old=oldguides[fid];assert g['points']==old['points']
        assert [r for r in g['protected'] if r['label']=='head']==[r for r in old['protected'] if r['label']=='head']
    for name in ('format','version','sourceSha256','characterId','frameWidth','frameHeight','anchor'):
        assert reg[name]==previous[name]
    rb=json_bytes(reg);digest=sha(rb);REG.write_bytes(rb);(ART/'registration.json').write_bytes(rb)
    files['registration.json']=rb
    frameindex=json.loads(files['frame-index.json']);frameindex['registrationSha256']=digest;files['frame-index.json']=json_bytes(frameindex)
    files['GUIDE.md']=files['GUIDE.md'].replace(sha(oldreg).encode(),digest.encode())+b'\nThis male-full-outfits-v1 profile revises only source-visible hand/body protection boundaries. Its source, 17 landmarks and head protection are unchanged. The original male profile remains supported separately. See protection-review.json.\n'
    review={'format':'gathria-source-protection-review','version':1,'oldRegistrationSha256':sha(oldreg),'registrationSha256':digest,'sourceSha256':sha(source),'landmarksAndHeadPolygonsUnchanged':True,'corrections':records,'limitations':['Wrist cuts without a visible crease conservatively preserve skin contiguous with the fist. These are authored ownership boundaries, not recovered original video layers.','Source colour, source alpha, source frame sequence, timing, dimensions and anchor are unchanged.']}
    files['protection-review.json']=json_bytes(review)
    inventory=json.loads(files['inventory.json']);inventory['registration']={'file':'registration.json','bytes':len(rb),'sha256':digest}
    for record in inventory['masks']:
        data=files[record['file']];m=np.asarray(Image.open(io.BytesIO(data)).convert('L'));record.update(bytes=len(data),sha256=sha(data),nonzeroPixels=int((m>0).sum()),partialCoveragePixels=int(((m>0)&(m<255)).sum()))
    inventory['files']=[{'file':name,'bytes':len(data),'sha256':sha(data)} for name,data in sorted(files.items()) if name!='inventory.json']
    inventory['verification']['sourceAndRegistrationBytesUnchanged']=False
    inventory['verification'].update(sourceBytesUnchanged=True,sourceLandmarksAndHeadProtectionUnchanged=True,versionedHandProtectionRevision=True)
    files['inventory.json']=json_bytes(inventory)
    kit=canonical(files);KIT.write_bytes(kit)
    with ZipFile(io.BytesIO(kit)) as z:
        assert z.testzip() is None
        for name in z.namelist():
            if name.endswith('.png'):
                im=Image.open(io.BytesIO(z.read(name)));im.load();assert im.size==(704,1056)
    rebound=[]
    for item in IDS:
        oldpath=ROOT/f'docs/kling-wardrobe/garments/male/{item}.zip';oldbytes=oldpath.read_bytes();oldfiles[str(oldpath.relative_to(ROOT))]=sha(oldbytes)
        with ZipFile(io.BytesIO(oldbytes)) as z:garment={n:z.read(n) for n in z.namelist()}
        mf=json.loads(garment['manifest.json']);assert mf['registrationSha256']==sha(oldreg)
        maskpages=[np.asarray(Image.open(io.BytesIO(garment[p['maskFile']])).convert('RGBA')).copy() for p in mf['pages']]
        patchpages=[np.asarray(Image.open(io.BytesIO(garment[p['file']])).convert('RGBA')).copy() for p in mf['pages']]
        original_masks=[a.copy() for a in maskpages];original_patches=[a.copy() for a in patchpages]
        changes=[];removed_pages=[np.zeros(a.shape[:2],bool) for a in maskpages]
        for f in mf['frames']:
            r=f['rect'];off=f['offset'];own=maskpages[f['page']][r['y']:r['y']+r['height'],r['x']:r['x']+r['width'],3]>0
            protected=protected_mask(guides[f['frameId']])[off['y']:off['y']+r['height'],off['x']:off['x']+r['width']]
            source_visible=frames[f['frameId']][off['y']:off['y']+r['height'],off['x']:off['x']+r['width'],3]>0
            overlap=own&protected&source_visible
            if overlap.any():
                oldprotected=protected_mask(oldguides[f['frameId']])[off['y']:off['y']+r['height'],off['x']:off['x']+r['width']]
                assert not (overlap&oldprotected).any()
                view=removed_pages[f['page']][r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];view|=overlap
                changes.append({'frameId':f['frameId'],'newlyProtectedVisibleHandEdgePixels':int(overlap.sum())})
        for page,pagemeta in enumerate(mf['pages']):
            remove=removed_pages[page]
            if remove.any():
                maskpages[page][remove]=0;patchpages[page][remove]=0
                assert np.array_equal(maskpages[page][~remove],original_masks[page][~remove])
                assert np.array_equal(patchpages[page][~remove],original_patches[page][~remove])
                for name,array in [(pagemeta['maskFile'],maskpages[page]),(pagemeta['file'],patchpages[page])]:
                    b=io.BytesIO();Image.fromarray(array,'RGBA').save(b,format='PNG',compress_level=9);garment[name]=b.getvalue()
        mf['registrationSha256']=digest;garment['manifest.json']=json_bytes(mf)
        dest=ROOT/f'docs/kling-wardrobe/garments/male-full-outfits-v1/{item}.zip';dest.parent.mkdir(parents=True,exist_ok=True);data=canonical(garment);dest.write_bytes(data)
        with ZipFile(io.BytesIO(data)) as new,ZipFile(io.BytesIO(oldbytes)) as old:
            assert new.testzip() is None
            for name in old.namelist():
                if name!='manifest.json' and not any(removed_pages[p].any() and name in (pm['file'],pm['maskFile']) for p,pm in enumerate(mf['pages'])):
                    assert old.read(name)==new.read(name)
            n=json.loads(new.read('manifest.json'));n['registrationSha256']=sha(oldreg);assert n==json.loads(old.read('manifest.json'))
        rebound.append({'id':item,'path':str(dest.relative_to(ROOT)),'sha256':sha(data),'bytes':len(data),'originalArchiveUnchanged':True,'allOtherAtlasAndOwnershipPixelsUnchanged':True,'newProtectedIntersectionPixels':0,'handEdgeRepairs':changes})
    for name,oldsha in oldfiles.items():assert sha((ROOT/name).read_bytes())==oldsha
    (ART/'protection-differences.zip').write_bytes(canonical(reviewfiles))
    review['reboundGarments']=rebound;review['unchangedLegacyFiles']=oldfiles;review['templateSha256']=sha(kit);review['decodedMasks']=len(inventory['masks']);review['protectionDifferenceArchiveSha256']=sha((ART/'protection-differences.zip').read_bytes())
    (ART/'protection-review.json').write_text(json.dumps(review,indent=2)+'\n')
    ids=sorted(changed);sheet=Image.new('RGB',(352*8,430*((len(ids)+3)//4)),'#eee9df');draw=ImageDraw.Draw(sheet)
    for i,fid in enumerate(ids):
        for col,guide in enumerate((oldguides[fid],guides[fid])):
            im=frames[fid].copy();hp=protected_mask({'protected':[r for r in guide['protected'] if r['label']!='head']});im[hp,:3]=(im[hp,:3]*.4+np.array([255,25,25])*.6).astype(np.uint8)
            crop=Image.fromarray(im).crop((0,250,704,1056)).resize((352,403));x=(i%4*2+col)*352;y=i//4*430;sheet.paste(crop,(x,y+24),crop);draw.text((x+5,y+5),f'{fid} '+('old' if col==0 else 'reviewed'),fill='black')
    sheet.save(ART/'hand-protection-before-after.png')
    print(json.dumps({'registration':str(REG.relative_to(ROOT)),'registrationSha256':digest,'template':str(KIT.relative_to(ROOT)),'templateSha256':sha(kit),'rebound':rebound,'correctedFrames':ids},indent=2),flush=True)

if __name__=='__main__':main()
