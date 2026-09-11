import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const argv=process.argv.slice(2),arg=(key,fallback)=>argv.includes(key)?argv[argv.indexOf(key)+1]:fallback;
const cases=arg('--cases','sum-money,stable-unique,paginate,merge-ranges,csv-ledger,join-stock,exact-copy,quoted-instruction,clamp-value,group-events'),record=arg('--record','.state/repair-queue.json');
const configs=['.state/e2b-q8_0.json','.state/e2b-q4_0.json','config/runtime.json'];
const plan={purpose:'Paired development package comparison on the same repaired harness.',seed:42,threads:4,cases:cases.split(','),configs,started:new Date().toISOString(),finished:[]};
await fs.writeFile(path.resolve(root,record),JSON.stringify(plan,null,2));
for(const config of configs){
  if(await fs.stat(path.join(root,'.state/harness-repair-stop')).catch(()=>null))throw Error('Comparison stopped by its control file.');
  console.log('PACKAGE',config);
  const child=spawn(process.execPath,['scripts/harness-repair-live.mjs','--config',config,'--cases',cases,'--threads','4','--seed','42'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error('Trial failed to finish: '+config+' ('+code+')');
  plan.finished.push(config);await fs.writeFile(path.resolve(root,record),JSON.stringify(plan,null,2));
}
plan.completed=new Date().toISOString();await fs.writeFile(path.resolve(root,record),JSON.stringify(plan,null,2));console.log('PACKAGE COMPARISON FINISHED');
