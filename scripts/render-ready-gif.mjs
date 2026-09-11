// Render the real UI avatar into a reusable marketing loop.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'output/tom-ready');await fs.mkdir(path.join(out,'frames'),{recursive:true});
const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/kernel.js'?'text/javascript':'text/html');res.end(req.url==='/kernel.js'?await fs.readFile(path.join(root,'public/kernel.js')):'<!doctype html><html data-theme="night"><body><canvas id="frame" width="800" height="480"></canvas></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(path.join(root,'runtime/browser/node_modules/playwright-core/index.mjs'))),browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 for(let i=0;i<168;i++){
   const data=await page.evaluate(async phase=>{
     const {drawKernel}=await import('/kernel.js'),canvas=document.querySelector('#frame'),c=canvas.getContext('2d');
     const gradient=c.createRadialGradient(230,220,10,370,220,530);gradient.addColorStop(0,'#102820');gradient.addColorStop(1,'#081211');c.fillStyle=gradient;c.fillRect(0,0,800,480);
     c.strokeStyle='#294039';c.lineWidth=1;c.strokeRect(24.5,24.5,751,431);
     const avatar=document.createElement('canvas');avatar.width=avatar.height=280;drawKernel(avatar,phase,'ready');c.drawImage(avatar,71,105,250,250);
     c.textAlign='left';c.textBaseline='alphabetic';c.fillStyle='#10b981';c.font='600 11px "Segoe UI"';c.letterSpacing='2px';c.fillText('YOUR LOCAL PERSONAL AI',350,154);
     c.letterSpacing='-2px';c.fillStyle='#e3f2e9';c.font='bold 78px "Segoe UI"';c.fillText('Tom',345,235);
     c.letterSpacing='0px';c.fillStyle='#b8cec4';c.font='20px "Segoe UI"';c.fillText('Ready when you are.',350,278);
     c.fillStyle='#8ca59b';c.font='11px "Segoe UI"';c.letterSpacing='1px';c.fillText('PRIVATE BY PLACE. PRESENT BY DESIGN.',53,420);
     c.textAlign='right';c.fillStyle='#10b981';c.font='600 10px "Segoe UI"';c.fillText('READY',746,420);c.letterSpacing='0px';
     return canvas.toDataURL('image/png').split(',')[1];
   },i/168);
   await fs.writeFile(path.join(out,'frames',String(i).padStart(3,'0')+'.png'),Buffer.from(data,'base64'));
 }
 await fs.copyFile(path.join(out,'frames/000.png'),path.join(out,'Tom-Ready-preview.png'));console.log('Rendered 168 frames of the actual ready avatar.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
