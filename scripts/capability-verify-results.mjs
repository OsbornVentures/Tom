import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {cases,evaluate} from './capability-cases.mjs';
import {cases as jsCases} from './capability-js-cases.mjs';
const files=process.argv.slice(2);if(!files.length)throw Error('Supply completed result files');
let total=0;
for(const file of files){const s=JSON.parse(await fs.readFile(file));assert(s.finished);assert.equal(s.results.length,s.cases.length*s.seeds.length*(s.arms?.length??1));
 for(const row of s.results){const c=[...cases,...jsCases].find(c=>c.id===row.case);assert(c);assert.deepEqual(s.cases.find(c=>c.id===row.case),c);const dir=path.join(path.dirname(file),`${c.id}-${row.seed}-${row.arm}`),content=await fs.readFile(path.join(dir,c.output),'utf8').catch(()=> '');assert.equal(content,row.content,'Stored output must equal scored output');assert.deepEqual(evaluate(c,content),row.assertions,'Re-scored functional assertions');
  const unchanged=(await Promise.all(Object.entries(c.files).map(async([name,text])=>await fs.readFile(path.join(dir,name),'utf8')===text))).every(Boolean);assert.equal(unchanged,row.fixturesUnchanged);assert.equal(row.artifactPassed,row.assertions.passed&&unchanged&&row.extraFiles.length===0);total++;
 }
}
console.log(`Verified ${total} saved outputs, independent re-scoring, source preservation and pass arithmetic.`);
