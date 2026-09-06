// One small shared timer; slow idle breathing, distinct activity glyphs, <=15fps.
let state='ready',timer=null,frames=0,mode='idle';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const phases={model:'read',prefill:'read',load:'read',check:'check',ready:'idle',start:'read','action-stream':'plan',decision:'plan',action:'command',output:'command',delta:'write',file:'check',context:'memory',review:'review',budget:'review',blocked:'review','browser-handoff':'review','tool-error':'error','completion-rejected':'review',dispatch:'plan',error:'error',paused:'idle',stopped:'idle',complete:'idle',running:'read'};
export const kernelGuide=[
 {event:'ready',name:'Ready',description:'A slow green breath. Tom is available; no task is running.'},
 {event:'model',name:'Reading',description:'Open brackets. Tom is reading your request and the information gathered so far.'},
 {event:'decision',name:'Preparing an action',description:'A diamond. Tom is preparing the next tool call; the current line names the action.'},
 {event:'action',name:'Running a command',description:'A terminal symbol. A command or browser action is running. Expand Activity to see it.'},
 {event:'delta',name:'Writing',description:'Growing lines. Tom is producing a reply or writing a file.'},
 {event:'check',name:'Checking a result',description:'A check mark. Tom is checking this step; it does not mean the whole task is finished.'},
 {event:'context',name:'Keeping task notes',description:'Stacked lines. Tom is shortening its working context and saving a record for later.'},
 {event:'review',name:'Needs attention · amber',description:'An amber exclamation mark. Review is needed, a limit was reached, or progress has stalled.'},
 {event:'error',name:'Error · red',description:'A red exclamation mark. A step failed. Read the error and expand its result before retrying.'}
];
export function kernelColor(stage,day=false){return stage==='error'?(day?'#c62828':'#f87171'):stage==='review'?(day?'#aa6600':'#f59e0b'):(day?'#07845d':'#10b981');}
export function drawKernel(canvas,phase=0,status=state){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,day=document.documentElement.dataset.theme==='day',stage=phases[status]??mode;
 const cyan=stage==='error'?kernelColor(stage,day):day?'#007fa9':'#38bdf8',main=kernelColor(stage,day);
 c.clearRect(0,0,w,h);c.save();c.scale(w/96,h/96);c.lineCap='round';c.lineJoin='round';
 const wave=.5+.5*Math.sin(phase*Math.PI*2),opacity=.2+.8*wave;
 c.strokeStyle=main;c.lineWidth=2;c.globalAlpha=.45+.5*wave;
 for(let i=0;i<4;i++){c.save();c.translate(48,48);c.rotate(i*Math.PI/2);c.beginPath();c.moveTo(-33,-13);c.lineTo(-33,-25);c.quadraticCurveTo(-33,-33,-25,-33);c.lineTo(-13,-33);c.stroke();c.restore();}
 c.globalAlpha=.12+.16*wave;c.fillStyle=main;c.fillRect(26,26,44,44);
 c.globalAlpha=.55+wave*.45;c.fillStyle=cyan;c.fillRect(44,44,8,8);
 if(stage==='idle'){
   for(let i=0;i<8;i++){const angle=i*Math.PI/4;c.globalAlpha=.2+.8*(.5+.5*Math.sin(phase*2*Math.PI-i*.4));c.fillStyle=i%2?cyan:main;c.fillRect(46+Math.cos(angle)*17,46+Math.sin(angle)*17,4,4);}
 }else{
   c.globalAlpha=1;c.strokeStyle=main;c.lineWidth=2.5;c.beginPath();
   if(stage==='command'){c.moveTo(29,36);c.lineTo(39,46);c.lineTo(29,56);c.moveTo(47,58);c.lineTo(63,58);}
   else if(stage==='write'){c.moveTo(31,34);c.lineTo(63,34);c.moveTo(31,45);c.lineTo(57,45);c.moveTo(31,56);c.lineTo(49,56);}
   else if(stage==='check'){c.moveTo(30,47);c.lineTo(42,59);c.lineTo(66,34);}
   else if(stage==='review'||stage==='error'){c.moveTo(48,29);c.lineTo(48,51);c.moveTo(48,61);c.lineTo(48,62);}
   else if(stage==='memory'){for(let i=0;i<3;i++){c.moveTo(29,34+i*12);c.lineTo(65,34+i*12);}}
   else if(stage==='plan'){c.moveTo(31,48);c.lineTo(48,30);c.lineTo(65,48);c.lineTo(48,66);c.closePath();}
   else{c.moveTo(30,33);c.lineTo(43,33);c.lineTo(43,61);c.lineTo(30,61);c.moveTo(53,33);c.lineTo(66,33);c.lineTo(66,61);c.lineTo(53,61);}
   c.stroke();c.strokeStyle=cyan;c.globalAlpha=opacity;c.lineWidth=1;const y=25+46*phase;c.beginPath();c.moveTo(25,y);c.lineTo(71,y);c.stroke();
 }
 c.restore();
}
export function redrawKernels(){const period=mode==='idle'?7000:3200,phase=(performance.now()%period)/period;document.querySelectorAll('canvas.kernel').forEach(c=>drawKernel(c,phase));frames++;}
function schedule(){clearInterval(timer);timer=null;redrawKernels();if(!document.hidden&&!reduced.matches)timer=setInterval(redrawKernels,1000/(mode==='idle'?8:15));}
export function setKernelState(value){const next=phases[value]??'read';state=value;if(next===mode)return;mode=next;document.documentElement.dataset.activity=mode;document.querySelectorAll('canvas.kernel').forEach(c=>c.title='Tom · '+({idle:'Ready',read:'Reading',plan:'Preparing an action',command:'Running a command',write:'Writing',check:'Verifying',memory:'Saving task memory',review:'Needs your review',error:'Stopped on an error'}[mode]??mode));schedule();}
document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',schedule);
export function kernelStats(){return {state,mode,frames,animating:timer!==null,reduced:reduced.matches};}
schedule();
