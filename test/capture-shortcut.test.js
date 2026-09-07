'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerCaptureShortcut:run}=require('../src/capture-shortcut');
const stable='CommandOrControl+Alt+Space',beta='CommandOrControl+Alt+Shift+Space';
test('existing beta default migrates to a separate combination even with stable running',()=>{const attempted=[];assert.equal(run({requested:stable,preferred:beta,beta:true,allowFallback:true,register:key=>{attempted.push(key);return key!==stable;}}),beta);assert.deepEqual(attempted,[beta]);});
test('occupied default tries a distinct fallback rather than repeating the failed key',()=>{const attempted=[];assert.equal(run({requested:stable,preferred:stable,allowFallback:true,register:key=>{attempted.push(key);return key!==stable;}}),'CommandOrControl+Shift+Space');assert.deepEqual(attempted,[stable,'CommandOrControl+Shift+Space']);});
test('explicit shortcut editing does not silently replace the requested key',()=>{assert.equal(run({requested:stable,preferred:beta,beta:true,register:()=>false}),null);});
test('custom shortcuts are retained and callback is passed to the operating system registrar',()=>{const handler=()=>{};assert.equal(run({requested:'Control+F9',preferred:beta,beta:true,allowFallback:true,handler,register:(key,fn)=>{assert.equal(fn,handler);return true;}}),'Control+F9');});
