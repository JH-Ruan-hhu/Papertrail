'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/renderer/workbench.js'),'utf8');
const context={clientJobWorkflow:w=>w,jobWorkflowStageIndex:j=>j.workflow.stages.findIndex(s=>s.id===j.workflow.currentStageId)};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function jobReachedFunnelStage('),source.indexOf('function jobFunnelCounts(')),context);
test('home funnel excludes terminal outcomes while retaining submitted history',()=>{
 const base={status:'active',workflow:{stages:[{id:'apply',name:'投递'},{id:'test',name:'测评'},{id:'interview',name:'HR面'},{id:'offer',name:'Offer'}],currentStageId:'interview'}};
 assert.equal(context.jobReachedFunnelStage(base,'interview'),true);
 for(const closureReason of ['rejected','withdrawn','offer-declined']){const closed={...base,status:'closed',closureReason};for(const stage of ['assessment','interview','offer'])assert.equal(context.jobReachedFunnelStage(closed,stage),false);assert.equal(context.jobReachedFunnelStage(closed,'submitted'),true);assert.equal(context.jobReachedFunnelStage({...closed,status:'active'},'interview'),true);}
 assert.equal(context.jobReachedFunnelStage({...base,status:'preparing'},'submitted'),false);
 const ai={status:'active',workflow:{stages:[{id:'ai',name:'AI 面'}],currentStageId:'ai'}};assert.equal(context.jobReachedFunnelStage(ai,'interview'),true);
});
