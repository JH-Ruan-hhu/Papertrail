'use strict';
const {PrismaClient}=require('@prisma/client');const {prismaRepository}=require('./repository');const {buildApp}=require('./app');
const prisma=new PrismaClient();
const deliveryUrl=process.env.CODE_DELIVERY_URL;
if(deliveryUrl && new URL(deliveryUrl).protocol!=='https:')throw new Error('CODE_DELIVERY_URL 必须使用 HTTPS');
const deliverCode=deliveryUrl?async data=>{const response=await fetch(deliveryUrl,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.CODE_DELIVERY_TOKEN||''}`},body:JSON.stringify(data),signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw new Error('发送失败');}:null;
const id=process.env.WECHAT_APP_ID,secret=process.env.WECHAT_APP_SECRET,redirect=process.env.WECHAT_REDIRECT_URI;
const wechat=id&&secret&&redirect?{
 authorizationUrl:state=>`https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(id)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`,
 exchange:async code=>{const query=new URLSearchParams({appid:id,secret,code,grant_type:'authorization_code'});const response=await fetch('https://api.weixin.qq.com/sns/oauth2/access_token?'+query,{signal:AbortSignal.timeout(10000),redirect:'error'});const data=await response.json();if(!response.ok||data.errcode||!data.openid)throw new Error('微信授权失败');return {subject:data.unionid||`${id}:${data.openid}`};}
}:null;
const app=buildApp({repository:prismaRepository(prisma),secret:process.env.SESSION_SECRET,deliverCode,wechat});
app.addHook('onClose',()=>prisma.$disconnect());
app.listen({host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT)||3100}).then(()=>console.log('研迹测试版服务已启动')).catch(error=>{console.error(error.message);process.exitCode=1;});
