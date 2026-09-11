// Read known artifact inputs through ordinary guards before model planning.
import path from 'node:path';
import {keyFor,remember} from './state.mjs';

export async function readPrerequisites({state,box,cwd,id,store,signal,emit}){
  if(!state.requireArtifact)return;
  const attempted=new Set();
  for(const requested of state.sources){
    signal.throwIfAborted();
    const file=path.resolve(cwd,requested),key=keyFor(file);
    if(state.readPaths.includes(key)||attempted.has(key))continue;
    if(attempted.size>=16)break;
    attempted.add(key);
    const args={path:requested,lines:250},began=Date.now();let record;
    try{
      const body=await box.prepare('read',args,signal);body.effect='read';body.actor='controller';
      record=store.action(id,body);store.finishAction(record.id,'running');
      emit('action','Reading requested input '+requested,{action:record.id,tool:'read',actor:'controller',arguments:args});
      state.metrics.firstActionMs??=began-state.started;
      const result=await box.execute('read',args,body,signal);
      state.metrics.controllerReads=(state.metrics.controllerReads??0)+1;state.metrics.toolMs+=Date.now()-began;
      remember(state,record.id,result);store.commitAction(record.id,'complete',result,id,state);
      emit('check','Read requested input '+requested,{...result,action:record.id,actor:'controller'});
    }catch(e){
      const result={kind:'read-error',path:file,error:e.message};
      remember(state,record?.id??null,result);state.last.operation='read';state.last.arguments=args;
      if(record)store.commitAction(record.id,'failed',result,id,state);else store.saveWork(id,state);
      emit('tool-error','Could not read '+requested+': '+e.message,{...result,action:record?.id,actor:'controller'});
      signal.throwIfAborted();
      // Try each known input once. The model can inspect errors or discover a
      // different file; the controller never loops on a failed prerequisite.
    }
  }
}
