// Inspect the running development service and its actual model readiness, without creating a task.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'audit/startup-live');await fs.mkdir(out,{recursive:true});
const session=JSON.parse(await fs.readFile(path.join(root,'.state/session.json'))),url=new URL(session.url),headers={'X-Tom-Key':new URLSearchParams(url.hash.slice(1)).get('key')};
const {chromium}=await import(pathToFileURL(path.join(root,'runtime/browser/node_modules/playwright-core/index.mjs'))),browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(session.url);
 let final,sawBlocked=false,lastText='';
 for(let i=0;i<240;i++){
   const state=await(await fetch(url.origin+'/api/state',{headers})).json(),startup=state.qualification.startup;
   assert.equal(state.active,null,'Do not inspect while a user task is active.');
   const text=startup.events.at(-1)?.text;if(text&&text!==lastText){console.log(startup.phase+': '+text);lastText=text;}
   if(startup.phase==='attention')throw Error(startup.error);
   if(startup.phase==='ready'){final=state;break;}
   await page.locator('#startup-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#send-button').isDisabled(),true);assert.equal(await page.locator('#brand-home .kernel').isVisible(),true);assert.equal(await page.locator('#help-button').isVisible(),true);sawBlocked=true;
   await page.screenshot({path:path.join(out,'loading.png')});await new Promise(r=>setTimeout(r,1000));
 }
 assert.ok(final,'Startup must finish within the live-check allowance.');assert.equal(final.runtime.loaded,true);assert.equal(final.runtime.grammarVerified,true);
 await page.locator('#startup-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#send-button').isEnabled(),true);
 const moduleResults={};for(const name of ['app.js','ui.js','kernel.js','context-meter.js']){moduleResults[name]=(await fetch(url.origin+'/'+name)).status;assert.equal(moduleResults[name],200);}
 await page.locator('#help-button').click();assert.equal(await page.locator('#state-guide li').count(),9);await page.locator('#about-dialog .close-dialog').first().click();
 assert.equal(await page.locator('#brand-home canvas').getAttribute('data-drawn'),'true');assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'ready.png')});
 const result={passed:true,model:final.modelIdentity,actualModelLoaded:final.runtime.loaded,grammarVerified:final.runtime.grammarVerified,sawBlocked,modules:moduleResults,steps:final.qualification.startup.steps,events:final.qualification.startup.events,errors};await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log('PASS: actual selected model loaded, readiness probe passed, UI unlocked, avatar rendered and Help opened.');
}finally{await browser.close();}
