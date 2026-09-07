'use strict';
const path=require('node:path');
module.exports=Object.freeze({
  name:'研迹测试版', appId:'io.papertrail.desktop.beta', trayGuid:'6024ae13-b73a-48ae-8b20-9fef4dd0190b',
  userData:appData=>path.join(appData,'yanji-beta'),
  shortcut:'CommandOrControl+Alt+Shift+Space', updatesEnabled:false
});
