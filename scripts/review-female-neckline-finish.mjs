#!/usr/bin/env node
/** Actual runtime composition + independent baked export for the neckline finish. */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const source=String.raw`
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createWardrobeProject,selectWardrobeGarment,exportWardrobeProject,importWardrobeProject} from './src/wardrobe/project.ts';
import {createWardrobeCompositor,exportWardrobeCharacterPack} from './src/wardrobe/compositor.ts';
import {encodeSourceRgbaPng,decodeSourceRgbaPng} from './src/core/baked-source.ts';
import {readPortableCharacterPackArchive} from './src/core/pack.ts';
const root=process.cwd(), temp='/tmp/wardrobe-finish/female',out=root+'/docs/wardrobe-finish/female';mkdirSync(out,{recursive:true});mkdirSync(temp+'/downloads',{recursive:true});
const baseline=JSON.parse(readFileSync(root+'/artwork/wardrobe-finish/female/baseline.json','utf8'));const recipe=JSON.parse(readFileSync(out+'/repair-report.json','utf8'));
const bytes=(p:string)=>new Uint8Array(readFileSync(p));const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const snapshot=(path:string)=>{const b=new Uint8Array(execFileSync('git',['show',baseline.baselineCommit+':'+path],{cwd:root,maxBuffer:64*1024*1024}));const known=baseline.items.find((r:any)=>r.path===path);if(known&&sha(b)!==known.sha256)throw Error('Frozen input mismatch');return b;};
const originalRegistration='docs/kling-wardrobe/registration/female.json';
const tailRegistration='docs/dual-tailored/assets/female/original-tailored-v1.registration.json';
const sourceBytes=bytes(root+'/docs/kling-motion/exports/female.character.zip');
const summaries=[];
for(const item of baseline.items){
 const afterBytes=bytes(temp+'/candidate/'+item.path),record=recipe.items.find((r:any)=>r.path===item.path);
 if(sha(afterBytes)!==record.afterSha256)throw Error('Unreviewed candidate bytes');
 const reg=item.registrationSha256==='c2b19a7a63aa40619babcc23eaa97d1673e79e82e6f8aa157a733869c7a2f953'?originalRegistration:tailRegistration;
 let project=await createWardrobeProject(sourceBytes,bytes(root+'/'+reg),[afterBytes]);project=selectWardrobeGarment(project,item.slot,item.id);const renderer=await createWardrobeCompositor(project);let changed=0;const hashes=[];
 for(const f of renderer.sourceManifest.frames){const frame=renderer.renderFrame(f.id),hash=sha(frame.pixels),expected=record.changedFrames.find((r:any)=>r.frameId===f.id);if(expected){if(expected.afterRgbaSha256!==hash)throw Error('Independent compositor mismatch '+item.id+'/'+f.id);changed++;}hashes.push({frameId:f.id,sha256:hash});}
 renderer.dispose();summaries.push({path:item.path,itemId:item.id,archiveSha256:sha(afterBytes),frames:hashes.length,reviewedFramesMatch:changed,hashes});console.log(item.id,hashes.length,'runtime frames, reviewed masks exact');
}
const looks=[{id:'plum',path:'docs/kling-wardrobe/garments/female/plum-pintuck-top-v1.zip',bottom:'docs/kling-wardrobe/garments/female/ochre-shorts.zip'},{id:'day',path:'docs/kling-wardrobe/garments/female/coral-daydress-v9.zip'},{id:'wedding',path:'docs/kling-wardrobe/garments/female/ivory-wedding-dress-v9.zip'}];const exports=[];
for(const look of looks)for(const edition of ['before','after']){
 const input=edition==='before'?snapshot(look.path):bytes(temp+'/candidate/'+look.path);const files=[input];if(look.bottom)files.push(bytes(root+'/'+look.bottom));let project=await createWardrobeProject(sourceBytes,bytes(root+'/'+originalRegistration),files);for(const item of project.items)project=selectWardrobeGarment(project,item.manifest.slot,item.manifest.id);const renderer=await createWardrobeCompositor(project),dir=temp+'/actual/'+look.id+'/'+edition;mkdirSync(dir,{recursive:true});const hashes=[];
 for(const f of renderer.sourceManifest.frames){const frame=renderer.renderFrame(f.id);writeFileSync(dir+'/'+f.id+'.png',encodeSourceRgbaPng(frame));hashes.push({frameId:f.id,sha256:sha(frame.pixels)});}
 writeFileSync(temp+'/actual/actions.json',JSON.stringify(renderer.sourceManifest.animations,null,2));renderer.dispose();
 if(edition==='after'){
  const saved=await exportWardrobeProject(project),reopened=await importWardrobeProject(saved),rr=await createWardrobeCompositor(reopened);for(const h of hashes)if(sha(rr.renderFrame(h.frameId).pixels)!==h.sha256)throw Error('Reopen changed frame');rr.dispose();writeFileSync(temp+'/downloads/'+look.id+'.wardrobe.zip',saved);
  const packed=await exportWardrobeCharacterPack(project);writeFileSync(temp+'/downloads/'+look.id+'.character.zip',packed);const independent=readPortableCharacterPackArchive(packed),pages=[decodeSourceRgbaPng(independent.png),...(independent.additionalPngs??[]).map(decodeSourceRgbaPng)];
  for(const f of independent.manifest.frames){const p=pages[f.page??0],rgba=new Uint8Array(f.width*f.height*4);for(let y=0;y<f.height;y++)rgba.set(p.pixels.subarray(((y+f.y)*p.width+f.x)*4,((y+f.y)*p.width+f.x+f.width)*4),y*f.width*4);if(sha(rgba)!==hashes.find(h=>h.frameId===f.id)?.sha256)throw Error('Independent pack mismatch');}
  exports.push({look:look.id,frames:hashes.length,savedReopenAllFramesExact:true,independentPackAllFramesExact:true,projectSha256:sha(saved),packSha256:sha(packed),artifactLocation:temp+'/downloads',zipArtifactsTracked:false});
 }
 console.log(look.id,edition,'review PNG frames ready');
}
writeFileSync(out+'/runtime-verification.json',JSON.stringify({format:'gathria-female-neckline-finish-runtime',version:1,summary:{garments:summaries.length,frames:summaries.reduce((n,r)=>n+r.frames,0)},items:summaries,exports,visualAcceptance:'Review GIFs/native crops separately; runtime validity does not prove flawless art.'},null,2)+'\n');
`;
const result=await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
