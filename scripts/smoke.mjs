import fs from 'node:fs/promises';
const session=JSON.parse(await fs.readFile('.state/session.json','utf8'));
const u=new URL(session.url),key=new URLSearchParams(u.hash.slice(1)).get('key');
const base=u.origin;
async function api(p,b){const r=await fetch(base+'/api/'+p,{headers:{'X-Tom-Key':key,'Content-Type':'application/json'},method:b?'POST':'GET',body:b?JSON.stringify(b):undefined});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j));return j;}
const vision=process.argv[2]==='--vision';
const prompt=(vision?process.argv.slice(3):process.argv.slice(2)).join(' ')||'In one short sentence, introduce yourself as Tom. Do not use any tools.';
const images=vision?['data:image/png;base64,'+(await fs.readFile('audit/vision-fixture.png')).toString('base64')]:undefined;
const start=Date.now();const t=await api('tasks',{text:prompt,images});console.log('Task:',t.id);let last=0;
for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,500));const s=await api('tasks/'+t.id);for(const e of s.events.filter(e=>e.id>last)){last=e.id;if(e.kind!=='delta')console.log(e.kind,e.text);else process.stdout.write(e.text);}if(!['running','ready','review'].includes(s.status)){console.log('\nStatus:',s.status,'Elapsed:',Date.now()-start);await fs.writeFile('audit/smoke-'+t.id+'.json',JSON.stringify({...s,elapsedMs:Date.now()-start},null,2));process.exitCode=s.status==='complete'?0:1;break;}if(s.status==='review'){console.log('Review required; stopping smoke test.');await api(`tasks/${t.id}/stop`,{});process.exitCode=2;break;}}
