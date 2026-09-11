// This function runs in a temporary Playwright tab used to read public sources.
export function readTomPage({action,provider}){
  const text=(document.body?.innerText??'').trim(),url=location.href;
  const httpStatus=performance.getEntriesByType('navigation')[0]?.responseStatus??0;
  const blocked=/\/sorry\//.test(location.pathname)||/unusual traffic|verify (?:that )?you are (?:a )?human|prove you.re (?:a )?human|made by a human|complete the (?:captcha|security check)/i.test(text);
  const consent=/(?:consent\.)google\./.test(location.hostname)||/^Before you continue to Google/i.test(text);
  const page={url,title:document.title,httpStatus,blocked:blocked||consent};
  if(page.blocked)return {...page,notice:consent?'This source returned a consent page. Read another source.':'This source returned a verification page. Read another source.',results:action==='search'?[]:undefined};
  if(!httpStatus||httpStatus<200||httpStatus>=300)return {...page,notice:httpStatus?'The page returned HTTP '+httpStatus+'.':'The browser could not verify that this page loaded successfully.'};
  const cleanUrl=raw=>{try{let u=new URL(raw,location.href);if(u.searchParams.has('uddg'))u=new URL(u.searchParams.get('uddg'));if(u.hostname==='www.google.com'&&u.pathname==='/url'){const destination=u.searchParams.get('q')??u.searchParams.get('url');if(/^https?:\/\//.test(destination??''))u=new URL(destination);}if(!/^https?:$/.test(u.protocol))return null;return u.href;}catch{return null;}};
  if(action==='search'){
    let nodes;
    if(provider==='google')nodes=[...document.querySelectorAll('h3,[role="heading"][aria-level="3"]')].map(heading=>{
      const a=heading.closest('a')??heading.querySelector('a');if(!a)return null;
      let container=a;
      // Use heading/link structure, not Google's changing CSS class names.
      // Stop before a wrapper containing another result to avoid mixed snippets.
      for(let parent=a.parentElement,depth=0;parent&&depth<5;parent=parent.parentElement,depth++){
        if(parent.querySelectorAll('h3,[role="heading"][aria-level="3"]').length>1)break;
        container=parent;if((parent.innerText??'').trim().length>heading.innerText.trim().length+80)break;
      }
      return {a,title:heading.innerText,container};
    }).filter(Boolean);
    else{const selector=provider==='bing'?'li.b_algo':provider==='brave'?'.snippet':'.result,[data-testid="result"]';nodes=[...document.querySelectorAll(selector)].map(container=>({container,a:container.querySelector('h2 a,.result__a,a.result-header,a[data-testid="result-title-a"]')}));}
    const results=[],seen=new Set();
    for(const n of nodes){if(!n.a)continue;const link=cleanUrl(n.a.href),title=(n.title??n.a.innerText??'').trim();if(!link||!title||seen.has(link))continue;const host=new URL(link).hostname;if(provider==='google'&&/(^|\.)google\.com$/.test(host)&&!['/goto','/url'].includes(new URL(link).pathname))continue;seen.add(link);results.push({url:link,title:title.slice(0,180),snippet:(n.container?.innerText??'').slice(0,700)});if(results.length===12)break;}
    return {...page,results};
  }
  const scope=document.querySelector('main')??document.body,content=(scope?.innerText??'').trim(),seen=new Set();
  const links=[...scope.querySelectorAll('a[href]')].map(a=>({title:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,100),url:cleanUrl(a.href)})).filter(a=>{if(!a.url||!a.title||seen.has(a.url))return false;seen.add(a.url);return true;}).slice(0,24);
  return {...page,content:content.slice(0,6000),truncated:content.length>6000,links};
}
