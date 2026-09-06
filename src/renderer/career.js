'use strict';
const career = { month: new Date(new Date().getFullYear(),new Date().getMonth(),1), selected: window.YanjiCareerData.key(new Date()), view: 'cards', dragged: null };
function fitCareerCalendar(){const calendar=document.getElementById('careerCalendar');if(calendar&&wb.page==='jobs-overview')calendar.style.setProperty('--career-calendar-height',Math.max(464,innerHeight-calendar.getBoundingClientRect().top-40)+'px');}
window.addEventListener('resize',fitCareerCalendar);
function renderCareerOverview() {
  const D=window.YanjiCareerData, data=D.overview(wb.workspace.jobApplications || []), esc=wbEscape;
  document.getElementById('careerMetrics').innerHTML=[['总岗位数',data.total,'积累的每一次机会'],['已投递数量',data.submitted,'有投递日期的岗位'],['面试中数量',data.interview,'正在推进面试'],['Offer 数量',data.offers,'已收获的录用机会']].map(([label,n,sub])=>`<article><span>${label}</span><strong>${n}</strong><small>${sub}</small></article>`).join('');
  const compact=innerWidth>=1400&&innerHeight>=900, baseline=compact?50:150, amplitude=compact?36:110, chartHeight=compact?80:195,chartWidth=Math.max(580,document.getElementById('careerTrend').clientWidth-36),xStep=(chartWidth-70)/6;
  const max=Math.max(1,...data.trend.map(x=>x.count)), points=data.trend.map((x,i)=>`${35+i*xStep},${baseline-x.count/max*amplitude}`).join(' ');
  document.getElementById('careerTrend').innerHTML=`<div class="career-panel-head"><h2>本周投递趋势</h2><span>本周 ${data.trend.reduce((n,x)=>n+x.count,0)} 次</span></div><svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="周一至周日投递趋势"><path d="M35 ${baseline-amplitude}H${chartWidth-35} M35 ${baseline-amplitude/2}H${chartWidth-35} M35 ${baseline}H${chartWidth-35}" class="chart-grid"/><polyline points="${points}" class="chart-line"/>${data.trend.map((x,i)=>`<g tabindex="0" aria-label="${x.date}，${x.count} 次投递"><title>${x.date}：${x.count} 次投递</title><circle cx="${35+i*xStep}" cy="${baseline-x.count/max*amplitude}" r="5"/><text x="${35+i*xStep}" y="${chartHeight-8}" text-anchor="middle">${['周一','周二','周三','周四','周五','周六','周日'][i]}</text></g>`).join('')}</svg>`;
  document.getElementById('careerDeadlines').innerHTML=`<div class="career-panel-head"><h2>3 天内截止</h2><span>${data.deadlines.length} 个岗位</span></div>${data.deadlines.length?data.deadlines.map(j=>`<button class="career-deadline" data-edit-job="${esc(j.id)}" type="button"><strong>${esc(j.company)}</strong><span>${esc(j.role)}</span><small>${D.key(j.deadline)} · ${esc(D.current(j)?.name || '待投递')}</small></button>`).join(''):'<p class="career-empty">近 3 天没有即将截止的岗位，可以优先处理高匹配的长期机会。</p>'}`;
  const monthKey=D.key(career.month).slice(0,7), monthEvents=data.events.filter(e=>e.date.startsWith(monthKey));
  document.getElementById('careerMonthLabel').textContent=`${career.month.getFullYear()} 年 ${career.month.getMonth()+1} 月`;
  document.getElementById('careerMonthStats').textContent=`本月事件 ${monthEvents.length} · 有安排日期 ${new Set(monthEvents.map(e=>e.date)).size} · 截止提醒 ${monthEvents.filter(e=>e.type==='deadline').length}`;
  const start=new Date(career.month);start.setDate(1-(start.getDay()+6)%7);
  document.getElementById('careerCalendar').innerHTML=['一','二','三','四','五','六','日'].map(x=>`<span class="calendar-weekday">周${x}</span>`).join('')+Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);const date=D.key(d),items=data.events.filter(e=>e.date===date);return `<button type="button" class="calendar-day${date===career.selected?' selected':''}${d.getMonth()!==career.month.getMonth()?' outside':''}" data-career-date="${date}" aria-pressed="${date===career.selected}"><b>${d.getDate()}</b>${items.slice(0,1).map(e=>`<span title="${esc(e.company)} · ${esc(e.label)}">${esc(e.label)} · ${esc(e.company)}</span>`).join('')}${items.length>1?`<small>+${items.length-1}</small>`:''}</button>`;}).join('');
  requestAnimationFrame(fitCareerCalendar);
  const selected=data.events.filter(e=>e.date===career.selected);
  document.getElementById('careerDayEvents').innerHTML=`<h3>${career.selected}</h3>${selected.length?selected.map(e=>`<button type="button" class="career-deadline" data-edit-job="${esc(e.id)}"><strong>${esc(e.company)}</strong><span>${esc(e.role)} · ${esc(e.label)}</span></button>`).join(''):'<p class="career-empty">这一天没有投递安排。</p>'}`;
}
const careerPinned=job=>Boolean(job.pinned||job.favorite);
const careerExpanded=new Set(),careerPages=new Map();
function careerIcon(name) {
 const paths={building:'<rect x="5" y="3" width="11" height="18" rx="1"/><path d="M8 7h5M8 11h5M8 15h5M9 21v-3h3v3M16 9h4v12h-4M5 12H2v9h3"/>',star:'<path d="m12 3 2.8 5.6L21 9.5l-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.5l6.2-.9Z"/>',trash:'<path d="M4 6h16M9 6V3h6v3M7 6l1 15h8l1-15M10 10v7M14 10v7"/>',down:'<path d="m6 9 6 6 6-6"/>',up:'<path d="m6 15 6-6 6 6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M7 14h2M12 14h2M7 17h2M12 17h2"/>',link:'<path d="M13 3h8v8M21 3l-11 11M9 5H4v15h15v-5"/>',note:'<path d="M4 4h16v13H9l-5 4Z"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'};
 return `<svg class="career-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.eye}</svg>`;
}
function careerScore(job,expanded=false) {
 const has=Number.isFinite(job.matchScore),score=has?Math.max(0,Math.min(100,job.matchScore)):null;
 if(expanded)return `<section class="career-match-panel"><header><span>匹配度</span><strong>${has?score+' 分':'未匹配'}</strong></header>${has?`<progress max="100" value="${score}" aria-label="匹配度 ${score} 分"></progress>`:''}</section>`;
 return `<span class="career-score${has?'':' empty'}">${has?'匹配 '+score+'分':'✧ 未匹配'}</span>`;
}
function careerTags(job) {return `<div class="career-tags">${(job.tags||[]).map(tag=>`<span>${wbEscape(tag)}</span>`).join('')}</div>`;}
function careerTime(job) {
 const info=window.YanjiCareerData.time(job),date=info.value?new Date(info.value):null,valid=date&&Number.isFinite(date.getTime());
 const remaining=valid?(date-new Date())/86400000:Infinity;
 const tone=info.kind==='deadline'?(remaining<0?' is-overdue':remaining<=3?' is-soon':''):valid&&remaining>=0&&remaining<=3?' is-soon':'';
 const text=valid?`${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}${date.getHours()||date.getMinutes()?' '+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0'):''}`:'时间未定';
 return `<button type="button" class="career-time${tone}" data-career-time="${wbEscape(job.id)}" aria-label="修改${wbEscape(job.company)}${info.label}">${careerIcon('calendar')}<span>${info.label==='投递时间'?'投递':info.label}${info.label==='投递时间'||info.kind==='deadline'?' ':'<br>'}${text}</span></button>`;
}
function careerActions(job,expanded=false) {
 const id=wbEscape(job.id);return `<button type="button" class="career-tool${careerPinned(job)?' is-favorite':''}" data-career-favorite="${id}" aria-label="${careerPinned(job)?'取消置顶':'置顶'} ${wbEscape(job.company)}" aria-pressed="${careerPinned(job)}">${careerIcon('star')}</button><button type="button" class="career-tool" data-delete-job="${id}" aria-label="删除 ${wbEscape(job.company)}">${careerIcon('trash')}</button><button type="button" class="career-tool" data-career-expand="${id}" aria-label="${expanded?'收起':'展开'} ${wbEscape(job.company)}" aria-expanded="${expanded}">${careerIcon(expanded?'up':'down')}</button>`;
}
function careerCard(job) {
 const id=wbEscape(job.id),D=window.YanjiCareerData,expanded=careerExpanded.has(job.id),phase=D.bucket(job),index=D.stages.findIndex(([key])=>key===phase),next=D.stages[index+1];
 return `<article draggable="true" class="career-job${careerPinned(job)?' is-pinned':''}" data-career-job="${id}"><div class="career-card-top"><button type="button" class="career-card-company" data-edit-job="${id}" title="${wbEscape(job.company)}">${careerIcon('building')}<span>${wbEscape(job.company)}</span></button>${careerActions(job,expanded)}</div><p class="career-card-role">${wbEscape(job.role)}</p><div class="career-card-bottom">${careerTime(job)}</div>${expanded?`<div class="career-expanded"><div class="career-meta">${wbEscape(job.city||job.location||'城市未填写')}　|　${wbEscape(job.jobType||'未分类')}<br>${wbEscape(job.resumeName||'未绑定简历')}</div>${careerTags(job)}<div class="career-detail-actions">${job.sourceUrl?`<button type="button" data-open-job-source="${wbEscape(job.sourceUrl)}">${careerIcon('link')}岗位链接</button>`:''}<button type="button" data-career-summary="${id}">${careerIcon('note')}投递总结</button></div>${job.notes?`<p class="career-meta">${wbEscape(job.notes)}</p>`:''}${next&&phase!=='closed'?`<div class="career-next"><p><span>推进阶段</span><span>点击后记录当前时间</span></p><button type="button" class="button primary" data-career-next="${id}" data-target-stage="${next[0]}">${next[1]}</button></div>`:''}</div>`:''}</article>`;
}
function careerWorkflow(job) {
 const workflow=clientJobWorkflow(job.workflow),index=workflow.stages.findIndex(s=>s.id===workflow.currentStageId),progress=Math.max(0,index)/Math.max(1,workflow.stages.length-1)*100;
 return `<div class="career-workflow" role="group" aria-label="${wbEscape(job.company)}投递进度"><div class="career-workflow-track"><div class="career-workflow-line" aria-hidden="true"><progress max="100" value="${progress}"></progress></div>${workflow.stages.map((stage,i)=>{const date=workflow.timeline.find(t=>t.stageId===stage.id)?.date;return `<button type="button" class="career-workflow-step${i<=index?' reached':''}${i===index?' current':''}" data-career-workflow="${wbEscape(job.id)}" data-stage-id="${wbEscape(stage.id)}" aria-current="${i===index?'step':'false'}" aria-label="${wbEscape(stage.name)} ${date?jobDateLabel(date,{month:'2-digit',day:'2-digit'}):'未记录'}"><i></i><span>${wbEscape(stage.name)}</span><small>${date?jobDateLabel(date,{month:'2-digit',day:'2-digit'}):'未记录'}</small></button>`;}).join('')}</div></div>`;
}
function careerTypeSelect(job) {
 const types=['产品岗','技术岗','数据岗','研发岗','科研岗','工程岗','运营岗','销售岗','市场岗','职能岗','设计岗','管培生','通用校招'];
 if(job.jobType&&!types.includes(job.jobType))types.push(job.jobType);
 return '<select class="career-type-select" data-career-type="'+wbEscape(job.id)+'" aria-label="'+wbEscape(job.company)+'岗位类型"><option value="">未分类</option>'+types.map(type=>'<option value="'+wbEscape(type)+'"'+(job.jobType===type?' selected':'')+'>'+wbEscape(type)+'</option>').join('')+'</select>';
}
function careerTableRow(job) {
 const id=wbEscape(job.id);
 return `<article class="job-position${careerPinned(job)?' is-pinned':''}" data-job-id="${id}" tabindex="0" aria-label="${wbEscape(job.company)} ${wbEscape(job.role)}"><div class="job-position-main"><div class="job-company-cell"><div class="job-company-name"><strong>${wbEscape(job.company)}</strong><button type="button" class="career-tool${careerPinned(job)?' is-favorite':''}" data-career-favorite="${id}" aria-pressed="${careerPinned(job)}" aria-label="${careerPinned(job)?'取消置顶':'置顶'} ${wbEscape(job.company)}">${careerIcon('star')}</button></div><span>${wbEscape(job.role)}</span></div><div>${wbEscape(job.city||job.location||'—')}</div><div>${careerTypeSelect(job)}</div><div>${careerTime(job)}</div><div>${careerTags(job)}</div><div class="job-position-actions"><button type="button" class="career-tool" data-edit-job="${id}" aria-label="查看 ${wbEscape(job.company)}">${careerIcon('eye')}</button>${job.sourceUrl?`<button type="button" class="career-tool" data-open-job-source="${wbEscape(job.sourceUrl)}" aria-label="打开岗位链接">${careerIcon('link')}</button>`:''}<button type="button" class="career-tool" data-career-summary="${id}" aria-label="投递总结">${careerIcon('note')}</button><button type="button" class="career-tool" data-delete-job="${id}" aria-label="删除 ${wbEscape(job.company)}">${careerIcon('trash')}</button></div></div>${careerWorkflow(job)}</article>`;
}
document.addEventListener('click',event=>{const step=event.target.closest('[data-career-workflow]');if(!step)return;const job=wb.workspace.jobApplications.find(j=>j.id===step.dataset.careerWorkflow);if(!job)return;if(job.workflow.currentStageId===step.dataset.stageId){openCareerTime(job.id);return;}saveCareerPatch(job.id,j=>{const workflow=structuredClone(j.workflow);workflow.currentStageId=step.dataset.stageId;return {workflow,status:j.status==='preparing'?'active':j.status};});});
function renderCareerBoard(jobs) {
 const D=window.YanjiCareerData,board=document.getElementById('careerKanban'),scroll=board.scrollLeft;
 const columns=[...D.stages];if(jobs.some(j=>D.bucket(j)==='custom'))columns.splice(5,0,['custom','自定义阶段']);
 board.innerHTML=columns.map(([id,label])=>{const items=jobs.filter(j=>D.bucket(j)===id),total=Math.max(1,Math.ceil(items.length/10)),page=Math.min(careerPages.get(id)||0,total-1);careerPages.set(id,page);return `<section class="career-column" data-career-stage="${id}"><h3>${label}<span>${items.length}</span></h3><div class="career-column-list">${items.slice(page*10,page*10+10).map(careerCard).join('')||'<p class="career-column-empty">这一栏还没有岗位</p>'}</div><footer class="career-column-footer"><button data-career-page="${id}" data-delta="-1" type="button"${page===0?' disabled':''}>上一页</button><span>${page+1}/${total} · ${Math.min(items.length,10)}/${items.length}</span><button data-career-page="${id}" data-delta="1" type="button"${page===total-1?' disabled':''}>下一页</button></footer></section>`;}).join('');
 board.hidden=career.view!=='cards';board.scrollLeft=scroll;
 board.style.setProperty('--career-board-height',Math.max(260,innerHeight-board.getBoundingClientRect().top-24)+'px');
 document.querySelector('.job-table-scroll').hidden=career.view!=='table';document.querySelector('.job-table-head').hidden=career.view!=='table';document.getElementById('jobBoard').hidden=career.view!=='table';
 document.querySelectorAll('[data-career-sort]').forEach(button=>{button.setAttribute('aria-pressed',String(wb.jobSort===button.dataset.careerSort));button.querySelector('i').textContent=wb.jobSort===button.dataset.careerSort?(wb.jobSortDirection==='asc'?'↑':'↓'):'↕';});
 document.querySelectorAll('[data-career-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.careerView===career.view)));
}
async function saveCareerPatch(id,makePatch) {
 const job=wb.workspace.jobApplications.find(j=>j.id===id);if(!job)return;
 try {const saved=await workbenchApi.saveJobApplication({...job,...makePatch(job),revision:job.revision});wb.workspace.jobApplications=wb.workspace.jobApplications.map(j=>j.id===id?saved:j);renderJobs();renderHome();return true;}catch(e){showWorkbenchToast(e.message,'error');return false;}
}
function openCareerTime(id) {
 const job=wb.workspace.jobApplications.find(j=>j.id===id);if(!job)return;const info=window.YanjiCareerData.time(job);let dialog=document.getElementById('careerTimeDialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='careerTimeDialog';document.body.append(dialog);}
 const date=info.value?new Date(info.value):null,value=date&&Number.isFinite(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 dialog.innerHTML=`<form class="career-time-form"><h2>${wbEscape(info.label)}</h2><label>${wbEscape(job.company)} · ${wbEscape(job.role)}<input name="time" type="datetime-local" value="${value}" aria-label="阶段时间"></label><footer><button type="button" class="button secondary" data-time-cancel>取消</button><button type="submit" class="button primary">保存</button></footer></form>`;
 dialog.querySelector('[data-time-cancel]').onclick=()=>dialog.close();dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const input=dialog.querySelector('input').value;const ok=await saveCareerPatch(id,j=>window.YanjiCareerData.withTime(j,input?new Date(input).toISOString():null));if(ok)dialog.close();};dialog.showModal();
}
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-career-expand],[data-career-favorite],[data-career-next],[data-career-time],[data-career-summary],[data-career-page],[data-career-scroll]');if(!target)return;
 if(target.dataset.careerExpand){const id=target.dataset.careerExpand;careerExpanded.has(id)?careerExpanded.delete(id):careerExpanded.add(id);renderJobs();}
 if(target.dataset.careerFavorite)saveCareerPatch(target.dataset.careerFavorite,j=>({pinned:!careerPinned(j),favorite:false}));
 if(target.dataset.careerNext)saveCareerPatch(target.dataset.careerNext,j=>window.YanjiCareerData.move(j,target.dataset.targetStage,new Date().toISOString()));
 if(target.dataset.careerTime)openCareerTime(target.dataset.careerTime);
 if(target.dataset.careerSummary){openJobEditor(wb.workspace.jobApplications.find(j=>j.id===target.dataset.careerSummary));requestAnimationFrame(()=>document.getElementById('jobNotes').focus());}
 if(target.dataset.careerPage){careerPages.set(target.dataset.careerPage,(careerPages.get(target.dataset.careerPage)||0)+Number(target.dataset.delta));renderJobs();}
 if(target.dataset.careerScroll)document.querySelector(career.view==='cards'?'#careerKanban':'.job-table-scroll').scrollBy({left:Number(target.dataset.careerScroll)*300,behavior:'smooth'});
});
document.addEventListener('click',event=>{const sort=event.target.closest('[data-career-sort]');if(sort){wb.jobSortDirection=wb.jobSort===sort.dataset.careerSort&&wb.jobSortDirection==='asc'?'desc':'asc';wb.jobSort=sort.dataset.careerSort;renderJobs();}});
window.addEventListener('resize',()=>{if(wb.page==='jobs-applications'){const board=document.getElementById('careerKanban');board.style.setProperty('--career-board-height',Math.max(260,innerHeight-board.getBoundingClientRect().top-24)+'px');}});
document.addEventListener('change',event=>{const select=event.target.closest('[data-career-select]');if(select&&select.value!=='custom')saveCareerPatch(select.dataset.careerSelect,j=>window.YanjiCareerData.move(j,select.value,new Date().toISOString()));});

document.addEventListener('click',event=>{
  const date=event.target.closest('[data-career-date]');if(date){career.selected=date.dataset.careerDate;renderCareerOverview();}
  const month=event.target.closest('[data-career-month]');if(month){career.month.setMonth(career.month.getMonth()+Number(month.dataset.careerMonth));renderCareerOverview();}
  const view=event.target.closest('[data-career-view]');if(view){career.view=view.dataset.careerView;renderJobs();}
});
document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-career-job]');if(card){career.dragged=card.dataset.careerJob;event.dataTransfer.setData('text/plain',career.dragged);event.dataTransfer.effectAllowed='move';}});
document.addEventListener('dragover',event=>{if(career.dragged && event.target.closest('[data-career-stage]'))event.preventDefault();});
document.addEventListener('dragend',()=>{career.dragged=null;});
document.addEventListener('drop',async event=>{
  const column=event.target.closest('[data-career-stage]'),id=career.dragged;career.dragged=null;
  if(!column || !id)return;event.preventDefault();
  try{const job=wb.workspace.jobApplications.find(j=>j.id===id);const updated=await workbenchApi.saveJobApplication(window.YanjiCareerData.move(job,column.dataset.careerStage));wb.workspace.jobApplications=wb.workspace.jobApplications.map(j=>j.id===id?updated:j);renderJobs();renderHome();}catch(error){showWorkbenchToast(error.message,'error');}
});

document.addEventListener('change',event=>{const type=event.target.closest('[data-career-type]');if(type)saveCareerPatch(type.dataset.careerType,()=>({jobType:type.value||null}));});
