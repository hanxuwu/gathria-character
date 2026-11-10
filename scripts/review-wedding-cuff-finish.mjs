#!/usr/bin/env node
/** Render real wardrobe projects and verify the authored native cuff pixels. */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const source=String.raw`
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createWardrobeProject,selectWardrobeGarment,exportWardrobeProject,importWardrobeProject} from './src/wardrobe/project.ts';
import {createWardrobeCompositor} from './src/wardrobe/compositor.ts';
import {encodeSourceRgbaPng} from './src/core/baked-source.ts';
import {resolveGameplayMotion} from './src/core/gameplay-motion.ts';
const out=process.argv[2]??'/tmp/wardrobe-finish/male/actual';
mkdirSync(out,{recursive:true});
const art='artwork/kling-landing-production/cuff-finish/';
const read=(path:string)=>new Uint8Array(readFileSync(path));
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const recipe=JSON.parse(readFileSync(art+'recipe.json','utf8'));
const audit=JSON.parse(readFileSync(art+'audit.json','utf8'));
const sourceBytes=read('docs/kling-side-workspace/assets/male.source.zip');
const registration=read('artwork/kling-side-expansion/templates/male.registration.json');
const beforeTop=read(art+'baseline-top.garment.zip');
const afterTop=read('artwork/kling-landing-production/wedding/bases/male-wedding-top.garment.zip');
const bottom=read('artwork/kling-landing-production/wedding/bases/male-wedding-bottom.garment.zip');
if(sha(beforeTop)!==recipe.baselineSha256||sha(afterTop)!==audit.resultSha256||sha(sourceBytes)!==recipe.sourceSha256||sha(registration)!==recipe.registrationSha256)throw Error('Frozen binding changed');
const projects=[];const renderers=[];
for(const garment of [beforeTop,afterTop])for(const withBottom of [false,true]){
 let project=await createWardrobeProject(sourceBytes,registration,withBottom?[garment,bottom]:[garment]);
 for(const item of project.items)project=selectWardrobeGarment(project,item.manifest.slot,item.manifest.id);
 projects.push(project);renderers.push(await createWardrobeCompositor(project));
}
const [oldTop,oldFull,newTop,newFull]=renderers;
const expected=new Map(audit.records.map((r:any)=>[r.frameId,r]));
const rows=[];
for(const edition of ['before','after'])mkdirSync(out+'/'+edition,{recursive:true});
for(const frame of oldTop.sourceManifest.frames){
 const id=frame.id,bt=oldTop.renderFrame(id),at=newTop.renderFrame(id),bf=oldFull.renderFrame(id),af=newFull.renderFrame(id),wanted=new Uint8Array(bf.pixels);
 const authored=expected.get(id) as any;
 if(authored&&sha(at.pixels)!==authored.afterNativeRgbaSha256)throw Error('Authoring/runtime mismatch '+id);
 let changed=0;
 for(let i=0;i<bt.pixels.length;i+=4){
  if(bt.pixels.subarray(i,i+4).some((v,n)=>v!==at.pixels[i+n])){wanted.set(at.pixels.subarray(i,i+4),i);changed++;}
 }
 if(!authored&&changed)throw Error('Unaudited native frame changed '+id);
 if(sha(wanted)!==sha(af.pixels))throw Error('Unexpected outfit/layer changes '+id);
 writeFileSync(out+'/before/'+id+'.png',encodeSourceRgbaPng(bf));
 writeFileSync(out+'/after/'+id+'.png',encodeSourceRgbaPng(af));
 rows.push({frameId:id,changedPixels:changed,beforeSha256:sha(bf.pixels),afterSha256:sha(af.pixels)});
}
const saved=await exportWardrobeProject(projects[3]);
const reopened=await importWardrobeProject(saved);const rr=await createWardrobeCompositor(reopened);
for(const row of rows)if(sha(rr.renderFrame(row.frameId).pixels)!==row.afterSha256)throw Error('Saved project changed pixels '+row.frameId);
rr.dispose();
const motion=resolveGameplayMotion(projects[3].archive.manifest,projects[3].document.sourceSha256,projects[3].archive.config);
writeFileSync(out+'/actions.json',JSON.stringify(motion.actions,null,2)+'\n');
const report={format:'gathria-curved-cuff-actual-runtime-review',version:1,sourceSha256:sha(sourceBytes),registrationSha256:sha(registration),baselineTopSha256:sha(beforeTop),resultTopSha256:sha(afterTop),bottomSha256:sha(bottom),nativeFrames:rows.length,changedFrames:rows.filter(r=>r.changedPixels).length,allAuthoredPixelsMatchRuntime:true,otherFramesExact:true,allSavedProjectFramesExact:true,motionProfile:motion.id,sourceFps:24,zipArtifactLocation:out+'/current.wardrobe.zip',zipArtifactTracked:false,rows};
writeFileSync(out+'/current.wardrobe.zip',saved);writeFileSync(out+'/runtime-verification.json',JSON.stringify(report,null,2)+'\n');
for(const renderer of renderers)renderer.dispose();
console.log(JSON.stringify({...report,rows:undefined}));
`;
const result=await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
