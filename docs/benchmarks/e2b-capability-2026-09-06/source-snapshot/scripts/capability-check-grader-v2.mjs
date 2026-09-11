import assert from 'node:assert/strict';
import {cases} from './capability-cases.mjs';
import {evaluate} from './capability-score-v2.mjs';
const c=cases[0];
const gold=[
 'module.exports=rows=>rows.filter(r=>r.status==="paid").reduce((s,r)=>s+r.qty*r.cents,0);',
 'module.exports=r=>{const o=[];for(const a of r.map(x=>[...x]).sort((a,b)=>a[0]-b[0])){const p=o.at(-1);if(p&&a[0]<=p[1])p[1]=Math.max(p[1],a[1]);else o.push(a);}return o;};',
 'module.exports=v=>{const s=new Set();return v.filter(x=>{const k=x.toLowerCase();if(s.has(k))return false;s.add(k);return true;});};',
 'module.exports=(a,p,s)=>Number.isInteger(p)&&Number.isInteger(s)&&p>0&&s>0?a.slice((p-1)*s,p*s):[];'
];
for(let i=0;i<cases.length;i++){const item=cases[i],solution=i<4?gold[i]:typeof item.expected==='string'?item.expected:JSON.stringify(item.expected);assert(evaluate(item,solution).passed);if(i<4)assert(!evaluate(item,item.files['source.cjs']).passed);}
assert(evaluate(c,'const original=require("./source.cjs");module.exports=rows=>original(rows.filter(r=>r.status==="paid"));').passed);
assert(evaluate(c,'const original=require("./source.cjs");exports.unused=1;module.exports=rows=>rows.filter(r=>r.status==="paid").reduce((s,r)=>s+r.qty*r.cents,0);').passed);
assert(!evaluate(c,'module.exports=require("./source.cjs");').passed);
assert(!evaluate(c,'module.exports=require("node:fs");').passed);
assert(!evaluate(c,'module.exports=()=>process.env;').passed);
assert(!evaluate(c,'module.exports=()=>require.constructor("return process")();').passed);
assert(!evaluate(c,'while(true){}').passed);
for(const item of cases)assert(!evaluate(item,'WRONG').passed);
console.log('V2 scorer: valid fixture imports pass; buggy imports, unavailable host APIs, dynamic code, loops and corrupt outputs fail.');
