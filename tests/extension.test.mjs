import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8');
function setup(key='a'.repeat(64)){
  const calls={menus:[],fetches:[],captures:0,options:0,tabs:[]};let installed,click;
  const chrome={runtime:{onInstalled:{addListener:f=>installed=f},openOptionsPage:async()=>calls.options++},action:{onClicked:{addListener:()=>{}}},contextMenus:{create:m=>calls.menus.push(m),onClicked:{addListener:f=>click=f}},storage:{session:{get:async()=>({key}),set:async()=>{}}},tabs:{captureVisibleTab:async()=>{calls.captures++;return 'data:image/jpeg;base64,AAAA';},create:async t=>calls.tabs.push(t)}};
  vm.runInNewContext(source,{chrome,fetch:async(url,options)=>{calls.fetches.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({id:'task-one'})};}});
  return{calls,installed,click};
}
test('Ask Tom uses selected text and captures no screenshot by default',async()=>{const s=setup();s.installed();assert.equal(s.calls.menus.length,3);await s.click({menuItemId:'tom-ask',selectionText:'A subject'},{url:'https://example.com',windowId:1});assert.equal(s.calls.captures,0);assert.match(s.calls.fetches[0].body.text,/A subject/);assert.equal(s.calls.tabs.length,1);});
test('screenshot is captured only for the explicit screenshot menu action',async()=>{const s=setup();await s.click({menuItemId:'tom-image',selectionText:'A subject'},{url:'https://example.com',windowId:1});assert.equal(s.calls.captures,1);assert.equal(s.calls.fetches[0].body.images.length,1);});
test('an unpaired extension opens pairing without reading or sending page content',async()=>{const s=setup(null);await s.click({menuItemId:'tom-ask',selectionText:'A subject'},{url:'https://example.com',windowId:1});assert.equal(s.calls.options,1);assert.equal(s.calls.fetches.length,0);assert.equal(s.calls.captures,0);});
