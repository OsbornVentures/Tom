import path from 'node:path';
import fs from 'node:fs/promises';
import {hash} from './tools.mjs';
import {relevance} from './relevance.mjs';

export const messageText=m=>typeof m?.content==='string'?m.content:(m?.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');
export function requestContract(history){
 const index=history.findLastIndex(m=>m.role==='user'),text=messageText(history[index]);
 const offline=/\b(?:offline|no (?:new )?research|do not search|don't search)\b/i.test(text);
 const requireSearch=!offline&&/research this subject using the web|search (?:the )?web|search online|web search|look up.{0,60}online/i.test(text);
 const html=/(?:\b(?:webpage|website|web page)\b|\.html?\b)/i.test(text)&&/\b(?:build|create|make|save|write|edit|revis\w*|change|copy)\b/i.test(text);
 const inspectHtml=html&&!/(?:do not|don't|never)\s+(?:open|run|render|launch|browse|execute)/i.test(text);
 const outputNames=[...text.matchAll(/\b(?:create|save|write|update|edit|revised copy|named|copy named)\b[^\n!?]{0,65}?\b([\w-]+\.(?:html?|txt|md|json|css|js|csv))\b/gi)].map(m=>m[1]);
 const fileWork=html||outputNames.length>0;
 const maxCharacters=Number(text.match(/\bunder\s+([\d,]+)\s+(?:characters|chars)\b/i)?.[1]?.replaceAll(',',''))||null;
 const sourceFiles=/\bread\b/i.test(text)?[...new Set([...text.replace(/https?:\/\/\S+/g,'').matchAll(/\b[\w-]+\.(?:txt|md|json|csv|html?)\b/gi)].map(m=>m[0]).filter(n=>!outputNames.includes(n)))]:[];
 const requestedUrls=[...text.matchAll(/https?:\/\/[^\s<>"')]+/g)].map(m=>m[0].replace(/[.,;]$/,''));
 const web=requireSearch||(!/do not (?:open|visit|browse)|don't (?:open|visit|browse)/i.test(text)&&requestedUrls.length>0&&/read|open|visit|compare|summarize|check/i.test(text));
 return {index,text,web,requireSearch,html,inspectHtml,fileWork,maxCharacters,sourceFiles,outputs:[...new Set(outputNames)],requestedUrls,minSources:requireSearch?2:web?new Set(requestedUrls).size:0};
}
export function currentActions(history,actions,contract=requestContract(history)){
 const calls=new Set(history.slice(contract.index+1).flatMap(m=>(m.tool_calls??[]).map(c=>c.id)));
 return actions.filter(a=>calls.has(a.body.callId));
}
export function browserPage(action){try{return action.result?.page??JSON.parse(action.result?.output??'null');}catch{return null;}}
export function evidenceState(contract,actions){
 const successes=actions.filter(a=>a.status==='complete'&&a.result?.exitCode===0&&!a.result?.timedOut&&!a.result?.cancelled);
 const browser=successes.filter(a=>a.body.name==='shell'&&a.body.arguments?.program==='tom-browser').map(a=>({action:a,page:browserPage(a)})).filter(x=>x.page&&x.page.httpStatus>=200&&x.page.httpStatus<300&&!x.page.blocked);
 const searches=browser.filter(x=>x.page.results?.length&&(!contract.requireSearch||relevance(contract.text,{title:x.page.query}).passed));
 const allReads=browser.filter(x=>typeof x.page.content==='string'&&x.page.content.trim().length>40&&!x.page.results);
 const reads=allReads.filter(x=>!contract.requireSearch||searches.some(s=>relevance(s.page.query??contract.text,x.page).passed));
 const readUrls=new Set(reads.map(x=>x.page.url));
 const sources=[...new Map([...contract.requestedUrls.map(url=>({url,title:'Requested source'})),...searches.flatMap(x=>x.page.results),...reads.flatMap(x=>x.page.links??[])].map(s=>[s.url,s])).values()].filter(s=>/^https?:\/\//.test(s.url));
 const writes=[...new Map(actions.filter(a=>a.status==='complete'&&a.body.name==='write'&&a.result?.verified).map(a=>[process.platform==='win32'?a.result.path.toLowerCase():a.result.path,a])).values()];
 const outputs=contract.outputs.length?contract.outputs:contract.html?['an HTML page']:[];
 const missing=outputs.filter(name=>!writes.some(a=>name==='an HTML page'?/\.html?$/i.test(a.result.path):path.basename(a.result.path).toLowerCase()===name.toLowerCase()));
 const unreadFiles=(contract.sourceFiles??[]).filter(name=>!successes.some(a=>a.body.name==='shell'&&a.body.arguments?.program==='cat'&&a.body.arguments.args.includes(name)));
 const failedEdit=actions.findLast(a=>a.status==='failed'&&a.body.name==='write'&&a.body.arguments?.copyFrom);
 if(failedEdit){const source=failedEdit.body.arguments.copyFrom,later=actions.slice(actions.indexOf(failedEdit)+1);if(!later.some(a=>successes.includes(a)&&a.body.arguments?.program==='cat'&&a.body.arguments.args.includes(source))&&!unreadFiles.includes(source))unreadFiles.push(source);}
 if(unreadFiles.length)missing.push('Read each requested source file: '+unreadFiles.join(', '));
 if(contract.fileWork&&!writes.length&&!missing.length)missing.push('a verified file');
 if(contract.fileWork&&contract.maxCharacters&&writes.some(a=>a.result.characters>=contract.maxCharacters))missing.push('Keep each requested file under '+contract.maxCharacters+' characters; shorten the saved file.');
 if(contract.inspectHtml&&writes.some(a=>/\.html?$/i.test(a.result.path)&&a.result.browserCheck?.passed!==true))missing.push('a successful browser inspection of the saved page');
 if(contract.requireSearch&&!searches.length)missing.push('a successful web search');
 if(contract.web&&readUrls.size<contract.minSources)missing.push(`${contract.minSources-readUrls.size} more distinct successful source read(s)`);
 const seenUrls=new Set(allReads.flatMap(x=>[x.page.url,x.action.body.arguments.args[x.action.body.arguments.args.indexOf('--url')+1]]));
 const requestedReadUrls=new Set(reads.flatMap(x=>[x.page.url,x.action.body.arguments.args[x.action.body.arguments.args.indexOf('--url')+1]]));
 const missingRequested=contract.requestedUrls.filter(u=>!requestedReadUrls.has(u));
 if(contract.web&&missingRequested.length)missing.push('Read the requested URL(s): '+missingRequested.join(', '));
 const query=searches.map(s=>s.page.query).join(' ');
 const urls=(missingRequested.length?missingRequested:sources.filter(s=>!seenUrls.has(s.url)).sort((a,b)=>relevance(query,b).matched.length-relevance(query,a).matched.length).map(s=>s.url)).slice(0,6);
 const browserStage=contract.web?(contract.requireSearch&&(!searches.length||!urls.length&&readUrls.size<contract.minSources)?'search':readUrls.size<contract.minSources||missingRequested.length?'read':null):null;
 return {canAnswer:missing.length===0,missing,writes,reads,searches,sources,unreadFiles,readUrls:[...readUrls],citableUrls:[...requestedReadUrls],browserStage,urls};
}
export async function verifyCompletion(contract,evidence,text){
 const missing=[...evidence.missing];
 for(const action of evidence.writes){try{if(hash(await fs.readFile(action.result.path))!==action.result.sha256)missing.push('The saved file changed after verification: '+path.basename(action.result.path));}catch{missing.push('The saved file is no longer readable: '+path.basename(action.result.path));}}
 if(contract.web){
   const links=[...text.matchAll(/https?:\/\/[^\s<>"\]`*]+/g)].map(m=>m[0].replace(/[).,;]+$/,''));
   const observed=new Set((evidence.citableUrls??evidence.readUrls).map(u=>u.replace(/\/$/,'')));
   if(links.some(u=>!observed.has(u.replace(/\/$/,''))))missing.push('The answer cites a page that was not successfully read.');
 }
 return {passed:!missing.length,missing};
}
export function evidenceInstruction(contract,evidence){
 const next=evidence.browserStage==='search'?'Use shell tom-browser to search with short topic keywords. Put the specific subject before a publisher or brand. If the earlier query failed or returned unrelated pages, rephrase it once; if providers require verification, report blocked.':evidence.browserStage==='read'?'Use shell tom-browser to read one of these observed URLs: '+JSON.stringify(evidence.sources.filter(s=>evidence.urls.includes(s.url)).map(s=>({title:s.title,url:s.url}))) :evidence.canAnswer?'The required evidence exists. Answer the latest request using these results.':'Complete the missing deliverable with write, then verify it.';
 return '[Task evidence controller] Missing evidence: '+JSON.stringify(evidence.missing)+'\n'+(evidence.unreadFiles?.length?'First use shell cat to read an unread requested file: '+JSON.stringify(evidence.unreadFiles):next)+(contract.web&&evidence.readUrls.length?'\nSuccessfully read sources: '+JSON.stringify(evidence.readUrls):'');
}
