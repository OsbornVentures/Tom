import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, unlink, lstat, link, copyFile } from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StringDecoder} from 'node:string_decoder';
import {setTimeout as delay} from 'node:timers/promises';

export const hash = value => createHash('sha256').update(value).digest('hex');
export class ToolPreconditionError extends Error {constructor(message){super(message);this.name='ToolPreconditionError';}}
export function describeAction(action){
 const a=action.arguments;
 if(action.name==='write')return (a.copyFrom?'Applying exact edits to ':'Saving ')+path.basename(a.path);
 if(a.program==='tom-browser'){const get=k=>a.args[a.args.indexOf(k)+1],mode=get('--action');if(mode==='search')return 'Searching the web for “'+get('--query')+'”';if(mode==='read')return 'Reading '+get('--url');if(mode==='inspect')return 'Inspecting '+(a.args.includes('--file')?path.basename(get('--file')):get('--url'))+' in the browser';}
 if(a.program==='cat')return 'Reading '+a.args.join(', ');
 if(a.program==='tom-recall')return 'Reading saved task evidence';
 return 'Running '+path.basename(a.program);
}
export function describeResult(action,result){
 if(action.arguments?.program==='tom-browser')try{const page=JSON.parse(result.output);if(result.exitCode!==0)return page.notice??'Browser request failed; no usable evidence was obtained.';if(page.results)return `Search returned ${page.results.length} relevant result(s) via ${page.provider}`;return `Read ${page.title||page.url} · ${page.content?.length??0} characters`;}catch{}
 return 'Command exited with code '+result.exitCode;
}
export const toolDefinitions = [
  {type:'function', function:{name:'shell', description:'Run a native program as the signed-in user. Read files, inspect the computer, or use installed programs. Arguments are an array. For PowerShell use powershell.exe -NoProfile -NonInteractive -Command. Explain the immediate action in summary. Commands follow the user review setting. Browser reading is available with program tom-browser and args --browser edge --url https://example.com --action read. Use only for the requested research.', parameters:{type:'object',additionalProperties:false,required:['summary','program','args'],properties:{summary:{type:'string'},program:{type:'string'},args:{type:'array',items:{type:'string'}},timeoutSeconds:{type:'integer',minimum:1,maximum:120}}}}},
  {"type":"function","function":{"name":"write","description":"Save a UTF-8 file. Supply summary, path and expectedHash, and either content or copyFrom with sourceHash and exact replacements. new is create-only; existing destinations require their observed SHA256. Edits are snapshotted and verified.","parameters":{"type":"object","additionalProperties":false,"required":["summary","path","expectedHash"],"oneOf":[{"required":["content"]},{"required":["copyFrom","sourceHash","replacements"]}],"properties":{"summary":{"type":"string"},"path":{"type":"string"},"expectedHash":{"type":"string","pattern":"^(new|[a-f0-9]{64})$"},"content":{"type":"string"},"copyFrom":{"type":"string"},"sourceHash":{"type":"string","pattern":"^[a-f0-9]{64}$"},"replacements":{"type":"array","minItems":1,"maxItems":16,"items":{"type":"object","additionalProperties":false,"required":["find","replace"],"properties":{"find":{"type":"string","minLength":1},"replace":{"type":"string"}}}}}}}}
];

export function validateTool(call,preferences={}) {
  if (!call || !['shell','write'].includes(call.name)) throw new Error('Tom requested an unknown tool. No action was taken.');
  const a = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Invalid action arguments.');
  const keys = call.name === 'shell' ? ['summary','program','args','timeoutSeconds'] : ['summary','path','content','expectedHash','copyFrom','sourceHash','replacements'];
  if (Object.keys(a).some(k=>!keys.includes(k))) throw new Error('Unexpected action field.');
  let normalization;
  const inferredSummary=a.summary==null||a.summary==='';
  if(inferredSummary)a.summary=call.name==='write'?'Save '+String(a.path??'file').slice(0,180):a.program==='tom-recall'?'Read saved task evidence':a.program==='cat'?'Read '+String(a.args?.[0]??'file').slice(0,180):'Run '+String(a.program??'program').slice(0,180);
  if (typeof a.summary !== 'string' || !a.summary.trim() || a.summary.length > 500) throw new Error('The action needs a short explanation.');
  if (call.name === 'shell') {
    if (typeof a.program !== 'string' || !a.program || a.program.length > 4096 || !Array.isArray(a.args) || a.args.length>100 || a.args.some(x=>typeof x!=='string'||x.length>16000)) throw new Error('Invalid program or arguments.');
    if (a.timeoutSeconds !== undefined && (!Number.isInteger(a.timeoutSeconds)||a.timeoutSeconds<1||a.timeoutSeconds>120)) throw new Error('Invalid command timeout.');
    if(a.program==='tom-browser'){
      // A tiny model can name a query or page directly. Expand only this explicit
      // browser adapter shorthand; native program arguments are never rewritten.
      if(a.args.length===1&&a.args[0].trim()&&!a.args[0].startsWith('--')){
        const original=[...a.args],subject=a.args[0];
        a.args=/^https?:\/\//i.test(subject)?['--action','read','--url',subject,'--browser',preferences.browser??'edge']:['--action','search','--query',subject,'--provider',preferences.search??'google','--browser',preferences.browser??'edge'];
        normalization={requested:original,expanded:a.args,reason:'Browser query/URL shorthand'};
      }
      const allowed=['--action','--query','--provider','--browser','--url','--file','--output','--allow-unverified'],options={};
      if(a.args.length%2||a.args.some((v,i)=>i%2===0&&!allowed.includes(v)))throw new Error('Invalid browser arguments. Use program tom-browser with args ["--action","search","--query","your keywords","--provider","google","--browser","edge"] for search, or ["--action","read","--url","https://actual-page-url"] for reading. No browser ran.');
      for(let i=0;i<a.args.length;i+=2){if(options[a.args[i]]!==undefined)throw new Error('Duplicate browser option: '+a.args[i]);options[a.args[i]]=a.args[i+1];}
      const mode=options['--action'];if(!['search','read','inspect','screenshot'].includes(mode))throw new Error('Browser args need --action followed by search, read, inspect, or screenshot. No browser ran.');
      if(mode==='search'?!options['--query']?.trim():!options['--url']&&!options['--file'])throw new Error(mode==='search'?'Search needs --query followed by the query as ONE string argument.':'Reading needs --url followed by a page URL, or --file followed by an HTML file path.');
    }
    if(/(?:^|[\\/])(?:powershell|pwsh)(?:\.exe)?$/i.test(a.program)){
      // Models often provide a complete cmdlet string as one argument. Make
      // that command mode explicit; retain the exact command for review.
      if(a.args.length===1&&/^\s*[A-Za-z]+-[A-Za-z][A-Za-z0-9]*\b/.test(a.args[0]))a.args=['-NoProfile','-NonInteractive','-Command',a.args[0]];
      const index=a.args.findIndex(x=>/^-(?:command|c|file|f|encodedcommand)$/i.test(x));
      if(index<0)throw new Error('PowerShell needs an explicit -Command followed by the full command string, or -File followed by a script path. A bare path does not read a file. No command ran.');
      if(index>=0&&(index===a.args.length-1||!a.args[index+1].trim()))throw new Error('The PowerShell action is missing its command or file. Put the complete command string in args immediately after -Command. No command ran.');
    }
  } else {
    if(typeof a.path!=='string'||!a.path||a.path.length>4096)throw new Error('Missing or invalid path. Retry the COMPLETE write action with path, content, summary and expectedHash. No file changed.');
    if(a.copyFrom!==undefined){
      if(a.content!==undefined||typeof a.copyFrom!=='string'||!a.copyFrom||typeof a.sourceHash!=='string'||!/^[a-f0-9]{64}$/i.test(a.sourceHash)||!Array.isArray(a.replacements)||!a.replacements.length||a.replacements.length>16||a.replacements.some(r=>!r||Object.keys(r).sort().join(',')!=='find,replace'||typeof r.find!=='string'||!r.find||typeof r.replace!=='string'||r.find.length+r.replace.length>262144))throw new Error('An exact edit needs copyFrom, its observed sourceHash, and replacements containing find and replace strings. Do not also supply content.');
    }else if(a.sourceHash!==undefined||a.replacements!==undefined||typeof a.content!=='string'||Buffer.byteLength(a.content)>262144)throw new Error('Missing or invalid content. Retry the COMPLETE write action with the full UTF-8 content string, path, summary and expectedHash. No file changed.');
    a.expectedHash??='new';
    if(a.expectedHash==='')a.expectedHash='new'; // Empty optional metadata remains strictly create-only.
    if(typeof a.expectedHash!=='string'||!/^(new|[a-f0-9]{64})$/i.test(a.expectedHash))throw new Error('Invalid expectedHash. Use the literal string new for a NEW destination or its actual SHA256 for an EXISTING destination. Placeholder strings are invalid. Retry the complete write action with path, content, summary and expectedHash. No file changed.');
  }
  return {name:call.name, arguments:a,summarySource:inferredSummary?'harness':'model',...(normalization?{normalization}:{})};
}

// Parse native PowerShell syntax without executing the requested command. A tiny
// model can repair missing quotes before a command reaches the review screen.
export async function preflightTool(action,signal,cwd=process.cwd()){
 const a=action.arguments;
 if(action.name==='shell'&&a.program==='cat'&&a.args.length===1&&/^cat\s+/i.test(a.args[0])){const original=a.args[0],candidate=original.replace(/^cat\s+/i,'').replace(/^(['"])(.*)\1$/,'$2');const exists=async p=>lstat(path.resolve(cwd,p)).then(s=>s.isFile()).catch(()=>false);if(!await exists(original)&&await exists(candidate))a.args=[candidate];}
 if(process.platform!=='win32'||action.name!=='shell'||!/(?:^|[\\/])(?:powershell|pwsh)(?:\.exe)?$/i.test(a.program))return;
 const index=a.args.findIndex(x=>/^-(?:command|c)$/i.test(x));if(index<0)return;
 const encoded=Buffer.from(a.args.slice(index+1).join(' ')).toString('base64');
 const script="$text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+encoded+"'));$tokens=$null;$issues=$null;[void][System.Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$issues);if($issues.Count){$issues|ForEach-Object {$_.Message};exit 1}";
 const result=await shellTool({program:path.join(process.env.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),args:['-NoProfile','-NonInteractive','-Command',script],timeoutSeconds:8},process.cwd(),signal);
 signal?.throwIfAborted();if(result.exitCode!==0)throw new ToolPreconditionError('PowerShell syntax check failed. No requested command ran. Correct its quoting or syntax: '+result.output.slice(0,700));
}

export async function writeTool(a, cwd, snapshots, signal) {
  const target = path.resolve(cwd, a.path);
  if(a.copyFrom!==undefined){
    const source=path.resolve(cwd,a.copyFrom),s=await lstat(source).catch(e=>{throw new ToolPreconditionError('The edit source cannot be inspected: '+e.message);});
    if(!s.isFile()||s.isSymbolicLink()||s.size>262144)throw new ToolPreconditionError('The edit source must be a regular UTF-8 file of at most 256 KiB.');
    const bytes=await readFile(source).catch(e=>{throw new ToolPreconditionError('The edit source cannot be read: '+e.message);});if(hash(bytes)!==a.sourceHash.toLowerCase())throw new ToolPreconditionError('The source changed. Read its current bytes and hash before editing. No destination changed.');
    let content=bytes.toString('utf8');if(!Buffer.from(content).equals(bytes))throw new ToolPreconditionError('The source is not valid UTF-8.');
    for(const r of a.replacements){const at=content.indexOf(r.find);if(at<0||content.indexOf(r.find,at+r.find.length)>=0)throw new ToolPreconditionError('Each find string must match exactly once. No destination changed.');content=content.slice(0,at)+r.replace+content.slice(at+r.find.length);}
    if(Buffer.byteLength(content)>262144)throw new ToolPreconditionError('The edited file exceeds 256 KiB.');
    return {...await writeTool({path:a.path,summary:a.summary,expectedHash:a.expectedHash,content},cwd,snapshots,signal),copiedFrom:source,sourceHash:a.sourceHash,replacements:a.replacements.length};
  }
  if (process.platform === 'win32' && (target.startsWith('\\\\') || /(^|[\\/])(con|prn|aux|nul|com[1-9]|lpt[1-9])([.\\/]|$)/i.test(target) || target.slice(2).includes(':'))) throw new ToolPreconditionError('This is a device or stream path, not a normal file.');
  let before = null;
  try { const stat = await lstat(target); if(!stat.isFile() || stat.isSymbolicLink()) throw new ToolPreconditionError('Target must be a regular file.'); before = await readFile(target); } catch(e) { if(e.code!=='ENOENT') throw e; }
  if ((before === null ? 'new' : hash(before)) !== a.expectedHash.toLowerCase()) throw new ToolPreconditionError(before===null?'The file does not exist. Nothing was written. To create it, use expectedHash with the literal value new, not the hash of an empty file.':'The file changed or already exists. Nothing was written. Read the current file and its SHA256 before editing.');
  await mkdir(snapshots, {recursive:true});
  const snapshot = before === null ? null : path.join(snapshots, randomUUID()+'.before');
  if(snapshot) await writeFile(snapshot, before, {flag:'wx'});
  signal?.throwIfAborted();
  // Recheck after snapshot I/O, immediately before the synchronous-to-filesystem commit.
  const latest = await readFile(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if ((latest===null?'new':hash(latest)) !== a.expectedHash.toLowerCase()) throw new ToolPreconditionError('A concurrent edit was detected. Nothing was written.');
  await mkdir(path.dirname(target), {recursive:true});
  const temp = target+'.tom-'+randomUUID()+'.partial';
  try { await writeFile(temp, a.content, {flag:'wx',encoding:'utf8'}); signal?.throwIfAborted(); if(before===null){try{await link(temp,target);}catch(e){if(!['EPERM','ENOTSUP','ENOSYS'].includes(e.code))throw e;await copyFile(temp,target,constants.COPYFILE_EXCL);}}else {
    for(let attempt=0;;attempt++){
      signal?.throwIfAborted();
      if(hash(await readFile(target))!==a.expectedHash.toLowerCase())throw new ToolPreconditionError('A concurrent edit was detected before commit. Nothing was written.');
      try{await rename(temp,target);break;}catch(e){if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt>=5)throw e;await delay(25*2**attempt,undefined,{signal});}
    }
  } }
  finally { await unlink(temp).catch(()=>{}); }
  const result = await readFile(target);
  if(hash(result)!==hash(a.content)) throw new Error('The file was written but verification failed. Inspect before continuing.');
  return {path:target, bytes:result.length, characters:Array.from(a.content).length, sha256:hash(result), snapshot, verified:true};
}

export function shellTool(a, cwd, signal, onOutput = ()=>{},taskId=null) {
  return new Promise((resolve,reject)=>{
    signal?.throwIfAborted();
    const helper=['tom-browser','tom-recall','cat'].includes(a.program);
    const child=spawn(helper?process.execPath:a.program,helper?[path.join(path.dirname(fileURLToPath(import.meta.url)),a.program==='tom-browser'?'browser.mjs':a.program==='cat'?'portable-read.mjs':'recall.mjs'),...a.args]:a.args,{cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env:{...process.env,...(taskId?{TOM_TASK_ID:taskId}:{})}});
    let output='', total=0, timedOut=false, settled=false;
    const terminate=()=>{
      if(!child.pid || child.exitCode!==null) return;
      if(process.platform==='win32') { const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}); killer.on('error',()=>child.kill());killer.on('close',code=>{if(code!==0)child.kill();}); }
      else child.kill('SIGKILL');
    };
    const timer=setTimeout(()=>{timedOut=true;terminate();},(a.timeoutSeconds??(a.program==='tom-browser'?80:45))*1000);
    const abort=()=>terminate(); signal?.addEventListener('abort',abort,{once:true});
    const receive=data=>{ const s=data.toString('utf8');if(!s)return; total+=Buffer.byteLength(s); if(output.length<16000) { const part=s.slice(0,16000-output.length); output+=part;onOutput(part); } if(total>4*1024*1024)terminate(); };
    const stdoutDecoder=new StringDecoder('utf8'),stderrDecoder=new StringDecoder('utf8');
    child.stdout.on('data',b=>receive(stdoutDecoder.write(b)));child.stderr.on('data',b=>receive(stderrDecoder.write(b)));
    child.stdout.on('end',()=>receive(stdoutDecoder.end()));child.stderr.on('end',()=>receive(stderrDecoder.end()));
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    child.on('error',e=>{if(settled)return;settled=true;cleanup();reject(['ENOENT','EACCES','ENOEXEC'].includes(e.code)?new ToolPreconditionError('The program could not start; no command ran. '+e.message+'. Use powershell.exe for Windows commands or cat for a literal file read.'):e);});
    child.on('close',code=>{if(settled)return;settled=true;cleanup();resolve({exitCode:code,output,outputTruncated:total>16000,cancelled:!!signal?.aborted,timedOut,...(a.program==='cat'&&a.args.length===1&&code===0&&total<=16000?{readFiles:[{path:path.resolve(cwd,a.args[0]),sha256:hash(output),note:'SHA256 of the complete UTF-8 bytes returned by this read.'}]}:{})});});
  });
}
