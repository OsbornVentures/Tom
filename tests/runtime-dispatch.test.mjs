import test from 'node:test';
import assert from 'node:assert/strict';
import {Runtime} from '../src/runtime.mjs';
const fake=(text,finish,done=true)=>{
 const runtime=new Runtime('.',{});runtime.request=async()=>new Response('data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:finish}]})+'\n\n'+(done?'data: [DONE]\n\n':''));return runtime;
};
test('a truncated or disconnected structured stream never returns an executable action',async()=>{
 const call='{"write":{"summary":"Save","path":"a.txt","expectedHash":"new","content":"unfinished';
 await assert.rejects(fake(call,'length').complete([],['tool'],new AbortController().signal,()=>{}),/No partial action/);
 await assert.rejects(fake(call,null,false).complete([],['tool'],new AbortController().signal,()=>{}),/No incomplete tool action/);
});
test('strict decoding rejects malformed output and returns a validated complete action',async()=>{
 await assert.rejects(fake('I wrote the file.','stop').complete([],['tool'],new AbortController().signal,()=>{}));
 const answer=await fake('{"write":{"summary":"Save","path":"a.txt","expectedHash":"new","content":"ok"}}','stop').complete([],['tool'],new AbortController().signal,()=>{});
 assert.equal(answer.tool_calls[0].function.name,'write');assert.equal(JSON.parse(answer.tool_calls[0].function.arguments).content,'ok');
});
