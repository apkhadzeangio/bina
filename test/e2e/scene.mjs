// Stage 05 real Chromium acceptance: desktop, phone, shared renderer, ZIPs and WebGL loss.
// npm run build && npm run test:e2e:scene [output folder]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { unzipSync, strFromU8 } from 'fflate';
import { bedroomProject, kitchenProject } from '../fixtures/scene.js';
import { computeEstimate } from '../../src/core/quantities.js';
const ROOT=resolve(new URL('../..',import.meta.url).pathname);
const OUT=resolve(process.argv[2]||join(ROOT,'out/stage05'));
mkdirSync(OUT,{recursive:true});
const PAGE=readFileSync(join(ROOT,'dist/site/index.html'),'utf8');
const validate=new Ajv({allErrors:true,strict:false}).compile(JSON.parse(readFileSync(join(ROOT,'schemas/bina.ai-scene.v1.schema.json'))));
const errors=[], unexpected=[];
const browser=await chromium.launch({executablePath:process.env.BINA_CHROMIUM || undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const report={};
function fontCss(){
 const geo='U+0589,U+10A0-10FF,U+1C90-1CBA,U+1CBD-1CBF,U+2D00-2D2F';
 const lat='U+0000-00FF,U+2000-206F,U+20AC,U+20BE,U+2212';
 const face=(fam,w,file,range)=>`@font-face{font-family:'${fam}';font-weight:${w};src:url(https://fonts.gstatic.com/local/${file}) format('woff2');unicode-range:${range};}`;
 return [400,500,600,700].flatMap(w=>[face('Noto Sans Georgian',w,`@fontsource/noto-sans-georgian/files/noto-sans-georgian-georgian-${w}-normal.woff2`,geo),face('Noto Sans Georgian',w,`@fontsource/noto-sans-georgian/files/noto-sans-georgian-latin-${w}-normal.woff2`,lat),face('Noto Serif Georgian',w,`@fontsource/noto-serif-georgian/files/noto-serif-georgian-georgian-${w}-normal.woff2`,geo)]).join('\n')+[400,500].map(w=>face('IBM Plex Mono',w,`@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${w}-normal.woff2`,lat)).join('\n');
}
async function page(project,{mobile=false,noWebGL=false}={}) {
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
 await ctx.route('**/*',async route=>{
  const u=route.request().url();
  if(u.startsWith('http://bina.test/')) return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:PAGE});
  if(u.includes('/three.js/r128/three.min.js')) return route.fulfill({status:200,contentType:'application/javascript',body:readFileSync(join(ROOT,'node_modules/three/build/three.min.js'))});
  if(u.startsWith('https://fonts.googleapis.com/'))return route.fulfill({status:200,contentType:'text/css',body:fontCss()});
  if(u.startsWith('https://fonts.gstatic.com/local/'))return route.fulfill({status:200,body:readFileSync(join(ROOT,'node_modules',u.split('/local/')[1]))});
  if(!/^(data:|blob:)/.test(u)) {unexpected.push(u);return route.abort();}
  return route.continue();
 });
 await ctx.addInitScript(({project,noWebGL})=>{
  window.__BINA_DEBUG__=true;
  if(!sessionStorage.getItem('seeded')){
   sessionStorage.setItem('seeded','1');localStorage.setItem('bina-designer:welcomed:v1','1');localStorage.setItem('bina-designer:project:v1',JSON.stringify(project));
  }
  if(noWebGL){const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:get.call(this,type,...args);};}
 },{project,noWebGL});
 const pg=await ctx.newPage();pg.on('pageerror',e=>errors.push(e.message));
 await pg.goto('http://bina.test/#scene');
 await pg.waitForSelector('#scene-room');await pg.evaluate(()=>document.fonts.ready);
 return pg;
}
const scene=pg=>pg.evaluate(()=>window.__binaScene.scene);
const saved=async pg=>{await pg.waitForTimeout(350);return pg.evaluate(()=>JSON.parse(localStorage.getItem('bina-designer:project:v1')));};
async function ready(pg){await pg.waitForFunction(()=>!!window.__binaScene?.view);}
async function exportZip(pg,name){
 const [dl]=await Promise.all([pg.waitForEvent('download'),pg.click('#scene-export')]);
 const buf=readFileSync(await dl.path());writeFileSync(join(OUT,`${name}.zip`),buf);
 const entries=unzipSync(buf);const json=n=>JSON.parse(strFromU8(entries[`bina-scene/${n}.json`]));
 const s=json('scene'),m=json('manifest');assert.ok(validate(s),JSON.stringify(validate.errors));
 assert.equal(s.revision,m.sceneRevision);assert.equal(m.imageGenerationExecuted,false);
 assert.equal(m.provider,null);assert.ok(entries['bina-scene/plan-reference.png']);
 const plan=entries['bina-scene/plan-reference.png'];assert.equal(Buffer.from(plan).readUInt32BE(16),1200);
 return {s,m,entries};
}
try {
 const pg=await page(bedroomProject());await ready(pg);
 assert.deepEqual((await scene(pg)).room.polygon,bedroomProject().rooms[0].points);
 for(const preset of ['entrance','window','opposite','wide','custom']){
  await pg.selectOption('#scene-preset',preset);await ready(pg);assert.equal((await scene(pg)).camera.preset,preset);
 }
 await pg.selectOption('#scene-preset','entrance');await ready(pg);
 const cameraBefore=await pg.evaluate(()=>window.__binaScene.view.cameraState());
 const pixels=await pg.evaluate(async()=>{
  const blob=await window.__binaScene.view.capturePNG();const img=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
  const data=ctx.getImageData(0,0,c.width,c.height).data,colors=new Set();for(let i=0;i<data.length;i+=400)colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
  return {width:c.width,height:c.height,colors:colors.size};
 });assert.ok(pixels.colors>30,JSON.stringify(pixels));
 assert.deepEqual(await pg.evaluate(()=>window.__binaScene.view.cameraState()),cameraBefore,'capture restores camera');
 const initialFov=(await scene(pg)).camera.fov;
 for(const ratio of [4/3,1,16/9]){
  await pg.selectOption('#scene-aspect',String(ratio));await ready(pg);
  assert.equal((await scene(pg)).camera.fov,initialFov);
  assert.equal(await pg.evaluate(()=>window.__binaScene.view.cameraState().aspect),ratio);
 }
 const canvas=pg.locator('#scene-viewport canvas'), box=await canvas.boundingBox();
 const pos=(await scene(pg)).camera.position;
 await pg.mouse.move(box.x+box.width/2,box.y+box.height/2);await pg.mouse.down();await pg.mouse.move(box.x+box.width/2+45,box.y+box.height/2-12,{steps:6});await pg.mouse.up();await ready(pg);
 assert.equal((await scene(pg)).camera.preset,'custom');assert.deepEqual((await scene(pg)).camera.position,pos);
 await pg.fill('#scene-instructions','Create a warm minimalist bedroom with soft natural daylight.');await pg.locator('#scene-lighting').selectOption('warm');await ready(pg);
 const bedroom=await exportZip(pg,'bedroom');assert.equal(bedroom.m.assets.blockout.status,'included');assert.ok(bedroom.entries['bina-scene/blockout-reference.png']);
 assert.deepEqual(bedroom.s.camera.position,(await scene(pg)).camera.position);
 await pg.waitForFunction(()=>!document.querySelector('.toast.show'));
 await pg.screenshot({path:join(OUT,'desktop-bedroom.png'),fullPage:true});
 await pg.waitForTimeout(400);const before=(await scene(pg)).camera;await pg.reload();await ready(pg);assert.deepEqual((await scene(pg)).camera,before,'camera settings reload');
 assert.doesNotMatch(JSON.stringify(await saved(pg)),/base64|data:image|data:application/);
 // Materials and composer reuse the same canvas / WebGL context.
 const shared=await pg.evaluate(()=>{window.savedCanvas=document.querySelector('#scene-viewport canvas');return !!window.savedCanvas;});assert.ok(shared);
 await pg.goto('http://bina.test/#materials');await pg.waitForSelector('#view3d canvas');
 assert.ok(await pg.evaluate(()=>window.savedCanvas===document.querySelector('#view3d canvas')));
 await pg.goto('http://bina.test/#scene');await ready(pg);
 assert.ok(await pg.evaluate(()=>window.savedCanvas===document.querySelector('#scene-viewport canvas')));
 report.desktop={pixels,revision:bedroom.s.revision,zipAssets:bedroom.m.assets,sharedRenderer:true};
 await pg.context().close();

 const kitchen=await page(kitchenProject());await ready(kitchen);
 const original=await scene(kitchen),originalEstimate=computeEstimate(await saved(kitchen));
 await kitchen.getByRole('button',{name:'მასალების დაფა',exact:true}).click();
 await kitchen.waitForSelector('dialog.board[open]');await kitchen.locator('dialog.board .icon-btn').click();
 const countertop=kitchen.locator('.scene-material').filter({hasText:'Calacatta'});
 await countertop.getByRole('button',{name:'შეცვლა',exact:true}).click();
 await kitchen.waitForSelector('#picker[open]');await kitchen.locator('#picker .pick-card').filter({hasText:'Bianco Carrara'}).locator('.pick-main').click();await ready(kitchen);
 const changed=await scene(kitchen);assert.deepEqual(changed.room,original.room);assert.deepEqual(changed.furniture,original.furniture);
 assert.deepEqual(changed.materials.filter(m=>m.target.surface!=='countertop'),original.materials.filter(m=>m.target.surface!=='countertop'));
 const changedEstimate=computeEstimate(await saved(kitchen));
 const check=kitchen.locator('.scene-material input[type=checkbox]').first();await check.uncheck();await ready(kitchen);
 assert.equal((await scene(kitchen)).materials[0].mandatory,false);assert.equal(computeEstimate(await saved(kitchen)).total,changedEstimate.total);
 await check.check();await ready(kitchen);
 // Restore the required example countertop through the existing picker.
 await kitchen.locator('.scene-material').filter({hasText:'Carrara'}).getByRole('button',{name:'შეცვლა',exact:true}).click();
 await kitchen.locator('#picker .pick-card').filter({hasText:'Calacatta'}).locator('.pick-main').click();await ready(kitchen);
 assert.equal(computeEstimate(await saved(kitchen)).total,originalEstimate.total);
 const kitchenZip=await exportZip(kitchen,'kitchen');assert.equal(kitchenZip.m.assets.blockout.status,'included');
 await kitchen.waitForFunction(()=>!document.querySelector('.toast.show'));
 await kitchen.screenshot({path:join(OUT,'desktop-kitchen.png'),fullPage:true});report.kitchen={revision:kitchenZip.s.revision,materials:kitchenZip.s.materials.map(m=>m.materialId)};
 await kitchen.context().close();

 const phone=await page(bedroomProject(),{mobile:true});await ready(phone);
 const dims=await phone.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert.ok(dims[0]<=dims[1],`no overflow ${dims}`);
 const cb=await phone.locator('#scene-viewport canvas').boundingBox();const cdp=await phone.context().newCDPSession(phone);
 const beforeTouch=(await scene(phone)).camera;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cb.x+cb.width*.5,y:cb.y+cb.height*.5}]});
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cb.x+cb.width*.5+i*5,y:cb.y+cb.height*.5}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ready(phone);
 const afterTouch=(await scene(phone)).camera;assert.equal(afterTouch.preset,'custom');assert.notDeepEqual(afterTouch.target,beforeTouch.target);assert.deepEqual(afterTouch.position,beforeTouch.position);
 await phone.locator('#scene-preset').selectOption('window');await ready(phone);
 await phone.selectOption('#scene-aspect','1');await ready(phone);
 const mobileZip=await exportZip(phone,'mobile-bedroom');assert.equal(mobileZip.m.assets.blockout.status,'included');
 assert.equal(Buffer.from(mobileZip.entries['bina-scene/blockout-reference.png']).readUInt32BE(16),Buffer.from(mobileZip.entries['bina-scene/blockout-reference.png']).readUInt32BE(20));
 await phone.waitForFunction(()=>!document.querySelector('.toast.show'));
 await phone.evaluate(()=>scrollTo(0,0));await phone.screenshot({path:join(OUT,'mobile-bedroom.png')});await phone.screenshot({path:join(OUT,'mobile-bedroom-full.png'),fullPage:true});
 report.mobile={touch:true,aspect:mobileZip.s.camera.aspect,noOverflow:true};await phone.context().close();

 const lost=await page(bedroomProject());await ready(lost);
 assert.ok(await lost.evaluate(()=>{const c=document.querySelector('#scene-viewport canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');window.lossExtension=gl.getExtension('WEBGL_lose_context');window.lossExtension?.loseContext();return !!window.lossExtension;}));
 await lost.waitForTimeout(150);
 const lostZip=await exportZip(lost,'webgl-context-lost');assert.equal(lostZip.m.assets.blockout.status,'missing');
 await lost.evaluate(()=>window.lossExtension.restoreContext());await lost.waitForTimeout(300);
 await lost.click('#scene-retry');await ready(lost);
 const recovered=await exportZip(lost,'webgl-recovered');assert.equal(recovered.m.assets.blockout.status,'included');
 report.contextRecovery={missingOnLoss:true,retryRestoresCapture:true};await lost.context().close();

 const unsupported=await page(bedroomProject(),{noWebGL:true});await unsupported.waitForSelector('#scene-retry:not([hidden])');
 const missing=await exportZip(unsupported,'webgl-unavailable');assert.equal(missing.m.assets.blockout.status,'missing');assert.equal(missing.entries['bina-scene/blockout-reference.png'],undefined);
 await unsupported.click('#scene-retry');await unsupported.waitForSelector('#scene-retry:not([hidden])');assert.ok((await scene(unsupported)).room.polygon.length);
 await unsupported.screenshot({path:join(OUT,'webgl-unavailable.png'),fullPage:true});report.unsupportedWebGL={retainedPlan:true,retry:true};await unsupported.context().close();
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 report.ok=true;report.unexpectedRequests=unexpected;writeFileSync(join(OUT,'acceptance.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} catch(e) { for(const ctx of browser.contexts()) for(const pg of ctx.pages()) {console.error(await pg.evaluate(()=>({status:document.querySelector('.scene-status')?.textContent,scene:window.__binaScene?.scene,errors:window.__binaSceneError})));await pg.screenshot({path:join(OUT,'failure.png'),fullPage:true});} throw e;} finally {await browser.close();}
