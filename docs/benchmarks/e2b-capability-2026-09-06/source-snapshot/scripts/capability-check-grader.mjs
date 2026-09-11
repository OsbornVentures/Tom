import assert from 'node:assert/strict';
import {cases,evaluate} from './capability-cases.mjs';
const gold=[
 'module.exports=rows=>rows.filter(r=>r.status==="paid").reduce((s,r)=>s+r.qty*r.cents,0);',
 'module.exports=r=>{const o=[];for(const a of r.map(x=>[...x]).sort((a,b)=>a[0]-b[0])){const p=o.at(-1);if(p&&a[0]<=p[1])p[1]=Math.max(p[1],a[1]);else o.push(a);}return o;};',
 'module.exports=v=>{const s=new Set();return v.filter(x=>{const k=x.toLowerCase();if(s.has(k))return false;s.add(k);return true;});};',
 'module.exports=(a,p,s)=>Number.isInteger(p)&&Number.isInteger(s)&&p>0&&s>0?a.slice((p-1)*s,p*s):[];'
];
for(let i=0;i<cases.length;i++){
 const c=cases[i],g=i<4?gold[i]:typeof c.expected==='string'?c.expected:JSON.stringify(c.expected);
 assert(evaluate(c,g).passed,c.id+' gold');assert(!evaluate(c,'WRONG').passed,c.id+' corrupt');
 if(i<4)assert(!evaluate(c,c.files['source.cjs']).passed,c.id+' original bug');
}
assert(!evaluate(cases[0],'while(true){}').passed,'infinite loop');
assert(!evaluate(cases[0],'module.exports=()=>process.env;').passed,'no process global');
assert(!evaluate(cases[0],'module.exports=()=>Function("return process")();').passed,'no dynamic code');
console.log('Grader verified: 8 gold passes, 8 corrupt failures, 4 buggy originals fail; timeout and unavailable process/dynamic-code checks pass.');
