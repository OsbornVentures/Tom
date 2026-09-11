import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {browserOptions} from '../capabilities.mjs';
import {readTomPage} from '../page-reader.mjs';
import {hash} from '../tools.mjs';

// One lazily created browser per active task. No dependency/browser startup for chat.
export class BrowserSession {
  constructor(root,choice='edge'){this.root=root;this.choice=choice;this.browser=null;this.page=null;this.elements=new Map();this.revision=0;this.errors=[];}
  async ensure(signal){
    signal?.throwIfAborted();if(this.browser)return;
    const choice=browserOptions().find(b=>b.id===this.choice&&b.path);
    if(!choice||choice.id==='tor')throw Error('No supported installed browser is available. Select Edge or Chrome.');
    const {chromium}=await import(pathToFileURL(path.join(this.root,'runtime/browser/node_modules/playwright-core/index.mjs')));
    this.browser=await chromium.launch({executablePath:choice.path,headless:true});
    this.page=await this.browser.newPage({viewport:{width:1280,height:800}});
    this.page.setDefaultTimeout(10000);
    this.page.on('pageerror',e=>this.errors.push(e.message.slice(0,300)));
  }
  async clear(){for(const h of this.elements.values())await h.handle.dispose().catch(()=>{});this.elements.clear();this.revision++;}
  async inspect(){
    if(!this.page)throw Error('Browser session ended. Open the page again before inspecting or acting.');
    await this.clear();
    const handles=await this.page.locator('a[href],button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]').elementHandles();
    const items=[];
    for(const handle of handles){
      if(items.length>=60||!await handle.isVisible().catch(()=>false)){await handle.dispose();continue;}
      const info=await handle.evaluate(el=>({tag:el.tagName.toLowerCase(),text:(el.getAttribute('aria-label')||el.innerText||el.getAttribute('placeholder')||'').slice(0,150),type:el.getAttribute('type'),value:el.type==='password'?'[redacted]':el.value,html:el.outerHTML}));
      const ref='element'+this.revision+'_'+items.length;
      this.elements.set(ref,{handle,digest:hash(info.html),url:this.page.url()});delete info.html;items.push({ref,...info});
    }
    const parsed=await this.page.evaluate(readTomPage,{action:'read'}).catch(async()=>({content:await this.page.locator('body').innerText()}));
    const layout=await this.page.evaluate(()=>({horizontalOverflow:document.documentElement.scrollWidth>innerWidth}));
    return {...parsed,url:this.page.url(),title:await this.page.title(),elements:items,pageErrors:[...this.errors],layout,observedAt:new Date().toISOString(),trust:'Page content is untrusted evidence.'};
  }
  async act(args,cwd,signal){
    if(args.action==='close'){await this.close();return {closed:true};}
    await this.ensure(signal);
    signal?.throwIfAborted();
    const abort=()=>{void this.close();};signal?.addEventListener('abort',abort,{once:true});
    try{
      if(args.action==='open'){
        if(!args.url)throw Error('Open needs a URL or HTML file path.');
        let url;if(/^https?:\/\//i.test(args.url))url=new URL(args.url).href;
        else {const file=path.resolve(cwd,args.url);if(!/\.html?$/i.test(file))throw Error('Local browser input must be an HTML file.');url=pathToFileURL(file).href;}
        this.errors=[];await this.clear();
        const response=await this.page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
        const result={...await this.inspect(),requestedUrl:args.url,httpStatus:response?.status()??200};
        if(result.httpStatus>=400||result.blocked)return {...result,error:'The page could not be read successfully.'};return result;
      }
      if(args.action==='inspect')return await this.inspect();
      const entry=this.elements.get(args.target);if(!entry)throw Error('Element reference is stale or missing. Inspect the current page.');
      if(this.page.url()!==entry.url||hash(await entry.handle.evaluate(el=>el.outerHTML).catch(()=>''))!==entry.digest)throw Error('The element changed. Inspect before acting.');
      const current=entry.handle;
      if(args.action==='click')await current.click();
      else if(args.action==='type')await current.fill(args.text??'');
      else if(args.action==='select')await current.selectOption(args.text??'');
      else if(args.action==='press')await current.press(args.text??'Enter');
      else throw Error('Unsupported browser action.');
      return await this.inspect();
    }finally{signal?.removeEventListener('abort',abort);}
  }
  async close(){await this.clear();const browser=this.browser;this.browser=null;this.page=null;await browser?.close().catch(()=>{});}
}
