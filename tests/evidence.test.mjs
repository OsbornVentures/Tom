import test from 'node:test';
import assert from 'node:assert/strict';
import {requestContract,evidenceState,verifyCompletion} from '../src/evidence.mjs';
import {relevance} from '../src/relevance.mjs';
const contract=text=>requestContract([{role:'user',content:text}]);
const read=(url,content,status=200)=>({status:'complete',body:{name:'shell',arguments:{program:'tom-browser',args:['--action','read','--url',url]}},result:{exitCode:0,output:JSON.stringify({url,content,httpStatus:status,title:'MDN'})}});
const search={status:'complete',body:{name:'shell',arguments:{program:'tom-browser',args:[]}},result:{exitCode:0,output:JSON.stringify({httpStatus:200,query:'localStorage setItem MDN',results:[{url:'https://example.test/storage',title:'localStorage setItem'}]})}};
test('unrelated search pages cannot satisfy research evidence',()=>{
 const c=contract('Search the web for MDN localStorage setItem.');
 assert.equal(relevance('MDN localStorage setItem',{title:'MDN Web Docs',content:'The home of general web documentation.'}).passed,false);
 const e=evidenceState(c,[search,read('https://example.test/home','MDN Web Docs. General web documentation.'.repeat(2))]);assert.equal(e.reads.length,0);assert.equal(e.canAnswer,false);
});
test('successful relevant reads permit an answer but invented citations are rejected',async()=>{
 const c=contract('Search the web for MDN localStorage setItem.'),actions=[search,read('https://example.test/a','localStorage setItem saves strings. '.repeat(3)),read('https://example.test/b','localStorage setItem with arrays. '.repeat(3))],e=evidenceState(c,actions);
 assert.equal(e.canAnswer,true);assert.equal((await verifyCompletion(c,e,'See [source](https://invented.test/a).')).passed,false);assert.equal((await verifyCompletion(c,e,'See [source](https://example.test/a).')).passed,true);
 assert.equal((await verifyCompletion(c,e,'**Source: https://example.test/a** and `https://example.test/b`')).passed,true);
});
test('requested source reads survive task compaction and cannot be skipped before completion',()=>{
 const c=contract('Read brief-1.txt, brief-2.txt and brief-3.txt. Create index.html.');assert.deepEqual(c.sourceFiles,['brief-1.txt','brief-2.txt','brief-3.txt']);
 const a={status:'complete',body:{name:'shell',arguments:{program:'cat',args:['brief-1.txt']}},result:{exitCode:0,output:'source data'}};assert.deepEqual(evidenceState(c,[a]).unreadFiles,['brief-2.txt','brief-3.txt']);assert.deepEqual(contract('Read https://example.test/index.html.').sourceFiles,[]);
});
test('a redirect retains its requested alias and unread failures remain unmet',()=>{
 const c=contract('Read https://example.test/redirect.'),a=read('https://example.test/redirect','A real source with useful factual content. '.repeat(3));a.result.output=JSON.stringify({httpStatus:200,url:'https://example.test/canonical',content:'Actual page facts. '.repeat(4)});
 const e=evidenceState(c,[a]);assert.equal(e.canAnswer,true);assert.ok(e.citableUrls.includes('https://example.test/redirect'));assert.equal(evidenceState(c,[read('https://example.test/redirect','Not found. '.repeat(9),404)]).canAnswer,false);
});
test('HTML filenames trigger inspection, while an explicit do-not-open request is respected',()=>{
 assert.equal(contract('Create index.html with a heading.').inspectHtml,true);
 assert.equal(contract('Create index.html but do not open it.').inspectHtml,false);
});
test('exhausted search links permit further research instead of inventing a URL',()=>{
 const c=contract('Search the web for MDN localStorage setItem.'),e=evidenceState(c,[search,read('https://example.test/storage','localStorage setItem saves strings. '.repeat(3))]);assert.equal(e.browserStage,'search');assert.equal(e.canAnswer,false);
});
test('a repaired file supersedes its previous failed version; an oversized deliverable cannot complete',()=>{
 const c=contract('Create index.html under 3500 characters.'),write=(passed,characters)=>({status:'complete',body:{name:'write'},result:{path:'C:/test/index.html',verified:true,browserCheck:{passed},characters}});
 const old=write(false,4300),fixed=write(true,2800),e=evidenceState(c,[old,fixed]);assert.equal(e.canAnswer,true);assert.equal(e.writes.length,1);assert.equal(e.writes[0],fixed);assert.equal(evidenceState(c,[write(true,3500)]).canAnswer,false);
});
