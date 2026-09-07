'use strict';
// The SVG is the single source of truth for all brand sizes.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(require('electron'),[path.join(__dirname,'render-brand.js')],{stdio:'inherit',windowsHide:true});
process.exit(result.status??1);
