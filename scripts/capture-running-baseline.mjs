// Capture frozen V6 baseline through the real browser generator and ZIP exporter.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url), out = new URL('docs/running-baseline/', root);
const sources = ['src/core/generator-v6.ts','src/core/polished-rig.ts','src/core/polished-assets.generated.ts'];
const sha = data => createHash('sha256').update(data).digest('hex');
const configs = await Promise.all(['dress','suit'].map(async id => ({ id, config: JSON.parse(await readFile(new URL(`docs/art-polished/${id}-joyful/character.json`, root), 'utf8')) })));
const server = await createServer({server: {host:'127.0.0.1',port:5181,strictPort:true}});
await server.listen();
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5181/');
  const exports = await page.evaluate(async items => {
    const { generateCharacter } = await import('/src/core/generator.ts');
    const { createCharacterPack, loadCharacterPack } = await import('/src/core/pack.ts');
    const results = [];
    for (const item of items) {
      const g = generateCharacter(item.config), archive = await createCharacterPack(item.config,g), loaded = await loadCharacterPack(archive);
      const c = document.createElement('canvas'); c.width = g.width; c.height = g.height;
      const ctx = c.getContext('2d'); ctx.drawImage(loaded.image,0,0);
      if(ctx.getImageData(0,0,c.width,c.height).data.some((v,i)=>v!==g.pixels[i])) throw Error('Exported RGBA mismatch');
      results.push({...item,width:g.width,height:g.height,rgba:Array.from(g.pixels),bytes:Array.from(new Uint8Array(await archive.arrayBuffer()))});
    }
    return results;
  },configs);
  await mkdir(out,{recursive:true});
  const records=[];
  for(const item of exports){
    const dir=new URL(item.id+'/',out);await mkdir(dir,{recursive:true});
    const zip=Uint8Array.from(item.bytes);await writeFile(new URL(item.id+'.character.zip',out),zip);
    for(const [name,data] of Object.entries(unzipSync(zip))) await writeFile(new URL(name,dir),data);
    const historical = await readFile(new URL(`docs/art-polished/${item.id}-joyful/spritesheet.png`,root));
    const actual = await readFile(new URL('spritesheet.png',dir));
    assert.equal(sha(actual),sha(historical),'Current V6 differs from delivered V6 PNG');
    records.push({id:item.id,config:item.config,width:item.width,height:item.height,rgbaSha256:sha(Uint8Array.from(item.rgba)),pngSha256:sha(actual),zipSha256:sha(zip),matchesDeliveredV6Png:true});
  }
  const frozenFiles={};for(const source of sources)frozenFiles[source]=sha(await readFile(new URL(source,root)));
  await writeFile(new URL('baseline-index.json',out),JSON.stringify({capturedAt:new Date().toISOString(),artworkVersion:6,description:'Browser-generated V6 baseline; no motion extension; decoded PNG byte equality checked against renderer and delivered V6 PNG.',frozenFiles,exports:records},null,2)+'\n');
  console.log('Captured two browser-generated V6 packs; RGBA equality and original V6 PNG hashes verified.');
} finally {await browser.close();await server.close();}
