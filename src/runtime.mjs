import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {buildDispatchGrammar,structuredMessages,decodeDispatch,answerPrefix,dispatchVersion} from './dispatch.mjs';
import {isV2,messagesForModel,grammar as taskGrammar,decode as decodeTask,version as harnessVersion} from './harness/protocol.mjs';
import {inferenceProfiles,tryProfiles} from './inference-settings.mjs';
import {requireWindowsRuntime,windowsRuntimeHelp} from './windows-runtime.mjs';
const formatMessages=(messages,tools)=>isV2(tools)?messagesForModel(messages,tools):structuredMessages(messages,tools);

async function fileHash(file) { const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex'); }
export async function* sseData(body) {
  const decoder=new TextDecoder();let buffer='';
  for await(const chunk of body){buffer+=decoder.decode(chunk,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trimEnd();buffer=buffer.slice(i+1);if(line.startsWith('data:'))yield line.slice(5).trimStart();}}
  buffer+=decoder.decode();if(buffer.startsWith('data:'))yield buffer.slice(5).trim();
}
export class Runtime {
  constructor(root, config) {this.root=root;this.config=config;this.child=null;this.base=null;this.verified=false;this.vision=false;this.phase='Model not loaded';this.fingerprints=new Map();this.idle=null;}
  async artifacts() {
    const present=async a=>{try{return !!a&&(await stat(path.join(this.root,a.path))).size===a.bytes;}catch{return false;}};
    return {textPresent:await present(this.config.model),visionPresent:await present(this.config.vision),verified:this.verified,loaded:!!this.base,visionLoaded:this.vision,grammarVerified:!!this.grammarVerified,dispatchVersion,harnessVersion,phase:this.phase,name:this.config.model.name};
  }
  async verify(file,expected,emit) {
    const full=path.join(this.root,file),s=await stat(full).catch(()=>{throw Object.assign(new Error(`Missing local component: ${file}. Run the Tom installer again to repair it.`),{noRetry:true});});
    const fp=`${s.size}/${s.mtimeMs}`;
    if(this.fingerprints.get(full)===fp)return;
    emit('check',`Checking ${path.basename(file)}`);
    if(await fileHash(full)!==expected)throw Object.assign(new Error(`The checksum does not match for ${file}. Run the Tom installer again to repair it.`),{noRetry:true});
    this.fingerprints.set(full,fp);
  }
  async hardware() {
    if(this.hardwarePending)return this.hardwarePending;
    if(this.hardwareInfo)return this.hardwareInfo;
    this.hardwarePending=this.detectHardware();
    try{return await this.hardwarePending;}finally{this.hardwarePending=null;}
  }
  async detectHardware() {
    if(this.hardwareInfo)return this.hardwareInfo;
    this.hardwareInfo={available:false,devices:[],reason:'CPU compatibility mode is available.'};
    try {
      const adapter=JSON.parse(await readFile(path.join(this.root,'config/gpu-runtime.json'),'utf8'));
      await requireWindowsRuntime(path.dirname(path.join(this.root,adapter.executable)));
      for(const component of adapter.components)await this.verify(component.path,component.sha256,()=>{});
      const output=await new Promise((resolve,reject)=>{
        const child=spawn(path.join(this.root,adapter.executable),['--list-devices'],{cwd:path.dirname(path.join(this.root,adapter.executable)),windowsHide:true,stdio:['ignore','pipe','pipe']});let result='';
        const timer=setTimeout(()=>{child.kill();reject(new Error('Graphics detection timed out.'));},12000);
        const collect=b=>{result=(result+b).slice(-32000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
        child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(result):reject(new Error('Graphics runtime is unavailable.'));});
      });
      const devices=output.split(/\r?\n/).map(s=>s.trim()).filter(s=>/^Vulkan\d+:/.test(s));
      this.gpuAdapter=adapter;this.hardwareInfo={available:devices.length>0,devices,reason:devices.length?'Vulkan graphics detected. Tom verifies settings when the model loads.':'No compatible graphics device was detected. Tom will use the CPU.'};
    }catch{this.hardwareInfo.reason='Graphics support is unavailable. Tom will use the bundled CPU runtime.';}
    return this.hardwareInfo;
  }
  async ensure(vision,signal,emit=()=>{}) {
    clearTimeout(this.idle);signal.throwIfAborted();
    if(this.base&&vision===this.vision)return;
    emit('check','Checking graphics and CPU compatibility');
    const hardware=await this.hardware();signal.throwIfAborted();
    // Direct development cache trials remain explicit; normal app preferences use kvCache.
    const config={...this.config,kvCache:this.config.kvCache??this.config.cacheTypeK??'auto'};
    const profiles=inferenceProfiles(config,hardware);
    this.effective=await tryProfiles(profiles,async profile=>{
      emit('check',`Starting ${profile.backend==='cpu'?'CPU':'graphics'} with ${profile.cacheTypeK==='f16'?'standard':profile.cacheTypeK} memory`);
      await this.startProfile(vision,signal,emit,profile);
    },{signal,onRecovery:async(profile,error)=>{
      const inference={acceleration:profile.backend,kvCache:profile.cacheTypeK,context:profile.context};
      Object.assign(this.config,inference);
      this.recovery={time:new Date().toISOString(),message:'Tom restored compatible performance settings after a startup failure.',reason:error.message,...inference};
      emit('recovery',this.recovery.message);await this.onRecovery?.(this.recovery);
    }});
    this.config.context=this.effective.context;
  }
  async startProfile(vision,signal,emit,profile) {
    clearTimeout(this.idle);signal.throwIfAborted();
    if(this.base&&vision===this.vision)return;
    await this.stop();
    const adapter=profile.backend==='vulkan'?this.gpuAdapter:null;
    const c={...this.config,...profile,...(adapter?{executable:adapter.executable,sha256:adapter.sha256}:{})};
    if(process.platform==='win32'&&process.arch!=='x64')throw new Error('This installed runtime package requires x64 Windows. Other architectures need their own qualified build.');
    await requireWindowsRuntime(path.dirname(path.join(this.root,c.executable)));
    if(vision&&!c.vision)throw new Error('The selected model has no configured image adapter.');
    const requiredGiB=Math.max((c.model.bytes??0)/1073741824+(vision?(c.vision?.bytes??0)/1073741824:0)+0.4,c.minimumLoadGiB??0);
    if(os.freemem()/1073741824<requiredGiB)throw Object.assign(new Error(`Tom needs ${requiredGiB.toFixed(1)} GB of available memory to load this model. Close other apps and try again.`),{noRetry:true});
    await this.verify(c.executable,c.sha256,emit);
    const components=adapter?.components??JSON.parse(await readFile(path.join(this.root,'config/runtime-components.json'),'utf8'));
    emit('check','Checking the local runtime components');
    for(const component of components)await this.verify(component.path,component.sha256,()=>{});
    await this.verify(c.model.path,c.model.sha256,emit);
    if(vision){if(c.vision.modelRevision!==c.model.revision)throw new Error('The vision component belongs to a different model revision.');await this.verify(c.vision.path,c.vision.sha256,emit);}
    this.verified=true;
    const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
    this.key=randomBytes(32).toString('hex');
    const threads=Math.max(1,Math.min(c.threads,os.availableParallelism()-1));
    const cacheK=c.cacheTypeK??'f16',cacheV=c.cacheTypeV??'f16';
    if(!['f16','q8_0','q4_0'].includes(cacheK)||!['f16','q8_0','q4_0'].includes(cacheV))throw new Error('This build has no trial for the requested KV precision.');
    const args=['-m',path.join(this.root,c.model.path),'--host','127.0.0.1','--port',String(port),'-t',String(threads),'-tb',String(threads),'-c',String(c.context),'-b','128','-ub','128','-ngl',String(c.gpuLayers),'--parallel','1','--jinja','--reasoning','off','--no-webui','--cache-ram','0','--cache-type-k',cacheK,'--cache-type-v',cacheV,'--flash-attn',c.flashAttention??(cacheV==='f16'?'auto':'on')];
    if(c.verbosity)args.push('-lv',String(c.verbosity));
    if(vision)args.push('--mmproj',path.join(this.root,c.vision.path),'--no-mmproj-offload');
    this.phase=vision?'Loading Gemma and its image encoder':'Loading Gemma into memory';emit('load',this.phase);
    const log=createWriteStream(path.resolve(this.root,c.logPath??'.state/runtime.log'),{flags:'w'});
    const child=spawn(path.join(this.root,c.executable),args,{cwd:path.dirname(path.join(this.root,c.executable)),windowsHide:true,env:{...process.env,LLAMA_API_KEY:this.key},stdio:['ignore','pipe','pipe']});
    this.child=child;child.once('spawn',()=>{try{os.setPriority(child.pid,10);}catch{}});let error=null;
    child.on('error',e=>{error=e;});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    let logBuffer='';child.stderr.on('data',chunk=>{logBuffer+=chunk.toString();let index;while((index=logBuffer.indexOf('\n'))>=0){const line=logBuffer.slice(0,index);logBuffer=logBuffer.slice(index+1);const match=line.match(/prompt processing, n_tokens =\s*(\d+)/);if(match&&this.progress)this.progress(Number(match[1]));}if(logBuffer.length>16000)logBuffer=logBuffer.slice(-16000);});
    child.on('close',()=>{log.end();if(this.child===child){this.base=null;this.child=null;this.phase='Model unloaded';this.vision=false;}});
    const deadline=Date.now()+180000;
    try {
      while(Date.now()<deadline){signal.throwIfAborted();if(error)throw error;if(child.exitCode!==null){const status=child.exitCode>>>0,dependencyFailure=[0xc0000135,0xc0000139,0xc000007b].includes(status);throw Object.assign(new Error(dependencyFailure?'A required Windows runtime is missing or incompatible. '+windowsRuntimeHelp:`The model process exited (${child.exitCode}). See the local runtime log.`),{noRetry:dependencyFailure});}
        try { const r=await fetch(`http://127.0.0.1:${port}/health`,{headers:{Authorization:`Bearer ${this.key}`},signal:AbortSignal.any([signal,AbortSignal.timeout(1500)])});if(r.ok){this.base=`http://127.0.0.1:${port}`;this.vision=vision;break;} }catch(e){if(signal.aborted)throw e;}
        await delay(300,undefined,{signal});
      }
      if(!this.base)throw new Error('Model loading exceeded three minutes. Check available memory and the runtime log.');
      emit('check','Verifying token-level grammar enforcement');
      const probe=await(await this.request('/v1/chat/completions',{messages:[{role:'user',content:'Say ignored.'}],grammar:'root ::= "TOM_GRAMMAR_OK"',parse_tool_calls:false,max_tokens:32,temperature:0,stream:false,chat_template_kwargs:{enable_thinking:false}},signal)).json();
      if(probe.choices?.[0]?.message?.content?.trim()!=='TOM_GRAMMAR_OK')throw new Error('The inference backend did not enforce the grammar probe. Tool execution is disabled.');
      this.grammarVerified=true;this.phase=vision?'Text and image model loaded':'Text model loaded';emit('ready',this.phase);return;
    }catch(e){await this.stop();throw e;}
  }
  async request(route,body,signal) {
    const r=await fetch(this.base+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.key}`},body:JSON.stringify(body),signal});
    if(!r.ok)throw new Error(`Local model request failed (${r.status}): ${(await r.text()).slice(0,400)}`);return r;
  }
  async count(messages,tools,signal) {
    const rendered=await(await this.request('/apply-template',{messages:formatMessages(messages,tools),add_generation_prompt:true,chat_template_kwargs:{enable_thinking:false}},signal)).json();
    const tokens=await(await this.request('/tokenize',{content:rendered.prompt,add_special:true},signal)).json();return tokens.tokens.length;
  }
  async complete(messages,tools,signal,onDelta,{maxTokens=2048,dispatch={},seed=this.config.seed??42}={}) {
    const started=Date.now();let firstTokenMs=null;
    const hasImages=messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='image_url'));
    const structured=tools.length>0;
    const r=await this.request('/v1/chat/completions',{messages:formatMessages(messages,tools),...(structured?{grammar:isV2(tools)?taskGrammar(tools):buildDispatchGrammar(dispatch),parse_tool_calls:false}:{}),temperature:this.config.temperature??0.2,top_p:this.config.top_p??0.95,top_k:this.config.top_k??64,seed,max_tokens:maxTokens,stream:true,stream_options:{include_usage:true},cache_prompt:!hasImages,chat_template_kwargs:{enable_thinking:false}},signal);
    const calls=new Map();let content='',ended=false,finish=null,usage=null,streamed=0;
    for await(const data of sseData(r.body)){
      if(data==='[DONE]'){ended=true;break;}
      const packet=JSON.parse(data);if(packet.error)throw new Error(packet.error.message??'Model stream failed.');
      if(packet.usage)usage=packet.usage;
      const choice=packet.choices?.[0];if(!choice)continue;
      if(choice.finish_reason)finish=choice.finish_reason;
      const d=choice.delta??{};
      if(firstTokenMs===null&&(d.content||d.tool_calls))firstTokenMs=Date.now()-started;
      // Private model reasoning is neither persisted nor displayed. Observable actions carry concise summaries.
      if(d.content){content+=d.content;if(structured){const prefix=answerPrefix(content);if(prefix.length>streamed){onDelta({kind:'text',text:prefix.slice(streamed)});streamed=prefix.length;}else if(!prefix)onDelta({kind:'tool',name:content.includes('"write"')?'write':content.includes('"shell"')?'shell':'response',characters:content.length});}else onDelta({kind:'text',text:d.content});}
      for(const t of d.tool_calls??[]){const previous=calls.get(t.index)??{id:t.id??`call_${t.index}`,type:'function',function:{name:'',arguments:''}};if(t.id)previous.id=t.id;if(t.function?.name)previous.function.name+=t.function.name;if(t.function?.arguments)previous.function.arguments+=t.function.arguments;calls.set(t.index,previous);onDelta({kind:'tool',name:previous.function.name,characters:previous.function.arguments.length});}
    }
    if(!ended)throw new Error('The local response stream ended unexpectedly. No incomplete tool action was executed.');
    const timings={firstTokenMs,elapsedMs:Date.now()-started};
    if(structured){if(finish==='length')throw new Error('The structured response exceeded its output budget. No partial action was executed.');return {...(isV2(tools)?decodeTask(content,tools):decodeDispatch(content,dispatch)),usage,finish,dispatchVersion:isV2(tools)?harnessVersion:dispatchVersion,timings};}
    if(finish==='length'&&calls.size)throw new Error('The action exceeded its output budget. No partial action was executed.');
    return {role:'assistant',content:content||null,...(calls.size?{tool_calls:[...calls.values()]}:{}),usage,finish,timings};
  }
  async inspect(messages,tools,signal){
    const rendered=await(await this.request('/apply-template',{messages:formatMessages(messages,tools),add_generation_prompt:true,chat_template_kwargs:{enable_thinking:false}},signal)).json();
    const tokens=await(await this.request('/tokenize',{content:rendered.prompt,add_special:true},signal)).json();
    return {renderedPrompt:rendered.prompt,tokenIds:tokens.tokens,note:'Exact supplied text template and tokenizer IDs. Image embeddings are processed separately. Private generated reasoning is not logged.'};
  }
  release(){clearTimeout(this.idle);this.idle=setTimeout(()=>this.stop(),this.config.idleUnloadMs);this.idle.unref();}
  async stop(){clearTimeout(this.idle);const child=this.child;this.base=null;this.vision=false;this.grammarVerified=false;this.phase='Model unloaded';if(child&&child.exitCode===null){await new Promise(resolve=>{child.once('close',resolve);child.kill();setTimeout(resolve,3000).unref();});}if(this.child===child)this.child=null;}
}
