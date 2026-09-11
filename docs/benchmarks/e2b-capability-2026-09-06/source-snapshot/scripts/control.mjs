import fs from 'node:fs/promises';
const {url}=JSON.parse(await fs.readFile('.state/session.json','utf8')),u=new URL(url),key=new URLSearchParams(u.hash.slice(1)).get('key');
const command=process.argv[2]??'state';if(!['state','quit'].includes(command))throw new Error('Choose state or quit.');
const r=await fetch(u.origin+'/api/'+command,{method:command==='quit'?'POST':'GET',headers:{'X-Tom-Key':key,'Content-Type':'application/json'},body:command==='quit'?'{}':undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);console.log(command==='quit'?'Tom shut down.':JSON.stringify({active:data.active,runtime:data.runtime,machine:data.machine}));
