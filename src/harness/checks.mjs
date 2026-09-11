import fs from 'node:fs/promises';
import path from 'node:path';
import {hash,shellTool} from '../tools.mjs';
import {fingerprints,freshCheck,keyFor,fileDigest} from './state.mjs';

export async function checkFile(args,cwd,signal){
  const file=path.resolve(cwd,args.path);
  if((await fs.stat(file)).size>8*1024*1024)return {kind:args.kind,path:file,inputs:{[file]:await fileDigest(file)},passed:false,detail:'Automatic text checks are limited to 8 MiB. Split this output into smaller files for automatic checks.',scope:'Size limit; content not checked'};
  const bytes=await fs.readFile(file),text=bytes.toString('utf8');
  const result={kind:args.kind,path:file,inputs:{[file]:hash(bytes)},passed:false,observedAt:new Date().toISOString()};
  try{
    if(args.kind==='json'){JSON.parse(text.replace(/^\uFEFF/,''));result.passed=true;result.scope='JSON syntax only';}
    else if(args.kind==='syntax'){
      if(!/\.[cm]?js$/i.test(file))throw Error('Syntax checks currently support JS, CJS and MJS. Use an installed language tool through run for other languages.');
      const run=await shellTool({program:process.execPath,args:['--check',file],timeoutSeconds:15},cwd,signal);
      result.passed=run.exitCode===0&&!run.cancelled&&!run.timedOut;result.detail=run.output;result.scope='JavaScript syntax only; no code executed';
    }else if(args.kind==='contains'||args.kind==='equals'){
      if(typeof args.value!=='string')throw Error('This check needs a value.');
      result.passed=args.kind==='equals'?text===args.value:text.includes(args.value);result.scope='Comparison against supplied value (not an independent oracle)';
    }else throw Error('Unknown check kind.');
  }catch(e){result.detail=e.message;}
  return result;
}
export async function afterWrite(result,state,cwd,signal,browser){
  const ext=path.extname(result.path).toLowerCase();
  if(ext==='.json'||/\.[cm]?js$/.test(ext)){
    const check=await checkFile({path:result.path,kind:ext==='.json'?'json':'syntax'},cwd,signal);state.checks.push(check);return check;
  }
  if(/\.html?$/.test(ext)&&browser&&!state.noBrowse){
    const check={kind:'browser',path:result.path,inputs:{[result.path]:result.sha256??await fileDigest(result.path)},passed:false,observedAt:new Date().toISOString(),scope:'Browser load, page errors and desktop overflow only; not exhaustive interaction testing'};
    try{const view=await browser.act({action:'open',url:result.path},cwd,signal);check.passed=!view.pageErrors?.length&&!view.layout?.horizontalOverflow&&!view.error&&!view.blocked;check.detail=JSON.stringify({pageErrors:view.pageErrors,layout:view.layout,error:view.error});}catch(e){check.detail=e.message;}
    state.checks.push(check);return check;
  }
  return null;
}
export async function completion(state,cwd,{outputs=[...new Set([...state.outputs,...Object.values(state.writes).map(w=>w.path)])],jobOnly=false}={}){
  const missing=[],unverified=[],validChecks=[];
  for(const c of state.checks)if(await freshCheck(c))validChecks.push(c);
  for(const source of jobOnly?[]:state.sources){
    const file=path.resolve(cwd,source),key=keyFor(file);
    if(state.readPaths.includes(key)){
      const observed=Object.values(state.refs).findLast(r=>keyFor(r.path)===key);
      const digest=await fileDigest(file).catch(()=>null);
      if(!observed||digest===null||digest!==observed.sha256)state.readPaths=state.readPaths.filter(p=>p!==key);
    }
    if(!state.readPaths.includes(key))missing.push('Read requested source '+source);
  }
  if(!jobOnly&&state.requireArtifact&&!Object.keys(state.writes).length)missing.push('Create the requested artifact');
  for(const requested of outputs){
    const file=path.resolve(cwd,requested),write=state.writes[keyFor(file)];
    if(!write){missing.push('Create or update '+requested);continue;}
    let digest,size;try{digest=await fileDigest(file);size=(await fs.stat(file)).size;}catch{missing.push('Missing file '+requested);continue;}
    if(digest!==write.sha256){missing.push('File changed since last observation: '+requested+'; read it and recheck');continue;}
    if(state.maxCharacters&&(size>=state.maxCharacters*4||Array.from(await fs.readFile(file,'utf8')).length>=state.maxCharacters))missing.push('Shorten '+requested+' below '+state.maxCharacters+' characters');
    const checks=validChecks.filter(c=>Object.hasOwn(c.inputs??{},file));
    if(/\.json$/i.test(file)&&!checks.some(c=>c.kind==='json'))missing.push('JSON must parse: '+requested);
    if(state.dataWork&&!state.noExecute&&/\.json$/i.test(file)&&!checks.some(c=>c.kind==='calculation'))missing.push('Compute '+requested+' from the input files with transform');
    if(/\.[cm]?js$/i.test(file)&&!checks.some(c=>c.kind==='syntax'))missing.push('Syntax must pass: '+requested);
    if(/\.html?$/i.test(file)&&!state.noBrowse&&!checks.some(c=>c.kind==='browser'))missing.push('Open the saved HTML and inspect it: '+requested);
    if(/\.(?:[cm]?js|[cm]?ts|py|rs|go|java|c|cpp)$/i.test(file)){
      if(!state.noExecute&&!checks.some(c=>c.kind==='test'))missing.push(state.commonJsFunction?'Use test to check the exported function in '+requested+' with input/output examples':'Run appropriate tests for '+requested+' with inputs including this file');
      else if(state.noExecute)unverified.push(requested+': execution was excluded by the request');
    }
    const relevant=state.checks.filter(c=>Object.hasOwn(c.inputs??{},file));
    const latest=new Map();for(const c of relevant)latest.set(c.kind,c);
    for(const c of latest.values())if(!c.passed){const failed=c.results?.find(r=>!r.passed);missing.push('Repair failed '+c.kind+' check for '+requested+': '+(c.detail??failed?.error??(failed?JSON.stringify(failed):'')));}
    if(!checks.length)unverified.push(requested+': saved bytes verified; content has no automatic correctness check');
  }
  if(!jobOnly){
    if(state.requireSearch&&!state.searches.some(s=>s.count>0))missing.push('Obtain usable search results for '+state.query);
    if(state.web&&state.readUrls.length<state.minSources)missing.push('Read '+(state.minSources-state.readUrls.length)+' more source(s)');
    for(const url of state.requestedUrls)if(!state.readUrls.some(r=>r.url===url||r.requestedUrl===url))missing.push('Read requested page '+url);
    if(state.jobs.some(j=>j.status!=='done'))missing.push('Finish the active job with advance before answering');
  }
  return {passed:!missing.length,missing:[...new Set(missing)],unverified,checks:validChecks.map(c=>({kind:c.kind,path:c.path,scope:c.scope}))};
}
export async function runCheck(args,cwd,execute){
  if(args.test&&(!args.inputs?.length))throw Error('A test must name its inputs so changes invalidate the result.');
  const inputs=await fingerprints(args.inputs??[],cwd),result=await execute();result.observedInputs=inputs;
  if(args.test){
    const after=await fingerprints(args.inputs,cwd).catch(()=>null);
    result.check={kind:'test',inputs,passed:result.exitCode===0&&!result.timedOut&&!result.cancelled&&JSON.stringify(inputs)===JSON.stringify(after),detail:result.output,scope:'User/model-selected command; passing exit status is not proof of complete correctness',observedAt:new Date().toISOString()};
  }
  return result;
}
