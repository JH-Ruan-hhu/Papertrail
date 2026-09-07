'use strict';
// Rasterize the canonical SVG with Chromium, then build the multi-size ICO.
const {app,BrowserWindow,nativeImage}=require('electron');const fs=require('node:fs');const path=require('node:path');
app.setPath('userData',path.join(__dirname,'../work/brand-render-data'));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('disable-gpu-compositing');app.commandLine.appendSwitch('in-process-gpu');
app.whenReady().then(async()=>{
 try{
  const win=new BrowserWindow({width:1024,height:1024,useContentSize:true,frame:false,transparent:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:false}});
  const svg=fs.readFileSync(path.join(__dirname,'../build/icon.svg'),'utf8');
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<style>html,body{margin:0;width:1024px;height:1024px;background:transparent}svg{width:1024px;height:1024px;display:block}</style>${svg}`));
  win.showInactive();await new Promise(r=>setTimeout(r,200));
  const image=await win.webContents.capturePage();
  const build=path.join(__dirname,'../build');fs.writeFileSync(path.join(build,'icon.png'),image.resize({width:512,height:512,quality:'best'}).toPNG());
  const sizes=[16,20,24,32,40,48,64,128,256];const buffers=sizes.map(size=>image.resize({width:size,height:size,quality:'best'}).toPNG());
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
  sizes.forEach((size,i)=>{const p=6+i*16;header[p]=size===256?0:size;header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(buffers[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=buffers[i].length;});
  fs.writeFileSync(path.join(build,'icon.ico'),Buffer.concat([header,...buffers]));
  fs.copyFileSync(path.join(build,'icon.svg'),path.join(__dirname,'../src/renderer/brand.svg'));
  console.log('YANJI_BRAND_OK '+sizes.join(','));win.destroy();app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
