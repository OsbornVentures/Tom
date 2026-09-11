import fs from 'node:fs/promises';
import path from 'node:path';
import {Runtime} from '../src/runtime.mjs';
import {toolDefinitions} from '../src/tools.mjs';
import {buildDispatchGrammar} from '../src/dispatch.mjs';
const root=path.resolve('.'),config=JSON.parse(await fs.readFile('config/runtime.json'));
const worker=new Runtime(root,{...config,logPath:'.state/dispatch-probe.log'}),controller=new AbortController();const results=[];
try{
 await worker.ensure(false,controller.signal,(_,text)=>console.log(text));
 for(const [prompt,dispatch] of [
  ['Use write to create note.txt containing exactly CEDAR-17. Return the complete action.',{}],
  ['Search the web for MDN localStorage setItem.',{allowAnswer:false,browserStage:'search',provider:'bing',browser:'edge'}],
  ['Read the MDN source at https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage .',{allowAnswer:false,browserStage:'read',urls:['https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage']}]
 ]){const start=Date.now();const response=await worker.complete([{role:'user',content:prompt}],toolDefinitions,controller.signal,()=>{},{maxTokens:260,dispatch});results.push({prompt,dispatch,response,elapsedMs:Date.now()-start});console.log(JSON.stringify(results.at(-1)));}
 await fs.writeFile('audit/v04/dispatch-probe.json',JSON.stringify(results,null,2));await fs.writeFile('audit/v04/dispatch.gbnf',buildDispatchGrammar());
}finally{await worker.stop();}
