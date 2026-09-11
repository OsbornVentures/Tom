import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {normalizeInference,inferenceProfiles,tryProfiles} from '../src/inference-settings.mjs';
test('broken and relocated performance settings are bounded to the current computer',()=>{
 const fixed=normalizeInference({threads:128,context:65536,idleUnloadMs:-1,acceleration:'rocm',kvCache:'unknown'},{threads:2});
 assert.deepEqual(fixed,{threads:1,context:4096,idleUnloadMs:300000,acceleration:'auto',kvCache:'auto'});
 assert.equal(normalizeInference(null,{threads:1}).threads,1);
 assert.equal(normalizeInference({context:8192},{contextLimit:8192}).context,8192);
});
test('a GPU vendor never establishes quantized KV support and no device uses CPU',()=>{
 const config=normalizeInference({kvCache:'q4_0'});
 const gpu=inferenceProfiles(config,{available:true});
 assert.deepEqual(gpu.map(p=>[p.backend,p.cacheTypeV,p.flashAttention,p.context]),[['vulkan','q4_0','on',4096],['vulkan','f16','off',4096],['cpu','f16','off',4096],['cpu','f16','off',2048]]);
 assert.equal(inferenceProfiles(config,{available:false})[0].backend,'cpu');
 assert.equal(inferenceProfiles(normalizeInference({acceleration:'cpu'}),{available:true})[0].gpuLayers,0);
});
test('failed GPU cache probes retry standard precision, then persist working CPU settings',async()=>{
 const profiles=inferenceProfiles(normalizeInference({kvCache:'q8_0'}),{available:true});let attempts=0,recovered;
 const chosen=await tryProfiles(profiles,async p=>{attempts++;if(p.backend==='vulkan')throw new Error('Unsupported device kernel');},{signal:new AbortController().signal,onRecovery:async p=>{recovered=p;}});
 assert.equal(attempts,3);assert.equal(chosen.backend,'cpu');assert.equal(chosen.cacheTypeV,'f16');assert.deepEqual(recovered,chosen);
});
test('cancellation and nonrecoverable failures never restart inference or save a fallback',async()=>{
 const controller=new AbortController();let attempts=0;
 await assert.rejects(tryProfiles([{},{}],async()=>{attempts++;controller.abort(new Error('User cancelled'));throw new Error('load failed');},{signal:controller.signal,onRecovery:()=>assert.fail()}),/User cancelled/);assert.equal(attempts,1);
 await assert.rejects(tryProfiles([{},{}],async()=>{throw Object.assign(new Error('corrupt model'),{noRetry:true});},{signal:new AbortController().signal,onRecovery:()=>assert.fail()}),/corrupt model/);
});
test('malformed stored settings are quarantined without losing conversations or valid settings',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tom-settings-')),store=new Store(path.join(directory,'tom.sqlite'));
 try{const task=store.create('Keep this conversation',directory);store.saveSettings({theme:'night'});store.db.prepare('INSERT INTO settings VALUES(?,?)').run('inference','{bad');assert.deepEqual(store.settings(),{theme:'night'});assert.equal(store.task(task.id).title,'Keep this conversation');assert.equal(store.db.prepare('SELECT value FROM damaged_settings').get().value,'{bad');assert.deepEqual(store.settings(),{theme:'night'});}finally{store.close();await fs.rm(directory,{recursive:true,force:true});}
});
