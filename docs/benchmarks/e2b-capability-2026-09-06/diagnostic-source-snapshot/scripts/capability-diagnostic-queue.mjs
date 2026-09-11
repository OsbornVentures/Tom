import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {spawn} from 'node:child_process';
console.log('Waiting for the real Aider batch before running the separately labeled extension diagnostic.');
for(let i=0;i<3600;i++){
 let finished=null;
 for(const name of await fs.readdir('.state/capability-aider')){
  try{const f=path.join('.state/capability-aider',name,'results.json'),s=JSON.parse(await fs.readFile(f,'utf8'));if(s.classification.startsWith('same-model named peer')&&s.finished)finished=s;}catch{}
 }
 if(finished){if(finished.results.length!==16)throw Error('Incomplete Aider run; inspect before diagnostic');const child=spawn(process.execPath,['scripts/capability-js-diagnostic.mjs'],{windowsHide:true,stdio:'inherit'});process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});break;}
 if(i===3599)throw Error('Peer did not finish within two hours');await delay(2000);
}
