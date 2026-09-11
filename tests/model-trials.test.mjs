import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Qualification,fingerprint} from '../src/qualification.mjs';

test('trialing another package preserves the active qualification across restart and activation',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'tom-model-trials-'));
  try{
    await fs.mkdir(path.join(root,'.state'));await fs.mkdir(path.join(root,'config'));
    for(const name of ['qualification-policy.json','model-catalog.json'])await fs.copyFile(path.join('config',name),path.join(root,'config',name));
    const base={sha256:'runtime',model:{id:'e2b',sha256:'base',name:'E2B'},context:4096,threads:4};
    const active={...base,model:{id:'e4b',sha256:'active',name:'E4B'}},candidate={...base,model:{id:'q8',sha256:'candidate',name:'Q8'}};
    const old={id:'e4b',passed:true,config:active,fingerprint:fingerprint(active)};
    await fs.writeFile(path.join(root,'.state/upgrade-result.json'),JSON.stringify(old));
    await fs.writeFile(path.join(root,'.state/qualification.json'),JSON.stringify({fingerprint:fingerprint(base),passed:true}));
    let settings;const store={saveSettings:s=>{settings=s;}},runtime={config:active,stop:async()=>{}},engine={active:null};
    const q=await new Qualification(root,base,store,runtime,engine).init();
    await q.recordTrial({id:'q8',passed:true,config:candidate,fingerprint:fingerprint(candidate)});
    const restarted=await new Qualification(root,base,store,runtime,engine).init();
    await restarted.restoreForComputer();assert.equal(runtime.config.model.id,'e4b');assert.equal(settings,undefined);
    await restarted.activate('q8');assert.equal(runtime.config.model.id,'q8');
    await restarted.activate('e4b');assert.equal(runtime.config.model.id,'e4b');
    restarted.trials.e4b.fingerprint='different computer';await restarted.restoreForComputer();assert.equal(runtime.config.model.id,'e2b');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
