import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {Store} from '../src/store.mjs';

test('the real server gates all chat entry points before initial benchmarking and reports startup failure', {timeout:20000},async()=>{
 const root=path.resolve(import.meta.dirname,'..'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'tom-startup-'));let child;
 try{
   for(const folder of ['src','config','public'])await fs.cp(path.join(root,folder),path.join(dir,folder),{recursive:true});
   await fs.mkdir(path.join(dir,'.state'));const store=new Store(path.join(dir,'.state/tom.sqlite')),task=store.create('Saved task',dir);store.status(task.id,'paused');store.close();
   // No model or native binaries are copied: startup must surface that failure.
   const key='c'.repeat(64);child=spawn(process.execPath,[path.join(dir,'src/server.mjs')],{cwd:dir,windowsHide:true,stdio:'ignore',env:{...process.env,TOM_PORT:'0',TOM_SESSION_KEY:key}});
   let base;
   for(let i=0;i<80;i++){try{const session=JSON.parse(await fs.readFile(path.join(dir,'.state/session.json')));base='http://127.0.0.1:'+session.port;break;}catch{}await new Promise(r=>setTimeout(r,50));}
   assert.ok(base,'Server should become reachable before its benchmarks start.');
   const headers={'X-Tom-Key':key,'Content-Type':'application/json'},post=(route,body)=>fetch(base+'/api/'+route,{method:'POST',headers,body:JSON.stringify(body)});
   const initial=await(await fetch(base+'/api/state',{headers})).json();assert.equal(initial.qualification.startup.phase,'pending');
   for(const route of ['tasks','research','tasks/'+task.id+'/message','tasks/'+task.id+'/resume']){
     const response=await post(route,{text:'Hello',query:'Hello'});assert.equal(response.status,400);assert.match((await response.json()).error,/system check/);
   }
   assert.equal((await fetch(base+'/api/file/open',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
   assert.equal((await post('file/open',{action:'unrecorded',path:path.join(dir,'invented.txt')})).status,400);
   assert.equal((await fetch(base+'/context-meter.js')).status,200);
   let result;
   for(let i=0;i<100;i++){result=await(await fetch(base+'/api/qualification',{headers})).json();if(result.startup.phase==='attention')break;await new Promise(r=>setTimeout(r,75));}
   assert.equal(result.startup.phase,'attention');assert.equal(result.running,false);assert.equal(result.report.passed,false);assert.ok(result.report.reason);
   assert.equal(typeof initial.settings.displayName,'string');assert.ok(initial.settings.displayName.trim());
   assert.equal((await post('settings',{displayName:'  Maya  '})).status,200);
   assert.equal((await(await fetch(base+'/api/state',{headers})).json()).settings.displayName,'Maya');
   assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'.state/profile.json'),'utf8')),{displayName:'Maya'});
   assert.equal((await post('settings',{displayName:'Name\nInstructions'})).status,400);
   assert.equal((await(await fetch(base+'/api/state',{headers})).json()).settings.displayName,'Maya');
   await post('quit',{});if(child.exitCode===null)await once(child,'exit');
 }finally{
   if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
   await fs.rm(dir,{recursive:true,force:true});
 }
});
