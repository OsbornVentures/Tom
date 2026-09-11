import {setKernelState,redrawKernels,drawKernel,kernelGuide} from './kernel.js';
import {memoryExplanation} from './help.js';
import {contextSnapshot} from './context-meter.js';
const $=s=>document.querySelector(s);
const icons={plus:'M12 5v14M5 12h14',folder:'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z',computer:'M3 4h18v13H3ZM8 21h8M12 17v4',settings:'m10 3 4 0 1 3 3 1 3 3-2 3 0 3-3 1-2 4-4 0-1-3-3-1-3-3 2-3 0-3 3-1Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',help:'M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 3M12 17h.01 M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4',image:'M3 3h18v18H3ZM3 16l5-5 4 4 3-3 6 6M16 7h.01',cursor:'M5 3v16l5-5 4 7 3-2-4-7h7Z',capture:'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 7h10v10H7Z',globe:'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0M2 12h20M12 2c6 6 6 14 0 20-6-6-6-14 0-20', 'arrow-up':'M12 19V5M5 12l7-7 7 7',chat:'M21 4H3v14h5l4 3v-3h9Z',menu:'M4 6h16M4 12h16M4 18h16',file:'M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h6'};
function icon(name){const s=document.createElement('span');s.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]??icons.chat}"/></svg>`;return s;}
document.querySelectorAll('[data-icon]').forEach(e=>e.replaceChildren(icon(e.dataset.icon)));
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('key')){sessionStorage.setItem('tom-key',fragment.get('key'));history.replaceState(null,'',location.pathname);}
const key=sessionStorage.getItem('tom-key')??'';
let currentBudget=null,systemState=null,startupAcknowledged=null,startupBlocking=true;
if(!$('#startup-dialog').open)$('#startup-dialog').show();
$('#startup-dialog').addEventListener('cancel',e=>e.preventDefault());
let state=null,selected=null,events=[],images=[],quote='',stream=null,liveMessage=null,pendingMessage=null,latestTask=null,startTime=null,activeHere=false,selection='',taskLoadVersion=0;
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,7000);}
async function api(route,body){const r=await fetch('/api/'+route,{signal:AbortSignal.timeout(15000),method:body===undefined?'GET':'POST',headers:{'X-Tom-Key':key,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error??'The request failed.');return data;}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function linkedReply(text){const fragment=document.createDocumentFragment(),pattern=/\[([^\]]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"`*]+)/g;let end=0;for(const match of text.matchAll(pattern)){fragment.append(document.createTextNode(text.slice(end,match.index)));const a=el('a','reply-source',match[1]??match[3]);a.href=match[2]??match[3];a.target='_blank';a.rel='noopener noreferrer';fragment.append(a);end=match.index+match[0].length;}fragment.append(document.createTextNode(text.slice(end)));return fragment;}
function shortPath(p){return p?.split(/[\\/]/).filter(Boolean).at(-1)||p;}
function scrollDown(){const c=$('#content-scroll');c.scrollTop=c.scrollHeight;}
function nearBottom(){const c=$('#content-scroll');return c.scrollHeight-c.scrollTop-c.clientHeight<160;}
function buttons(status){setKernelState(status);$('#extend-budget').disabled=['running','review'].includes(status);activeHere=['running','review','pausing'].includes(status);$('#send-button').disabled=activeHere||startupBlocking;$('#pause-button').hidden=!activeHere;$('#stop-button').hidden=!activeHere;$('#resume-button').hidden=!['paused','interrupted','stopped','error','blocked','budget'].includes(status);$('#prompt').placeholder=activeHere?'You can draft your next message while Tom responds.':'What would you like a hand with?';if(!activeHere)startTime=null;}
async function refresh(){state=await api('state');$('#file-count').textContent=state.fileCount??'—';$('#workspace-label').textContent=shortPath(latestTask?.cwd??state.settings.cwd);$('#workspace-button').title=latestTask?.cwd??state.settings.cwd;$('#capability-label').replaceChildren(el('span','status-dot'),document.createTextNode(`${state.modelIdentity} · ${state.performance?.effective?.backend==='vulkan'?'GPU':'CPU'}${state.runtime.visionLoaded?' · Vision loaded':''}`));applyTheme(state.settings.theme);$('#product-name').textContent=state.product.name;document.title=state.product.name+' · Local personal AI';$('#brand-model').textContent=state.modelIdentity;$('#edition-version').textContent=state.product.version;$('#about-model').textContent='Powered by '+state.modelIdentity+', running locally on this computer.';const explanation=memoryExplanation(state);$('#model-fit-note').textContent=explanation.model;$('#about-capacity').textContent=explanation.model;document.querySelectorAll('[data-user-name]').forEach(e=>e.textContent=state.settings.displayName??'You');renderTasks();renderSystem(state.qualification);renderContext();return state;}
function renderTasks(){const list=$('#task-list');list.replaceChildren();if(!state.tasks.length){const p=el('p','sidebar-empty','A fresh start.\nYour conversations will live here.');p.style.whiteSpace='pre-line';list.append(p);}for(const task of state.tasks){const b=el('button','task-item'+(task.id===selected?' selected':''));b.append(icon('chat'),el('span','',task.title));b.title=task.title;b.onclick=()=>selectTask(task.id).catch(e=>toast(e.message));list.append(b);}}
function parkResponseTools(){
 $('#response-tools-home').append($('#response-tools'));pendingMessage=null;
 $('#activity').hidden=false;$('#activity').open=false;$('#current-event').textContent='Ready for your request';$('#event-list').replaceChildren();
}
function dockResponseTools(head){
 document.querySelectorAll('.message.assistant .chat-avatar').forEach(canvas=>canvas.dataset.kernelState='ready');
 head.append($('#response-tools'));delete head.querySelector('.chat-avatar').dataset.kernelState;redrawKernels();
}
function ensurePendingResponse(){if(pendingMessage)return;pendingMessage=addMessage('assistant','',true);pendingMessage.classList.add('pending');}
function addMessage(role,content,partial=false){
 const reuse=role==='assistant'&&pendingMessage,wrap=reuse||el('article','message '+role),head=reuse?wrap.querySelector('.message-header'):el('div','message-header');
 if(reuse){pendingMessage=null;wrap.classList.remove('pending');}
 if(!reuse){
   if(role==='assistant'){const identity=el('span','assistant-identity'),avatar=el('canvas','kernel chat-avatar');avatar.width=avatar.height=96;avatar.setAttribute('aria-hidden','true');identity.append(avatar,el('strong','assistant-name','Tom'));head.append(identity);}
   else{head.textContent=state?.settings.displayName??'You';head.dataset.userName='';}
 }
 wrap.classList.toggle('partial',partial);
 const body=reuse?wrap.querySelector('.message-body'):el('div','message-body');body.replaceChildren();
 if(Array.isArray(content)){for(const item of content){if(item.type==='text')body.append(document.createTextNode(item.text));if(item.type==='image_url'){const img=el('img','message-image');img.src=item.image_url.url;img.alt='Attached image';body.append(img);}}}
 else if(role==='assistant'&&!partial)body.append(linkedReply(content??''));else body.textContent=content??'';
 if(!reuse){wrap.append(head,body);$('#messages').append(wrap);}if(role==='assistant')dockResponseTools(head);return wrap;
}
function setCurrent(text,kind){setKernelState(kind);$('#activity').hidden=false;$('#current-event').textContent=text;$('#activity').dataset.kind=kind;}
function eventRow(e){if(['delta','action-stream','budget-status'].includes(e.kind))return;const row=el('li',`event-row ${e.kind}`),time=el('time','',new Date(e.time).toLocaleTimeString([],{hour12:false}));time.dateTime=e.time;const detail=el('div','',e.text);if(e.kind==='dispatch'||e.kind==='completion-rejected'||e.kind==='adapter'||e.kind==='decision'||e.kind==='input-snapshot'||e.kind==='response'||e.kind==='model'||e.kind==='context'||e.kind==='file'||e.kind==='check'){const d=el('details','event-inspector'),summary=el('summary','','Inspect '+(e.kind==='input-snapshot'?'model input':e.kind==='response'?'token usage':e.kind==='context'?'checkpoint':'details'));d.append(summary,el('pre','',JSON.stringify(e.detail,null,2)));detail.append(d);}if(e.kind==='output'){const d=el('details','event-inspector'),summary=el('summary','','Inspect command output · '+e.text.length.toLocaleString()+' characters');d.append(summary,el('pre','',e.text));detail.replaceChildren(d);}else if(e.detail?.arguments){const d=el('details'),s=el('summary','','View action');d.append(s,el('pre','',JSON.stringify(e.detail.arguments,null,2)));detail.append(d);}row.append(time,detail);$('#event-list').append(row);}
async function openFile(action,index,reveal=false){try{const result=await api('file/open',{action,index,reveal});toast(result.mode==='folder'?'Selected in your local folder.':'Opened locally.');}catch(e){toast(e.message);}}
function localFileCard(file){
 const card=el('div','local-file-card'),action=file.action??latestTask?.actions?.find(a=>a.result?.path===file.path&&a.status==='complete')?.id;
 const open=el('button','file-link');open.append(icon('file'),el('strong','',shortPath(file.path)),el('span','file-open-label','Open locally'));open.disabled=!action;open.onclick=()=>openFile(action,file.artifactIndex);
 const location=el('code','file-path',file.path),controls=el('div','file-controls'),folder=el('button','text-button','Show in folder'),copy=el('button','text-button','Copy path');folder.disabled=!action;folder.onclick=()=>openFile(action,file.artifactIndex,true);copy.onclick=async()=>{try{await navigator.clipboard.writeText(file.path);toast('Local path copied.');}catch{toast('Select the displayed path to copy it.');}};controls.append(folder,copy);card.append(open,location,controls);return card;
}
function fileCard(e){$('#messages').append(localFileCard(e.detail));}
function reviewCard(action){$('#review-area').replaceChildren();if(!action)return;const card=el('div','review-card'),a=action.body.arguments;card.append(el('h3','','An action to review'),el('p','',action.body.reviewDescription??a.summary));card.append(el('pre','',a.program?[a.program,...(a.args??[]).map(x=>JSON.stringify(x))].join(' '):JSON.stringify(a,null,2)));const controls=el('div','review-buttons');for(const [label,approved] of [['Decline',false],['Allow for this task',true]]){const b=el('button',approved?'primary-button':'secondary-button',label);b.onclick=async()=>{try{await api('review',{action:action.id,approved});$('#review-area').replaceChildren();}catch(e){toast(e.message);}};controls.append(b);}card.append(controls);$('#review-area').append(card);scrollDown();}
function searchRecovery(detail){const box=$('#search-recovery');box.replaceChildren();box.hidden=!detail;if(!detail)return;box.append(el('p','','The lookup could not finish. You can retry it or open the search yourself.'));const providers={google:'https://www.google.com/search?q=',bing:'https://www.bing.com/search?q=',brave:'https://search.brave.com/search?q=',duckduckgo:'https://duckduckgo.com/?q='};const link=el('a','secondary-button','Open this search in my browser');link.href=(providers[state?.settings.search]??providers.google)+encodeURIComponent(detail.query);link.target='_blank';link.rel='noopener noreferrer';box.append(link);}

function onEvent(e,replay=false){events.push(e);if(['context','context-pressure','model','start','start-new-request','complete','error','blocked','budget','stopped','paused'].includes(e.kind))renderContext();if(e.kind==='budget-status'){showBudget(e.detail);return;}if(e.kind==='browser-handoff')searchRecovery(e.detail);if(e.kind==='start'){searchRecovery(null);startTime=Date.parse(e.time);buttons('running');liveMessage=null;ensurePendingResponse();}
  if(e.kind==='delta'){
    const follow=nearBottom();if(!liveMessage)liveMessage=addMessage('assistant','',true);liveMessage.querySelector('.message-body').append(document.createTextNode(e.text));setCurrent(`Writing a reply · ${liveMessage.querySelector('.message-body').textContent.length.toLocaleString()} characters received`,'delta');if(follow)scrollDown();
  }else{
    if(e.kind==='response'){if(liveMessage){liveMessage.classList.remove('partial');const b=liveMessage.querySelector('.message-body');b.replaceChildren(linkedReply(b.textContent));}liveMessage=null;}
    else if(e.kind!=='context'||e.detail?.compacted!==false)setCurrent(e.text,e.kind==='action'&&e.detail?.tool==='write'?'delta':e.kind);
    eventRow(e);
    if(e.kind==='file'){fileCard(e);scrollDown();}
    if(e.kind==='review'){buttons('review');reviewCard(e.detail.action);}
    if(['complete','paused','stopped','error','blocked','budget'].includes(e.kind)&&!replay){if(liveMessage)liveMessage.classList.remove('partial');if(['complete','paused','stopped','budget','error','blocked'].includes(e.kind)){buttons(e.kind);$('#review-area').replaceChildren();}refresh().then(()=>{const t=state.tasks.find(t=>t.id===selected);if(t)buttons(t.status);}).catch(()=>{});}
  }
}
async function listen(id,after){stream?.abort();const controller=new AbortController();stream=controller;let last=after;try{
  const r=await fetch(`/api/tasks/${id}/events?after=${after}`,{headers:{'X-Tom-Key':key},signal:controller.signal});if(!r.ok)throw new Error('The activity stream could not connect.');const decoder=new TextDecoder();let buffer='';
  for await(const chunk of r.body){buffer+=decoder.decode(chunk,{stream:true});let i;while((i=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,i);buffer=buffer.slice(i+2);const data=frame.split('\n').find(x=>x.startsWith('data: '));if(data){const e=JSON.parse(data.slice(6));if(e.id>last&&selected===id){last=e.id;onEvent(e);}}}}
  if(!controller.signal.aborted&&selected===id){setCurrent('Connection closed. Reconnecting to saved activity…','connection');setTimeout(()=>{if(selected===id&&!controller.signal.aborted)listen(id,last);},1200);}
}catch(e){if(!controller.signal.aborted&&selected===id){setCurrent('Connection interrupted. Reconnecting to saved activity…','connection');setTimeout(()=>{if(selected===id&&!controller.signal.aborted)listen(id,last);},1500);}}}
async function selectTask(id){const version=++taskLoadVersion;stream?.abort();const task=await api(`tasks/${id}`);if(version!==taskLoadVersion)return;selected=id;latestTask=task;events=task.events;liveMessage=null;$('#home').hidden=true;$('#library').hidden=true;$('#conversation').hidden=false;$('#composer-area').hidden=false;parkResponseTools();$('#messages').replaceChildren();$('#event-list').replaceChildren();$('#review-area').replaceChildren();
  for(const m of task.messages)if(['assistant','user'].includes(m.role)&&m.content)addMessage(m.role,m.content);
  const lastSpeaker=task.messages.findLast(m=>['assistant','user'].includes(m.role));if(lastSpeaker?.role==='user'&&(task.events.length||['running','review'].includes(task.status)))ensurePendingResponse();
  for(const e of task.events){eventRow(e);if(e.kind==='file')fileCard(e);}
  // Restore only an unfinished reply; committed messages were rendered above.
  const lastResponse=task.events.findLastIndex(e=>e.kind==='response');const partial=task.events.slice(lastResponse+1).filter(e=>e.kind==='delta').map(e=>e.text).join('');if(partial&&['running','review','interrupted','stopped','paused','error'].includes(task.status))liveMessage=addMessage('assistant',partial,task.status==='running');
  renderContext();showBudget(task.budget);const last=task.events.at(-1),visibleLast=task.events.findLast(e=>e.kind!=='budget-status');if(visibleLast)setCurrent(visibleLast.text,visibleLast.kind);else $('#activity').hidden=false;
  searchRecovery(task.status==='blocked'?task.events.findLast(e=>e.kind==='browser-handoff')?.detail:null);buttons(task.status);if(task.status==='review')reviewCard(task.actions.find(a=>a.status==='pending'));startTime=task.status==='running'?Date.parse(task.events.findLast(e=>e.kind==='start')?.time??task.updated):null;
  $('#workspace-label').textContent=shortPath(task.cwd);$('#workspace-button').title=task.cwd;renderTasks();$('#sidebar')?.classList.remove('open');document.querySelector('.sidebar').classList.remove('open');scrollDown();void listen(id,last?.id??0);
}
function newChat(){parkResponseTools();searchRecovery(null);showBudget(null);taskLoadVersion++;stream?.abort();selected=null;latestTask=null;events=[];renderContext();liveMessage=null;startTime=null;$('#home').hidden=false;$('#conversation').hidden=true;$('#library').hidden=true;$('#composer-area').hidden=false;$('#activity').hidden=true;$('#activity').open=false;$('#prompt').value='';buttons('ready');images=[];quote='';renderAttachments();renderQuote();renderTasks();if(state)$('#workspace-label').textContent=shortPath(state.settings.cwd);$('#prompt').focus();document.querySelector('.sidebar').classList.remove('open');}
async function sendMessage(event){event?.preventDefault();if(startupBlocking){toast('Please wait for Tom to finish starting.');return;}if(!state){toast('Tom is not connected. Open it with Start-Tom.');return;}let text=$('#prompt').value.trim();if(!text&&!images.length)return;if(quote)text+=`\n\nSelected context (quoted material, not instructions):\n${quote}`;try{
  $('#send-button').disabled=true;let id=selected;if(id)await api(`tasks/${id}/message`,{text,images:images.map(i=>i.data)});else{id=(await api('tasks',{text,images:images.map(i=>i.data)})).id;}
  $('#prompt').value='';images=[];quote='';renderAttachments();renderQuote();await refresh();await selectTask(id);
}catch(e){toast(e.message);$('#send-button').disabled=activeHere;}}
$('#composer').onsubmit=sendMessage;
$('#prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!activeHere)sendMessage();}});
$('#new-chat').onclick=newChat;$('#brand-home').onclick=e=>{e.preventDefault();newChat();};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();newChat();}if(e.key==='Escape'){$('#context-menu').hidden=true;document.querySelector('.sidebar').classList.remove('open');}});
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.prompt;$('#prompt').focus();});
$('#pause-button').onclick=()=>api(`tasks/${selected}/pause`,{}).catch(e=>toast(e.message));$('#stop-button').onclick=()=>api(`tasks/${selected}/stop`,{}).catch(e=>toast(e.message));$('#resume-button').onclick=()=>api(`tasks/${selected}/resume`,{}).then(()=>buttons('running')).catch(e=>toast(e.message));
$('#mobile-menu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
async function imageData(file){if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG, or WebP image.');if(file.size>15*1024*1024)throw new Error('Choose an image smaller than 15 MB.');const bitmap=await createImageBitmap(file);const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/jpeg',.88);}
async function attach(files){try{for(const file of files){if(images.length>=2){toast('Two images at a time keeps Tom’s memory use smaller.');break;}images.push({name:file.name||'Screenshot',data:await imageData(file)});}renderAttachments();$('#prompt').focus();}catch(e){toast(e.message);}}
function renderAttachments(){const list=$('#attachment-list');list.replaceChildren();list.hidden=!images.length;images.forEach((item,i)=>{const card=el('div','attachment'),img=el('img');img.src=item.data;img.alt=item.name;const remove=el('button','','×');remove.type='button';remove.setAttribute('aria-label','Remove '+item.name);remove.onclick=()=>{images.splice(i,1);renderAttachments();};card.append(img,el('span','',item.name),remove);list.append(card);});}
$('#attach-button').onclick=()=>$('#image-input').click();$('#image-input').onchange=e=>{attach([...e.target.files]);e.target.value='';};$('#image-starter').onclick=()=>{$('#prompt').value='Help me understand this image.';$('#image-input').click();};
$('#prompt').addEventListener('paste',e=>{const files=[...e.clipboardData.files].filter(f=>f.type.startsWith('image/'));if(files.length){e.preventDefault();attach(files);}});
$('#composer').addEventListener('dragover',e=>e.preventDefault());$('#composer').addEventListener('drop',e=>{e.preventDefault();attach([...e.dataTransfer.files]);});
async function capture(){let media;try{if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Screen capture is unavailable here. Attach a screenshot file instead.');media=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});const video=document.createElement('video');video.srcObject=media;await video.play();const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));media.getTracks().forEach(t=>t.stop());media=null;await attach([new File([blob],'Screenshot.png',{type:'image/png'})]);}catch(e){if(e.name!=='NotAllowedError')toast(e.message);}finally{media?.getTracks().forEach(t=>t.stop());}}
$('#screenshot-button').onclick=capture;
function renderQuote(){$('#quote-context').hidden=!quote;$('#quote-context>span').textContent=quote;}
$('#remove-context').onclick=()=>{quote='';renderQuote();};
document.addEventListener('contextmenu',e=>{if(e.target.closest('textarea,input,select'))return;const text=window.getSelection()?.toString().trim();if(!text)return;e.preventDefault();selection=text.slice(0,8000);const menu=$('#context-menu');menu.hidden=false;menu.style.left=Math.max(8,Math.min(e.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(e.clientY,innerHeight-menu.offsetHeight-8))+'px';$('#ask-selection').focus();});
document.addEventListener('click',e=>{if(!e.target.closest('#context-menu'))$('#context-menu').hidden=true;});
$('#context-menu').onkeydown=e=>{const buttons=[...$('#context-menu').querySelectorAll('button')];let i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}};
function askSelection(){quote=selection;renderQuote();$('#context-menu').hidden=true;$('#prompt').value='Help me understand this.';$('#prompt').focus();}
$('#ask-selection').onclick=askSelection;$('#ask-screenshot').onclick=()=>{askSelection();capture();};
async function webSearch(query){if(!query.trim()){toast('Type a subject or select some text to search.');$('#prompt').focus();return;}try{const task=await api('research',{query:query.slice(0,2000),task:selected,images:images.map(i=>i.data)});$('#prompt').value='';quote='';images=[];renderQuote();renderAttachments();await refresh();await selectTask(task.id);}catch(e){toast(e.message);}}
$('#search-selection').onclick=()=>{$('#context-menu').hidden=true;webSearch(selection);};$('#web-button').onclick=()=>webSearch($('#prompt').value||quote);
async function settings(){try{await refresh();const b=state.settings.budget;$('#steps-setting').value=b.maxSteps;$('#tokens-setting').value=b.maxTokens;$('#minutes-setting').value=Math.ceil(b.maxActiveMs/60000);$('#response-setting').value=b.maxResponseTokens;const explanation=memoryExplanation(state);$('#context-description').textContent=explanation.context;$('#memory-explanation').textContent=explanation.memory;$('#name-setting').value=state.settings.displayName??'You';$('#cwd-setting').value=state.settings.cwd;$('#commands-setting').value=state.settings.commands;$('#search-setting').value=state.settings.search;const list=$('#browser-setting');list.replaceChildren();for(const b of state.browsers){const o=el('option','',b.name+(b.path?'':' · not detected'));o.value=b.id;o.disabled=!b.path;list.append(o);}list.value=state.settings.browser;$('#machine-short').textContent=`${state.machine.ramGiB} GB · CPU`;$('#machine-description').textContent=`${state.machine.cpu}. ${state.machine.availableGiB} GB currently available.`;$('#model-list').replaceChildren();for(const model of state.models){const row=el('div','model-row');row.append(el('span','',model.name),el('span','',model.reason));$('#model-list').append(row);}const inf=state.settings.inference??{};$('#acceleration-setting').value=inf.acceleration??'auto';$('#cache-setting').value=inf.kvCache??'auto';$('#graphics-note').textContent=state.performance?.hardware?.reason??'CPU compatibility mode is available.';$('#performance-recovery').hidden=!state.performance?.recovery;$('#performance-recovery').textContent=state.performance?.recovery?.message??'';$('#context-setting').max=state.contextLimit;$('#context-setting').value=state.context;$('#context-value').textContent=state.context.toLocaleString();$('#context-range-note').textContent=explanation.range;$('#threads-setting').max=Math.max(1,Math.min(8,state.machine.threads-1));$('#threads-setting').value=state.threads;$('#idle-setting').value=inf.idleUnloadMs??300000;$('#diagnostics-setting').checked=!!state.settings.diagnostics;$('#settings-dialog').showModal();}catch(e){toast(e.message);}}
document.querySelectorAll('.settings-trigger').forEach(b=>b.onclick=settings);$('#workspace-button').onclick=settings;
$('#settings-form').onsubmit=async e=>{e.preventDefault();try{await api('settings',{displayName:$('#name-setting').value,cwd:$('#cwd-setting').value,commands:$('#commands-setting').value,browser:$('#browser-setting').value,search:$('#search-setting').value,diagnostics:$('#diagnostics-setting').checked,inference:{acceleration:$('#acceleration-setting').value,kvCache:$('#cache-setting').value,context:Number($('#context-setting').value),threads:Number($('#threads-setting').value),idleUnloadMs:Number($('#idle-setting').value)},budget:{maxSteps:Number($('#steps-setting').value),maxTokens:Number($('#tokens-setting').value),maxActiveMs:Number($('#minutes-setting').value)*60000,maxResponseTokens:Number($('#response-setting').value)}});$('#settings-dialog').close();await refresh();toast('Preferences saved. New conversations use the selected folder.');}catch(e){toast(e.message);}};
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function openHelp(section){
 $('#help-search').value='';$('#help-search').dispatchEvent(new Event('input'));
 const guide=$('#state-guide');guide.replaceChildren();
 for(const item of kernelGuide){
  const row=el('li','state-guide-row'),canvas=el('canvas','kernel state-example');canvas.dataset.kernelState=item.event;canvas.width=canvas.height=96;canvas.setAttribute('aria-hidden','true');
  const copy=el('div');copy.append(el('strong','',item.name),el('code','face-examples',item.faces.join('  ')),el('p','',item.description));row.append(canvas,copy);guide.append(row);drawKernel(canvas,.2,item.event);
 }
 $('#about-dialog').showModal();$('#about-dialog').scrollTop=0;
 if(section){const target=$(section);target.open=true;target.scrollIntoView({block:'start'});target.querySelector('summary').focus({preventScroll:true});}
}
$('#help-button').onclick=()=>openHelp();$('#context-help').onclick=()=>openHelp('#context-help-section');
$('#check-updates').onclick=async()=>{
 const button=$('#check-updates'),status=$('#update-status'),link=$('#update-release-link');button.disabled=true;status.textContent='Checking published GitHub releases…';
 try{const result=await api('updates',{});status.textContent=result.message+(result.latest?' Installed '+result.current+' · Published '+result.latest+'.':'');link.href=result.url;link.textContent=result.status==='available'?'View the new release and installers':'Open GitHub releases';}
 catch{status.textContent='Unable to check for updates. Open GitHub releases or try again later.';}finally{button.disabled=false;}
};
$('#quit-button').onclick=async()=>{try{await api('quit',{});stream?.abort();$('#settings-dialog').close();$('#connection-error').textContent='Tom has closed. Your conversations are saved. Open Start-Tom.exe to return.';$('#connection-error').hidden=false;$('#send-button').disabled=true;buttons('stopped');$('#resume-button').hidden=true;$('#send-button').disabled=true;}catch(e){toast(e.message);}};
$('#copy-activity').onclick=async e=>{e.preventDefault();try{await navigator.clipboard.writeText(events.filter(e=>e.kind!=='delta').map(e=>`${e.time}  ${e.kind}  ${e.text}`).join('\n'));toast('Activity copied.');}catch{toast('Clipboard access was unavailable.');}};
$('#export-audit').onclick=async e=>{e.preventDefault();if(!selected)return;try{const record=await api('tasks/'+selected+'/audit'),url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='tom-task-'+selected+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Task record saved. It includes this task’s private inputs and results.');}catch(e){toast(e.message);}};
$('#library-button').onclick=async()=>{try{const files=await api('files');$('#file-count').textContent=files.length;$('#home').hidden=true;$('#conversation').hidden=true;$('#library').hidden=false;$('#composer-area').hidden=true;$('#library-files').replaceChildren();if(!files.length)$('#library-files').append(el('p','muted','Nothing here yet. Ask Tom to create a file and its verified result will appear here.'));for(const f of files){const row=el('div','library-row'),name=el('div','',shortPath(f.path));name.append(el('small','',f.title));const b=el('button','secondary-button','Open conversation');b.onclick=()=>selectTask(f.task);row.append(name,localFileCard(f),b);$('#library-files').append(row);}document.querySelector('.sidebar').classList.remove('open');}catch(e){toast(e.message);}};
setInterval(()=>{$('#elapsed').textContent=startTime?`${Math.max(0,Math.floor((Date.now()-startTime)/1000))}s`:'';},1000);


function applyTheme(theme){document.documentElement.dataset.theme=theme||'night';$('#theme-button').setAttribute('aria-label','Switch to '+(theme==='day'?'night':'day')+' theme');redrawKernels();}
$('#theme-button').onclick=async()=>{const theme=document.documentElement.dataset.theme==='day'?'night':'day';applyTheme(theme);try{await api('settings',{theme});state.settings.theme=theme;}catch(e){toast(e.message);}};
function showBudget(b){currentBudget=b;$('#budget-strip').hidden=!b;if(!b)return;$('#budget-label').textContent=b.usedSteps+'/'+b.maxSteps+' steps · '+Math.max(0,b.maxTokens-b.usedTokens-b.pendingTokens).toLocaleString()+' text tokens left · '+Math.max(0,Math.ceil((b.maxActiveMs-b.usedMs)/60000))+' min';}
$('#extend-budget').onclick=async()=>{if(!selected||!currentBudget)return;try{const result=await api('tasks/'+selected+'/extend',{grant:{maxSteps:12,maxTokens:6144,maxActiveMs:600000}});showBudget(result.budget);toast('Added 12 steps, 6,144 output tokens and 10 minutes. Press Resume to continue.');}catch(e){toast(e.message);}};

function renderSystem(data){if(!data)return;renderStartup(data);const wasBusy=systemState?.running;systemState=data;const report=data.report,busy=data.running;if(busy)setKernelState('running');else if(wasBusy&&!activeHere)setKernelState('ready');const eligible=(data.offers??[]).filter(o=>o.eligible);$('#system-banner').hidden=!busy&&!!report?.passed&&!eligible.length;$('#system-banner-text').textContent=!busy&&eligible.length?'This computer qualifies to try '+eligible.map(o=>o.name).join(', ')+'. Would you like to download and test an upgrade?':busy?(data.events.at(-1)?.text??'Checking this computer'):report?.reason??'Tom will run a local E2B check on this computer.';
 $('#system-summary').textContent=busy?'A short local check is measuring this computer. Your current model remains selected.':report?.reason??'Run the bundled model before considering a larger package.';
 $('#baseline-button').disabled=busy;$('#scan-button').disabled=busy;$('#cancel-check').hidden=!busy;
 const metrics=$('#system-metrics');metrics.replaceChildren();if(report?.metrics){for(const [label,value] of [['Writing speed · text pieces/s',report.metrics.decodeTps?report.metrics.decodeTps.toFixed(1)+' tok/s':'—'],['Wait for first text',report.metrics.firstTokenMs? (report.metrics.firstTokenMs/1000).toFixed(1)+'s':'—'],['Working space · tokens',Math.max(4096,...(report.contexts??[])).toLocaleString()],['Memory left for other apps',report.metrics.minimumFreeGiB?report.metrics.minimumFreeGiB.toFixed(1)+' GiB':'—']]){const box=el('div','system-metric');box.append(el('strong','',value),el('span','',label));metrics.append(box);}}
 $('#system-events').replaceChildren(...data.events.map(e=>el('li','',new Date(e.time).toLocaleTimeString()+' · '+e.text+(e.totalBytes?' · '+Math.round(e.bytes/e.totalBytes*100)+'%':''))));
 const offers=$('#upgrade-offers');offers.replaceChildren();for(const offer of data.offers??[]){const row=el('div','upgrade-offer');row.append(el('h3','',offer.name),el('p','setting-note',offer.reason),el('p','setting-note',(offer.downloadBytes/1073741824).toFixed(1)+' GiB download · '+offer.minAvailableGiB+' GiB free RAM required · '+offer.predictedDecodeTps+' tok/s rough estimate'));if(offer.eligible){const b=el('button','secondary-button','Download & test · '+(offer.downloadBytes/1073741824).toFixed(1)+' GiB');b.disabled=busy;b.onclick=()=>systemAction('trial',offer.id);row.append(b);}offers.append(row);}
 if(data.upgrade){const row=el('div','upgrade-offer');row.append(el('h3','',data.upgrade.config.model.name),el('p','setting-note',data.upgrade.reason));if(data.upgrade.passed){const b=el('button','primary-button','Use '+data.upgrade.config.model.name);b.disabled=busy;b.onclick=()=>systemAction('activate',data.upgrade.id);row.append(b);}offers.append(row);}
}
async function systemAction(action,model){try{await api('qualification',{action,model});await pollSystem();if(['activate','use-e2b'].includes(action))await refresh();}catch(e){toast(e.message);}}
async function pollSystem(){try{renderSystem(await api('qualification'));}catch(e){if(startupBlocking)startupFailure(e.message);else if($('#system-dialog').open)toast(e.message);}}
$('#upgrade-button').onclick=()=>{pollSystem();$('#system-dialog').showModal();};$('#system-banner-open').onclick=()=>$('#system-dialog').showModal();
$('#baseline-button').onclick=()=>systemAction('baseline');$('#scan-button').onclick=()=>systemAction('scan');$('#cancel-check').onclick=()=>systemAction('cancel');$('#use-e2b').onclick=()=>systemAction('use-e2b');
$('#context-setting').oninput=e=>$('#context-value').textContent=Number(e.target.value).toLocaleString();
setInterval(()=>{if(!document.hidden&&state&&(startupBlocking||systemState?.running||$('#system-dialog').open))pollSystem();},1000);
setInterval(()=>{if(!document.hidden&&state&&!$('#settings-dialog').open)refresh().catch(()=>{});},15000);

$('#repair-performance').onclick=async()=>{try{await api('settings',{inference:{}});await refresh();$('#acceleration-setting').value='auto';$('#cache-setting').value='auto';$('#context-setting').value=state.context;$('#context-value').textContent=state.context.toLocaleString();$('#threads-setting').value=state.threads;$('#idle-setting').value=300000;$('#performance-recovery').hidden=true;toast('Recommended performance settings restored.');}catch(e){toast(e.message);}};

function renderContext(){
 const m=contextSnapshot(events,state?.context??4096),pct=m.fraction===null?null:Math.round(m.fraction*100),warning=m.pressure||(pct!==null&&pct>=80);
 const label=m.pressure?'Context almost full · about to compact':warning?'Context almost full':m.compacted?'Context compacted':'Working context';
 $('#context-status').dataset.level=warning?'warning':'normal';
 $('#compaction-count').textContent=m.count;$('#context-arc').setAttribute('stroke-dasharray',`${pct??0} 100`);
 $('#context-label').textContent=warning?'Almost full':m.compacted?'Compacted':'Context';$('#context-detail').textContent=m.pressure?'About to compact':pct===null?'Not measured yet':`${pct}% used`;
 const description=`${label}. ${pct===null?'Usage not measured yet':`${(m.input+m.reserved).toLocaleString()} of ${m.total.toLocaleString()} tokens, including image and formatting reserve`}. ${m.count} compactions in this conversation. What is context? Open help.`;
 $('#context-help').setAttribute('aria-label',description);$('#context-help').title=description;
 const announcement=m.pressure?'Context almost full. About to compact.':m.compacted?`Context compacted. ${m.count} compactions in this conversation.`:warning?'Context almost full. Tom may shorten notes for the next step.':'';
 if($('#context-announcement').textContent!==announcement)$('#context-announcement').textContent=announcement;
}
function startupFailure(message){
 startupBlocking=true;pauseStartupUI(true);const dialog=$('#startup-dialog');if(!dialog.open)dialog.show();$('.startup-kernel').dataset.kernelState='error';setKernelState('error');redrawKernels();
 $('#startup-title').textContent='Tom could not finish starting.';$('#startup-detail').textContent=message;$('#startup-note').textContent='Reconnect to check the local service again. Your conversations are saved.';
 $('#startup-track').hidden=true;for(const id of ['cancel','retry','continue'])$('#startup-'+id).hidden=true;$('#startup-reconnect').hidden=false;
 $('#send-button').disabled=true;$('#web-button').disabled=true;$('#resume-button').disabled=true;
}
function pauseStartupUI(blocked){
 document.querySelector('.sidebar').inert=blocked;$('#content-scroll').inert=blocked;$('#composer-area').inert=blocked;
 $('#send-button').disabled=blocked||activeHere;$('#web-button').disabled=blocked;$('#resume-button').disabled=blocked;
}
function renderStartup(data){
 const loading=data.startup,hasStartup=!!loading,pending=['pending','running'].includes(loading?.phase),busy=pending||data.running;
 const attention=hasStartup?loading.phase==='attention':!busy&&data.report?.passed===false;
 const checkKey=data.report?.finished??data.report?.started??'check';
 const needsAttention=attention&&(hasStartup||startupAcknowledged!==checkKey);
 const wasBlocking=startupBlocking;startupBlocking=busy||needsAttention;
 pauseStartupUI(startupBlocking);
 const dialog=$('#startup-dialog');
 if(!startupBlocking){if(dialog.open)dialog.close();if(wasBlocking&&!activeHere)setKernelState(latestTask?.status??'ready');return;}
 if(!dialog.open)dialog.show();$('.startup-kernel').dataset.kernelState=busy?'running':'review';setKernelState(busy?'running':'review');redrawKernels();
 const entries=data.running&&!pending?data.events:(loading?.events?.length?loading.events:data.events??[]);
 $('#startup-title').textContent=busy?'Please wait. Tom is getting ready.':'Tom needs attention before it can finish loading.';
 $('#startup-detail').textContent=busy?(entries.at(-1)?.text??'Connecting to the local service…'):(loading?.error??data.report?.reason??'The check did not finish.');
 $('#startup-note').textContent=busy?'Chat is paused until the selected model is loaded and its readiness check passes. You can still open Help above.':loading?.canContinue?'The benchmark did not pass. Retry it, or continue to load the current model without repeating the benchmark.':'Chat remains paused. Retry startup after addressing the issue shown above.';
 const steps=loading?.steps??[{id:'checks',label:'Run local checks',status:busy?'running':'attention'},{id:'model',label:'Load the selected model',status:'waiting'},{id:'verify',label:'Verify the model is ready',status:'waiting'}];
 $('#startup-steps').replaceChildren(...steps.map(step=>{const row=el('li','',step.label);row.dataset.status=step.status;row.append(el('span','',({complete:'Done',skipped:'Saved check',running:'In progress',attention:'Needs attention',waiting:'Waiting'}[step.status]??step.status)));return row;}));
 const log=$('#startup-events'),logText=entries.slice(-8).map(e=>e.text).join('\n');
 if(log.dataset.content!==logText){const follow=log.scrollHeight-log.scrollTop-log.clientHeight<24,position=log.scrollTop;log.replaceChildren(...entries.slice(-8).map(e=>el('li','',e.text)));log.dataset.content=logText;log.scrollTop=follow?log.scrollHeight:position;}
 $('#startup-elapsed').textContent=loading?.started?Math.max(0,Math.floor((Date.now()-Date.parse(loading.started))/1000))+'s':'';
 $('#startup-track').hidden=!busy;$('#startup-cancel').hidden=!busy||loading?.phase==='pending';$('#startup-retry').hidden=busy;$('#startup-continue').hidden=busy||(hasStartup&&!loading.canContinue);$('#startup-reconnect').hidden=true;
 $('#startup-continue').onclick=()=>{if(hasStartup)startupAction('continue');else{startupAcknowledged=checkKey;renderStartup(data);}};
}
async function startupAction(action){try{await api('startup',{action});await pollSystem();}catch(e){startupFailure(e.message);}}
$('#startup-cancel').onclick=()=>systemState?.startup&&['pending','running'].includes(systemState.startup.phase)?startupAction('cancel'):systemAction('cancel');
$('#startup-retry').onclick=()=>{startupAcknowledged=null;systemState?.startup?startupAction('retry'):systemAction('baseline');};
$('#startup-reconnect').onclick=()=>location.reload();

async function initialize(){try{await api('startup',{action:'prepare'});await refresh();const target=fragment.get('task')??state.active;if(fragment.has('draft')){const draft=await api('drafts/'+fragment.get('draft'));newChat();$('#prompt').value=draft.text;quote=draft.quote;images=draft.images.map((data,i)=>({data,name:'Screenshot '+(i+1)}));renderQuote();renderAttachments();toast('Context attached. Add your question and send when ready.');}else if(target)await selectTask(target);}catch(e){$('#connection-error').textContent=e.message;$('#connection-error').hidden=false;$('#send-button').disabled=true;startupFailure(e.message);}}
void initialize();
