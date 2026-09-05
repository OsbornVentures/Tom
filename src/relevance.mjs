// A transparent lexical screen, not a semantic truth guarantee. Its purpose is
// to reject obviously unrelated search pages before they can satisfy a task.
const common=new Set('a an and are as at be by can do does for from how i in into is it me of on or our please show some that the their these this to use using want we what when where which who why with you your find search web online guide documentation docs'.split(' '));
export function queryTerms(query){return [...new Set((query.match(/[\p{L}\p{N}_-]+/gu)??[]).map(t=>t.toLowerCase()).filter(t=>t.length>=3&&!common.has(t)))].slice(0,12);}
export function relevance(query,page){const terms=queryTerms(query),text=[page.title,page.url,page.snippet,page.content].filter(Boolean).join(' ').toLowerCase();const matched=terms.filter(t=>text.includes(t));const required=Math.min(2,terms.length);return {terms,matched,required,passed:matched.length>=required};}
export function searchAttempts(query,provider){
 const words=query.trim().split(/\s+/),plans=[{provider,query}];
 // Some providers over-focus on a leading brand. Preserve all plain keywords,
 // and try one alternate ordering only after an irrelevant/unusable result.
 if(words.length>=3&&!/["():]/.test(query))plans.push({provider,query:[...words.slice(1),words[0]].join(' '),reordered:true});
 plans.push({provider:provider==='bing'?'google':'bing',query});return plans;
}
