import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {requireWindowsRuntime} from '../src/windows-runtime.mjs';

test('missing Windows dependencies stop before launch without retrying profiles',async()=>{
 const checked=[];
 await assert.rejects(()=>requireWindowsRuntime('native',{platform:'win32',systemFolder:'system',exists:async file=>{checked.push(file);return false;}}),e=>e.noRetry&&e.code==='TOM_WINDOWS_RUNTIME_MISSING'&&/Visual C\+\+ x64/.test(e.message));
 assert.deepEqual(checked,[path.join('native','vcruntime140.dll'),path.join('system','vcruntime140.dll')]);
});

test('Windows prerequisite check accepts installed or retained app-local DLLs and skips other platforms',async()=>{
 const present=new Set([path.join('native','vcruntime140.dll'),path.join('system','vcruntime140_1.dll'),path.join('system','msvcp140.dll')]);
 await requireWindowsRuntime('native',{platform:'win32',systemFolder:'system',exists:async file=>present.has(file)});
 await requireWindowsRuntime('native',{platform:'linux',exists:async()=>{throw Error('Must not inspect Windows paths');}});
});
