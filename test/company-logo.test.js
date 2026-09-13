'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {migrateCompanies}=require('../src/company-core');
const {CompanyLogoService,fetchPublic,publicAddress,safeUrl,candidates}=require('../src/company-logo-service');
const {JsonStore}=require('../src/store');
const J=require('../src/job-core'),D=require('../src/renderer/career-data');
test('company migration shares normalized names, retains every legacy field and is idempotent',()=>{
 const source={version:11,jobApplications:[{id:'one',company:'  Acme   Labs ',legacyField:{x:1}},{id:'two',company:'acme labs'}]};
 const result=migrateCompanies(source,'2026-09-08T00:00:00Z');assert.equal(result.data.companies.length,1);assert.equal(result.data.jobApplications[0].companyId,result.data.jobApplications[1].companyId);
 assert.deepEqual(result.data.jobApplications[0].legacyField,{x:1});assert.equal(source.jobApplications[0].companyId,undefined);assert.equal(migrateCompanies(result.data).changed,false);
 const renamed=migrateCompanies({...result.data,jobApplications:result.data.jobApplications.map(j=>j.id==='one'?{...j,company:'Other'}:j)});assert.notEqual(renamed.data.jobApplications[0].companyId,renamed.data.jobApplications[1].companyId);
});
test('all stages support rejection, withdrawal and restore without losing workflow or history on disk',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-outcomes-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new JsonStore(path.join(dir,'data.json'));store.load();
 for(const stage of J.DEFAULT_WORKFLOW_STAGES){let job=J.normalizeJobApplication({id:stage.id,company:'Company',role:'Role',status:'active',workflow:{stages:[...J.DEFAULT_WORKFLOW_STAGES],currentStageId:stage.id,timeline:[{stageId:stage.id,date:'2026-09-01'}]}});const workflow=structuredClone(job.workflow);job=D.transition(job,'rejected');job=D.transition(job,'reopened');job=D.transition(job,'withdrawn');store.setJobApplications(J.saveJobApplication(store.listJobApplications(),{...job,id:undefined},undefined,()=>stage.id));assert.deepEqual(job.workflow,workflow);}
 const reopened=new JsonStore(store.filePath);reopened.load();for(const job of reopened.listJobApplications()){assert.equal(job.status,'closed');assert.equal(job.closureReason,'withdrawn');assert.deepEqual(job.stageHistory.map(h=>h.action),['rejected','reopened','withdrawn']);}
});
test('logo URL and DNS validation reject private, mapped, alternate and rebinding targets',async()=>{
 for(const address of ['127.0.0.1','0.0.0.0','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','fe80::1','100.64.0.1'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('8.8.8.8'),true);assert.throws(()=>safeUrl('file:///etc/passwd'));assert.throws(()=>safeUrl('http://user:password@example.com'));assert.throws(()=>safeUrl('http://localhost'));
 await assert.rejects(fetchPublic('https://example.test',{lookup:async()=>[{address:'127.0.0.1',family:4}]}),/私网/);
 await assert.rejects(fetchPublic('http://2130706433'),/私网/);
});
test('candidate parsing orders employer, official logo and favicon and excludes unsafe links',()=>{
 const items=candidates('<script type="application/ld+json">{"hiringOrganization":{"logo":"https://employer.example/logo.png"}}</script><img class="site-logo" src="/brand.png"><link rel="icon" href="/favicon.ico"><img alt="logo" src="file:///tmp/x">','https://example.com/jobs');
 assert.deepEqual(items.map(x=>x.source),['job_source','favicon','official_site']);assert.equal(items[2].url,'https://example.com/brand.png');
});
test('download failures keep old cache; manual images win; format, size and decoding are checked',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-logos-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new JsonStore(path.join(dir,'data.json'));store.load();store.setJobApplications([{id:'job',company:'Acme',sourceUrl:'https://jobs.example.com/1'}]);const id=store.data.companies[0].id;
 const png=Buffer.from('89504e470d0a1a0a00000000','hex');let requests=0;
 const nativeImage={createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:1024,height:512}),resize:options=>{assert.deepEqual(options,{width:512});return {toPNG:()=>png};},toPNG:()=>png})};
 const service=new CompanyLogoService({store,directory:path.join(dir,'logos'),nativeImage,request:async()=>{requests++;throw Error('offline');}});
 assert.deepEqual(service.normalize(png,'image/x-icon'),png);assert.deepEqual(service.normalize(png,'image/vnd.microsoft.icon'),png);
 service.write(id,png,'image/png','official_site');const old=service.snapshot(id).logoData;await service.ensure(id,true);assert.equal(service.snapshot(id).logoData,old);assert.equal(service.snapshot(id).logoStatus,'ready');
 assert.throws(()=>service.normalize(png,'text/html'),/格式/);assert.throws(()=>service.normalize(Buffer.alloc(5*1024*1024+1),'image/png'),/大小/);assert.throws(()=>service.normalize(Buffer.from('<script>'),'image/png'),/格式/);
 service.nativeImage={createFromBuffer:()=>({isEmpty:()=>true})};assert.throws(()=>service.normalize(png,'image/png'),/解码/);service.nativeImage=nativeImage;
 service.write(id,png,'image/png','manual');const count=requests;await service.ensure(id,true);assert.equal(requests,count);assert.equal(service.snapshot(id).logoSource,'manual');
});

test('website icon wins over page previews and HTML is never cached as an image',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-icon-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new JsonStore(path.join(dir,'data.json'));store.load();store.setJobApplications([{id:'icon-job',company:'Icon Test'}]);const id=store.data.companies[0].id;
 const png=Buffer.from('89504e470d0a1a0a00000000','hex'),requests=[];
 const service=new CompanyLogoService({store,directory:path.join(dir,'logos'),nativeImage:{createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:32,height:32}),toPNG:()=>png})},request:async url=>{requests.push(url);return url.endsWith('/site-icon.png')?{body:png,type:'image/x-icon',url}:{body:Buffer.from('<meta property="og:image" content="/homepage-preview.png"><img class="logo" src="/brand.png"><link rel=icon href=/site-icon.png>'),type:'text/html',url};}});
 service.update(id,{website:'https://company.example/'});await service.ensure(id,true);assert.equal(service.pending.has(id),false,'finished request clears before the caller resumes');const saved=service.snapshot(id);assert.equal(saved.logoRemoteUrl,'https://company.example/site-icon.png');assert.equal(saved.logoSource,'favicon');assert.ok(saved.logoData.startsWith('data:image/png;base64,'));assert.deepEqual(requests,['https://company.example/','https://company.example/site-icon.png']);
 assert.equal(candidates('<meta property="og:image" content="/homepage.png">','https://company.example').length,0);
});

test('ICO PNG frame is decoded and malformed directories are bounded',()=>{const {decodeIcon}=require('../src/company-logo-service');const png=Buffer.from('89504e470d0a1a0a00000000','hex'),ico=Buffer.alloc(22+png.length);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);png.copy(ico,22);const image={isEmpty:()=>false};let seen;const native={createFromBuffer:b=>{seen=b;return image;}};assert.equal(decodeIcon(ico,native),image);assert.deepEqual(seen,png);});

test('logo filename identifies the ATL image without selecting unrelated images',()=>{
 const items=candidates('<a class="logo"><img src="/static/images/icon/logo.png" alt="ATL"></a><img src="/banner.png">','https://www.atlbattery.com/zh/about.html');
 assert.deepEqual(items.map(x=>x.url),['https://www.atlbattery.com/static/images/icon/logo.png']);
});
test('SVG favicon is rasterized before caching as PNG',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-svg-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new JsonStore(path.join(dir,'data.json'));store.load();store.setJobApplications([{id:'svg-job',company:'SVG Test'}]);const id=store.data.companies[0].id;
 const png=Buffer.from('89504e470d0a1a0a00000000','hex'),svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>');let rasterized=false;
 const service=new CompanyLogoService({store,directory:dir,nativeImage:{createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:32,height:32}),toPNG:()=>png})},svgToPng:async body=>{assert.deepEqual(body,svg);rasterized=true;return png;},request:async url=>url.endsWith('.svg')?{body:svg,type:'image/svg+xml',url}:{body:Buffer.from('<link rel="icon" href="/logo.svg">'),type:'text/html',url}});
 service.update(id,{website:'https://company.example/'});const result=await service.ensure(id,true);assert.equal(rasterized,true);assert.equal(result.logoStatus,'ready');assert.equal(result.logoRemoteUrl,'https://company.example/logo.svg');assert.ok(result.logoData.startsWith('data:image/png;base64,'));
});

test('logo parent container identifies an opaque image filename',()=>{
 const items=candidates('<div class="header-logo"><a href="/"><img src="/uploads/hash.png" alt=""></a></div>','https://company.example/');assert.equal(items[0].url,'https://company.example/uploads/hash.png');
});
test('explicit website skips job sources and recovers logo from a module asset',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-module-logo-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new JsonStore(path.join(dir,'data.json'));store.load();store.setJobApplications([{id:'j',company:'Test',sourceUrl:'https://jobs.example/slow'}]);const id=store.data.companies[0].id,png=Buffer.from('89504e470d0a1a0a00000000','hex'),seen=[];
 const service=new CompanyLogoService({store,directory:dir,nativeImage:{createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:32,height:32}),toPNG:()=>png})},request:async url=>{seen.push(url);if(url.endsWith('/'))return {body:Buffer.from('<script type="module" src="/assets/index.js"></script>'),type:'text/html',url};if(url.endsWith('.js'))return {body:Buffer.from('const logo="/assets/nav_logo.png";'),type:'application/javascript',url};if(url.endsWith('.png'))return {body:png,type:'image/png',url};throw Error('404');}});
 service.update(id,{website:'https://company.example/'});const saved=await service.ensure(id,true);assert.equal(saved.logoStatus,'ready');assert.equal(saved.logoRemoteUrl,'https://company.example/assets/nav_logo.png');assert.ok(!seen.some(url=>url.includes('jobs.example')));
});
test('unresponsive logo request resolves with an error and releases queue',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yanji-logo-timeout-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new JsonStore(path.join(dir,'data.json'));store.load();store.setJobApplications([{id:'j',company:'Test'}]);const id=store.data.companies[0].id;
 const service=new CompanyLogoService({store,directory:dir,resolutionTimeoutMs:30,nativeImage:{},request:()=>new Promise(()=>{})});service.update(id,{website:'https://company.example/'});const saved=await service.ensure(id,true);assert.equal(saved.logoStatus,'failed');assert.match(saved.logoError,/超时/);assert.equal(service.pending.size,0);assert.equal(service.running,0);
});
test('manual logo retry moves ahead of the background queue',async()=>{
 const companies=Array.from({length:5},(_,i)=>({id:'c'+i}));const service=new CompanyLogoService({store:{data:{companies}},directory:'unused',nativeImage:{}});const releases=new Map(),started=[];service.resolve=id=>{started.push(id);return new Promise(resolve=>releases.set(id,resolve));};
 const tasks=companies.map(c=>service.ensure(c.id));const retry=service.ensure('c4',true);releases.get('c0')({});await tasks[0];assert.equal(started[3],'c4');releases.get('c1')({});await tasks[1];for(const id of ['c2','c3','c4'])releases.get(id)({});await Promise.all([...tasks,retry]);assert.equal(service.pending.size,0);
});

test('JPEG and WebP favicons with ICO content type use actual file signatures',()=>{
 const buffers=[Buffer.from('ffd8ffe10000000000000000','hex'),Buffer.from('524946460000000057454250','hex')];
 const service=new CompanyLogoService({store:{},directory:'unused',nativeImage:{createFromBuffer:body=>({isEmpty:()=>false,getSize:()=>({width:32,height:32}),toPNG:()=>body})}});
 for(const body of buffers){for(const type of ['image/x-icon','image/vnd.microsoft.icon'])assert.deepEqual(service.normalize(body,type),body);assert.throws(()=>service.normalize(body,'text/html'),/格式/);}
 assert.throws(()=>service.normalize(Buffer.from('<html>error</html>'),'image/x-icon'),/格式/);
});
