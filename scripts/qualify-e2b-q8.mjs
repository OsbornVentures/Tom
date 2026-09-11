// Exercise the product's normal candidate screen, retaining exact probe evidence.
// Run while the desktop service and other model trials are stopped.
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {Runtime} from '../src/runtime.mjs';
import {Qualification} from '../src/qualification.mjs';
const root=path.resolve(import.meta.dirname,'..');
if(await fs.stat(path.join(root,'.state/harness-repair.lock')).catch(()=>null))throw Error('Another model trial is running.');
try{
  const s=JSON.parse(await fs.readFile(path.join(root,'.state/session.json'))),u=new URL(s.url);
  const r=await fetch(u.origin+'/api/state',{headers:{'X-Tom-Key':new URLSearchParams(u.hash.slice(1)).get('key')},signal:AbortSignal.timeout(1500)});
  if(r.ok)throw Error('APP_RUNNING');
}catch(e){if(e.message==='APP_RUNNING')throw e;}
const config=JSON.parse(await fs.readFile(path.join(root,'config/runtime.json'))),store=new Store(path.join(root,'.state/tom.sqlite'));
const before=store.settings().activeModelConfig??config,runtime=new Runtime(root,before),q=await new Qualification(root,config,store,runtime,{active:null}).init(),probes=[];
const original=Runtime.prototype.complete;
Runtime.prototype.complete=async function(messages,tools,...args){
  const start=Date.now();try{const response=await original.call(this,messages,tools,...args);probes.push({model:this.config.model,messages,tools,response,elapsedMs:Date.now()-start});return response;}
  catch(e){probes.push({model:this.config.model,messages,tools,error:e.message,elapsedMs:Date.now()-start});throw e;}
};
const event=q.event.bind(q);q.event=(text,detail)=>{event(text,detail);if(!text.startsWith('Reading benchmark input'))console.log(text);};
let result,error;
try{
  await q.scan();const offer=q.offers.find(o=>o.id==='gemma-4-e2b-q8_0');
  if(!offer?.eligible)throw Error(offer?.reason??'Candidate not found');
  result=await q.downloadAndTrial(offer.id);
}catch(e){error=e.message;console.log('SCREEN ERROR',error);}
finally{
  await q.stop();await runtime.stop();Runtime.prototype.complete=original;
  const after=store.settings().activeModelConfig??config;
  const report={startedModel:before.model,selectedModelAfter:after.model,selectionPreserved:before.model.sha256===after.model.sha256,result,error,events:q.events,probes,finished:new Date().toISOString()};
  await fs.writeFile(path.join(root,'.state/q8-local-qualification.json'),JSON.stringify(report,null,2));store.close();
  console.log(JSON.stringify({passed:result?.passed??false,selectionPreserved:report.selectionPreserved,model:after.model.name,error}));
  if(error)process.exitCode=1;
}
