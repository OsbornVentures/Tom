// Build an evidence folder. Models, real conversations and session credentials
// are deliberately outside the selected paths.
import fs from 'node:fs/promises';
import path from 'node:path';
import {hash} from '../src/tools.mjs';
const root=path.resolve(import.meta.dirname,'..'),name='tom-harness-repair-'+new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(root,'.state/review-packages',name);
if(await fs.stat(path.join(root,'.state/harness-repair.lock')).catch(()=>null))throw Error('Wait for the model comparison to finish before packing evidence.');
await fs.mkdir(out,{recursive:true});
const copy=async(from,to=from)=>{await fs.mkdir(path.dirname(path.join(out,to)),{recursive:true});await fs.cp(path.join(root,from),path.join(out,to),{recursive:true});};
for(const p of ['README.md','package.json','docs/HARNESS-REPAIR.md','docs/HARNESS.md','docs/benchmarks/harness-repair-2026-09-07','src','config','tests','public','browser-extension','output/harness-repair-demo','scripts/fixtures'])await copy(p);
for(const file of ['check.mjs','harness-repair-live.mjs','harness-repair-queue.mjs','harness-repair-report.mjs','capability-cases.mjs','capability-score-v2.mjs','fetch-e2b-variants.mjs','inspect-gguf.mjs','qualify-e2b-q8.mjs','check-game-flow.mjs','game-grader-controls.mjs','harness-browser-check.mjs','ui-v05-check.mjs','pack-harness-repair.mjs','archive-harness-repair.ps1'])await copy('scripts/'+file);
for(const n of await fs.readdir(path.join(root,'.state/harness-repair'))){
  const trial=path.join('.state/harness-repair',n);if(!(await fs.stat(path.join(root,trial))).isDirectory())continue;
  await copy(trial,path.join('evidence/development-runs',n));
}
for(const file of ['gguf-provenance.jsonl','q8-local-qualification.json','game-grader-control-results.json','harness-repair-tests.log','harness-repair-ui-check.log','harness-repair-browser-check.log','repair-queue.json','input-queue.json','full-package-run-paths.json','input-package-run-paths.json','e2b-q4_0.json','e2b-q8_0.json','e4b-repair.json'])if(await fs.stat(path.join(root,'.state',file)).catch(()=>null))await copy('.state/'+file,'evidence/'+file);
await fs.writeFile(path.join(out,'README.txt'),[
  'Tom harness repair — local development evidence',
  'Start with docs/HARNESS-REPAIR.md. Completed matched runs are listed there.',
  'All earlier development runs are retained separately, including interrupted and failed pilots. Do not pool them into the matched comparison.',
  'Each final run contains the exact application source snapshot, model/config hashes, requests, raw events, actions and independent output grades.',
  'Q4/Q8 packages differ in conversion metadata and tensor counts. Results do not isolate quantization alone.',
  'For reproduction use the recorded scripts, CPU runtime and pinned model files in a Tom checkout. Native runtime binaries and multi-gigabyte models are not included.',
  'The task fixtures are synthetic. The actual user conversation database, session key and account configuration are not included.',
  'MANIFEST.json hashes every included file except itself. Model qualification is a separate product screen, not a SWE score.',
  ''
].join('\n'));
const manifest=[];async function walk(dir){for(const e of await fs.readdir(path.join(out,dir),{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Unexpected symbolic link: '+p);if(e.isDirectory())await walk(p);else{const b=await fs.readFile(path.join(out,p));manifest.push({path:p.replaceAll('\\','/'),bytes:b.length,sha256:hash(b)});}}}await walk('');
await fs.writeFile(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(root,'.state/last-review-package.json'),JSON.stringify({directory:out,name,files:manifest.length}));
console.log(JSON.stringify({directory:out,files:manifest.length}));
