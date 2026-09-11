import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, title TEXT, cwd TEXT, status TEXT, created TEXT, updated TEXT);
      CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, task TEXT REFERENCES tasks(id), body TEXT);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, task TEXT REFERENCES tasks(id), kind TEXT, text TEXT, detail TEXT, time TEXT);
      CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, task TEXT REFERENCES tasks(id), status TEXT, body TEXT, result TEXT);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS budgets(task TEXT PRIMARY KEY REFERENCES tasks(id), body TEXT);
      CREATE TABLE IF NOT EXISTS checkpoints(task TEXT PRIMARY KEY REFERENCES tasks(id), body TEXT);
      CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, body TEXT, created TEXT);`);
    this.db.exec('CREATE TABLE IF NOT EXISTS work(task TEXT PRIMARY KEY REFERENCES tasks(id), body TEXT)');
    // Never replay a side effect merely because its completion record is missing.
    this.db.exec("UPDATE tasks SET status='interrupted' WHERE status IN ('running','pausing','review'); UPDATE actions SET status=CASE WHEN json_extract(body,'$.effect')='read' THEN 'failed' ELSE 'uncertain' END WHERE status='running'; UPDATE actions SET status='declined' WHERE status='pending'");
    for(const row of this.db.prepare('SELECT * FROM budgets').all()){const b=JSON.parse(row.body);if(b.pendingTokens){b.usedTokens+=b.pendingTokens;b.pendingTokens=0;this.saveBudget(row.task,b);}}
  }
  create(text, cwd) {
    const id = randomUUID(), now = new Date().toISOString();
    this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?)').run(id, text.slice(0, 70), cwd, 'ready', now, now);
    return this.task(id);
  }
  tasks() { return this.db.prepare('SELECT * FROM tasks ORDER BY updated DESC').all(); }
  fileCount() { return this.db.prepare("SELECT COALESCE(SUM(CASE WHEN json_array_length(result,'$.artifacts')>0 THEN json_array_length(result,'$.artifacts') WHEN json_extract(result,'$.verified')=1 THEN 1 ELSE 0 END),0) AS count FROM actions WHERE status='complete'").get().count; }
  files(){return this.db.prepare("SELECT actions.id,actions.task,actions.result,tasks.title FROM actions JOIN tasks ON tasks.id=actions.task WHERE actions.status='complete' AND (json_extract(actions.result,'$.verified')=1 OR json_array_length(actions.result,'$.artifacts')>0) ORDER BY tasks.updated DESC").all().flatMap(row=>{const r=JSON.parse(row.result),files=r.artifacts?.length?r.artifacts.map((f,artifactIndex)=>({...f,artifactIndex})):[r];return files.map(f=>({action:row.id,task:row.task,title:row.title,...f}));});}
  task(id) { return this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id); }
  status(id, status) { this.db.prepare('UPDATE tasks SET status=?, updated=? WHERE id=?').run(status, new Date().toISOString(), id); }
  message(id, body) { this.db.prepare('INSERT INTO messages(task,body) VALUES(?,?)').run(id, JSON.stringify(body)); }
  messages(id) { return this.db.prepare('SELECT body FROM messages WHERE task=? ORDER BY id').all(id).map(x => JSON.parse(x.body)); }
  replaceMessages(id,messages){this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM messages WHERE task=?').run(id);for(const m of messages)this.message(id,m);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  event(task, kind, text, detail = {}) {
    const time = new Date().toISOString();
    const {lastInsertRowid} = this.db.prepare('INSERT INTO events(task,kind,text,detail,time) VALUES(?,?,?,?,?)').run(task, kind, text, JSON.stringify(detail), time);
    return {id: Number(lastInsertRowid), task, kind, text, detail, time};
  }
  events(task, after = 0) { return this.db.prepare('SELECT * FROM events WHERE task=? AND id>? ORDER BY id').all(task, after).map(e => ({...e, detail: JSON.parse(e.detail)})); }
  action(task, body) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO actions VALUES(?,?,?,?,?)').run(id, task, 'pending', JSON.stringify(body), null);
    return this.getAction(id);
  }
  getAction(id) { const row = this.db.prepare('SELECT * FROM actions WHERE id=?').get(id); return row && {...row, body: JSON.parse(row.body), result: row.result && JSON.parse(row.result)}; }
  finishAction(id, status, result = null) { this.db.prepare('UPDATE actions SET status=?,result=? WHERE id=?').run(status, JSON.stringify(result), id); }
  actions(task) { return this.db.prepare('SELECT id FROM actions WHERE task=?').all(task).map(x => this.getAction(x.id)); }
  work(task){const row=this.db.prepare('SELECT body FROM work WHERE task=?').get(task);return row?JSON.parse(row.body):null;}
  saveWork(task,state){this.db.prepare('INSERT OR REPLACE INTO work VALUES(?,?)').run(task,JSON.stringify(state));}
  commitAction(action,status,result,task,state){this.db.exec('BEGIN IMMEDIATE');try{this.finishAction(action,status,result);this.saveWork(task,state);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  recall(task,{query='',id,offset=0,limit=3000}={}){
    const start=Math.max(0,Math.min(1000000,offset)),size=Math.max(100,Math.min(8000,limit));
    if(id){
      let content;
      if(id.startsWith('message:'))content=this.db.prepare('SELECT body FROM messages WHERE task=? AND id=?').get(task,Number(id.slice(8)))?.body;
      else content=this.db.prepare('SELECT result FROM actions WHERE task=? AND id=?').get(task,id)?.result;
      if(content===undefined||content===null)throw Error('Journal entry is unavailable in this task.');
      return {id,offset:start,total:content.length,content:content.slice(start,start+size),more:start+size<content.length};
    }
    const pattern='%'+String(query).replace(/[\\%_]/g,'\\$&')+'%';
    const actions=this.db.prepare("SELECT id,result AS content FROM actions WHERE task=? AND result LIKE ? ESCAPE '\\' ORDER BY rowid DESC LIMIT 8").all(task,pattern);
    const messages=this.db.prepare("SELECT 'message:'||id AS id,body AS content FROM messages WHERE task=? AND body LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 8").all(task,pattern);
    return {matches:[...actions,...messages].slice(0,12).map(r=>{const at=r.content.toLowerCase().indexOf(String(query).toLowerCase());return {id:r.id,excerpt:r.content.slice(Math.max(0,at-80),Math.max(0,at-80)+500)};})};
  }
  settings() {
    const settings={};
    for(const row of this.db.prepare('SELECT * FROM settings').all())try{settings[row.key]=JSON.parse(row.value);}catch{
      this.db.exec('CREATE TABLE IF NOT EXISTS damaged_settings(key TEXT, value TEXT, recovered TEXT)');
      this.db.prepare('INSERT INTO damaged_settings VALUES(?,?,?)').run(row.key,row.value,new Date().toISOString());
      this.db.prepare('DELETE FROM settings WHERE key=?').run(row.key);
    }
    return settings;
  }
  saveSettings(data) { for(const [k,v] of Object.entries(data)) this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(k, JSON.stringify(v)); }
  budget(task){const row=this.db.prepare('SELECT body FROM budgets WHERE task=?').get(task);return row&&JSON.parse(row.body);}
  saveBudget(task,data){this.db.prepare('INSERT OR REPLACE INTO budgets VALUES(?,?)').run(task,JSON.stringify(data));return data;}
  checkpoint(task){const row=this.db.prepare('SELECT body FROM checkpoints WHERE task=?').get(task);return row&&JSON.parse(row.body);}
  saveCheckpoint(task,data){this.db.prepare('INSERT OR REPLACE INTO checkpoints VALUES(?,?)').run(task,JSON.stringify(data));}
  resetCheckpoint(task){this.db.prepare('DELETE FROM checkpoints WHERE task=?').run(task);}
  createDraft(body){const id=randomUUID();this.db.prepare('INSERT INTO drafts VALUES(?,?,?)').run(id,JSON.stringify(body),new Date().toISOString());return id;}
  draft(id){const row=this.db.prepare('SELECT body FROM drafts WHERE id=?').get(id);return row&&JSON.parse(row.body);}
  close() { this.db.close(); }
}
