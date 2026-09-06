'use strict';
// One short PostgreSQL advisory-locked transaction serializes security/session
// mutations and cursor allocation across processes. Scale out by sharding the
// lock by identity/account once measured load warrants it.
function prismaRepository(prisma) {
  return { transaction: fn => prisma.$transaction(async db => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(19501501)`;
    const tx={
      get:async(kind,id)=>(await db.authRecord.findUnique({where:{kind_id:{kind,id}}}))?.payload || null,
      put:async(kind,id,payload)=>db.authRecord.upsert({where:{kind_id:{kind,id}},create:{kind,id,payload},update:{payload}}),
      list:async kind=>(await db.authRecord.findMany({where:{kind}})).map(r=>r.payload),
      workspace:async(userId,entity,id)=>db.workspaceRecord.findUnique({where:{userId_entity_id:{userId,entity,id}}}),
      saveWorkspace:async record=>{const {userId,entity,id}=record;return db.workspaceRecord.upsert({where:{userId_entity_id:{userId,entity,id}},create:record,update:record});},
      pull:async(userId,cursor,limit)=>db.workspaceRecord.findMany({where:{userId,cursor:{gt:cursor}},orderBy:{cursor:'asc'},take:limit})
    };return fn(tx);
  },{maxWait:10000,timeout:15000}) };
}
// Test adapter deliberately lives outside production start-up. Every request
// still runs through the real validation, password hashing and Fastify routes.
function memoryRepository() {
  let records=new Map(),workspace=new Map(),tail=Promise.resolve();
  return {transaction(fn){const run=tail.then(async()=>{
    const r=structuredClone(records),w=structuredClone(workspace),key=(a,b)=>JSON.stringify([a,b]),wk=(u,e,i)=>JSON.stringify([u,e,i]);
    const tx={get:async(k,i)=>structuredClone(r.get(key(k,i)) || null),put:async(k,i,v)=>{r.set(key(k,i),structuredClone(v));},list:async k=>[...r].filter(([id])=>JSON.parse(id)[0]===k).map(([,v])=>structuredClone(v)),workspace:async(u,e,i)=>structuredClone(w.get(wk(u,e,i)) || null),saveWorkspace:async v=>{w.set(wk(v.userId,v.entity,v.id),structuredClone(v));},pull:async(u,c,n)=>[...w.values()].filter(v=>v.userId===u&&v.cursor>c).sort((a,b)=>a.cursor-b.cursor).slice(0,n).map(v=>structuredClone(v))};
    const result=await fn(tx);records=r;workspace=w;return result;
  });tail=run.catch(()=>{});return run;}};
}
module.exports={prismaRepository,memoryRepository};
