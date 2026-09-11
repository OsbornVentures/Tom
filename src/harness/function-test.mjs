// Bounded function examples in a separate process. VM isolation is defense in
// depth, not an OS sandbox; this adapter still follows execution review.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {hash} from '../tools.mjs';
const input=JSON.parse(process.argv[2]),root=path.resolve(input.cwd),entry=path.resolve(root,input.path),modules={},inputs={};
async function load(file){
  if(Object.hasOwn(modules,file))return;
  if(!file.startsWith(root+path.sep)||!/\.[cm]?js$/i.test(file)||Object.keys(modules).length>=20)throw Error('Only local JavaScript fixture imports within the task folder are supported.');
  if((await fs.stat(file)).size>262144)throw Error('Function file exceeds the 256 KiB test limit.');const bytes=await fs.readFile(file);
  inputs[file]=hash(bytes);const code=bytes.toString('utf8');modules[file]={code,imports:{}};
  for(const m of code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)){
    if(!m[1].startsWith('.'))throw Error('Use a reviewed native test command for external module imports.');
    const target=path.resolve(path.dirname(file),m[1]);modules[file].imports[m[1]]=target;await load(target);
  }
}
try{
  await load(entry);
  const definitions=Object.entries(modules).map(([file,m])=>JSON.stringify(file)+':{imports:'+JSON.stringify(m.imports)+',run:function(module,exports,require){\n'+m.code+'\n}}').join(',');
  const results=input.cases.map((c,index)=>{
    try{
      const script='(function(){const modules={'+definitions+'};const cache=Object.create(null);function load(name){if(!Object.hasOwn(modules,name))throw Error("Unsupported import");if(cache[name])return cache[name].exports;const m={exports:{}};cache[name]=m;modules[name].run(m,m.exports,n=>load(modules[name].imports[n]));return m.exports;}const fn=load('+JSON.stringify(entry)+');if(typeof fn!=="function")throw Error("module.exports must be a function");const args='+JSON.stringify(c.args)+';const before=JSON.stringify(args);const value=fn(...args);return JSON.stringify({value,unchanged:before===JSON.stringify(args)});})()';
      const actual=JSON.parse(vm.runInNewContext(script,Object.create(null),{timeout:750,contextCodeGeneration:{strings:false,wasm:false}}));
      const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
      const noValue=!Object.hasOwn(actual,'value');
      return {index,args:c.args,passed:!noValue&&(input.allowMutation||actual.unchanged)&&JSON.stringify(canonical(actual.value))===JSON.stringify(canonical(c.expected)),...actual,expected:c.expected,...(noValue?{error:'Function returned undefined or a non-JSON value. Return the result from the exported function.'}:{})};
    }catch(e){return {index,args:c.args,expected:c.expected,passed:false,error:e.message};}
  });
  let unchanged=true;for(const [file,digest]of Object.entries(inputs))if(hash(await fs.readFile(file))!==digest)unchanged=false;
  console.log(JSON.stringify({kind:'test',path:entry,inputs,passed:results.length>0&&results.every(r=>r.passed)&&unchanged,results,scope:'Model/user-supplied examples, including input immutability; not independent hidden tests',observedAt:new Date().toISOString()}));
}catch(e){console.log(JSON.stringify({kind:'test',path:entry,inputs,passed:false,detail:e.message}));}
