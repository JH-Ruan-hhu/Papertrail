'use strict';
const {spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'../work/main-v15-qa');fs.mkdirSync(root,{recursive:true});const result=path.join(root,'result.json');
const child=spawnSync(require('electron'),[path.join(__dirname,'..'),'--smoke-test'],{env:{...process.env,YANJI_QA_USER_DATA:root,YANJI_SMOKE_RESULT:result},windowsHide:true,encoding:'utf8',timeout:30000});
console.log(child.stdout);if(child.status!==0||!fs.existsSync(result)){console.error(child.stderr);process.exit(1);}const data=JSON.parse(fs.readFileSync(result));if(data.marker!=='YANJI_SMOKE_OK')throw new Error('Main startup failed');console.log('YANJI_V15_MAIN_OK');
