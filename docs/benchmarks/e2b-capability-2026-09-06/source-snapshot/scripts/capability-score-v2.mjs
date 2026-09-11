// Corrected scorer: CommonJS may import supplied fixture modules.
// No host require, process, filesystem or dynamic eval is exposed to generated code.
import vm from 'node:vm';
import {evaluate as originalEvaluate} from './capability-cases.mjs';
export const scorerVersion='tom-capability-scorer-v2-fixture-commonjs';
export function evaluate(c,content){
 if(!c.checks)return originalEvaluate(c,content);
 const fixtures=Object.entries(c.files).filter(([name])=>/\.(?:cjs|js)$/.test(name));
 const definitions=fixtures.map(([name,code])=>JSON.stringify('./'+name)+':function(module,exports,require){\n'+code+'\n}').join(',\n');
 const checks=c.checks.map((test,index)=>{try{
  const context=vm.createContext({}, {codeGeneration:{strings:false,wasm:false}});
  const script=`(function(){
   const fixtureModules={${definitions}};const cache=Object.create(null);
   function fixtureRequire(name){
    if(!Object.hasOwn(fixtureModules,name))throw new Error('Import outside supplied fixture modules: '+name);
    if(!Object.hasOwn(cache,name)){const m={exports:{}};cache[name]=m;fixtureModules[name](m,m.exports,fixtureRequire);}return cache[name].exports;
   }
   const target={exports:{}};
   (function(module,exports,require){\n${content}\n})(target,target.exports,fixtureRequire);
   const input=${JSON.stringify(test.input)};const before=JSON.stringify(input);
   const value=target.exports(...input);
   return JSON.stringify({value,unchanged:JSON.stringify(input)===before});
  })()`;
  const actual=JSON.parse(vm.runInContext(script,context,{timeout:750}));return {index,passed:JSON.stringify(actual.value)===JSON.stringify(test.expected)&&actual.unchanged,actual};
 }catch(e){return {index,passed:false,error:e.message};}});
 return {passed:checks.every(c=>c.passed),checks};
}
export function rescore(c,row){const assertions=evaluate(c,row.content);const artifactPassed=assertions.passed&&row.fixturesUnchanged&&!row.extraFiles.length;return {...row,originalArtifactPassed:row.artifactPassed,originalAssertions:row.assertions,scorerVersion,assertions,artifactPassed,completedPassed:artifactPassed&&row.status==='complete',scoreChanged:artifactPassed!==row.artifactPassed};}
