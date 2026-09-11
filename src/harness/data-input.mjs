import fs from "node:fs/promises";
import path from "node:path";
import {hash} from "../tools.mjs";
export function csv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw Error('Unclosed CSV quote');if(cell||row.length){row.push(cell);rows.push(row);}
  const headers=rows.shift()??[];if(new Set(headers).size!==headers.length)throw Error('Duplicate CSV headers');
  return rows.filter(r=>r.some(Boolean)).map(r=>{if(r.length!==headers.length)throw Error('CSV column count mismatch');return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
export async function calculationInputs(names,cwd){
  const data={},inputs={},root=path.resolve(cwd);
  for(const name of names){
    const file=path.resolve(root,name);
    if(!file.startsWith(root+path.sep))throw Error("Calculation inputs must be inside the task folder.");
    if((await fs.stat(file)).size>1024*1024)throw Error("Calculation input exceeds 1 MiB.");
    const bytes=await fs.readFile(file);inputs[file]=hash(bytes);const text=bytes.toString("utf8").replace(/^\uFEFF/,"");
    data[name]=/\.json$/i.test(name)?JSON.parse(text):/\.csv$/i.test(name)?csv(text):text;
  }
  return {data,inputs};
}
