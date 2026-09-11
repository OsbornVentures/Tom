import {BudgetReached,validateBudget} from './context.mjs';
import {ToolPreconditionError,hash} from './tools.mjs';
import {version,decode} from './harness/protocol.mjs';
import {taskState,remember} from './harness/state.mjs';
import {workingContext} from './harness/context.mjs';
import {completion} from './harness/checks.mjs';
import {Toolbox} from './harness/tools.mjs';
import os from 'node:os';
import {acceptGeneration} from './harness/generation.mjs';
import {readPrerequisites} from './harness/prerequisites.mjs';

class TaskBlocked extends Error {}
class ReviewDeclined extends Error {}
const readOperations=new Set(['use','read','find','check','search','recall','plan','advance','compose','repair']);

export class Engine {
  constructor(store,runtime,root,broadcast,product={name:'Tom'},profile=null){Object.assign(this,{store,runtime,root,broadcast,product,profile});this.active=null;this.review=null;}
  emit(id,kind,text,detail={}){const event=this.store.event(id,kind,text,detail);this.broadcast(event);return event;}
  initBudget(id,force=false){
    if(force)this.emit(id,'start-new-request','New request · task budget reset');
    if(!force&&this.store.budget(id))return this.store.budget(id);
    return this.store.saveBudget(id,{...validateBudget(this.store.settings().budget??{}),usedSteps:0,usedTokens:0,usedMs:0,pendingTokens:0,created:new Date().toISOString()});
  }
  budgetEvent(id){const b=this.store.budget(id);this.emit(id,'budget-status',`Step ${b.usedSteps} of ${b.maxSteps} · ${Math.max(0,b.maxTokens-b.usedTokens-b.pendingTokens).toLocaleString()} output tokens available`,b);}
  chargeClock(){const a=this.active;if(!a?.clockStarted)return;const now=Date.now(),b=this.store.budget(a.id);b.usedMs+=now-a.clockStarted;a.clockStarted=now;this.store.saveBudget(a.id,b);}
  startClock(){const a=this.active,b=this.store.budget(a.id);if(b.usedMs>=b.maxActiveMs)throw new BudgetReached('The active-time budget is reached. Extend it to continue.');a.clockStarted=Date.now();a.clock=setInterval(()=>{this.chargeClock();if(this.store.budget(a.id).usedMs>=this.store.budget(a.id).maxActiveMs)a.controller.abort(new BudgetReached('The active-time budget is reached. Progress is saved.'));},250);}
  pauseClock(){this.chargeClock();clearInterval(this.active?.clock);if(this.active)this.active.clockStarted=null;}
  chargeResponse(id,usage){const b=this.store.budget(id);b.usedTokens+=Number.isInteger(usage?.completion_tokens)?usage.completion_tokens:b.pendingTokens;b.pendingTokens=0;this.store.saveBudget(id,b);}
  async run(id){
    if(this.active)throw Error('Another task is using the model. Pause it before starting this one.');
    const task=this.store.task(id);if(!task)throw Error('Conversation not found.');
    if(this.store.actions(id).some(a=>a.status==='uncertain'))throw Error('An interrupted action needs inspection before continuing.');
    this.active={id,controller:new AbortController(),mode:'stop',clockStarted:null};this.initBudget(id);
    const signal=this.active.controller.signal;let box,state,memoryMonitor;
    this.store.status(id,'running');this.emit(id,'start','Reading your request',{harness:version});
    try{
      this.startClock();state=await taskState(this.store,id,task.cwd);this.store.saveWork(id,state);
      const history=this.store.messages(id),request=history[state.imageIndex??state.requestIndex],vision=Array.isArray(request?.content)&&request.content.some(c=>c.type==='image_url');
      box=new Toolbox({root:this.root,cwd:task.cwd,state,store:this.store,id,settings:this.store.settings()});
      if(this.runtime.config.fileGeneration!==false&&this.runtime.config.prerequisiteReads!==false){
        await completion(state,task.cwd);
        await readPrerequisites({state,box,cwd:task.cwd,id,store:this.store,signal,emit:(...args)=>this.emit(id,...args)});
      }
      await this.runtime.ensure(vision,signal,(...args)=>this.emit(id,...args));
      memoryMonitor=setInterval(()=>{if(os.freemem()/1073741824<(this.runtime.config.minimumFreeGiB??0.6))this.active?.controller.abort(new TaskBlocked('Low free memory paused this task. Close other apps before resuming. Progress is saved.'));},1000);
      this.runtime.progress=done=>this.emit(id,'prefill',`Reading request · ${done.toLocaleString()} text tokens processed`);
      let rejected=0,formatFailures=0,compactions=this.store.events(id).filter(e=>e.kind==='context'&&e.detail?.compacted).length;
      while(true){
        signal.throwIfAborted();
        const verified=await completion(state,task.cwd),budget=this.store.budget(id);
        const prepared=await workingContext({state,history,runtime:this.runtime,budget,signal,cwd:task.cwd,name:this.product.name,userName:this.profile?.displayName,missing:verified.missing,onPressure:detail=>this.emit(id,'context-pressure','Context almost full · about to compact',detail)});
        const current=this.store.budget(id);current.usedSteps++;current.pendingTokens=prepared.maxTokens;this.store.saveBudget(id,current);this.budgetEvent(id);
        this.store.saveCheckpoint(id,{version:2,inputTokens:prepared.inputTokens,requestIndex:state.requestIndex,job:state.currentJob});
        if(prepared.compacted)compactions++;
        const contextDetail={inputTokens:prepared.inputTokens,context:this.runtime.config.context,reservedTokens:128+prepared.images*1024,compacted:!!prepared.compacted,compactions,job:state.currentJob,groups:state.groups};
        this.emit(id,'context',`${prepared.compacted?'Context compacted':'Working context'} · ${prepared.inputTokens.toLocaleString()} text tokens`,contextDetail);
        this.emit(id,'model-input','Saved the supplied model input',{harness:version,messages:prepared.messages,tools:prepared.tools.map(t=>t.function.name),toolSchemas:prepared.tools.map(t=>t.function),model:this.runtime.config.model,context:this.runtime.config.context,seed:this.runtime.config.seed??42,temperature:this.runtime.config.temperature??0.2,inputTokens:prepared.inputTokens,maxTokens:prepared.maxTokens});
        if(this.store.settings().diagnostics)this.emit(id,'input-snapshot','Inspect the exact formatted model input',await this.runtime.inspect(prepared.messages,prepared.tools,signal));
        this.emit(id,'model',`Reading ${prepared.inputTokens.toLocaleString()} text tokens`,{...contextDetail,outputAllowance:prepared.maxTokens,step:current.usedSteps});
        let answer,lastEvent=0,streamedDraft='';
        const streamAnswer=prepared.mode!=='generation'&&!state.requireArtifact&&!state.web&&!state.jobs.length;
        try{
          answer=await this.runtime.complete(prepared.messages,prepared.tools,signal,d=>{
            if(prepared.mode==='generation'&&d.kind==='text')streamedDraft+=d.text;
            if(d.kind==='text'&&streamAnswer)this.emit(id,'delta',d.text);
            else if(Date.now()-lastEvent>400){lastEvent=Date.now();this.emit(id,'action-stream',prepared.mode==='generation'?'Writing '+prepared.generation.path+' · '+streamedDraft.length.toLocaleString()+' characters':'Preparing the next step',{characters:prepared.mode==='generation'?streamedDraft.length:d.characters});}
          },{maxTokens:prepared.maxTokens});
        }catch(e){
          this.chargeResponse(id);
          if(prepared.mode==='generation'&&streamedDraft){
            const g=prepared.generation;state.generation={...g,content:g.content+streamedDraft,chunks:g.chunks+1};
            this.emit(id,'draft','Interrupted draft retained; no file published',{kind:g.kind,path:g.path,content:streamedDraft,interrupted:true});this.store.saveWork(id,state);
          }
          signal.throwIfAborted();if(++formatFailures>=3)throw e;
          state.last={result:{error:e.message,next:'Return a shorter complete operation. No partial operation executed.'}};this.store.saveWork(id,state);this.emit(id,'tool-error',e.message);continue;
        }
        formatFailures=0;this.chargeResponse(id,answer.usage);
        state.metrics.inputTokens+=prepared.inputTokens;state.metrics.outputTokens+=answer.usage?.completion_tokens??prepared.maxTokens;state.metrics.modelCalls++;
        if(prepared.mode==='generation'){
          this.emit(id,'draft','Drafting '+prepared.generation.path,{kind:prepared.generation.kind,path:prepared.generation.path,content:answer.content,finish:answer.finish,usage:answer.usage,timings:answer.timings});
          try{
            const action=acceptGeneration(state,prepared,answer);this.store.saveWork(id,state);
            if(!action){this.emit(id,'check','Unfinished draft saved; continuing before publishing');continue;}
            answer={...answer,...action,dispatchVersion:'tom-content-v1'};
          }catch(e){
            if(e instanceof BudgetReached)throw e;
            state.generation=null;state.generationErrors=(state.generationErrors??0)+1;state.last={result:{error:e.message}};this.store.saveWork(id,state);
            this.emit(id,'tool-error','Draft was not published: '+e.message);if(state.generationErrors>=3)throw new TaskBlocked(e.message);continue;
          }
        }
        const {usage,finish,timings,dispatchVersion,blocked,...message}=answer;
        if(!message.tool_calls?.length){
          if(blocked){this.store.message(id,message);if(!streamAnswer)this.emit(id,'delta',message.content);throw new TaskBlocked(message.content);}
          if(!message.content)throw Error('The model returned an empty reply.');
          const checked=await completion(state,task.cwd);
          if(state.web){
            const seen=new Set(state.readUrls.flatMap(r=>[r.url,r.requestedUrl]).filter(Boolean).map(u=>u.replace(/\/$/,'')));
            const links=(message.content.match(/https?:\/\/[^\s<>"\]`*]+/g)??[]).map(u=>u.replace(/[).,;]+$/,'').replace(/\/$/,''));
            if(links.some(u=>!seen.has(u))){checked.passed=false;checked.missing.push('Cite only pages actually read.');}
          }
          if(!checked.passed){
            this.emit(id,'completion-rejected','The requested work still needs checks',{...checked,candidate:message.content});
            if(++rejected>=3)throw new TaskBlocked(checked.missing.join(' '));
            state.last={result:{error:'Completion rejected',missing:checked.missing}};this.store.saveWork(id,state);continue;
          }
          if(!streamAnswer)this.emit(id,'delta',message.content);
          this.store.message(id,message);history.push(message);this.emit(id,'response','Response received',{usage,finish,timings,dispatchVersion});
          if(finish==='length'){state.continuation=message.content;this.store.saveWork(id,state);continue;}
          state.continuation=null;state.verification=checked;this.store.saveWork(id,state);this.store.status(id,'complete');
          this.emit(id,'complete',state.requireArtifact?'Task finished · check details are saved':'Reply complete',{verification:checked,metrics:state.metrics});return;
        }
        this.store.message(id,message);history.push(message);this.emit(id,'response','Action received',{usage,finish,timings,dispatchVersion});
        for(const call of message.tool_calls){
          signal.throwIfAborted();let record,result,body;
          const name=call.function.name,args=JSON.parse(call.function.arguments);
          try{
            decode(JSON.stringify({[name]:args}),prepared.actionTools??prepared.tools);
            body=await box.prepare(name,args,signal);body.callId=call.id;body.actor=prepared.mode==='generation'?'content-adapter':'model';
            body.effect=readOperations.has(name)||name==='browse'&&['open','inspect','close'].includes(args.action)?'read':'write';
            const signature=hash(JSON.stringify([name,args,Object.values(state.writes).map(w=>w.sha256)]));
            state.repeats[signature]=(state.repeats[signature]??0)+1;
            if(state.repeats[signature]>2)throw new TaskBlocked('The same action repeated without useful progress. The checkpoint is saved.');
            record=this.store.action(id,body);this.emit(id,'decision',body.arguments?.summary??'Using '+name,{action:record.id,tool:name});
            if(body.reviewKey&&(this.store.settings().commands??'review')==='review'&&!state.grants.includes(body.reviewKey)){
              this.pauseClock();this.store.status(id,'review');this.emit(id,'review',body.reviewDescription??'Review the command before it runs',{action:record});
              const accepted=await this.waitReview(record.id,signal);if(!accepted)throw new ReviewDeclined('The action was declined. The task is paused.');
              state.grants.push(body.reviewKey);this.store.saveWork(id,state);this.startClock();this.store.status(id,'running');
            }
            signal.throwIfAborted();this.store.finishAction(record.id,'running');
            this.emit(id,'action',body.arguments?.summary??'Using '+name,{action:record.id,tool:name,arguments:body.arguments});
            const start=Date.now();state.metrics.firstActionMs??=start-state.started;
            result=await box.execute(name,args,body,signal,output=>this.emit(id,'output',output,{action:record.id}));
            state.metrics.toolMs+=Date.now()-start;
            const failed=!!result.error||result.passed===false||result.check?.passed===false||result.exitCode!=null&&result.exitCode!==0;
            const progress=hash(JSON.stringify([state.readPaths,state.writes,state.readUrls,state.jobs.map(j=>j.status),state.checks.map(c=>[c.kind,c.inputs,c.passed,c.results]),result.output??result.content??null]));
            state.stagnant=progress===state.progress?((state.stagnant??0)+1):0;state.progress=progress;
            remember(state,record.id,result);state.failures=failed?state.failures+1:0;
            if(failed){state.last.operation=name;state.last.arguments=args;}
            const uncertain=body.effect==='write'&&(signal.aborted||result.timedOut||result.cancelled);
            this.store.commitAction(record.id,uncertain?'uncertain':'complete',result,id,state);
            this.emit(id,result.verified&&result.path?'file':failed?'tool-error':'check',result.verified&&result.path?'Saved '+result.path:failed?'The check needs attention':'Step finished',{...result,action:record.id});
            for(const [artifactIndex,file]of (result.artifacts??[]).entries())this.emit(id,'file','Saved '+file.path,{...file,action:record.id,artifactIndex});
            signal.throwIfAborted();if(uncertain)throw new TaskBlocked('The action was interrupted and may have changed files or external state. Inspect its result before continuing.');
            if(state.failures>=3)throw new TaskBlocked('Three steps failed without progress. Review the saved results before continuing.');
            if(state.stagnant>=2)throw new TaskBlocked('Repeated steps produced no new evidence or changed result. The checkpoint is saved.');
          }catch(e){
            if(e instanceof ReviewDeclined){if(record)this.store.finishAction(record.id,'declined');throw e;}
            if(e instanceof TaskBlocked||e instanceof BudgetReached)throw e;
            const running=record&&this.store.getAction(record.id)?.status==='running';
            const uncertain=running&&body?.effect==='write'&&!(e instanceof ToolPreconditionError);
            result={error:e.message};if(record&&running)this.store.finishAction(record.id,uncertain?'uncertain':'failed',result);
            state.last={id:record?.id,operation:name,arguments:args,result};state.failures++;this.store.saveWork(id,state);this.emit(id,'tool-error',e.message);
            if(uncertain||signal.aborted)throw e;
            if(state.failures>=3)throw new TaskBlocked('Three steps failed without progress. '+e.message);
          }
          const toolMessage={role:'tool',tool_call_id:call.id,content:JSON.stringify(result)};
          this.store.message(id,toolMessage);history.push(toolMessage);
        }
      }
    }catch(e){
      const reached=e instanceof BudgetReached||signal.reason instanceof BudgetReached;
      const status=e instanceof ReviewDeclined?'paused':reached?'budget':signal.reason instanceof TaskBlocked?'blocked':signal.aborted?(this.active.mode==='pause'?'paused':'stopped'):e instanceof TaskBlocked?'blocked':'error';
      this.store.status(id,status);this.emit(id,status,signal.aborted&&!reached&&status!=='blocked'?'Stopped the current step. Progress is saved.':signal.reason?.message??e.message);
    }finally{
      clearInterval(memoryMonitor);this.pauseClock();if(this.store.budget(id).pendingTokens)this.chargeResponse(id);
      if(state)this.store.saveWork(id,state);await box?.close();this.budgetEvent(id);this.review=null;this.active=null;this.runtime.progress=null;this.runtime.release();
    }
  }
  waitReview(action,signal){return new Promise((resolve,reject)=>{const abort=()=>{this.store.finishAction(action,'declined');reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});this.review={action,resolve:value=>{signal.removeEventListener('abort',abort);this.review=null;resolve(value);}};});}
  decide(action,approved){if(this.review?.action!==action)throw Error('This review is no longer active.');this.review.resolve(approved);}
  cancel(id,mode){if(this.active?.id!==id)throw Error('This task is not running.');this.active.mode=mode;this.emit(id,'control',mode==='pause'?'Pausing the current step':'Stopping the current step');this.active.controller.abort(new Error(mode));}
}
