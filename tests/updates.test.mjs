import test from 'node:test';
import assert from 'node:assert/strict';
import {checkUpdates,selectRelease,compareVersions,releasesUrl} from '../src/updates.mjs';
test('updates compare numeric versions and beta releases without trusting external links',()=>{
 assert.ok(compareVersions('v0.5.10-beta','v0.5.2-beta')>0);assert.ok(compareVersions('v0.5.2','v0.5.2-beta')>0);
 const releases=[{tag_name:'v0.5.3-beta',prerelease:true,html_url:'https://attacker.invalid'},{tag_name:'v9.0.0',draft:true},{tag_name:'v0.5.2'},{tag_name:'malformed'}];
 const result=selectRelease(releases,'0.5.2-beta');assert.equal(result.status,'available');assert.equal(result.latest,'v0.5.3-beta');assert.equal(result.url,releasesUrl+'/tag/v0.5.3-beta');
 assert.equal(selectRelease(releases,'0.5.2',{beta:false}).status,'current');assert.equal(selectRelease([],'0.5.2').status,'unavailable');assert.equal(selectRelease(releases,'1.0.0').status,'ahead');
});
test('update checks use the public release list, send no user data, and handle offline operation',async()=>{
 const product={version:'0.5.2',channel:'beta'};let observed;
 const result=await checkUpdates(product,async(url,options)=>{observed={url,options};return new Response(JSON.stringify([{tag_name:'v0.5.2-beta',prerelease:true}]));});
 assert.equal(result.status,'current');assert.match(observed.url,/api.github.com\/repos\/OsbornVentures\/Tom\/releases/);assert.equal(observed.options.body,undefined);assert.equal(observed.options.headers.Authorization,undefined);
 assert.equal((await checkUpdates(product,async()=>{throw Error('offline');})).status,'unavailable');assert.equal((await checkUpdates(product,async()=>new Response('rate limited',{status:403}))).status,'unavailable');
});
