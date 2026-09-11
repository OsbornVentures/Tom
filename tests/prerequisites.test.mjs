import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../src/store.mjs';
import {Engine} from '../src/engine.mjs';
import {taskState} from '../src/harness/state.mjs';
import {Toolbox} from '../src/harness/tools.mjs';
import {readPrerequisites} from '../src/harness/prerequisites.mjs';
import {generationFor} from '../src/harness/generation.mjs';

async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tom-prerequisites-')),store=new Store(path.join(dir,'journal.sqlite'));try{await fn(dir,store);}finally{store.close();await fs.rm(dir,{recursive:true,force:true});}}

test('known inputs are read and audited without spending a model turn on file opening',async()=>fixture(async(dir,store)=>{
  await fs.writeFile(path.join(dir,'source.cjs'),'module.exports = () => 0;\n');
  const task=store.create('copy',dir);store.message(task.id,{role:'user',content:'Read source.cjs. Create solution.cjs exporting one function with module.exports that returns 7. Do not execute it.'});
  let calls=0;const runtime={config:{context:4096,model:{name:'Fixture'}},ensure:async()=>{},count:async()=>200,release(){},complete:async(messages,tools)=>{
    calls++;if(!tools.length){assert.ok(messages.some(m=>m.content.includes('module.exports = () => 0')));return {role:'assistant',content:'module.exports = () => 7;',finish:'stop',usage:{completion_tokens:10}};}
    return {role:'assistant',content:'Saved; execution was excluded.',finish:'stop',usage:{completion_tokens:10}};
  }};
  await new Engine(store,runtime,path.resolve('.'),()=>{}).run(task.id);
  assert.equal(store.task(task.id).status,'complete');assert.equal(calls,2);assert.equal(store.budget(task.id).usedSteps,2);
  const reads=store.actions(task.id).filter(a=>a.body.operation==='read');assert.equal(reads.length,1);assert.equal(reads[0].body.actor,'controller');assert.equal(reads[0].status,'complete');
  assert.equal(store.work(task.id).metrics.controllerReads,1);assert.equal(store.events(task.id).filter(e=>e.kind==='model-input').length,2);
}));

test('prerequisite failures are recorded once and cancellation does not retry the read',async()=>fixture(async(dir,store)=>{
  const task=store.create('missing',dir);store.message(task.id,{role:'user',content:'Read missing.txt. Create result.txt.'});
  const state=await taskState(store,task.id,dir),box=new Toolbox({root:path.resolve('.'),cwd:dir,state,store,id:task.id,settings:{}}),signal=new AbortController().signal;
  state.sources.push('missing.txt');await readPrerequisites({state,box,cwd:dir,id:task.id,store,signal,emit(){}});
  assert.equal(store.actions(task.id).length,1);assert.equal(store.actions(task.id)[0].status,'failed');assert.match(state.last.result.error,/ENOENT/);
  const cancelled=new AbortController();cancelled.abort(new Error('cancelled'));
  await assert.rejects(()=>readPrerequisites({state,box,cwd:dir,id:task.id,store,signal:cancelled.signal,emit(){}}),/cancelled/);
  assert.equal(store.actions(task.id).length,1);
}));

test('a known source excerpt is marked truncated and does not trigger an automatic rewrite',async()=>fixture(async(dir,store)=>{
  await fs.writeFile(path.join(dir,'source.cjs'),Array.from({length:300},(_,i)=>'// line '+i).join('\n'));
  const task=store.create('long source',dir);store.message(task.id,{role:'user',content:'Read source.cjs. Create solution.cjs exporting one function with module.exports that returns 7.'});
  const state=await taskState(store,task.id,dir),box=new Toolbox({root:path.resolve('.'),cwd:dir,state,store,id:task.id,settings:{}}),signal=new AbortController().signal;
  await readPrerequisites({state,box,cwd:dir,id:task.id,store,signal,emit(){}});
  assert.equal(state.evidence[0].truncated,true);assert.equal(generationFor(state,dir,['Create solution.cjs']),null);
}));
