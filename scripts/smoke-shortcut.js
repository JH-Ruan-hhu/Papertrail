'use strict';
const {app,globalShortcut}=require('electron');
app.setPath('userData',require('node:path').join(__dirname,'../work/shortcut-ui')); 
const {registerCaptureShortcut}=require('../src/capture-shortcut');
const channel=require('../src/test-channel');
app.whenReady().then(()=>{
 try {
  const actual=registerCaptureShortcut({requested:'CommandOrControl+Alt+Space',preferred:channel.shortcut,beta:true,allowFallback:true,register:(key,handler)=>globalShortcut.register(key,handler),handler:()=>{}});
  if(!actual||!globalShortcut.isRegistered(actual)||actual==='CommandOrControl+Alt+Space')throw new Error('Beta shortcut registration failed');
  console.log('YANJI_BETA_SHORTCUT_REGISTERED '+actual);
  globalShortcut.unregisterAll();app.exit(0);
 }catch(error){console.error(error.message);globalShortcut.unregisterAll();app.exit(1);}
});
