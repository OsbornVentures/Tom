import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker,{RELEASE,countCompletedStream,parseRange,refresh,refreshIfDue,statistics} from './worker.mjs';

// Model Cloudflare's native byte-length contract for Node; production uses FixedLengthStream.
globalThis.FixedLengthStream=class extends TransformStream {
 constructor(expected){let bytes=0;super({transform(chunk,c){bytes+=chunk.byteLength;if(bytes>expected)throw Error('Too many bytes');c.enqueue(chunk);},flush(){if(bytes!==expected)throw Error('Too few bytes');}});}
};

function database(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 const prepare=(sql,args=[])=>({bind:(...values)=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),run:async()=>({meta:db.prepare(sql).run(...args)})});
 return {prepare,batch:async statements=>Promise.all(statements.map(s=>s.run())),close:()=>db.close()};
}
function fixture(){
 const STATS=database(),pending=[];
 const metadata={size:RELEASE.size,customMetadata:{sha256:RELEASE.sha256}};
 const env={STATS,RELEASES:{head:async()=>metadata,get:async()=>({...metadata,body:new Response(new Uint8Array([1,2,3])).body})}};
 return {env,pending,metadata,ctx:{waitUntil:p=>pending.push(p)}};
}
test('resumable ranges handle suffixes, clamping and invalid requests',()=>{
 assert.deepEqual(parseRange('bytes=100-',200),{offset:100,length:100});
 assert.deepEqual(parseRange('bytes=-30',200),{offset:170,length:30});
 assert.deepEqual(parseRange('bytes=0-900',200),{offset:0,length:200});
 for(const range of ['bytes=200-','bytes=10-9','bytes=-0','bytes=','bytes=0-1,3-4','bytes=9007199254740993-'])assert.throws(()=>parseRange(range,200));
});
test('full download, metadata-only checks, resume and conditional requests count correctly',async()=>{
 const f=fixture();
 try {
 const get=opts=>worker.fetch(new Request('https://tom.osbornventures.com/download',opts),f.env,f.ctx);
 const full=await get();assert.equal(full.status,200);assert.equal(full.headers.get('Content-Length'),String(RELEASE.size));assert.equal(full.headers.get('X-Checksum-SHA256'),RELEASE.sha256);
 assert.equal((await get({method:'HEAD'})).body,null);
 const resumed=await get({headers:{Range:'bytes=100-199'}});assert.equal(resumed.status,206);assert.equal(resumed.headers.get('Content-Range'),`bytes 100-199/${RELEASE.size}`);
 assert.equal((await get({headers:{Range:`bytes=${RELEASE.size}-`}})).status,416);
 assert.equal((await get({headers:{'If-None-Match':full.headers.get('ETag')}})).status,304);
 await get({headers:{Purpose:'prefetch'}});
 await assert.rejects(full.arrayBuffer());await Promise.all(f.pending);
 assert.equal((await f.env.STATS.prepare("SELECT value FROM counters WHERE name='full_download_starts'").first()).value,1);
 assert.equal(await f.env.STATS.prepare("SELECT value FROM counters WHERE name='full_downloads'").first(),undefined);
 }finally{f.env.STATS.close();}
});
test('incorrect object size or hash metadata cannot be served as a verified release',async()=>{
 for(const change of [m=>m.size--,m=>m.customMetadata.sha256='0'.repeat(64)]){
 const f=fixture();try{change(f.metadata);assert.equal((await worker.fetch(new Request('https://tom.osbornventures.com/download'),f.env,f.ctx)).status,503);assert.equal(f.pending.length,0);}finally{f.env.STATS.close();}}
});
test('overlapping GitHub windows replace daily values rather than doubling totals',async()=>{
 const db=database();let today=2;
 const env={STATS:db,GITHUB_STATS_TOKEN:'test-only-placeholder'};
 const fake=async url=>Response.json(url.includes('/traffic/clones')?{count:3+today,uniques:2,clones:[{timestamp:'2026-09-10T00:00:00Z',count:3,uniques:1},{timestamp:'2026-09-11T00:00:00Z',count:today,uniques:1}]}:url.includes('/releases')?[{assets:[{id:1,name:'Tom-0.5.2-Network-Setup.exe',download_count:7},{id:2,name:'SHA256SUMS.txt',download_count:400}]}]:{stargazers_count:4,forks_count:1});
 try{await refresh(env,fake);today=5;await refresh(env,fake);const stats=await statistics(env);assert.equal(stats.clones,8);assert.equal(stats.downloads,7);assert.equal(stats.clonesTrackedSince,'2026-09-10');assert.equal(stats.stale,false);await assert.rejects(refresh(env,async()=>new Response('',{status:403})));assert.equal((await statistics(env)).clones,8);}finally{db.close();}
});
test('only allowlisted download and asset paths are accessible',async()=>{
 const f=fixture();try{for(const path of ['/Sample.env.txt','/.env','/assets/secret.txt','/releases/unknown.exe'])assert.equal((await worker.fetch(new Request('https://tom.osbornventures.com'+path),f.env,f.ctx)).status,404);assert.equal((await worker.fetch(new Request('https://tom.osbornventures.com/download',{method:'POST'}),f.env,f.ctx)).status,405);}finally{f.env.STATS.close();}
});

test('concurrent refresh requests share a retry lock and preserve old data on failure',async()=>{
 const STATS=database(),env={STATS};let requests=0;
 const failure=async()=>{requests++;return new Response('',{status:503});};
 try {
  const now=Date.now();
  const outcomes=await Promise.allSettled(Array.from({length:10},()=>refreshIfDue(env,failure,now)));
  assert.equal(requests,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.equal(await refreshIfDue(env,failure,now+300000),false);
  await assert.rejects(refreshIfDue(env,failure,now+600001));assert.equal(requests,2);
  await STATS.prepare("INSERT INTO snapshots(name,data,updated_at) VALUES('github','{}',?)").bind(new Date(now).toISOString()).run();
  assert.equal(await refreshIfDue(env,failure,now+700000),false);
 }finally{STATS.close();}
});

test('scheduled refresh runs on its six-hour boundary even after an off-cycle initial refresh',async()=>{
 const STATS=database(),env={STATS};let requests=0;const now=Date.now();
 const fake=async url=>{requests++;return Response.json(url.includes('/releases')?[]:{stargazers_count:2,forks_count:0});};
 try {
  await STATS.prepare("INSERT INTO snapshots(name,data,updated_at) VALUES('github','{}',?)").bind(new Date(now-4*3600000).toISOString()).run();
  assert.equal(await refreshIfDue(env,fake,now),false);
  assert.equal(await refreshIfDue(env,fake,now,true),true);assert.equal(requests,2);
  assert.equal(await refreshIfDue(env,fake,now+1000,true),false);
 }finally{STATS.close();}
});

test('completed transfer counter excludes cancellations, truncation and stream errors',async()=>{
 let completed=0;const pending=[];
 const wrap=(body,size)=>countCompletedStream(body,size,()=>completed++,p=>pending.push(p));
 await new Response(wrap(new Response(new Uint8Array(10)).body,10)).arrayBuffer();
 await Promise.all(pending);
 assert.equal(completed,1);
 await assert.rejects(new Response(wrap(new Response(new Uint8Array(9)).body,10)).arrayBuffer());
 await Promise.all(pending);
 assert.equal(completed,1);
 let cancelled=false;
 const partial=wrap(new ReadableStream({pull(c){c.enqueue(new Uint8Array(2));},cancel(){cancelled=true;}}),10).getReader();
 await partial.read();await partial.cancel();await Promise.all(pending);assert.equal(cancelled,true);assert.equal(completed,1);
 await assert.rejects(new Response(wrap(new ReadableStream({pull(c){c.error(new Error('interrupted'));}}),10)).arrayBuffer());
 await Promise.all(pending);
 assert.equal(completed,1);
});

test('totals retain clone days outside the API window and removed installer assets',async()=>{
 const STATS=database(),env={STATS,GITHUB_STATS_TOKEN:'test-only-placeholder'};
 let assets=[{id:10,name:'Tom-0.5.1-Network-Setup.exe',download_count:7},{id:11,name:'Tom-0.5.1-Offline-Setup.exe',download_count:4}];
 let days=[{timestamp:'2026-09-01T00:00:00Z',count:5,uniques:2}];
 const fake=async url=>Response.json(url.includes('/traffic/clones')?{count:days.reduce((s,d)=>s+d.count,0),uniques:2,clones:days}:url.includes('/releases')?[{assets}]:{stargazers_count:4,forks_count:1});
 try {
  await refresh(env,fake);await refresh(env,fake);assert.equal((await statistics(env)).downloads,11);
  assets=[{id:12,name:'Tom-0.5.2-Network-Setup.exe',download_count:2}];
  days=[{timestamp:'2026-09-20T00:00:00Z',count:3,uniques:1}];
  await refresh(env,fake);await refresh(env,fake);
  await STATS.prepare("INSERT INTO counters(name,value) VALUES('full_downloads',3),('full_download_starts',90)").run();
  const stats=await statistics(env);assert.equal(stats.downloads,16);assert.equal(stats.clones,8);assert.equal(stats.clonesTrackedSince,'2026-09-01');
  assert.deepEqual(Object.keys(stats).sort(),['clones','clonesTrackedSince','definitions','downloads','refreshEveryHours','stale','updatedAt']);
  const privateStats=JSON.parse((await STATS.prepare("SELECT data FROM snapshots WHERE name='github'").first()).data);
  assert.equal(privateStats.networkDownloads,9);assert.equal(privateStats.githubFullDownloads,4);
  assets[0].download_count=1;await refresh(env,fake);assert.equal((await statistics(env)).downloads,16);
  const ctx={waitUntil(){}};
  for(const [path,label] of [['downloads','Downloads'],['clones','Clones']]){
   const r=await worker.fetch(new Request('https://tom.osbornventures.com/badges/'+path+'.svg'),env,ctx);assert.equal(r.status,200);assert.match(await r.text(),new RegExp('aria-label="'+label+': '));
  }
  assert.equal((await worker.fetch(new Request('https://tom.osbornventures.com/badges/stars.svg'),env,ctx)).status,404);
  for(const edition of ['full','network'])assert.equal((await worker.fetch(new Request('https://tom.osbornventures.com/badges/'+edition+'-downloads.svg'),env,ctx)).headers.get('Location'),'https://tom.osbornventures.com/badges/downloads.svg');
 }finally{STATS.close();}
});
