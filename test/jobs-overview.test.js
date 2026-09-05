'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const D=require('../src/renderer/career-data');
const job={id:'a',company:'单位',role:'岗位',status:'active',deadline:'2026-09-08',workflow:{stages:[{id:'a',name:'投递'},{id:'x',name:'学术报告'}],currentStageId:'x',timeline:[{stageId:'a',date:'2026-09-01'}]}};
test('overview counts real application dates and excludes expired or closed deadlines',()=>{
 const data=D.overview([job,{...job,id:'closed',status:'closed'},{...job,id:'expired',deadline:'2026-09-04'}],new Date(2026,8,5));
 assert.equal(data.trend[1].count,3);assert.equal(data.deadlines.length,1);assert.equal(data.total,3);
 assert.equal(data.events.filter(e=>e.label==='投递').length,3);
});
test('moving a legacy workflow retains custom stages and dates and records one target date',()=>{
 const moved=D.move(job,'hr','2026-09-05');assert.ok(moved.workflow.stages.some(s=>s.name==='学术报告'));
 assert.equal(moved.workflow.timeline[0].date,'2026-09-01');assert.equal(D.bucket(moved),'hr');
 assert.deepEqual(D.move(moved,'hr','2026-09-06').workflow.timeline,moved.workflow.timeline);
 assert.equal(D.move(moved,'closed').status,'closed');assert.equal(job.workflow.currentStageId,'x');
});
