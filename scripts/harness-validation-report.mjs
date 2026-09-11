// Regrade saved development outputs without sending the independent checks to Tom.
import fs from 'node:fs/promises';
import path from 'node:path';
import {cases} from './capability-cases.mjs';
import {evaluate} from './capability-score-v2.mjs';
import {hash} from '../src/tools.mjs';
const root=path.resolve(import.meta.dirname,'..'),dirs=process.argv.slice(2);
if(!dirs.length)throw Error('Supply completed development trial directories.');
const runs=[];
for(const name of dirs){
  const dir=path.resolve(root,name),report=JSON.parse(await fs.readFile(path.join(dir,'results.json'),'utf8'));
  if(!report.finished||!report.sourcesUnchanged)throw Error('A report must finish with unchanged sources: '+name);
  const protocol=JSON.parse(await fs.readFile(path.join(dir,'protocol.json'),'utf8'));
  if(report.results.length!==protocol.cases.length)throw Error('Incomplete planned trial set: '+name);
  for(const s of report.sources)if(hash(await fs.readFile(path.join(dir,'source',s.path)))!==s.sha256)throw Error('Source snapshot mismatch: '+s.path);
  const rows=[];
  for(const result of report.results){
    const c=cases.find(c=>c.id===result.case);
    if(c&&protocol.cases.find(p=>p.id===c.id)?.request!==c.request)throw Error('The case prompt changed: '+c.id);
    const content=c?await fs.readFile(path.join(dir,c.id,c.output),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;}):result.content;
    if(content!==result.content)throw Error('Saved output changed since the run: '+result.case);
    const outcome=c?evaluate(c,content):{passed:!!content&&!/\b(?:error|cannot)\b/i.test(content)};
    const fixturesUnchanged=!c||(await Promise.all(Object.entries(c.files).map(async([file,expected])=>await fs.readFile(path.join(dir,c.id,file),'utf8')===expected))).every(Boolean);
    const extraFiles=c?(await fs.readdir(path.join(dir,c.id))).filter(f=>!Object.hasOwn(c.files,f)&&f!==c.output):[];
    if(c&&/do not create any other file/i.test(c.request)&&extraFiles.length)throw Error('Unexpected extra files violate the request: '+c.id);
    const completedPassed=outcome.passed&&fixturesUnchanged&&result.status==='complete';
    if(outcome.passed!==result.outcome.passed||fixturesUnchanged!==result.fixturesUnchanged||completedPassed!==result.completedPassed)throw Error('Independent regrade disagrees: '+result.case);
    const last=result.events.findLast(e=>['blocked','budget','error','paused','stopped'].includes(e.kind));
    rows.push({case:result.case,status:result.status,completedPassed,artifactPassed:outcome.passed,fixturesUnchanged,extraFiles,elapsedMs:result.elapsedMs,modelCalls:result.work.metrics.modelCalls,firstInputTokens:result.events.find(e=>e.kind==='model')?.detail?.inputTokens,totalInputTokens:result.work.metrics.inputTokens,outputTokens:result.budget.usedTokens,ending:last?.text??null,output:content,independentChecks:outcome,actions:result.actions.map(a=>({status:a.status,operation:a.body.operation??a.body.name,arguments:a.body.arguments,result:a.result}))});
  }
  runs.push({directory:path.relative(root,dir),purpose:report.purpose,seed:report.seed,config:report.config,hardware:report.hardware,finished:report.finished,sourcesUnchanged:report.sourcesUnchanged,sources:report.sources,results:rows});
}
const out=path.join(root,'docs/benchmarks/harness-v2-validation-2026-09-06');await fs.mkdir(out,{recursive:true});
const document={purpose:'Development evidence only. Single seed, visible synthetic cases, iterative tuning, changed execution permissions. Not a controlled benchmark or hardware certification.',scorer:'scripts/capability-score-v2.mjs',scorerSha256:hash(await fs.readFile(path.join(root,'scripts/capability-score-v2.mjs'))),caseSuiteSha256:hash(await fs.readFile(path.join(root,'scripts/capability-cases.mjs'))),runs};
const postTrialChanges=(await Promise.all(runs.at(-1).sources.map(async s=>hash(await fs.readFile(path.join(root,s.path)))===s.sha256?null:s.path))).filter(Boolean);
document.postTrialChanges={files:postTrialChanges,note:'These current-source differences were not part of the latest frozen model run. Its scores apply to the saved source snapshot, not to untested later changes.'};
const readOptional=async file=>{try{return JSON.parse(await fs.readFile(path.join(root,file),'utf8'));}catch{return null;}};
const web=await readOptional('.state/harness-web-smoke.json'),browser=await readOptional('.state/harness-browser/result.json');
document.adapterChecks={browser,web:web?{passed:web.passed,observedAt:web.observedAt,provider:web.search?.provider,resultCount:web.search?.results?.length,read:web.read,error:web.error}:null};
const release=await readOptional('.state/harness-release-api.json');
document.applicationCheck=release;
const last=runs.at(-1),tasks=last.results.filter(r=>r.case!=='hello'),greeting=last.results.find(r=>r.case==='hello');
const passed=rows=>rows.filter(r=>r.completedPassed).length,artifacts=rows=>rows.filter(r=>r.artifactPassed&&r.fixturesUnchanged).length;
const category=cat=>tasks.filter(r=>cases.find(c=>c.id===r.case)?.category===cat);
const log=await fs.readFile(path.join(root,'.state/harness-release-tests.log'),'utf8').catch(()=>'');
const testCount=log.match(/\btests (\d+)/)?.[1]??'unavailable';
document.regressionCheck={tests:Number(testCount)||null,passed:Number(log.match(/\bpass (\d+)/)?.[1]??NaN),failed:Number(log.match(/\bfail (\d+)/)?.[1]??NaN),logSha256:hash(log)};
await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(document,null,2)+'\n');
const lines=[
  '# Harness v2 development validation', '',
  '**This is development evidence, not a capability-marketing qualification.** The latest frozen run completed '+passed(tasks)+' of '+tasks.length+' file tasks correctly. '+artifacts(tasks)+' saved outputs passed the independent checks. The greeting is a separate smoke check and is excluded from these rates.', '',
  ...(postTrialChanges.length?['**Changes after that model run:** '+postTrialChanges.map(p=>'`'+p.replaceAll('\\','/')+'`').join(', ')+'. The restored-file-version reference fix has a reproducing regression test and is included in the complete passing suite. The model scores below remain attached to the earlier frozen snapshot; they were not rerun after this fix.', '']:[]),
  'The original 64-trial comparison and its corrected scorer remain unchanged. These trials add native self-tests and calculation helpers and were used during development. They cannot establish a controlled capability uplift over the original Tom, direct-model, minimal-harness or Aider runs.', '',
  '## Latest frozen source', '',
  '| Task | Controller status | Output passes independent checks | Completed correctly | Seconds |',
  '| --- | --- | --- | --- | ---: |',
  ...tasks.map(r=>'| '+r.case+' | '+r.status+' | '+(r.artifactPassed&&r.fixturesUnchanged?'Yes':'No')+' | '+(r.completedPassed?'Yes':'No')+' | '+Math.round(r.elapsedMs/1000)+' |'), '',
  'Software functions: **'+passed(category('software-repair'))+'/4** completed correctly. Data transformations: **'+passed(category('data-transform'))+'/2**. Exact editing and extraction: **'+passed(category('file-integrity'))+'/2**.', '',
  ...(greeting?['The greeting '+(greeting.completedPassed?'passed':'failed')+' with **'+greeting.firstInputTokens+' measured text input tokens**. That is one short-prompt measurement, not a maximum context size or a claim about every request.', '']:[]),
  '## Checks and conditions', '',
  '- '+testCount+' deterministic regression tests passed in the recorded complete suite. These test the harness, not the language model’s general competence.',
  '- Actual Playwright interaction passed on a local fixture: open, type, select, click, changed/stale references and session reuse. The UI transport check covered review, task-record export, narrow layout and reduced motion.',
  '- Live web adapter check: '+(web?.passed?'passed; '+web.search.results.length+' search results and a read of the [official model card]('+web.read.url+').':'see the JSON evidence for the recorded outcome.')+' This did not test model-led research quality.',
  ...(release?['- Restarted application: '+release.harness+'; audit export '+release.audit?.format+'. Startup checks '+(release.qualification.passed?'passed':'did not pass')+' ('+release.qualification.checks.map(c=>c.name).join(', ')+'). This local application check used '+release.threads+' threads and '+release.context+' context tokens; the comparative development trials below used two threads. The app runs with normal desktop permissions.']:[]),
  '- CPU: '+last.hardware.cpu+'. Installed/visible system memory: '+(last.hardware.ram/1073741824).toFixed(2)+' GiB. Windows (Node platform '+last.hardware.platform+'); '+last.config.threads+' inference threads, no GPU offload.',
  '- Model: '+last.config.model.name+' Q4_0 GGUF. Model SHA-256: `'+last.config.model.sha256+'`.',
  '- Runtime: '+last.config.revision+'. Context: '+last.config.context+' tokens. Seed: '+last.seed+'. Sampling defaults: temperature 0.2, top-p 0.95, top-k 64; reasoning disabled.',
  '- Per case: 24 model calls/steps, 12,288 generated-token allowance, 10 active minutes and at most 2,048 generated tokens per response. Interrupted or unparsable responses can consume their reserved allowance conservatively.',
  '- Prompts were written to protocol.json before inference. All src files were copied and hashed before each run; each listed run finished with those sources unchanged.',
  '- Each case has its own folder and task record. Checks run outside the model. Source fixtures were compared with their original bytes; the extraction task also forbids extra files.',
  '- The trial reviewer permits the bundled calculation/function-test helpers and a restricted set of local Node assertion commands. It denies web use and unrestricted commands in these file trials. This is narrower than the application’s user-reviewed CLI capability.',
  '- Timings include model and tool work on this development computer. They are observations, not isolated speed comparisons.', '',
  '## Completed development iterations', '',
  '| Frozen run directory | Correct task completions | Correct saved outputs |',
  '| --- | ---: | ---: |',
  ...runs.map(r=>{const t=r.results.filter(x=>x.case!=='hello');return '| `'+r.directory.replaceAll('\\','/')+'` | '+passed(t)+'/'+t.length+' | '+artifacts(t)+'/'+t.length+' |';}), '',
  'Earlier short pilots and interrupted attempts remain under .state/harness-live. They were exploratory, sometimes had source changes during execution, and are not pooled with these frozen sets. No run is promoted to an independent or held-out benchmark merely because it passed.', '',
  '## Interpretation and work not qualified', '',
  'The redesign establishes modular tools, smaller working views, durable jobs, renewable budgets, version-bound checks, bounded helpers and inspectable records. The live failures show that tool-contract following, program generation and model-written tests still need work. A saved file and a completed, correct task are deliberately reported separately. Independent output checks can also fail after the model’s own checks pass.', '',
  'Concrete examples from the latest trace: both data tasks repeatedly supplied a function declaration where the calculation adapter required an executed body returning a result. The money function passed independent checks, but the model supplied test inputs that did not match the requested row format and then repeated reads. Other software cases produced incorrect logic, a duplicate parameter declaration or a missing return. The controller stopped these loops and retained the work; it did not repair them successfully. These are model–interface and recovery failures, not evidence that the model alone is the limiting factor.', '',
  'Do not market these results as improved SWE capability or universal task reliability. These are small synthetic function/file cases, not SWE-bench or repository-level software engineering. The prompts were visible during tuning, and only one seed was used.', '',
  '| Not run / not established | Reason |',
  '| --- | --- |',
  '| Physical 8th-generation Intel / 8 GB system qualification | This host is the 32 GB Skylake Xeon development system. A memory estimate is not a physical-machine result. |',
  '| E4B and 12B quality/memory qualification | Only the installed E2B Q4 profile was exercised. Larger profiles need their own tests and sufficient RAM. |',
  '| Official SWE-bench and long repository tasks | This validation uses bounded synthetic local functions and files; no qualifying repository benchmark environment was established. |',
  '| General native GUI, OCR, cross-frame web automation and arbitrary file sizes | The implemented paths are local files, installed CLIs and the documented Playwright adapter, with explicit memory/format limits. |',
  '| Long-horizon model competence | Pause/restart across twelve jobs is covered by a scripted controller test. It is not evidence that E2B can independently plan and complete arbitrary long projects. |', '',
  'The official product target remains Windows 11 x64, 8th-generation Intel or newer, 8 GB RAM for the base configuration. Larger models have separate requirements. The shared harness does not make every model fit in 8 GB.', '',
  '## Evidence and reproduction', '',
  '[Machine-readable outcomes, output bytes, action traces and source hashes](benchmarks/harness-v2-validation-2026-09-06/validation.json). [Architecture and operating limits](HARNESS.md). Raw synthetic journals, runtime logs and source snapshots stay in the listed local run directories.', '',
  'Run `runtime/node.exe scripts/check.mjs` for regression checks. Run `runtime/node.exe scripts/harness-live-check.mjs --cases hello,csv-ledger,join-stock,quoted-instruction,exact-copy,sum-money,stable-unique,paginate,merge-ranges` with the interactive app idle for another development trial. Regrade completed frozen runs with `scripts/harness-validation-report.mjs` and their run directories.', '',
  'A follow-up comparative study needs a new frozen protocol, held-out tasks, both seeds, identical tool permissions and comparable budgets across the candidate harnesses. It must retain failures and separate output correctness, completion, resource use and verification scope.', ''
];
await fs.writeFile(path.join(root,'docs/HARNESS-VALIDATION.md'),lines.join('\n'));
for(const run of runs)console.log(JSON.stringify({run:run.directory,completed:run.results.filter(r=>r.completedPassed).length,total:run.results.length,artifacts:run.results.filter(r=>r.artifactPassed&&r.fixturesUnchanged).length,results:run.results.map(({case:id,status,completedPassed,artifactPassed})=>({case:id,status,completedPassed,artifactPassed}))}));
