import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const base=process.env.TOM_TEST_MODULES??path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(base,'playwright'));
const {url}=JSON.parse(await fs.readFile('.state/session.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.getByRole('button',{name:'New conversation',exact:false}).waitFor();await page.waitForFunction(()=>document.querySelector('#workspace-label').textContent!=='Your workspace');
  await page.getByRole('button',{name:'New conversation',exact:false}).click();await page.screenshot({path:'audit/tom-desktop.png'});
  await page.getByRole('button',{name:'Make a little headway',exact:false}).click();if(!(await page.locator('#prompt').inputValue()).includes('rough idea'))throw new Error('Starter did not fill the composer.');
  await page.getByRole('button',{name:'Settings',exact:false}).click();await page.locator('#settings-dialog').waitFor({state:'visible'});if(!(await page.locator('#browser-setting option').count()===4))throw new Error('Missing browser choices.');await page.getByRole('button',{name:'Close settings',exact:true}).click();
  await page.locator('.welcome-copy').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);const s=window.getSelection();s.removeAllRanges();s.addRange(r);});await page.locator('.welcome-copy').click({button:'right'});await page.getByRole('menuitem',{name:'Ask Tom',exact:true}).click();if(await page.locator('#quote-context').isHidden())throw new Error('Ask Tom did not attach the selected subject.');
  await page.getByRole('button',{name:'New conversation',exact:false}).click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'audit/tom-mobile.png'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error('Mobile layout overflows.');
  await page.getByRole('button',{name:'Toggle navigation',exact:true}).click();if(await page.locator('.sidebar').isHidden())throw new Error('Mobile navigation failed.');await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:960});await page.locator('#task-list button').first().click();await page.locator('#activity').waitFor({state:'visible'});await page.screenshot({path:'audit/tom-conversation.png'});await page.locator('#activity > summary').click();await page.screenshot({path:'audit/tom-activity.png'});
  if(await page.locator('.file-link:not(:disabled)').count()){const pending=page.waitForEvent('download');await page.locator('.file-link:not(:disabled)').first().click();const download=await pending;if(await download.failure())throw new Error('Verified-file download failed.');if(!download.suggestedFilename().endsWith('.txt'))throw new Error('Downloaded file lost its name.');}
  if(errors.length)throw new Error(errors.join('\n'));console.log('UI passed: desktop, narrow layout, starters, settings, Ask Tom, navigation, saved conversation, activity. No page errors.');
  const fixturePage=await browser.newPage({viewport:{width:400,height:300}});await fixturePage.setContent('<html><body style="margin:0;background:white"><div style="display:flex;gap:60px;margin:45px 45px 20px"><div style="width:120px;height:120px;background:#ee2020"></div><div style="width:120px;height:120px;background:#1653ec;border-radius:50%"></div></div><p style="font: bold 48px Arial;text-align:center;margin:0">TOM 42</p></body></html>');await fixturePage.screenshot({path:'audit/vision-fixture.png'});
}finally{await browser.close();}
