import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {fingerprint} from '../src/qualification.mjs';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),target=path.resolve(process.argv[3]),setup=path.resolve(process.argv[2]),out=path.join(root,'audit/installer-beta');
assert.ok(target.startsWith(path.join(root,'tmp')+path.sep),'Checks must stay in the workspace test directory');
const run=(exe,args)=>new Promise((resolve,reject)=>{const p=spawn(exe,args,{windowsHide:true,stdio:'ignore'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(path.basename(exe)+' exited '+code)));});
await fs.mkdir(out,{recursive:true});
await fs.mkdir(path.join(target,'.state'),{recursive:true});
const previous=JSON.parse(await fs.readFile(path.join(target,'installation.json')));assert.equal(previous.version,'0.5.1','Begin this upgrade check with an actual 0.5.1 installation');
await fs.writeFile(path.join(target,'.state/profile.json'),JSON.stringify({displayName:'River'}));
await fs.writeFile(path.join(target,'models/optional-model-test.txt'),'keep optional model folder content');
const store=new Store(path.join(target,'.state/tom.sqlite')),task=store.create('Keep this conversation',target);store.saveSettings({inference:{threads:999,context:-4,kvCache:'rocm-invalid'},cwd:'Z:\\Tom folder missing',theme:'night'});store.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('diagnostics','{broken');store.close();
await fs.writeFile(path.join(target,'personal-note.txt'),'keep personal file');
await fs.writeFile(path.join(target,'public/index.html'),'damaged app file');
console.log('Testing repair with a damaged app file and retained conversation.');await run(setup,['--install-test',target]);
assert.equal(JSON.parse(await fs.readFile(path.join(target,'.state/profile.json'))).displayName,'River');
assert.equal(await fs.readFile(path.join(target,'models/optional-model-test.txt'),'utf8'),'keep optional model folder content');
const installed=JSON.parse(await fs.readFile(path.join(target,'installed-manifest.json')));
const html=await fs.readFile(path.join(target,'public/index.html'));assert.equal(createHash('sha256').update(html).digest('hex'),installed.files.find(e=>e.path==='public/index.html').sha256);
assert.equal(await fs.readFile(path.join(target,'personal-note.txt'),'utf8'),'keep personal file');
const config=JSON.parse(await fs.readFile(path.join(target,'config/runtime.json')));
// Qualification is exercised independently. Avoid starting a benchmark while
// this test checks supervisor recovery and the actual installed preferences UI.
await fs.writeFile(path.join(target,'.state/qualification.json'),JSON.stringify({fingerprint:fingerprint(config),passed:false,finished:new Date().toISOString(),contexts:[],metrics:{},reason:'Installer test fixture'}));
const child=spawn(path.join(target,'runtime/node.exe'),[path.join(target,'src/server.mjs')],{cwd:target,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,TOM_PORT:'0',PATH:process.env.SystemRoot+'\\System32'}});
let errors='';child.stderr.on('data',b=>{errors+=b;});let base,key,browser;
try{
 for(let i=0;i<100;i++){try{const session=JSON.parse(await fs.readFile(path.join(target,'.state/session.json')));if(session.pid===child.pid){const url=new URL(session.url);base=url.origin;key=new URLSearchParams(url.hash.slice(1)).get('key');break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 assert.ok(base,'Installed server did not start: '+errors);
 const api=async(route,body)=>{const res=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'X-Tom-Key':key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;};
 const state=await api('state');assert.equal(state.product.version,'0.5.2');assert.equal(state.settings.cwd,target);assert.equal(state.settings.inference.kvCache,'auto');assert.ok(state.settings.inference.threads<=8);assert.ok(state.tasks.some(t=>t.id===task.id));
 const {chromium}=await import(pathToFileURL(path.join(root,'runtime/browser/node_modules/playwright-core/index.mjs')));browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:1000}}),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));await page.goto(base+'/#key='+key);await page.waitForFunction(()=>!document.querySelector('.sidebar').inert && !document.querySelector('#startup-dialog').open,null,{timeout:120000});await page.locator('#startup-dialog').waitFor({state:'hidden'});const ready=await api('state');assert.equal(ready.runtime.loaded,true);await page.locator('.settings-trigger').first().click();await page.locator('#acceleration-setting').selectOption('cpu');await page.locator('#cache-setting').selectOption('q8_0');await page.getByRole('button',{name:'Save preferences'}).click();await page.locator('#settings-dialog').waitFor({state:'hidden'});let saved=await api('state');assert.equal(saved.settings.inference.acceleration,'cpu');assert.equal(saved.settings.inference.kvCache,'q8_0');
 await page.locator('.settings-trigger').first().click();await page.locator('#repair-performance').click();await page.waitForFunction(()=>document.querySelector('#acceleration-setting').value==='auto');saved=await api('state');assert.equal(saved.settings.inference.kvCache,'auto');assert.equal(saved.settings.inference.acceleration,'auto');await page.locator('#acceleration-setting').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'installed-performance.png')});assert.deepEqual(pageErrors,[]);
 await browser.close();browser=null;await api('quit',{});
}finally{await browser?.close();if(base&&key&&child.exitCode===null)await fetch(base+'/api/quit',{method:'POST',headers:{'X-Tom-Key':key,'Content-Type':'application/json'},body:'{}'}).catch(()=>{});if(child.exitCode===null){await new Promise(r=>setTimeout(r,1500));if(child.exitCode===null)child.kill();}await new Promise(r=>setTimeout(r,700));}
const recovered=new Store(path.join(target,'.state/tom.sqlite'));assert.equal(recovered.db.prepare('SELECT value FROM damaged_settings WHERE key=?').get('diagnostics').value,'{broken');assert.ok(recovered.task(task.id));recovered.close();
const helper=path.join(root,'tmp/Uninstall-Tom-test.exe');await fs.copyFile(path.join(target,'Uninstall-Tom.exe'),helper);console.log('Testing uninstall and personal-data retention.');await run(helper,['--remove',target,'--test']);
assert.equal(await fs.stat(path.join(target,'Start-Tom.exe')).then(()=>true,()=>false),false);assert.equal(await fs.readFile(path.join(target,'personal-note.txt'),'utf8'),'keep personal file');assert.ok(await fs.stat(path.join(target,'.state/tom.sqlite')));
await fs.writeFile(path.join(out,'installation-result.json'),JSON.stringify({passed:true,setup,target,repair:true,upgradedFrom:'0.5.1',version:'0.5.2',preferredNameRetained:true,optionalModelFilesRetained:true,realModelReady:true,retainedConversation:true,malformedSettingsRecovered:true,installedSettingsUI:true,uninstall:true,personalDataRetained:true,developmentPathRemoved:true},null,2));console.log('PASS: actual EXE repair, retained conversations, settings recovery, installed UI, uninstall and personal-data retention.');
