// Marketing exports use Tom's real canvas renderer; no simulated model results.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'output/launch-052');
await fs.mkdir(path.join(out,'thumbnail-frames'),{recursive:true});
const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/kernel.js'?'text/javascript':'text/html');res.end(req.url==='/kernel.js'?await fs.readFile(path.join(root,'public/kernel.js')):'<!doctype html><html data-theme="night"><canvas></canvas></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(path.join(root,'runtime/browser/node_modules/playwright-core/index.mjs'))),browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 for(let i=0;i<168;i++){
  const data=await page.evaluate(async p=>{const {drawKernel}=await import('/kernel.js'),c=document.querySelector('canvas');c.width=c.height=240;const g=c.getContext('2d');g.fillStyle='#081211';g.fillRect(0,0,240,240);const a=document.createElement('canvas');a.width=a.height=216;drawKernel(a,p,'ready');g.drawImage(a,12,12);return c.toDataURL().split(',')[1];},i/168);
  await fs.writeFile(path.join(out,'thumbnail-frames',String(i).padStart(3,'0')+'.png'),Buffer.from(data,'base64'));
 }
 const data=await page.evaluate(async()=>{
  const {drawKernel,kernelGuide}=await import('/kernel.js'),c=document.querySelector('canvas');c.width=1270;c.height=760;const g=c.getContext('2d');
  g.fillStyle='#081211';g.fillRect(0,0,1270,760);g.textBaseline='top';g.fillStyle='#10b981';g.font='600 17px Segoe UI';g.fillText('TOM / 0.5.2 BETA',62,42);g.fillStyle='#e3f2e9';g.font='bold 42px Segoe UI';g.fillText('A face for what is happening.',60,76);g.fillStyle='#9db8ab';g.font='20px Segoe UI';g.fillText('Nine activity states from the actual Tom interface.',62,136);
  const names=['Ready','Reading','Preparing an action','Running a command','Writing','Checking a result','Compacting context','Needs attention','Stopped on an error'];
  kernelGuide.forEach((state,i)=>{const x=62+(i%3)*396,y=204+Math.floor(i/3)*158;g.fillStyle='#10211e';g.fillRect(x,y,360,132);const a=document.createElement('canvas');a.width=a.height=108;drawKernel(a,.12,state.event);g.drawImage(a,x+12,y+12);g.fillStyle='#e3f2e9';g.font='600 20px Segoe UI';g.fillText(names[i],x+132,y+42);g.fillStyle='#87a396';g.font='15px Segoe UI';g.fillText(i===7?'Review the event':i===8?'Check before retrying':'Visible harness activity',x+132,y+74);});
  g.fillStyle='#9db8ab';g.font='17px Segoe UI';g.fillText('Expressions describe activity. They are not model emotions.',62,710);return c.toDataURL().split(',')[1];
 });
 await fs.writeFile(path.join(out,'tom-nine-states.png'),Buffer.from(data,'base64'));console.log('Rendered thumbnail frames and 1270 × 760 activity gallery.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
