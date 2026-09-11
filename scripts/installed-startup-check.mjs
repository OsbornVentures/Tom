import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {fingerprint} from '../src/qualification.mjs';
const root=path.resolve(import.meta.dirname,'..'),target=path.resolve(process.argv[2]);assert.ok(target.startsWith(path.join(root,'tmp')+path.sep));
await fs.mkdir(path.join(target,'.state'),{recursive:true});const config=JSON.parse(await fs.readFile(path.join(target,'config/runtime.json')));
const store=new Store(path.join(target,'.state/tom.sqlite'));store.saveSettings({budget:{},theme:'invalid',search:'missing',commands:'invalid',diagnostics:'yes',inference:{context:8192,threads:999,kvCache:'bad'}});store.close();
await fs.writeFile(path.join(target,'.state/qualification.json'),JSON.stringify({fingerprint:fingerprint(config),passed:true,contexts:[4096,8192],metrics:{},finished:new Date().toISOString()}));
const child=spawn(path.join(target,'runtime/node.exe'),[path.join(target,'src/server.mjs')],{cwd:target,windowsHide:true,env:{...process.env,TOM_PORT:'0',PATH:process.env.SystemRoot+'\\System32'},stdio:'ignore'});let base,key;
try{
 for(let i=0;i<100;i++){try{const s=JSON.parse(await fs.readFile(path.join(target,'.state/session.json')));if(s.pid===child.pid){const url=new URL(s.url);base=url.origin;key=new URLSearchParams(url.hash.slice(1)).get('key');break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 assert.ok(base,'The installed server must start promptly');const state=await(await fetch(base+'/api/state',{headers:{'X-Tom-Key':key}})).json();
 assert.equal(state.settings.budget.maxSteps,24);assert.equal(state.settings.budget.maxResponseTokens,2048);assert.equal(state.settings.theme,'night');assert.equal(state.settings.search,'google');assert.equal(state.settings.commands,'review');assert.equal(state.settings.diagnostics,false);assert.equal(state.settings.inference.context,8192);assert.equal(state.settings.inference.kvCache,'auto');assert.ok(state.settings.inference.threads<=8);
 await fetch(base+'/api/quit',{method:'POST',headers:{'X-Tom-Key':key,'Content-Type':'application/json'},body:'{}'});await new Promise(r=>setTimeout(r,2000));
 await fs.writeFile(path.join(root,'audit/installer-beta/final-startup-result.json'),JSON.stringify({passed:true,target,partialBudgetRepaired:true,invalidPreferencesRepaired:true,qualifiedContextPreserved:true,developmentPathRemoved:true},null,2));console.log('PASS: final installed build repairs invalid preferences and incomplete budgets, and preserves locally qualified context.');
}finally{if(child.exitCode===null)child.kill();}
