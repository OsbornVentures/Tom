import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Runtime} from './runtime.mjs';
import {definitions,version as harnessVersion} from './harness/protocol.mjs';
const toolDefinitions=definitions(['files']).filter(t=>t.function.name==='write');
const validateTool=call=>({name:call.name,arguments:JSON.parse(call.arguments)});
const GiB=1073741824;
export const fingerprint=(config)=>createHash('sha256').update(JSON.stringify({host:os.hostname(),cpu:os.cpus()[0]?.model,threads:os.cpus().length,ram:os.totalmem(),arch:os.arch(),platform:os.platform(),runtime:config.sha256,model:config.model.sha256,dispatch:harnessVersion})).digest('hex');
const readJSON=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
async function digest(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
export function candidateDecision(model,report,availableGiB,diskGiB,policy){
 const predicted=(report?.metrics?.decodeTps??0)/(model.workRatio??100),bytes=(model.model?.bytes??0)+(model.vision?.bytes??0);
 const reasons=[];if(model.unavailable)reasons.push(model.unavailable);if(!report?.passed)reasons.push('Pass the E2B check first');if(availableGiB<(model.minAvailableGiB??Infinity))reasons.push('Not enough memory headroom');if(diskGiB<bytes*2/GiB+1)reasons.push('Not enough free disk for download and verification');if(predicted<policy.upgradeMinimumPredictedTps)reasons.push('Baseline speed estimate is below the trial threshold');
 return {...model,eligible:!reasons.length,predictedDecodeTps:Math.round(predicted*10)/10,downloadBytes:bytes,reasons,reason:reasons.join(' · ')||'Eligible for a download and local trial. Activation requires a pass.'};
}
export class Qualification {
 constructor(root,config,store,runtime,engine){Object.assign(this,{root,config,store,runtime,engine});this.running=false;this.events=[];this.report=null;this.offers=[];this.online=null;this.controller=null;this.trials={};}
 async init(){this.policy=await readJSON(path.join(this.root,'config/qualification-policy.json'));this.catalog=await readJSON(path.join(this.root,'config/model-catalog.json'));try{this.report=await readJSON(path.join(this.root,'.state/qualification.json'));}catch{}try{this.upgradeResult=await readJSON(path.join(this.root,'.state/upgrade-result.json'));}catch{}try{this.trials=await readJSON(path.join(this.root,'.state/model-trials.json'));}catch{}if(this.upgradeResult?.id&&!this.trials[this.upgradeResult.id])this.trials[this.upgradeResult.id]=this.upgradeResult;return this;}
 resultFor(id){return this.trials[id]??(this.upgradeResult?.id===id?this.upgradeResult:null);}
 async recordTrial(result){
   // Preserve the active model's qualification when another candidate is tried.
   if(this.upgradeResult?.id&&!this.trials[this.upgradeResult.id])this.trials[this.upgradeResult.id]=this.upgradeResult;
   this.trials[result.id]=result;
   const file=path.join(this.root,'.state/model-trials.json');await fs.writeFile(file+'.tmp',JSON.stringify(this.trials,null,2));await fs.rename(file+'.tmp',file);
   await fs.writeFile(path.join(this.root,'.state/upgrade-result.json'),JSON.stringify(result,null,2));this.upgradeResult=result;
 }
 status(){return {running:this.running,events:this.events.slice(-60),report:this.report,offers:this.offers,online:this.online,policy:this.policy,upgrade:this.upgradeResult??null,currentModel:this.runtime.config.model.name};}
 needsFirstRun(){return this.report?.fingerprint!==fingerprint(this.config);}
 event(text,detail={}){const event={time:new Date().toISOString(),text,...detail};this.events.push(event);if(this.events.length>100)this.events.shift();this.onEvent?.(event);}
 cancel(){this.controller?.abort(new Error('System check cancelled. Your current model stays selected.'));}
 async stop(){this.cancel();await this.worker?.stop();}
 async identity(){await fs.writeFile(path.join(this.root,'.state/identity.json'),JSON.stringify({name:this.runtime.config.model.name}));}
 async restoreForComputer(){
   const result=this.resultFor(this.runtime.config.model.id);
   if(this.runtime.config.model.id!==this.config.model.id&&(!result?.passed||result.id!==this.runtime.config.model.id||result.fingerprint!==fingerprint(this.runtime.config))){this.runtime.config={...this.config};this.store.saveSettings({activeModel:null,activeModelConfig:null,inference:{context:this.config.context,threads:this.config.threads,idleUnloadMs:this.config.idleUnloadMs}});}
   if(this.upgradeResult&&this.upgradeResult.fingerprint!==fingerprint(this.upgradeResult.config))this.upgradeResult=null;
   if(this.needsFirstRun()){this.runtime.config.context=4096;this.runtime.config.threads=Math.max(1,Math.min(4,os.availableParallelism()-1));}
   await this.identity();
 }
 async exclusive(fn){if(this.running||this.engine.active)throw new Error('Finish or pause the current task before checking this computer.');this.running=true;this.controller=new AbortController();this.events=[];const timer=setTimeout(()=>this.controller.abort(new Error('The system check reached its time limit.')),this.policy.maximumCheckMs);try{return await fn(this.controller.signal);}finally{clearTimeout(timer);this.running=false;this.controller=null;}}
 async save(){await fs.writeFile(path.join(this.root,'.state/qualification.json'),JSON.stringify(this.report,null,2));}
 async baseline({extended=false}={}){return this.exclusive(async signal=>{
   this.event('Checking this computer · CPU and available memory');await this.runtime.stop();
   const config={...this.config,context:4096,threads:Math.max(1,Math.min(this.policy.defaultThreadsCap,os.availableParallelism()-1)),logPath:'.state/qualification-runtime.log'},worker=new Runtime(this.root,config);
   this.worker=worker;worker.progress=count=>this.event('Reading benchmark input · '+count.toLocaleString()+' tokens processed');
   const report={version:1,fingerprint:fingerprint(this.config),started:new Date().toISOString(),platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,ramGiB:os.totalmem()/GiB,threads:config.threads,model:config.model.name,modelHash:config.model.sha256,passed:false,contexts:[],checks:[],metrics:{},vision:false};this.report=report;
   let monitor;
   try{
     if(os.platform()!=='win32'||os.arch()!=='x64')throw new Error('This package contains Windows x64 binaries. Choose a matching package for this architecture.');
     if(os.freemem()/GiB<3.25)throw new Error('E2B is installed, but this GGUF package has insufficient free memory to start safely. Close apps and retry.');
     const loadedAt=Date.now();await worker.ensure(false,signal,(kind,text)=>this.event(text));report.metrics.loadMs=Date.now()-loadedAt;
     let minimumFree=os.freemem()/GiB;monitor=setInterval(()=>{minimumFree=Math.min(minimumFree,os.freemem()/GiB);if(minimumFree<this.policy.minimumFreeGiB)this.controller?.abort(new Error('The check stopped to preserve memory for Windows.'));},1000);
     const call=async(messages,tools=[],maxTokens=128)=>{let first=0,last=0;const start=Date.now();const answer=await worker.complete(messages,tools,signal,d=>{if(d.kind==='text'||d.kind==='tool'){first||=Date.now();last=Date.now();}},{maxTokens});return {...answer,observed:{elapsedMs:Date.now()-start,firstTokenMs:first?first-start:null,decodeTps:first&&last>first?(Math.max(0,(answer.usage?.completion_tokens??0)-1)/((last-first)/1000)):0}};};
     this.event('Measuring reply speed · short local generation');
     const speed=await call([{role:'user',content:'Write a numbered list from 1 to 20. Each line must contain the words local task ready. No introduction or conclusion.'}],[],160);report.metrics={...report.metrics,...speed.observed,generatedTokens:speed.usage?.completion_tokens??0};report.checks.push({name:'decode',passed:(speed.usage?.completion_tokens??0)>=60});
     this.event('Checking tool formatting · no command will be executed');
     const tool=await call([{role:'user',content:'Use the write tool to create a new file named tom-probe.txt containing exactly CEDAR-17. Do not add any other content.'}],toolDefinitions,180);
     let toolPass=false;try{const a=validateTool(tool.tool_calls?.[0]?.function);toolPass=a.name==='write'&&a.arguments.path==='tom-probe.txt'&&a.arguments.content.trim()==='CEDAR-17'&&!a.arguments.base;}catch{}
     report.checks.push({name:'tool-format',passed:toolPass});
     for(const context of extended?[4096,8192]:[4096]){
       if(worker.config.context!==context){await worker.stop();worker.config.context=context;await worker.ensure(false,signal,(kind,text)=>this.event(text));}
       this.event('Checking context recall · '+context.toLocaleString()+' token capacity');
       const rows=context===8192?350:140;
       const prompt='The first required code is MAPLE-73.\n'+Array.from({length:rows},(_,i)=>`Reference ${i+1}: keep ordinary notes about local files, dates and tasks for later review.`).join('\n')+'\nThe last required code is BIRCH-86. Reply with only the first and last required codes.';
       const answer=await call([{role:'user',content:prompt}],[],40),passed=answer.content?.includes('MAPLE-73')&&answer.content?.includes('BIRCH-86');report.checks.push({name:'recall-'+context,passed:!!passed,promptTokens:answer.usage?.prompt_tokens,elapsedMs:answer.observed.elapsedMs,firstTokenMs:answer.observed.firstTokenMs});if(passed)report.contexts.push(context);else break;
     }
     if(os.freemem()/GiB>=4.5){this.event('Checking image recognition · bundled vision projector');await worker.ensure(true,signal,(kind,text)=>this.event(text));const image='data:image/png;base64,'+(await fs.readFile(path.join(this.root,'config/vision-probe.png'))).toString('base64');const v=await call([{role:'user',content:[{type:'image_url',image_url:{url:image}},{type:'text',text:'Name the two shapes, their colors, and the large text.'}]}],[],100);report.vision=/red/i.test(v.content)&&/square/i.test(v.content)&&/blue/i.test(v.content)&&/circle/i.test(v.content)&&/TOM\s*42/i.test(v.content);report.checks.push({name:'vision',passed:report.vision});}else this.event('Image check deferred · more free memory is needed');
     report.metrics.minimumFreeGiB=minimumFree;report.passed=report.checks.every(c=>c.passed)&&report.metrics.decodeTps>=this.policy.minimumDecodeTps&&report.metrics.firstTokenMs<=this.policy.maximumFirstTokenMs&&report.metrics.loadMs<=this.policy.maximumLoadMs&&minimumFree>=this.policy.minimumFreeGiB;
     this.event(report.passed?'E2B passed · CPU speed, tool format and recall checks complete':'E2B stays installed · upgrade thresholds were not met',report.metrics);
     report.reason=report.passed?'Basic thresholds passed. Larger packages still need their own local trial.':'At least one quality, speed, loading, or memory threshold did not pass. No upgrade will be offered.';
   }catch(e){report.reason=e.message;this.event(e.message);}
   finally{clearInterval(monitor);await worker.stop();this.worker=null;report.finished=new Date().toISOString();await this.save();}
   return report;
 });}
 async scan({extended=true}={}){if(!this.report?.passed||this.report.fingerprint!==fingerprint(this.config))await this.baseline({extended});else if(extended&&!this.report.contexts.includes(8192))await this.baseline({extended:true});
   return this.exclusive(async signal=>{this.event('Checking upgrade availability · official package catalogue');await this.runtime.stop();try{const r=await fetch('https://huggingface.co/api/models/google/gemma-4-E4B-it-qat-q4_0-gguf',{signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});this.online=r.ok;}catch{this.online=false;}
     const disk=await fs.statfs(this.root),diskGiB=Number(disk.bavail)*Number(disk.bsize)/GiB;this.offers=this.catalog.models.map(m=>candidateDecision(m,this.report,os.freemem()/GiB,diskGiB,this.policy));if(!this.online)this.offers=this.offers.map(o=>({...o,eligible:false,reason:'Offline · E2B remains available. Reconnect to download an upgrade.'}));this.event(this.online?'Upgrade scan complete · only eligible trials are offered':'Offline · keeping the bundled E2B package');return this.status();});
 }
 async downloadAndTrial(id){return this.exclusive(async signal=>{
   const offer=this.offers.find(o=>o.id===id);if(!offer?.eligible)throw new Error('Run the upgrade check first. This package is not eligible.');await this.runtime.stop();
   const live=candidateDecision(offer,this.report,os.freemem()/GiB,Number((await fs.statfs(this.root)).bavail)*Number((await fs.statfs(this.root)).bsize)/GiB,this.policy);if(!live.eligible)throw new Error(live.reason);
   for(const file of [offer.model,offer.vision]){
     const full=path.join(this.root,file.path);if(await fs.stat(full).then(s=>s.size===file.bytes).catch(()=>false)){if(await digest(full)===file.sha256)continue;throw new Error('An existing model file has the wrong hash. It was not overwritten.');}
     const partial=full+'.partial';await fs.mkdir(path.dirname(full),{recursive:true});let offset=await fs.stat(partial).then(s=>s.size).catch(()=>0);if(offset>file.bytes)throw new Error('The partial download is larger than the pinned package. Inspect it before retrying.');
     if(offset<file.bytes){const r=await fetch(`https://huggingface.co/${offer.repo}/resolve/${offer.revision}/${encodeURIComponent(file.filename)}`,{headers:offset?{Range:`bytes=${offset}-`}:{},signal});if(!r.ok)throw new Error('Download failed: HTTP '+r.status);if(offset&&r.status!==206){offset=0;}
       if(offset&&(!r.headers.get('content-range')?.startsWith(`bytes ${offset}-`)))throw new Error('The download server returned an unexpected resume range.');
       const out=await fs.open(partial,offset?'a':'w');let last=0;try{for await(const chunk of r.body){signal.throwIfAborted();if(offset+chunk.length>file.bytes)throw new Error('Download exceeded the pinned file size.');await out.write(chunk);offset+=chunk.length;if(Date.now()-last>500){last=Date.now();this.event('Downloading '+file.filename,{bytes:offset,totalBytes:file.bytes});}}}finally{await out.close();}}
     this.event('Verifying '+file.filename);if(offset!==file.bytes||await digest(partial)!==file.sha256)throw new Error('The downloaded file failed verification. E2B remains selected.');await fs.rename(partial,full);
   }
   const candidate={...this.config,context:4096,minimumLoadGiB:offer.minAvailableGiB,model:{...offer.model,id:offer.id,name:offer.name,revision:offer.revision},vision:offer.vision,logPath:'.state/upgrade-trial.log'},worker=new Runtime(this.root,candidate);let passed=false,reason='',first=0,last=0;
   this.worker=worker;worker.progress=count=>this.event('Reading benchmark input · '+count.toLocaleString()+' tokens processed');const monitor=setInterval(()=>{if(os.freemem()/GiB<this.policy.minimumFreeGiB)this.controller?.abort(new Error('The trial stopped to preserve memory for Windows.'));},1000);
   try{this.event('Testing '+offer.name+' on this CPU');const started=Date.now();await worker.ensure(false,signal,(kind,text)=>this.event(text));const loadMs=Date.now()-started;
     const begin=Date.now(),a=await worker.complete([{role:'user',content:'Write a numbered list from 1 to 20. Each line says local task ready.'}],[],signal,d=>{if(d.kind==='text'){first||=Date.now();last=Date.now();}},{maxTokens:160});
     const tps=(a.usage?.completion_tokens-1)/Math.max(.001,(last-first)/1000);const t=await worker.complete([{role:'user',content:'Use write to create a new file tom-probe.txt containing exactly CEDAR-17.'}],toolDefinitions,signal,()=>{},{maxTokens:180});let tool;try{tool=validateTool(t.tool_calls?.[0]?.function);}catch{}
     passed=(a.usage?.completion_tokens??0)>=60&&first>0&&tps>=this.policy.minimumDecodeTps&&first-begin<=this.policy.maximumFirstTokenMs&&loadMs<=this.policy.maximumLoadMs&&os.freemem()/GiB>=this.policy.minimumFreeGiB&&tool?.name==='write'&&tool.arguments.content.trim()==='CEDAR-17'&&tool.arguments.path==='tom-probe.txt'&&!tool.arguments.base;
     // Vision must pass too before this package can replace the multimodal E2B route.
     if(passed){this.event('Checking the matching vision projector');await worker.ensure(true,signal,(kind,text)=>this.event(text));const image='data:image/png;base64,'+(await fs.readFile(path.join(this.root,'config/vision-probe.png'))).toString('base64');const v=await worker.complete([{role:'user',content:[{type:'image_url',image_url:{url:image}},{type:'text',text:'Name the two shapes, their colors, and the large text.'}]}],[],signal,()=>{},{maxTokens:100});passed=/red/i.test(v.content)&&/square/i.test(v.content)&&/blue/i.test(v.content)&&/circle/i.test(v.content)&&/TOM\s*42/i.test(v.content);}
     reason=passed?'Text, tools, vision and headroom passed. Ready for your choice.':'The candidate did not pass every threshold. E2B remains selected.';
     const result={id,passed,reason,decodeTps:tps,config:candidate,time:new Date().toISOString(),fingerprint:fingerprint(candidate)};await this.recordTrial(result);this.event(reason);return result;
   }finally{clearInterval(monitor);await worker.stop();this.worker=null;}
 });}
 async activate(id){if(this.running||this.engine.active)throw new Error('Pause the current task first.');const result=this.resultFor(id)??await readJSON(path.join(this.root,'.state/upgrade-result.json')).catch(()=>null);if(!result?.passed||result.id!==id||result.fingerprint!==fingerprint(result.config))throw new Error('This package has not passed on this computer.');await this.runtime.stop();this.runtime.config={...result.config,logPath:'.state/runtime.log'};this.store.saveSettings({activeModel:id,activeModelConfig:this.runtime.config,inference:{context:4096,threads:this.runtime.config.threads}});await this.identity();this.event('Now using '+this.runtime.config.model.name);return {name:this.runtime.config.model.name};}
 contextLimit(){if(this.runtime.config.model.id!==this.config.model.id)return 4096;const fits=os.freemem()/GiB>=1.5;return fits&&this.report?.passed&&this.report.fingerprint===fingerprint(this.config)?Math.max(4096,...this.report.contexts):4096;}
}
