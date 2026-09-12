import {page} from './site.mjs';

export const RELEASE = Object.freeze({
  version:'0.5.2-beta.1',
  filename:'Tom-0.5.2-Offline-Setup.exe',
  size:3709163624,
  sha256:'99877c34a53babde60e04a948cb8ba40980dce40e9a890c3ded271fb08f4a252',
  network:'https://github.com/OsbornVentures/Tom/releases/download/v0.5.2-beta.1/Tom-0.5.2-Network-Setup.exe',
  github:'https://github.com/OsbornVentures/Tom',
});
const KEY=`releases/${RELEASE.version}/${RELEASE.filename}`;
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...security,'Content-Type':'application/json','Cache-Control':'public, max-age=300'}});

export function parseRange(value,size) {
  if(!value)return null;
  const m=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!m||(!m[1]&&!m[2]))throw new RangeError('Invalid byte range');
  const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
  const end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||(!m[1]&&Number(m[2])===0))throw new RangeError('Unsatisfiable byte range');
  return {offset:start,length:end-start+1};
}

export function shouldCount(request,range) {
  return request.method==='GET'&&(!range||range.offset===0)&&
    !/prefetch|prerender/i.test(`${request.headers.get('Purpose')||''} ${request.headers.get('Sec-Purpose')||''}`);
}

export function countCompletedStream(body,expectedBytes,onComplete,waitUntil) {
  // Native piping preserves Content-Length and avoids executing JS for every EXE chunk.
  const {readable,writable}=new FixedLengthStream(expectedBytes);
  waitUntil(body.pipeTo(writable).then(onComplete).catch(()=>{}));
  return readable;
}

async function download(request,env,ctx) {
  const etag=`"sha256-${RELEASE.sha256}"`;
  const headers=new Headers({...security,'Content-Type':'application/octet-stream',
    'Content-Disposition':`attachment; filename="${RELEASE.filename}"`,
    'Accept-Ranges':'bytes','ETag':etag,'X-Checksum-SHA256':RELEASE.sha256,
    'Cache-Control':'private, no-cache, no-transform'});
  if(request.headers.get('If-None-Match')?.split(',').map(s=>s.trim().replace(/^W\//,'')).includes(etag))return new Response(null,{status:304,headers});
  let range;
  try {range=parseRange(!request.headers.has('If-Range')||request.headers.get('If-Range')===etag?request.headers.get('Range'):null,RELEASE.size);}
  catch {headers.set('Content-Range',`bytes */${RELEASE.size}`);return new Response(null,{status:416,headers});}
  const object=request.method==='HEAD'?await env.RELEASES.head(KEY):await env.RELEASES.get(KEY,range?{range}:{});
  if(!object||object.size!==RELEASE.size||object.customMetadata?.sha256!==RELEASE.sha256)return json({error:'The installer is temporarily unavailable. Please use the network installer on GitHub.'},503);
  headers.set('Content-Length',String(range?.length??RELEASE.size));
  if(range)headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${RELEASE.size}`);
  if(shouldCount(request,range))ctx.waitUntil(env.STATS.prepare("INSERT INTO counters(name,value) VALUES('full_download_starts',1) ON CONFLICT(name) DO UPDATE SET value=value+1").run().catch(()=>{}));
  let body=request.method==='HEAD'?null:object.body;
  if(body&&shouldCount(request,range)&&(!range||range.length===RELEASE.size))body=countCompletedStream(body,RELEASE.size,()=>env.STATS.prepare("INSERT INTO counters(name,value) VALUES('full_downloads',1) ON CONFLICT(name) DO UPDATE SET value=value+1").run(),p=>ctx.waitUntil(p));
  return new Response(body,{status:range?206:200,headers});
}

export async function statistics(env) {
  const [snapshot,count]=await Promise.all([
    env.STATS.prepare("SELECT data,updated_at FROM snapshots WHERE name='github'").first(),
    env.STATS.prepare("SELECT value FROM counters WHERE name='full_downloads'").first(),
  ]);
  const data=snapshot?JSON.parse(snapshot.data):{};
  const repositoryDownloads=data.githubDownloads??data.networkDownloads;
  return {downloads:Number.isSafeInteger(repositoryDownloads)?(count?.value??0)+repositoryDownloads:null,
    clones:data.clones?.totalTracked??null,clonesTrackedSince:data.clones?.trackedSince??null,
    updatedAt:snapshot?.updated_at??null,refreshEveryHours:6,
    stale:!snapshot||Date.now()-Date.parse(snapshot.updated_at)>7*3600000,
    definitions:{downloads:'Cumulative installer downloads across editions and releases. Hosted full EXEs count after a complete server-side transfer; GitHub-hosted installers use GitHub asset download counts. This is not a count of installs or unique people. Separate resumed ranges cannot be matched to a completed download without tracking identifiers and are not added.',
      clones:'Cumulative GitHub clone events retained since tracking began. Daily history is kept after it leaves GitHub’s 14-day API window. Earlier unavailable history cannot be reconstructed.'}};
}

export async function refresh(env,fetcher=fetch) {
  const headers={'User-Agent':'Tom-release-statistics','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'};
  if(env.GITHUB_STATS_TOKEN)headers.Authorization=`Bearer ${env.GITHUB_STATS_TOKEN}`;
  const get=async(path)=>{const r=await fetcher(`https://api.github.com/repos/OsbornVentures/Tom${path}`,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`GitHub statistics unavailable (${r.status})`);return r.json();};
  const repo=await get('');
  const assets=[];
  for(let p=1;p<=20;p++) {
    const releases=await get(`/releases?per_page=100&page=${p}`);
    for(const release of releases)for(const asset of release.assets??[]) {
      const kind=/^Tom-.+-(Network|Offline)-Setup\.exe$/.exec(asset.name)?.[1]?.toLowerCase();
      if(kind){if(!Number.isSafeInteger(asset.id)||!Number.isSafeInteger(asset.download_count)||asset.download_count<0)throw Error('Invalid GitHub download statistics');assets.push({id:asset.id,kind:kind==='offline'?'full':'network',count:asset.download_count});}
    }
    if(releases.length<100)break;
    if(p===20)throw Error('Release pagination limit reached');
  }
  if(assets.length)await env.STATS.batch(assets.map(a=>env.STATS.prepare('INSERT INTO github_downloads(asset_id,kind,count,observed_at) VALUES(?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET count=MAX(count,excluded.count),observed_at=excluded.observed_at').bind(a.id,a.kind,a.count,new Date().toISOString())));
  const downloads=await env.STATS.prepare("SELECT COALESCE(SUM(count),0) AS total,COALESCE(SUM(CASE WHEN kind='network' THEN count ELSE 0 END),0) AS network,COALESCE(SUM(CASE WHEN kind='full' THEN count ELSE 0 END),0) AS full FROM github_downloads").first();
  let clones=null;
  if(env.GITHUB_STATS_TOKEN) {
    const traffic=await get('/traffic/clones?per=day');
    const daily=traffic.clones??[];
    for(const day of daily) {
      if(!/^\d{4}-\d{2}-\d{2}T/.test(day.timestamp)||!Number.isSafeInteger(day.count)||day.count<0||!Number.isSafeInteger(day.uniques)||day.uniques<0)throw Error('Invalid GitHub daily statistics');
    }
    if(daily.length)await env.STATS.batch(daily.map(day=>env.STATS.prepare('INSERT INTO clone_days(day,count,uniques) VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET count=excluded.count,uniques=excluded.uniques').bind(day.timestamp.slice(0,10),day.count,day.uniques)));
    const totals=await env.STATS.prepare('SELECT COALESCE(SUM(count),0) AS total,MIN(day) AS since FROM clone_days').first();
    clones={last14Days:traffic.count,uniqueLast14Days:traffic.uniques,totalTracked:totals.total,trackedSince:totals.since};
  }
  const data={stars:repo.stargazers_count,forks:repo.forks_count,githubDownloads:downloads.total,networkDownloads:downloads.network,githubFullDownloads:downloads.full,clones};
  await env.STATS.prepare("INSERT INTO snapshots(name,data,updated_at) VALUES('github',?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").bind(JSON.stringify(data),new Date().toISOString()).run();
  return data;
}

// A public statistics request can repair a missed cron or initialize a new deployment.
// Atomic D1 admission limits retries to one per ten minutes across Worker instances.
export async function refreshIfDue(env,fetcher=fetch,now=Date.now(),scheduled=false) {
  const snapshot=await env.STATS.prepare("SELECT updated_at FROM snapshots WHERE name='github'").first();
  if(!scheduled&&snapshot&&now-Date.parse(snapshot.updated_at)<6*3600000)return false;
  const admitted=await env.STATS.prepare("INSERT INTO refresh_locks(name,attempted_at) VALUES('github',?) ON CONFLICT(name) DO UPDATE SET attempted_at=excluded.attempted_at WHERE attempted_at<?").bind(now,now-600000).run();
  if(!admitted.meta?.changes)return false;
  await refresh(env,fetcher);
  return true;
}

function badge(label,value,color='10b981') {
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const left=label.length*7+16,right=String(value).length*7+18,width=left+right;
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" role="img" aria-label="${esc(label)}: ${esc(value)}"><rect width="${width}" height="24" rx="5" fill="#263a37"/><path d="M${left} 0h${right-5}q5 0 5 5v14q0 5-5 5h-${right-5}z" fill="#${color}"/><g fill="white" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11"><text x="${left/2}" y="16">${esc(label)}</text><text x="${left+right/2}" y="16" fill="#071712">${esc(value)}</text></g></svg>`,{headers:{...security,'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=21600'}});
}

export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD',...security}});
    try {
      if(url.pathname==='/'||url.pathname==='/index.html')return new Response(request.method==='HEAD'?null:page(RELEASE),{headers:{...security,'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
      if(['/download',`/${RELEASE.filename}`,`/${KEY}`].includes(url.pathname))return await download(request,env,ctx);
      if(url.pathname==='/network')return Response.redirect(RELEASE.network,302);
      if(url.pathname==='/SHA256SUMS.txt')return new Response(`${RELEASE.sha256}  ${RELEASE.filename}\n63d52ca4157d678c38d6b9e5f76db4c9efc3cf91c5314d1771af56a91ab17a67  Tom-0.5.2-Network-Setup.exe\n`,{headers:{...security,'Content-Type':'text/plain','Cache-Control':'public, max-age=300'}});
      if(url.pathname==='/stats.json') {
        ctx.waitUntil(refreshIfDue(env).catch(()=>{}));
        return json(await statistics(env));
      }
      if(['/badges/full-downloads.svg','/badges/network-downloads.svg'].includes(url.pathname))return Response.redirect(url.origin+'/badges/downloads.svg',301);
      if(['/badges/downloads.svg','/badges/clones.svg'].includes(url.pathname)) {
        const s=await statistics(env);
        const values={downloads:['Downloads',s.downloads??'pending'],clones:['Clones',s.clones??'pending']};
        const [label,value]=values[url.pathname.split('/').pop().replace('.svg','')];
        return badge(label,s.stale?`${value} (stale)`:value);
      }
      if(['/assets/tom-ready.gif','/assets/tom-nine-states.png','/assets/tom-help-demo.png','/assets/gemma-4.png'].includes(url.pathname)) {
        const obj=await env.RELEASES.get(url.pathname.slice(1));if(!obj)return new Response('Not found',{status:404});
        const h=new Headers(security);obj.writeHttpMetadata(h);h.set('Cache-Control','public, max-age=86400');return new Response(request.method==='HEAD'?null:obj.body,{headers:h});
      }
      if(url.pathname==='/robots.txt')return new Response('User-agent: *\nDisallow: /download\nDisallow: /releases/\nDisallow: /Tom-\n',{headers:{'Content-Type':'text/plain'}});
      return new Response('Not found',{status:404,headers:security});
    } catch {return json({error:'Temporarily unavailable. The network installer remains available on GitHub.'},503);}
  },
  async scheduled(event,env,ctx) {ctx.waitUntil(refreshIfDue(env,fetch,Date.now(),true));},
};
