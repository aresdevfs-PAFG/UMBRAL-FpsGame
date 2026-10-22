import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,step,hitEnemy,damagePlayer,activateMacuahuitl} from '../public/assets/js/umbral-core.mjs';
import {DESOLLADOR,updateDesollador,desolladorPose} from '../public/assets/js/umbral-desollador.mjs';
import {MADRE} from '../public/assets/js/umbral-madre.mjs';
import {getArena} from '../public/assets/js/umbral-arena.mjs';

const pos=e=>({x:e.x,y:e.y,z:e.z});
function setup(hp=18000){
  const s=createState('corona');
  Object.assign(s,{phase:'playing',portalUsed:true,health:100,shield:100,shieldRegenAt:Infinity,
    pending:0,nextWave:999,nextAmmoSpawn:999,supplies:[]});
  Object.assign(s.player,{x:5,y:0,z:28,yaw:0,pitch:0});
  const e=createEnemy(s,'desollador',{x:5,y:0,z:24});e.hp=hp;
  e.bossMotion={from:{x:5,y:10,z:24},target:pos(e),age:1,duration:1.01,height:10};
  updateDesollador(s,e,.02,damagePlayer);
  assert.ok(e.bladeStorm);
  return {s,e};
}
function firstVolley(s,e){
  updateDesollador(s,e,DESOLLADOR.cutWindup,damagePlayer);
  return s.projectiles.slice();
}
function tick(s,seconds,hz=60,input={}){
  for(let i=0;i<Math.ceil(seconds*hz);i++)step(s,input,1/hz);
}

test('both interruption bars are 700, Desollador has 18K health and enters rage at exactly 9K',()=>{
  assert.equal(DESOLLADOR.vortexHealth,700);assert.equal(MADRE.dragHealth,700);
  const {s,e}=setup();assert.equal(e.hp,18000);assert.equal(e.maxHp,18000);
  hitEnemy(s,e,8999);updateDesollador(s,e,.01,damagePlayer);assert.equal(e.enraged,false);
  hitEnemy(s,e,1);updateDesollador(s,e,.01,damagePlayer);assert.equal(e.enraged,true);
  updateDesollador(s,e,.01,damagePlayer);assert.equal(s.events.filter(x=>x.type==='bossRage').length,1);
});

test('stationary sword sequence lasts 5.5 seconds, alternates poses and recovers at 20/60/120 Hz',()=>{
  for(const hz of [20,60,120]){
    const {s,e}=setup(),origin=pos(e),poses=new Set();s.health=s.shield=10000;
    let elapsed=0,maxActive=0;
    while(e.bladeStorm&&elapsed<6){
      const pose=desolladorPose(e);assert.equal(pose.state,'attack');poses.add(`${pose.frame}/${pose.mirror}`);
      step(s,{},1/hz);elapsed+=1/hz;
      assert.deepEqual(pos(e),origin);maxActive=Math.max(maxActive,s.projectiles.length);
    }
    assert.ok(Math.abs(elapsed-5.5)<1/hz+.0001);
    assert.ok(poses.size>=6,'both sword directions must animate through multiple frames');
    assert.ok(maxActive<=50);assert.ok(e.exposedUntil>s.time);assert.equal(e.anim,'move');
    assert.equal(s.events.filter(x=>x.type==='desolladorCutsEnd').length,1);
    assert.equal(s.events.filter(x=>x.type==='enemyAttack'&&x.attack==='cuts').length,9);
  }
});

test('each burst covers 360 degrees, leaves dodge gaps and becomes faster and stronger below half health',()=>{
  for(const hp of [18000,9000]){
    const {s,e}=setup(hp),cuts=firstVolley(s,e);
    assert.equal(cuts.length,10);
    const speed=22*(hp===9000?1.3:1),damage=hp===9000?50:40;
    for(const cut of cuts){
      assert.equal(cut.kind,'wind-cut');assert.equal(cut.damage,damage);assert.equal(cut.homing,false);
      assert.equal(cut.life,2);assert.ok(Math.abs(Math.hypot(cut.dx,cut.dy,cut.dz)-speed)<1e-8);
    }
    assert.ok(Math.abs(cuts.reduce((n,b)=>n+b.dx,0))<1e-8);
    assert.ok(Math.abs(cuts.reduce((n,b)=>n+b.dz,0))<1e-8);
    const firstDirection=[cuts[0].dx,cuts[0].dz];s.projectiles=[];
    updateDesollador(s,e,DESOLLADOR.cutInterval/(e.enraged?1.3:1),damagePlayer);
    assert.equal(s.projectiles.length,10);assert.notDeepEqual([s.projectiles[0].dx,s.projectiles[0].dz],firstDirection);
    assert.equal(s.projectiles[0].slashMirror,true);
  }
});

test('a real cut hits shields first, overflows health and can kill at all tested frame rates',()=>{
  for(const hz of [20,60,120])for(const hp of [18000,9000])for(const shield of [100,15,0]){
    const {s,e}=setup(hp);s.shield=shield;
    firstVolley(s,e);e.trainingDummy=true;tick(s,.35,hz);
    const damage=hp===9000?50:40;
    assert.equal(s.shield,Math.max(0,shield-damage));
    assert.equal(s.health,100-Math.max(0,damage-shield));
  }
  const {s,e}=setup();s.shield=0;s.health=40;firstVolley(s,e);e.trainingDummy=true;tick(s,.35);
  assert.equal(s.phase,'dead');assert.equal(e.bladeStorm,null);
});

test('cuts miss after strafing or jumping, and collide with the actual Corona cover',()=>{
  for(const evade of ['strafe','jump']){
    const {s,e}=setup();firstVolley(s,e);s.projectiles=s.projectiles.slice(0,1);e.trainingDummy=true;
    if(evade==='strafe')s.player.x=8;
    else Object.assign(s.player,{y:3,vy:0,grounded:false});
    tick(s,.35);assert.equal(s.health,100);assert.equal(s.shield,100);
  }
  const {s,e}=setup(),wall=getArena('corona').WALLS.find(w=>w.id==='corona-este');
  Object.assign(e,{x:wall.x-3,y:wall.y,z:wall.z});
  Object.assign(s.player,{x:wall.x+3,y:wall.y,z:wall.z});
  firstVolley(s,e);s.projectiles=s.projectiles.slice(0,1);e.trainingDummy=true;
  tick(s,.35);assert.equal(s.projectiles.length,0);assert.equal(s.shield,100);
  assert.ok(s.events.some(x=>x.type==='impact'&&x.kind==='wind-cut'));
});

test('enrage during a barrage upgrades following cuts and pause freezes the entire attack',()=>{
  const {s,e}=setup();firstVolley(s,e);s.projectiles=[];
  hitEnemy(s,e,9000);updateDesollador(s,e,.6,damagePlayer);
  assert.ok(e.enraged);assert.ok(s.projectiles.every(b=>b.damage===50&&Math.abs(b.speed-28.6)<1e-8));
  s.phase='paused';const frozen=structuredClone(s);tick(s,2);assert.deepEqual(s,frozen);
});

test('charged F and boss death cancel the barrage and its owned cuts',()=>{
  for(const method of ['F','death']){
    const {s,e}=setup();Object.assign(s.player,{x:5,z:26.5});
    firstVolley(s,e);
    if(method==='death')hitEnemy(s,e,18001);
    else{assert.ok(activateMacuahuitl(s));tick(s,.3);assert.ok(e.shockStunUntil>s.time);}
    assert.equal(e.bladeStorm,null);assert.ok(!s.projectiles.some(b=>b.kind==='wind-cut'));
    const count=s.events.filter(x=>x.type==='enemyAttack'&&x.attack==='cuts').length;
    tick(s,1);assert.equal(s.events.filter(x=>x.type==='enemyAttack'&&x.attack==='cuts').length,count);
  }
});
