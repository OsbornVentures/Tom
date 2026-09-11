import path from 'node:path';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';

export function savedArtifact(action,index){
 const file=index===undefined||index===null?action?.result:Number.isInteger(index)&&index>=0?action?.result?.artifacts?.[index]:null;
 if(action?.status!=='complete'||!file?.verified||typeof file.path!=='string'||!path.isAbsolute(file.path))throw Error('No saved local file is available for this action.');
 return file;
}
// Code opens as text; unknown/executable formats are selected in Explorer.
export function localFileMode(file,reveal=false){
 if(reveal)return 'folder';
 const ext=path.extname(file).toLowerCase();
 if(/^(\.(txt|md|json|js|mjs|cjs|ts|tsx|jsx|py|ps1|bat|cmd|sh|vbs|wsf|css|xml|yaml|yml|toml|log|ini|c|cpp|h|rs|sql))$/.test(ext))return 'text';
 return /^(\.(pdf|docx|xlsx|pptx|csv|rtf|html|htm|png|jpg|jpeg|gif|webp|bmp|mp3|mp4|wav))$/.test(ext)?'open':'folder';
}
export async function openLocalArtifact(action,index,{reveal=false,launch=spawn,platform=process.platform}={}){
 const file=savedArtifact(action,index);
 if(!(await fs.stat(file.path).catch(()=>null))?.isFile())throw Error('This file has moved or been deleted. Its recorded path is shown in the conversation.');
 if(platform!=='win32')throw Error('Opening local files is available in the Windows app. Copy the displayed path to open it.');
 const mode=localFileMode(file.path,reveal),literal="'"+file.path.replaceAll("'","''")+"'";
 // Encoded transport and literal strings keep filenames out of shell syntax.
 const script="$ErrorActionPreference='Stop'; $file="+literal+"; "+(mode==='folder'
   ? "Start-Process -FilePath explorer.exe -ArgumentList ('/select,\"'+$file+'\"')"
   : mode==='text'?"Start-Process -FilePath notepad.exe -ArgumentList ('\"'+$file+'\"')"
   : "$info=New-Object System.Diagnostics.ProcessStartInfo; $info.FileName=$file; $info.WorkingDirectory=[IO.Path]::GetDirectoryName($file); $info.UseShellExecute=$true; [Diagnostics.Process]::Start($info) | Out-Null");
 const child=launch(path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 await new Promise((resolve,reject)=>{
   let error='';const timeout=setTimeout(()=>{child.kill();reject(Error('Windows took too long to open this file. Try Show in folder.'));},15000);
   child.stderr?.on('data',d=>error+=d.toString().slice(0,2000));
   child.once('error',e=>{clearTimeout(timeout);reject(e);});
   child.once('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('Windows could not open this file. Try Show in folder.'+(error?' '+error.trim().slice(0,250):'')));});
 });
 return {ok:true,path:file.path,mode};
}
