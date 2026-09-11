// Live adapter smoke check; no model, private task data, or website interaction.
import fs from 'node:fs/promises';
import path from 'node:path';
import {searchWeb} from '../src/search-api.mjs';
import {BrowserSession} from '../src/harness/browser.mjs';
const root=path.resolve(import.meta.dirname,'..'),browser=new BrowserSession(root),report={observedAt:new Date().toISOString(),purpose:'One live search and primary-source read, not broad website qualification.'};
try{
  const search=await searchWeb('Gemma 4 E2B documentation');
  report.search={provider:search.provider,status:search.httpStatus,query:search.query,results:search.results};
  const source=search.results.find(r=>new URL(r.url).hostname==='ai.google.dev')??search.results.find(r=>new URL(r.url).hostname==='huggingface.co'&&new URL(r.url).pathname.startsWith('/google/'));
  if(!source)throw Error('No primary source returned for the smoke query.');
  const page=await browser.act({action:'open',url:source.url},root,AbortSignal.timeout(30000));
  report.read={url:page.url,title:page.title,characters:page.content?.length??0,blocked:!!page.blocked,error:page.error??null};
  report.passed=!page.blocked&&!page.error&&report.read.characters>100;
}catch(e){report.passed=false;report.error=e.message;}
finally{await browser.close();await fs.writeFile(path.join(root,'.state/harness-web-smoke.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,provider:report.search?.provider,results:report.search?.results.length,read:report.read,error:report.error}));
if(!report.passed)process.exitCode=1;
