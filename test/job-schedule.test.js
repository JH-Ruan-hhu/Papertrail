'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {JsonStore}=require('../src/store'),{normalizeJobApplication}=require('../src/job-core'),{createPlanningService}=require('../src/planning-service');
test('job stage deadlines sync stable schedules on save, reload, edits, clearing and deletion',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-job-schedules-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new JsonStore(path.join(dir,'data.json'));store.load();
 const job=normalizeJobApplication({id:'j',company:'Company',role:'Role',status:'active',deadline:'2026-09-20T10:00:00Z',workflow:{stages:[{id:'apply',name:'投递'},{id:'test',name:'测评'}],currentStageId:'test',deadlines:{test:'2026-09-22T10:00:00Z'}}});store.setJobApplications([job]);assert.equal(store.listSchedules().length,2);const initial=store.listSchedules().find(s=>s.legacy.stageId==='test');assert.equal(Date.parse(initial.endAt)-Date.parse(initial.startAt),30*60000);
 job.workflow.deadlines.test='2026-09-23T12:00:00Z';store.setJobApplications([job]);assert.equal(store.listSchedules().length,2);assert.equal(store.listSchedules().find(s=>s.id===initial.id).startAt,'2026-09-23T12:00:00.000Z');
 const reload=new JsonStore(store.filePath);reload.load();assert.equal(reload.listSchedules().length,2);assert.ok(reload.listSchedules().some(s=>s.id===initial.id));
 const service=createPlanningService({store:reload});service.saveSchedule({...reload.listSchedules().find(s=>s.id===initial.id),startAt:'2026-09-24T14:00:00Z',endAt:'2026-09-24T14:01:00Z'});assert.equal(reload.listJobApplications()[0].workflow.deadlines.test,'2026-09-24T14:00:00.000Z');assert.equal(reload.listSchedules().length,2);
 service.deleteSchedule(initial.id);assert.equal(reload.listJobApplications()[0].workflow.deadlines.test,null);assert.equal(reload.listSchedules().length,1);
 const unrelated={id:'user',title:'Personal',startAt:'2026-09-10T10:00:00Z',endAt:'2026-09-10T11:00:00Z'};reload.setSchedules([...reload.listSchedules(),unrelated]);reload.setJobApplications([]);assert.deepEqual(reload.listSchedules(),[unrelated]);
});

test('date-only deadline does not spill into the following calendar day',()=>{const {syncJobSchedules}=require('../src/job-schedule-core');const due=new Date(2026,8,12,23,59,59,999);const data=syncJobSchedules({jobApplications:[{id:'day',company:'C',role:'R',deadline:due.toISOString()}],schedules:[]});assert.equal(Date.parse(data.schedules[0].endAt),new Date(2026,8,13).getTime());});
