import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {cases} from './capability-cases.mjs';
import {rescore,evaluate} from './capability-score-v2.mjs';
import {cases as jsCases} from './capability-js-cases.mjs';
const [folder,mainFile,peerFile]=process.argv.slice(2);const stats=JSON.parse(await fs.readFile(path.join(folder,'statistics.json')));
const actual=[];for(const [file,published]of [[mainFile,'internal-results.json'],[peerFile,'aider-results.json']]){
 const raw=JSON.parse(await fs.readFile(file)),report=JSON.parse(await fs.readFile(path.join(folder,published)));
 for(const row of raw.results){const corrected=rescore(cases.find(c=>c.id===row.case),row),match=report.results.find(r=>r.case===row.case&&r.seed===row.seed&&r.arm===row.arm);assert(match);assert.equal(corrected.artifactPassed,match.artifactPassed);assert.deepEqual(corrected.assertions,match.assertions);assert.equal(corrected.scoreChanged,match.scoreChanged);actual.push(corrected);}
}
assert.equal(actual.length,64);for(const [arm,entry]of Object.entries(stats.aggregate)){const selected=actual.filter(r=>r.arm===arm);assert.equal(selected.length,entry.n);assert.equal(selected.filter(r=>r.artifactPassed).length,entry.passed);assert.equal(selected.filter(r=>r.completedPassed).length,entry.completedPassed);}
assert.equal(actual.filter(r=>r.scoreChanged).length,stats.scoreCorrections.length);
let diagnosticCount=0;
if(stats.extensionDiagnostic){const diagnostic=JSON.parse(await fs.readFile(path.join(folder,'extension-diagnostic.json')));for(const row of diagnostic.results){const assertions=evaluate(jsCases.find(c=>c.id===row.case),row.content);assert.deepEqual(assertions,row.assertions);assert.equal(row.artifactPassed,assertions.passed&&row.fixturesUnchanged&&!row.extraFiles.length);diagnosticCount++;}assert.equal(diagnosticCount,8);assert.equal(diagnostic.results.filter(r=>r.artifactPassed).length,stats.extensionDiagnostic.passed);}
console.log(`Verified 64 corrected comparative scores and ${diagnosticCount} separate diagnostic scores against saved outputs and published arithmetic.`);
