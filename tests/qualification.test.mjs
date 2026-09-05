import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {candidateDecision,Qualification,fingerprint} from '../src/qualification.mjs';
const policy={upgradeMinimumPredictedTps:6},model={id:'larger',workRatio:2,minAvailableGiB:8,model:{bytes:5*1073741824},vision:{bytes:1073741824}},report={passed:true,metrics:{decodeTps:15}};
test('upgrade qualification requires quality, measured speed, RAM and staging disk together',()=>{
 assert.equal(candidateDecision(model,report,16,20,policy).eligible,true);
 for(const [r,ram,disk] of [[{...report,passed:false},16,20],[report,7,20],[report,16,12],[{...report,metrics:{decodeTps:8}},16,20]])assert.equal(candidateDecision(model,r,ram,disk,policy).eligible,false);
 assert.equal(candidateDecision({...model,unavailable:'Not verified'},report,16,20,policy).eligible,false);
});
test('moving a qualified larger-model installation to another computer restores E2B',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tom-qualification-'));await fs.mkdir(path.join(root,'.state'));const config={context:4096,threads:4,sha256:'runtime',model:{id:'e2b',name:'E2B',sha256:'base'}},candidate={...config,model:{id:'larger',name:'Larger',sha256:'big'}};let saved;
 try{const worker={config:candidate},q=new Qualification(root,config,{saveSettings:s=>saved=s},worker,{active:null});q.upgradeResult={id:'larger',config:candidate,passed:true,fingerprint:'different-machine'};await q.restoreForComputer();assert.equal(worker.config.model.id,'e2b');assert.equal(saved.activeModel,null);assert.equal(q.upgradeResult,null);assert.equal(JSON.parse(await fs.readFile(path.join(root,'.state/identity.json'))).name,'E2B');await assert.rejects(q.activate('larger'),/has not passed/);
 q.report={passed:true,fingerprint:fingerprint(config),contexts:[4096,8192]};worker.config=candidate;assert.equal(q.contextLimit(),4096,'E2B context tests must not qualify a different model');
 }finally{await fs.rm(root,{recursive:true});}
});
test('a system check cannot race an active user task',async()=>{const q=new Qualification('',{},null,null,{active:{id:'task'}});await assert.rejects(q.exclusive(()=>assert.fail()),/pause the current task/);});
test('network failure leaves E2B selected and disables every download offer',async()=>{const config={sha256:'runtime',model:{id:'e2b',name:'E2B',sha256:'base'}},worker={config,stop:async()=>{}},q=new Qualification(process.cwd(),config,null,worker,{active:null});q.policy={...policy,maximumCheckMs:2000};q.catalog={models:[model]};q.report={...report,contexts:[4096,8192],fingerprint:fingerprint(config)};const originalFetch=globalThis.fetch;try{globalThis.fetch=async()=>{throw new Error('Offline fixture');};await q.scan({extended:false});assert.equal(q.online,false);assert.equal(q.offers[0].eligible,false);assert.match(q.offers[0].reason,/Offline/);assert.equal(worker.config.model.id,'e2b');}finally{globalThis.fetch=originalFetch;}});
