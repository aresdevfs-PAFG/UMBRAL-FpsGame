import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,selectWeapon,fire,step,activateFlames,activateMacuahuitl,WEAPONS} from '../public/assets/js/umbral-core.mjs';
import {createPairedViewmodels,dualPose,flamePose,drawPairedFrame} from '../public/assets/js/umbral-paired-viewmodels.mjs';
import {readFileSync} from 'node:fs';
function run(){const s=createState();s.phase='playing';selectWeapon(s,3);return s;}
function tick(s,t,input={}){while(t>1e-8){const dt=Math.min(.01,t);step(s,input,dt);t-=dt;}}

test('complete authored pairs render once, stay within view and withdraw with the powers',()=>{
 const assets=JSON.parse(readFileSync(new URL('../public/assets/img/umbral-demo/assets.json',import.meta.url)));
 const seq=assets.weapons.find(w=>w.id==='espinario').dual,flames=assets.abilities.flames;
 const images=new Map([seq,flames].map(q=>[q.file,{width:1280,height:720}]));
 const calls=[],ctx={drawImage(...args){calls.push(args);}},model=createPairedViewmodels(assets,images);
 const s=run();model.drawDual(ctx,960,540,s,null);model.drawFlames(ctx,960,540,s);assert.equal(calls.length,0);
 fire(s,true);tick(s,.2);model.drawDual(ctx,960,540,s,{index:3,time:.015});
 assert.equal(calls.length,1,'one complete dual frame, never two mirrored weapon sprites');
 assert.equal(calls[0][1],640);assert.equal(calls[0][2],0);
 activateFlames(s);tick(s,.25);model.drawFlames(ctx,960,540,s);assert.equal(calls.length,2);
 for(const [width,height] of [[960,540],[540,960],[320,180]]){
  drawPairedFrame(ctx,images.get(seq.file),seq,0,width,height);
  const [, , , , ,x,y,w,h]=calls.at(-1);
  assert.ok(x>=0&&y>=0&&x+w<=width+.001&&y+h<=height+.001);
 }
});

test('paired animation follows confirmed fire and freezes with simulation time',()=>{
 const s=run();fire(s,true);tick(s,.3);
 assert.equal(dualPose(s,null).frame,0);
 assert.equal(dualPose(s,{index:2,time:0}).frame,0);
 assert.deepEqual([.01,.04,.07,.1].map(time=>dualPose(s,{index:3,time}).frame),[1,2,3,0]);
 activateFlames(s);tick(s,.3);const pose=flamePose(s);s.phase='paused';tick(s,2);
 assert.deepEqual(flamePose(s),pose);
 assert.equal(flamePose({flameRemaining:.99}).frame,0);
 assert.equal(flamePose({flameRemaining:.05}).frame,3);
});
test('requested numeric order is stable',()=>assert.deepEqual(WEAPONS.map(w=>w.id),['coaiztlactli','escopeta','clavadora','espinario','arco-jaguar','canon-solar']));
test('dual activation fires automatically with empty reserve, allows movement and expires after four seconds',()=>{
 const s=run();s.ammo.thorns=0;const z=s.player.z;
 assert.equal(fire(s,true),true);tick(s,3.99,{forward:1});
 assert.ok(s.shotSerial>45);assert.equal(s.ammo.thorns,0);assert.notEqual(s.player.z,z);
 assert.ok(s.events.some(e=>e.type==='shot'&&e.dual));tick(s,.01);
 assert.equal(s.smgDualRemaining,0);assert.ok(Math.abs(s.smgDualCooldown-7)<1e-7);
 const count=s.shotSerial;tick(s,1);assert.equal(s.shotSerial,count);assert.equal(fire(s,true),false);
 tick(s,6);assert.equal(fire(s,true),true);
});
test('holding secondary does not retrigger; releasing and clicking does',()=>{
 const s=run();tick(s,12,{secondary:true});assert.equal(s.smgDualRemaining,0);
 tick(s,.01,{});tick(s,.01,{secondary:true});assert.ok(s.smgDualRemaining>0);
});
test('pause freezes dual fire and cooldown; swapping or powers end it without bypassing cooldown',()=>{
 for(const cancel of [s=>selectWeapon(s,1),activateFlames,activateMacuahuitl]){
  const s=run();fire(s,true);tick(s,1);const remain=s.smgDualRemaining,count=s.shotSerial;
  s.phase='paused';tick(s,8);assert.equal(s.smgDualRemaining,remain);assert.equal(s.shotSerial,count);
  s.phase='playing';cancel(s);assert.equal(s.smgDualRemaining,0);assert.equal(s.smgDualCooldown,7);
  selectWeapon(s,3);assert.equal(fire(s,true),false);
 }
});
