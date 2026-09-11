import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {Engine} from '../src/engine.mjs';
import {compactMessages,responseAllowance,validateBudget,BudgetReached,prepareContext} from '../src/context.mjs';
const base={...validateBudget(),usedSteps:0,usedTokens:0,usedMs:0,pendingTokens:0};
test('context compacts before a file action loses its reserved output space',async()=>{let saved=false;const result=await prepareContext({history:[{role:'user',content:'Create a webpage'}],actions:[],system:{role:'system',content:'Test'},runtime:{config:{context:4096},count:async m=>m.some(x=>x.content?.startsWith('Saved task checkpoint:'))?1600:2661},budget:base,save:()=>saved=true,emit:()=>{}});assert.equal(result.maxTokens,2048);assert.equal(saved,true);});
async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'tom-context-')),file=path.join(root,'test.sqlite');let store=new Store(file);try{await fn({root,file,store,replace:s=>store=s});}finally{store.close();await rm(root,{recursive:true});}}
function runtime(complete){return {config:{context:4096,model:{name:'Test model'}},ensure:async()=>{},count:async m=>600+Math.ceil(JSON.stringify(m).length/4),complete,release(){}};}
test('output allowance uses context and remaining task budget rather than a 900-token cap',()=>{
  assert.equal(responseAllowance(900,4096,base),2048);assert.equal(responseAllowance(3500,4096,base),468);
  assert.equal(responseAllowance(900,4096,{...base,usedTokens:12100}),188);
  assert.throws(()=>responseAllowance(900,4096,{...base,usedSteps:24}),BudgetReached);
});
test('compaction retains the exact request, verified paths/hashes and action identities',()=>{
  const request={role:'user',content:'Keep the names Thomas and café exactly. Save only to C:\\work.'};
  const actions=[{id:'act-1',status:'complete',body:{name:'write',arguments:{summary:'Save the result'}},result:{verified:true,path:'C:\\work\\café.txt',sha256:'abc'}},{id:'act-2',status:'uncertain',body:{name:'shell',arguments:{summary:'Inspect'}}}];
  const m=compactMessages([request,{role:'tool',content:'large'.repeat(10000)}],actions,1);assert.deepEqual(m[0],request);const json=JSON.stringify(m);for(const value of ['café.txt','abc','act-1','act-2','uncertain','tom-recall'])assert.ok(json.includes(value));assert.ok(json.length<2000);
});
test('a second compaction keeps an evidence preview from the first action',()=>{
 const history=[{role:'user',content:'Collect all required codes.'}];const actions=Array.from({length:8},(_,i)=>({id:'a'+i,status:'complete',body:{name:'shell',arguments:{summary:'Read source '+i}},result:{exitCode:0,output:'Required code: MAPLE-'+i+'\n'+'.'.repeat(6000)}}));
 for(const level of [0,1]){const compact=JSON.stringify(compactMessages(history,actions,level));assert.ok(compact.includes('MAPLE-0'));assert.ok(compact.includes('MAPLE-7'));}
});
test('a checkpoint explicitly focuses on the latest revision request',()=>{const m=compactMessages([{role:'user',content:'Create index.html'},{role:'assistant',content:'The first page is complete.'},{role:'user',content:'Create index-v2.html with revised hours.'}],[],1);assert.match(m.at(-1).content,/Latest user request: Create index-v2.html with revised hours/);assert.match(m.at(-1).content,/not an older deliverable/);});

test('a new research subject retains earlier action identities without reloading old page bodies',()=>{
 const history=[{role:'user',content:'Weather in Lorena TX'},{role:'assistant',tool_calls:[{id:'weather-call'}]},{role:'user',content:'Search for cookie recipes'},{role:'assistant',tool_calls:[{id:'cookie-call'}]}];
 const actions=[['weather','OLD_WEATHER_PAGE'],['cookie','CURRENT_COOKIE_PAGE']].map(([id,output])=>({id,status:'complete',body:{name:'shell',callId:id+'-call',arguments:{program:'tom-browser',summary:'Read '+id}},result:{exitCode:0,output}}));
 const memory=compactMessages(history,actions,1).find(m=>m.content?.startsWith('Saved task checkpoint:')).content;
 assert.doesNotMatch(memory,/OLD_WEATHER_PAGE/);assert.match(memory,/CURRENT_COOKIE_PAGE/);assert.match(memory,/"id":"weather"/);
 assert.equal(actions[0].result.output,'OLD_WEATHER_PAGE','The durable evidence remains intact.');
});

test('evidence instructions are counted before reserving the response window',async()=>{
 const instruction='Read the remaining source. '.repeat(80),count=async messages=>300+Math.ceil(JSON.stringify(messages).length/4);
 const result=await prepareContext({history:[{role:'user',content:'Search cookie recipes'},{role:'tool',content:'old page '.repeat(900)}],actions:[],system:{role:'system',content:'Test'},runtime:{config:{context:4096},count},budget:{...base,maxResponseTokens:900},instruction,save:()=>{},emit:()=>{}});
 assert.ok(result.compacted);assert.match(result.messages.at(-1).content,/Read the remaining source/);
 assert.equal(result.inputTokens,await count(result.messages));assert.ok(result.inputTokens+result.maxTokens+128<=4096);assert.equal(result.maxTokens,900);
});
test('one multi-step task compacts tool history and completes without replaying actions',async()=>fixture(async({root,store})=>{
  store.saveSettings({commands:'automatic'});const task=store.create('Six checks',root);store.message(task.id,{role:'user',content:'Run six commands for distinct facts. Keep MAPLE-73 as the final reference.'});let calls=0;const allowances=[];
  const worker=runtime(async(messages,tools,signal,delta,options)=>{
    allowances.push(options.maxTokens);assert.ok(JSON.stringify(messages).includes('MAPLE-73'));
    if(calls++<6)return {role:'assistant',content:'',tool_calls:[{id:'call-'+calls,type:'function',function:{name:'run',arguments:JSON.stringify({program:process.execPath,args:['-e','console.log('+JSON.stringify('Fact '+calls+' '+'.'.repeat(6500))+')']})}}],usage:{completion_tokens:100},finish:'tool_calls'};
    return {role:'assistant',content:'MAPLE-73. Six checks completed.',usage:{completion_tokens:10},finish:'stop'};
  });await new Engine(store,worker,root,()=>{}).run(task.id);
  assert.equal(store.task(task.id).status,'complete');assert.equal(store.actions(task.id).length,6);assert.ok(store.checkpoint(task.id));assert.ok(store.events(task.id).filter(e=>e.kind==='context').length>=2);assert.equal(store.budget(task.id).usedSteps,7);assert.equal(store.budget(task.id).usedTokens,610);assert.ok(allowances[0]>900);assert.ok(store.messages(task.id).some(m=>m.role==='tool'&&m.content.length>6000));
}));
test('a clipped reply continues instead of being marked complete',async()=>fixture(async({root,store})=>{
 const task=store.create('Long answer',root);store.message(task.id,{role:'user',content:'Explain'});let calls=0;const engine=new Engine(store,runtime(async messages=>{calls++;if(calls===2)assert.ok(messages.some(m=>m.content?.includes('Continue from its ending')));return {role:'assistant',content:calls===1?'First segment':'Final segment',usage:{completion_tokens:30},finish:calls===1?'length':'stop'};}),root,()=>{});await engine.run(task.id);assert.equal(calls,2);assert.equal(store.task(task.id).status,'complete');assert.equal(store.budget(task.id).usedTokens,60);
}));
test('a write rejected before changes can correct its precondition without uncertain-state lockout',async()=>fixture(async({root,store})=>{
 const task=store.create('Create a file',root);store.message(task.id,{role:'user',content:'Create note.txt with hello.'});let calls=0;
 const engine=new Engine(store,runtime(async()=>{calls++;return calls<3?{role:'assistant',content:'',tool_calls:[{id:'write-'+calls,type:'function',function:{name:'write',arguments:JSON.stringify({path:'note.txt',content:'hello',...(calls===1?{base:'missing-reference'}:{})})}}],usage:{completion_tokens:20},finish:'tool_calls'}:{role:'assistant',content:'Saved',usage:{completion_tokens:3},finish:'stop'};}),root,()=>{});
 await engine.run(task.id);assert.equal(store.task(task.id).status,'complete');assert.deepEqual(store.actions(task.id).map(a=>a.status),['complete']);assert.equal(store.actions(task.id)[0].result.verified,true);assert.ok(store.events(task.id).some(e=>e.kind==='tool-error'));
}));
test('pause and database restart preserve spent budget, including interrupted inference',async()=>fixture(async({root,file,store,replace})=>{
 const task=store.create('Pause me',root);store.message(task.id,{role:'user',content:'Explain'});let began;const started=new Promise(r=>began=r);
 const engine=new Engine(store,runtime(async(m,t,signal)=>{began();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}),root,()=>{});
 const running=engine.run(task.id);await started;engine.cancel(task.id,'pause');await running;const before=store.budget(task.id);assert.equal(before.usedSteps,1);assert.ok(before.usedTokens>900);store.close();store=new Store(file);replace(store);
 await new Engine(store,runtime(async()=>({role:'assistant',content:'Done',usage:{completion_tokens:3},finish:'stop'})),root,()=>{}).run(task.id);assert.equal(store.budget(task.id).usedTokens,before.usedTokens+3);assert.equal(store.budget(task.id).usedSteps,2);
}));
test('step and active-time budgets stop with durable results',async()=>fixture(async({root,store})=>{
 store.saveSettings({budget:{...validateBudget(),maxSteps:1,maxActiveMs:1000}});const task=store.create('Time limit',root);store.message(task.id,{role:'user',content:'Explain'});
 const worker=runtime(async(m,t,signal)=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});}));await new Engine(store,worker,root,()=>{}).run(task.id);assert.equal(store.task(task.id).status,'budget');assert.ok(store.budget(task.id).usedMs>=1000);
 let calls=0;await new Engine(store,runtime(async()=>{calls++;}),root,()=>{}).run(task.id);assert.equal(calls,0);assert.equal(store.task(task.id).status,'budget');
}));
