#!/usr/bin/env node
/** Rebuild actual runtime before/after PNGs, local editable/export ZIPs and report. */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const source=String.raw`
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createWardrobeProject,selectWardrobeGarment,addWardrobeAppearanceBank,selectWardrobeAppearance,exportWardrobeProject,importWardrobeProject} from './src/wardrobe/project.ts';
import {createWardrobeCompositor,exportWardrobeCharacterPack} from './src/wardrobe/compositor.ts';
import {encodeSourceRgbaPng,decodeSourceRgbaPng} from './src/core/baked-source.ts';
import {readPortableCharacterPackArchive} from './src/core/pack.ts';
import {resolveGameplayMotion} from './src/core/gameplay-motion.ts';
const root=process.cwd(),temp='/tmp/coverage-audit/side',out=root+'/docs/wardrobe-coverage/side/review';mkdirSync(temp+'/downloads',{recursive:true});mkdirSync(out,{recursive:true});
const recipe=JSON.parse(readFileSync(root+'/artwork/wardrobe-coverage/side/recipe.json','utf8'));const inventory=recipe.items;const summary=[];
const bytes=(p:string)=>new Uint8Array(readFileSync(p));
for(const sex of ['male','female']){
 const items=inventory.filter((i:any)=>i.identity===sex&&['side-male-oxford-shirt-v1','side-male-stone-trousers-v1','side-female-cream-blouse-v1','side-female-rose-skirt-v1'].includes(i.id));
 let baseline,after;
 for(const edition of ['before','after']){
  let project=await createWardrobeProject(bytes(root+'/'+items[0].source),bytes(root+'/'+items[0].registration),items.map((i:any)=>edition==='before'?new Uint8Array(execFileSync('git',['show',recipe.baselineCommit+':'+i.path],{cwd:root,maxBuffer:64*1024*1024})):bytes(root+'/'+i.path)));
  for(const item of project.items)project=selectWardrobeGarment(project,item.manifest.slot,item.manifest.id);
  project=await addWardrobeAppearanceBank(project,bytes(root+'/docs/kling-side-expansion/assets/'+sex+'.appearance.zip'));
  project=selectWardrobeAppearance(project,{hairId:sex==='male'?'side-swept-crop':'side-tucked-bob'});
  const renderer=await createWardrobeCompositor(project);const dir=temp+'/actual/'+sex+'/'+edition;mkdirSync(dir,{recursive:true});
  const hashes=[];
  for(const f of renderer.sourceManifest.frames){const frame=renderer.renderFrame(f.id);writeFileSync(dir+'/'+String(f.id).padStart(3,'0')+'.png',encodeSourceRgbaPng(frame));hashes.push({frameId:f.id,sha256:createHash('sha256').update(frame.pixels).digest('hex')});}
  const motion=resolveGameplayMotion(project.archive.manifest,project.document.sourceSha256,project.archive.config);
  writeFileSync(temp+'/actual/'+sex+'/actions.json',JSON.stringify(motion.actions,null,2));renderer.dispose();
  if(edition==='after'){
   const saved=await exportWardrobeProject(project);const reopened=await importWardrobeProject(saved);const rr=await createWardrobeCompositor(reopened);
   for(const h of hashes){const frame=rr.renderFrame(h.frameId);if(createHash('sha256').update(frame.pixels).digest('hex')!==h.sha256)throw Error('Saved project mismatch '+sex+'/'+h.frameId);}
   rr.dispose();writeFileSync(temp+'/downloads/'+sex+'.wardrobe.zip',saved);
   const pack=await exportWardrobeCharacterPack(project,{gameplayMotion:motion});writeFileSync(temp+'/downloads/'+sex+'.character.zip',pack);
   const independent=readPortableCharacterPackArchive(pack),pages=[decodeSourceRgbaPng(independent.png),...(independent.additionalPngs??[]).map(p=>decodeSourceRgbaPng(p))];
   for(const f of independent.manifest.frames){const page=pages[f.page??0],rgba=new Uint8Array(f.width*f.height*4);for(let y=0;y<f.height;y++)rgba.set(page.pixels.subarray(((y+f.y)*page.width+f.x)*4,((y+f.y)*page.width+f.x+f.width)*4),y*f.width*4);if(createHash('sha256').update(rgba).digest('hex')!==hashes.find(h=>h.frameId===f.id)?.sha256)throw Error('Independent exported frame mismatch '+sex+'/'+f.id);}
   summary.push({identity:sex,frames:hashes.length,savedProjectReopenAllFramesExact:true,independentCharacterPackAllFramesExact:true,savedProjectBytes:saved.length,savedProjectSha256:createHash('sha256').update(saved).digest('hex'),characterPackBytes:pack.length,characterPackSha256:createHash('sha256').update(pack).digest('hex'),motionProfile:motion.id,zipArtifactLocation:temp+'/downloads/',zipArtifactsTracked:false});
  }
  console.log(sex,edition,hashes.length,'runtime frames');
 }
}
writeFileSync(out+'/export-verification.json',JSON.stringify(summary,null,2));

`;
const result=await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
