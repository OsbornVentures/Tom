// Post-hoc extension sensitivity diagnostic. No production changes.
import {cases as original} from './capability-cases.mjs';
export {evaluate} from './capability-cases.mjs';
export const cases=original.filter(c=>c.category==='software-repair').map(c=>({...c,id:c.id+'-js',output:'solution.js',files:{'source.js':c.files['source.cjs']},request:c.request.replaceAll('.cjs','.js')}));
