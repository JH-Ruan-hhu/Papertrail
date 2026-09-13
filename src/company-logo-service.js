'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const {rasterizeSvg}=require('./svg-logo');
const MAX_BYTES = 5 * 1024 * 1024;
const TTL = 30 * 86400000;
function publicAddress(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b] = ip.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && [0,168].includes(b)) || (a===198 && [18,19,51].includes(b)) || (a===203 && b===0));
  }
  // Only global unicast IPv6; reject mapped/transition/documentation ranges.
  return net.isIP(ip) === 6 && /^[23]/i.test(ip) && !/^(2001:|2002:)/i.test(ip);
}
function safeUrl(value) {
  const url = new URL(value);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw new Error('Logo 地址必须是公开 HTTP(S) 地址。');
  if (/^(localhost|.*\.localhost|.*\.local)$/i.test(url.hostname)) throw new Error('不允许本地地址。');
  return url;
}
async function fetchPublic(value, { lookup = dns.lookup, deadline = Date.now()+10000, redirects = 0 } = {}) {
  const url = safeUrl(value), host = url.hostname.replace(/^\[|\]$/g,'');
  const remaining = deadline-Date.now(); if(remaining<=0) throw new Error('Logo 请求超时。');
  let dnsTimer;
  const addresses = await Promise.race([
    net.isIP(host) ? Promise.resolve([{address:host,family:net.isIP(host)}]) : lookup(host,{all:true}),
    new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('DNS 超时。')),Math.min(5000,remaining));})
  ]).finally(()=>clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some(a=>!publicAddress(a.address))) throw new Error('不允许私网或保留地址。');
  const selected=addresses.find(a=>a.family===4)||addresses[0];
  const result=await new Promise((resolve,reject)=>{
    const request=(url.protocol==='https:'?https:http).get(url,{
      headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36','Accept':'text/html,image/png,image/jpeg,image/webp,image/x-icon'},
      // Pin the validated DNS answer; a second DNS lookup cannot rebind to a private host.
      lookup:(_host,options,callback)=>callback(null,...(options?.all?[[selected]]:[selected.address,selected.family]))
    },response=>{
      if ([301,302,303,307,308].includes(response.statusCode)) { response.resume();resolve({redirect:response.headers.location});return; }
      if(response.statusCode!==200){response.resume();reject(new Error('Logo 服务未返回有效内容。'));return;}
      if(Number(response.headers['content-length'])>MAX_BYTES){response.destroy();reject(new Error('Logo 超过 5 MB。'));return;}
      let size=0;const chunks=[];
      response.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){response.destroy(new Error('Logo 超过 5 MB。'));return;}chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>resolve({body:Buffer.concat(chunks),type:String(response.headers['content-type']||'').split(';')[0].toLowerCase()}));
    });
    const timer=setTimeout(()=>request.destroy(new Error('Logo 请求超时。')),Math.max(1,deadline-Date.now()));
    request.setTimeout(5000,()=>request.destroy(new Error('Logo 连接超时。')));
    request.on('error',reject);request.on('close',()=>clearTimeout(timer));
  });
  if(result.redirect){if(redirects>=3)throw new Error('Logo 重定向过多。');return fetchPublic(new URL(result.redirect,url).href,{lookup,deadline,redirects:redirects+1});}
  return {...result,url:url.href};
}
function imageSignature(buffer) {
  if(!Buffer.isBuffer(buffer)||buffer.length<8)return null;
  return buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : buffer[0]===255&&buffer[1]===216&&buffer[2]===255 ? 'jpeg'
    : buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP' ? 'webp'
    : buffer.readUInt32LE?.(0)===65536 ? 'ico' : null;
}
function candidates(html, base) {
  const result=[];
  const add=(value,source,rank)=>{try{const url=safeUrl(new URL(String(value).replace(/&amp;/g,'&'),base).href).href;result.push({url,source,rank});}catch{}};
  // Structured Organization logos belong to the employer, unlike job-board favicons.
  for(const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const visit=(obj,depth=0)=>{if(!obj||typeof obj!=='object'||depth>12)return;if(obj.hiringOrganization?.logo)add(typeof obj.hiringOrganization.logo==='string'?obj.hiringOrganization.logo:obj.hiringOrganization.logo.url,'job_source',0);for(const value of Object.values(obj))visit(value,depth+1);};visit(JSON.parse(script[1]));}catch{}
  }
  for(const tag of html.matchAll(/<(?:img|link|meta)\b[^>]*>/gi)) {
    const attrs={};for(const a of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=a[2]??a[3]??a[4];
    if(/logo|brand/i.test([attrs.class,attrs.id,attrs.alt,attrs.src,attrs['data-src']].join(' '))&&(attrs.src||attrs['data-src']))add(attrs.src||attrs['data-src'],'official_site',2);
    if(/icon/i.test(attrs.rel||'')&&attrs.href)add(attrs.href,'favicon',1);
    // Social previews often depict the homepage or a banner, not a company icon.
  }
  return result.sort((a,b)=>a.rank-b.rank).filter((x,i,all)=>all.findIndex(y=>x.url===y.url)===i).slice(0,12);
}
function employerWebsite(html, base) {
  for(const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visit=(obj,depth=0)=>{if(!obj||typeof obj!=='object'||depth>12)return null;const org=obj.hiringOrganization;for(const value of [org?.sameAs,org?.url])if(typeof value==='string'){try{return safeUrl(new URL(value,base).href).href;}catch{}}for(const value of Object.values(obj)){const found=visit(value,depth+1);if(found)return found;}return null;};
      const found=visit(JSON.parse(script[1]));if(found)return found;
    }catch{}
  }
  return null;
}
function decodeIcon(body,nativeImage){
 if(imageSignature(body)!=='ico')return nativeImage.createFromBuffer(body);
 const count=Math.min(body.readUInt16LE(4),64);const frames=[];
 for(let i=0;i<count;i++){const p=6+i*16;if(p+16>body.length)break;const size=body.readUInt32LE(p+8),offset=body.readUInt32LE(p+12);if(size>0&&offset>=6+count*16&&offset+size<=body.length)frames.push(body.subarray(offset,offset+size));}
 for(const frame of frames){if(imageSignature(frame)==='png'){const image=nativeImage.createFromBuffer(frame);if(!image.isEmpty())return image;}}
 for(const frame of frames){if(frame.length<40||frame.readUInt32LE(0)!==40||frame.readUInt16LE(14)!==32||frame.readUInt32LE(16)!==0)continue;const w=frame.readInt32LE(4),h=frame.readInt32LE(8)/2;if(w<=0||h<=0||w>512||h>512||!Number.isInteger(h)||40+w*h*4>frame.length)continue;const pixels=Buffer.alloc(w*h*4);let alpha=false;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=40+((h-1-y)*w+x)*4,q=(y*w+x)*4;frame.copy(pixels,q,p,p+4);alpha ||=pixels[q+3]>0;}if(!alpha){const stride=Math.ceil(w/32)*4,mask=40+w*h*4;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const m=mask+(h-1-y)*stride+(x>>3);pixels[(y*w+x)*4+3]=m<frame.length&&(frame[m]&(128>>(x%8)))?0:255;}}return nativeImage.createFromBitmap(pixels,{width:w,height:h});}
 return nativeImage.createFromBuffer(body);
}
class CompanyLogoService {
  constructor({store,directory,nativeImage,request=fetchPublic,svgToPng=rasterizeSvg,onChanged=()=>{}}) {Object.assign(this,{store,directory,nativeImage,request,svgToPng,onChanged});this.pending=new Map();this.queue=[];this.running=0;}
  company(id){if(!/^[A-Za-z0-9_-]{1,120}$/.test(String(id)))throw new Error('公司 ID 无效。');const c=(this.store.data.companies||[]).find(c=>c.id===id);if(!c)throw new Error('公司不存在。');return c;}
  update(id,patch){this.store.updateWorkspace(w=>{w.companies=w.companies.map(c=>c.id===id?{...c,...patch,updatedAt:new Date().toISOString()}:c);return w;});this.onChanged(id);}
  snapshot(id){const c=this.company(id);let logoData=null;if(c.logoPath&&/^[\w-]+\.png$/.test(c.logoPath)){try{logoData='data:image/png;base64,'+fs.readFileSync(path.join(this.directory,c.logoPath)).toString('base64');}catch{}}return {...c,logoData};}
  normalize(body,type){if(!Buffer.isBuffer(body)||body.length<8||body.length>MAX_BYTES)throw new Error('图片大小无效。');const signature=imageSignature(body);const allowed={png:['image/png','image/x-icon','image/vnd.microsoft.icon'],jpeg:['image/jpeg'],webp:['image/webp'],ico:['image/x-icon','image/vnd.microsoft.icon']};if(!signature||!(allowed[signature].includes(type)||['application/octet-stream','binary/octet-stream',''].includes(type)))throw new Error('图片格式或文件头无效。');const image=decodeIcon(body,this.nativeImage);if(image.isEmpty())throw new Error('图片解码失败。');const {width,height}=image.getSize();if(!width||!height||width*height>40000000)throw new Error('图片尺寸无效。');return (Math.max(width,height)>512?image.resize(width>=height?{width:512}:{height:512}):image).toPNG();}
  write(id,body,type,source,remoteUrl=null){const png=this.normalize(body,type);fs.mkdirSync(this.directory,{recursive:true});const name=id+'-'+crypto.createHash('sha256').update(png).digest('hex').slice(0,16)+'.png';fs.writeFileSync(path.join(this.directory,name),png);const now=new Date().toISOString();this.update(id,{logoPath:name,logoSource:source,logoRemoteUrl:remoteUrl,logoStatus:'ready',logoError:null,logoUpdatedAt:now,logoLastCheckedAt:now});return this.snapshot(id);}
  async manual(id,file){this.company(id);if(fs.statSync(file).size>MAX_BYTES)throw new Error('图片超过 5 MB。');const body=fs.readFileSync(file);if(body.length<8)throw new Error('图片无效。');const type={png:'image/png',jpeg:'image/jpeg',webp:'image/webp',ico:'image/x-icon'}[imageSignature(body)];return this.write(id,body,type,'manual');}
  ensure(id,force=false){const c=this.company(id);const cached=this.snapshot(id);if(c.logoSource==='manual'||(!force&&Date.now()-Date.parse(c.logoLastCheckedAt||0)<(cached.logoData?TTL:86400000)))return Promise.resolve(cached);if(this.pending.has(id))return this.pending.get(id);const work=new Promise(resolve=>this.queue.push({id,resolve}));this.pending.set(id,work);this.drain();return work;}
  drain(){while(this.running<3&&this.queue.length){const {id,resolve}=this.queue.shift();this.running++;this.resolve(id).catch(()=>null).then(result=>{this.running--;this.pending.delete(id);resolve(result);this.drain();});}}
  async resolve(id){const original=this.company(id);this.update(id,{logoStatus:'pending'});try{
    const jobs=this.store.listJobApplications().filter(j=>j.companyId===id);const sites=[...new Set(jobs.map(j=>j.sourceUrl).filter(Boolean))].slice(0,3);
    const options=[],sourceIcons=[];let website=original.website,lastError='';
    for(const site of sites){try{const page=await this.request(site);if(page.type==='text/html'){const html=page.body.toString('utf8');options.push(...candidates(html,page.url||site).filter(c=>c.source==='job_source'));sourceIcons.push(...candidates(html,page.url||site).filter(c=>c.source==='favicon'),{url:new URL('/favicon.ico',page.url||site).href,source:'favicon'});website ||= employerWebsite(html,page.url||site);if(!website){const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';const name=String(original.name||'').replace(/股份有限公司|有限公司|科技有限公司/g,'').trim();const host=new URL(page.url||site).hostname;if(name.length>=2&&title.includes(name)&&!/(zhipin|liepin|51job|zhaopin|yingjiesheng|nowcoder|mokahr|feishu|metahr|myworkdayjobs)\./i.test(host)){website=new URL(page.url||site).origin;options.push(...candidates(html,page.url||site));}}}}catch{}}
    if(website){if(!original.website)this.update(id,{website,domain:new URL(website).hostname});try{const page=await this.request(website);if(page.type==='text/html')options.push(...candidates(page.body.toString('utf8'),page.url||website));else if(imageSignature(page.body)||page.type==='image/svg+xml')options.push({url:page.url||website,source:'official_site'});}catch(error){lastError=error.message;}options.push({url:new URL('/favicon.ico',website).href,source:'favicon'});}
    options.push(...sourceIcons);
    for(const option of options){try{const image=await this.request(option.url);if(this.company(id).logoSource==='manual')return this.snapshot(id);if(image.type==='image/svg+xml'){const png=await this.svgToPng(image.body);if(this.company(id).logoSource==='manual')return this.snapshot(id);return this.write(id,png,'image/png',option.source,image.url||option.url);}return this.write(id,image.body,image.type,option.source,image.url||option.url);}catch(error){lastError=error.message;}}
    throw new Error(website?(lastError||'网站未提供可解码的图标，请粘贴 PNG/JPG 图标链接或选择图片。'):'未能识别公司官网，请填写官网域名或图标链接。');
  }catch(error){if(this.company(id).logoSource!=='manual')this.update(id,{logoStatus:original.logoPath?'ready':'failed',logoError:error.message,logoLastCheckedAt:new Date().toISOString()});return this.snapshot(id);}}
}
module.exports={decodeIcon,CompanyLogoService,fetchPublic,publicAddress,safeUrl,candidates,employerWebsite,imageSignature};
