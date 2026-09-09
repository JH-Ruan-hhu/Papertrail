'use strict';
const crypto=require('node:crypto');
function deadlineEntries(job){
 const stages=job.workflow?.stages||[],map=job.workflow?.deadlines||{};
 const entries=stages.map(stage=>({stageId:stage.id,label:stage.name,value:Object.hasOwn(map,stage.id)?map[stage.id]:/投递/.test(stage.name)?job.deadline:null}));
 if(!stages.length&&job.deadline)entries.push({stageId:'application',label:'投递',value:job.deadline});
 return entries.filter(e=>e.value&&Number.isFinite(Date.parse(e.value)));
}
function syncJobSchedules(workspace,now=new Date().toISOString()){
 const existing=new Map((workspace.schedules||[]).filter(s=>s.legacy?.managedByJobDeadline).map(s=>[s.legacy.jobId+'\0'+s.legacy.stageId,s]));
 const schedules=(workspace.schedules||[]).filter(s=>!s.legacy?.managedByJobDeadline);
 for(const job of workspace.jobApplications||[])for(const entry of deadlineEntries(job)){
  const old=existing.get(job.id+'\0'+entry.stageId),startAt=new Date(entry.value).toISOString(),changed=old?.startAt!==startAt;
  const boundary=new Date(startAt);boundary.setHours(24,0,0,0);
  const schedule={...old,id:old?.id||'job-due-'+crypto.createHash('sha256').update(job.id+'\0'+entry.stageId).digest('hex').slice(0,32),title:`${job.company} · ${job.role} · ${entry.label}截止`,startAt,endAt:new Date(Math.min(Date.parse(startAt)+30*60000,boundary.getTime())).toISOString(),allDay:false,priority:'high',reminderMinutesBefore:null,reminderSentAt:changed?null:old?.reminderSentAt||null,repeat:null,sourceRef:null,completedAt:job.status==='closed'?(old?.completedAt||now):null,createdAt:old?.createdAt||now,updatedAt:old?.updatedAt||now,legacy:{...old?.legacy,managedByJobDeadline:true,jobId:job.id,stageId:entry.stageId}};
  if(old&&JSON.stringify({...schedule,updatedAt:old.updatedAt})!==JSON.stringify(old))schedule.updatedAt=now;
  schedules.push(schedule);
 }
 return {...workspace,schedules};
}
function updateLinkedDeadline(workspace,schedule,value,now){
 const link=schedule?.legacy;if(!link?.managedByJobDeadline)return;
 workspace.jobApplications=(workspace.jobApplications||[]).map(job=>{
  if(job.id!==link.jobId)return job;
  const workflow={...job.workflow,deadlines:{...job.workflow?.deadlines,[link.stageId]:value}};
  const application=link.stageId==='application'||/投递/.test(workflow.stages?.find(s=>s.id===link.stageId)?.name||'');
  return {...job,workflow,...(application?{deadline:value}:{}),revision:(job.revision||0)+1,updatedAt:now,deadlineReminderSentAt:null};
 });
}
module.exports={deadlineEntries,syncJobSchedules,updateLinkedDeadline};
