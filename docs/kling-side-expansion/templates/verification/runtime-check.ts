import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createWardrobeProject, selectWardrobeGarment } from '../../../../src/wardrobe/project.ts';
import { createWardrobeCompositor } from '../../../../src/wardrobe/compositor.ts';
import { prepareProtection, protectedAt } from '../../../../src/wardrobe/protection.ts';
const root=process.cwd(), base='/tmp/side-expansion/templates/verification';
const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const bytes=(p:string)=>new Uint8Array(readFileSync(p));
const results=[];
for(const who of ['male','female']) {
 let project=await createWardrobeProject(bytes(`${root}/docs/kling-side-workspace/assets/${who}.source.zip`),bytes(`${root}/docs/kling-side-workspace/assets/${who}.registration.json`),[bytes(`${base}/${who}.garment.zip`)]);
 project=selectWardrobeGarment(project,'top',`${who}-authoring-fixture`);
 const compositor=await createWardrobeCompositor(project);
 const expected=JSON.parse(readFileSync(`${base}/${who}-expected.json`,'utf8'));
 for(const f of expected){
  const output=compositor.renderFrame(f.frameId);
  if(sha(output.pixels)!==f.sha256)throw Error(`${who} ${f.frameId}: runtime differs from offline replacement`);
  const source=compositor.renderSourceFrame(f.frameId);
  const registered=project.registration.frames.find(p=>p.frameId===f.frameId)!;
  const rows=prepareProtection(registered.protected), mask=new Uint8Array(512*768);
  for(let y=0;y<768;y++)for(let x=0;x<512;x++)if(source.pixels[(y*512+x)*4+3]!==0&&protectedAt(x,rows.get(y)))mask[y*512+x]=1;
  if(sha(mask)!==f.protectionSha256)throw Error(`${who} ${f.frameId}: protection raster differs`);
 }
 compositor.dispose();
 const empty=await createWardrobeProject(bytes(`${root}/docs/kling-side-workspace/assets/${who}.source.zip`),bytes(`${root}/docs/kling-side-workspace/assets/${who}.registration.json`),[bytes(`${base}/${who}-empty.garment.zip`)]);
 results.push({identity:who,frames:expected.length,strictV1Import:true,exactRuntimeReplacement:true,protectionRasterByteExact:true,unchangedSparseFrames:empty.items[0].manifest.frames.length});
 console.log(results.at(-1));
}
writeFileSync(`${base}/runtime-checks.json`,JSON.stringify(results,null,2)+'\n');
