import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'.state/game-grader-controls',new Date().toISOString().replace(/[:.]/g,'-'));
const fixture=broken=>'<!doctype html><html><body><h1>Fixture</h1><p id="story">Choose a path.</p><div id="choices"><button onclick="end(1)">Left</button><button onclick="end(0)">Right</button></div><script>function end(win){document.getElementById("story").textContent='+(broken?'"Nothing else happens."':'win?"VICTORY":"DEATH"')+';document.getElementById("choices").innerHTML="";}</script></body></html>';
for(const [name,broken]of [['valid',false],['dead-end',true]]){await fs.mkdir(path.join(dir,name),{recursive:true});await fs.writeFile(path.join(dir,name,'index.html'),fixture(broken));}
await fs.mkdir(path.join(dir,'script-error'));await fs.writeFile(path.join(dir,'script-error/index.html'),fixture(false).replace('</div><script>','<button onclick="fail()">Broken</button></div><script>function fail(){throw new Error("BROKEN-CHOICE");}'));
const args=['scripts/check-game-flow.mjs',...['valid','dead-end','script-error'].map(n=>path.join(dir,n,'index.html'))],child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:'inherit'});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0);
const valid=JSON.parse(await fs.readFile(path.join(dir,'valid/functional-check.json'))),broken=JSON.parse(await fs.readFile(path.join(dir,'dead-end/functional-check.json')));
assert.equal(valid.passed,true);assert.equal(valid.victory,true);assert.equal(valid.death,true);assert.equal(broken.passed,false);assert.ok(broken.failures.length>0);
const error=JSON.parse(await fs.readFile(path.join(dir,'script-error/functional-check.json')));assert.equal(error.passed,false);assert.ok(error.failures.some(f=>f.error.includes('BROKEN-CHOICE')));
await fs.writeFile(path.join(root,'.state/game-grader-control-results.json'),JSON.stringify({passed:true,validAccepted:true,deadEndsRejected:true,unchangedErrorStateRejected:true,directory:dir},null,2));
console.log('Game grader controls passed: accepts reachable endings and rejects dead ends.');
