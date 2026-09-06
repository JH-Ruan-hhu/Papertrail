'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
const {migrateData}=require('./paper-core');const {DEFAULT_SETTINGS}=require('./store');
const collections=['schedules','todos','countdowns','notes','metadataFields','attendance','focusSessions','jobApplications','papers'];
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(id);
function createCloudClient({directory,safeStorage,request=fetch,getStore,activateAccount,notify=()=>{},backupLocal,importLocal}) {
 let session=null,accessToken=null,refreshToken=null,expiresAt=0,status='offline',running=null,conflicts=[],wechatSession=null;
 const configPath=path.join(directory,'cloud-config.json'),sessionPath=path.join(directory,'cloud-session.enc');
 let baseUrl='';try{baseUrl=JSON.parse(fs.readFileSync(configPath,'utf8')).baseUrl||'';}catch{}
 const state=()=>({user:session?.user||null,configured:Boolean(baseUrl),baseUrl,status,conflicts:conflicts.map(c=>({entity:c.entity,id:c.id,title:c.local?.title||c.local?.company||c.id})),migrationCompletedAt:getStore()?.data?._cloud?.migrationCompletedAt||null});
 const emit=()=>notify(state());
 function persistSession(){if(!safeStorage.isEncryptionAvailable())throw new Error('Windows 凭据加密不可用，无法保存登录会话');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(sessionPath+'.tmp',safeStorage.encryptString(JSON.stringify({...session,refreshToken})));fs.renameSync(sessionPath+'.tmp',sessionPath);}
 async function api(route,body,authorized=false){if(!baseUrl)throw new Error('请先配置测试服务器地址');
  if(authorized&&Date.now()>=expiresAt)await refresh();
  const response=await request(baseUrl+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(authorized?{authorization:'Bearer '+accessToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)});
  const text=await response.text();if(text.length>24*1024*1024)throw new Error('服务器响应过大');let value;try{value=JSON.parse(text);}catch{throw new Error('服务器响应无效');}
  if(!response.ok){const error=new Error(value.error||'服务请求失败');error.status=response.status;throw error;}return value;
 }
 async function accept(result,activate=true){if(!validId(result.user?.id)||!result.refreshToken||!result.accessToken)throw new Error('登录响应无效');session={user:result.user};refreshToken=result.refreshToken;accessToken=result.accessToken;expiresAt=Date.now()+Number(result.expiresIn||900)*1000-30000;persistSession();if(activate)await activateAccount(session.user.id);conflicts=getStore().data._cloud?.conflicts||[];status='online';emit();return state();}
 async function refresh(){if(!refreshToken)throw new Error('请重新登录');const result=await api('/api/auth/token/refresh',{refreshToken});await accept(result,false);}
 async function initialize(){try{const stored=JSON.parse(safeStorage.decryptString(fs.readFileSync(sessionPath)));if(validId(stored.user?.id)&&stored.refreshToken){session={user:stored.user};refreshToken=stored.refreshToken;await activateAccount(stored.user.id);conflicts=getStore().data._cloud?.conflicts||[];try{await refresh();}catch(error){status='offline';if(error.status===401){accessToken=null;refreshToken=null;}}}}catch{}emit();return state();}
 function records(store){const map=new Map();for(const entity of collections)for(const row of store.data[entity]||[]){if(!row?.id)continue;let payload=structuredClone(row);if(entity==='papers'){delete payload.trackingSecret;delete payload.authorSecret;payload.cloudCredentialMissing=true;}map.set(entity+'/'+row.id,{entity,id:row.id,payload});}
  for(const note of store.data.notes||[])for(const a of note.attachments||[]){if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/.test(a.storedName))continue;const file=path.join(store.attachmentsDirectory,a.storedName);if(fs.existsSync(file))map.set('attachments/'+a.id,{entity:'attachments',id:a.id,payload:{storedName:a.storedName,mimeType:a.mimeType,data:fs.readFileSync(file).toString('base64')}});}
  return map;
 }
 function applyRecord(store,record){if(record.entity==='attachments'){if(record.deletedAt)return;const a=record.payload;if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/.test(a.storedName)||!['image/png','image/jpeg','image/webp','image/gif'].includes(a.mimeType)||typeof a.data!=='string'||a.data.length>18*1024*1024)throw new Error('云端附件无效');fs.mkdirSync(store.attachmentsDirectory,{recursive:true});fs.writeFileSync(path.join(store.attachmentsDirectory,a.storedName),Buffer.from(a.data,'base64'));return;}
  if(!collections.includes(record.entity))return;const list=store.data[record.entity]||[];const current=list.find(x=>x.id===record.id);if(record.deletedAt)store.data[record.entity]=list.filter(x=>x.id!==record.id);else {if(record.payload?.id!==record.id)throw new Error('云端记录 ID 不一致');const payload={...record.payload};if(record.entity==='papers'&&current?.trackingSecret){payload.trackingSecret=current.trackingSecret;delete payload.cloudCredentialMissing;}const next=current?list.map(x=>x.id===record.id?payload:x):[...list,payload];migrateData({...store.data,[record.entity]:next},DEFAULT_SETTINGS);store.data[record.entity]=next;}
 }
 async function sync(){if(running)return running;if(!session)throw new Error('请先登录');const store=getStore(),userId=session.user.id;
  running=(async()=>{status='syncing';emit();const meta=store.data._cloud||{userId,bases:{},pending:{},cursor:0,conflicts:[]};if(meta.userId!==userId)throw new Error('账号缓存不匹配');meta.bases||={};meta.pending||={};meta.conflicts||=[];store.data._cloud=meta;
   try{
    const local=records(store);const keys=new Set([...local.keys(),...Object.keys(meta.bases)]);
    for(const key of keys){if(meta.pending[key]||meta.conflicts.some(c=>c.key===key))continue;const row=local.get(key),base=meta.bases[key];if(digest(row?.payload)===(base?.hash||digest(null)))continue;const [entity,...rest]=key.split('/');meta.pending[key]={entity,id:rest.join('/'),payload:row?.payload||{},deleted:!row,baseRevision:base?.revision||0,mutationId:crypto.randomUUID()};}
    store.save();
    // Send one record at a time: a large image cannot starve small records or
    // make an entire 100-record request exceed the server body limit.
    for(const [key,change] of Object.entries(meta.pending)){
     const response=await api('/api/sync/push',{changes:[change]},true),result=response.results?.[0];if(!result)throw new Error('同步响应缺少记录');
     if(result.conflict){meta.conflicts.push({key,entity:change.entity,id:change.id,local:local.get(key)?.payload||null,remote:result.record});}else meta.bases[key]={revision:result.revision,hash:digest(change.deleted?null:change.payload)};
     delete meta.pending[key];store.save();
    }
    let more=true;while(more){const page=await api('/api/sync/pull?cursor='+meta.cursor,undefined,true);for(const record of page.changes||[]){const key=record.entity+'/'+record.id;if(meta.conflicts.some(c=>c.key===key))continue;const current=records(store).get(key)?.payload,base=meta.bases[key];if(record.revision===(base?.revision||0))continue;
      if(digest(current)!==(base?.hash||digest(null))){meta.conflicts.push({key,entity:record.entity,id:record.id,local:current||null,remote:record});continue;}
      applyRecord(store,record);meta.bases[key]={revision:record.revision,hash:digest(record.deletedAt?null:record.payload)};
     }meta.cursor=page.cursor;store.save();more=page.hasMore===true;}
    conflicts=meta.conflicts;status=conflicts.length?'sync-error':'online';if(meta.migrationStartedAt&&!conflicts.length&&!Object.keys(meta.pending).length)meta.migrationCompletedAt=new Date().toISOString();store.save();emit();return state();
   }catch(error){status=error.status===401?'sync-error':'offline';emit();throw error;}
  })().finally(()=>{running=null;});return running;
 }
 return {
  state,initialize,sync,
  configure:async url=>{if(session)throw new Error('请先退出当前账号再更换服务器');const parsed=new URL(String(url||''));if(parsed.username||parsed.password||parsed.search||parsed.hash||!(parsed.protocol==='https:'||(parsed.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))))throw new Error('服务器必须使用 HTTPS，本机测试可使用 HTTP');baseUrl=parsed.href.replace(/\/$/,'');fs.writeFileSync(configPath,JSON.stringify({baseUrl}));emit();return state();},
  login:async body=>{if(running)await running;return accept(await api('/api/auth/login/password',body));},
  register:async body=>accept(await api('/api/auth/register',body)),
  sendCode:body=>api('/api/auth/verification/send',body),
  reset:body=>api('/api/auth/password/reset/confirm',body),
  logout:async()=>{if(running)await running.catch(()=>{});try{if(refreshToken)await api('/api/auth/logout',{refreshToken});}catch{}session=null;refreshToken=null;accessToken=null;conflicts=[];if(fs.existsSync(sessionPath))fs.unlinkSync(sessionPath);await activateAccount(null);status='offline';emit();return state();},
  wechatStart:async()=>{wechatSession=await api('/api/auth/wechat/session',{});return {authorizationUrl:wechatSession.authorizationUrl,expiresIn:wechatSession.expiresIn};},
  wechatPoll:async()=>{if(!wechatSession)throw new Error('请重新获取微信二维码');const r=await api('/api/auth/wechat/status/'+encodeURIComponent(wechatSession.sessionId),{pollSecret:wechatSession.pollSecret});if(r.status==='authorized'){wechatSession=null;return accept(r);}return {status:r.status};},
  migrate:async confirmed=>{if(confirmed!==true)throw new Error('需要明确确认后才能同步本机数据');if(!session)throw new Error('请先登录');await backupLocal();await importLocal();const store=getStore();store.data._cloud={...(store.data._cloud||{userId:session.user.id,bases:{},pending:{},cursor:0,conflicts:[]}),migrationStartedAt:new Date().toISOString()};store.save();return sync();},
  resolve:async({entity,id,choice})=>{if(running)await running;const store=getStore(),meta=store.data._cloud,c=meta?.conflicts?.find(c=>c.entity===entity&&c.id===id);if(!c||!['local','remote'].includes(choice))throw new Error('冲突选择无效');if(choice==='remote'&&c.remote)applyRecord(store,c.remote);meta.bases[c.key]={revision:c.remote?.revision||0,hash:digest(c.remote?.deletedAt?null:c.remote?.payload)};meta.conflicts=meta.conflicts.filter(x=>x!==c);conflicts=meta.conflicts;store.save();return sync();}
 };
}
module.exports={createCloudClient};
