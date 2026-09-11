import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function normalizeDisplayName(value){
  if(typeof value!=='string'||/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value))throw Error('Enter a name of 1–60 characters on one line.');
  const name=value.trim();if(!name||name.length>60)throw Error('Enter a name of 1–60 characters.');return name;
}
export class Profile {
  constructor(root){this.file=path.join(root,'.state','profile.json');this.displayName='';}
  async init(){
    try{this.displayName=normalizeDisplayName(JSON.parse((await fs.readFile(this.file,'utf8')).replace(/^\uFEFF/,'')).displayName);}
    catch{let fallback;try{fallback=os.userInfo().username;}catch{fallback=process.env.USERNAME??'You';}await this.save(fallback);}
    return this;
  }
  async save(value){const displayName=normalizeDisplayName(value);await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',JSON.stringify({displayName},null,2));await fs.rename(this.file+'.tmp',this.file);this.displayName=displayName;}
}
