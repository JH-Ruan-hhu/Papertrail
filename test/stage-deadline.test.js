'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../src/renderer/deadline-parser'),D=require('../src/renderer/career-data'),J=require('../src/job-core');
test('relative deadlines resolve from the fixed editing anchor without drifting',()=>{
 for(const empty of [null,undefined,'','   '])assert.equal(P.localValue(empty),'');
 const now=new Date(2026,8,8,14,35,0);
 for(const [text,hours] of [['72小时',72],['48小时',48],['2天',48],['90分钟',1.5],['72小时内',72],['请在48小时以内完成测评',48],['3天内',72],['两天内',48],['三十六小时后',36],['90分钟内',1.5]]){const result=P.parse(text,now);assert.equal(result.valid,true,text);assert.equal(Date.parse(result.value)-now.getTime(),hours*3600000,text);}
 assert.equal(new Date(P.parse('明天下午5点',now).value).getHours(),17);assert.equal(new Date(P.parse('明天下午5点',now).value).getDate(),9);
 assert.equal(P.localValue(P.parse('2026-09-12 18:30',now).value),'2026-09-12 18:30');assert.equal(P.parse('2026-02-30 18:00',now).valid,false);assert.equal(P.parse('明天25点',now).valid,false);assert.equal(P.parse('不知道',now).valid,false);assert.equal(P.parse('',now).value,null);
});
test('stage deadlines survive normalization, switching, clearing, rejection and restore',()=>{
 const job=J.normalizeJobApplication({id:'job',company:'单位',role:'工程师',status:'active',deadline:'2026-09-10',workflow:{stages:[{id:'apply',name:'投递'},{id:'assessment',name:'测评'},{id:'offer',name:'Offer'}],currentStageId:'apply',timeline:[]}});
 const date='2026-09-11T10:00:00.000Z';let saved=J.normalizeJobApplication(D.withDeadline(job,date));assert.equal(D.deadline(saved).value,date);
 saved=D.advance(saved,'assessment');assert.equal(D.deadline(saved).value,null,'application deadline never leaks into assessment');saved=J.normalizeJobApplication(D.withDeadline(saved,'2026-09-14T10:00:00.000Z'));assert.equal(D.deadline(saved).label,'测评截止');
 saved=D.transition(saved,'rejected');saved=D.transition(saved,'reopened');assert.equal(D.deadline(saved).value,'2026-09-14T10:00:00.000Z');saved=D.advance(saved,'apply');assert.equal(D.deadline(saved).value,date);saved=J.normalizeJobApplication(D.withDeadline(saved,null));assert.equal(D.deadline(saved).value,null);assert.equal(saved.workflow.deadlines.assessment,'2026-09-14T10:00:00.000Z');
});

test('old date-only captures are repaired on actual store load with a backup and unchanged IDs',t=>{
 const fs=require('fs'),os=require('os'),path=require('path'),{JsonStore}=require('../src/store');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-old-capture-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'data.json'),store=new JsonStore(file);store.load();const start=new Date(2026,8,8,23,59,59,999);
 store.data.schedules=[{id:'old-capture',title:'完成报告',startAt:start.toISOString(),endAt:new Date(start.getTime()+3600000).toISOString(),sourceRef:{type:'todo',id:'todo'},legacy:{managedByTodo:true},unknownFixture:'keep'}];store.save();const reopened=new JsonStore(file);reopened.load();const schedule=reopened.data.schedules[0];assert.equal(schedule.id,'old-capture');assert.equal(schedule.unknownFixture,'keep');assert.equal(schedule.allDay,true);assert.equal(Date.parse(schedule.endAt),new Date(2026,8,9).getTime());assert.ok(fs.readdirSync(dir).some(f=>f.includes('.pre-v11.')));
});
