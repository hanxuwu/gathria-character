#!/usr/bin/env node
/** Real-asset regression: actual compositor must match only the frozen edits. */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const source=String.raw`
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWardrobeProject,selectWardrobeGarment} from './src/wardrobe/project.ts';
import {createWardrobeCompositor} from './src/wardrobe/compositor.ts';
const recipe=JSON.parse(readFileSync('artwork/wardrobe-coverage/side/recipe.json','utf8'));
const digest=(data)=>createHash('sha256').update(data).digest('hex');
const report=[];
for(const item of recipe.items){
 const read=(p)=>new Uint8Array(readFileSync(p));
 const baseline=new Uint8Array(execFileSync('git',['show',recipe.baselineCommit+':'+item.path],{maxBuffer:64*1024*1024}));
 if(digest(baseline)!==item.baselineSha256)throw Error('Baseline changed: '+item.id);
 if(digest(read(item.source))!==item.sourceSha256||digest(read(item.registration))!==item.registrationSha256)throw Error('Source/registration changed: '+item.id);
 const beforeBase=await createWardrobeProject(read(item.source),read(item.registration),[baseline]);
 const afterBase=await createWardrobeProject(read(item.source),read(item.registration),[read(item.path)]);
 const slot=beforeBase.items[0].manifest.slot;
 const before=await createWardrobeCompositor(selectWardrobeGarment(beforeBase,slot,item.id));
 const after=await createWardrobeCompositor(selectWardrobeGarment(afterBase,slot,item.id));
 const edits=new Map(item.frames.map(e=>[e.frameId,e]));let frames=0,changedPixels=0;
 for(const f of before.sourceManifest.frames){
  const old=before.renderFrame(f.id),output=after.renderFrame(f.id),source=before.renderSourceFrame(f.id),expected=new Uint8Array(old.pixels);
  const edit=edits.get(f.id);const w=old.width;
  if(edit){
   if(digest(source.pixels)!==edit.sourceRgbaSha256)throw Error('Source frame changed '+item.id+'/'+f.id);
   for(const[x,y,sx,sy] of edit.copyPixels){const i=(y*w+x)*4,d=(sy*w+sx)*4;expected.set(old.pixels.subarray(d,d+3),i);expected[i+3]=source.pixels[i+3];changedPixels++;}
   for(const[x,y] of edit.releasePixels??[]){const i=(y*w+x)*4;expected.set(source.pixels.subarray(i,i+4),i);changedPixels++;}
  }
  if(digest(expected)!==digest(output.pixels))throw Error('Unexpected pixel changes '+item.id+'/'+f.id);
  frames++;
 }
 before.dispose();after.dispose();report.push({id:item.id,frames,recordedPixels:changedPixels,allOtherPixelsExact:true});
 console.log(item.id,frames,'native frames exact');
}
writeFileSync('docs/wardrobe-coverage/side/integrity-verification.json',JSON.stringify({format:'gathria-side-cloth-coverage-runtime-proof',version:1,baselineCommit:recipe.baselineCommit,items:report},null,2)+'\n');
console.log('Verified',report.length,'banks;',report.reduce((n,r)=>n+r.frames,0),'native frames.');
`;
const result=await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
