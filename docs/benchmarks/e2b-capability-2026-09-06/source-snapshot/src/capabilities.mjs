import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export function machineProfile() {
  return {platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model??'Unknown',threads:os.cpus().length,ramGiB:Math.round(os.totalmem()/1073741824),availableGiB:Math.round(os.freemem()/1073741824*10)/10};
}
export function modelOptions(machine, runtime) {
  // Memory estimates only decide which probes may run. A passing probe is mandatory before offering an install.
  return [
    {id:'gemma-4-e2b',name:'Gemma 4 E2B',estimatedAvailableGiB:5,bundled:true},
    {id:'gemma-4-e4b',name:'Gemma 4 E4B',estimatedAvailableGiB:9},
    {id:'gemma-4-12b',name:'Gemma 4 12B',estimatedAvailableGiB:14},
    {id:'gemma-4-26b-a4b',name:'Gemma 4 26B A4B',estimatedAvailableGiB:23},
    {id:'gemma-4-31b',name:'Gemma 4 31B',estimatedAvailableGiB:27}
  ].map(m=>({...m,canProbe:machine.availableGiB>=m.estimatedAvailableGiB,installable:!!(m.bundled&&runtime.verified),reason:m.bundled?(runtime.verified?'Files verified locally':'Waiting for verified model files'):(machine.availableGiB>=m.estimatedAvailableGiB?'Needs a pinned package and local trial':'Not enough available memory for the initial trial')}));
}
export function browserOptions() {
  const roots=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean);
  return [
    {id:'edge',name:'Microsoft Edge',channel:'msedge',relative:'Microsoft/Edge/Application/msedge.exe',automation:'Playwright supported'},
    {id:'chrome',name:'Google Chrome',channel:'chrome',relative:'Google/Chrome/Application/chrome.exe',automation:'Playwright supported'},
    {id:'brave',name:'Brave',relative:'BraveSoftware/Brave-Browser/Application/brave.exe',automation:'Compatibility trial required'},
    {id:'tor',name:'Tor Browser',relative:'Tor Browser/Browser/firefox.exe',automation:'Separate adapter required'}
  ].map(b=>({...b,path:roots.map(r=>path.join(r,b.relative)).find(p=>fs.existsSync(p))??null}));
}
