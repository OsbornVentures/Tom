import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),modules=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(modules,'playwright')),sharp=require(path.join(modules,'sharp'));
const {url}=JSON.parse(await fs.readFile('.state/session.json','utf8')),native=JSON.parse(await fs.readFile('.state/last-native-draft.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'&draft='+native.id);await page.locator('#quote-context:not([hidden])').waitFor();assert.match(await page.locator('#quote-context').textContent(),/vision-fixture.png/);assert.equal(await page.locator('#prompt').inputValue(),'Help me understand this file.');
 await page.locator('#new-chat').click();await page.screenshot({path:'audit/v03/tom-night.png'});
 await page.locator('#theme-button').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='day');await page.waitForTimeout(250);await page.screenshot({path:'audit/v03/tom-day.png'});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#workspace-label').textContent!=='Your workspace');assert.equal(await page.locator('html').getAttribute('data-theme'),'day');
 await page.locator('#theme-button').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='night');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'audit/v03/tom-narrow.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1440,height:960});
 const animation=await page.evaluate(async()=>{const k=await import('/kernel.js');k.setKernelState('running');let initial=k.kernelStats().frames;await new Promise(r=>setTimeout(r,1100));let frames=k.kernelStats().frames-initial;k.setKernelState('ready');initial=k.kernelStats().frames;await new Promise(r=>setTimeout(r,350));return {frames,idleFrames:k.kernelStats().frames-initial};});assert.ok(animation.frames>=10&&animation.frames<=18);assert.ok(animation.idleFrames>=2&&animation.idleFrames<=4);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(async()=>{const k=await import('/kernel.js');k.setKernelState('running');return k.kernelStats().animating;}),false);await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(async()=>{const k=await import('/kernel.js');k.setKernelState('ready');});
 // Export the exact UI drawing as transparent bitmap frames for older image editors.
 const assets=await page.evaluate(async()=>{const {drawKernel}=await import('/kernel.js'),canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const frames=[];for(let i=0;i<60;i++){drawKernel(canvas,i/60,'running');frames.push(canvas.toDataURL('image/png').split(',')[1]);}canvas.width=512;canvas.height=512;drawKernel(canvas,0,'ready');const still=canvas.toDataURL('image/png').split(',')[1];drawKernel(canvas,.25,'review');return {frames,still,amber:canvas.toDataURL('image/png').split(',')[1]};});
 await fs.mkdir('design-assets/kernel-frames',{recursive:true});for(let i=0;i<assets.frames.length;i++)await fs.writeFile('design-assets/kernel-frames/'+String(i).padStart(2,'0')+'.png',Buffer.from(assets.frames[i],'base64'));
 await fs.writeFile('design-assets/kernel-still.png',Buffer.from(assets.still,'base64'));await fs.writeFile('design-assets/kernel-review.png',Buffer.from(assets.amber,'base64'));await fs.copyFile('public/mark.svg','design-assets/kernel.svg');
 await sharp({create:{width:1280,height:768,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(assets.frames.map((data,i)=>({input:Buffer.from(data,'base64'),left:(i%10)*128,top:Math.floor(i/10)*128}))).png().toFile('design-assets/kernel-spritesheet.png');
 assert.equal(errors.length,0);await fs.writeFile('audit/v03/ui-check.json',JSON.stringify({passed:true,nativeDraft:true,night:true,dayPersisted:true,narrowOverflow:false,reducedMotion:true,...animation,errors},null,2));console.log('v0.3 UI passed: native draft, day/night persistence, narrow layout, 15fps cap, idle/reduced motion. Artwork exported.');
}finally{await browser.close();}
