// Read bounded GGUF metadata without loading tensor weights.
import fs from 'node:fs/promises';
for(const file of process.argv.slice(2)){
  const handle=await fs.open(file,'r'),buffer=Buffer.alloc(16*1024*1024);let bytes;
  try{({bytesRead:bytes}=await handle.read(buffer,0,buffer.length,0));}finally{await handle.close();}
  let offset=0;const take=n=>{if(offset+n>bytes)throw Error('Metadata exceeds the 16 MiB inspection limit.');const p=offset;offset+=n;return p;};
  const u32=()=>buffer.readUInt32LE(take(4)),u64=()=>Number(buffer.readBigUInt64LE(take(8)));
  const string=keep=>{const n=u64(),p=take(n);return keep?buffer.toString('utf8',p,p+n):undefined;};
  function value(type,keep=true){
    if(type===8)return string(keep);
    if(type===9){const element=u32(),count=u64();if(count>10000000)throw Error('Unbounded metadata array');for(let i=0;i<count;i++)value(element,false);return {arrayCount:count};}
    const types={0:[1,'readUInt8'],1:[1,'readInt8'],2:[2,'readUInt16LE'],3:[2,'readInt16LE'],4:[4,'readUInt32LE'],5:[4,'readInt32LE'],6:[4,'readFloatLE'],7:[1,'readUInt8'],10:[8,'readBigUInt64LE'],11:[8,'readBigInt64LE'],12:[8,'readDoubleLE']},t=types[type];
    if(!t)throw Error('Unknown GGUF metadata type '+type);const p=take(t[0]);return keep?String(buffer[t[1]](p)):undefined;
  }
  if(buffer.toString('ascii',take(4),4)!=='GGUF')throw Error('Not GGUF');const version=u32(),tensors=u64(),count=u64(),metadata={};
  for(let i=0;i<count;i++){const key=string(true),type=u32(),keep=/^(general\.|quantize\.)/.test(key),v=value(type,keep);if(keep)metadata[key]=v;}
  console.log(JSON.stringify({file,version,tensors,metadata},null,2));
}
