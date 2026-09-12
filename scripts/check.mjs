import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=[];
async function collect(dir){for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await collect(file);else if(/\.(?:mjs|js)$/.test(entry.name))files.push(file);}}
for(const dir of ['src','public','scripts','tests','browser-extension'])await collect(dir);
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{cwd:root,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status??1);}
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'))),product=JSON.parse(await fs.readFile(path.join(root,'config/product.json')));
if(pkg.version!==product.version)throw new Error('Package and product versions disagree.');
const tests=(await fs.readdir(path.join(root,'tests'))).filter(n=>n.endsWith('.test.mjs')).map(n=>'tests/'+n);
// Bound parallel Windows process startups so CI tests exercise behavior without CPU contention.
const r=spawnSync(process.execPath,['--test','--test-concurrency=2',...tests],{cwd:root,stdio:'inherit',windowsHide:true});
if(r.status!==0)process.exit(r.status??1);
console.log(`Build checks passed: ${files.length} JavaScript files, version ${pkg.version}, deterministic test suite.`);
