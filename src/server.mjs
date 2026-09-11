import http from 'node:http';
import fs from 'node:fs';
import {readFile,mkdir,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Store} from './store.mjs';
import {Runtime} from './runtime.mjs';
import {budgetDefaults,validateBudget,extendBudget} from './context.mjs';
import {Qualification} from './qualification.mjs';
import {Engine} from './engine.mjs';
import {hash} from './tools.mjs';
import {machineProfile,modelOptions,browserOptions} from './capabilities.mjs';
import {normalizeInference} from './inference-settings.mjs';
import {openLocalArtifact} from './local-files.mjs';
import {Startup} from './startup.mjs';
import {Profile,normalizeDisplayName} from './profile.mjs';
import {checkUpdates} from './updates.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(path.join(root,'.state'),{recursive:true});
const store=new Store(path.join(root,'.state','tom.sqlite'));
const locationFile=path.join(root,'.state','location.json');
try{const previous=JSON.parse(await readFile(locationFile,'utf8')),cwd=store.settings().cwd;
 if(previous.root&&cwd&&previous.root!==root){const relative=path.relative(previous.root,cwd);if(!relative.startsWith('..')&&!path.isAbsolute(relative)){const relocated=path.resolve(root,relative);store.saveSettings({cwd:await stat(relocated).then(s=>s.isDirectory()?relocated:root).catch(()=>root)});}}
}catch{}
await writeFile(locationFile,JSON.stringify({root}));
const config=JSON.parse(await readFile(path.join(root,'config','runtime.json'),'utf8'));
const product=JSON.parse(await readFile(path.join(root,'config','product.json'),'utf8'));
const saved=store.settings();
const chosen=saved.activeModelConfig?.model?.id&&saved.activeModelConfig?.model?.sha256?saved.activeModelConfig:config;
const inference=normalizeInference(saved.inference,{contextLimit:8192});
store.saveSettings({inference});
if(!saved.cwd||!(await stat(saved.cwd).catch(()=>null))?.isDirectory())store.saveSettings({cwd:root});
if(!browserOptions().some(b=>b.id===saved.browser&&b.path))store.saveSettings({browser:browserOptions().find(b=>b.path&&['edge','chrome','brave'].includes(b.id))?.id??'edge'});
try{store.saveSettings({budget:validateBudget(saved.budget??budgetDefaults)});}catch{store.saveSettings({budget:budgetDefaults});}
for(const [key,allowed,fallback] of [['commands',['review','automatic'],'review'],['search',['google','bing','brave','duckduckgo'],'google'],['theme',['day','night'],product.defaultTheme]])if(!allowed.includes(saved[key]))store.saveSettings({[key]:fallback});
if(typeof saved.diagnostics!=='boolean')store.saveSettings({diagnostics:false});
const runtime=new Runtime(root,{...chosen,...inference}),subscribers=new Set();
const broadcast=e=>{for(const s of subscribers)if(s.task===e.task)s.res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);};
const profile=await new Profile(root).init();
const engine=new Engine(store,runtime,root,broadcast,product,profile);
const qualification=await new Qualification(root,config,store,runtime,engine).init();
await qualification.restoreForComputer();
const startup=new Startup(qualification,runtime);
const qualificationStatus=()=>({...qualification.status(),startup:startup.status()});
const startupBusy=()=>!startup.ready;
const restoredInference=normalizeInference({...inference,context:runtime.config.context,threads:runtime.config.threads},{contextLimit:qualification.contextLimit()});
Object.assign(runtime.config,restoredInference);store.saveSettings({inference:restoredInference});
runtime.onRecovery=async recovery=>store.saveSettings({inference:{...normalizeInference(store.settings().inference),acceleration:recovery.acceleration,kvCache:recovery.kvCache,context:recovery.context},performanceRecovery:recovery});
void runtime.hardware();
const token=/^[a-f0-9]{64}$/.test(process.env.TOM_SESSION_KEY??'')?process.env.TOM_SESSION_KEY:randomBytes(32).toString('hex');
let port=Number(process.env.TOM_PORT??4317);
const equal=(a,b)=>{const x=Buffer.from(a??''),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw new Error('Attachments exceed the 12 MB request limit.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
function inputMessage(text,images){
  if(typeof text!=='string'||text.length>16000||(!text.trim()&&!images?.length))throw new Error('Enter a request of up to 16,000 characters.');
  if(images===undefined||images.length===0)return {role:'user',content:text.trim()};
  if(!Array.isArray(images)||images.length>2)throw new Error('Attach up to two images at a time.');
  for(const image of images)if(typeof image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>7*1024*1024)throw new Error('Use a PNG, JPEG, or WebP image smaller than 5 MB.');
  return {role:'user',content:[...images.map(url=>({type:'image_url',image_url:{url}})),{type:'text',text:text.trim()||'Describe this image.'}]};
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const host=`127.0.0.1:${port}`,origin=`http://${host}`;
  if(req.headers.host!==host){send(res,403,{error:'Unexpected host.'});return;}
  const url=new URL(req.url,origin);
  try{
    if(url.pathname.startsWith('/api/')){
      const extension=/^chrome-extension:\/\/[a-z]{32}$/.test(req.headers.origin??'');
      if(req.headers.origin && req.headers.origin!==origin&&!extension){send(res,403,{error:'Unexpected origin.'});return;}
      if(extension){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Tom-Key');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');}
      if(req.method==='OPTIONS'&&extension){res.writeHead(204);res.end();return;}
      if(!equal(req.headers['x-tom-key'],token)){send(res,401,{error:'Open Tom using its local launcher to connect this window.'});return;}
      if(req.method==='GET'&&url.pathname==='/api/state'){
        const model=await runtime.artifacts(),machine=machineProfile();send(res,200,{browserProtocol:2,product,qualification:qualificationStatus(),contextLimit:qualification.contextLimit(),threads:runtime.config.threads,modelIdentity:runtime.config.model.name,context:runtime.config.context,cache:{k:runtime.effective?.cacheTypeK??'f16',v:runtime.effective?.cacheTypeV??'f16'},performance:{hardware:runtime.hardwareInfo,effective:runtime.effective??null,recovery:runtime.recovery??store.settings().performanceRecovery??null},tasks:store.tasks(),fileCount:store.fileCount(),settings:{cwd:root,commands:'review',browser:'edge',search:'google',theme:product.defaultTheme,budget:budgetDefaults,...store.settings(),displayName:profile.displayName},runtime:model,machine,models:[{id:config.model.id,name:config.model.name,bundled:true,installable:model.verified,reason:'Bundled offline · text and vision'},...qualification.catalog.models.map(m=>({id:m.id,name:m.name,installable:false,reason:qualification.offers.find(o=>o.id===m.id)?.reason??'Use Tune this computer to check upgrade eligibility'}))],browsers:browserOptions(),active:engine.active?.id??null});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/settings'){
        const data=await body(req),accepted={};
        const displayName=data.displayName===undefined?undefined:normalizeDisplayName(data.displayName);
        if(data.cwd!==undefined){if(typeof data.cwd!=='string'||!path.isAbsolute(data.cwd)||!(await stat(data.cwd)).isDirectory())throw new Error('Choose an existing absolute folder path.');accepted.cwd=path.resolve(data.cwd);}
        if(data.commands!==undefined){if(!['review','automatic'].includes(data.commands))throw new Error('Unknown command setting.');accepted.commands=data.commands;}
        if(data.browser!==undefined){if(!['edge','chrome','brave','tor'].includes(data.browser))throw new Error('Unknown browser.');accepted.browser=data.browser;}
        if(data.search!==undefined){if(!['duckduckgo','brave','google','bing'].includes(data.search))throw new Error('Unknown search provider.');accepted.search=data.search;}
        if(data.inference!==undefined){if(engine.active||qualification.running)throw new Error('Pause the current task or check before changing performance settings.');accepted.inference=normalizeInference(data.inference,{contextLimit:qualification.contextLimit()});}
        if(data.budget!==undefined)accepted.budget=validateBudget(data.budget);
        if(data.diagnostics!==undefined){if(typeof data.diagnostics!=='boolean')throw new Error('Diagnostics must be on or off.');accepted.diagnostics=data.diagnostics;}
        if(data.theme!==undefined){if(!['day','night'].includes(data.theme))throw new Error('Unknown theme.');accepted.theme=data.theme;}
        if(accepted.inference){await runtime.stop();Object.assign(runtime.config,accepted.inference);runtime.effective=null;runtime.recovery=null;accepted.performanceRecovery=null;}if(displayName!==undefined)await profile.save(displayName);store.saveSettings(accepted);send(res,200,{ok:true});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/open-search'){
        const data=await body(req);if(typeof data.query!=='string'||!data.query.trim()||data.query.length>2000)throw new Error('Choose a search subject of up to 2,000 characters.');
        const settings=store.settings(),browser=browserOptions().find(b=>b.id===(settings.browser??'edge'));
        if(!browser?.path)throw new Error('Your selected browser was not found. Choose an installed browser in settings.');
        const providers={duckduckgo:'https://duckduckgo.com/?q=',brave:'https://search.brave.com/search?q=',google:'https://www.google.com/search?q=',bing:'https://www.bing.com/search?q='};
        const target=(providers[settings.search]??providers.google)+encodeURIComponent(data.query);
        const child=spawn(browser.path,[target],{windowsHide:false,detached:true,stdio:'ignore'});
        await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();send(res,200,{ok:true});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/startup'){
        const data=await body(req);if(data.action==='cancel'){startup.cancel();send(res,200,{ok:true});return;}
        if(data.action==='prepare'){if(startup.ready&&!engine.active&&!qualification.running&&(!runtime.base||!runtime.grammarVerified))void startup.start({skipChecks:true});send(res,200,{ok:true});return;}
        if(!['retry','continue'].includes(data.action))throw Error('Unknown startup action.');
        if(startup.job||qualification.running||engine.active)throw Error('Wait for the current startup or task to stop.');
        if(data.action==='continue'&&!startup.canContinue)throw Error('Retry loading the model before continuing.');
        void startup.start({skipChecks:data.action==='continue',repeatCheck:data.action==='retry'&&startup.canContinue});send(res,202,{ok:true});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/updates'){send(res,200,await checkUpdates(product));return;}
      if(req.method==='GET'&&url.pathname==='/api/qualification'){send(res,200,qualificationStatus());return;}
      if(req.method==='POST'&&url.pathname==='/api/qualification'){
        const data=await body(req);if(data.action==='cancel'){qualification.cancel();send(res,200,{ok:true});return;}
        if(startup.busy||qualification.running||engine.active)throw new Error('Pause the current task or wait for startup or the current check.');
        if(data.action==='activate'){const result=await qualification.activate(data.model);void startup.start({skipChecks:true});send(res,200,result);return;}
        if(data.action==='use-e2b'){await runtime.stop();runtime.config={...config};store.saveSettings({activeModel:null,activeModelConfig:null,inference:{context:config.context,threads:config.threads,idleUnloadMs:config.idleUnloadMs}});await qualification.identity();void startup.start({skipChecks:true});send(res,200,{ok:true});return;}
        if(!['baseline','scan','trial'].includes(data.action))throw new Error('Unknown system check.');
        send(res,202,{ok:true});const job=data.action==='scan'?qualification.scan():data.action==='trial'?qualification.downloadAndTrial(data.model):qualification.baseline({extended:!!data.extended});void job.catch(e=>qualification.event(e.message,{error:true})).finally(()=>startup.start({skipChecks:true}));return;
      }
      if(req.method==='POST'&&['/api/research','/api/search'].includes(url.pathname)){
        if(startupBusy()||engine.active||qualification.running)throw new Error('Pause the current task or finish the system check first.');const data=await body(req);if(typeof data.query!=='string'||!data.query.trim()||data.query.length>2000)throw new Error('Enter a research subject of up to 2,000 characters.');
        const settings=store.settings(),browser=settings.browser??'edge',provider=settings.search??'google';
          const prompt='Research this subject using the web: '+data.query+'\nRead at least two relevant sources when available. Give a concise answer linked to the pages read. Explain any actual search obstacle.';
        const researchMessage=inputMessage(prompt,data.images);let task;if(data.task){task=store.task(data.task);if(!task)throw new Error('Conversation not found.');if(store.actions(task.id).some(a=>a.status==='uncertain'))throw new Error('Inspect the interrupted action in a new conversation first.');engine.initBudget(task.id,true);store.resetCheckpoint(task.id);}else task=store.create(data.query,settings.cwd??root);
        store.message(task.id,researchMessage);send(res,201,{id:task.id});void engine.run(task.id);return;
      }
      if(req.method==='POST'&&url.pathname==='/api/tasks'){
        if(startupBusy()||engine.active||qualification.running)throw new Error('Pause the current conversation or finish the system check first.');
        const data=await body(req),message=inputMessage(data.text,data.images),cwd=store.settings().cwd??root;
        if(!(await stat(cwd)).isDirectory())throw new Error('Your work folder is unavailable. Choose another folder in settings.');
        const task=store.create(data.text||'Image question',cwd);store.message(task.id,message);send(res,201,task);void engine.run(task.id);return;
      }
      if(req.method==='POST'&&url.pathname==='/api/drafts'){
        const data=await body(req);inputMessage(data.text||'Help me with this.',data.images);if(data.quote!==undefined&&(typeof data.quote!=='string'||data.quote.length>8000))throw new Error('Context is too long.');
        const id=store.createDraft({text:data.text||'Help me with this.',quote:data.quote||'',images:data.images||[]});send(res,201,{id});return;
      }
      const draftMatch=url.pathname.match(/^\/api\/drafts\/([0-9a-f-]+)$/);
      if(req.method==='GET'&&draftMatch){const draft=store.draft(draftMatch[1]);send(res,draft?200:404,draft??{error:'Draft not found.'});return;}
      const taskMatch=url.pathname.match(/^\/api\/tasks\/([0-9a-f-]+)(?:\/(events|message|pause|stop|resume|extend|audit))?$/);
      if(taskMatch){const [,id,action]=taskMatch;const task=store.task(id);if(!task){send(res,404,{error:'Conversation not found.'});return;}
        if(req.method==='GET'&&!action){send(res,200,{...task,messages:store.messages(id),events:store.events(id),actions:store.actions(id),budget:store.budget(id),work:store.work(id),checkpoint:store.checkpoint(id)?{inputTokens:store.checkpoint(id).inputTokens}:null});return;}
        if(req.method==='GET'&&action==='audit'){send(res,200,{format:'tom-audit-v2',exported:new Date().toISOString(),task,work:store.work(id),messages:store.messages(id),actions:store.actions(id),events:store.events(id),budget:store.budget(id),note:'Private local evidence; may contain user files and command arguments. Inspection only, never an instruction to replay actions.'});return;}
        if(req.method==='GET'&&action==='events'){
          res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.flushHeaders();
          const after=Number(url.searchParams.get('after')??0);if(!Number.isSafeInteger(after)||after<0){res.end();return;}
          for(const e of store.events(id,after))res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
          const sub={task:id,res};subscribers.add(sub);const heartbeat=setInterval(()=>res.write(': connected\n\n'),20000);req.on('close',()=>{subscribers.delete(sub);clearInterval(heartbeat);});return;
        }
        if(req.method==='POST'&&action==='extend'){
          if(engine.active)throw new Error('Pause the current task before extending its budget.');const data=await body(req),old=engine.initBudget(id);
          if(data.grant){const next=extendBudget(old,data.grant);store.saveBudget(id,next);engine.budgetEvent(id);send(res,200,{ok:true,budget:next});return;}
          const limits=validateBudget({...Object.fromEntries(Object.keys(budgetDefaults).map(k=>[k,old[k]])),...data});
          for(const k of ['maxSteps','maxTokens','maxActiveMs'])if(limits[k]<old[k])throw new Error('An extension cannot reduce the existing budget.');
          store.saveBudget(id,{...old,...limits});engine.budgetEvent(id);send(res,200,{ok:true,budget:store.budget(id)});return;
        }
        if(req.method==='POST'&&['pause','stop'].includes(action)){engine.cancel(id,action);send(res,200,{ok:true});return;}
        if(req.method==='POST'&&['message','resume'].includes(action)){
          if(startupBusy()||engine.active||qualification.running)throw new Error('Pause the current conversation or finish the system check first.');
          if(store.actions(id).some(a=>a.status==='uncertain'))throw new Error('An interrupted action needs inspection. Start a new conversation to inspect its result.');
          if(action==='message'){const data=await body(req);store.message(id,inputMessage(data.text,data.images));engine.initBudget(id,true);store.resetCheckpoint(id);}
          else if(!['paused','interrupted','stopped','error','blocked','budget'].includes(task.status))throw new Error('This conversation does not need resuming.');
          send(res,200,{ok:true});void engine.run(id);return;
        }
      }
      if(req.method==='POST'&&url.pathname==='/api/review'){const data=await body(req);if(typeof data.approved!=='boolean')throw new Error('Choose allow or decline.');engine.decide(data.action,data.approved);send(res,200,{ok:true});return;}
      if(req.method==='POST'&&url.pathname==='/api/quit'){send(res,200,{ok:true});void shutdown();return;}
      if(req.method==='POST'&&url.pathname==='/api/file/open'){const data=await body(req);send(res,200,await openLocalArtifact(store.getAction(data.action),data.index,{reveal:data.reveal===true}));return;}
      if(req.method==='GET'&&url.pathname==='/api/files'){send(res,200,store.files());return;}
      if(req.method==='GET'&&url.pathname==='/api/file'){
        const action=store.getAction(url.searchParams.get('action')),index=url.searchParams.has('index')?Number(url.searchParams.get('index')):null;
        const file=index===null?action?.result:Number.isInteger(index)&&index>=0?action?.result?.artifacts?.[index]:null;
        if(action?.status!=='complete'||!file?.verified)throw new Error('No saved file is available for this action.');
        if((await stat(file.path)).size>64*1024*1024)throw new Error('This file is larger than the 64 MiB browser download limit. Open it directly from your work folder.');
        const content=await readFile(file.path);if(hash(content)!==file.sha256)throw new Error('This file changed after it was recorded. Ask Tom to inspect the current version.');
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file.path))}`});res.end(content);return;
      }
      send(res,404,{error:'Unknown request.'});return;
    }
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if(req.method!=='GET'){send(res,405,{error:'Method not allowed.'});return;}
    const allowed={'/':'index.html','/app.js':'app.js','/ui.js':'ui.js','/styles.css':'styles.css','/mark.svg':'mark.svg','/kernel.js':'kernel.js','/help.js':'help.js','/context-meter.js':'context-meter.js','/tom-icon-v05.svg':'tom-icon-v05.svg','/gemma-4.png':'gemma-4.png'};
    if(!allowed[url.pathname]){send(res,404,{error:'Not found.'});return;}
    const file=path.join(root,'public',allowed[url.pathname]);res.writeHead(200,{'Content-Type':mime[path.extname(file)]});res.end(await readFile(file));
  }catch(e){if(!res.headersSent)send(res,400,{error:e.message});else res.end();}
});
server.listen(port,'127.0.0.1',async()=>{port=server.address().port;const url=`http://127.0.0.1:${port}/#key=${token}`;await writeFile(path.join(root,'.state','session.json'),JSON.stringify({url,port,pid:process.pid}));console.log(`Tom is listening at http://127.0.0.1:${port}. Open the URL in .state/session.json to connect.`);});
const firstRunTimer=setTimeout(()=>{if(startup.phase==='pending')void startup.start();},1000);firstRunTimer.unref();
server.on('error',e=>{console.error(e.message);process.exitCode=1;store.close();});
let shuttingDown=false;
async function shutdown(){if(shuttingDown)return;shuttingDown=true;clearTimeout(firstRunTimer);startup.cancel();qualification.cancel();if(engine.active)engine.cancel(engine.active.id,'stop');for(const s of subscribers)s.res.end();await qualification.stop();await runtime.stop();server.close();setTimeout(()=>process.exit(0),800).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
