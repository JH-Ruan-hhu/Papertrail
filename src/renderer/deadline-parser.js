'use strict';
(function(root){
  const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  function number(text){if(/^\d+(\.\d+)?$/.test(text))return Number(text);if(text.includes('十')){const [a,b]=text.split('十');return (a?digits[a]:1)*10+(b?digits[b]:0);}return digits[text];}
  function localValue(value){const d=new Date(value);return Number.isFinite(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:'';}
  function parse(value,now=new Date()){
    const text=String(value||'').trim(),base=new Date(now);if(!text)return {valid:true,value:null,label:'清除当前阶段截止时间'};
    if(!Number.isFinite(base.getTime()))return {valid:false,error:'起算时间无效'};
    const relative=text.match(/(\d+(?:\.\d+)?|[零一二两三四五六七八九十]+)\s*(小时|分钟|天|周)\s*(?:以内|之内|内|后)/);
    if(relative){const n=number(relative[1]),unit={小时:3600000,分钟:60000,天:86400000,周:604800000}[relative[2]];if(!Number.isFinite(n)||n<0||n*unit>10*365*86400000)return {valid:false,error:'时间范围无效'};const d=new Date(base.getTime()+n*unit);return {valid:true,value:d.toISOString(),label:localValue(d),relative:true,baseAt:base.toISOString()};}
    let date=new Date(base.getFullYear(),base.getMonth(),base.getDate()),explicit=false;
    const absolute=text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]|$)/),monthDay=text.match(/^(\d{1,2})月(\d{1,2})[日号]?/),day=text.match(/今天|明天|后天/);
    if(absolute||monthDay){const y=absolute?Number(absolute[1]):base.getFullYear(),m=Number(absolute?absolute[2]:monthDay[1]),d=Number(absolute?absolute[3]:monthDay[2]);date=new Date(y,m-1,d);if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)return {valid:false,error:'日期不存在'};explicit=true;}
    else if(day){date.setDate(date.getDate()+({今天:0,明天:1,后天:2}[day[0]]));explicit=true;}
    const clock=text.match(/(\d{1,2}|[零一二两三四五六七八九十]+)\s*(?:[:：](\d{1,2})|[点时](半|\d{1,2}分?)?)/);
    if(!explicit&&!clock)return {valid:false,error:'请输入如 2026-09-12 18:00、明天下午5点或72小时内'};
    if(clock){let h=number(clock[1]),m=clock[2]?Number(clock[2]):clock[3]==='半'?30:clock[3]?Number(clock[3].replace('分','')):0;if(/下午|晚上|傍晚/.test(text)&&h<12)h+=12;if(/凌晨/.test(text)&&h===12)h=0;if(!Number.isFinite(h)||h<0||h>23||m<0||m>59)return {valid:false,error:'时分无效'};date.setHours(h,m,0,0);}
    else date.setHours(23,59,59,999);
    return {valid:true,value:date.toISOString(),label:localValue(date),relative:false};
  }
  const api={parse,localValue};if(typeof module!=='undefined')module.exports=api;else root.YanjiDeadlineParser=api;
})(globalThis);
