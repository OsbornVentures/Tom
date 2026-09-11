import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Runtime} from '../src/runtime.mjs';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'audit/installer-beta');await fs.mkdir(output,{recursive:true});
const config=JSON.parse(await fs.readFile(path.join(root,'config/runtime.json'))),results=[];
for(const [acceleration,kvCache] of [['cpu','f16'],['cpu','q8_0'],['vulkan','f16'],['vulkan','q8_0']]){
 const runtime=new Runtime(root,{...config,acceleration,kvCache,context:2048,threads:2,logPath:`audit/installer-beta/${acceleration}-${kvCache}.log`});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Runtime compatibility check timed out')),240000);
 try{const started=Date.now();await runtime.ensure(false,controller.signal,(kind,text)=>{if(['load','ready','recovery'].includes(kind))console.log(text);});const response=await runtime.complete([{role:'user',content:'Reply with the single word READY.'}],[],controller.signal,()=>{},{maxTokens:24});assert.match(response.content,/READY/);const result={requested:{acceleration,kvCache},effective:runtime.effective,hardware:runtime.hardwareInfo,grammar:runtime.grammarVerified,response:response.content,ms:Date.now()-started,recovery:runtime.recovery??null};results.push(result);console.log(JSON.stringify(result));}
 finally{clearTimeout(timer);await runtime.stop();await fs.writeFile(path.join(output,'runtime-results.json'),JSON.stringify(results,null,2));}
}
