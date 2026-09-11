import test from 'node:test';
import assert from 'node:assert/strict';
import {Startup} from '../src/startup.mjs';
import {Runtime} from '../src/runtime.mjs';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
function fixture(needsCheck=false){
 const q={needsFirstRun:()=>needsCheck,cancel(){},baseline:async()=>({passed:true}),scan:async()=>{}};
 const runtime={config:{model:{name:'Selected model'}},base:null,grammarVerified:false,stop:async()=>{},release(){this.released=true;}};
 return {q,runtime,startup:new Startup(q,runtime)};
}
test('a returning installation stays blocked through loading and the real readiness probe',async()=>{
 const {startup,runtime}=fixture(),loaded=deferred(),checked=deferred();
 runtime.ensure=async(_vision,_signal,emit)=>{emit('load','Loading Selected model into memory');await loaded.promise;runtime.base='local';emit('check','Verifying token-level grammar enforcement');await checked.promise;runtime.grammarVerified=true;};
 const job=startup.start();assert.equal(startup.ready,false);assert.equal(startup.status().steps.find(s=>s.id==='checks').status,'skipped');assert.match(startup.status().events.at(-1).text,/Loading Selected model/);
 loaded.resolve();await Promise.resolve();assert.equal(startup.ready,false);assert.equal(startup.stage,'verify');assert.equal(startup.status().steps.find(s=>s.id==='verify').status,'running');
 checked.resolve();await job;assert.equal(startup.ready,true);assert.equal(runtime.released,true);
});
test('benchmark progress survives in startup history and passing benchmarks still load the selected model',async()=>{
 const {startup,q,runtime}=fixture(true);const sequence=[];
 q.baseline=async()=>{q.onEvent({text:'Measuring reply speed'});sequence.push('benchmark');return {passed:true};};q.scan=async()=>sequence.push('scan');
 runtime.ensure=async()=>{sequence.push('load');runtime.base='local';runtime.grammarVerified=true;};
 await startup.start();assert.deepEqual(sequence,['benchmark','scan','load']);assert.ok(startup.events.some(e=>e.text==='Measuring reply speed'));assert.equal(startup.ready,true);
});
test('continuing after a failed benchmark loads the model, and a load failure cannot unlock chat',async()=>{
 const {startup,q,runtime}=fixture(true);q.baseline=async()=>({passed:false,reason:'Recall did not pass'});runtime.ensure=async()=>{throw Error('Model is missing');};
 await startup.start();assert.equal(startup.canContinue,true);assert.equal(startup.ready,false);
 await startup.start({skipChecks:true});assert.equal(startup.canContinue,false);assert.equal(startup.ready,false);assert.equal(startup.error,'Model is missing');
 runtime.ensure=async()=>{runtime.base='local';runtime.grammarVerified=true;};await startup.start({skipChecks:true});assert.equal(startup.ready,true);
});
test('cancelling startup waits for the model load to stop before allowing retry',async()=>{
 const {startup,runtime}=fixture();runtime.ensure=async(_vision,signal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 const job=startup.start();startup.cancel();await job;assert.equal(startup.ready,false);assert.equal(startup.phase,'attention');assert.match(startup.error,/cancelled/);assert.equal(startup.job,null);
});
test('model loading waits for an in-progress graphics detection instead of using incomplete hardware data',async()=>{
 const runtime=new Runtime('.',{}),gate=deferred();let calls=0;
 runtime.detectHardware=async()=>{calls++;runtime.hardwareInfo={available:false};await gate.promise;runtime.hardwareInfo={available:true};return runtime.hardwareInfo;};
 const background=runtime.hardware(),startup=runtime.hardware();gate.resolve();assert.equal((await background).available,true);assert.equal((await startup).available,true);assert.equal(calls,1);
});
