export function memoryExplanation(state){
 const context=state.context.toLocaleString(),ceiling=state.contextLimit.toLocaleString(),free=state.machine.availableGiB;
 const qualified=state.qualification?.report?.passed&&state.qualification.report.contexts?.includes(state.contextLimit);
 return {
  context:`Context is Tom’s working space for one step. Your request, recent results and the next reply share ${context} tokens. A token is a small piece of text, often part of a word.`,
  memory:`About ${free} GB of RAM is currently free. Tom does not use all of it for context: the model, images, browser, Windows and your other apps also need room. A larger context takes longer to read and can make the computer less responsive.`,
  range:`2,048 minimum · ${ceiling} ${qualified?'locally tested ceiling':'current package ceiling; a passing local check is still needed'}. Increase it only after Tune this computer passes a larger-context check.`,
  model:/\be2b\b/i.test(state.modelIdentity)?'E2B is a small local model, not a frontier model. It works best with short, clear requests and can miss details. Check important results. Tune this computer can offer a larger model if your system passes a trial.':'This Gemma model runs locally. It can still miss details or make mistakes. Check important results; every larger model and its vision projector must pass a trial on this computer.'
 };
}
