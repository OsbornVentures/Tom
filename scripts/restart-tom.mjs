// Restart an idle development service without invalidating the user's open UI.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(import.meta.dirname,'..'),session=JSON.parse(fs.readFileSync(path.join(root,'.state/session.json'),'utf8'));
const url=new URL(session.url),key=new URLSearchParams(url.hash.slice(1)).get('key'),headers={'X-Tom-Key':key};
let state=null;
try{state=await (await fetch(url.origin+'/api/state',{headers})).json();}catch(e){if(e.cause?.code!=='ECONNREFUSED')throw e;}
if(state?.active||state?.qualification?.running)throw new Error('Tom is busy; finish or pause before restarting.');
if(state){await fetch(url.origin+'/api/quit',{method:'POST',headers});for(let n=0;n<50;n++){await delay(200);try{await fetch(url.origin+'/api/state',{headers});}catch{break;}}}
const out=fs.openSync(path.join(root,'.state/server-current.log'),'a'),err=fs.openSync(path.join(root,'.state/server-current-error.log'),'a');
const child=spawn(process.execPath,[path.join(root,'src/server.mjs')],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',out,err],env:{...process.env,TOM_SESSION_KEY:key,TOM_PORT:url.port}});child.unref();fs.closeSync(out);fs.closeSync(err);
for(let n=0;n<75;n++){await delay(200);try{const next=JSON.parse(fs.readFileSync(path.join(root,'.state/session.json'),'utf8'));if(next.pid!==child.pid)continue;const r=await fetch(url.origin+'/api/state',{headers});if(r.ok){const s=await r.json();console.log(JSON.stringify({restarted:true,browserProtocol:s.browserProtocol,pid:child.pid}));process.exit(0);}}catch{}}
throw new Error('The updated service did not start. Inspect .state/server-current-error.log.');
