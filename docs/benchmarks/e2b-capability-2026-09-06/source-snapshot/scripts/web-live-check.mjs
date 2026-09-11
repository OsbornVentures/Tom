import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const results=[];
function run(args){const child=spawnSync(process.execPath,['src/browser.mjs',...args],{encoding:'utf8',windowsHide:true,timeout:80000});if(child.error)throw child.error;const page=JSON.parse(child.stdout);if(child.status!==0)throw new Error(page.notice??child.stderr);return page;}
for(const query of ['weather lorena tx','cookie recipes']){
 const search=run(['--action','search','--query',query]);assert.ok(search.results.length);
 const reads=search.results.slice(0,query.startsWith('weather')?1:2).map(row=>run(['--action','read','--url',row.url,'--browser','edge']));
 for(const page of reads){assert.ok(page.httpStatus>=200&&page.httpStatus<300);assert.ok(page.content?.length>40);}
 results.push({query,search,reads});console.log(JSON.stringify({query,provider:search.provider,results:search.results.length,sources:reads.map(p=>({url:p.url,title:p.title,characters:p.content.length}))}));
}
await fs.writeFile('audit/web-live.json',JSON.stringify(results,null,2));
