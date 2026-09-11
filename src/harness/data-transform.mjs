// A reviewed, bounded calculation adapter. It returns bytes to the parent; it
// never writes a destination itself. VM use is not an OS security boundary.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {hash} from '../tools.mjs';
import {calculationInputs} from "./data-input.mjs";

try{
  const request=JSON.parse(process.argv[2]);
  const {data,inputs}=await calculationInputs(request.inputs,request.cwd);
  const moduleSource='(function(data){"use strict";const module={exports:{}};const exports=module.exports;\n'+request.code+'\n;if(typeof module.exports!=="function")throw Error("Export a function with module.exports");return module.exports(data);})';
  const source='JSON.stringify('+(request.format==='module'?moduleSource:'(function(data){"use strict";\n'+request.code+'\n})')+'('+JSON.stringify(data)+'))';
  const serialized=vm.runInNewContext(source,Object.create(null),{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}});
  if(typeof serialized!=='string')throw Error('The calculation must return a JSON-serializable value.');
  if(serialized.length>12000)throw Error('Calculation result exceeds the 12,000-character adapter limit; use a native program for larger output.');
  for(const [file,digest]of Object.entries(inputs))if(hash(await fs.readFile(file))!==digest)throw Error('An input changed during calculation.');
  console.log(JSON.stringify({value:JSON.parse(serialized),inputs}));
}catch(e){console.log(JSON.stringify({error:e.message}));}
