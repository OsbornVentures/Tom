import os from 'node:os';

export const threadLimit=(count=os.availableParallelism())=>Math.max(1,Math.min(8,count-1));
export function normalizeInference(value={}, {threads=os.availableParallelism(),contextLimit=4096}={}) {
  const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {
    context:[2048,4096,6144,8192].includes(v.context)&&v.context<=contextLimit?v.context:4096,
    threads:Number.isInteger(v.threads)&&v.threads>0?Math.min(v.threads,threadLimit(threads)):Math.min(4,threadLimit(threads)),
    idleUnloadMs:[60000,180000,300000,600000].includes(v.idleUnloadMs)?v.idleUnloadMs:300000,
    acceleration:['auto','cpu','vulkan'].includes(v.acceleration)?v.acceleration:'auto',
    kvCache:['auto','f16','q8_0','q4_0'].includes(v.kvCache)?v.kvCache:'auto'
  };
}

// Vendor names do not establish support for a cache kernel. Every attempted
// combination must load and pass the grammar/generation probe on this machine.
export function inferenceProfiles(config,hardware={available:false}) {
  const gpu=config.acceleration!=='cpu'&&hardware.available;
  const cache=['f16','q8_0','q4_0'].includes(config.kvCache)?config.kvCache:'f16';
  const profile=(backend,kv,context=config.context)=>({backend,cacheTypeK:kv,cacheTypeV:kv,flashAttention:kv==='f16'?'off':'on',context,gpuLayers:backend==='cpu'?0:99});
  const profiles=[profile(gpu?'vulkan':'cpu',cache)];
  if(cache!=='f16')profiles.push(profile(gpu?'vulkan':'cpu','f16'));
  if(gpu)profiles.push(profile('cpu','f16'));
  if(config.context>2048)profiles.push(profile('cpu','f16',2048));
  return profiles;
}

export async function tryProfiles(profiles,attempt,{signal,onRecovery=async()=>{}}) {
  let last;
  for(let i=0;i<profiles.length;i++) {
    signal.throwIfAborted();
    try {await attempt(profiles[i]);if(i)await onRecovery(profiles[i],last);return profiles[i];}
    catch(error){signal.throwIfAborted();if(error.noRetry)throw error;last=error;}
  }
  throw last;
}
