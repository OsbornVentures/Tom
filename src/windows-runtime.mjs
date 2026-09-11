import path from 'node:path';
import {stat} from 'node:fs/promises';

export const windowsRuntimeHelp='Install the latest Microsoft Visual C++ x64 runtime using the link in Help → Components and licenses, then retry startup.';

// Check the application's native folder and Windows' x64 system folder. Do not
// borrow runtime DLLs from unrelated development tools on PATH.
export async function requireWindowsRuntime(nativeFolder,{platform=process.platform,systemFolder=path.join(process.env.SystemRoot??'C:\\Windows','System32'),exists=async file=>{try{return (await stat(file)).isFile();}catch{return false;}}}={}){
 if(platform!=='win32')return;
 for(const name of ['vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll']){
  if(await exists(path.join(nativeFolder,name))||await exists(path.join(systemFolder,name)))continue;
  throw Object.assign(new Error('A required Windows runtime is missing. '+windowsRuntimeHelp),{noRetry:true,code:'TOM_WINDOWS_RUNTIME_MISSING'});
 }
}
