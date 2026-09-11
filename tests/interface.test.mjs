import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {functionParameters,normalizeExamples} from '../src/harness/interface.mjs';
import {Store} from '../src/store.mjs';
import {taskState} from '../src/harness/state.mjs';
import {Toolbox} from '../src/harness/tools.mjs';
import {generationFor,generationContext,acceptGeneration} from '../src/harness/generation.mjs';
import {completion} from '../src/harness/checks.mjs';
import {validateBudget} from '../src/context.mjs';
test('simple exported signatures are inferred without using comments or quoted text',()=>{
  assert.deepEqual(functionParameters('module.exports = function paginate(items, page, size) { return []; };'),['items','page','size']);
  assert.deepEqual(functionParameters('module.exports = rows => rows;'),['rows']);
  assert.deepEqual(functionParameters('/* module.exports = wrong => {}; */ module.exports = (x,y) => x+y;'),['x','y']);
  assert.deepEqual(functionParameters('const s="module.exports = fake => 0";\nmodule.exports = (x) => x;'),['x']);
  assert.equal(functionParameters('module.exports = ({x}, y=2) => x+y;'),null);
  assert.equal(functionParameters('module.exports = (x)=>x; module.exports = (y)=>y;'),null);
});
test('named function tests remove positional array nesting and reject missing arguments',()=>{
  assert.deepEqual(normalizeExamples([{arguments:{items:[1,2,3],page:1,size:2},expected:[1,2]}],['items','page','size']),[{args:[[1,2,3],1,2],expected:[1,2]}]);
  assert.deepEqual(normalizeExamples([{input:[1,2],expected:3}],['rows']),[{args:[[1,2]],expected:3}]);
  assert.throws(()=>normalizeExamples([{arguments:{items:[],page:1},expected:[]}],['items','page','size']),/match/);
});
test('generated multi-argument examples use the saved signature and execute as separate arguments',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tom-named-tests-')),store=new Store(path.join(dir,'journal.sqlite'));
  try{
    const task=store.create('pagination',dir);store.message(task.id,{role:'user',content:'Create solution.cjs exporting one function with module.exports. Pagination uses one-based page numbers. Nonpositive page or size returns an empty array.'});const state=await taskState(store,task.id,dir),box=new Toolbox({root:path.resolve('.'),cwd:dir,state,store,id:task.id,settings:{}}),signal=new AbortController().signal;
    const write={path:'solution.cjs',content:'module.exports = (items,page,size) => page>0&&size>0?items.slice((page-1)*size,page*size):[];'};await box.execute('write',write,await box.prepare('write',write,signal),signal);
    state.evidence=[{path:path.join(dir,'source.cjs'),content:'ORIGINAL BUGGY SOURCE MUST NOT SET THE TEST EXPECTATIONS'}];
    const generation=generationFor(state,dir,(await completion(state,dir)).missing),prepared=await generationContext({state,generation,runtime:{config:{context:4096},count:async()=>300},budget:{...validateBudget(),usedSteps:0,usedTokens:0},signal,cwd:dir});
    assert.match(prepared.messages[0].content,/parameter names/);assert.doesNotMatch(JSON.stringify(prepared.messages),/ORIGINAL BUGGY SOURCE/);
    const response=acceptGeneration(state,prepared,{content:'[{"arguments":{"items":[1,2,3],"page":1,"size":2},"expected":[1,2]},{"arguments":{"items":[1,2,3],"page":0,"size":2},"expected":[]}]',finish:'stop'}),args=JSON.parse(response.tool_calls[0].function.arguments);
    const result=await box.execute('test',args,await box.prepare('test',args,signal),signal);assert.equal(result.check.passed,true);
  }finally{store.close();await fs.rm(dir,{recursive:true,force:true});}
});
