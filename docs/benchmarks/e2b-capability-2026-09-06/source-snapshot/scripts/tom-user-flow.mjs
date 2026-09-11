// Live production-model UI check: type the reported prompts and click Send.
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {chromium} from '../runtime/browser/node_modules/playwright-core/index.mjs';
const session=JSON.parse(await fs.readFile('.state/session.json','utf8')),connection=new URL(session.url),headers={'X-Tom-Key':new URLSearchParams(connection.hash.slice(1)).get('key')};
const api=async route=>(await fetch(connection.origin+'/api/'+route,{headers})).json();
assert.equal((await api('state')).active,null,'Tom already has an active user task.');
const browser=await chromium.launch({channel:'msedge',headless:true});
const previous=process.argv.includes('--retry-last')?JSON.parse(await fs.readFile('audit/tom-user-flow.json','utf8')):null;
const checks=previous?.checks??[],prior=previous?checks.pop():null,previousFailures=[...(previous?.previousFailures??[]),...(prior?[prior]:[])];
try{
 const page=await browser.newPage({viewport:{width:1180,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(prior){const fragment=new URLSearchParams(connection.hash.slice(1));fragment.set('task',prior.id);connection.hash=fragment.toString();await page.goto(connection.href);}else{await page.goto(session.url);await page.locator('#new-chat').click();}
 let id=prior?.id;
 const cases=prior?[[checks.length,prior.prompt]]:[...['What is the weathe rin lorena tx','can you search it?','can you search the web for cookie recipes?'].entries()];
 for(const [index,prompt] of cases){
  await page.locator('#prompt').fill(prompt);
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&/\/api\/tasks(?:$|\/[^/]+\/message$)/.test(new URL(r.url()).pathname));
  await page.locator('#send-button').click();const posted=await response;assert.ok(posted.ok());const data=await posted.json();id??=data.id;
  console.log('Submitted through Tom UI: '+prompt);
  let task,lastEvent=0;const until=Date.now()+600000;
  while(Date.now()<until){await delay(5000);task=await api('tasks/'+id);const event=task.events.at(-1);if(event?.id!==lastEvent){lastEvent=event?.id;console.log(JSON.stringify({case:index+1,status:task.status,latest:event?.text?.slice(0,160)}));}if(!['running','pausing','review','ready'].includes(task.status))break;}
  const answer=task.messages.slice(task.messages.findLastIndex(m=>m.role==='user')+1).filter(m=>m.role==='assistant'&&m.content).at(-1)?.content;
  await page.screenshot({path:'audit/tom-user-flow-'+(index+1)+'.png',fullPage:true});
  checks.push({prompt,id,status:task.status,answer});await fs.writeFile('audit/tom-user-flow.json',JSON.stringify({checks,previousFailures,errors},null,2));
  console.log(JSON.stringify({case:index+1,status:task.status,answer}));assert.equal(task.status,'complete');assert.match(answer,/https?:\/\//);assert.match(answer,index===2?/cookie/i:/Lorena/i);assert.doesNotMatch(answer,/cannot (?:directly )?search|do not have real.time|connect ask tom/i);
 }
 assert.deepEqual(errors,[]);console.log('PASS: all three screenshot prompts completed through the production Tom chat UI.');
}finally{await browser.close();}
