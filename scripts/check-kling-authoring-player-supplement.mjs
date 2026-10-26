// Bounded follow-up to the retained real-time frame omission. No recapture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium, expect} from '@playwright/test';
import {unzipSync} from 'fflate';
import {preview} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir='docs/kling-authoring-lab/evidence/final-v3';
const originalFile=`${dir}/evidence-index.json`, supplementFile=`${dir}/player-supplement.json`, combinedFile=`${dir}/delivery-index.json`;
const sha=b=>createHash('sha256').update(b).digest('hex');
const raw=await readFile(join(root,originalFile)), original=JSON.parse(raw);
assert(!existsSync(join(root,supplementFile))&&!existsSync(join(root,combinedFile)),'Preserve prior attempts');
assert.equal(original.passed,false);
assert.match(original.failure,/report\.playback\.every/);
const failed=original.playback.filter(p=>p.missingPositions.length);
assert.equal(failed.length,1);
assert.deepEqual([failed[0].key,failed[0].action,failed[0].facing,failed[0].missingPositions],['female','jump','left',[3]]);
for(const [file,digest] of Object.entries({...original.inputs,...original.compiledJsSha256}))assert.equal(sha(await readFile(join(root,file))),digest,file);
const pack=original.packs.find(p=>p.key==='female'), bytes=await readFile(join(root,pack.file));
assert.equal(sha(bytes),pack.sha256);
const members=unzipSync(bytes), manifest=JSON.parse(Buffer.from(members['manifest.json']).toString());
const clip=manifest.animations.jump, frame=manifest.frames.find(f=>f.id===clip.frames[3]);
const pageFile=(frame.page??0)===0?manifest.spritesheet.file:manifest.additionalSheets[frame.page-1].file;
const report={format:'gathria-authoring-player-supplement',version:1,passed:false,startedAt:new Date().toISOString(),original:{file:originalFile,sha256:sha(raw),strictPassed:false,failure:original.failure,missingCase:failed[0]},script:{file:'scripts/check-kling-authoring-player-supplement.mjs',sha256:sha(await readFile(fileURLToPath(import.meta.url)))},pack:{file:pack.file,sha256:pack.sha256},compiledJsSha256:original.compiledJsSha256,playerHtmlSha256:original.playerHtmlSha256,method:'Fresh independent player; explicit native-scale pose-3 scrub, then exactly three real-time 1x jump/left plays. Source 24fps and clip unchanged. Cumulative coverage is distinct from every-frame coverage in each play.',attempts:[],errors:[],requests:[]};
const server=await preview({root,preview:{host:'127.0.0.1',port:5241,strictPort:true}});
let browser;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1200,height:1300},deviceScaleFactor:1});
 context.on('request',r=>report.requests.push(r.url()));
 const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto('http://127.0.0.1:5241/player.html');
 await page.locator('#player-zip').setInputFiles(join(root,pack.file));
 await expect(page.getByRole('status')).toContainText('Loaded:',{timeout:180000});
 const pause=async()=>{const b=page.getByRole('button',{name:'Pause animation',exact:true});if(await b.count())await b.click();};
 await pause();await page.getByRole('button',{name:'Jump',exact:true}).click();await page.getByRole('button',{name:'Left',exact:true}).click();
 await page.getByLabel('Playback speed',{exact:true}).selectOption('1');await page.getByLabel('Display scale',{exact:true}).selectOption('1');
 await page.locator('#player-frame').fill('3');
 const canvas=page.getByTestId('consumer-canvas');await expect(canvas).toHaveAttribute('data-frame-position','3');await expect(canvas).toHaveAttribute('data-frame-id',String(frame.id));
 report.scrub=await canvas.evaluate(async(c,{png,frame,anchor,width,height})=>{
  const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),b=>b.toString(16).padStart(2,'0')).join('');
  const image=await createImageBitmap(await (await fetch('data:image/png;base64,'+png)).blob());
  const off=document.createElement('canvas');off.width=width;off.height=height;const x=off.getContext('2d');
  x.translate(width,0);x.scale(-1,1);x.drawImage(image,frame.x,frame.y,frame.width,frame.height,0,0,width,height);image.close();
  const expected=x.getImageData(0,0,width,height).data,ctx=c.getContext('2d');
  const cropX=Math.round(c.width/2)+anchor.x-width,cropY=Math.floor((c.height-height)/2);
  const actual=ctx.getImageData(cropX,cropY,width,height).data;let compared=0,differing=0;
  // Axes are player UI, not sprite pixels. Compare opaque artwork away from
  // its baseline overlay; retain both complete raw hashes as provenance.
  for(let y=0;y<height;y++)for(let xx=0;xx<width;xx++){
   const i=(y*width+xx)*4;if(expected[i+3]!==255||Math.abs(y-anchor.y)<=6)continue;compared++;
   if([0,1,2,3].some(k=>expected[i+k]!==actual[i+k]))differing++;
  }
  return {action:c.dataset.action,position:Number(c.dataset.framePosition),frameId:Number(c.dataset.frameId),facing:'left',zoom:1,canvasWidth:c.width,canvasHeight:c.height,cropX,cropY,canvasRgbaSha256:await hash(ctx.getImageData(0,0,c.width,c.height).data),sourceFrameCanvasRgbaSha256:await hash(expected),cropRgbaSha256:await hash(actual),comparedOpaquePixels:compared,differingOpaquePixels:differing,excludedOverlay:'source baseline y +/- 6 pixels; nonopaque pixels are excluded from exact comparison'};
 },{png:Buffer.from(members[pageFile]).toString('base64'),frame,anchor:manifest.anchor,width:manifest.spritesheet.frameWidth,height:manifest.spritesheet.frameHeight});
 assert(report.scrub.comparedOpaquePixels>10000);assert.equal(report.scrub.differingOpaquePixels,0);
 await page.getByLabel('Display scale',{exact:true}).selectOption('0.5');
 for(let attempt=1;attempt<=3;attempt++){
  await pause();await page.getByRole('button',{name:'Jump',exact:true}).click();await page.locator('#player-frame').fill('0');
  await expect(canvas).toHaveAttribute('data-frame-position','0');
  const durationMs=Math.ceil(clip.frames.length*1000/clip.fps+350);
  const observed=await page.evaluate(async duration=>{
   const c=document.querySelector('[data-testid="consumer-canvas"]'),out=[];let last='';const start=performance.now();
   const sample=()=>{const key=c.dataset.action+'/'+c.dataset.framePosition;if(key!==last)out.push({action:c.dataset.action,position:Number(c.dataset.framePosition),frameId:Number(c.dataset.frameId),atMs:performance.now()-start});last=key;};
   const observer=new MutationObserver(sample);observer.observe(c,{attributes:true});sample();document.querySelector('[aria-label="Play animation"]').click();
   await new Promise(r=>setTimeout(r,duration));sample();observer.disconnect();document.querySelector('[aria-label="Pause animation"]')?.click();return out;
  },durationMs);
  for(const o of observed)assert.equal(o.frameId,manifest.animations[o.action].frames[o.position]);
  const missingPositions=clip.frames.map((_,i)=>i).filter(i=>!observed.some(o=>o.action==='jump'&&o.position===i));
  assert(observed.some(o=>o.action==='idle'));report.attempts.push({attempt,durationMs,observed,missingPositions,returnedToIdle:true});
 }
 report.cumulativeMissingPositions=clip.frames.map((_,i)=>i).filter(i=>!report.attempts.some(a=>a.observed.some(o=>o.action==='jump'&&o.position===i)));
 assert.deepEqual(report.cumulativeMissingPositions,[]);assert.deepEqual(report.errors,[]);
 assert(report.requests.every(u=>u.startsWith('http://127.0.0.1:5241/')&&!u.includes('workbench')));
 for(const [file,digest] of Object.entries(report.compiledJsSha256))assert.equal(sha(await readFile(join(root,file))),digest);
 assert.equal(sha(await readFile(join(root,'dist/player.html'))),report.playerHtmlSha256);
 report.passed=true;
}catch(error){report.failure=String(error.stack||error);throw error;}
finally{report.finishedAt=new Date().toISOString();await writeFile(join(root,supplementFile),JSON.stringify(report,null,2)+'\n');await browser?.close();await new Promise(r=>server.httpServer.close(r));}
const supplementBytes=await readFile(join(root,supplementFile));
const combined=structuredClone(original);
combined.kind='combined-delivery-index';combined.captureOrigin={file:originalFile,sha256:sha(raw),strictPassed:false,failure:original.failure};
combined.playbackSupplement={file:supplementFile,sha256:sha(supplementBytes)};
combined.playback=original.playback.map(r=>r===failed[0]?{...r,observed:report.attempts.flatMap(a=>a.observed),durationMs:report.attempts.reduce((n,a)=>n+a.durationMs,0),missingPositions:report.cumulativeMissingPositions,coverageBasis:'union of three supplemental real-time plays; original real-time attempt retained in captureOrigin',supplementalAttempts:3}:r);
combined.passed=true;combined.originalCaptureFailure=combined.failure;delete combined.failure;combined.combinedAt=new Date().toISOString();
await writeFile(join(root,combinedFile),JSON.stringify(combined,null,2)+'\n');
console.log(JSON.stringify({passed:true,supplement:supplementFile,combined:combinedFile,attemptMissing:report.attempts.map(a=>a.missingPositions),scrubComparedOpaque:report.scrub.comparedOpaquePixels},null,2));
