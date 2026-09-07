'use strict';
const Fastify=require('fastify');const crypto=require('node:crypto');const argon2=require('argon2');const validator=require('validator');const {parsePhoneNumberFromString}=require('libphonenumber-js/max');
const V=require('../../src/renderer/auth-validation');
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
class Problem extends Error{constructor(status,message){super(message);this.statusCode=status;}}
const fail=(status,message)=>{throw new Problem(status,message);};
function account(value){let id;try{id=V.identity(value);}catch(e){fail(400,e.message);}if(id.includes('@')){if(!validator.isEmail(id))fail(400,'请输入有效的邮箱地址');}else if(!parsePhoneNumberFromString(id)?.isValid())fail(400,'请输入有效的手机号');return id;}
function buildApp({repository,secret,deliverCode,clock=()=>Date.now(),wechat=null}){
 if(!repository || typeof secret!=='string' || secret.length<32)throw new Error('服务端需要数据库和至少 32 字符的会话密钥');
 const app=Fastify({logger:false,bodyLimit:20*1024*1024,trustProxy:false});
 const hmac=value=>crypto.createHmac('sha256',secret).update(value).digest('hex');
 const safeUser=u=>({id:u.id,displayName:u.displayName,identity:u.identity,wechatLinked:Boolean(u.wechatSubject)});
 const jwt=payload=>{const data=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url');return data+'.'+crypto.createHmac('sha256',secret).update(data).digest('base64url');};
 const parseJwt=token=>{try{const [a,b,s,...rest]=String(token||'').split('.');if(rest.length||!a||!b||!s)return null;const expected=crypto.createHmac('sha256',secret).update(a+'.'+b).digest();const actual=Buffer.from(s,'base64url');if(expected.length!==actual.length||!crypto.timingSafeEqual(actual,expected))return null;const p=JSON.parse(Buffer.from(b,'base64url'));return p.exp*1000>clock()&&p.aud==='yanji-beta'?p:null;}catch{return null;}};
 // Expected errors commit failed-attempt counters/revocations. Unexpected
 // exceptions roll back the transaction, including partial registrations.
 const atomic=async fn=>{const result=await repository.transaction(async tx=>{try{return {value:await fn(tx)};}catch(e){if(e instanceof Problem)return {error:{status:e.statusCode,message:e.message}};throw e;}});if(result.error)fail(result.error.status,result.error.message);return result.value;};
 async function rate(tx,key,limit,windowMs){const now=clock();let r=await tx.get('rate',key);if(!r||r.expiresAt<=now)r={count:0,expiresAt:now+windowMs};r.count++;await tx.put('rate',key,r);if(r.count>limit)fail(429,'操作过于频繁，请稍后再试');}
 async function audit(tx,type,userId=null){await tx.put('audit',crypto.randomUUID(),{type,userId,at:clock()});}
 async function issue(tx,user,deviceId,family=crypto.randomUUID()){
  const refreshToken=random(),id=hash(refreshToken),expiresAt=clock()+30*86400000;
  await tx.put('session',id,{id,userId:user.id,family,deviceId:String(deviceId||'desktop').slice(0,100),expiresAt,used:false,revoked:false});
  await tx.put('family',family,{userId:user.id,revoked:false,expiresAt});
  return {accessToken:jwt({sub:user.id,sid:family,aud:'yanji-beta',exp:Math.floor(clock()/1000)+900}),refreshToken,expiresIn:900,user:safeUser(user)};
 }
 async function authenticated(tx,request){const token=parseJwt(request.headers.authorization?.replace(/^Bearer /,''));if(!token)fail(401,'请重新登录');const family=await tx.get('family',token.sid);if(!family||family.revoked||family.userId!==token.sub||family.expiresAt<=clock())fail(401,'请重新登录');const u=await tx.get('user',token.sub);if(!u)fail(401,'请重新登录');return u;}
 async function challenge(tx,target,purpose,code){try{V.code(code);}catch(e){fail(400,e.message);}const id=hmac(target+'|'+purpose),c=await tx.get('code',id);if(!c||c.used||c.expiresAt<=clock()||c.attempts>=5)fail(400,'验证码已过期或失效，请重新获取');c.attempts++;if(c.hash!==hmac(id+'|'+code)){await tx.put('code',id,c);await audit(tx,'verification_failed');fail(400,'验证码不正确');}c.used=true;await tx.put('code',id,c);}
 async function send(request){const body=request.body||{},target=account(body.identity),purpose=body.purpose;if(!['register','reset'].includes(purpose))fail(400,'验证码用途无效');if(!deliverCode)fail(503,'验证码发送服务尚未配置');
  const code=String(crypto.randomInt(1000000)).padStart(6,'0'),id=hmac(target+'|'+purpose);
  await atomic(async tx=>{await rate(tx,'send-ip:'+hash(request.ip),10,3600000);await rate(tx,'send-target:'+hmac(target),5,3600000);const old=await tx.get('code',id);if(old&&clock()-old.createdAt<60000)fail(429,'请在 60 秒后重新获取');await tx.put('code',id,{id,hash:hmac(id+'|'+code),attempts:0,used:false,createdAt:clock(),expiresAt:clock()+300000});});
  try{await deliverCode({target,purpose,code});}catch{await atomic(async tx=>{const c=await tx.get('code',id);c.used=true;await tx.put('code',id,c);});fail(503,'验证码发送失败，请稍后再试');}return {ok:true};
 }
 app.setErrorHandler((error,request,reply)=>{const status=error.statusCode>=400&&error.statusCode<500?error.statusCode:error.statusCode===503?503:500;reply.code(status).send({error:status===500?'服务器暂时不可用':error.message});});
 app.addHook('onRequest',async(request,reply)=>{reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');});
 app.get('/health',async()=>({ok:true,channel:'beta'}));
 app.post('/api/auth/verification/send',send);
 app.post('/api/auth/password/reset/request',request=>{request.body={...request.body,purpose:'reset'};return send(request);});
 app.post('/api/auth/register',async request=>{const b=request.body||{},identity=account(b.identity);try{V.password(b.password,identity);}catch(e){fail(400,e.message);}if(b.agreed!==true)fail(400,'请先同意用户协议和隐私政策');
  
  return atomic(async tx=>{await rate(tx,'register-ip:'+hash(request.ip),10,3600000);await challenge(tx,identity,'register',b.code);const passwordHash=await argon2.hash(b.password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});if(await tx.get('identity',hmac(identity)))fail(400,'该账号无法注册，请尝试登录或找回密码');const u={id:crypto.randomUUID(),identity,displayName:String(b.displayName||'研迹用户').trim().slice(0,60),passwordHash,createdAt:clock()};await tx.put('user',u.id,u);await tx.put('identity',hmac(identity),{userId:u.id});await audit(tx,'registered',u.id);return issue(tx,u,b.deviceId);});
 });
 app.post('/api/auth/login/password',async request=>{const b=request.body||{},identity=account(b.identity);if(typeof b.password!=='string'||b.password.length>256)fail(400,'账号或密码不正确');return atomic(async tx=>{
  await rate(tx,'login-ip:'+hash(request.ip),30,900000);await rate(tx,'login-target:'+hmac(identity),10,900000);
  const index=await tx.get('identity',hmac(identity)),u=index&&await tx.get('user',index.userId);
  const valid=u?.passwordHash?await argon2.verify(u.passwordHash,b.password):await argon2.verify(dummyHash,b.password).then(()=>false);
  if(!valid){await audit(tx,'login_failed');fail(401,'账号或密码不正确');}await audit(tx,'login_success',u.id);return issue(tx,u,b.deviceId);
 });});
 app.post('/api/auth/token/refresh',request=>atomic(async tx=>{
  const b=request.body||{};await rate(tx,'refresh-ip:'+hash(request.ip),60,60000);const s=await tx.get('session',hash(b.refreshToken||''));if(!s||s.expiresAt<=clock())fail(401,'请重新登录');
  const f=await tx.get('family',s.family);if(s.used){if(f){f.revoked=true;await tx.put('family',s.family,f);}await audit(tx,'refresh_reuse',s.userId);fail(401,'会话已失效，请重新登录');}if(s.revoked||!f||f.revoked)fail(401,'请重新登录');
  s.used=true;await tx.put('session',s.id,s);const u=await tx.get('user',s.userId);return issue(tx,u,s.deviceId,s.family);
 }));
 app.post('/api/auth/logout',request=>atomic(async tx=>{const s=await tx.get('session',hash(request.body?.refreshToken||''));if(s){const f=await tx.get('family',s.family);if(f){f.revoked=true;await tx.put('family',s.family,f);}await audit(tx,'session_revoked',s.userId);}return {ok:true};}));
 app.get('/api/auth/me',request=>atomic(async tx=>safeUser(await authenticated(tx,request))));
 app.post('/api/auth/password/reset/confirm',async request=>{const b=request.body||{},identity=account(b.identity);try{V.password(b.password,identity);}catch(e){fail(400,e.message);}return atomic(async tx=>{await rate(tx,'reset-ip:'+hash(request.ip),10,3600000);await challenge(tx,identity,'reset',b.code);const passwordHash=await argon2.hash(b.password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});const i=await tx.get('identity',hmac(identity));if(i){const u=await tx.get('user',i.userId);u.passwordHash=passwordHash;await tx.put('user',u.id,u);
    for(const s of await tx.list('session'))if(s.userId===u.id){const f=await tx.get('family',s.family);if(f){f.revoked=true;await tx.put('family',s.family,f);}}
    await audit(tx,'password_reset',u.id);}return {ok:true};});});
 const allowedEntities=new Set(['schedules','todos','countdowns','notes','metadataFields','attendance','focusSessions','jobApplications','papers','preferences','attachments']);
 app.post('/api/sync/push',request=>atomic(async tx=>{
  const user=await authenticated(tx,request),changes=request.body?.changes;if(!Array.isArray(changes)||changes.length>100)fail(400,'一次最多同步 100 条记录');const results=[];
  for(const c of changes){if(!c||!allowedEntities.has(c.entity)||typeof c.id!=='string'||!c.id||c.id.length>160||!Number.isSafeInteger(c.baseRevision)||c.baseRevision<0||typeof c.mutationId!=='string'||c.mutationId.length>160||!c.mutationId)fail(400,'同步记录无效');if(!c.deleted&&(!c.payload||typeof c.payload!=='object'||Array.isArray(c.payload)))fail(400,'同步内容无效');if(JSON.stringify(c.payload||{}).length>18*1024*1024)fail(400,'记录过大');}
  let cursor=(await tx.get('cursor',user.id))?.value||0;
  for(const c of changes){const dedupeKey=user.id+':'+c.mutationId,receipt=await tx.get('mutation',dedupeKey);if(receipt){if(receipt.fingerprint!==hash(JSON.stringify(c)))fail(409,'重复请求内容不同');results.push(receipt.result);continue;}
   const current=await tx.workspace(user.id,c.entity,c.id);if((current?.revision||0)!==c.baseRevision){results.push({id:c.id,entity:c.entity,conflict:true,record:current?{...current,userId:undefined}:null});continue;}
   const revision=(current?.revision||0)+1;const record={userId:user.id,entity:c.entity,id:c.id,revision,cursor:++cursor,deletedAt:c.deleted?new Date(clock()):null,payload:c.deleted?{}:c.payload};await tx.saveWorkspace(record);
   const result={id:c.id,entity:c.entity,revision,mutationId:c.mutationId};await tx.put('mutation',dedupeKey,{fingerprint:hash(JSON.stringify(c)),result});results.push(result);
  }
  await tx.put('cursor',user.id,{value:cursor});return {results};
 }));
 app.get('/api/sync/pull',request=>atomic(async tx=>{const u=await authenticated(tx,request),cursor=Number(request.query.cursor||0);if(!Number.isSafeInteger(cursor)||cursor<0)fail(400,'同步游标无效');const rows=await tx.pull(u.id,cursor,101);const page=rows.slice(0,100);return {cursor:page.at(-1)?.cursor||cursor,hasMore:rows.length>100,changes:page.map(({userId,...r})=>r)};}));
 app.post('/api/auth/wechat/session',request=>atomic(async tx=>{if(!wechat)fail(503,'微信登录尚未配置');await rate(tx,'wechat:'+hash(request.ip),10,60000);const id=random(),state=random(),pollSecret=random();await tx.put('wechat',hash(state),{id,stateHash:hash(state),pollHash:hash(pollSecret),expiresAt:clock()+180000,used:false,userId:null});await tx.put('wechatIndex',id,{stateHash:hash(state)});return {sessionId:id,pollSecret,authorizationUrl:wechat.authorizationUrl(state),expiresIn:180};}));
 app.get('/api/auth/wechat/callback',async request=>{if(!wechat)fail(503,'微信登录尚未配置');const {state,code}=request.query||{};if(typeof state!=='string'||typeof code!=='string')fail(400,'微信回调无效');
  await atomic(async tx=>{const s=await tx.get('wechat',hash(state));if(!s||s.used||s.exchanging||s.expiresAt<=clock())fail(400,'微信登录已过期');s.exchanging=true;await tx.put('wechat',hash(state),s);});
  const profile=await wechat.exchange(code);return atomic(async tx=>{const s=await tx.get('wechat',hash(state));if(!s||s.used||s.expiresAt<=clock())fail(400,'微信登录已过期');const subject=String(profile.subject||'');if(!subject)fail(400,'微信身份无效');let index=await tx.get('oauth',subject),u=index&&await tx.get('user',index.userId);if(!u){u={id:crypto.randomUUID(),identity:null,displayName:'微信用户',wechatSubject:subject,createdAt:clock()};await tx.put('user',u.id,u);await tx.put('oauth',subject,{userId:u.id});}s.userId=u.id;await tx.put('wechat',hash(state),s);return {ok:true,message:'微信已授权，请返回研迹测试版'};});
 });
 app.post('/api/auth/wechat/status/:sessionId',request=>atomic(async tx=>{const i=await tx.get('wechatIndex',request.params.sessionId),s=i&&await tx.get('wechat',i.stateHash);if(!s||s.used||s.expiresAt<=clock()||s.pollHash!==hash(request.body?.pollSecret||''))fail(400,'二维码已过期');if(!s.userId)return {status:'pending'};s.used=true;await tx.put('wechat',i.stateHash,s);return {status:'authorized',...await issue(tx,await tx.get('user',s.userId),request.body?.deviceId)};}));
 let dummyHash;app.addHook('onReady',async()=>{dummyHash=await argon2.hash(random(),{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});});
 return app;
}
module.exports={buildApp};
