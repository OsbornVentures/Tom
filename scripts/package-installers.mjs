import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createDeflateRaw} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const destination=path.resolve(process.argv[2]??path.join(root,'dist','Tom-beta-0.5.2'));
await fs.mkdir(destination);const payload=path.join(destination,'build','payload');await fs.mkdir(payload,{recursive:true});
const product=JSON.parse(await fs.readFile(path.join(root,'config/product.json'))),config=JSON.parse(await fs.readFile(path.join(root,'config/runtime.json')));
const sources=JSON.parse(await fs.readFile(path.join(root,'config/setup-sources.json')));
const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const digest=async file=>{const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');};
const copy=async relative=>{const dest=path.join(payload,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.cp(path.join(root,relative),dest,{recursive:true});};
for(const relative of ['src','public','config','licenses','browser-extension','runtime/browser','runtime/node.exe','README.md','LICENSE','NOTICE','THIRD_PARTY_NOTICES.md','scripts/integrate-windows.ps1',config.model.path,config.vision.path])await copy(relative);
const launcher=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/build-launcher.ps1'),'-Destination',path.join(payload,'Start-Tom.exe')],{windowsHide:true,encoding:'utf8'});if(launcher.status!==0)throw new Error(launcher.stdout+launcher.stderr);
for(const name of await fs.readdir(path.join(root,'docs')))if(name.endsWith('.md'))await copy('docs/'+name);
const nativeNames=new Set(['ggml.dll','ggml-base.dll','ggml-rpc.dll','ggml-vulkan.dll','libomp.dll','llama.dll','llama-common.dll','llama-server.exe','llama-server-impl.dll','mtmd.dll','LICENSE-LLVM-OpenMP']);
const msRuntime=/^(msvcp140|vcruntime140|concrt140|vcamp140|vccorlib140|vcomp140).*\.dll$/;
for(const folder of ['llama','vulkan']){
 const pinned=JSON.parse(await fs.readFile(path.join(root,folder==='llama'?'config/runtime-components.json':'config/gpu-runtime.json')));
 const components=[];for(const name of await fs.readdir(path.join(root,'runtime',folder)))if(nativeNames.has(name)||/^ggml-cpu-.*\.dll$/.test(name)){const relative=`runtime/${folder}/${name}`;await copy(relative);const sha256=await digest(path.join(payload,relative));if(name.endsWith('.dll')||name.endsWith('.exe'))if((pinned.components??pinned).find(c=>c.path===relative)?.sha256!==sha256)throw new Error('Pinned native component mismatch: '+relative);components.push({path:relative,sha256});}
 const file=path.join(payload,folder==='llama'?'config/runtime-components.json':'config/gpu-runtime.json');
 await fs.writeFile(file,JSON.stringify(folder==='llama'?components:{...JSON.parse(await fs.readFile(file)),components},null,2));
}
const assemblyInfo=path.join(destination,'build','AssemblyInfo.cs');await fs.writeFile(assemblyInfo,`using System.Reflection;\n[assembly: AssemblyTitle("Tom Setup")]\n[assembly: AssemblyProduct("Tom")]\n[assembly: AssemblyDescription("Tom local personal assistant")]\n[assembly: AssemblyVersion("${product.version}.0")]\n[assembly: AssemblyFileVersion("${product.version}.0")]\n`);
function compile(output,main,resources=[]){const args=['/nologo','/target:winexe','/platform:anycpu',`/main:${main}`,`/win32icon:${path.join(root,'design-assets/kernel.ico')}`,`/win32manifest:${path.join(root,'scripts/app.manifest')}`, ...['System','System.Core','System.Drawing','System.Windows.Forms','System.Web.Extensions','System.IO.Compression','System.IO.Compression.FileSystem'].map(n=>`/reference:${n}.dll`),`/out:${output}`,assemblyInfo,...['Setup.cs','SetupBrand.cs','Uninstall.cs'].map(n=>path.join(root,'scripts',n)),...resources.map(([file,name])=>`/resource:${file},${name}`)];const r=spawnSync(compiler,args,{windowsHide:true,encoding:'utf8'});if(r.status!==0)throw new Error(r.stdout+r.stderr);}
compile(path.join(payload,'Uninstall-Tom.exe'),'TomUninstall');
const all=[];async function walk(dir,relative=''){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const rel=relative+entry.name;if(entry.isDirectory())await walk(path.join(dir,entry.name),rel+'/');else all.push(rel);}}await walk(payload);all.sort();
const files=[];for(const relative of all){const full=path.join(payload,relative);files.push({path:relative,bytes:(await fs.stat(full)).size,sha256:await digest(full)});}
// The executable and model pins must still match the source release configuration.
for(const artifact of [config.model,config.vision,{path:config.executable,sha256:config.sha256}])if(files.find(f=>f.path===artifact.path)?.sha256!==artifact.sha256)throw new Error('Pinned artifact mismatch: '+artifact.path);
const archiveInfo=async(id,file,url)=>({id,url,bytes:(await fs.stat(path.join(root,file))).size,sha256:await digest(path.join(root,file))});
const archives=[await archiveInfo('cpu','runtime/llama-b10809.zip','https://github.com/ggml-org/llama.cpp/releases/download/b10809/llama-b10809-bin-win-cpu-x64.zip'),await archiveInfo('vulkan','runtime/llama-b10809-vulkan.zip','https://github.com/ggml-org/llama.cpp/releases/download/b10809/llama-b10809-bin-win-vulkan-x64.zip')];
for(const archive of archives)if(archive.sha256!==sources[archive.id].sha256||archive.url!==sources[archive.id].url)throw new Error('Vendor archive pin mismatch: '+archive.id);
if(files.find(f=>f.path==='runtime/node.exe').sha256!==sources.node.sha256)throw new Error('Pinned Node checksum mismatch');
const nodeVersion=spawnSync(path.join(root,'runtime/node.exe'),['--version'],{encoding:'utf8',windowsHide:true}).stdout.trim();
const packed=path.join(destination,'build','compressed');await fs.mkdir(packed);const compressed=new Map();
const reuse=process.argv[3]?path.resolve(process.argv[3]):null;
const cached=reuse?JSON.parse(await fs.readFile(path.join(reuse,'build/offline-manifest.json'))).files:[];
let index=0;for(const entry of files){const temp=path.join(packed,String(index++)),old=cached.findIndex(f=>f.path===entry.path&&f.sha256===entry.sha256&&f.bytes===entry.bytes);if(old>=0)await fs.copyFile(path.join(reuse,'build/compressed',String(old)),temp);else await pipeline(createReadStream(path.join(payload,entry.path)),createDeflateRaw({level:1}),createWriteStream(temp));compressed.set(entry.path,{file:temp,bytes:(await fs.stat(temp)).size});if(entry.path.startsWith('models/'))console.log('Packed '+path.basename(entry.path));}
for(const mode of ['offline','network']){
 let offset=0;const entries=files.map(entry=>{
  if(mode==='network'){
   if(entry.path.startsWith('models/'))return {...entry,url:`https://huggingface.co/${config.model.repo}/resolve/${config.model.revision}/${path.basename(entry.path)}`};
   if(entry.path==='runtime/node.exe')return {...entry,url:sources.node.url};
   const native=entry.path.match(/^runtime\/(llama|vulkan)\/(.+)$/);
   if(native&&!msRuntime.test(native[2]))return {...entry,archive:native[1]==='llama'?'cpu':'vulkan',archiveEntry:native[2]};
  }
  const packed=compressed.get(entry.path),result={...entry,offset,compressedBytes:packed.bytes};offset+=packed.bytes;return result;
 });
 const manifest={product:'Tom',version:product.version,mode,totalBytes:files.reduce((s,f)=>s+f.bytes,0),files:entries,archives:mode==='network'?archives:[]};
 const manifestFile=path.join(destination,'build',`${mode}-manifest.json`);await fs.writeFile(manifestFile,JSON.stringify(manifest));
 const output=path.join(destination,`Tom-${product.version}-${mode==='offline'?'Offline':'Network'}-Setup.exe`);
 compile(output,'TomSetup',[[manifestFile,'payload-manifest.json'],[path.join(root,'THIRD_PARTY_NOTICES.md'),'notices.txt']]);
 const stubBytes=(await fs.stat(output)).size;
 for(const entry of entries)if(entry.offset!==undefined)await pipeline(createReadStream(compressed.get(entry.path).file),createWriteStream(output,{flags:'a'}));
 const footer=Buffer.alloc(16);footer.writeBigInt64LE(BigInt(stubBytes));footer.write('TOMPKG01',8);await fs.appendFile(output,footer);
 const sha256=await digest(output);await fs.writeFile(output+'.sha256',sha256+'  '+path.basename(output)+'\n');console.log(JSON.stringify({mode,file:output,bytes:(await fs.stat(output)).size,sha256}));
}
await fs.writeFile(path.join(destination,'READ-ME.txt'),`Tom ${product.version} beta\n\nShare either Setup.exe on its own.\nOffline: complete app, CPU/Vulkan runtimes, E2B model and vision. Offline after system prerequisites are installed.\nNetwork: downloads pinned models, Node and llama.cpp directly from the original vendors. No Tom hosting is required. Vendor access and availability can change.\n\nWindows 10/11, Intel or AMD x64. 8 GB RAM recommended; 16 GB preferred. Microsoft Visual C++ x64 runtime and a supported browser are separate system prerequisites. Install them before going offline. https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist\nLower-end physical PC qualification is pending.\nInstall for the current Windows account; no administrator login normally needed. Run setup again for repair/update. Conversations and preferences are retained. Remove using Windows Installed apps or Uninstall-Tom.exe.\nThis beta is unsigned. Signing and physical hardware qualification are still required before a commercial release.\n\nThe build folder contains private build intermediates and is not needed for distribution.\n`);
