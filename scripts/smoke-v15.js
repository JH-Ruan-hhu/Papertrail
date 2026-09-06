'use strict';
const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const path=require('node:path');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('disable-gpu-compositing');app.commandLine.appendSwitch('in-process-gpu');app.setPath('userData',path.join(__dirname,'../work/smoke-v15-data'));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 let win;
 try{
  for(const [width,height] of [[1366,768],[1920,1080],[2560,1440]]) {
   win=new BrowserWindow({width,height,show:false,webPreferences:{preload:path.join(__dirname,'smoke-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
   win.setSize(width,height);
   await win.loadFile(path.join(__dirname,'../src/renderer/index.html'));
   await new Promise(r=>setTimeout(r,800));
   const result=await win.webContents.executeJavaScript(`(async()=>{
    const check=(ok,message)=>{if(!ok)throw new Error(message)};
    switchWorkbenchPage('jobs-overview');
    check(document.querySelectorAll('#careerMetrics article').length===4,'four metrics');
    check(document.querySelectorAll('[data-career-date]').length===42,'calendar cells');
    check(document.querySelectorAll('#careerTrend circle').length===7,'trend points');
    const parent=document.querySelector('.nav-item[data-workbench-page="jobs-overview"]'),child=document.querySelector('.nav-item[data-workbench-page="jobs-applications"]');
    check(child.closest('.nav-career-group')===parent.closest('.nav-career-group'),'career navigation grouped');check(Math.abs(child.getBoundingClientRect().left-parent.getBoundingClientRect().left)<1,'sibling navigation aligned');
    await new Promise(r=>requestAnimationFrame(r));
    if(innerWidth>1400)check(document.querySelector('.career-calendar').getBoundingClientRect().bottom<=innerHeight,'calendar fully visible '+JSON.stringify({top:document.querySelector('.career-calendar').getBoundingClientRect().top,bottom:document.querySelector('.career-calendar').getBoundingClientRect().bottom,viewport:innerHeight,rows:getComputedStyle(document.querySelector('.career-calendar')).gridTemplateRows}));
    switchWorkbenchPage('jobs-applications');
    check(document.querySelectorAll('.career-column').length>=7,'kanban columns');
    document.querySelector('[data-career-view="table"]').click();check(!document.getElementById('jobBoard').hidden,'table switch');
    document.querySelector('[data-career-view="cards"]').click();
    switchWorkbenchPage('schedule');
    check(!document.querySelector('.schedule-board-add'),'no bottom add');
    const shell=document.querySelector('.schedule-board-shell');applyScheduleZoom(1);
    await new Promise(r=>requestAnimationFrame(r));
    const track=document.querySelector('.schedule-time-track');
    check(track.getBoundingClientRect().bottom>=shell.getBoundingClientRect().bottom-18,'minimum track fills viewport');
    const before=wb.scheduleHourHeight; shell.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-100,bubbles:true,cancelable:true}));
    await new Promise(r=>requestAnimationFrame(r)); check(wb.scheduleHourHeight>=before,'wheel zoom');
    check(!document.getElementById('createStickyNoteButton'),'sticky removed');
    check(!document.getElementById('todayWidgetEnabled'),'widget removed');
    check(!document.querySelector('[name="homeBannerImageMode"]'),'banner removed');
    switchWorkbenchPage('jobs-overview');
    return {width:innerWidth,height:innerHeight,calendar:42,metrics:4,zoom:wb.scheduleHourHeight};
   })()`);
   win.showInactive();
   await win.webContents.executeJavaScript("switchWorkbenchPage('jobs-overview')");
   await new Promise(r=>setTimeout(r,300));
   console.log('VISIBLE_PAGE '+await win.webContents.executeJavaScript("document.querySelector('[data-page]:not([hidden])').dataset.page"));
   const shot=path.join(__dirname,`../work/v15-career-${width}.png`);fs.writeFileSync(shot,(await win.webContents.capturePage()).toPNG());
   console.log('YANJI_V15_UI_OK '+JSON.stringify(result));win.destroy();win=null;
  }
  app.exit(0);
 }catch(error){console.error(error.stack);if(win){win.showInactive();await new Promise(r=>setTimeout(r,400));fs.writeFileSync(path.join(__dirname,'../work/v15-error.png'),(await win.webContents.capturePage()).toPNG());win.destroy();}app.exit(1);}
});
