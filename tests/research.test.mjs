import test from 'node:test';
import assert from 'node:assert/strict';
import {requestContract,evidenceState} from '../src/evidence.mjs';
import {relevance,searchQuery,searchAttempts} from '../src/relevance.mjs';
import {buildDispatchGrammar,decodeDispatch} from '../src/dispatch.mjs';
import {memoryExplanation} from '../public/help.js';
const user=content=>({role:'user',content});

test('conversational current facts require a browser attempt; creative and offline tasks do not',()=>{
 for(const text of ['What is the weather like in lorena tx today?','What is the weather in Salem MA?','Who is the current CEO of Acme?','What is the latest release of WidgetOS?'])assert.equal(requestContract([user(text)]).requireSearch,true,text);
 for(const text of ['Write a poem about today’s weather.','What does the word weather mean?','What is 2 + 2?','What is the weather in Rome? Do not search.'])assert.equal(requestContract([user(text)]).requireSearch,false,text);
});
test('a pronoun-only search follow-up keeps earlier user subject and ignores model drift',()=>{
 const c=requestContract([user('What is the weather like in lorena tx today?'),{role:'assistant',content:'Arlington is warm.'},user('can you search the web for it?')]);
 assert.equal(c.subject,'What is the weather like in lorena tx today?');assert.equal(c.query,'weather lorena tx today');assert.equal(c.index,2);assert.equal(c.requireSearch,true);assert.ok(!c.query.includes('Arlington'));
 assert.equal(requestContract([user('What is the weather in Lorena TX?'),user('Search the web for Salem MA weather.')]).query,'Salem MA weather');
});
test('unrelated places and product identifiers cannot pass on shared generic words',()=>{
 const pairs=[['weather Lorena TX today','Arlington TX weather today'],['weather Salem MA','Salem OR weather'],['ThinkPad T14 specifications','ThinkPad T16 specifications'],['Acme ZX-42 manual','Acme ZX-43 manual']];
 for(const [query,title] of pairs){assert.equal(relevance(query,{title}).passed,false);assert.equal(relevance(query,{title:query}).passed,true);}
 assert.equal(relevance('MDN localStorage setItem',{title:'MDN Web Docs home'}).passed,false);
});
test('fallback queries preserve every keyword, and grammar cannot choose another subject',()=>{
 const query=searchQuery('What is the weather like in lorena tx today?'),plans=searchAttempts(query,'duckduckgo');
 assert.equal(plans.at(-1).query,'lorena tx today weather');assert.ok(plans.every(p=>relevance(query,{title:p.query}).passed));
 const g=buildDispatchGrammar({browserStage:'search',searchQuery:query,allowAnswer:false,allowBlocked:false});assert.ok(g.includes('lorena tx today'));assert.ok(!g.includes('blocked ::='));assert.throws(()=>decodeDispatch('{"blocked":"No browser"}',{allowBlocked:false}),/before attempting/);
});
test('wrong-subject search results cannot satisfy a conversational follow-up',()=>{
 const c=requestContract([user('What is the weather in lorena tx today?'),user('can you search the web for it?')]);
 const action={status:'complete',body:{name:'shell',arguments:{program:'tom-browser',args:[]}},result:{exitCode:0,page:{httpStatus:200,query:'weather Lorena TX today',results:[{title:'Arlington TX weather today',url:'https://example.test/arlington'}]}}};
 assert.equal(evidenceState(c,[action]).searches.length,0);assert.equal(evidenceState(c,[action]).canAnswer,false);
});
test('a model-initiated search becomes evidence-gated even without explicit search wording',()=>{
 const c=requestContract([user('Who leads Acme?'),{role:'assistant',tool_calls:[{function:{name:'shell',arguments:JSON.stringify({program:'tom-browser',args:['--action','search','--query','Acme leadership']})}}]}]);assert.equal(c.web,true);assert.equal(c.requireSearch,true);assert.equal(c.searchAttempted,true);assert.equal(evidenceState(c,[]).canAnswer,false);
});
test('memory help describes actual free RAM, shared context and unqualified limits',()=>{
 const state={context:4096,contextLimit:4096,modelIdentity:'Gemma 4 E2B',machine:{availableGiB:8},qualification:{report:{passed:false,contexts:[]}}},text=memoryExplanation(state);
 assert.match(text.memory,/8 GB/);assert.match(text.memory,/does not use all/);assert.match(text.context,/share 4,096 tokens/);assert.match(text.range,/passing local check is still needed/);assert.match(text.model,/not a frontier model/);
 state.modelIdentity='Gemma 4 12B';assert.ok(!memoryExplanation(state).model.includes('E2B'));state.qualification.report={passed:true,contexts:[4096]};assert.match(memoryExplanation(state).range,/locally tested/);
});
test('a supporting documentation search does not replace a file-building task with a research task',()=>{
 const c=requestContract([user('Create chart.html with an interactive chart.'),{role:'assistant',tool_calls:[{function:{name:'shell',arguments:JSON.stringify({program:'tom-browser',args:['--action','search','--query','Chart.js documentation']})}}]}]);assert.equal(c.fileWork,true);assert.equal(c.requireSearch,false);assert.equal(evidenceState(c,[]).canAnswer,false);
});
