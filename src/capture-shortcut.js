'use strict';
function registerCaptureShortcut({requested, preferred, allowFallback=false, beta=false, register, handler}) {
  const legacy='CommandOrControl+Alt+Space';
  const selected=allowFallback&&beta&&requested===legacy?preferred:(requested||preferred);
  const candidates=allowFallback?[selected,preferred,...(beta?['CommandOrControl+Alt+Shift+Y','CommandOrControl+Alt+Shift+J']:['CommandOrControl+Shift+Space','CommandOrControl+Alt+Shift+K'])]:[selected];
  for(const key of new Set(candidates)) {
    try { if(register(key,handler))return key; } catch { /* Try the next valid available accelerator. */ }
  }
  return null;
}
module.exports={registerCaptureShortcut};
