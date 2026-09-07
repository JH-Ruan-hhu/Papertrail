'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {backupBeforeUpgrade}=require('../src/upgrade-backup');
test('upgrade backup retains original bytes, attachments and pointer and is not overwritten',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-backup-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'papertrail-data.json'),raw='{"version":11,"notes":[{"id":"note-1","content":"原笔记"}]}';fs.writeFileSync(file,raw);fs.mkdirSync(path.join(root,'attachments'));fs.writeFileSync(path.join(root,'attachments','note.bin'),'attachment');fs.writeFileSync(path.join(root,'papertrail-storage.json'),'{}');
 const backup=backupBeforeUpgrade(file,root,'1.5.0');assert.equal(fs.readFileSync(path.join(backup,'papertrail-data.json'),'utf8'),raw);assert.equal(fs.readFileSync(path.join(backup,'attachments','note.bin'),'utf8'),'attachment');assert.equal(fs.readFileSync(file,'utf8'),raw);
 fs.writeFileSync(file,'{"version":11}');assert.equal(backupBeforeUpgrade(file,root,'1.5.0'),backup);assert.equal(fs.readFileSync(path.join(backup,'papertrail-data.json'),'utf8'),raw);
});
test('invalid data aborts backup before any original data can be changed',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-invalid-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'papertrail-data.json');fs.writeFileSync(file,'invalid');assert.throws(()=>backupBeforeUpgrade(file,root,'1.5.0'));assert.equal(fs.readFileSync(file,'utf8'),'invalid');});
