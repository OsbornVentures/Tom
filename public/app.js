// Keep recovery and basic navigation alive even when another UI module cannot load.
const $=selector=>document.querySelector(selector);
const helpArticles=[...document.querySelectorAll('.help-article')],helpOpen=new Map();
function filterHelp(){
 const query=$('#help-search').value.trim().toLocaleLowerCase(),words=query.split(/\s+/).filter(Boolean);
 let matches=0;
 for(const article of helpArticles){
  if(query&&!helpOpen.has(article))helpOpen.set(article,article.open);
  const found=words.every(word=>article.textContent.toLocaleLowerCase().includes(word));article.hidden=!found;
  if(query)article.open=found;else if(helpOpen.has(article)){article.open=helpOpen.get(article);helpOpen.delete(article);}
  if(found)matches++;
 }
 $('#help-empty').hidden=matches!==0;$('#help-search-status').textContent=query?`${matches} ${matches===1?'answer':'answers'} found.`:'';
}
function resetHelp(){$('#help-search').value='';filterHelp();}
$('#help-search').oninput=filterHelp;
document.querySelectorAll('[data-help-target]').forEach(link=>link.onclick=event=>{event.preventDefault();resetHelp();const section=document.getElementById(link.dataset.helpTarget);section.open=true;section.scrollIntoView({block:'start'});section.querySelector('summary').focus({preventScroll:true});});
$('#help-button').onclick=()=>{resetHelp();$('#about-dialog').showModal();$('#about-dialog').scrollTop=0;};
document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>button.closest('dialog').close());
$('#startup-reconnect').onclick=()=>location.reload();
document.querySelector('.sidebar').inert=true;$('#content-scroll').inert=true;$('#composer-area').inert=true;
try{await import('./ui.js');}
catch(error){
 document.documentElement.dataset.boot='failed';
 $('#startup-title').textContent='Tom’s interface could not finish loading.';
 $('#startup-detail').textContent='A required interface file is missing or could not load. Restart Tom with Start-Tom.exe, then reconnect.';
 $('#startup-note').textContent=error.message;
 $('#startup-events').replaceChildren(Object.assign(document.createElement('li'),{textContent:'Interface loading failed: '+error.message}));
 for(const id of ['track','cancel','retry','continue'])$('#startup-'+id).hidden=true;
 $('#startup-reconnect').hidden=false;if(!$('#startup-dialog').open)$('#startup-dialog').show();
}
