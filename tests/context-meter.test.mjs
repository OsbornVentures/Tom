import test from 'node:test';
import assert from 'node:assert/strict';
import {contextSnapshot} from '../public/context-meter.js';
test('context wheel counts actual compactions, not each rebuilt input, and survives task replay',()=>{
 const events=[{kind:'context',detail:{inputTokens:1500}},{kind:'context-pressure',detail:{inputTokens:3900,context:4096}},{kind:'context',detail:{inputTokens:2100,context:4096,reservedTokens:128,compacted:true,compactions:1}},{kind:'model',detail:{inputTokens:2100,context:4096,reservedTokens:128,compacted:true,compactions:1}}];
 const snapshot=contextSnapshot(events);assert.equal(snapshot.count,1);assert.equal(snapshot.input,2100);assert.equal(snapshot.fraction,2228/4096);assert.equal(snapshot.pressure,false);assert.equal(snapshot.compacted,true);
 assert.deepEqual(contextSnapshot(JSON.parse(JSON.stringify(events))),snapshot);
 events.push({kind:'start-new-request'});assert.equal(contextSnapshot(events).count,1);assert.equal(contextSnapshot(events).fraction,null);
 assert.equal(contextSnapshot([]).count,0);
});
test('pressure shows immediately, clamps the wheel and clears when a task stops',()=>{
 const events=[{kind:'context-pressure',detail:{inputTokens:9000,context:8192,reservedTokens:128}}];assert.equal(contextSnapshot(events).fraction,1);assert.equal(contextSnapshot(events).pressure,true);
 events.push({kind:'budget'});assert.equal(contextSnapshot(events).pressure,false);
});
