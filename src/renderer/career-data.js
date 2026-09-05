'use strict';
(function(root) {
  const key = d => { const v = new Date(d); return Number.isFinite(v.getTime()) ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}` : null; };
  const stages = Object.freeze([['preparing','待投递'],['apply','已投递'],['assessment','笔试'],['first','一面'],['second','二面'],['hr','HR 面'],['offer','Offer'],['closed','已拒绝 / 结束']]);
  const category = name => /offer/i.test(name) ? 'offer' : /HR|三面|终面/i.test(name) ? 'hr' : /二面/.test(name) ? 'second' : /一面|面试/.test(name) ? 'first' : /测评|笔试|网测/.test(name) ? 'assessment' : /投递/.test(name) ? 'apply' : 'custom';
  const current = job => job.workflow?.stages?.find(s=>s.id===job.workflow.currentStageId);
  const bucket = job => job.status === 'preparing' ? 'preparing' : job.status === 'closed' && category(current(job)?.name || '') !== 'offer' ? 'closed' : category(current(job)?.name || '投递');
  const applied = job => job.workflow?.timeline?.find(t=>category(job.workflow.stages.find(s=>s.id===t.stageId)?.name || '')==='apply' && t.date)?.date || job.appliedAt;
  function events(jobs) {
    const rows=[];
    for(const job of jobs) {
      const add=(date,label,type)=> { if(date && key(date)) rows.push({id:job.id,date:key(date),label,type,company:job.company,role:job.role}); };
      add(job.deadline,'截止','deadline');
      const timeline=job.workflow?.timeline || [];
      for(const item of timeline) add(item.date,job.workflow.stages.find(s=>s.id===item.stageId)?.name || '历史阶段','stage');
      if(!timeline.some(t=>t.date && category(job.workflow.stages.find(s=>s.id===t.stageId)?.name || '')==='apply')) add(job.appliedAt,'已投递','stage');
      if(job.status==='closed' && bucket(job)!=='offer') add(job.updatedAt,'已结束','closed');
    }
    return rows.sort((a,b)=>a.date.localeCompare(b.date));
  }
  function overview(jobs, now=new Date()) {
    const today=key(now); const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(now.getDay()+6)%7);
    const trend=Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);const date=key(d);return {date,count:jobs.filter(j=>applied(j) && key(applied(j))===date).length};});
    const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+3);
    return { total:jobs.length,submitted:jobs.filter(j=>applied(j)).length,interview:jobs.filter(j=>j.status!=='closed' && ['first','second','hr'].includes(bucket(j))).length,offers:jobs.filter(j=>bucket(j)==='offer').length,trend,
      deadlines:jobs.filter(j=>j.status!=='closed' && j.deadline && key(j.deadline)>=today && key(j.deadline)<=key(end)).sort((a,b)=>key(a.deadline).localeCompare(key(b.deadline))),events:events(jobs)};
  }
  function move(job, target, today=key(new Date())) {
    if(!stages.some(([id])=>id===target)) throw new Error('不支持的阶段');
    const next=JSON.parse(JSON.stringify(job)); next.workflow ||= {stages:[],timeline:[]};
    if(target==='preparing' || target==='closed'){ next.status=target;return next; }
    next.status='active';
    let stage=next.workflow.stages.find(s=>category(s.name)===target);
    if(!stage){stage={id:`career-${target}`,name:stages.find(([id])=>id===target)[1]};next.workflow.stages.push(stage);}
    next.workflow.currentStageId=stage.id;
    next.workflow.timeline ||= [];
    if(!next.workflow.timeline.some(t=>t.stageId===stage.id && t.date)) next.workflow.timeline.push({stageId:stage.id,date:today});
    if(target==='apply' && !next.appliedAt) next.appliedAt=today;
    return next;
  }
  const api={key,stages,category,current,bucket,applied,events,overview,move};
  if(typeof module!=='undefined')module.exports=api;else root.YanjiCareerData=api;
}(globalThis));
