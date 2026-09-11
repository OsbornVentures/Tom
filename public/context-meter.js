// Reconstructed from saved events, so changing conversations and reloading is safe.
export function contextSnapshot(events=[],capacity=4096){
 let count=0,input=null,total=capacity,reserved=0,pressure=false,compacted=false;
 for(const e of events){
   const d=e.detail??{};
   if(e.kind==='start-new-request'||e.kind==='start'){input=null;pressure=false;compacted=false;}
   if(e.kind==='context'&&d.compacted)count++;
   if(e.kind==='context'&&Number.isInteger(d.compactions))count=Math.max(count,d.compactions);
   if(['context','context-pressure','model'].includes(e.kind)&&Number.isFinite(d.inputTokens)){
     input=d.inputTokens;total=d.context??total;reserved=d.reservedTokens??0;
     pressure=e.kind==='context-pressure';compacted=!!d.compacted;
   }
   if(['complete','error','blocked','budget','stopped','paused'].includes(e.kind))pressure=false;
 }
 const fraction=input===null?null:Math.max(0,Math.min(1,(input+reserved)/Math.max(1,total)));
 return {count,input,total,reserved,fraction,pressure,compacted};
}
