'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const channel=require('../src/test-channel');const manifest=require('../package.json');
test('beta installation and local identity are isolated from stable v1.4.16',()=>{
 assert.notEqual(channel.appId,'io.papertrail.desktop');assert.equal(channel.updatesEnabled,false);
 assert.equal(channel.userData('C:/AppData'),path.join('C:/AppData','yanji-beta'));
 assert.equal(manifest.build.appId,'io.papertrail.desktop');assert.equal(manifest.build.productName,'研迹');
 assert.equal(manifest.build.publish[0].repo,'Yan_ji');assert.equal(require('../src/app-channel').localOnly,true);
 assert.doesNotMatch(fs.readFileSync('build/installer-beta.nsh','utf8'),/DeleteRegKey|ReadRegStr|ExecWait/);
});
