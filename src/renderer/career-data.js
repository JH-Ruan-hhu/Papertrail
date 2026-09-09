'use strict';
(function(root) {
  const key = d => { const v = new Date(d); return Number.isFinite(v.getTime()) ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}` : null; };
  const stages = Object.freeze([['apply','已投递'],['ai','AI 面'],['assessment','测评'],['first','一面'],['second','二面'],['hr','HR 面'],['offer','Offer'],['closed','已拒绝 / 结束']]);
  const category = name => /AI\s*面/i.test(name) ? 'ai' : /offer/i.test(name) ? 'offer' : /HR|三面|终面/i.test(name) ? 'hr' : /二面/.test(name) ? 'second' : /一面|面试/.test(name) ? 'first' : /测评|笔试|网测/.test(name) ? 'assessment' : /投递/.test(name) ? 'apply' : 'custom';
  const current = job => job.workflow?.stages?.find(s=>s.id===job.workflow.currentStageId);
  const bucket = job => job.status === 'preparing' ? 'apply' : job.status === 'closed' ? 'closed' : category(current(job)?.name || '投递');
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
  const outcomeLabel = job => job.status==='closed' ? ({rejected:'被拒绝',withdrawn:'已放弃','offer-declined':'Offer 已拒绝'}[job.closureReason]||'已结束') : current(job)?.name||'已投递';
  function transition(job,action,now=new Date().toISOString()) {
    if(!['rejected','withdrawn','offer-declined','reopened'].includes(action))throw new Error('不支持的投递状态');
    if(action==='offer-declined'&&category(current(job)?.name||'')!=='offer')throw new Error('请先记录 Offer 阶段，再标记 Offer 已拒绝');
    if(action==='reopened'&&job.status!=='closed')return JSON.parse(JSON.stringify(job));
    if(action!=='reopened'&&job.status==='closed'&&job.closureReason===action)return JSON.parse(JSON.stringify(job));
    return {...JSON.parse(JSON.stringify(job)),status:action==='reopened'?'active':'closed',closureReason:action==='reopened'?null:action,
      stageHistory:[...(job.stageHistory||[]),{action,stageId:current(job)?.id||'',stageName:current(job)?.name||'',occurredAt:now}]};
  }
  function advance(job,stageId,now=new Date().toISOString()) {
    const next=JSON.parse(JSON.stringify(job));const stage=next.workflow.stages.find(s=>s.id===stageId);
    if(!stage)throw new Error('招聘阶段不存在');
    if(next.status==='closed')throw new Error('请先恢复进行中，再推进阶段');
    next.workflow.currentStageId=stageId;next.status='active';next.closureReason=null;
    next.workflow.timeline ||= [];
    if(!next.workflow.timeline.some(t=>t.stageId===stageId&&t.date))next.workflow.timeline.push({stageId,date:now});
    next.stageHistory=[...(next.stageHistory||[]),{action:'advanced',stageId,stageName:stage.name,occurredAt:now}];return next;
  }
  function move(job, target, today=key(new Date())) {
    if(['rejected','withdrawn','offer-declined','reopened'].includes(target))return transition(job,target,new Date(today).toISOString());
    if(target==='closed')return transition(job,'rejected',new Date(today).toISOString());
    if(!stages.some(([id])=>id===target)) throw new Error('不支持的阶段');
    const next=job.status==='closed'?transition(job,'reopened',new Date(today).toISOString()):JSON.parse(JSON.stringify(job)); next.workflow ||= {stages:[],timeline:[]};
    if(target==='preparing' || target==='closed'){ next.status=target;return next; }
    next.status='active'; next.closureReason=null;
    let stage=next.workflow.stages.find(s=>category(s.name)===target);
    if(!stage){stage={id:`career-${target}`,name:stages.find(([id])=>id===target)[1]};next.workflow.stages.push(stage);}
    if(next.workflow.currentStageId!==stage.id)next.stageHistory=[...(next.stageHistory||[]),{action:'advanced',stageId:stage.id,stageName:stage.name,occurredAt:new Date(today).toISOString()}];
    next.workflow.currentStageId=stage.id;
    next.workflow.timeline ||= [];
    if(!next.workflow.timeline.some(t=>t.stageId===stage.id && t.date)) next.workflow.timeline.push({stageId:stage.id,date:today});
    if(target==='apply' && !next.appliedAt) next.appliedAt=today;
    return next;
  }
  function deadline(job) {const stage=current(job);const mapped=job.workflow?.deadlines||{};return {stageId:stage?.id,label:(stage?.name||'投递')+'截止',value:Object.prototype.hasOwnProperty.call(mapped,stage?.id)?mapped[stage.id]:(category(stage?.name||'投递')==='apply'?job.deadline||null:null)};}
  function withDeadline(job,value) {if(value&&!Number.isFinite(Date.parse(value)))throw new Error('截止时间无效');const next=JSON.parse(JSON.stringify(job)),info=deadline(next);if(!info.stageId)throw new Error('请先设置招聘阶段');next.workflow.deadlines={...(next.workflow.deadlines||{}),[info.stageId]:value||null};if(category(current(next)?.name||'')==='apply')next.deadline=value||null;return next;}
  function nextEvent(job,now=new Date()) {
    if(job.status==='closed')return {value:null,label:'下次时间',kind:'next'};
    const events=[...(job.nextFollowUpAt?[{value:job.nextFollowUpAt,label:'跟进',kind:'next'}]:[]),...(job.workflow?.timeline||[]).map(t=>({value:t.date,label:job.workflow.stages.find(s=>s.id===t.stageId)?.name||'阶段',kind:'stage:'+t.stageId})),...(job.deadline?[{value:job.deadline,label:'截止',kind:'deadline'}]:[])].filter(e=>Date.parse(e.value)>=new Date(now).getTime()).sort((a,b)=>Date.parse(a.value)-Date.parse(b.value));
    return events[0]||{value:null,label:'下次时间',kind:'next'};
  }
  function time(job) {
    const stage=current(job), stageId=stage?.id, phase=bucket(job);
    if(job.status==='preparing')return {value:job.deadline||null,label:'截止',kind:'deadline'};
    const value=job.workflow?.timeline?.find(t=>t.stageId===stageId)?.date || (phase==='apply'?job.appliedAt:null);
    return {value:value||null,label:phase==='apply'?'投递时间':phase==='assessment'?'笔试时间':phase==='offer'?'Offer 时间':'面试时间',kind:'stage',stageId};
  }
  function withTime(job,value) {
    const next=JSON.parse(JSON.stringify(job)), info=time(next);
    if(value && !Number.isFinite(Date.parse(value)))throw new Error('时间无效');
    if(info.kind==='deadline'){next.deadline=value||null;return next;}
    next.workflow ||= {stages:[{id:'stage-apply',name:'投递'}],currentStageId:'stage-apply',timeline:[]};
    const stageId=info.stageId||next.workflow.currentStageId;
    next.workflow.timeline=(next.workflow.timeline||[]).filter(t=>t.stageId!==stageId);
    if(value)next.workflow.timeline.push({stageId,date:value});
    if(bucket(next)==='apply')next.appliedAt=value||null;
    return next;
  }
  const api={deadline,withDeadline,nextEvent,transition,advance,outcomeLabel,time,withTime,key,stages,category,current,bucket,applied,events,overview,move};
  if(typeof module!=='undefined')module.exports=api;else root.YanjiCareerData=api;
}(globalThis));
