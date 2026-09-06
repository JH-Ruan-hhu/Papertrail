'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const source=path.resolve(__dirname,'..');const stage=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-beta-build-'));console.log('BETA_BUILD_STAGE '+stage);
for(const name of ['src','build','node_modules','package.json','package-lock.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md'])fs.cpSync(path.join(source,name),path.join(stage,name),{recursive:true});
const r=spawnSync(process.execPath,[path.join(stage,'node_modules/electron-builder/cli.js'),'--win','nsis','--x64','--publish','never','--config.electronDist='+path.join(stage,'node_modules/electron/dist')],{cwd:stage,windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});console.log(r.stdout);console.error(r.stderr);if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
fs.cpSync(path.join(stage,'outputs-beta'),path.join(source,'outputs-beta'),{recursive:true});console.log('YANJI_BETA_BUILD_OK '+path.join(source,'outputs-beta'));
