import fs from 'node:fs/promises';
import{buildPixelCandidate,themeActionGif,themeFramePng}from'./api.mjs';
const summary=[];
for(const look of ['male-wedding','female-everyday']){
 const sourcePath='/tmp/kling-pixel-refinement/final-v1/'+look+'.source.character.zip';
 const input=new Uint8Array(await fs.readFile(sourcePath));
 for(const [label,settings] of [
 ['legacy4',{factor:4,colors:128,sampling:'detail'}],
 ['plain6',{factor:6,colors:96,sampling:'detail'}],
 ['cluster6',{factor:6,colors:96,sampling:'detail',finish:'cluster'}]]){
  const start=Date.now(),key=`${look}-${label}`;
  const result=await buildPixelCandidate(input,settings);
  await fs.writeFile(new URL(key+'.character.zip',import.meta.url),result.bytes);
  await fs.writeFile(new URL(key+'.report.json',import.meta.url),JSON.stringify(result.report,null,2));
  await fs.writeFile(new URL(key+'-run.gif',import.meta.url),await themeActionGif(result.archive,'run','right'));
  for(const action of ['idle','run','jump']){
   const clip=result.archive.manifest.animations[action];
   for(const pos of [0,Math.floor(clip.frames.length/2)])
    await fs.writeFile(new URL(`${key}-${action}-${pos}.png`,import.meta.url),await themeFramePng(result.archive,clip.frames[pos],'right'));
  }
  summary.push({look,sourcePath,label,settings,ms:Date.now()-start,sha256:result.report.outputSha256,cleanup:result.report.cleanup});
  console.log(summary.at(-1));
 }
}
await fs.writeFile(new URL('summary.json',import.meta.url),JSON.stringify(summary,null,2));
