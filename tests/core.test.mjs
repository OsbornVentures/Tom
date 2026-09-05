import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {hash,validateTool,writeTool,shellTool} from '../src/tools.mjs';
import {sseData} from '../src/runtime.mjs';
import {modelOptions} from '../src/capabilities.mjs';

test('a file edit saves its exact previous bytes and verifies its replacement',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tom-write-'));try{
    const file=path.join(dir,'Thomas — café.txt');await writeFile(file,'Original\n');
    const result=await writeTool({path:file,content:'Revised ✓\n',expectedHash:hash('Original\n')},dir,path.join(dir,'snapshots'));
    assert.equal(await readFile(file,'utf8'),'Revised ✓\n');assert.equal(await readFile(result.snapshot,'utf8'),'Original\n');assert.equal(result.sha256,hash('Revised ✓\n'));
  }finally{await rm(dir,{recursive:true});}
});
test('stale edits and create-over-existing fail without modifying the file',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tom-conflict-'));try{
    await writeFile(path.join(dir,'note.txt'),'Keep me');
    for(const expectedHash of ['new',hash('old')])await assert.rejects(writeTool({path:'note.txt',content:'No',expectedHash},dir,path.join(dir,'snapshots')),/changed|exists/);
    assert.equal(await readFile(path.join(dir,'note.txt'),'utf8'),'Keep me');
  }finally{await rm(dir,{recursive:true});}
});
test('aborted writes never commit a replacement',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tom-abort-'));try{const c=new AbortController();c.abort();await assert.rejects(writeTool({path:'new.txt',content:'No',expectedHash:'new'},dir,path.join(dir,'snapshots'),c.signal));await assert.rejects(readFile(path.join(dir,'new.txt')),/ENOENT/);}finally{await rm(dir,{recursive:true});}
});
test('tool validation rejects unknown capabilities, extra fields and malformed arguments',()=>{
  assert.throws(()=>validateTool({name:'delete',arguments:{}}));
  assert.throws(()=>validateTool({name:'shell',arguments:{summary:'Check',program:'cmd',args:'echo',administrator:true}}));
  assert.throws(()=>validateTool({name:'write',arguments:{summary:'Save',path:'x',content:'x',expectedHash:'guess'}}));
  assert.throws(()=>validateTool({name:'shell',arguments:'{"bad":'}));
  assert.throws(()=>validateTool({name:'shell',arguments:{summary:'Read a file',program:'powershell.exe',args:['-NoProfile','-NonInteractive','-Command']}}),/missing its command/);
  assert.equal(validateTool({name:'shell',arguments:{summary:'Print a number',program:process.execPath,args:['-e','console.log(123)']}}).name,'shell');
  assert.equal(validateTool({name:'write',arguments:{summary:'Create a note',path:'note.txt',content:'hello'}}).arguments.expectedHash,'new');
});
test('native command output is streamed and exit failure remains visible',async()=>{
  let streamed='';const result=await shellTool({program:process.execPath,args:['-e','console.log("hello ✓");process.exitCode=7']},process.cwd(),undefined,s=>streamed+=s);
  assert.equal(result.exitCode,7);assert.match(streamed,/hello ✓/);
});
test('cancellation terminates an app-owned native process',async()=>{
  const c=new AbortController(),start=Date.now();setTimeout(()=>c.abort(),250);
  const result=await shellTool({program:process.execPath,args:['-e','setInterval(()=>{},1000)']},process.cwd(),c.signal);
  assert.equal(result.cancelled,true);assert.ok(Date.now()-start<5000);
});
test('restart preserves results and flags uncertain side effects without replay',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tom-journal-'));let store;try{
    const db=path.join(dir,'test.sqlite');store=new Store(db);const task=store.create('A task',dir);store.message(task.id,{role:'user',content:'Hello'});store.status(task.id,'running');const a=store.action(task.id,{name:'shell'});store.finishAction(a.id,'running');const event=store.event(task.id,'action','Inspect a file');store.close();store=new Store(db);
    assert.equal(store.task(task.id).status,'interrupted');assert.equal(store.getAction(a.id).status,'uncertain');assert.equal(store.messages(task.id)[0].content,'Hello');assert.equal(store.events(task.id)[0].id,event.id);
  }finally{store?.close();await rm(dir,{recursive:true});}
});
test('SSE parsing preserves split Unicode and split event boundaries',async()=>{
  const bytes=new TextEncoder().encode('data: {"text":"café ✓"}\r\n\r\ndata: [DONE]\n\n');
  async function* chunks(){for(let i=0;i<bytes.length;i+=2)yield bytes.slice(i,i+2);}
  const result=[];for await(const line of sseData(chunks()))result.push(line);
  assert.deepEqual(result,['{"text":"café ✓"}','[DONE]']);
});
test('large RAM alone never qualifies a larger model for installation',()=>{
  for(const availableGiB of [1,4,8,32,128]){const models=modelOptions({availableGiB},{verified:true});assert.ok(models.filter(x=>!x.bundled).every(x=>!x.installable));}
});
