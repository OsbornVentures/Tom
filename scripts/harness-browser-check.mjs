import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BrowserSession} from '../src/harness/browser.mjs';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'.state','harness-browser');await fs.mkdir(dir,{recursive:true});
const page=path.join(dir,'fixture.html');
await fs.writeFile(page,'<!doctype html><html><head><title>Tom browser fixture</title></head><body><h1>Local form</h1><label>Name <input aria-label="Name"></label><select aria-label="Color"><option value="red">Red</option><option value="blue">Blue</option></select><button id="save" onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value+\' / \'+document.querySelector(\'select\').value">Save</button><output>Waiting</output></body></html>');
const session=new BrowserSession(root),signal=new AbortController().signal;
try{
  let view=await session.act({action:'open',url:page},dir,signal);assert.equal(view.title,'Tom browser fixture');
  const initialBrowser=session.browser,stale=view.elements.find(e=>e.tag==='button').ref;
  view=await session.act({action:'type',target:view.elements.find(e=>e.tag==='input').ref,text:'Juniper'},dir,signal);
  await assert.rejects(session.act({action:'click',target:stale},dir,signal),/stale/);
  view=await session.act({action:'select',target:view.elements.find(e=>e.tag==='select').ref,text:'blue'},dir,signal);
  view=await session.act({action:'click',target:view.elements.find(e=>e.tag==='button').ref},dir,signal);
  assert.match(view.content,/Juniper \/ blue/);assert.equal(session.browser,initialBrowser);assert.deepEqual(view.pageErrors,[]);
  const button=view.elements.find(e=>e.tag==='button').ref;await session.page.locator('#save').evaluate(e=>e.textContent='Changed control');
  await assert.rejects(session.act({action:'click',target:button},dir,signal),/changed/);
  const result={passed:true,open:true,type:true,select:true,click:true,freshReferences:true,changedElementRejected:true,sessionReused:true,pageErrors:view.pageErrors};
  await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await session.close();}
