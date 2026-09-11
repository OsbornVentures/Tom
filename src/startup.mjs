// Startup is complete only after the selected runtime has loaded and passed its probe.
export class Startup {
  constructor(qualification,runtime){
    Object.assign(this,{qualification,runtime,phase:'pending',stage:'connect',error:null,events:[],started:null,finished:null,job:null,controller:null,canContinue:false});
    this.steps=[];this.resetSteps();
    qualification.onEvent=event=>{if(this.busy&&this.stage==='benchmark')this.event(event.text,'check');};
  }
  get busy(){return this.phase==='pending'||this.phase==='running';}
  get ready(){return this.phase==='ready';}
  resetSteps(){this.steps=[{id:'service',label:'Connect to your local assistant',status:'complete'},{id:'checks',label:'Check this computer',status:'waiting'},{id:'model',label:'Load the selected model',status:'waiting'},{id:'verify',label:'Verify the model is ready',status:'waiting'}];}
  step(id,status){this.steps.find(s=>s.id===id).status=status;}
  event(text,kind='load'){this.events.push({time:new Date().toISOString(),text,kind});if(this.events.length>100)this.events.shift();}
  status(){return {phase:this.phase,stage:this.stage,error:this.error,canContinue:this.canContinue,started:this.started,finished:this.finished,steps:this.steps.map(s=>({...s})),events:this.events.slice(-60)};}
  cancel(){this.controller?.abort(new Error('Startup cancelled. Retry when you are ready.'));this.qualification.cancel();}
  start({skipChecks=false,repeatCheck=false}={}){
    if(this.job)return this.job;
    this.phase='running';this.error=null;this.canContinue=false;this.events=[];this.started=new Date().toISOString();this.finished=null;this.resetSteps();this.controller=new AbortController();
    this.job=this.run({skipChecks,repeatCheck}).catch(async e=>{await this.runtime.stop();this.error=e.message;this.phase='attention';this.event(e.message,'error');for(const step of this.steps)if(step.status==='running')step.status='attention';}).finally(()=>{this.finished=new Date().toISOString();this.controller=null;this.job=null;});
    return this.job;
  }
  async run({skipChecks,repeatCheck}){
    const signal=this.controller.signal,q=this.qualification;
    if(!skipChecks&&(repeatCheck||q.needsFirstRun())){
      this.stage='benchmark';this.step('checks','running');this.event('Running the local startup benchmarks','check');
      const report=await q.baseline();signal.throwIfAborted();
      if(!report.passed){this.canContinue=true;throw Error(report.reason??'The computer check did not pass.');}
      this.step('checks','complete');
      this.event('Checking upgrade availability','check');await q.scan({extended:false});signal.throwIfAborted();
    }else{this.step('checks','skipped');this.event(skipChecks?'Continuing with the current model; benchmarks were not repeated.':'Using the saved checks for this computer.','check');}
    this.stage='loading';this.step('model','running');this.event('Preparing '+this.runtime.config.model.name+' for your first message');
    await this.runtime.ensure(false,signal,(kind,text)=>{
      if(/grammar enforcement/i.test(text)){this.step('model','complete');this.step('verify','running');this.stage='verify';}
      const display=/grammar enforcement/i.test(text)?'Checking that the model can prepare valid actions':/^Checking .+\.gguf$/i.test(text)?'Verifying the model files · '+this.runtime.config.model.name:text==='Checking the local runtime components'?'Verifying the local model engine':text;
      this.event(display,kind);
    });
    signal.throwIfAborted();
    if(!this.runtime.base||!this.runtime.grammarVerified)throw Error('The model did not finish its readiness check. Retry startup.');
    this.step('model','complete');this.step('verify','complete');this.stage='ready';this.phase='ready';this.event('Tom is fully loaded and ready for your message.','ready');
    this.runtime.release();
  }
}
