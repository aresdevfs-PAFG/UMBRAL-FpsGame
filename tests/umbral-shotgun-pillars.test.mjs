import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,fire,selectWeapon,step,damagePlayer,createEnemy,hitEnemy,SHOTGUN_RECOIL,SHOTGUN_CYCLE_DURATION,SPAWNS,solid,visible} from '../public/assets/js/umbral-core.mjs';
const advance=(s,seconds)=>{for(let t=0;t<seconds-1e-8;t+=.05)step(s,{},Math.min(.05,seconds-t));};
function state(){const s=createState();s.phase='playing';s.nextWave=100;selectWeapon(s,1);return s;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('two left shots use one cartridge each, then one cosmetic recovery cycle',()=>{
  const s=state(),ammo=s.ammo.small;
  assert.equal(fire(s),true);assert.equal(s.ammo.small,ammo-1);assert.equal(s.shotgunShots,1);assert.equal(s.shotgunCycleRemaining,0);
  assert.equal(fire(s),false);advance(s,SHOTGUN_RECOIL+.01);
  assert.equal(fire(s),true);assert.equal(s.ammo.small,ammo-2);assert.equal(s.shotgunShots,0);
  near(s.shotgunCycleRemaining,SHOTGUN_RECOIL+SHOTGUN_CYCLE_DURATION);
  const events=s.events.filter(e=>e.type==='shotgunCycle');assert.equal(events.length,1);
  assert.deepEqual(events[0],{type:'shotgunCycle',index:1,offset:SHOTGUN_RECOIL,duration:SHOTGUN_CYCLE_DURATION,total:SHOTGUN_RECOIL+SHOTGUN_CYCLE_DURATION});
  advance(s,SHOTGUN_RECOIL+SHOTGUN_CYCLE_DURATION-.03);assert.equal(fire(s),false);
  advance(s,.04);assert.equal(fire(s),true);assert.equal(s.ammo.small,ammo-3);assert.equal(s.shotgunShots,1);
});

test('right shot consumes exactly two cartridges and enters the same cycle',()=>{
  const s=state(),ammo=s.ammo.small;assert.equal(fire(s,true),true);
  assert.equal(s.ammo.small,ammo-2);assert.equal(s.shotgunShots,0);
  near(s.shotgunCycleRemaining,SHOTGUN_RECOIL+SHOTGUN_CYCLE_DURATION);
  assert.equal(s.events.filter(e=>e.type==='trace').length,16);
  advance(s,1);assert.equal(fire(s,true),false);advance(s,.34);assert.equal(fire(s,true),true);
});

test('switching weapons preserves both the first shot count and recovery lock',()=>{
  const s=state();fire(s);selectWeapon(s,2);assert.equal(fire(s),true,'other weapon should work during shotgun recoil');
  assert.equal(s.shotgunShots,1);advance(s,.2);selectWeapon(s,1);assert.equal(fire(s),true);
  const remaining=s.shotgunCycleRemaining;selectWeapon(s,2);assert.equal(fire(s),true,'other weapon should work during shotgun cycle');
  advance(s,.15);selectWeapon(s,1);assert.equal(fire(s),false);assert.ok(s.shotgunCycleRemaining<remaining);
  advance(s,1.2);assert.equal(fire(s),true);assert.equal(s.shotgunShots,1);
});

test('a double shot after one single still consumes two reserve rounds and insufficient ammo never advances the cycle',()=>{
  const s=state();s.ammo.small=4;fire(s);advance(s,.2);assert.equal(fire(s,true),true);assert.equal(s.ammo.small,1);assert.equal(s.shotgunShots,0);
  advance(s,1.34);assert.equal(fire(s,true),false);assert.equal(s.ammo.small,1);assert.equal(s.shotgunShots,0);assert.equal(s.shotgunCycleRemaining,0);
  advance(s,.21);assert.equal(fire(s),true);assert.equal(s.ammo.small,0);assert.equal(s.shotgunShots,1);
});

test('pause and death freeze cosmetic cycle; replay creates a clean firing rhythm',()=>{
  const s=state();fire(s,true);const remaining=s.shotgunCycleRemaining;
  s.phase='paused';advance(s,3);near(s.shotgunCycleRemaining,remaining);
  s.phase='playing';s.portalUsed=true;damagePlayer(s,500);advance(s,3);near(s.shotgunCycleRemaining,remaining);
  const fresh=createState();assert.equal(fresh.shotgunShots,0);assert.equal(fresh.shotgunRecoilRemaining,0);assert.equal(fresh.shotgunCycleRemaining,0);assert.equal(fresh.ammo.small,60);
});

test('all elevated spawn tops support their intended enemy types without sidewall overlap',()=>{
  const pillars=SPAWNS.filter(p=>p.elevated);assert.equal(pillars.length,4);
  for(const p of pillars)for(const kind of ['macabro','empalador','centinela','devorador']){
    const s=state(),e=createEnemy(s,kind,p);assert.ok(e.perch);assert.equal(solid(e.x,e.z,e.radius,e.y,e.height),false);
    assert.ok(p.landing&&p.landing.y===0);
  }
});

test('ranged sentries hold a visible perch and attack from its actual height',()=>{
  const p=SPAWNS.find(p=>p.elevated&&p.z===7),s=state();s.portalUsed=true;s.health=1000;
  Object.assign(s.player,{x:p.x,z:27,y:0});const e=createEnemy(s,'macabro',p);e.attack=0;
  assert.equal(visible(e,s.player),true);advance(s,.7);
  near(e.x,p.x);near(e.z,p.z);near(e.y,p.y);assert.equal(e.perch.descending,false);
  assert.ok(s.projectiles.some(b=>b.owner===e.id&&b.y>6.4));
});

test('hidden players make all perched enemies descend physically and rejoin the arena',()=>{
  for(const p of SPAWNS.filter(p=>p.elevated))for(const kind of ['macabro','empalador','centinela','devorador']){
    const s=state();s.portalUsed=true;s.health=10000;Object.assign(s.player,p.landing);
    assert.equal(solid(s.player.x,s.player.z,.32,0,1.75),false,'hidden player must be in a reachable ground position');
    const e=createEnemy(s,kind,p);e.attack=100;assert.equal(visible(e,s.player),false);
    let falling=false,landed=false,previous=e.y;
    for(let i=0;i<240;i++){
      step(s,{},.05);if(e.y<p.y&&e.y>0)falling=true;
      assert.ok(previous-e.y<1.2,'descent teleported instead of falling');previous=e.y;
      if(!e.perch&&e.y===0){landed=true;break;}
    }
    assert.equal(falling,true,kind);assert.equal(landed,true,`${kind} ${p.pillarId}`);
    assert.equal(solid(e.x,e.z,e.radius,e.y,e.height),false);
    hitEnemy(s,e,1000);assert.equal(s.kills,1);assert.equal(s.enemies.filter(e=>e.hp>0).length,0);
  }
});

test('a Devorador can charge off a pillar and fall without getting embedded in its edge',()=>{
  const p=SPAWNS.find(p=>p.elevated&&p.z===7),s=state();s.portalUsed=true;s.health=1000;
  Object.assign(s.player,{x:p.x,z:20,y:0});const e=createEnemy(s,'devorador',p);e.attack=0;
  advance(s,.8);assert.ok(e.charge);advance(s,1.2);assert.ok(e.y<p.y);assert.equal(s.projectiles.length,0);
  advance(s,2);assert.equal(e.perch,null);assert.equal(solid(e.x,e.z,e.radius,e.y,e.height),false);
});

test('each wave prioritizes a visibly warned elevated Macabro and falls back when pillars are occupied',()=>{
  const s=state();s.portalUsed=true;s.health=1000;s.wave=3;s.pending=8;s.nextSpawn=0;s.spawnCount=5;
  Object.assign(s.player,{x:0,z:28,y:0,yaw:0});
  step(s,{},.05);
  const warning=s.spawnWarnings[0];assert.ok(warning?.elevated&&warning.priorityElevated);
  assert.equal(warning.kind,'macabro','first elevated threat overrides the normal Centinela pool slot');
  assert.equal(warning.remaining,1.25);assert.equal(s.enemies.length,0);
  const distance=Math.hypot(warning.x-s.player.x,warning.z-s.player.z);
  assert.ok(distance>11);assert.equal(visible(s.player,warning),true);
  assert.ok(-(warning.z-s.player.z)/distance>.6,'priority warning should be allowed inside the forward view');
  advance(s,1);assert.equal(s.enemies.length,0);advance(s,.3);
  assert.ok(s.enemies.some(e=>e.kind==='macabro'&&e.elevated));

  // Completing this wave must reset the priority for the following wave.
  s.enemies=[];s.spawnWarnings=[];s.pending=0;s.nextWave=.01;step(s,{},.05);
  assert.equal(s.wave,4);assert.equal(s.elevatedSpawnScheduled,false);advance(s,.25);
  assert.ok(s.spawnWarnings.some(w=>w.elevated&&w.priorityElevated&&w.kind==='macabro'));

  const occupied=state();occupied.portalUsed=true;occupied.health=1000;occupied.wave=1;occupied.pending=8;occupied.nextSpawn=0;
  Object.assign(occupied.player,{x:0,z:0,y:0});
  for(const p of SPAWNS.filter(p=>p.elevated)){const e=createEnemy(occupied,'macabro',p);e.attack=100;}
  step(occupied,{},.05);
  assert.equal(occupied.elevatedSpawnScheduled,false);assert.equal(occupied.spawnWarnings.length,1);
  assert.equal(occupied.spawnWarnings[0].elevated,undefined,'normal arrivals must still work when no pillar is free');
});
