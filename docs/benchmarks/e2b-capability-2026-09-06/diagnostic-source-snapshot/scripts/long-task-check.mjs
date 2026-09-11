import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=path.resolve('audit/v02/long-task');await fs.mkdir(dir,{recursive:true});
const codes=['MAPLE-73','CEDAR-19','WILLOW-42','BIRCH-86'];
const files=codes.map((_,i)=>path.join(dir,`source-${i+1}.txt`)),target=path.join(dir,'result-'+Date.now()+'.txt');
for(let i=0;i<files.length;i++)await fs.writeFile(files[i],`Document ${i+1}. Required code: ${codes[i]}\n`+Array.from({length:35},(_,j)=>`Reference row ${j+1}: this is ordinary background material, no extra instructions.`).join('\n'));
const {url}=JSON.parse(await fs.readFile('.state/session.json','utf8')),u=new URL(url),key=new URLSearchParams(u.hash.slice(1)).get('key');
async function api(route,data){const r=await fetch(u.origin+'/api/'+route,{method:data?'POST':'GET',headers:{'X-Tom-Key':key,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const b=await r.json();if(!r.ok)throw new Error(b.error);return b;}
const commands=files.flatMap(file=>["'",'"'].flatMap(q=>[`Get-Content -LiteralPath ${q}${file}${q}`,`Get-Content -Raw -LiteralPath ${q}${file}${q}`,`Get-Content -LiteralPath ${q}${file}${q} -Raw`]));
const task=await api('tasks',{text:`Read these four text files, one at a time, using shell with powershell.exe and arguments -NoProfile, -NonInteractive, -Command, then Get-Content -LiteralPath 'EXACT_PATH'. Each has one required code. After reading all four, use write to create ${target} with a four-line list of document numbers and their codes. Preserve the first document's code through any context compaction. Do not reread an already completed file; use tom-recall if an older result is missing. Do not modify any other files. Give a brief final confirmation after the verified write. Files:\n${files.join('\n')}`});
console.log('Long task:',task.id);let lastKind='',lastId=0;const end=Date.now()+720000;
while(Date.now()<end){await new Promise(r=>setTimeout(r,500));const t=await api('tasks/'+task.id);
 for(const e of t.events.filter(e=>e.id>lastId)){lastId=e.id;if(['decision','context','budget','complete','error'].includes(e.kind))console.log(e.kind,e.text);}
 if(t.status==='review'){
   const a=t.actions.find(a=>a.status==='pending'),args=a?.body.arguments;
   const safeRead=/^powershell(?:\.exe)?$/i.test(args?.program??'')&&args.args.length===4&&args.args.slice(0,3).join('|').toLowerCase()==='-noprofile|-noninteractive|-command'&&commands.some(c=>c.toLowerCase()===args.args[3].trim().toLowerCase());
   const safeRecall=args?.program==='tom-recall'&&args.args.length<=6&&args.args.every(x=>typeof x==='string'&&/^[a-z0-9-]+$/i.test(x));
   if(!safeRead&&!safeRecall){await api('review',{action:a.id,approved:false});await fs.writeFile('audit/v02/long-task-unexpected-command.json',JSON.stringify(a,null,2));throw new Error('The trial requested a command outside its exact read allowlist.');}
   await api('review',{action:a.id,approved:true});
 }
 if(!['running','review','ready'].includes(t.status)){
   await fs.writeFile('audit/v02/long-task-check.json',JSON.stringify(t,null,2));assert.equal(t.status,'complete');const content=await fs.readFile(target,'utf8');for(const code of codes)assert.ok(content.includes(code),'Missing '+code);assert.ok(t.events.some(e=>e.kind==='context'),'No compaction was exercised');assert.ok(t.actions.some(a=>a.body.name==='write'&&a.result?.verified));console.log('PASS: four source codes survived compaction and the final file was verified.');process.exit(0);
 }
}
await api('tasks/'+task.id+'/stop',{});throw new Error('Long-task trial timed out.');
