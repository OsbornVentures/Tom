// A portable shell `cat` adapter: literal file arguments, no shell evaluation.
import {createReadStream} from 'node:fs';
import {once} from 'node:events';
const files=process.argv.slice(2);
if(!files.length||files.some(f=>f.startsWith('-')))throw new Error('cat accepts literal file paths in this adapter.');
for(const file of files)for await(const chunk of createReadStream(file)){if(!process.stdout.write(chunk))await once(process.stdout,'drain');}
