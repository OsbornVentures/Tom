// Open the real recovery link from the reported failed conversation.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../runtime/browser/node_modules/playwright-core/index.mjs';
const session=JSON.parse(await fs.readFile('.state/session.json','utf8')),url=new URL(session.url),fragment=new URLSearchParams(url.hash.slice(1));
fragment.set('task','41fecd89-6f0e-4dda-894e-88b76fc58a1e');url.hash=fragment.toString();
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto(url.href);
 const link=page.getByRole('link',{name:'Open this search in my browser'});await link.waitFor();
 assert.equal(new URL(await link.getAttribute('href')).searchParams.get('q'),'cookie recipes');
 const popupReady=page.waitForEvent('popup');await link.click();const popup=await popupReady;
 await popup.waitForURL(u=>u.protocol==='https:'&&u.hostname==='www.google.com');
 await popup.waitForLoadState('domcontentloaded');
 const result={passed:true,originalFailedConversation:true,openedUrl:popup.url(),title:await popup.title()};
 await fs.writeFile('audit/search-link-live.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
