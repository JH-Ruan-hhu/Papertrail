'use strict';
(function(root){
 const weak=new Set(['password1!','welcome1!','admin123!','qwerty123!','letmein1!','changeme1!']);
 function identity(value){
  const input=String(value||'').trim();
  if(input.includes('@')){const parts=input.split('@');if(parts.length!==2 || input.length>254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..') || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(parts[1]))throw new Error('请输入有效的邮箱地址');return parts[0].toLowerCase()+'@'+parts[1].toLowerCase();}
  if(!/^\+[1-9]\d{7,14}$/.test(input) || (input.startsWith('+86')&&!/^\+861[3-9]\d{9}$/.test(input)))throw new Error('请输入包含国家区号的有效手机号');return input;
 }
 function password(value,account=''){
  const p=String(value||'');if(!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{8,64}$/.test(p))throw new Error('密码需为 8–64 位，包含大小写字母、数字和特殊字符');
  if(/(.)\1{2,}/.test(p))throw new Error('密码不能包含连续三个相同字符');
  if(weak.has(p.toLowerCase()) || /^(password|welcome|admin|qwerty|letmein|test)[0-9!@#$%^&*]*$/i.test(p))throw new Error('请避开常见弱密码');
  const local=account.split('@')[0].replace(/^\+/,'');if(local.length>=4&&p.toLowerCase().includes(local.toLowerCase()))throw new Error('密码不能包含账号');return p;
 }
 function code(value){if(!/^\d{6}$/.test(String(value||'')))throw new Error('请输入 6 位验证码');return value;}
 const api={identity,password,code};if(typeof module!=='undefined')module.exports=api;else root.YanjiAuthValidation=api;
}(globalThis));
