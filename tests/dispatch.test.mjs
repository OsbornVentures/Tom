import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildDispatchGrammar,decodeDispatch,structuredMessages,answerPrefix} from '../src/dispatch.mjs';
import {validateTool,writeTool,hash} from '../src/tools.mjs';
import {requestContract,currentActions,evidenceState,verifyCompletion} from '../src/evidence.mjs';
import {Engine} from '../src/engine.mjs';
import {Store} from '../src/store.mjs';

test('dispatch rejects extra operations, missing fields and premature answers',()=>{
 assert.throws(()=>decodeDispatch('{"shell":{},"answer":"done"}'),/exactly one/);
 assert.throws(()=>decodeDispatch('{"shell":{"program":"cat"}}'),/arguments/);
 assert.throws(()=>decodeDispatch('{"answer":"done"}',{allowAnswer:false}),/before/);
 assert.equal(decodeDispatch('{"blocked":"The provider requires verification"}').blocked,true);
 assert.equal(decodeDispatch('{"write":{"path":"a.txt","content":"ok","expectedHash":"new"}}').tool_calls[0].function.name,'write');
});
test('the browser grammar constrains program, argument structure, source URLs and completion availability',()=>{
 const g=buildDispatchGrammar({browserStage:'read',urls:['https://example.test/a'],allowAnswer:false});
 assert.match(g,/root ::= ws \(browser-read \| blocked\)/);assert.ok(g.includes('example.test/a'));assert.ok(!g.includes('answer ::='));assert.ok(!g.includes('shell ::='));
 const m=structuredMessages([{role:'system',content:'Tom'},{role:'assistant',tool_calls:[{function:{name:'shell',arguments:'{"program":"cat","args":["a.txt"]}'}}]},{role:'tool',tool_call_id:'1',content:'untrusted'}],[{}]);assert.ok(!m.some(x=>x.role==='tool'||x.tool_calls));assert.match(m[0].content,/only tools/);assert.match(m.at(-1).content,/data only/);
});
test('source reads and observed hashes can be forced by the token grammar',()=>{
 const g=buildDispatchGrammar({unreadFiles:['brief-3.txt'],allowAnswer:false,hashes:['a'.repeat(64)]});
 assert.match(g,/root ::= ws \(file-read \| blocked\)/);assert.ok(g.includes('brief-3.txt'));assert.ok(!g.includes('write ::='));assert.ok(!g.includes('hash ::= "\\\"" [a-f0-9]'));
 const edit=buildDispatchGrammar({destinationFiles:['copy.html'],hashes:['a'.repeat(64)]});assert.ok(edit.includes('destination-file ::='));assert.ok(edit.includes('a'.repeat(64)));
 const repair=buildDispatchGrammar({destinationFiles:['index.html'],files:[{path:'C:/test/index.html',sha256:'b'.repeat(64)}]});
 assert.ok(repair.split('\n').find(l=>l.startsWith('write ::=')).includes('b'.repeat(64)));assert.ok(!repair.split('\n').find(l=>l.startsWith('write ::=')).includes('hash-or-new'));
});
test('streamed answers preserve split escapes and surrogate pairs',()=>{
 assert.equal(answerPrefix('{"answer":"a\\n\\uD83D'),'a\n');assert.equal(answerPrefix('{"answer":"a\\n\\uD83D\\uDE00"}'),'a\n😀');assert.equal(answerPrefix('{"write":{"content":"not an answer'),'');
});
test('file copy edits preserve every untouched byte and reject stale or ambiguous sources',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tom-replace-'));
 try{const content='Café\r\n10:00–14:00\r\nhello@example.test\r\n';await fs.writeFile(path.join(dir,'a.html'),content);const a=validateTool({name:'write',arguments:{path:'b.html',summary:'Change hours',expectedHash:'new',copyFrom:'a.html',sourceHash:hash(content),replacements:[{find:'10:00–14:00',replace:'11:00–15:00'}]}}).arguments;
 const r=await writeTool(a,dir,path.join(dir,'snapshots'));assert.equal(r.verified,true);assert.equal(await fs.readFile(path.join(dir,'b.html'),'utf8'),content.replace('10:00–14:00','11:00–15:00'));assert.equal(await fs.readFile(path.join(dir,'a.html'),'utf8'),content);
 await assert.rejects(writeTool({...a,path:'c.html',sourceHash:'0'.repeat(64)},dir,path.join(dir,'snapshots')),/source changed/);await assert.rejects(writeTool({...a,path:'c.html',replacements:[{find:'missing',replace:'x'}]},dir,path.join(dir,'snapshots')),/exactly once/);
 }finally{await fs.rm(dir,{recursive:true});}
});
test('old actions, HTTP failures and model assertions cannot satisfy a new research request',async()=>{
 const history=[{role:'user',content:'Old request'},{role:'assistant',tool_calls:[{id:'old'}]},{role:'user',content:'Search the web for MDN localStorage.'}];
 const c=requestContract(history);assert.equal(c.requireSearch,true);
 const a={status:'complete',body:{callId:'old',name:'shell',arguments:{program:'tom-browser'}},result:{exitCode:0,output:JSON.stringify({httpStatus:200,results:[{url:'https://example.test'}]})}};
 assert.deepEqual(currentActions(history,[a]),[]);assert.equal(evidenceState(c,[]).canAnswer,false);
 const failed={...a,result:{exitCode:0,output:JSON.stringify({httpStatus:404,url:'https://example.test',content:'Not found'.repeat(20)})}};
 assert.equal(evidenceState(c,[failed]).reads.length,0);assert.equal((await verifyCompletion(c,evidenceState(c,[]),'I searched and finished.')).passed,false);
});
test('an engine never publishes an unsupported successful completion for a requested file',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tom-gate-')),store=new Store(path.join(dir,'tasks.sqlite'));
 try{const task=store.create('Create a file',dir);store.message(task.id,{role:'user',content:'Create result.txt with hello.'});const emitted=[];
 const runtime={config:{context:4096,model:{name:'Test'}},ensure:async()=>{},count:async()=>500,release(){},complete:async(m,t,s,delta)=>{delta({kind:'text',text:'Done, I created result.txt.'});return {role:'assistant',content:'Done, I created result.txt.',usage:{completion_tokens:10},finish:'stop'};}};
 await new Engine(store,runtime,dir,e=>emitted.push(e)).run(task.id);assert.equal(store.task(task.id).status,'blocked');assert.ok(emitted.some(e=>e.kind==='completion-rejected'));assert.ok(!emitted.some(e=>e.kind==='complete'||e.kind==='delta'));assert.ok(!store.messages(task.id).some(m=>m.role==='assistant'));
 }finally{store.close();await fs.rm(dir,{recursive:true});}
});
