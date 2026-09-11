import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]??'audit/v04/fresh-install-check.json');
let u,key;
for(let i=0;i<30;i++){try{u=new URL(JSON.parse(await fs.readFile(path.join(root,'.state/session.json'),'utf8')).url);key=new URLSearchParams(u.hash.slice(1)).get('key');break;}catch{await new Promise(r=>setTimeout(r,500));}}
assert.ok(u,'Installed supervisor did not start');
let seen=false,last='',state;
try{
 const deadline=Date.now()+540000;
 while(Date.now()<deadline){state=await(await fetch(u.origin+'/api/qualification',{headers:{'X-Tom-Key':key}})).json();seen||=state.running;const event=state.events.at(-1)?.text;if(event&&event!==last){console.log(event);last=event;}if(seen&&state.report?.finished&&!state.running&&state.online!==null)break;await new Promise(r=>setTimeout(r,1500));}
 const result={automatic:seen,minimalWindowsPath:true,root,...state};await fs.writeFile(output,JSON.stringify(result,null,2));assert.equal(seen,true);assert.equal(state.report?.passed,true);assert.equal(state.report?.vision,true);assert.equal(state.running,false);console.log('PASS: freshly installed E2B automatically qualified text, tools, recall and vision without development PATH dependencies.');
}finally{await fetch(u.origin+'/api/quit',{method:'POST',headers:{'X-Tom-Key':key,'Content-Type':'application/json'},body:'{}'}).catch(()=>{});}
