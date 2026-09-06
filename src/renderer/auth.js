'use strict';
(function(){
 const api=window.paperTrail;let mode='login',current=null,poll=null;
 const $=id=>document.getElementById(id);
 function render(s){current=s;$('accountName').textContent=s.user?.displayName||'未登录';$('accountIdentity').textContent=s.user?.identity||'本地测试模式';$('accountSyncStatus').textContent=({online:'已连接',offline:'离线工作',syncing:'同步中', 'sync-error':'同步需要处理'})[s.status]||'本地模式';$('authLogout').hidden=!s.user;$('authSync').hidden=!s.user;$('authMigrate').hidden=!s.user||Boolean(s.migrationCompletedAt);$('authOpen').hidden=Boolean(s.user);$('serverUrl').value=s.baseUrl||'';const career=$('careerSyncLabel');if(career)career.textContent=s.user?`${s.user.displayName} · ${$('accountSyncStatus').textContent}`:'本地模式 · 数据保存在本机';
  $('syncConflicts').replaceChildren();for(const c of s.conflicts||[]){const row=document.createElement('div');row.className='auth-conflict';const title=document.createElement('strong');title.textContent=c.title;row.append(title);for(const [choice,label] of [['local','保留本机版本'],['remote','使用云端版本']]){const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent=label;button.onclick=()=>run(async()=>render(await api.resolveSyncConflict({entity:c.entity,id:c.id,choice})));row.append(button);}$('syncConflicts').append(row);}}
 async function run(fn){$('authError').textContent='';$('accountError').textContent='';try{await fn();}catch(e){$('authError').textContent=e.message;$('accountError').textContent=e.message;}}
 function setMode(value){mode=value;$('authHeading').textContent=({login:'欢迎回到研迹',register:'创建研迹账号',reset:'找回密码',wechat:'微信扫码登录'})[mode];$('authSubmit').textContent=({login:'登录研迹',register:'创建账号',reset:'重置密码',wechat:'打开微信官方二维码'})[mode];$('authCodeRow').hidden=!['register','reset'].includes(mode);$('authNameRow').hidden=mode!=='register';$('authPasswordRow').hidden=mode==='wechat';$('authIdentityRow').hidden=mode==='wechat';$('authRules').hidden=!['register','reset'].includes(mode);$('authSubmit').disabled=false;}
 function identity(){const raw=$('authIdentity').value.trim();return window.YanjiAuthValidation.identity(raw.includes('@')||raw.startsWith('+')?raw:$('authCountry').value+raw);}
 $('authForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{if(!$('authAgreed').checked)throw new Error('请先阅读并同意用户协议和隐私政策');$('authSubmit').disabled=true;try{
   if(mode==='wechat'){await api.startWechatLogin();$('authError').textContent='请在打开的微信官方页面扫码；授权后自动返回工作台。';clearInterval(poll);poll=setInterval(()=>run(async()=>{const s=await api.pollWechatLogin();if(s.user){clearInterval(poll);render(s);$('authWelcome').hidden=true;}}),2000);setTimeout(()=>{if(poll){clearInterval(poll);poll=null;if(mode==='wechat'&&!$('authWelcome').hidden)$('authError').textContent='二维码已过期，请重新打开微信二维码';}},180000);return;}
   const data={identity:identity(),password:$('authPassword').value,code:$('authCode').value,displayName:$('authName').value,agreed:true};
   if(mode!=='login'){window.YanjiAuthValidation.password(data.password,data.identity);window.YanjiAuthValidation.code(data.code);}
   if(mode==='reset'){await api.resetPassword(data);$('authPassword').value='';setMode('login');$('authError').textContent='密码已重置，请登录';return;}
   render(await (mode==='register'?api.registerAccount(data):api.loginAccount(data)));$('authPassword').value='';$('authCode').value='';$('authWelcome').hidden=true;
  }finally{$('authSubmit').disabled=false;}});});
 document.querySelectorAll('[data-auth-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.authMode));
 $('authSendCode').onclick=()=>run(async()=>{await api.sendVerificationCode({identity:identity(),purpose:mode==='reset'?'reset':'register'});let seconds=60;$('authSendCode').disabled=true;const timer=setInterval(()=>{seconds--;$('authSendCode').textContent=seconds>0?`${seconds} 秒后重发`:'获取验证码';if(seconds<=0){clearInterval(timer);$('authSendCode').disabled=false;}},1000);});
 $('authTogglePassword').onclick=()=>{$('authPassword').type=$('authPassword').type==='password'?'text':'password';};
 $('authPassword').oninput=()=>{const value=$('authPassword').value;const states=[value.length>=8&&value.length<=64,/[a-z]/.test(value)&&/[A-Z]/.test(value),/\d/.test(value),/[^A-Za-z0-9\s]/.test(value)];$('authRules').querySelectorAll('li').forEach((li,i)=>li.classList.toggle('met',states[i]));};
 $('authPrivacyLink').onclick=e=>{e.preventDefault();$('authPrivacy').showModal();};$('authPrivacyClose').onclick=()=>$('authPrivacy').close();
 $('authLocal').onclick=()=>{$('authWelcome').hidden=true;clearInterval(poll);};
 $('authOpen').onclick=()=>{setMode('login');$('authWelcome').hidden=false;};
 $('authLogout').onclick=()=>run(async()=>{render(await api.logoutAccount());$('authWelcome').hidden=false;});
 $('authSync').onclick=()=>run(async()=>render(await api.syncWorkspace()));
 $('authMigrate').onclick=()=>run(async()=>{const ok=await window.yanjiConfirm({title:'将本机测试数据同步到当前账号',message:'将先备份测试版本机数据及附件，再复制到当前账号缓存并上传。正式版数据不会被读取。',confirmText:'备份并同步'});if(ok)render(await api.migrateLocalWorkspace(true));});
 $('saveServer').onclick=()=>run(async()=>{render(await api.configureCloud($('serverUrl').value));$('accountError').textContent='服务器地址已保存';});
 $('authConfigure').onclick=()=>{$('authWelcome').hidden=true;switchWorkbenchPage('account');};
 $('importBetaData').onclick=()=>run(async()=>{await api.importBetaData();$('accountError').textContent='已将数据副本导入测试版';});
 if(api.getAuthState){api.getAuthState().then(s=>{render(s);$('authWelcome').hidden=Boolean(s.user);}).catch(e=>{$('accountError').textContent=e.message;});api.onAuthState(render);}else $('authWelcome').hidden=true;
})();
