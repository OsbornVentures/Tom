export const releasesUrl='https://github.com/OsbornVentures/Tom/releases';
const endpoint='https://api.github.com/repos/OsbornVentures/Tom/releases?per_page=100';
export function releaseVersion(tag){
 const m=typeof tag==='string'&&/^v?(\d+)\.(\d+)\.(\d+)(?:-beta(?:[.-](\d+))?)?$/.exec(tag);
 return m?{numbers:m.slice(1,4).map(Number),beta:tag.includes('-beta'),revision:Number(m[4]??0)}:null;
}
export function compareVersions(a,b){
 const left=releaseVersion(a),right=releaseVersion(b);if(!left||!right)throw Error('Unsupported release version.');
 for(let i=0;i<3;i++)if(left.numbers[i]!==right.numbers[i])return Math.sign(left.numbers[i]-right.numbers[i]);
 if(left.beta!==right.beta)return left.beta?-1:1;
 return Math.sign(left.revision-right.revision);
}
export function selectRelease(releases,current,{beta=true}={}){
 if(!Array.isArray(releases)||!releaseVersion(current))throw Error('GitHub returned an unreadable release list.');
 const eligible=releases.filter(r=>r&&!r.draft&&releaseVersion(r.tag_name)&&(beta||!r.prerelease&&!releaseVersion(r.tag_name).beta));
 eligible.sort((a,b)=>compareVersions(b.tag_name,a.tag_name));const release=eligible[0];
 if(!release)return {status:'unavailable',current,message:'No published Tom release is available yet.',url:releasesUrl};
 const comparison=compareVersions(release.tag_name,current);
 return {status:comparison>0?'available':comparison===0?'current':'ahead',current,latest:release.tag_name,url:releasesUrl+'/tag/'+encodeURIComponent(release.tag_name),published:release.published_at??null,message:comparison>0?'A newer Tom package is available.':comparison===0?'You have the current Tom release.':'This build is newer than the published release.'};
}
export async function checkUpdates(product,request=fetch){
 const current=product.version+(product.channel==='beta'?'-beta':'');
 try{
  const response=await request(endpoint,{headers:{Accept:'application/vnd.github+json','User-Agent':'Tom/'+product.version,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Error(response.status===403||response.status===429?'GitHub’s request limit was reached. Try again later.':'The release list could not be reached.');
  const bytes=await response.text();if(bytes.length>1500000)throw Error('The release list was unexpectedly large.');
  return {...selectRelease(JSON.parse(bytes),current,{beta:product.channel==='beta'}),checkedAt:new Date().toISOString()};
 }catch(e){return {status:'unavailable',current,url:releasesUrl,message:'Unable to check for updates. Check your connection or open GitHub releases.',checkedAt:new Date().toISOString()};}
}
