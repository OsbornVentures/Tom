// Pinned comparison packages. Downloads do not activate or replace the user's model.
import fs from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const repo='ggml-org/gemma-4-E2B-it-GGUF',revision='b4243c156154b6dca9324415f8c7ccc098b4aed1';
const files=[
  {name:'gemma-4-E2B-it-Q8_0.gguf',bytes:4967497152,sha256:'996d08777aadc6bfd3c7375ef70ba25a0f55240075860754fdb18d6d860aa63a'},
  {name:'gemma-4-E2B-it-Q4_0.gguf',bytes:2841481184,sha256:'8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52'},
  {name:'mmproj-gemma-4-E2B-it-Q8_0.gguf',bytes:557368064,sha256:'9406f99c16d68cda4f1f0552192dcc99021ea1fc6d2fd50b1dc3ccf30d04b292'}
];
async function digest(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
for(const file of files){
  const target=path.join(root,'models',file.name),temporary=target+'.download';
  const current=await fs.stat(target).catch(()=>null);
  if(current){if(current.size!==file.bytes||await digest(target)!==file.sha256)throw Error('Existing package does not match: '+file.name);continue;}
  console.log('Downloading',file.name);
  const r=await fetch('https://huggingface.co/'+repo+'/resolve/'+revision+'/'+file.name,{signal:AbortSignal.timeout(1800000)});
  if(!r.ok)throw Error('Download HTTP '+r.status);
  await pipeline(r.body,createWriteStream(temporary,{flags:'w'}));
  if((await fs.stat(temporary)).size!==file.bytes||await digest(temporary)!==file.sha256)throw Error('Package checksum failed: '+file.name);
  await fs.rename(temporary,target);console.log('Verified',file.name);
}
const base=JSON.parse(await fs.readFile(path.join(root,'config/runtime.json'),'utf8'));
for(const precision of ['Q8_0','Q4_0']){
  const f=files.find(f=>f.name==='gemma-4-E2B-it-'+precision+'.gguf'),projector=files[2];
  const config={...base,model:{id:'gemma-4-e2b-'+precision.toLowerCase(),name:'Gemma 4 E2B '+precision,repo,revision,path:'models/'+f.name,bytes:f.bytes,sha256:f.sha256,quantization:precision,training:'instruction-tuned GGUF conversion; exact QAT/non-QAT source lineage not independently confirmed'},vision:{path:'models/'+projector.name,bytes:projector.bytes,sha256:projector.sha256,modelRevision:revision},minimumLoadGiB:precision==='Q8_0'?6:4};
  await fs.writeFile(path.join(root,'.state','e2b-'+precision.toLowerCase()+'.json'),JSON.stringify(config,null,2)+'\n');
}
console.log('Comparison profiles ready; active application settings unchanged.');
