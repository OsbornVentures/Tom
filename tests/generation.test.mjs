import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../src/store.mjs';
import {Engine} from '../src/engine.mjs';
import {taskState} from '../src/harness/state.mjs';
import {Toolbox} from '../src/harness/tools.mjs';
import {generationFor,acceptGeneration} from '../src/harness/generation.mjs';
import {workingContext} from '../src/harness/context.mjs';
import {completion} from '../src/harness/checks.mjs';
import {validateBudget} from '../src/context.mjs';
import {generationContext} from '../src/harness/generation.mjs';
import {decode,grammar} from '../src/harness/protocol.mjs';
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tom-generation-'));const store=new Store(path.join(dir,'journal.sqlite'));try{await fn(dir,store);}finally{store.close();await fs.rm(dir,{recursive:true,force:true});}}
const budget={...validateBudget(),usedSteps:0,usedTokens:0};

test('file generation reports pressure and only counts a smaller measured input as compaction',async()=>fixture(async(dir,store)=>{
  const t=store.create('file',dir);store.message(t.id,{role:'user',content:'Create notes.txt with a brief plan.'});const state=await taskState(store,t.id,dir);
  const generation={kind:'file',path:'notes.txt',content:'',chunks:0},notices=[];let counts=0;
  const runtime={config:{context:4096},count:async()=>++counts===1?3900:1800};
  const options={state,generation,runtime,budget,cwd:dir,onPressure:d=>notices.push(d)};
  assert.equal((await generationContext(options)).compacted,true);assert.equal(notices.length,1);assert.equal(notices[0].inputTokens,3900);
  runtime.count=async()=>1800;assert.equal((await generationContext(options)).compacted,false);
}));
test('HTML game intent survives two follow-ups and does not infect a new hardware question',async()=>fixture(async(dir,store)=>{
  const t=store.create('game',dir);store.message(t.id,{role:'user',content:'make a local browser based minigame from html css3 and JS, surprise me with game content'});
  let s=await taskState(store,t.id,dir);assert.equal(s.requireArtifact,true);assert.equal(s.htmlArtifact,true);assert.deepEqual(s.outputs,['index.html']);store.saveWork(t.id,s);
  store.message(t.id,{role:'user',content:'make a mini test game . dnd y or no decisions that lead to victory or death'});s=await taskState(store,t.id,dir);assert.equal(s.htmlArtifact,true);store.saveWork(t.id,s);
  store.message(t.id,{role:'user',content:'can you make it a local file in your folder'});s=await taskState(store,t.id,dir);assert.match(s.objective,/victory or death/);assert.equal(s.htmlArtifact,true);store.saveWork(t.id,s);
  store.message(t.id,{role:'user',content:'What hardware are you running on tom?'});s=await taskState(store,t.id,dir);assert.equal(s.requireArtifact,false);assert.equal(s.htmlArtifact,false);
  const runtime={config:{context:4096,model:{name:'Local E4B'},threads:2},count:async()=>300};
  const p=await workingContext({state:s,history:store.messages(t.id),runtime,budget,cwd:dir,missing:[]});assert.match(JSON.stringify(p.messages),/Local E4B/);assert.match(JSON.stringify(p.messages),new RegExp(os.cpus()[0].model.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
}));
test('content drafts do not become file writes until the complete stream finishes',()=>{
  const s={},p={generation:{kind:'file',path:'index.html',content:'',chunks:0}};
  assert.equal(acceptGeneration(s,p,{content:'<!doctype html><html><body>',finish:'length'}),null);assert.ok(s.generation.content);
  const done=acceptGeneration(s,{generation:s.generation},{content:'Hello</body></html>',finish:'stop'});
  assert.equal(done.tool_calls[0].function.name,'write');assert.equal(JSON.parse(done.tool_calls[0].function.arguments).content,'<!doctype html><html><body>Hello</body></html>');assert.equal(s.generation,null);
  assert.throws(()=>acceptGeneration({},p,{content:'```html\n<main>unfinished',finish:'stop'}),/fence/);
} );
test('an explicitly closed file at the output limit does not trigger a phantom continuation',()=>{
  const s={},p={generation:{kind:'file',path:'index.html',content:'',chunks:0}};
  const done=acceptGeneration(s,p,{content:'```html\n<!doctype html><html><body>Done</body></html>\n```',finish:'length'});
  assert.equal(done?.tool_calls?.[0].function.name,'write');assert.equal(s.generation,null);
});
test('resuming a pre-repair task recovers its HTML intent from user history',async()=>fixture(async(dir,store)=>{
  const t=store.create('game',dir);store.message(t.id,{role:'user',content:'make a local browser based minigame from html css3 and JS, surprise me with game content'});store.message(t.id,{role:'user',content:'can you make it a local file in your folder'});
  const old=await taskState(store,t.id,dir);delete old.controllerRevision;old.objective='can you make it a local file in your folder';old.htmlArtifact=false;old.outputs=[];old.groups=['files'];store.saveWork(t.id,old);
  const repaired=await taskState(store,t.id,dir);assert.equal(repaired.htmlArtifact,true);assert.match(repaired.objective,/minigame/);assert.deepEqual(repaired.outputs,['index.html']);
}));
test('a staged file completes through ordinary write guards and automatic syntax checks',async()=>fixture(async(dir,store)=>{
  const t=store.create('function',dir);store.message(t.id,{role:'user',content:'Create solution.cjs exporting one function with module.exports that returns 3. Do not execute it.'});
  const runtime={config:{context:4096,model:{name:'Test'},threads:2},ensure:async()=>{},count:async()=>200,release(){},complete:async(_m,tools)=>tools.length?{role:'assistant',content:'Saved; execution was excluded.',finish:'stop',usage:{completion_tokens:10}}:{role:'assistant',content:'module.exports = () => 3;\n',finish:'stop',usage:{completion_tokens:15}}};
  const engine=new Engine(store,runtime,path.resolve('.'),()=>{});await engine.run(t.id);
  assert.equal(store.task(t.id).status,'complete');assert.match(await fs.readFile(path.join(dir,'solution.cjs'),'utf8'),/=> 3/);assert.equal(store.actions(t.id).length,1);assert.equal(store.work(t.id).checks[0].kind,'syntax');
  assert.ok(store.events(t.id).some(e=>e.kind==='draft'));
}));
test('calculation and example generation keep code and tool arguments separate',async()=>fixture(async(dir,store)=>{
  await fs.writeFile(path.join(dir,'input.json'),'[1,2]');const t=store.create('sum',dir);store.message(t.id,{role:'user',content:'Read input.json. Create result.json with the sum.'});
  const s=await taskState(store,t.id,dir);assert.equal(generationFor(s,dir,(await completion(s,dir)).missing),null);
  const box=new Toolbox({root:path.resolve('.'),cwd:dir,state:s,store,id:t.id,settings:{}});await box.execute('read',{path:'input.json'},{},new AbortController().signal);
  const g=generationFor(s,dir,(await completion(s,dir)).missing);assert.equal(g.kind,'calculation');
  const r=acceptGeneration(s,{generation:g},{content:'module.exports = data => data["input.json"].reduce((a,b)=>a+b,0);',finish:'stop'});
  assert.equal(JSON.parse(r.tool_calls[0].function.arguments).format,'module');
}));
test('the calculation prompt describes the same parsed input object that the helper executes',async()=>fixture(async(dir,store)=>{
  await fs.writeFile(path.join(dir,'input.csv'),'group,amount\na,3\na,-1\n');const t=store.create('data',dir);store.message(t.id,{role:'user',content:'Read input.csv. Create result.json with the sum of amount.'});
  const state=await taskState(store,t.id,dir),box=new Toolbox({root:path.resolve('.'),cwd:dir,state,store,id:t.id,settings:{}}),signal=new AbortController().signal;
  await box.execute('read',{path:'input.csv'},{},signal);
  const g=generationFor(state,dir,(await completion(state,dir)).missing);
  const p=await generationContext({state,generation:g,runtime:{config:{context:4096},count:async()=>300},budget,signal,cwd:dir});
  assert.match(JSON.stringify(p.messages),/exact data argument/);assert.ok(p.messages.some(m=>m.content.includes('"input.csv":[{"group":"a","amount":"3"}')));
  const a={path:'result.json',inputs:['input.csv'],code:'module.exports = data => data["input.csv"].reduce((s,r)=>s+Number(r.amount),0);',format:'module'};
  const prepared=await box.prepare('transform',a,signal),result=await box.execute('transform',a,prepared,signal);
  assert.equal(result.check.passed,true);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8')),2);
}));
test('a interrupted content stream is retained privately and resumes before publishing',async()=>fixture(async(dir,store)=>{
  const t=store.create('file',dir);store.message(t.id,{role:'user',content:'Create solution.cjs exporting one function with module.exports that returns 3. Do not execute it.'});let first=true;
  const runtime={config:{context:4096,model:{name:'Test'}},ensure:async()=>{},count:async()=>200,release(){},complete:async(_m,tools,_signal,delta)=>{if(first){first=false;delta({kind:'text',text:'module.exports = () => '});throw Error('The local response stream ended unexpectedly.');}if(!tools.length)return {role:'assistant',content:'3;\n',finish:'stop',usage:{completion_tokens:5}};return {role:'assistant',content:'Saved without executing.',finish:'stop',usage:{completion_tokens:8}};}};
  await new Engine(store,runtime,path.resolve('.'),()=>{}).run(t.id);assert.equal(store.task(t.id).status,'complete');assert.equal(await fs.readFile(path.join(dir,'solution.cjs'),'utf8'),'module.exports = () => 3;\n');
}));

test('a wrong model-written expectation gets a bounded review without rewriting correct code',async()=>fixture(async(dir,store)=>{
  store.saveSettings({commands:'allow'});
  const t=store.create('function',dir);store.message(t.id,{role:'user',content:'Create solution.cjs exporting one function with module.exports. Return the sum of numbers a and b.'});
  const source='module.exports = (a,b) => a+b;\n';let tests=0,calls=0;
  const runtime={config:{context:4096,model:{name:'Test'}},ensure:async()=>{},count:async()=>200,release(){},complete:async(messages,tools)=>{
    assert.ok(++calls<=6,'must not loop on a scheduled examples step');
    let reply;
    if(!tools.length)reply={role:'assistant',content:source};
    else if(tools.length===1&&tools[0].function.name==='test'){
      const cases=[{arguments:{a:2,b:3},expected:++tests===1?6:5},{arguments:{a:0,b:0},expected:0}];
      assert.throws(()=>decode(JSON.stringify({test:{path:'solution.cjs',cases:[...cases,...cases]}}),tools),/2–3 items/);
      reply=decode(JSON.stringify({test:{path:'solution.cjs',cases}}),tools);
    }else if(tools.length===1&&tools[0].function.name==='repair'){
      assert.match(JSON.stringify(messages),/observed/);
      reply=decode(JSON.stringify({repair:{path:'solution.cjs',target:'examples',reason:'2 + 3 is 5, not 6. The saved function adds correctly.'}}),tools);
    }else reply={role:'assistant',content:'Saved and checked against two examples.'};
    return {...reply,finish:'stop',usage:{completion_tokens:25}};
  }};
  await new Engine(store,runtime,path.resolve('.'),()=>{}).run(t.id);
  assert.equal(store.task(t.id).status,'complete');assert.equal(tests,2);
  assert.equal(await fs.readFile(path.join(dir,'solution.cjs'),'utf8'),source);
  const work=store.work(t.id),checks=work.checks.filter(c=>c.kind==='test');assert.deepEqual(checks.map(c=>c.passed),[false,true]);
  assert.equal(work.generation,null);assert.deepEqual(Object.values(work.repairAttempts),[1]);
  assert.equal(store.actions(t.id).filter(a=>a.body.operation==='write').length,1);
  const box=new Toolbox({root:path.resolve('.'),cwd:dir,state:work,store,id:t.id,settings:{}});
  work.checks.push({...checks[0]});work.repairAttempts[Object.keys(work.repairAttempts)[0]]=2;
  await assert.rejects(()=>box.execute('repair',{path:'solution.cjs',target:'examples',reason:'Again'},{}),/Two focused repairs/);
}));

test('test review includes mutation failures and constrains explanation length in sampling and validation',async()=>fixture(async(dir,store)=>{
  const t=store.create('function',dir);store.message(t.id,{role:'user',content:'Create solution.cjs exporting one function with module.exports that sorts numbers. Do not mutate the input.'});
  const state=await taskState(store,t.id,dir),box=new Toolbox({root:path.resolve('.'),cwd:dir,state,store,id:t.id,settings:{}}),signal=new AbortController().signal;
  const write={path:'solution.cjs',content:'module.exports = rows => rows.sort((a,b)=>a-b);'};
  await box.execute('write',write,await box.prepare('write',write,signal),signal);
  const args={path:'solution.cjs',cases:[{args:[[2,1]],expected:[1,2]}]};
  const result=await box.execute('test',args,await box.prepare('test',args,signal),signal);assert.equal(result.check.passed,false);
  const g=generationFor(state,dir,(await completion(state,dir)).missing),p=await generationContext({state,generation:g,runtime:{config:{context:4096},count:async()=>300},budget,signal,cwd:dir});
  assert.equal(p.mode,'test-review');assert.ok(p.messages.some(m=>m.content.includes('"inputUnchanged":false')));
  assert.match(grammar(p.tools),/char\{0,200\}/);
  assert.throws(()=>decode(JSON.stringify({repair:{path:'solution.cjs',target:'code',reason:'x'.repeat(201)}}),p.tools),/200 characters/);
}));
