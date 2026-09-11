// One shared, capped timer. Expressions describe harness activity, not model emotion.
let state='ready',timer=null,frames=0,mode='idle',phaseStarted=performance.now(),memoryUntil=0,memoryTimer=null,pendingState=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const phases={model:'read',prefill:'read',load:'read',check:'check',ready:'idle',start:'read','action-stream':'plan',decision:'plan',action:'command',output:'command',delta:'write',file:'check',context:'memory','context-pressure':'memory',review:'review',budget:'review',blocked:'review','browser-handoff':'review','tool-error':'review','completion-rejected':'review',dispatch:'plan',error:'error',paused:'idle',stopped:'idle',complete:'idle',running:'read'};
export const kernelGuide=[
 {event:'ready',name:'Ready',faces:['o.o','>.>','<_<','-_-','O.o','>.<','o.O'],description:'A quiet breath, a blink, and a few impatient side glances. Three waiting dots keep time while Tom is available.'},
 {event:'model',name:'Reading',faces:['>.>','-.-','<.<','o.O'],description:'Eyes scan from side to side as Tom reads your request and gathered information.'},
 {event:'decision',name:'Preparing an action',faces:['o.O','-.-','O.o'],description:'A small diamond accompanies the face while the harness prepares its next action.'},
 {event:'action',name:'Running a command',faces:['>_>','-_-','<_<'],description:'A terminal cursor marks a command or browser action. Expand Activity to inspect it.'},
 {event:'delta',name:'Writing',faces:['o.o','-.-','o.o'],description:'Short lines grow as Tom produces a reply or writes a file.'},
 {event:'check',name:'Checking a result',faces:['o.O','-.-','O.o'],description:'A check mark identifies verification of this step, not proof the whole task is correct.'},
 {event:'context',name:'Keeping task notes',faces:['>.<','-.-','o.o'],description:'Three lines merge into one as the harness shortens context. Full history stays in the task record.'},
 {event:'review',name:'Needs attention · amber',faces:['O.O','>*<','o.O'],description:'Surprised eyes: review is needed, a recoverable error occurred, or a limit was reached.'},
 {event:'error',name:'Error · red',faces:['x.x','X.X','x_X'],description:'Crossed-out eyes: the task stopped on an error. Read the event before retrying.'}
];
const guideFor=stage=>kernelGuide.find(g=>phases[g.event]===stage)??kernelGuide[0];
export function kernelFace(stage,phase=0){
 const faces=guideFor(stage).faces,p=((phase%1)+1)%1;
 if(stage==='idle'){const beat=p*faces.length,part=beat%1;return part>=.82&&part<.92?'-.-':faces[Math.floor(beat)];}
 // A short, intentional blink, with long readable holds on either side.
 if(!['review','error'].includes(stage))return p>=.43&&p<.49?faces[1]:faces[Math.min(faces.length-1,p<.49?0:p<.8?2:3)];
 return faces[Math.floor(p*faces.length)];
}
export function kernelColor(stage,day=false){return stage==='error'?(day?'#c62828':'#f87171'):stage==='review'?(day?'#aa6600':'#f59e0b'):(day?'#07845d':'#10b981');}
export function drawKernel(canvas,phase=0,status=state){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,day=document.documentElement.dataset.theme==='day',stage=phases[status]??'read';
 const main=kernelColor(stage,day),cyan=['error','review'].includes(stage)?main:day?'#007fa9':'#38bdf8';
 c.clearRect(0,0,w,h);c.save();c.scale(w/96,h/96);c.lineCap='round';c.lineJoin='round';
 const wave=.5+.5*Math.sin(phase*Math.PI*2);
 c.strokeStyle=main;c.lineWidth=2;c.globalAlpha=.6+.3*wave;
 for(let i=0;i<4;i++){c.save();c.translate(48,48);c.rotate(i*Math.PI/2);c.beginPath();c.moveTo(-37,-17);c.lineTo(-37,-29);c.quadraticCurveTo(-37,-37,-29,-37);c.lineTo(-17,-37);c.stroke();c.restore();}
 c.globalAlpha=.05+.04*wave;c.fillStyle=main;c.fillRect(18,18,60,60);
 // The old center square is gone. Only the keyboard face occupies the center.
 c.globalAlpha=1;c.fillStyle=main;c.font='bold 27px Consolas, "Courier New", monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(kernelFace(stage,phase),48,44);
 c.strokeStyle=cyan;c.lineWidth=1.8;c.beginPath();
 if(stage==='idle'){
   const step=Math.floor(phase*28)%3;
   for(let i=0;i<3;i++){c.globalAlpha=i===step?1:.22;c.fillStyle=cyan;c.beginPath();c.arc(39+i*9,69,1.5,0,Math.PI*2);c.fill();}c.globalAlpha=1;c.beginPath();
 }else if(stage==='memory'){
   const merge=phase<.7?(.5-.5*Math.cos(Math.PI*phase/.7)):1;
   for(let i=-1;i<=1;i++){const y=69+i*7*(1-merge);c.moveTo(31,y);c.lineTo(65,y);}
 }else if(stage==='write'){for(let i=0;i<3;i++){c.moveTo(31,63+i*5);c.lineTo(43+(i+phase*3)%3*7,63+i*5);}}
 else if(stage==='command'){c.moveTo(34,63);c.lineTo(40,68);c.lineTo(34,73);c.moveTo(49,73);c.lineTo(62,73);}
 else if(stage==='check'){c.moveTo(39,67);c.lineTo(46,73);c.lineTo(59,62);}
 else if(stage==='plan'){c.moveTo(48,61);c.lineTo(56,68);c.lineTo(48,75);c.lineTo(40,68);c.closePath();}
 else if(stage==='read'){c.moveTo(29+phase*22,68);c.lineTo(43+phase*22,68);}
 c.stroke();
 if(!['idle','error','review'].includes(stage)){c.globalAlpha=.12;c.lineWidth=1;c.beginPath();const y=21+55*phase;c.moveTo(21,y);c.lineTo(75,y);c.stroke();}
 c.restore();if(canvas.dataset)canvas.dataset.drawn='true';
}
export function redrawKernels(){
 const still=reduced.matches||document.hidden;
 // Also check inside the timer: a background/media event can arrive late.
 if(still&&timer!==null){clearInterval(timer);timer=null;}
 const period=mode==='idle'?21000:mode==='memory'?2000:4000,phase=still?0:((performance.now()-phaseStarted)%period)/period;
 document.querySelectorAll('canvas.kernel').forEach(c=>drawKernel(c,phase,c.dataset.kernelState??state));frames++;
}
function schedule(){clearInterval(timer);timer=null;redrawKernels();if(!document.hidden&&!reduced.matches)timer=setInterval(redrawKernels,1000/(mode==='idle'?8:15));}
export function setKernelState(value){
 const next=phases[value]??'read',changed=next!==mode;
 if(mode==='memory'&&performance.now()<memoryUntil&&['model-input','input-snapshot','model','prefill','decision','action-stream','action','output','delta','file','check'].includes(value)){pendingState=value;return;}
 if(changed){phaseStarted=performance.now();clearTimeout(memoryTimer);pendingState=null;}
 if(next==='memory'&&changed&&!reduced.matches){memoryUntil=performance.now()+1800;memoryTimer=setTimeout(()=>{memoryUntil=0;if(pendingState)setKernelState(pendingState);},1800);}
 state=value;mode=next;
 document.documentElement.dataset.activity=mode;
 const label=guideFor(mode).name;
 document.querySelectorAll('canvas.kernel:not([data-kernel-state])').forEach(c=>c.title='Tom · '+label);
 document.querySelectorAll('[data-kernel-label]').forEach(e=>e.textContent=label);
 if(changed)schedule();
}
document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',schedule);
export function kernelStats(){return {state,mode,frames,animating:timer!==null,reduced:reduced.matches};}
setKernelState('ready');schedule();
