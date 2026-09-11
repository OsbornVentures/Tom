// Real DOM/navigation checks against controlled pages, NOT live search qualification.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../runtime/browser/node_modules/playwright-core/index.mjs';
const script=(await fs.readFile(new URL('../src/page-reader.mjs',import.meta.url),'utf8')).replace('export function','function');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage();let status=200,html='';
  await page.route('https://fixture.test/**',route=>route.fulfill({status,contentType:'text/html',body:html}));
  const read=async action=>{await page.goto('https://fixture.test/page');await page.addScriptTag({content:script});return page.evaluate(action=>readTomPage({action,provider:'google'}),action);};
  html='<title>Search</title><div class="MjjYud"><a href="https://example.com/lorena"><h3>Lorena TX weather</h3></a><p>Today’s local forecast.</p></div>';
  let result=await read('search');assert.equal(result.httpStatus,200);assert.equal(result.results[0].title,'Lorena TX weather');assert.match(result.results[0].snippet,/forecast/);
  html='<title>Search</title><section><article><a href="https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Florena"><h3>Lorena TX weather</h3></a><p>FIRST local forecast snippet.</p></article><article><a href="https://example.org/lorena"><span role="heading" aria-level="3">Lorena TX forecast</span></a><p>SECOND local forecast snippet.</p></article></section>';
  result=await read('search');assert.equal(result.results.length,2);assert.equal(result.results[0].url,'https://example.com/lorena');assert.match(result.results[0].snippet,/FIRST/);assert.doesNotMatch(result.results[0].snippet,/SECOND/);assert.match(result.results[1].snippet,/SECOND/);
  html='<title>Google redirect results</title><article><a href="https://www.google.com/goto?url=opaque-google-destination"><h3>Lorena, TX Weather Forecast</h3></a><p>Lorena TX current weather.</p></article><article><a href="https://www.google.com/search?q=related"><h3>Related searches</h3></a></article>';
  result=await read('search');assert.equal(result.results.length,1);assert.equal(result.results[0].url,'https://www.google.com/goto?url=opaque-google-destination');
  html='<title>Verify</title><p>Our systems have detected unusual traffic from your computer network.</p>';
  result=await read('search');assert.equal(result.blocked,true);assert.equal(result.results.length,0);
  html='<title>Weather source</title><main><h1>Lorena TX weather</h1><p>A controlled source page for checking browser reading.</p><a href="https://example.com/forecast">Full forecast</a></main>';
  result=await read('read');assert.equal(result.httpStatus,200);assert.match(result.content,/controlled source/);assert.equal(result.links.length,1);
  status=503;result=await read('read');assert.equal(result.httpStatus,503);assert.equal(result.content,undefined);
  console.log('Real-browser fixture checks passed: Google headings, challenge handling, source reading, and HTTP failure.');
}finally{await browser.close();}
