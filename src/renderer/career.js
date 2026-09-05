'use strict';
const career = { month: new Date(new Date().getFullYear(),new Date().getMonth(),1), selected: window.YanjiCareerData.key(new Date()), view: 'cards', dragged: null };
function renderCareerOverview() {
  const D=window.YanjiCareerData, data=D.overview(wb.workspace.jobApplications || []), esc=wbEscape;
  document.getElementById('careerMetrics').innerHTML=[['总岗位数',data.total,'积累的每一次机会'],['已投递数量',data.submitted,'有投递日期的岗位'],['面试中数量',data.interview,'正在推进面试'],['Offer 数量',data.offers,'已收获的录用机会']].map(([label,n,sub])=>`<article><span>${label}</span><strong>${n}</strong><small>${sub}</small></article>`).join('');
  const max=Math.max(1,...data.trend.map(x=>x.count)), points=data.trend.map((x,i)=>`${35+i*85},${150-x.count/max*110}`).join(' ');
  document.getElementById('careerTrend').innerHTML=`<div class="career-panel-head"><h2>本周投递趋势</h2><span>本周 ${data.trend.reduce((n,x)=>n+x.count,0)} 次</span></div><svg viewBox="0 0 580 195" role="img" aria-label="周一至周日投递趋势"><path d="M35 40H545 M35 95H545 M35 150H545" class="chart-grid"/><polyline points="${points}" class="chart-line"/>${data.trend.map((x,i)=>`<g tabindex="0" aria-label="${x.date}，${x.count} 次投递"><title>${x.date}：${x.count} 次投递</title><circle cx="${35+i*85}" cy="${150-x.count/max*110}" r="5"/><text x="${35+i*85}" y="182" text-anchor="middle">${['周一','周二','周三','周四','周五','周六','周日'][i]}</text></g>`).join('')}</svg>`;
  document.getElementById('careerDeadlines').innerHTML=`<div class="career-panel-head"><h2>3 天内截止</h2><span>${data.deadlines.length} 个岗位</span></div>${data.deadlines.length?data.deadlines.map(j=>`<button class="career-deadline" data-edit-job="${esc(j.id)}" type="button"><strong>${esc(j.company)}</strong><span>${esc(j.role)}</span><small>${D.key(j.deadline)} · ${esc(D.current(j)?.name || '待投递')}</small></button>`).join(''):'<p class="career-empty">近 3 天没有即将截止的岗位，可以优先处理高匹配的长期机会。</p>'}`;
  const monthKey=D.key(career.month).slice(0,7), monthEvents=data.events.filter(e=>e.date.startsWith(monthKey));
  document.getElementById('careerMonthLabel').textContent=`${career.month.getFullYear()} 年 ${career.month.getMonth()+1} 月`;
  document.getElementById('careerMonthStats').textContent=`本月事件 ${monthEvents.length} · 有安排日期 ${new Set(monthEvents.map(e=>e.date)).size} · 截止提醒 ${monthEvents.filter(e=>e.type==='deadline').length}`;
  const start=new Date(career.month);start.setDate(1-(start.getDay()+6)%7);
  document.getElementById('careerCalendar').innerHTML=['一','二','三','四','五','六','日'].map(x=>`<span class="calendar-weekday">周${x}</span>`).join('')+Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);const date=D.key(d),items=data.events.filter(e=>e.date===date);return `<button type="button" class="calendar-day${date===career.selected?' selected':''}${d.getMonth()!==career.month.getMonth()?' outside':''}" data-career-date="${date}" aria-pressed="${date===career.selected}"><b>${d.getDate()}</b>${items.slice(0,2).map(e=>`<span title="${esc(e.company)} · ${esc(e.label)}">${esc(e.label)} · ${esc(e.company)}</span>`).join('')}${items.length>2?`<small>+${items.length-2}</small>`:''}</button>`;}).join('');
  const selected=data.events.filter(e=>e.date===career.selected);
  document.getElementById('careerDayEvents').innerHTML=`<h3>${career.selected}</h3>${selected.length?selected.map(e=>`<button type="button" class="career-deadline" data-edit-job="${esc(e.id)}"><strong>${esc(e.company)}</strong><span>${esc(e.role)} · ${esc(e.label)}</span></button>`).join(''):'<p class="career-empty">这一天没有投递安排。</p>'}`;
}
function renderCareerBoard(jobs) {
  const D=window.YanjiCareerData;
  const columns=[...D.stages]; if(jobs.some(j=>D.bucket(j)==='custom'))columns.splice(6,0,['custom','自定义阶段']);
  document.getElementById('careerKanban').innerHTML=columns.map(([id,label])=>{const items=jobs.filter(j=>D.bucket(j)===id);return `<section class="career-column" data-career-stage="${id}"><h3>${label}<span>${items.length}</span></h3>${items.map(j=>`<button type="button" draggable="true" data-career-job="${wbEscape(j.id)}" data-edit-job="${wbEscape(j.id)}" class="career-job"><strong>${wbEscape(j.company)}</strong><span>${wbEscape(j.role)}</span><small>${wbEscape(j.city || '未填写城市')} · ${priorityLabels[j.priority] || '普通'}</small><small>${j.deadline?D.key(j.deadline)+' 截止':'未设置截止日期'}</small>${id==='custom'?`<small>${wbEscape(D.current(j)?.name)}</small>`:''}</button>`).join('')}</section>`;}).join('');
  document.getElementById('careerKanban').hidden=career.view!=='cards';
  document.querySelector('.job-table-head').hidden=career.view!=='table';
  document.getElementById('jobBoard').hidden=career.view!=='table';
  document.querySelectorAll('[data-career-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.careerView===career.view)));
}
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
