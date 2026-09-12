import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker,{RELEASE,parseRange,refresh,refreshIfDue,statistics} from './worker.mjs';

function database(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 const prepare=(sql,args=[])=>({bind:(...values)=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),run:async()=>({meta:db.prepare(sql).run(...args)})});
 return {prepare,batch:async statements=>Promise.all(statements.map(s=>s.run())),close:()=>db.close()};
}
function fixture(){
 const STATS=database(),pending=[];
 const metadata={size:RELEASE.size,customMetadata:{sha256:RELEASE.sha256}};
 const env={STATS,RELEASES:{head:async()=>metadata,get:async()=>({...metadata,body:new Uint8Array([1,2,3])})}};
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
 await Promise.all(f.pending);assert.equal((await statistics(f.env)).fullDownloadStarts,1);
 }finally{f.env.STATS.close();}
});
test('incorrect object size or hash metadata cannot be served as a verified release',async()=>{
 for(const change of [m=>m.size--,m=>m.customMetadata.sha256='0'.repeat(64)]){
 const f=fixture();try{change(f.metadata);assert.equal((await worker.fetch(new Request('https://tom.osbornventures.com/download'),f.env,f.ctx)).status,503);assert.equal(f.pending.length,0);}finally{f.env.STATS.close();}}
});
test('overlapping GitHub windows replace daily values rather than doubling totals',async()=>{
 const db=database();let today=2;
 const env={STATS:db,GITHUB_STATS_TOKEN:'test-only-placeholder'};
 const fake=async url=>Response.json(url.includes('/traffic/clones')?{count:3+today,uniques:2,clones:[{timestamp:'2026-09-10T00:00:00Z',count:3,uniques:1},{timestamp:'2026-09-11T00:00:00Z',count:today,uniques:1}]}:url.includes('/releases')?[{assets:[{name:'Tom-0.5.2-Network-Setup.exe',download_count:7},{name:'SHA256SUMS.txt',download_count:400}]}]:{stargazers_count:4,forks_count:1});
 try{await refresh(env,fake);today=5;await refresh(env,fake);const stats=await statistics(env);assert.equal(stats.clones.totalTracked,8);assert.equal(stats.networkDownloads,7);assert.equal(stats.clones.trackedSince,'2026-09-10');assert.equal(stats.stale,false);await assert.rejects(refresh(env,async()=>new Response('',{status:403})));assert.equal((await statistics(env)).clones.totalTracked,8);}finally{db.close();}
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
