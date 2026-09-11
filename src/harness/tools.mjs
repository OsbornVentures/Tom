import fs from 'node:fs/promises';
import path from 'node:path';
import {hash,writeTool,shellTool,validateTool,preflightTool,ToolPreconditionError} from '../tools.mjs';
import {searchWeb} from '../search-api.mjs';
import {observeFile,resolveFile,keyFor,addJobs,fingerprints,freshCheck,fileDigest} from './state.mjs';
import {afterWrite,checkFile,completion,runCheck} from './checks.mjs';
import {BrowserSession} from './browser.mjs';
import {relevance} from '../relevance.mjs';
import {localCapabilities} from '../capabilities.mjs';
import {functionParameters,normalizeExamples} from './interface.mjs';

export class Toolbox {
  constructor({root,cwd,state,store,id,settings}){Object.assign(this,{root,cwd,state,store,id,settings});this.browser=new BrowserSession(root,settings.browser??'edge');}
  async prepare(name,args,signal){
    const body={name,arguments:args,operation:name};
    try{
      if(name==='implement'){
        if(args.parameters.length>16||args.parameters.some(p=>!/^[$A-Z_a-z][$\w]*$/.test(p))||new Set(args.parameters).size!==args.parameters.length)throw Error('Use distinct JavaScript parameter names.');
        const prepared=await this.prepare('write',{path:args.path,content:'module.exports = function('+args.parameters.join(', ')+') {\n'+args.body+'\n};\n'},signal);return {...prepared,operation:name,functionParameters:args.parameters};
      }
      if(name==='write'||name==='edit'){
        const full=path.resolve(this.cwd,args.path);
        if(this.state.protectedFiles?.some(p=>keyFor(path.resolve(this.cwd,p))===keyFor(full)))throw Error('The user asked to preserve this source unchanged: '+args.path);
        if(this.state.outputs.length&&!this.state.outputs.some(p=>keyFor(path.resolve(this.cwd,p))===keyFor(full))&&this.state.sources.some(p=>keyFor(path.resolve(this.cwd,p))===keyFor(full)))throw Error('This file is a source for the requested copy. Write the named output instead: '+this.state.outputs.join(', '));
        const observed=Object.entries(this.state.refs).findLast(([,r])=>keyFor(r.path)===keyFor(full));
        const reference=args.base==='new'?null:args.base??observed?.[0];
        const base=reference?await resolveFile(this.state,reference,this.cwd):null;
        if(this.state.exclusiveOutputs&&this.state.outputs.length&&!this.state.outputs.some(p=>keyFor(path.resolve(this.cwd,p))===keyFor(full)))throw Error('The request permits only these output files: '+this.state.outputs.join(', '));
        if(base&&keyFor(base.path)!==keyFor(full))throw Error('base belongs to another destination.');
        body.name='write';body.arguments={summary:(name==='edit'?'Edit ':'Save ')+args.path,path:args.path,expectedHash:base?.sha256??'new'};
        if(name==='edit'){const source=await resolveFile(this.state,args.source,this.cwd);body.arguments={...body.arguments,copyFrom:source.path,sourceHash:source.sha256,replacements:args.replacements};}
        else body.arguments.content=args.content;
        validateTool(body);
      }else if(name==='run'){
        body.name='shell';body.arguments={summary:(args.test?'Test with ':'Run ')+args.program,program:args.program==='node'?process.execPath:args.program,args:args.args,...(args.timeoutSeconds?{timeoutSeconds:args.timeoutSeconds}:{})};
        const action=validateTool(body);body.arguments=action.arguments;await preflightTool(action,signal,this.cwd);
        if(body.arguments.program===process.execPath&&body.arguments.args[0]&&!body.arguments.args[0].startsWith('-')){
          const script=path.resolve(this.cwd,body.arguments.args[0]);if(!(await fs.stat(script).catch(()=>null))?.isFile())throw Error('The script does not exist. Create '+body.arguments.args[0]+' with write before running it.');
        }
        if(this.state.noExecute)throw Error('Execution was excluded by the user request.');
        if(args.test&&!args.inputs?.length)throw Error('A test must name inputs so file changes invalidate it.');
        body.reviewKey='command:'+hash(JSON.stringify([this.cwd,body.arguments.program,body.arguments.args,await fingerprints(args.inputs??[],this.cwd)]));
      }else if(name==='test'){
        if(this.state.noExecute)throw Error('Execution was excluded by the user request.');
        if(!args.cases.length||args.cases.length>12)throw Error('Supply 1–12 input/output examples.');
        if(!/\.[cm]?js$/i.test(args.path))throw Error('Function examples support CommonJS JavaScript; use run for other languages.');
        const inputs=await fingerprints([args.path],this.cwd);
        const contract=this.state.interfaces?.[keyFor(path.resolve(this.cwd,args.path))];
        const cases=normalizeExamples(args.cases,contract?.sha256===inputs[path.resolve(this.cwd,args.path)]?contract.parameters:null);
        body.name='shell';body.arguments={summary:'Test examples for '+args.path,program:process.execPath,args:['--max-old-space-size=64',path.join(this.root,'src/harness/function-test.mjs'),JSON.stringify({...args,cases,cwd:this.cwd})],timeoutSeconds:20};
        body.reviewKey='function-test:'+hash(JSON.stringify([inputs,args.cases]));
      }else if(name==='transform'){
        if(this.state.noExecute)throw Error('Execution was excluded by the user request.');
        args={...args,inputs:args.inputs??this.state.sources};
        if(!args.inputs.length||args.inputs.length>16)throw Error('Supply 1–16 input files.');
        const inputs=await fingerprints(args.inputs,this.cwd);
        body.name='shell';body.arguments={summary:'Calculate and save '+args.path,program:process.execPath,args:['--max-old-space-size=64',path.join(this.root,'src/harness/data-transform.mjs'),JSON.stringify({...args,cwd:this.cwd})],timeoutSeconds:15};
        body.reviewKey='transform:'+hash(JSON.stringify([inputs,args.path,args.code]));
      }else if(name==='browse'){
        if(this.state.noBrowse)throw Error('Opening or interacting with pages was excluded by the request.');
        body.arguments={...args,summary:'Browser '+args.action};
        if(!['open','inspect','close'].includes(args.action)){
          const url=this.browser.page?.url();if(!url)throw Error('Open and inspect the page before interacting.');
          body.reviewKey='browser:'+new URL(url).origin;
          body.reviewDescription='Allow browser interactions for this task on '+new URL(url).origin;
        }
      }else if(name==='search'&&this.state.requireSearch&&!relevance(this.state.query,{title:args.query}).passed){
        throw Error('Keep the requested research subject in the query: '+this.state.query);
      }
      return body;
    }catch(e){throw new ToolPreconditionError(e.message);}
  }
  async execute(name,args,body,signal,onOutput=()=>{}){
    const state=this.state,cwd=this.cwd;
    signal?.throwIfAborted();
    if(name==='use'){if(!state.groups.includes(args))state.groups.push(args);return {loaded:args,...(['programs','web'].includes(args)?{available:localCapabilities()}:{} )};}
    if(name==='compose'){state.generation={kind:'file',path:args.path,instructions:args.instructions??'',content:'',chunks:0};return {kind:'compose',path:args.path,next:'Write the complete file in the next turn.'};}
    if(name==='repair'){
      const file=path.resolve(cwd,args.path),key=keyFor(file),digest=await fileDigest(file);
      const failed=state.checks.findLast(c=>c.kind==='test'&&c.inputs?.[file]===digest);
      if(state.writes[key]?.sha256!==digest||!failed||failed.passed)throw new ToolPreconditionError('Repair needs a failed test of the current saved file.');
      state.repairAttempts??={};if((state.repairAttempts[key]??0)>=2)throw new ToolPreconditionError('Two focused repairs have been attempted. Inspect the saved evidence before trying again.');
      state.repairAttempts[key]=(state.repairAttempts[key]??0)+1;
      state.generation={kind:args.target==='code'?'file':'examples',path:args.path,instructions:args.reason,content:'',chunks:0};
      return {kind:'repair',path:args.path,target:args.target,reason:args.reason,next:'Revise '+args.target+' against the user specification.'};
    }
    if(name==='read'){
      const file=path.resolve(cwd,args.path),stat=await fs.stat(file);if(!stat.isFile()||stat.size>8*1024*1024)throw new ToolPreconditionError('Read supports regular UTF-8 files up to 8 MiB; use a CLI for other formats.');
      const bytes=await fs.readFile(file),content=bytes.toString('utf8');if(!Buffer.from(content).equals(bytes)||content.includes('\0'))throw new ToolPreconditionError('This is not a UTF-8 text file. Use an installed format reader.');
      const lines=content.split('\n'),start=Math.max(1,args.start??1),count=Math.max(1,Math.min(250,args.lines??100));
      const sha256=hash(bytes),ref=observeFile(state,file,sha256),key=keyFor(file);
      if(!state.readPaths.includes(key))state.readPaths.push(key);
      if(state.writes[key])state.writes[key]={...state.writes[key],sha256};
      const selected=lines.slice(start-1,start-1+count).join('\n');
      return {kind:'read',ref,path:file,sha256,start,totalLines:lines.length,content:selected.slice(0,16000),truncated:start>1||start-1+count<lines.length||selected.length>16000,note:'Use read(start,lines) for more; the reference tracks the entire file version.'};
    }
    if(name==='find'){
      const root=path.resolve(cwd,args.path),results=[];let visited=0,limited=false;
      async function walk(dir){
        for(const e of await fs.readdir(dir,{withFileTypes:true})){
          signal?.throwIfAborted();if(++visited>5000||results.length>=100){limited=true;return;}
          if(e.isSymbolicLink()||['.git','.state','node_modules','runtime','models'].includes(e.name))continue;
          const file=path.join(dir,e.name);
          if(e.isDirectory())await walk(file);
          else if(e.isFile()){
            if(!args.query)results.push({path:path.relative(root,file)});
            else if((await fs.stat(file)).size<=1024*1024){const text=await fs.readFile(file,'utf8');if(text.includes('\0'))continue;const lines=text.split('\n');for(let i=0;i<lines.length&&results.length<100;i++)if(lines[i].toLowerCase().includes(args.query.toLowerCase()))results.push({path:path.relative(root,file),line:i+1,text:lines[i].slice(0,400)});}
          }
        }
      }
      await walk(root);return {root,results,truncated:limited};
    }
    if(name==='write'||name==='edit'||name==='implement'){
      const result=await writeTool(body.arguments,cwd,path.join(this.root,'.state','snapshots'),signal),ref=observeFile(state,result.path,result.sha256);state.requireArtifact=true;
      state.writes[keyFor(result.path)]={path:result.path,sha256:result.sha256};
      state.interfaces??={};if(body.functionParameters)state.interfaces[keyFor(result.path)]={parameters:body.functionParameters,sha256:result.sha256};
      const check=await afterWrite(result,state,cwd,signal,this.browser);
      const content=await fs.readFile(result.path,'utf8'),parameters=/\.[cm]?js$/i.test(result.path)?functionParameters(content):null;
      if(parameters){state.interfaces??={};state.interfaces[keyFor(result.path)]={parameters,sha256:result.sha256};}
      state.drafts??=[];state.drafts=state.drafts.filter(d=>d.path!==result.path);state.drafts.push({path:result.path,ref,content:content.slice(0,8000)});state.drafts=state.drafts.slice(-2);
      return {...result,ref,...(check?{check}:{}),note:'Bytes saved. Completion still requires the task checks.'};
    }
    if(name==='run'){
      const result=await runCheck(args,cwd,()=>shellTool(body.arguments,cwd,signal,onOutput,this.id));
      if(result.check)state.checks.push(result.check);
      const stable=result.exitCode===0&&!result.cancelled&&!result.timedOut&&await freshCheck({passed:true,inputs:result.observedInputs});
      if(stable)for(const [file,digest]of Object.entries(result.observedInputs)){
        observeFile(state,file,digest);const key=keyFor(file);if(!state.readPaths.includes(key))state.readPaths.push(key);
      }
      // Observe declared deliverables created/changed through a CLI, too.
      for(const p of [...state.outputs,...state.jobs.flatMap(j=>j.outputs)]){
        const file=path.resolve(cwd,p);try{const digest=await fileDigest(file);const prior=state.writes[keyFor(file)];
          if(prior?.sha256!==digest){state.writes[keyFor(file)]={path:file,sha256:digest};observeFile(state,file,digest);const check=await afterWrite({path:file},state,cwd,signal,this.browser);if(check)result.artifactCheck=check;result.artifacts??=[];result.artifacts.push({path:file,sha256:digest,bytes:(await fs.stat(file)).size,verified:true,note:'Saved bytes recorded after the native command; correctness has a separate check scope.'});}
          if(state.dataWork&&stable&&/\.json$/i.test(file)&&state.sources.every(p=>Object.hasOwn(result.observedInputs,path.resolve(cwd,p))))state.checks.push({kind:'calculation',path:file,passed:true,inputs:{...result.observedInputs,[file]:digest},scope:'Successful model-selected native command with unchanged declared sources; formula correctness is not independently proven'});
        }catch(e){if(e.code!=='ENOENT')throw e;}
      }
      return result;
    }
    if(name==='test'){
      const run=await shellTool(body.arguments,cwd,signal,onOutput,this.id);let check;
      try{check=JSON.parse(run.output);}catch{throw new ToolPreconditionError('Function test did not produce a complete result: '+run.output);}
      check.passed=check.passed&&run.exitCode===0&&!run.timedOut&&!run.cancelled;state.checks.push(check);
      if(state.generation?.kind==='examples'&&keyFor(path.resolve(cwd,state.generation.path))===keyFor(path.resolve(cwd,args.path)))state.generation=null;
      return {exitCode:run.exitCode,cancelled:run.cancelled,timedOut:run.timedOut,kind:'test',passed:check.passed,check};
    }
    if(name==='transform'){
      const run=await shellTool(body.arguments,cwd,signal,onOutput,this.id);let computed;
      try{computed=JSON.parse(run.output);}catch{throw new ToolPreconditionError('Calculation returned an incomplete result. No output file changed.');}
      if(run.cancelled||run.timedOut||run.exitCode!==0||computed.error)throw new ToolPreconditionError((computed.error??'Calculation interrupted. No output file changed.')+' JSON and CSV inputs in data are already parsed; use data[filename] directly and return the result. Use programs for unsupported formats or larger calculations.');
      const content=/\.json$/i.test(args.path)?JSON.stringify(computed.value,null,2)+'\n':typeof computed.value==='string'?computed.value:JSON.stringify(computed.value);
      const writeArgs={path:args.path,content},prepared=await this.prepare('write',writeArgs,signal);
      const result=await this.execute('write',writeArgs,prepared,signal);
      const check={kind:'calculation',path:result.path,passed:true,inputs:{...computed.inputs,[result.path]:result.sha256},scope:'Reproducible model-selected calculation from source bytes; formula correctness is not independently proven'};
      state.checks.push(check);return {...result,check,calculation:args.code};
    }
    if(name==='check'){const check=await checkFile(args,cwd,signal);state.checks.push(check);return check;}
    if(name==='search'){
      const page=await searchWeb(args.query,{signal});
      state.searches.push({query:args.query,count:page.results?.filter(r=>!state.requireSearch||relevance(state.query,r).passed).length??0});
      if(!state.requireArtifact){state.web=true;state.minSources=Math.max(1,state.minSources);}
      return page;
    }
    if(name==='browse'){
      const result=await this.browser.act(args,cwd,signal);
      if(result.url&&result.content&&!result.error&&!result.blocked){
        if(/^https?:/.test(result.url)&&!state.readUrls.some(r=>r.url===result.url)&&(!state.requireSearch||relevance(state.query,result).passed))state.readUrls.push({url:result.url,requestedUrl:result.requestedUrl,title:result.title});
        if(result.url.startsWith('file:')){
          const {fileURLToPath}=await import('node:url'),file=fileURLToPath(result.url);
          state.checks.push({kind:'browser',path:file,inputs:{[file]:hash(await fs.readFile(file))},passed:!result.pageErrors?.length&&!result.layout?.horizontalOverflow,detail:JSON.stringify({pageErrors:result.pageErrors,layout:result.layout}),scope:'Browser load, page errors and desktop overflow only'});
        }
      }
      return result;
    }
    if(name==='recall')return this.store.recall(this.id,args);
    if(name==='plan'){addJobs(state,args.jobs);return {jobs:state.jobs,currentJob:state.currentJob+1};}
    if(name==='advance'){
      const job=state.jobs[state.currentJob];if(!job)throw Error('There is no active job.');
      const checked=await completion(state,cwd,{outputs:job.outputs,jobOnly:true});if(!checked.passed)return {...checked,error:'Current job still has unmet checks.'};
      job.status='done';job.note=args.note;job.verification=checked;state.currentJob++;if(state.jobs[state.currentJob])state.jobs[state.currentJob].status='active';return {finished:job.title,next:state.jobs[state.currentJob]??null,unverified:checked.unverified};
    }
    throw new ToolPreconditionError('Unknown operation.');
  }
  async close(){await this.browser.close();}
}
