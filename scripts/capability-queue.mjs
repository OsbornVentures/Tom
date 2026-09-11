// Keep local model comparisons sequential; this is a foreground benchmark job.
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {spawn} from 'node:child_process';
const previous=process.argv[2];if(!previous)throw Error('Supply previous results.json');
console.log('Waiting for the 48-trial comparison to finish before starting Aider.');
for(let i=0;i<3600;i++){
 const s=JSON.parse(await fs.readFile(previous,'utf8'));
 if(s.finished){if(s.results.length!==48||!s.sourcesUnchanged)throw Error('Previous run incomplete or source changed; inspect before proceeding.');const child=spawn(process.execPath,['scripts/capability-aider-benchmark.mjs'],{windowsHide:true,stdio:'inherit'});process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});break;}
 if(i===3599)throw Error('Previous run did not finish within two hours');await delay(2000);
}
