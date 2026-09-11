// Reproducible development validation. Hidden checks are never supplied to Tom.
import fs from 'node:fs/promises';
import {unlinkSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {Runtime} from '../src/runtime.mjs';
import {Store} from '../src/store.mjs';
import {Engine} from '../src/engine.mjs';
import {Toolbox} from '../src/harness/tools.mjs';
import {taskState} from '../src/harness/state.mjs';
import {cases} from './capability-cases.mjs';
import {evaluate} from './capability-score-v2.mjs';
import {hash} from '../src/tools.mjs';
const root=path.resolve(import.meta.dirname,'..'),argv=process.argv.slice(2),arg=(k,d)=>argv.includes(k)?argv[argv.indexOf(k)+1]:d;
const brokenGame=await fs.readFile(path.join(root,'scripts/fixtures/branching-game-incomplete.html'),'utf8');
const extra=[
 {id:'hardware',request:'What hardware are you running on tom?',files:{},check:'hardware'},
 {id:'game-followup',request:'can you make it a local file in your folder',previous:['make a local browser based minigame from html css3 and JS, surprise me with game content','make a mini test game . dnd y or no decisions that lead to victory or death'],files:{},output:'index.html',check:'game'},
 {id:'game-repair',request:'Read source.html. Create index.html as a compact, complete replacement for this local branching adventure game. The first click currently removes every choice, and later destinations are not dispatched. Use a small scene table and one render function for all choices. The player must be able to reach both VICTORY and DEATH endings, clearly labeled on the page. Keep the HTML, CSS and JavaScript in this one file. Verify it in the browser.',files:{'source.html':brokenGame},output:'index.html',check:'game',assistance:'Reviewer supplied observed defects and a scene-table/render-function suggestion. Assisted repair, not a blind autonomous first attempt.'},
 {id:'group-events',request:'Read events.json. Create result.json with totals by category for events with enabled=true. Sum each event\'s count, including negative counts. Output only an object mapping category to its total.',files:{'events.json':'[{"category":"blue","count":6,"enabled":true},{"category":"red","count":10,"enabled":false},{"category":"blue","count":-2,"enabled":true},{"category":"green","count":0,"enabled":true}]'},output:'result.json',expected:{blue:4,green:0}},
 {id:'clamp-value',request:'Read source.cjs. Create solution.cjs exporting one function with module.exports. Clamp a finite number x to inclusive bounds low and high. If low is greater than high, swap the bounds. Do not mutate any input.',files:{'source.cjs':'module.exports = (x, low, high) => x;\n'},output:'solution.cjs',checks:[{input:[5,0,3],expected:3},{input:[-3,0,7],expected:0},{input:[3,7,0],expected:3},{input:[-5,-2,-9],expected:-5},{input:[8,2,2],expected:2}]}
];
const selected=arg('--cases','hardware,game-followup,sum-money,join-stock').split(',').map(id=>[...cases,...extra].find(c=>c.id===id));if(selected.some(c=>!c))throw Error('Unknown case');
// One local inference trial at a time, including independently launched pilots.
const lockPath=path.join(root,'.state/harness-repair.lock');let lock;
try{lock=await fs.open(lockPath,'wx');}catch(e){if(e.code!=='EEXIST')throw e;throw Error('Another repair trial owns '+lockPath+'. Wait for it to finish.');}
await lock.writeFile(JSON.stringify({pid:process.pid,started:new Date().toISOString()}));await lock.close();
process.on('exit',()=>{try{unlinkSync(lockPath);}catch{}});
try{const session=JSON.parse(await fs.readFile(path.join(root,'.state/session.json'))),u=new URL(session.url);const s=await(await fetch(u.origin+'/api/state',{headers:{'X-Tom-Key':new URLSearchParams(u.hash.slice(1)).get('key')},signal:AbortSignal.timeout(1500)})).json();if(s.active||s.qualification?.running||s.runtime?.loaded)throw Error('APP_BUSY');}catch(e){if(e.message==='APP_BUSY')throw e;}
const config={...JSON.parse(await fs.readFile(path.resolve(root,arg('--config','config/runtime.json')))),threads:Number(arg('--threads','2')),seed:Number(arg('--seed','42'))};
const out=path.join(root,'.state','harness-repair',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(out,{recursive:true});config.logPath=path.relative(root,path.join(out,'runtime.log'));
const sources=[];async function snapshot(dir){for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await snapshot(p);else{const content=await fs.readFile(path.join(root,p));sources.push({path:p,sha256:hash(content)});await fs.mkdir(path.dirname(path.join(out,'source',p)),{recursive:true});await fs.writeFile(path.join(out,'source',p),content);}}}await snapshot('src');
for(const file of ['harness-repair-live.mjs','capability-cases.mjs','capability-score-v2.mjs','check-game-flow.mjs']){await fs.mkdir(path.join(out,'source/scripts'),{recursive:true});await fs.copyFile(path.join(root,'scripts',file),path.join(out,'source/scripts',file));}
await fs.mkdir(path.join(out,'source/scripts/fixtures'),{recursive:true});await fs.copyFile(path.join(root,'scripts/fixtures/branching-game-incomplete.html'),path.join(out,'source/scripts/fixtures/branching-game-incomplete.html'));
const protocol={purpose:'Harness repair development trials; visible original tasks plus separately specified transfer cases. Not a blind peer benchmark.',config,sources,scriptSha256:hash(await fs.readFile(import.meta.filename)),scorerSha256:hash(await fs.readFile(path.join(root,'scripts/capability-score-v2.mjs'))),gameScorerSha256:hash(await fs.readFile(path.join(root,'scripts/check-game-flow.mjs'))),cases:selected.map(({id,request,previous,files,assistance})=>({id,request,previous,files,assistance})),hardware:{cpu:os.cpus()[0].model,ram:os.totalmem(),os:os.release()},started:new Date().toISOString()};
await fs.writeFile(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));
const store=new Store(path.join(out,'journal.sqlite'));store.saveSettings({commands:'review',budget:{maxSteps:24,maxTokens:12288,maxActiveMs:600000,maxResponseTokens:2048}});
const runtime=new Runtime(root,config),results=[];let current,minFree=os.freemem(),stopping=false;const monitor=setInterval(async()=>{minFree=Math.min(minFree,os.freemem());if(!stopping&&await fs.stat(path.join(root,'.state/harness-repair-stop')).catch(()=>null)){stopping=true;if(engine.active)engine.cancel(engine.active.id,'pause');}},1000);
const prepare=Toolbox.prototype.prepare;Toolbox.prototype.prepare=async function(name,a,signal){
  if(['read','find','write','edit','implement','check','transform','test','compose','repair'].includes(name)){const p=path.resolve(this.cwd,a.path);if(p!==this.cwd&&!p.startsWith(this.cwd+path.sep))throw Error('TRIAL_SCOPE: this trial folder only.');}
  if(name==='search'||name==='browse'&&a.url&&!a.url.startsWith('file:')&&!path.isAbsolute(a.url))throw Error('TRIAL_SCOPE: no external web access.');
  return prepare.call(this,name,a,signal);
};
const engine=new Engine(store,runtime,root,e=>{
  if(['model','tool-error','check','complete','blocked','error','budget'].includes(e.kind))console.log(current?.id,e.kind,e.text.slice(0,180));
  if(e.kind==='review'){const a=e.detail.action.body,script=a.arguments.args?.[1]??'',imports=[...script.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]);const safeAssertion=a.operation==='run'&&a.arguments.program===process.execPath&&a.arguments.args[0]==='-e'&&!/\b(?:process|global|eval|Function|import|constructor|__proto__)\b/.test(script)&&imports.every(m=>['assert','node:assert','assert/strict','node:assert/strict','./solution.cjs','./source.cjs'].includes(m));const allowed=['test','transform'].includes(a.operation)||a.operation==='browse'||safeAssertion;console.log('REVIEW',a.operation,allowed);queueMicrotask(()=>engine.decide(e.detail.action.id,allowed));}
});
async function checkGame(file){
  const child=spawn(process.execPath,[path.join(root,'scripts/check-game-flow.mjs'),file],{cwd:root,windowsHide:true,stdio:'ignore'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error('The independent game checker failed to run.');
  const result=JSON.parse(await fs.readFile(path.join(path.dirname(file),'functional-check.json'),'utf8'));
  if(result.sha256!==hash(await fs.readFile(file)))throw Error('The game changed while it was being graded.');return result;
}
console.log('RUN',out);
try{
  for(const c of selected){if(stopping)break;current=c;const dir=path.join(out,c.id);await fs.mkdir(dir);for(const [file,text]of Object.entries(c.files))await fs.writeFile(path.join(dir,file),text);
    const task=store.create(c.id,dir);for(const text of c.previous??[]){store.message(task.id,{role:'user',content:text});store.saveWork(task.id,await taskState(store,task.id,dir));}store.message(task.id,{role:'user',content:c.request});const began=Date.now();await engine.run(task.id);
    const content=c.output?await fs.readFile(path.join(dir,c.output),'utf8').catch(()=>''):store.messages(task.id).findLast(m=>m.role==='assistant'&&m.content)?.content??'';
    let outcome;if(c.check==='hardware')outcome={passed:/Xeon|E3-1245/i.test(content)&&!/Google.s infrastructure|virtual machine|cloud infrastructure/i.test(content),scope:'Mentions the actual CPU family and does not claim cloud hosting'};else if(c.check==='game')outcome=content?await checkGame(path.join(dir,c.output)):{passed:false,error:'No HTML file saved'};else outcome=evaluate(c,content);
    const fixturesUnchanged=(await Promise.all(Object.entries(c.files).map(async([file,text])=>await fs.readFile(path.join(dir,file),'utf8')===text))).every(Boolean);
    const row={case:c.id,status:store.task(task.id).status,outcome,fixturesUnchanged,completedPassed:outcome.passed&&fixturesUnchanged&&store.task(task.id).status==='complete',content,elapsedMs:Date.now()-began,budget:store.budget(task.id),work:store.work(task.id),events:store.events(task.id),actions:store.actions(task.id)};results.push(row);await fs.writeFile(path.join(out,'results.json'),JSON.stringify({protocol,results},null,2));console.log('RESULT',c.id,row.status,outcome.passed?'PASS':'FAIL',Math.round(row.elapsedMs/1000)+'s');
  }
}finally{clearInterval(monitor);await runtime.stop();store.close();const sourcesUnchanged=(await Promise.all(sources.map(async s=>hash(await fs.readFile(path.join(root,s.path)))===s.sha256))).every(Boolean);await fs.writeFile(path.join(out,'results.json'),JSON.stringify({protocol,results,finished:new Date().toISOString(),sourcesUnchanged,minimumSystemFreeBytes:minFree,interrupted:stopping},null,2));console.log('FINISHED',out);if(stopping)process.exitCode=3;}
