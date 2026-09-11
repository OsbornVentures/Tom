import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeSearchResponse,searchWeb} from '../src/search-api.mjs';
import {requestContract} from '../src/evidence.mjs';

const content='Title: Cookie recipes\nURL: https://example.com/cookies\nPublished: N/A\nAuthor: N/A\nHighlights:\nCookie recipes with ingredients and baking instructions.';
const envelope=text=>({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text}]}});
test('search response accepts JSON and SSE, keeps source URLs, and removes duplicates',()=>{
 const json=JSON.stringify(envelope(content+'\n---\n\n'+content));
 for(const input of [json,'event: message\r\ndata: '+json+'\r\n\r\n']){const rows=decodeSearchResponse(input);assert.equal(rows.length,1);assert.equal(rows[0].url,'https://example.com/cookies');}
 assert.throws(()=>decodeSearchResponse(JSON.stringify({id:1,error:{message:'unavailable'}})),/could not complete/);
 assert.throws(()=>decodeSearchResponse(JSON.stringify({id:1,result:{isError:true}})),/could not complete/);
});
test('automatic searches need no browser, credentials, localhost connection, or user setup',async()=>{
 let request;const result=await searchWeb('cookie recipes',{fetchImpl:async(url,options)=>{request={url,...options};return {ok:true,status:200,text:async()=>JSON.stringify(envelope(content))};}});
 assert.equal(result.results.length,1);assert.equal(result.provider,'exa');assert.equal(request.url,'https://mcp.exa.ai/mcp');assert.equal(request.headers.Authorization,undefined);assert.equal(result.transport,'search-api');
 await assert.rejects(searchWeb('cookie recipes',{fetchImpl:async()=>({ok:false,status:429})}),/busy/);
});
test('screenshot wording and its pronoun follow-up both require research on the original subject',()=>{
 const history=[{role:'user',content:'What is the weathe rin lorena tx'}];
 assert.equal(requestContract(history).requireSearch,true);assert.equal(requestContract(history).query,'weather lorena tx');
 history.push({role:'assistant',content:'I cannot search.'},{role:'user',content:'can you search it?'});
 assert.equal(requestContract(history).requireSearch,true);assert.equal(requestContract(history).query,'weather lorena tx');
 history.push({role:'user',content:'can you search the web for cookie recipes?'});assert.equal(requestContract(history).query,'cookie recipes');
});
