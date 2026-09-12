import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Runtime} from '../src/runtime.mjs';
import {cases,evaluate} from './capability-cases.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=process.env.BENCH_PYTHON??'<python>';
const out=path.join(root,'.state/capability-aider',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(out,{recursive:true});
const config=JSON.parse(await fs.readFile(path.join(root,'config/runtime.json'))),sha=x=>createHash('sha256').update(x).digest('hex');
const runtime=new Runtime(root,{...config,threads:2,logPath:path.relative(root,path.join(out,'runtime.log'))});
const smoke=process.argv.includes('--transport-smoke');
const selected=smoke?[{id:'transport-smoke',output:'probe.txt',files:{'source.txt':'PROBE'},request:'Read source.txt and create probe.txt containing PROBE and a final newline.',expected:'PROBE\n'}]:cases;
const seeds=smoke?[42]:[42,43];
const manifest={version:'tom-aider-peer-v1',aiderVersion:'0.86.2',classification:smoke?'transport-only mock; not a model result':'same-model named peer; native Aider whole-file editor with scoped IO and local budget proxy',started:new Date().toISOString(),config:{...config,threads:2},hardware:{cpu:os.cpus()[0].model,ramBytes:os.totalmem(),os:os.release()},seeds,cases:selected,budget:{maxSteps:24,maxTokens:12288,maxActiveMs:900000,maxResponseTokens:2048},results:[]};
manifest.integrationHashes={};for(const name of ['capability-aider.py','capability-aider-benchmark.mjs','capability-cases.mjs'])manifest.integrationHashes[name]=sha(await fs.readFile(path.join(root,'scripts',name)));
await fs.writeFile(path.join(out,'protocol.json'),JSON.stringify(manifest,null,2));console.log('AIDER RUN',out);
let current;
const proxy=http.createServer(async(req,res)=>{try{
 if(req.method!=='POST'||!req.url.endsWith('/chat/completions')){res.writeHead(404);res.end();return;}
 let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
 if(!current||current.calls>=24||current.tokens>=12224||Date.now()-current.start>=900000)throw Error('Benchmark budget exhausted');
 current.calls++;
 let result;
 if(smoke)result={id:'mock',object:'chat.completion',created:0,model:'tom-e2b',choices:[{index:0,message:{role:'assistant',content:'probe.txt\n```text\nPROBE\n```'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:15,total_tokens:115}};
 else{
  const signal=AbortSignal.timeout(Math.max(1,900000-(Date.now()-current.start))),inputTokens=await runtime.count(body.messages,[],signal);
  const limit=Math.min(2048,12288-current.tokens,4096-inputTokens-128);if(limit<64)throw Error('Benchmark context budget exhausted');
  const request={messages:body.messages,temperature:0.2,top_p:0.95,top_k:64,seed:current.seed,max_tokens:limit,stream:false,cache_prompt:true,chat_template_kwargs:{enable_thinking:false},parse_tool_calls:false};
  result=await(await runtime.request('/v1/chat/completions',request,signal)).json();current.requests.push({request,inputTokens,result});
 }
 current.tokens+=result.usage?.completion_tokens??2048;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
}catch(e){if(current)current.proxyErrors.push(e.message);res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:e.message,type:'invalid_request_error',code:'benchmark_limit'}}));}});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+proxy.address().port+'/v1';
try{
 if(!smoke){try{const session=JSON.parse(await fs.readFile(path.join(root,'.state/session.json'))),u=new URL(session.url);const s=await(await fetch(u.origin+'/api/state',{headers:{'X-Tom-Key':new URLSearchParams(u.hash.slice(1)).get('key')},signal:AbortSignal.timeout(1500)})).json();if(s.active||s.runtime?.loaded||s.qualification?.running)throw Error('APP_BUSY');}catch(e){if(e.message==='APP_BUSY')throw e;}await runtime.ensure(false,AbortSignal.timeout(240000),()=>{});}
 for(const seed of seeds)for(const c of selected){
  const dir=path.join(out,`${c.id}-${seed}-aider`);await fs.mkdir(dir);for(const [n,v]of Object.entries(c.files))await fs.writeFile(path.join(dir,n),v);
  const specFile=path.join(out,`${c.id}-${seed}-spec.json`),resultFile=path.join(out,`${c.id}-${seed}-native.json`);
  await fs.writeFile(specFile,JSON.stringify({dir,output:c.output,files:Object.keys(c.files),request:c.request,base,resultFile}));
  current={calls:0,tokens:0,seed,start:Date.now(),requests:[],proxyErrors:[]};console.log('AIDER START',c.id,seed);
  const child=spawn(python,[path.join(root,'scripts/capability-aider.py'),specFile],{cwd:dir,windowsHide:true,env:{...process.env,PYTHONPATH:path.join(root,'.state/capability-deps'),PYTHONIOENCODING:'utf-8',LITELLM_LOCAL_MODEL_COST_MAP:'True',TIKTOKEN_CACHE_DIR:path.join(root,'.state/capability-deps/tiktoken-cache')},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const timer=setTimeout(()=>child.kill(),915000);const exit=await new Promise(resolve=>{child.on('error',e=>{output+=e.message;resolve(-1);});child.on('close',resolve);});clearTimeout(timer);
  const content=await fs.readFile(path.join(dir,c.output),'utf8').catch(()=>''),assertions=evaluate(c,content),unchanged=(await Promise.all(Object.entries(c.files).map(async([n,v])=>await fs.readFile(path.join(dir,n),'utf8')===v))).every(Boolean),extraFiles=(await fs.readdir(dir)).filter(n=>!Object.hasOwn(c.files,n)&&n!==c.output);
  const native=JSON.parse(await fs.readFile(resultFile,'utf8').catch(()=>'null'));
  const row={case:c.id,category:c.category,seed,arm:'aider',status:exit===0?'complete':'error',exit,artifactPassed:assertions.passed&&unchanged&&!extraFiles.length,assertions,fixturesUnchanged:unchanged,extraFiles,content,wallMs:Date.now()-current.start,usage:{usedSteps:current.calls,usedTokens:current.tokens},requests:current.requests,proxyErrors:current.proxyErrors,native,log:output};row.completedPassed=row.artifactPassed&&row.status==='complete';manifest.results.push(row);
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(manifest,null,2));console.log('AIDER RESULT',c.id,seed,row.artifactPassed?'PASS':'FAIL',Math.round(row.wallMs/1000)+'s',exit);if(smoke)console.log(output.slice(-2500));
 }
}finally{await runtime.stop();await new Promise(r=>proxy.close(r));manifest.finished=new Date().toISOString();await fs.writeFile(path.join(out,'results.json'),JSON.stringify(manifest,null,2));console.log('AIDER FINISHED',out);}
