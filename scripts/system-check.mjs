import fs from 'node:fs/promises';
const {url}=JSON.parse(await fs.readFile('.state/session.json','utf8')),u=new URL(url),key=new URLSearchParams(u.hash.slice(1)).get('key');
const action=process.argv[2]??'status';
if(action!=='status'){const r=await fetch(u.origin+'/api/qualification',{method:'POST',headers:{'X-Tom-Key':key,'Content-Type':'application/json'},body:JSON.stringify({action})});if(!r.ok)throw new Error(await r.text());}
let seen=0;for(let i=0;i<600;i++){const s=await(await fetch(u.origin+'/api/qualification',{headers:{'X-Tom-Key':key}})).json();for(const e of s.events.slice(seen))console.log(e.text);seen=s.events.length;if(!s.running){console.log(JSON.stringify({report:s.report,offers:s.offers.map(o=>({name:o.name,eligible:o.eligible,reason:o.reason})),online:s.online},null,2));break;}await new Promise(r=>setTimeout(r,1000));}
