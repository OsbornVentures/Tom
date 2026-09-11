import fs from 'node:fs/promises';
import {requestContract,evidenceState} from '../src/evidence.mjs';
const rows=[];
for(const ext of ['txt','json','js','cjs','mjs','py']){
 const request=`Read source.${ext} and create solution.${ext} implementing the requested correction.`,contract=requestContract([{role:'user',content:request}]),evidence=evidenceState(contract,[]);
 rows.push({request,recognizedOutputs:contract.outputs,requiredSourceReads:contract.sourceFiles,fileWork:contract.fileWork,canAnswerWithNoActions:evidence.canAnswer,missingEvidence:evidence.missing});
}
const out=process.argv[2];if(out)await fs.writeFile(out,JSON.stringify({kind:'observational production request-classification audit; no inference',rows},null,2));
console.log(JSON.stringify(rows,null,2));
