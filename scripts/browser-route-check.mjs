import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {shellTool} from '../src/tools.mjs';
const results=[];
for(const args of [
 ['--action','search','--query','MDN localStorage setItem','--provider','bing','--browser','edge'],
 ['--action','read','--url','https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage','--browser','edge'],
 ['--action','read','--url','https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem','--browser','edge']
]){const execution=await shellTool({program:'tom-browser',args,timeoutSeconds:45},process.cwd());let page;try{page=JSON.parse(execution.output);}catch{}results.push({args,exitCode:execution.exitCode,page});console.log(args[1],execution.exitCode,page?.httpStatus,page?.title);}
const report={modelDriven:false,description:'Deterministic Playwright transport check; source URLs are supplied by this test, not chosen by E2B.',searchRelevant:results[0].page?.results?.some(r=>r.url.includes('developer.mozilla.org'))??false,results};
report.passed=results.every(r=>r.exitCode===0&&r.page?.httpStatus===200)&&!!results[0].page?.results?.length&&results[1].page?.title?.includes('localStorage')&&results[2].page?.title?.includes('setItem');
await fs.writeFile('audit/v03/browser-route-check.json',JSON.stringify(report,null,2));assert.equal(report.passed,true);console.log('PASS: browser transport search and two source reads. This is not a model-led task pass.');
