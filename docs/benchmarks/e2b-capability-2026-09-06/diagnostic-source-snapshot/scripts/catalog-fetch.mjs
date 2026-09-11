import fs from 'node:fs/promises';
const models=[['E4B','gemma-4-e4b',2],['12B','gemma-4-12b',6],['26B-A4B','gemma-4-26b-a4b',3.5],['31B','gemma-4-31b',15.5]],result=[];
for(const [variant,id,workRatio] of models){const repo=`google/gemma-4-${variant}-it-qat-q4_0-gguf`;try{
 const r=await fetch('https://huggingface.co/api/models/'+repo+'?blobs=true');if(!r.ok)throw new Error('HTTP '+r.status);const data=await r.json();await fs.writeFile('reference/v03/'+id+'.json',JSON.stringify(data,null,2));
 const files=data.siblings.filter(f=>f.rfilename.endsWith('.gguf')).map(f=>({filename:f.rfilename,bytes:f.lfs?.size??f.size,sha256:f.lfs?.sha256}));const model=files.find(f=>!/mmproj/i.test(f.filename)),vision=files.find(f=>/mmproj/i.test(f.filename));
 if(!model?.sha256||!vision?.sha256)throw new Error('A pinned model/projector pair is unavailable.');result.push({id,name:'Gemma 4 '+variant.replace('-',' '),repo,revision:data.sha,workRatio,model:{...model,path:'models/'+model.filename},vision:{...vision,path:'models/'+vision.filename,modelRevision:data.sha},minAvailableGiB:Math.ceil((model.bytes+vision.bytes)/1073741824+2),source:'https://huggingface.co/'+repo});console.log(repo,model.bytes+vision.bytes,'bytes');
 }catch(e){result.push({id,name:'Gemma 4 '+variant,workRatio,unavailable:e.message});console.log(repo,e.message);}}
await fs.writeFile('config/model-catalog.json',JSON.stringify({version:1,checked:new Date().toISOString(),models:result},null,2));
