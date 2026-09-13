'use strict';
// Rasterize SVG only as an image in an isolated, network-blocked renderer.
async function rasterizeSvg(body) {
  const {BrowserWindow}=require('electron');
  const win=new BrowserWindow({show:false,width:512,height:512,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'logo-svg-'+require('node:crypto').randomUUID()}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','file://*/*']},(_details,callback)=>callback({cancel:true}));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  let timer;
  try {
    return await Promise.race([(async()=>{
      await win.loadURL('data:text/html,'+encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; script-src \'none\'">'));
      const url='data:image/svg+xml;base64,'+body.toString('base64');
      const data=await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const image=new Image();image.onerror=()=>reject(new Error('SVG 图片解码失败。'));image.onload=()=>{const w=image.naturalWidth,h=image.naturalHeight;if(!w||!h||w*h>40000000){reject(new Error('SVG 图片尺寸无效。'));return;}const scale=Math.min(1,512/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/png').split(',')[1]);};image.src=${JSON.stringify(url)};})`);
      return Buffer.from(data,'base64');
    })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SVG 图片识别超时。')),10000);})]);
  } finally {clearTimeout(timer);if(!win.isDestroyed())win.destroy();}
}
module.exports={rasterizeSvg};
