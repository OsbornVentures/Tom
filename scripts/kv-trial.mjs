import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Runtime} from '../src/runtime.mjs';
import {toolDefinitions,validateTool} from '../src/tools.mjs';
const exec=promisify(execFile),root=process.cwd(),base=JSON.parse(await fs.readFile('config/runtime.json','utf8'));
const trials=[];
for(const [k,v,context] of [['f16','f16',4096],['q8_0','q8_0',4096],['q4_0','q4_0',4096],['q8_0','q8_0',8192]]){
  const label=`${k}-${v}-${context}`,runtime=new Runtime(root,{...base,cacheTypeK:k,cacheTypeV:v,context,flashAttention:'on',verbosity:4,logPath:`audit/v02/kv-${label}.log`});
  const trial={label,k,v,context,started:new Date().toISOString(),checks:[]};const signal=AbortSignal.timeout(180000);
  try{
    await runtime.ensure(false,signal,(kind,text)=>{if(kind==='load')console.log(label,text);});
    const questions=[
      {text:'The project code is CEDAR and the count is 17. Reply with exactly CEDAR 17.',pattern:/CEDAR\s+17/i},
      {text:'Read this list and remember its first entry.\n'+Array.from({length:75},(_,i)=>`Entry ${i+1}: code ${i===0?'MAPLE-73':`ITEM-${i*13}`} is recorded.`).join('\n')+'\nWhat was the code in entry 1? Reply with the code only.',pattern:/MAPLE-73/}
    ];
    for(const q of questions){const messages=[{role:'system',content:'You are a precise local assistant.'},{role:'user',content:q.text}];const t=Date.now(),answer=await runtime.complete(messages,[],signal,()=>{},{maxTokens:100});trial.checks.push({kind:'retrieval',pass:q.pattern.test(answer.content??''),text:answer.content,usage:answer.usage,elapsedMs:Date.now()-t});}
    const toolMessages=[{role:'system',content:'Use the write tool to create requested files. Do not claim completion without a tool result.'},{role:'user',content:'Create a new file called café-17.txt containing CEDAR 17. Use expectedHash new. Make only the tool call.'}];
    const answer=await runtime.complete(toolMessages,toolDefinitions,signal,()=>{},{maxTokens:256});const call=answer.tool_calls?.[0],parsed=call&&validateTool(call.function);trial.checks.push({kind:'tool-format',pass:parsed?.name==='write'&&parsed.arguments.content==='CEDAR 17'&&parsed.arguments.path==='café-17.txt',call:parsed,usage:answer.usage});
    const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-Process -Id ${runtime.child.pid} | Select-Object WorkingSet64,PeakWorkingSet64,PrivateMemorySize64 | ConvertTo-Json`],{windowsHide:true});trial.memory=JSON.parse(stdout);
    trial.passed=trial.checks.every(c=>c.pass);
  }catch(e){trial.error=e.message;trial.passed=false;}
  finally{await runtime.stop();trials.push(trial);await fs.writeFile('audit/v02/kv-trials.json',JSON.stringify(trials,null,2));console.log(label,trial.passed?'PASS':'FAIL',trial.error??trial.memory);}
}
