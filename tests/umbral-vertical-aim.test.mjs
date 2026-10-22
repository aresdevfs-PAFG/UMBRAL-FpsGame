import test from 'node:test';
import assert from 'node:assert/strict';
import {aimDirection,clampPitch} from '../public/assets/js/umbral-aim.mjs';
import {createState,createEnemy,selectWeapon,fire,activateFlames,activateMacuahuitl,step,WEAPONS} from '../public/assets/js/umbral-core.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function run(map='cuenca',pitch=Math.PI/2){const s=createState(map);s.phase='playing';s.portalUsed=true;s.health=100;s.nextWave=999;s.nextAmmoSpawn=999;s.supplies=[];Object.assign(s.player,{x:0,z:24,y:pitch<0?6:0,pitch,yaw:.9});return s;}
function target(s,y){const e=createEnemy(s,'macabro',{x:0,z:24,y});e.speed=0;e.attack=999;return e;}

test('mouse pitch reaches exactly both vertical limits without flipping, rays stay unit length',()=>{
  for(const sign of [-1,1]){const pitch=clampPitch(sign*1000);near(pitch,sign*Math.PI/2);
    for(const yaw of [-10,0,10]){const d=aimDirection(yaw,pitch);near(d.x,0);near(d.z,0);near(d.y,sign);near(Math.hypot(d.x,d.y,d.z),1);}}
});
test('every ranged weapon hits a target directly above or below and keeps traces finite',()=>{
  for(const map of ['cuenca','corona'])for(const pitch of [-Math.PI/2,Math.PI/2])for(const index of [1,2,3,4]){
    const s=run(map,pitch),e=target(s,pitch>0?4:0);selectWeapon(s,index);assert.equal(fire(s),true);
    assert.ok(e.hp<100,`${map}/${pitch}/${index}`);
    const trails=s.events.filter(e=>e.type==='trace'||e.type==='bowTrail');assert.ok(trails.length);
    for(const t of trails){assert.ok([t.tx,t.ty,t.tz].every(Number.isFinite));assert.ok(Math.hypot(t.tx-t.x,t.ty-t.y,t.tz-t.z)<=WEAPONS[index].range+1e-7);}
  }
});
test('straight vertical shots stop on floors and bridge ceilings instead of passing through',()=>{
  for(const index of [2,3,4])for(const pitch of [-Math.PI/2,Math.PI/2]){
    const s=run('cuenca',pitch);s.player.z=-7.5;s.player.y=pitch>0?0:6;
    const e=createEnemy(s,'macabro',{x:0,z:-7.5,y:pitch>0?6:0});selectWeapon(s,index);fire(s);
    assert.equal(e.hp,100);const t=s.events.find(e=>e.type==='trace'||e.type==='bowTrail');
    assert.ok(Math.abs(t.ty-(pitch>0?5.3:6))<=.026);
  }
});
test('open-sky misses are bounded by weapon range; floor impacts use the same vertical ray',()=>{
  for(const map of ['cuenca','corona'])for(const pitch of [-Math.PI/2,Math.PI/2])for(const index of [2,3,4]){
    const s=run(map,pitch);s.player.y=0;selectWeapon(s,index);fire(s,index===4);
    const t=s.events.find(e=>e.type==='trace'||e.type==='bowTrail');near(t.tx,0);near(t.tz,24);
    if(pitch>0)near(t.ty,1.6+WEAPONS[index].range);else assert.ok(t.ty>=0&&t.ty<=.026);
  }
});
test('R can burn a directly vertical target, without igniting an off-axis or occluded enemy',()=>{
  for(const pitch of [-Math.PI/2,Math.PI/2]){
    const s=run('cuenca',pitch),e=target(s,pitch>0?4:0),side=createEnemy(s,'macabro',{x:5,z:24,y:pitch>0?4:0});
    activateFlames(s);step(s,{},.01);assert.equal(e.flameMarked,true);assert.equal(side.flameMarked,false);
  }
  const s=run();s.player.z=-7.5;const blocked=createEnemy(s,'macabro',{x:0,z:-7.5,y:6});activateFlames(s);step(s,{},.01);assert.equal(blocked.flameMarked,false);
});
test('the F strike remains aligned with a vertical camera at close range',()=>{
  const s=run(),e=target(s,3);activateMacuahuitl(s);for(let i=0;i<5;i++)step(s,{},.05);assert.ok(e.hp<=0);
});
