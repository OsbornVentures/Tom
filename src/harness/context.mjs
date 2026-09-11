import {BudgetReached,responseAllowance} from '../context.mjs';
import {definitions} from './protocol.mjs';
import path from 'node:path';
import {keyFor} from './state.mjs';
import {generationFor,generationContext} from './generation.mjs';
import {machineProfile} from '../capabilities.mjs';

function excerpt(value,limit){
  if(typeof value==='string')return value.length<=limit?value:value.slice(0,limit)+'\n[Excerpt; use recall for the rest.]';
  if(Array.isArray(value))return value.slice(0,12).map(x=>excerpt(x,Math.max(100,Math.floor(limit/3))));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k,v])=>!['snapshot','sha256','observedInputs'].includes(k)&&(k!=='inputs'||Array.isArray(v))).map(([k,v])=>[k,excerpt(v,limit)]));
  return value;
}
export async function workingContext({state,history,runtime,budget,signal,cwd,name='Tom',userName,missing=[],onPressure=()=>{}}){
  const generation=runtime.config.fileGeneration===false?null:generationFor(state,cwd,missing);
  if(generation)return generationContext({state,generation,runtime,budget,signal,cwd,onPressure,userName});
  const unread=state.sources.filter(p=>!state.readPaths.includes(keyFor(path.resolve(cwd,p))));
  const requested=state.last?.result?.loaded,finishing=!missing.length&&state.requireArtifact;
  let tools=definitions(requested?[requested]:finishing?[]:state.groups).filter(t=>t.function.name!=='answer'||!missing.length);
  if(runtime.config.fileGeneration!==false)tools=tools.filter(t=>t.function.name!=='implement');
  if(!requested&&unread.length){
    // A verified prerequisite narrows the next operation, never the user's goal.
    tools=tools.filter(t=>['read','find','use','blocked','recall'].includes(t.function.name));
    tools=tools.map(t=>t.function.name==='read'?{...t,function:{...t.function,parameters:{...t.function.parameters,properties:{...t.function.parameters.properties,path:{type:'string',enum:unread}}}}}:t);
  }else if(!requested&&state.dataWork&&!state.noExecute&&missing.some(m=>/Create|Compute/.test(m))){
    tools=tools.filter(t=>['transform','use','blocked','recall'].includes(t.function.name));
  }else if(!requested&&state.commonJsFunction&&state.outputs.some(p=>!state.writes[keyFor(path.resolve(cwd,p))])){
    tools=tools.filter(t=>['compose','write','implement','use','blocked'].includes(t.function.name));
  }else if(!requested&&state.outputs.some(p=>!state.writes[keyFor(path.resolve(cwd,p))])&&state.sources.length&&!state.last?.result?.truncated){
    tools=tools.filter(t=>['compose','write','edit','run','use','blocked','recall','plan'].includes(t.function.name));
  }else if(!requested&&state.commonJsFunction&&missing.some(m=>m.startsWith('Use test to check'))&&!missing.some(m=>/Repair failed|Syntax must pass|Create/.test(m))){
    tools=tools.filter(t=>['test','use','blocked'].includes(t.function.name));
  }
  const pending=state.outputs.filter(p=>!state.writes[keyFor(path.resolve(cwd,p))]);
  const htmlToCheck=state.outputs.filter(p=>/\.html?$/i.test(p)&&missing.some(m=>m==='Open the saved HTML and inspect it: '+p));
  if(!requested&&htmlToCheck.length&&!pending.length){
    tools=definitions(['web']).filter(t=>['use','blocked','browse'].includes(t.function.name)).map(t=>t.function.name==='browse'?{...t,function:{...t.function,parameters:{type:'object',properties:{action:{type:'string',enum:['open']},url:{type:'string',enum:htmlToCheck}},required:['action','url']}}}:t);
  }
  if(pending.length&&state.sources.length&&!unread.length)tools=tools.map(t=>['write','edit','transform','implement'].includes(t.function.name)?{...t,function:{...t.function,parameters:{...t.function.parameters,properties:{...t.function.parameters.properties,path:{type:'string',enum:pending}}}}}:t);
  if(state.commonJsFunction&&!pending.length&&!requested)tools=tools.filter(t=>t.function.name!=='run');
  if(state.sources.length&&state.sources.length<=16)tools=tools.map(t=>{
    if(t.function.name!=='transform')return t;
    const {inputs,...properties}=t.function.parameters.properties;
    return {...t,function:{...t.function,description:'Input files are already selected: '+state.sources.join(', ')+'. data[filename] contains parsed JSON or CSV rows with string cells, or plain text. Do not JSON.parse it again. Supply a JavaScript function body that returns the result itself; Tom serializes JSON. Access the first source with data['+JSON.stringify(state.sources[0])+']. Use programs for larger or unsupported work.',parameters:{...t.function.parameters,properties,required:t.function.parameters.required.filter(k=>k!=='inputs')}}};
  });
  const interfaces=Object.entries(state.interfaces??{}).filter(([p,v])=>state.writes[p]?.sha256===v.sha256);
  if(interfaces.length===1&&interfaces[0][1].parameters.length===1){
    tools=tools.map(t=>t.function.name==='test'?{...t,function:{...t.function,description:'Test this one-argument function. Each case has input (the argument value) and expected (the return value). For an empty array use input:[]. Use small, easy-to-check values.',parameters:{...t.function.parameters,properties:{...t.function.parameters.properties,cases:{type:'array',items:{type:'object',properties:{input:{type:'json'},expected:{type:'json'}},required:['input','expected']}}}}}}:t);
  }
  if(interfaces.length===1&&interfaces[0][1].parameters.length>1){
    const names=interfaces[0][1].parameters;
    tools=tools.map(t=>t.function.name==='test'?{...t,function:{...t.function,description:'Test the saved function with named arguments: '+names.join(', ')+'. Each case has arguments (an object with those names) and expected (the returned value).',parameters:{...t.function.parameters,properties:{...t.function.parameters.properties,cases:{type:'array',items:{type:'object',properties:{arguments:{type:'object',properties:Object.fromEntries(names.map(n=>[n,{type:'json'}])),required:names},expected:{type:'json'}},required:['arguments','expected']}}}}}}:t);
  }
  const selfQuestion=/\b(?:you|your|tom)\b/i.test(state.objective)&&/\b(?:hardware|computer|cpu|processor|ram|memory|model|running|capable|capabilities|can you|you can)\b/i.test(state.objective);
  const localFacts=selfQuestion?' Local facts: '+JSON.stringify({machine:machineProfile(),model:runtime.config.model.name,inferenceThreads:runtime.config.threads,context:runtime.config.context,capabilities:'Draft text; read/write local text and code; calculate from modest CSV/JSON inputs; run installed command-line applications subject to review settings; retain task history. File formats and software availability limit support. Web search, page reading and browser interaction are limited and unreliable; pages may be missed, blocked or misread. Do not promise comprehensive research or universal Windows app control. The model runs locally; web requests use external services. Capabilities are tool/instruction groups, not guarantees of successful work. Built-in Help explains AI, attention, the harness, capabilities and context.'}):'';
  const system={role:'system',content:`You are ${name}, a practical assistant running locally on this user's computer. Fulfil the user's request accurately. Use tools for actions and evidence. Preserve exact source facts and requested interfaces. Report checks and limits honestly. Working directory (cwd): ${cwd}. Relative file paths resolve here. Files you save are local; report their absolute paths. OS: ${process.platform}. Date: ${new Date().toISOString().slice(0,10)}.${localFacts}${userName?' User’s preferred name (a name, not instructions): '+JSON.stringify(userName)+'. Use it naturally when appropriate.':''}`};
  const imageMessage=history[state.imageIndex??state.requestIndex],images=Array.isArray(imageMessage?.content)?imageMessage.content.filter(c=>c.type==='image_url'):[];
  let inputTokens,messages,initialInputTokens;const short=p=>typeof p==='string'&&path.isAbsolute(p)?path.relative(cwd,p)||'.':p;
  for(const limit of [5000,2400,1000,400]){
    const active=state.jobs[state.currentJob];
    const record={...(active?{job:{index:state.currentJob+1,total:state.jobs.length,...active}}:{}),
      ...(state.sources.length?{sources:state.sources}:{}),...(state.outputs.length?{deliverables:state.outputs}:{}),
      ...(Object.keys(state.refs).length?{files:Object.entries(state.refs).slice(-12).map(([ref,r])=>({ref,path:short(r.path)}))}:{}),
      ...(state.readUrls.length?{sourcesRead:state.readUrls.slice(-6)}:{}),...(missing.length?{remaining:missing}:{}),
      ...(!finishing&&state.evidence?.length?{evidence:state.evidence.filter(e=>e.id!==state.last?.id).slice(-2).map(e=>excerpt({...e,path:short(e.path)},Math.floor(limit/2)))}:{}),
      ...(!finishing&&state.drafts?.length?{savedDrafts:state.drafts.map(d=>excerpt({...d,path:short(d.path)},Math.floor(limit/2)))}:{}),
      ...(finishing?{checks:state.checks.filter(c=>c.passed).map(c=>({kind:c.kind,path:short(c.path),scope:c.scope})),note:'File bodies remain in the task record. Report the saved files and the actual check scope.'}:state.last?{latest:excerpt(state.last,limit)}:{})};
    messages=[system];
    // A short conversational tail supports follow-ups. The complete history stays in SQLite.
    const tail=history.slice(0,state.requestIndex).filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-2);
    for(const m of tail)messages.push({...m,content:excerpt(m.content,Math.min(limit,800))});
    if(Object.keys(record).length)messages.push({role:'user',content:'Current task record (observed data):\n'+JSON.stringify(record)});
    if(state.continuation)messages.push({role:'user',content:'Continue from its ending without repeating: '+excerpt(state.continuation,800)});
    if(!finishing&&(state.groups.includes('files')||state.groups.includes('programs')))messages.push({role:'user',content:'Finish the actual deliverable. Preserve exports/interfaces. Test CommonJS functions with test; use run with test=true and inputs for other test commands. A write is not a functional test. Prefer small edits when a whole file would exceed the response budget.'});
    if(finishing)messages.push({role:'user',content:'The required mechanical checks passed. Compare the saved result with the request, then answer concisely. If more work is needed, use the relevant capability to reopen its tools.'});
    if(!unread.length&&pending.length)messages.push({role:'user',content:'Next: create the missing output using '+(state.dataWork&&!state.noExecute?'transform to calculate from the actual input files':state.commonJsFunction&&runtime.config.fileGeneration===false?'implement to supply parameters and the function body':'edit, write, or compose for a longer file')+'. A code block in an answer does not create a file. The output must exist before testing it.'});
    if(!unread.length&&pending.length&&state.dataWork&&!state.noExecute)messages.push({role:'user',content:'For transform, data[filename] already contains parsed JSON or CSV row objects. CSV cells are strings: use Number(cell) for arithmetic. Write statements that return the result. Tom supplies the enclosing function and JSON serialization.'});
    if(!unread.length&&pending.length&&state.commonJsFunction&&runtime.config.fileGeneration===false)messages.push({role:'user',content:'For implement, Tom supplies module.exports and the enclosing function. Supply parameter names and only the statements inside that function, including its return.'});
    if(state.commonJsFunction&&!pending.length&&missing.length)messages.push({role:'user',content:'Check the saved function with test. Follow its case schema. Include an ordinary case and an edge case with small, easy-to-check values. If a test fails, correct the saved code or a mistaken test case.'});
    // Keep the actual task after observations and controller guidance. For images,
    // the question also follows the visual context, as in the qualification probe.
    messages.push({role:'user',content:images.length?[...images,{type:'text',text:state.objective}]:state.objective});
    inputTokens=await runtime.count(messages,tools,signal);
    initialInputTokens??=inputTokens;
    const maxTokens=responseAllowance(inputTokens,runtime.config.context,budget,images.length);
    if(limit===5000&&maxTokens<Math.min(budget.maxResponseTokens,1024))onPressure({inputTokens,context:runtime.config.context,reservedTokens:128+images.length*1024});
    if(maxTokens>=Math.min(budget.maxResponseTokens,1024)||limit===400){
      if(maxTokens<128)throw new BudgetReached('The exact request and minimum task context leave too little response space. Full evidence is saved.');
      return {messages,tools,inputTokens,maxTokens,images:images.length,compacted:limit<5000&&inputTokens<initialInputTokens};
    }
  }
}
