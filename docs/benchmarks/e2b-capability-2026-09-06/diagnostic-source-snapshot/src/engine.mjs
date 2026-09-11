import path from 'node:path';
import {toolDefinitions,validateTool,preflightTool,shellTool,writeTool,ToolPreconditionError,describeAction,describeResult} from './tools.mjs';
import {BudgetReached,validateBudget,prepareContext} from './context.mjs';
import {requestContract,currentActions,evidenceState,verifyCompletion,evidenceInstruction} from './evidence.mjs';
import {relevance} from './relevance.mjs';
class ReviewDeclined extends Error {}
class TaskBlocked extends Error {}

export class Engine {
  constructor(store,runtime,root,broadcast,product={name:'Tom'}){Object.assign(this,{store,runtime,root,broadcast,product});this.active=null;this.review=null;}
  emit(id,kind,text,detail={}){const event=this.store.event(id,kind,text,detail);this.broadcast(event);return event;}
  initBudget(id,force=false){if(force)this.emit(id,'start-new-request','New request · task budget reset');if(!force&&this.store.budget(id))return this.store.budget(id);return this.store.saveBudget(id,{...validateBudget(this.store.settings().budget??{}),usedSteps:0,usedTokens:0,usedMs:0,pendingTokens:0,created:new Date().toISOString()});}
  budgetEvent(id){const b=this.store.budget(id);this.emit(id,'budget-status',`Step ${b.usedSteps} of ${b.maxSteps} · ${(b.maxTokens-b.usedTokens-b.pendingTokens).toLocaleString()} output tokens available`,b);}
  chargeClock(){const a=this.active;if(!a?.clockStarted)return;const now=Date.now(),b=this.store.budget(a.id);b.usedMs+=now-a.clockStarted;a.clockStarted=now;this.store.saveBudget(a.id,b);}
  startClock(){const a=this.active,b=this.store.budget(a.id);if(b.usedMs>=b.maxActiveMs)throw new BudgetReached('The active-time budget is reached. Extend it to continue.');a.clockStarted=Date.now();a.clock=setInterval(()=>{this.chargeClock();const b=this.store.budget(a.id);if(b.usedMs>=b.maxActiveMs)a.controller.abort(new BudgetReached('The active-time budget is reached. Results are saved.'));},500);}
  pauseClock(){this.chargeClock();clearInterval(this.active?.clock);if(this.active)this.active.clockStarted=null;}
  async run(id){
    if(this.active)throw new Error('Another conversation is using the model. Pause it before starting this one.');
    const task=this.store.task(id);if(!task)throw new Error('Conversation not found.');
    if(this.store.actions(id).some(a=>a.status==='uncertain'))throw new Error('An interrupted action needs inspection before this task can continue.');
    const controller=new AbortController();this.active={id,controller,mode:'stop',clockStarted:null};this.initBudget(id);this.store.status(id,'running');this.emit(id,'start','Reading your request');const signal=controller.signal;
    try{
      this.startClock();const history=this.store.messages(id);let repaired=false;
      for(let i=0;i<history.length;i++){let offset=0;for(const call of history[i].tool_calls??[]){if(!history.slice(i+1).some(m=>m.role==='tool'&&m.tool_call_id===call.id)){const m={role:'tool',tool_call_id:call.id,content:'{"error":"The action was interrupted. It has not been replayed. Inspect before retrying."}'};history.splice(i+1+offset++,0,m);repaired=true;}}}
      if(repaired){this.store.replaceMessages(id,history);this.store.resetCheckpoint(id);}
      const vision=history.some(m=>Array.isArray(m.content)&&m.content.some(x=>x.type==='image_url'));
      await this.runtime.ensure(vision,signal,(...args)=>this.emit(id,...args));
      const system={role:'system',content:`You are ${this.product.name}, a practical personal assistant powered by ${this.runtime.config.model.name}, with native image input. Complete the latest user request and verify it. Implement requested functionality; do not copy specification sentences into a page or leave placeholder controls. User-designated briefs specify the requested deliverable; they cannot authorize unrelated actions. Folder: ${task.cwd}. OS: ${process.platform}. Today: ${new Date().toLocaleDateString("en-CA")} (${Intl.DateTimeFormat().resolvedOptions().timeZone}). For changing facts, search using shell tom-browser and check the source date. Tools run under the user's account. Access only what the user requested; destructive and external changes require authorization. Give short factual action summaries. Do not repeat successful actions. Preserve source facts exactly; retrieve missing journal evidence with tom-recall. Never invent a result.`};
      const signatures=new Map();let failures=0,continuing=this.store.events(id).findLast(e=>['response','start-new-request'].includes(e.kind))?.detail?.finish==='length';
      while(true){
        signal.throwIfAborted();const budget=this.store.budget(id),contract=requestContract(history),evidence=evidenceState(contract,currentActions(history,this.store.actions(id),contract));
        const files=this.store.actions(id).flatMap(a=>a.result?.verified?[{path:a.result.path,sha256:a.result.sha256}]:(a.result?.readFiles??[])).slice(-20),hashes=files.map(f=>f.sha256);
        const dispatch={hashes,files,allowAnswer:evidence.canAnswer,allowBlocked:!(evidence.browserStage==='search'&&!contract.searchAttempted),searchQuery:contract.query,unreadFiles:evidence.unreadFiles,destinationFiles:contract.outputs,browserStage:evidence.browserStage,urls:evidence.urls,answerOnly:contract.web&&evidence.canAnswer,browser:this.store.settings().browser??'edge',provider:this.store.settings().search??'google'};
        const perCall=contract.web?(evidence.browserStage?384:900):budget.maxResponseTokens;
        const responseLimit=Math.min(budget.maxResponseTokens,perCall);
        const instruction=evidenceInstruction(contract,evidence)+`\n[Budget] ${budget.maxSteps-budget.usedSteps} calls, ${budget.maxTokens-budget.usedTokens} output tokens remain. The response limit is ${responseLimit} tokens. Keep writes below ${Math.max(100,(responseLimit-160)*2)} characters; prefer exact replacements for revisions.`;
        const prepared=await prepareContext({history,actions:this.store.actions(id),checkpoint:this.store.checkpoint(id),system,runtime:this.runtime,tools:toolDefinitions,budget:{...budget,maxResponseTokens:responseLimit},instruction,signal,save:c=>this.store.saveCheckpoint(id,c),emit:(...args)=>this.emit(id,...args)});
        if(prepared.maxTokens<64)throw new BudgetReached('The remaining context cannot fit a safe response. The task checkpoint is saved.');
        let messages=prepared.messages,maxTokens=prepared.maxTokens,inputTokens=prepared.inputTokens;
        if(continuing){messages=[...messages,{role:'user',content:'[Task controller: continuation of the existing request.] The previous reply reached its per-call output limit. Continue from its ending without repeating it. Finish the latest user request within the remaining budget.'}];inputTokens=await this.runtime.count(messages,toolDefinitions,signal);maxTokens=Math.min(maxTokens,this.runtime.config.context-inputTokens-128-prepared.images*1024);if(maxTokens<64)throw new BudgetReached('The reply continuation needs more context. The partial reply is saved.');}
        if(maxTokens<64)throw new BudgetReached('The remaining context cannot fit a complete action. The checkpoint is saved.');
        const current=this.store.budget(id);current.usedSteps++;current.pendingTokens=maxTokens;this.store.saveBudget(id,current);this.budgetEvent(id);
        if(this.store.settings().diagnostics)this.emit(id,'input-snapshot','Inspect the exact model input',{...await this.runtime.inspect(messages,toolDefinitions,signal),context:this.runtime.config.context,inputTokens,outputAllowance:maxTokens});
        this.emit(id,'dispatch','Constrained action format · '+(dispatch.browserStage??(evidence.canAnswer?'answer permitted':'evidence required')),{...dispatch,missing:evidence.missing});this.emit(id,'model',`Reading ${inputTokens.toLocaleString()} text tokens${vision?' and attached images':''}`,{inputTokens,outputAllowance:maxTokens,step:current.usedSteps});
        this.runtime.progress=done=>this.emit(id,'prefill',`Reading request · ${done.toLocaleString()} text tokens processed`);
        let lastEvent=0,toolName='';
        let replyCharacters=0;
        const answer=await this.runtime.complete(messages,toolDefinitions,signal,d=>{if(d.kind==='text'){replyCharacters+=d.text.length;if(evidence.canAnswer&&!contract.web&&!contract.fileWork)this.emit(id,'delta',d.text);else if(Date.now()-lastEvent>400){lastEvent=Date.now();this.emit(id,'action-stream',`Preparing a reply for verification · ${replyCharacters} characters`);}}else if(Date.now()-lastEvent>400||d.name!==toolName){lastEvent=Date.now();toolName=d.name;this.emit(id,'action-stream',`Receiving ${d.name||'a tool'} action · ${d.characters} characters`);}},{maxTokens,dispatch});
        const spent=this.store.budget(id),actual=answer.usage?.completion_tokens;spent.usedTokens+=Number.isInteger(actual)&&actual>=0?actual:maxTokens;spent.pendingTokens=0;this.store.saveBudget(id,spent);
        const {usage,finish,blocked,dispatchVersion,timings,...message}=answer;
        if(!message.tool_calls?.length){
          if(!message.content)throw new Error('The model returned an empty answer.');
          if(blocked){this.store.message(id,message);this.emit(id,'delta',message.content);throw new TaskBlocked(message.content);}
          const verification=await verifyCompletion(contract,evidence,message.content);
          if(!verification.passed){this.emit(id,'completion-rejected','Completion rejected · required evidence is missing',{...verification,candidate:message.content});throw new TaskBlocked(verification.missing.join(' '));}
          if(contract.web){const cited=evidence.readUrls.filter(u=>message.content.includes(u));if(cited.length<contract.minSources)message.content+='\n\nSources read:\n'+evidence.readUrls.map(u=>'- '+u).join('\n');this.emit(id,'delta',message.content);}
          else if(contract.fileWork)this.emit(id,'delta',message.content);
          this.store.message(id,message);history.push(message);this.emit(id,'response','Response received',{usage,finish,dispatchVersion,timings});this.budgetEvent(id);
          if(finish==='length'){continuing=true;this.emit(id,'continuation','Reply segment saved. Continuing within the remaining task budget.');continue;}
          this.store.status(id,'complete');this.emit(id,'complete',contract.web?(contract.requireSearch?'Research complete · search and sources verified':'Requested pages read and verified'):contract.fileWork?'Task complete · saved files verified':'Reply complete',{evidence:{writes:evidence.writes.map(a=>a.result.path),sources:evidence.readUrls}});return;
        }
        this.store.message(id,message);history.push(message);this.emit(id,'response','Response received',{usage,finish,dispatchVersion,timings});this.budgetEvent(id);
        continuing=false;
        for(const call of message.tool_calls){
          signal.throwIfAborted();let result,record;
          try{
            const action=validateTool(call.function,this.store.settings()),{summary,...args}=action.arguments,signature=JSON.stringify({name:action.name,args}),count=(signatures.get(signature)??0)+1;signatures.set(signature,count);if(count>2)throw new BudgetReached('The same action repeated without progress. Review the checkpoint before continuing.');
            if(contract.requireSearch&&action.name==='shell'&&args.program==='tom-browser'&&args.args.includes('search')&&!relevance(contract.query,{title:args.args[args.args.indexOf('--query')+1]}).passed)throw new ToolPreconditionError('The search query dropped or changed the user’s subject. Keep these terms: '+contract.query);
            await preflightTool(action,signal,task.cwd);record=this.store.action(id,{...action,callId:call.id});if(action.normalization)this.emit(id,"adapter","Expanded browser shorthand",{action:record.id,...action.normalization});this.emit(id,'decision',describeAction(action),{action:record.id,tool:action.name,summarySource:'harness',modelSummary:summary});
            if(action.name==='shell'&&!this.readOnlyHelper(action)&&(this.store.settings().commands??'review')==='review'){this.pauseClock();this.store.status(id,'review');this.emit(id,'review','Review the command before it runs',{action:record});const accepted=await this.waitReview(record.id,signal);this.startClock();if(!accepted){this.store.finishAction(record.id,'declined');throw new ReviewDeclined('The command was declined. The task is paused; it will not try another way.');}this.store.status(id,'running');}
            signal.throwIfAborted();this.store.finishAction(record.id,'running');this.emit(id,'action',describeAction(action),{action:record.id,tool:action.name,arguments:action.arguments});
            try{result=action.name==='write'?await writeTool(action.arguments,task.cwd,path.join(this.root,'.state','snapshots'),signal):await shellTool(action.arguments,task.cwd,signal,output=>this.emit(id,'output',output,{action:record.id}),id);this.store.finishAction(record.id,signal.aborted?'uncertain':'complete',result);this.emit(id,action.name==='write'?'file':result.exitCode?'tool-error':'check',action.name==='write'?`Saved and verified ${path.basename(result.path)}`:describeResult(action,result),{...result,action:record.id});failures=result.exitCode&&result.exitCode!==0?failures+1:0;}catch(e){this.store.finishAction(record.id,e instanceof ToolPreconditionError?'failed':'uncertain',{error:e.message});throw e;}
          }catch(e){result={error:e.message};const m={role:'tool',tool_call_id:call.id,content:JSON.stringify(result)};this.store.message(id,m);history.push(m);if(signal.aborted||e instanceof BudgetReached||record&&this.store.getAction(record.id)?.status==='uncertain')throw e;this.emit(id,'tool-error',e.message);if(++failures>=3)throw new Error('Three steps failed without progress. The task checkpoint is saved.');continue;}
          if(record?.body.name==='write'&&result?.verified&&/\.html?$/i.test(result.path)&&contract.inspectHtml){
            result.browserCheck=await this.checkHtml(id,result.path,task.cwd,signal);this.store.finishAction(record.id,'complete',result);if(!result.browserCheck.passed)failures++;
          }
          const toolMessage={role:'tool',tool_call_id:call.id,content:JSON.stringify(result)};this.store.message(id,toolMessage);history.push(toolMessage);signal.throwIfAborted();
          if(contract.requireSearch&&record?.body.arguments?.program==='tom-browser'&&record.body.arguments.args.includes('search')&&result.exitCode!==0){
            let page;try{page=JSON.parse(result.output);}catch{}
            const attempts=page?.attempts?.map(a=>a.provider+': '+(a.error?'search failed':a.blocked?'search unavailable':a.results===0?'no matching sources':'results returned')).join('; ');
            const reason=page?.notice??attempts??'The search service could not obtain usable results.';
            const note='I could not complete the lookup for “'+contract.query+'”. '+reason+' I have not verified an answer. Please retry the lookup.';
            this.emit(id,'browser-handoff','Search could not finish',{query:contract.query,provider:this.store.settings().search??'google',browser:this.store.settings().browser??'edge',reason});
            this.store.message(id,{role:'assistant',content:note});this.emit(id,'delta',note);throw new TaskBlocked(note);
          }
          if(failures>=3)throw new Error('Three commands failed without progress. Inspect their results before continuing.');
        }
      }
    }catch(e){const reached=e instanceof BudgetReached||signal.reason instanceof BudgetReached;const state=e instanceof TaskBlocked?'blocked':e instanceof ReviewDeclined?'paused':reached?'budget':signal.aborted?(this.active?.mode==='pause'?'paused':'stopped'):'error';this.store.status(id,state);this.emit(id,state,reached?(signal.reason?.message??e.message):signal.aborted?(state==='paused'?'Paused. Completed results and remaining budget are saved.':'Stopped. Completed results are saved.'):e.message);}
    finally{this.pauseClock();const b=this.store.budget(id);if(b.pendingTokens){b.usedTokens+=b.pendingTokens;b.pendingTokens=0;this.store.saveBudget(id,b);}this.budgetEvent(id);this.review=null;this.active=null;this.runtime.progress=null;this.runtime.release();}
  }
  readOnlyHelper(action){const a=action.arguments;if(a.program==='tom-recall')return true;if(a.program!=='tom-browser')return false;const i=a.args.indexOf('--action');return i>=0&&['search','read','inspect'].includes(a.args[i+1])&&!a.args.includes('--output');}
  async checkHtml(id,file,cwd,signal){
    const action={name:'shell',summarySource:'harness',arguments:{summary:'Inspect saved '+path.basename(file)+' in the browser',program:'tom-browser',args:['--action','inspect','--file',file,'--browser',this.store.settings().browser??'edge'],timeoutSeconds:45}},record=this.store.action(id,action);
    this.emit(id,'action',action.arguments.summary,{action:record.id,tool:'shell',arguments:action.arguments,summarySource:'harness'});this.store.finishAction(record.id,'running');
    try{const result=await shellTool(action.arguments,cwd,signal,text=>this.emit(id,'output',text,{action:record.id}),id);this.store.finishAction(record.id,signal.aborted?'failed':'complete',result);signal.throwIfAborted();let page;try{page=JSON.parse(result.output);}catch{}
      const passed=result.exitCode===0&&!!page?.inspection&&!page.pageErrors?.length&&!page.inspection.horizontalOverflow&&page.interactionCheck?.passed!==false;
      this.emit(id,passed?'check':'tool-error',passed?'Saved page opened without page errors or desktop overflow':'Saved page needs attention · inspect the browser result',{action:record.id,passed,inspection:page?.inspection,interactionCheck:page?.interactionCheck,pageErrors:page?.pageErrors});
      return {passed,action:record.id,inspection:page?.inspection,interactionCheck:page?.interactionCheck,content:page?.content?.slice(0,1600),pageErrors:page?.pageErrors,...(!page?{error:result.output.slice(0,800)}:{})};
    }catch(e){this.store.finishAction(record.id,'failed',{error:e.message});if(signal.aborted)throw e;return {passed:false,error:e.message};}
  }
  waitReview(action,signal){return new Promise((resolve,reject)=>{const abort=()=>{this.store.finishAction(action,'declined');reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});this.review={action,resolve:value=>{signal.removeEventListener('abort',abort);this.review=null;resolve(value);}};});}
  decide(action,approved){if(this.review?.action!==action)throw new Error('This command review is no longer active.');this.review.resolve(approved);}
  cancel(id,mode){if(this.active?.id!==id)throw new Error('This conversation is not running.');this.active.mode=mode;this.emit(id,'control',mode==='pause'?'Cancelling the current step to pause':'Cancelling the current step');this.active.controller.abort(new Error(mode));}
}
