// Independent acceptance check for the small, button-driven branching adventure.
// Stronger than page-load/first-click smoke checks; does not modify the HTML.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash} from '../src/tools.mjs';
const root=path.resolve(import.meta.dirname,'..'),files=process.argv.slice(2);
if(!files.length)throw Error('Supply HTML files to check.');
const {chromium}=await import(pathToFileURL(path.join(root,'runtime/browser/node_modules/playwright-core/index.mjs')));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const requested of files){
  const file=path.resolve(requested),source=await fs.readFile(file),context=await browser.newContext();
  await context.route('http://**',r=>r.abort());await context.route('https://**',r=>r.abort());
  const queue=[[]],seen=new Set(),nodes=[],failures=[];let limited=false;
  try{while(queue.length&&nodes.length<32){
    const route=queue.shift();if(route.length>6){limited=true;continue;}
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
    try{
      await page.goto(pathToFileURL(file).href,{timeout:10000});
      const buttons=()=>page.locator('button,input[type=button],input[type=submit],[role=button]');
      for(const index of route){if(index>=await buttons().count())throw Error('A recorded choice is no longer reachable.');await buttons().nth(index).click({timeout:2000});await page.waitForTimeout(750);}
      const text=await page.locator('body').innerText(),labels=await buttons().allTextContents(),signature=JSON.stringify([text,labels]);
      if(errors.length)failures.push({route,error:errors.join('; ')});
      if(seen.has(signature))continue;seen.add(signature);
      const ordinary=labels.map((label,index)=>({label,index})).filter(b=>!/(?:restart|try again|play again|new game|start over)/i.test(b.label));
      const story=page.locator('#story,#scene,#result,#game-text').first(),endingText=await story.count()?await story.innerText():text;
      const win=/\b(?:victory|you win|you won)\b/i.test(endingText),loss=/\b(?:death|you died|you lose|you lost|game over)\b/i.test(endingText);
      const terminal=!ordinary.length&&(win!==loss)?win?'victory':'death':null;
      const deadEnd=!ordinary.length&&!terminal;
      const node={route,text,labels,terminal,deadEnd,pageErrors:errors};nodes.push(node);
      if(deadEnd)failures.push({route,error:'No playable choice and no recognizable ending.'});
      if(terminal&&!nodes.slice(0,-1).some(n=>n.terminal===terminal))await page.screenshot({path:path.join(path.dirname(file),'ending-'+terminal+'.png'),fullPage:true});
      if(!terminal)for(const b of ordinary)queue.push([...route,b.index]);
    }catch(e){failures.push({route,error:e.message});}finally{await page.close();}
  }}finally{await context.close();}
  limited||=queue.length>0;
  const victory=nodes.some(n=>n.terminal==='victory'),death=nodes.some(n=>n.terminal==='death');
  const report={format:'tom-branching-game-check-v1',sha256:hash(source),passed:victory&&death&&!failures.length&&!limited,victory,death,limited,failures,nodes,scope:'Reachable button-driven states, at most 32 unique states and six choices deep, recognizable victory/death endings, no script errors or dead ends; HTTP(S) blocked. Not a general game benchmark.',checked:new Date().toISOString()};
  await fs.writeFile(path.join(path.dirname(file),'functional-check.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({file,passed:report.passed,victory,death,states:nodes.length,failures,limited}));
}}finally{await browser.close();}
