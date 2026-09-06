// A transparent lexical screen, not a semantic truth guarantee. Its purpose is
// to reject obviously unrelated search pages before they can satisfy a task.
const common=new Set('a an and are as at be by can could do does for from how i in into is it its me of on or our please show some that the their these this to use using want we what when where which who why with you your find search web online guide documentation docs look up about like tell get give would will today tonight tomorrow current currently latest now right real time information thanks thank instead'.split(' '));
const broad=new Set('weather forecast forecasts conditions news price prices specifications specification specs review reviews manual details release version hours'.split(' '));
export function queryTerms(query){return [...new Set((query.match(/[\p{L}\p{N}_-]+/gu)??[]).map(t=>t.toLowerCase()).filter(t=>t.length>=2&&!common.has(t)))].slice(0,12);}
export function searchQuery(subject){
 // Keep the user's subject. Small models must not replace its location, product,
 // person or identifier while shortening a question into search keywords.
 const first=subject.split(/[?!]|\.(?=\s)/)[0];
 const words=(first.match(/[\p{L}\p{N}_-]+/gu)??[]).filter(t=>t.length>=2&&!common.has(t.toLowerCase()));
 const freshness=subject.match(/\b(?:today|tonight|tomorrow|latest|current)\b/i)?.[0];
 return ([...new Set(words)].slice(0,12).join(' ')+(freshness?' '+freshness:'')).trim()||subject.slice(0,300);
}
export function relevance(query,page){
 const terms=queryTerms(query),text=[page.title,page.url,page.snippet,page.content].filter(Boolean).join(' ').toLowerCase();
 const words=new Set(text.match(/[\p{L}\p{N}_-]+/gu)??[]),matched=terms.filter(t=>words.has(t)||t.length>4&&words.has(t.replace(/s$/,'')));
 // A topic label cannot stand in for a place, person or product. Two identifying
 // terms are needed when available; short region codes and numeric IDs must all
 // survive. Related documentation may introduce a subtopic only after opening.
 const identifying=terms.filter(t=>!broad.has(t)),subjects=identifying.length?identifying:terms;
 const required=Math.min(2,subjects.length),anchors=subjects.filter(t=>t.length===2||/\d/.test(t));
 const topic=terms.filter(t=>broad.has(t));
 return {terms,matched,identifying:subjects,missing:terms.filter(t=>!matched.includes(t)),required,passed:subjects.length>0&&subjects.filter(t=>matched.includes(t)).length>=required&&anchors.every(t=>matched.includes(t))&&(!topic.length||topic.some(t=>matched.includes(t)))};
}
export function searchAttempts(query,provider){
 const words=query.trim().split(/\s+/),plans=[{provider,query}];
 // Some providers over-focus on a leading brand. Preserve all plain keywords,
 // and try one alternate ordering only after an irrelevant/unusable result.
 if(words.length>=3&&!/["():]/.test(query))plans.push({provider,query:[...words.slice(1),words[0]].join(' '),reordered:true});
 plans.push({provider:provider==='bing'?'google':'bing',query:plans[1]?.query??query});return plans;
}
