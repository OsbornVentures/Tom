import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {savedArtifact,localFileMode,openLocalArtifact} from '../src/local-files.mjs';

test('only recorded completed artifacts can be opened, including native command outputs',()=>{
 const file={path:path.resolve('example.txt'),verified:true},action={status:'complete',result:file};
 assert.equal(savedArtifact(action),file);
 assert.equal(savedArtifact({status:'complete',result:{artifacts:[file]}},0),file);
 for(const index of [-1,0.5,'0',1])assert.throws(()=>savedArtifact({status:'complete',result:{artifacts:[file]}},index));
 assert.throws(()=>savedArtifact({...action,status:'pending'}));
 assert.throws(()=>savedArtifact({status:'complete',result:{path:file.path}}));
 assert.throws(()=>savedArtifact({status:'complete',result:{path:'relative.txt',verified:true}}));
});
test('code opens as text and executable or unknown files are revealed without execution',()=>{
 for(const ext of ['js','mjs','ps1','cmd','bat','vbs','py'])assert.equal(localFileMode('result.'+ext),'text');
 for(const ext of ['exe','com','lnk','url','msi','scr','unknown'])assert.equal(localFileMode('result.'+ext),'folder');
 for(const ext of ['pdf','docx','xlsx','html','png'])assert.equal(localFileMode('result.'+ext),'open');
 assert.equal(localFileMode('report.pdf',true),'folder');
});
test('opening a local file preserves spaces, quotes and shell metacharacters as literal filename data',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tom-local-open-'));
 try{
   const file={path:path.join(dir,"Tom's report $(whoami) & notes.txt"),verified:true};await fs.writeFile(file.path,'saved');
   let observed;
   const launch=(program,args,options)=>{observed={program,args,options};const child=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};setImmediate(()=>child.emit('exit',0));return child;};
   const result=await openLocalArtifact({status:'complete',result:file},undefined,{launch,platform:'win32'});
   assert.equal(result.path,file.path);assert.equal(result.mode,'text');assert.equal(observed.options.windowsHide,true);
   const script=Buffer.from(observed.args.at(-1),'base64').toString('utf16le');assert.ok(script.includes("$file='"+file.path.replaceAll("'","''")+"';"));assert.match(script,/notepad\.exe/);
   await fs.unlink(file.path);await assert.rejects(openLocalArtifact({status:'complete',result:file},undefined,{launch,platform:'win32'}),/moved or been deleted/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
