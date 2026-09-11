// Development validation, not a new peer benchmark. Hidden outcome checks remain separate.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Runtime} from '../src/runtime.mjs';
import {Store} from '../src/store.mjs';
import {Engine} from '../src/engine.mjs';
import {Toolbox} from '../src/harness/tools.mjs';
import {cases} from './capability-cases.mjs';
import {evaluate} from './capability-score-v2.mjs';
import {hash} from '../src/tools.mjs';
const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const names=arg('--cases','hello,sum-money,join-stock,exact-copy').split(','),seed=Number(arg('--seed','42'));
const available=[{id:'hello',request:'Hi',files:{}},...cases],selected=names.map(name=>available.find(c=>c.id===name));if(selected.some(c=>!c))throw Error('Unknown case');
const out=path.join(root,'.state','harness-live',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(out,{recursive:true});
try{const session=JSON.parse(await fs.readFile(path.join(root,'.state/session.json'))),url=new URL(session.url);const s=await(await fetch(url.origin+'/api/state',{headers:{'X-Tom-Key':new URLSearchParams(url.hash.slice(1)).get('key')},signal:AbortSignal.timeout(1500)})).json();if(s.active||s.qualification?.running||s.runtime?.loaded)throw Error('APP_BUSY');}catch(e){if(e.message==='APP_BUSY')throw e;}
const sources=[];async function snapshot(dir){for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await snapshot(p);else{const bytes=await fs.readFile(path.join(root,p));sources.push({path:p,sha256:hash(bytes)});const dest=path.join(out,'source',p);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);}}}await snapshot('src');
const config={...JSON.parse(await fs.readFile(path.resolve(root,arg('--config','config/runtime.json')))),threads:Number(arg('--threads','2')),seed,logPath:path.relative(root,path.join(out,'runtime.log'))};
const report={purpose:'Development validation of harness v2. Native self-tests are allowed, unlike the frozen original comparison. Not a budget/environment-matched uplift claim.',seed,config,hardware:{cpu:os.cpus()[0].model,ram:os.totalmem(),platform:process.platform},sources,results:[]};
await fs.writeFile(path.join(out,'protocol.json'),JSON.stringify({...report,cases:selected.map(c=>({id:c.id,request:c.request}))},null,2));
const store=new Store(path.join(out,'journal.sqlite'));store.saveSettings({commands:'review',budget:{maxSteps:24,maxTokens:12288,maxActiveMs:600000,maxResponseTokens:2048}});
const runtime=new Runtime(root,config);let current;
const originalPrepare=Toolbox.prototype.prepare;
Toolbox.prototype.prepare=async function(name,a,signal){
  if(['read','find','write','edit','implement','check','transform','test'].includes(name)){const file=path.resolve(this.cwd,a.path);if(!file.startsWith(this.cwd+path.sep)&&file!==this.cwd)throw Error('VALIDATION_SCOPE: only this trial folder is accessible.');}
  if(name==='search'||name==='browse')throw Error('VALIDATION_SCOPE: local file trials only.');
  return originalPrepare.call(this,name,a,signal);
};
const engine=new Engine(store,runtime,root,e=>{
  if(['model','tool-error','complete','blocked','error','budget'].includes(e.kind))console.log(current?.id,e.kind,e.text.slice(0,200));
  if(e.kind==='review'){
    const a=e.detail.action.body.arguments;
    // Trial command review: Node expressions with assertions and local CommonJS imports.
    // No shell, process APIs, filesystem/network modules, dynamic code or package installs.
    const script=a.args?.[1]??'',imports=[...script.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]);
    const allowed=['test','transform'].includes(e.detail.action.body.operation)||a.program===process.execPath&&a.args[0]==='-e'&&!/\b(?:process|global|eval|Function|import|constructor|__proto__)\b/.test(script)&&imports.every(m=>['assert','node:assert','assert/strict','node:assert/strict','./solution.cjs','./source.cjs'].includes(m));
    console.log(current.id,'REVIEW',JSON.stringify(a),allowed?'ALLOW':'DENY');queueMicrotask(()=>engine.decide(e.detail.action.id,allowed));
  }
});
console.log('RUN',out);
try{
  for(const c of selected){
    current=c;const dir=path.join(out,c.id);await fs.mkdir(dir);for(const [name,text]of Object.entries(c.files))await fs.writeFile(path.join(dir,name),text);
    const task=store.create(c.request,dir);store.message(task.id,{role:'user',content:c.request});const started=Date.now();await engine.run(task.id);
    const content=c.output?await fs.readFile(path.join(dir,c.output),'utf8').catch(()=>''):store.messages(task.id).findLast(m=>m.role==='assistant'&&m.content)?.content??'';
    const outcome=c.output?evaluate(c,content):{passed:!!content&&!/\b(?:error|cannot)\b/i.test(content)};
    const unchanged=(await Promise.all(Object.entries(c.files).map(async([f,text])=>await fs.readFile(path.join(dir,f),'utf8')===text))).every(Boolean);
    const row={case:c.id,status:store.task(task.id).status,outcome,fixturesUnchanged:unchanged,completedPassed:outcome.passed&&unchanged&&store.task(task.id).status==='complete',elapsedMs:Date.now()-started,content,work:store.work(task.id),budget:store.budget(task.id),events:store.events(task.id),actions:store.actions(task.id)};
    report.results.push(row);await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log('RESULT',c.id,row.status,outcome.passed&&unchanged?'PASS':'FAIL',Math.round(row.elapsedMs/1000)+'s');
  }
}finally{await runtime.stop();store.close();report.finished=new Date().toISOString();report.sourcesUnchanged=(await Promise.all(sources.map(async s=>hash(await fs.readFile(path.join(root,s.path)))===s.sha256))).every(Boolean);await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log('FINISHED',out);}
