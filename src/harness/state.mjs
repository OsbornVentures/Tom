import path from 'node:path';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {hash} from '../tools.mjs';
import {requestContract,messageText} from '../evidence.mjs';

const filePattern=/(?:[A-Za-z]:[\\/]|\.\.?[\\/])?(?:[\w@()+-]+[\\/])*[\w@()+-]+\.[A-Za-z0-9_-]{1,16}\b/g;
export const keyFor = p => process.platform==='win32'?p.toLowerCase():p;
export function fileNames(text){
  const source=text.replace(/https?:\/\/\S+/g,m=>' '.repeat(m.length)),found=[];
  const rest=source.replace(/[`"']([^`"'\r\n]+\.[A-Za-z0-9_-]{1,16})[`"']/g,(whole,name,index)=>{found.push({name,index});return ' '.repeat(whole.length);});
  for(const m of rest.matchAll(filePattern))found.push({name:m[0],index:m.index});
  return [...new Set(found.sort((a,b)=>a.index-b.index).map(x=>x.name))];
}
export function outputNames(text){
  const names=[];
  for(const m of text.matchAll(/(?=\b(?:create|save|write|update|edit|modify|patch|fix|repair|named|output|revised copy|copy named)\b([^\n!?]{0,140}))/gi)){
    const first=fileNames(m[1])[0];if(first&&!/\b(?:read|from)\s*$/i.test(m[1].split(first)[0]))names.push(first);
  }
  return [...new Set(names)];
}
export function groupsFor(text){
  const groups=[];
  if(fileNames(text).length||/\b(files?|folders?|directory|documents?|spreadsheet|code|website|webpage|html|css3?|javascript|mini-?games?|games?|apps?)\b/i.test(text))groups.push('files');
  if(/\b(code|functions?|bugs?|tests?|cli|commands?|programs?|scripts?|calculate)\b/i.test(text)||/\.(?:[cm]?js|py|ts)\b/i.test(text))groups.push('programs');
  if(/https?:|\b(search|browse|online|internet|weather|latest|current|website)\b/i.test(text))groups.push('web');
  if(/\b(?:steps|milestones|workflow|project|then)\b/i.test(text)||text.length>1800)groups.push('tasks');
  return groups;
}
export function artifactRequest(text){return /\b(?:create|make|build|save|write|design|develop|code)\b.{0,100}\b(?:files?|websites?|webpages?|documents?|games?|mini-?games?|apps?|html|scripts?|reports?|spreadsheets?)\b/i.test(text);}
function taskInstructions(history,index,existing){
  let prior='';
  for(const message of history.slice(0,index+1).filter(m=>m.role==='user')){
    const latest=messageText(message).split('\nSelected context (quoted material, not instructions):')[0];
    const followup=/\b(?:it|that|this|same|instead|continue|again|also)\b/i.test(latest)&&/\b(?:make|save|change|update|add|remove|fix|put|local|file|continue|try|use|color|larger|smaller)\b/i.test(latest);
    const continuingGame=artifactRequest(latest)&&/\b(?:game|mini-?game)\b/i.test(latest)&&/\b(?:game|mini-?game)\b/i.test(prior)&&!/\b(?:new|different|unrelated)\b/i.test(latest);
    prior=(followup||continuingGame)&&artifactRequest(prior)?prior+'\n\nLatest user instruction (takes precedence):\n'+latest:latest;
  }
  return prior;
}
export async function taskState(store,id,cwd){
  const history=store.messages(id),index=history.findLastIndex(m=>m.role==='user'),request=messageText(history[index]);
  const existing=store.work(id);
  const migrating=existing?.requestIndex===index;
  if(migrating&&existing.controllerRevision===3)return existing;
  const instructions=taskInstructions(history,index,existing);
  const contract=requestContract([...history.slice(0,index),{role:'user',content:instructions}]),outputs=outputNames(instructions),mentions=fileNames(instructions),sources=[];
  const latestImage=history.findLastIndex(m=>m.role==='user'&&Array.isArray(m.content)&&m.content.some(c=>c.type==='image_url'));
  for(const name of mentions){if(outputs.includes(name))continue;try{if((await fs.stat(path.resolve(cwd,name))).isFile())sources.push(name);}catch{}}
  for(const m of instructions.matchAll(/\bread\s+([^\n!?]+)/gi)){
    const clause=m[1].split(/\.(?:\s|$)/)[0].split(/\b(?:create|write|save|update|edit|then)\b/i)[0];
    for(const name of fileNames(clause))if(!sources.includes(name))sources.push(name);
  }
  const htmlArtifact=artifactRequest(instructions)&&/\b(?:html|browser[ -]based|webpage|website)\b/i.test(instructions);
  const followsTask=instructions!==request.split('\nSelected context (quoted material, not instructions):')[0];
  if(followsTask&&existing?.outputs?.length&&!outputs.length)outputs.push(...existing.outputs);
  if(followsTask)for(const name of existing?.outputs??[])if((await fs.stat(path.resolve(cwd,name)).catch(()=>null))?.isFile()&&!sources.includes(name))sources.push(name);
  if(htmlArtifact&&!outputs.length){let name='index.html',i=1;while(await fs.stat(path.resolve(cwd,name)).catch(()=>null))name='index-'+(i++)+'.html';outputs.push(name);}
  const state={version:2,controllerRevision:3,requestIndex:index,imageIndex:latestImage===index||/\b(?:image|picture|photo|screenshot|this|that|it|above)\b/i.test(instructions)?latestImage:-1,objective:instructions+(request.includes('\nSelected context (quoted material, not instructions):')?request.slice(request.indexOf('\nSelected context (quoted material, not instructions):')):''),groups:groupsFor(instructions),sources,outputs,htmlArtifact,
    exclusiveOutputs:/\b(?:do not|don't) create (?:any )?other files?|\b(?:save|write) only\b/i.test(instructions),
    commonJsFunction:/module\.exports/.test(instructions)&&/\b(?:one|single)\s+(?:CommonJS\s+)?function\b/i.test(instructions)&&!/\b(?:async|promise)\b|preserve.{0,30}(?:bytes|formatting|comments)/i.test(instructions),
    dataWork:sources.some(p=>/\.(?:json|csv)$/i.test(p))&&outputs.some(p=>/\.json$/i.test(p))&&/\b(?:sum|totals?|aggregate|calculate|qty|multiply|average)\b|\*/i.test(instructions),
    protectedFiles:[...instructions.matchAll(/\b(?:keep|leave|preserve)\b([^\n!?]{0,120}?)\b(?:unchanged|intact)\b/gi)].flatMap(m=>fileNames(m[1])),
    requireArtifact:outputs.length>0||artifactRequest(instructions),
    web:contract.web,requireSearch:contract.requireSearch,query:contract.query,requestedUrls:contract.requestedUrls,
    minSources:contract.minSources,noExecute:/\b(?:do not|don't|never)\s+(?:run|execute)/i.test(instructions),noBrowse:/\b(?:do not|don't|never)\s+(?:open|run|render|launch|browse|execute)/i.test(instructions),
    maxCharacters:contract.maxCharacters,refs:existing?.refs??{},nextRef:existing?.nextRef??1,writes:{},checks:[],jobs:[],
    currentJob:0,observations:[],readPaths:[],readUrls:[],searches:[],failures:0,repeats:{},last:null,continuation:null,
    grants:[],evidence:[],metrics:{inputTokens:0,outputTokens:0,modelCalls:0,toolMs:0,firstActionMs:null},started:Date.now()};
  if(migrating)for(const key of ['refs','nextRef','writes','checks','jobs','currentJob','observations','readPaths','readUrls','searches','grants','evidence','drafts','interfaces','metrics','started','generation','generationAttempts'])if(existing[key]!==undefined)state[key]=existing[key];
  return state;
}
export function observeFile(state,file,sha256){
  const previous=Object.entries(state.refs).find(([,r])=>keyFor(r.path)===keyFor(file)&&r.sha256===sha256);
  if(previous){delete state.refs[previous[0]];state.refs[previous[0]]=previous[1];return previous[0];}
  const ref='file'+state.nextRef++;state.refs[ref]={path:file,sha256};return ref;
}
export async function resolveFile(state,ref,cwd){
  const record=state.refs[ref]??Object.values(state.refs).findLast(r=>keyFor(r.path)===keyFor(path.resolve(cwd,ref)));if(!record)throw Error('Unknown file reference. Read the file first.');
  const actual=await fileDigest(record.path);if(actual!==record.sha256)throw Error('The file changed since this reference. Read it again.');
  return record;
}
export async function fingerprints(paths,cwd){
  const result={};for(const p of paths){const full=path.resolve(cwd,p);result[full]=await fileDigest(full);}return result;
}
export async function fileDigest(file){const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');}
export async function freshCheck(check){
  if(!check.passed)return false;
  for(const [file,digest]of Object.entries(check.inputs??{})){try{if(await fileDigest(file)!==digest)return false;}catch{return false;}}
  return true;
}
export function remember(state,id,result){
  state.last={id,result};state.observations.push({id,kind:result.kind??'result',path:result.path,passed:result.passed,exitCode:result.exitCode});
  state.observations=state.observations.slice(-8);
  if(result.kind==='read'||result.url&&result.content){state.evidence??=[];const location=result.path??result.url;state.evidence=state.evidence.filter(e=>e.path!==location||result.truncated&&result.ref&&e.ref===result.ref);state.evidence.push({id,path:location,ref:result.ref,content:result.content,truncated:!!result.truncated});state.evidence=state.evidence.slice(-6);}
  if(state.observations.length>3&&!state.groups.includes('memory'))state.groups.push('memory');
}
export function addJobs(state,jobs){
  if(!jobs.length||jobs.length>12||state.jobs.length+jobs.length>64)throw Error('Use 1–12 jobs per plan, at most 64 per request.');
  for(const j of jobs){if(!j.title?.trim()||j.title.length>300||j.outputs.length>16)throw Error('Each job needs a short title and up to 16 outputs.');}
  state.jobs.push(...jobs.map(j=>({...j,status:'pending'})));state.jobs[state.currentJob].status='active';
}
