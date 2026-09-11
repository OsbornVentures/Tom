import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),[file,destination]=process.argv.slice(2);
const db=new DatabaseSync(file,{readOnly:true});
const events=db.prepare('SELECT task,kind,text,detail,time FROM events ORDER BY id').all().filter(e=>['input-snapshot','context','dispatch','response','complete','error','blocked','budget','tool-error','completion-rejected'].includes(e.kind)).map(e=>{const detail=JSON.parse(e.detail);if(e.kind==='input-snapshot')delete detail.tokenIds;return {...e,detail};});db.close();
const text=JSON.stringify(events,null,2).replaceAll(JSON.stringify(root).slice(1,-1),'<workspace>').replaceAll(root.replaceAll('\\','/'),'<workspace>');
await fs.writeFile(destination,text);console.log('Exported '+events.length+' synthetic diagnostic events; token IDs omitted and workspace paths redacted.');
