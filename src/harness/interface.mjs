// Infer only simple, explicit CommonJS function signatures. Complex exports,
// defaults and destructuring fall back to positional arguments.
export function functionParameters(source){
  let masked='',i=0;
  while(i<source.length){
    const c=source[i],next=source[i+1];
    if(c==='/'&&next==='/'){while(i<source.length&&source[i]!=='\n'){masked+=' ';i++;}continue;}
    if(c==='/'&&next==='*'){masked+='  ';i+=2;while(i<source.length&&!(source[i]==='*'&&source[i+1]==='/')){masked+=source[i]==='\n'?'\n':' ';i++;}masked+='  ';i+=2;continue;}
    if(c==='"'||c==="'"||c==='`'){const quote=c;masked+=' ';i++;while(i<source.length){const x=source[i++];masked+=x==='\n'?'\n':' ';if(x==='\\'){masked+=' ';i++;}else if(x===quote)break;}continue;}
    masked+=c;i++;
  }
  const matches=[...masked.matchAll(/\bmodule\s*\.\s*exports\s*=\s*(?:function(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^()]*)\)|\(([^()]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>)/g)];
  if(matches.length!==1)return null;
  const text=matches[0][1]??matches[0][2]??matches[0][3],names=text.trim()?text.split(',').map(s=>s.trim()):[];
  return names.length<=16&&new Set(names).size===names.length&&names.every(n=>/^[$A-Z_a-z][$\w]*$/.test(n))?names:null;
}
export function normalizeExamples(cases,parameters){
  return cases.map(c=>{
    if(Object.hasOwn(c,'input'))return {args:[c.input],expected:c.expected};
    if(Object.hasOwn(c,'arguments')){
      if(!parameters?.length||!c.arguments||Array.isArray(c.arguments)||typeof c.arguments!=='object'||parameters.some(p=>!Object.hasOwn(c.arguments,p))||Object.keys(c.arguments).some(p=>!parameters.includes(p)))throw Error('Named test arguments must match the saved function parameters.');
      return {args:parameters.map(p=>c.arguments[p]),expected:c.expected};
    }
    return c;
  });
}
