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
 const path=`${root}/artwork/kling-side-expansion/templates/${who}.registration.json`;
 const project=await createWardrobeProject(bytes(`${root}/docs/kling-side-workspace/assets/${who}.source.zip`),bytes(path));
 const compositor=await createWardrobeCompositor(project);
 for(const frame of project.registration.frames){
  const a=compositor.renderFrame(frame.frameId),b=compositor.renderSourceFrame(frame.frameId);
  if(sha(a.pixels)!==sha(b.pixels))throw Error('Candidate registration changed source pixels');
 }
 compositor.dispose();
 results.push({identity:who,frames:project.registration.frames.length,sourceSha256:project.document.sourceSha256,registrationSha256:project.document.registrationSha256,strictV1Import:true,originalRgbaExact:true});
 console.log(results.at(-1));
}
writeFileSync(`${base}/candidate-registration-checks.json`,JSON.stringify(results,null,2)+'\n');
