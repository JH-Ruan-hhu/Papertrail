'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const channel=require('../src/test-channel');const manifest=require('../package.json');
test('beta installation and local identity are isolated from stable v1.4.16',()=>{
 assert.notEqual(channel.appId,'io.papertrail.desktop');assert.equal(channel.updatesEnabled,false);
 assert.equal(channel.userData('C:/AppData'),path.join('C:/AppData','yanji-beta'));
 assert.equal(manifest.build.appId,channel.appId);assert.equal(manifest.build.productName,channel.name);
 assert.equal(manifest.build.publish,null);assert.equal(manifest.build.nsis.shortcutName,channel.name);
 assert.doesNotMatch(fs.readFileSync('build/installer-beta.nsh','utf8'),/DeleteRegKey|ReadRegStr|ExecWait/);
});
