import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,activateFlames,ammoForWeapon,step,fire,selectWeapon,hitEnemy,FLAMES,SPAWNS,solid} from '../public/assets/js/umbral-core.mjs';
function run(){const s=createState();s.phase='playing';s.portalUsed=true;s.health=100;s.nextWave=999;s.nextAmmoSpawn=999;s.supplies=[];Object.assign(s.player,{x:0,z:12,y:0,yaw:0,pitch:0});return s;}
function advance(s,seconds,dt=.05){for(let t=0;t<seconds-1e-9;t+=dt)step(s,{},Math.min(dt,seconds-t));}
function target(s,kind='macabro',point={x:0,z:8,y:0}){const e=createEnemy(s,kind,point);e.speed=0;e.attack=999;return e;}

test('one second of free hand flames, then exactly eight seconds of cooldown; the bow occupies slot five',()=>{
  const s=run();selectWeapon(s,1);const ammo={...s.ammo};
  assert.equal(selectWeapon(s,4),true);assert.equal(s.selected,4);selectWeapon(s,1);
  assert.equal(activateFlames(s),true);assert.equal(activateFlames(s),false);assert.equal(fire(s),false);
  advance(s,.95);assert.ok(s.flameRemaining>0);assert.equal(s.flameCooldown,0);
  advance(s,.05);assert.equal(s.flameRemaining,0);assert.ok(Math.abs(s.flameCooldown-8)<1e-8);
  assert.deepEqual(s.ammo,ammo);assert.equal(fire(s),true);
  advance(s,7.95);assert.equal(activateFlames(s),false);
  advance(s,.05);assert.equal(activateFlames(s),true);
});

test('burn persists after the stream ends, kills once and drops all three exact reward ranges',()=>{
  for(let seed=1;seed<=20;seed++){
    const s=run();s.seed=seed;const e=target(s);activateFlames(s);advance(s,1);
    assert.ok(e.hp>0&&e.burnRemaining>0);assert.equal(s.drops.length,0);
    advance(s,1.3);assert.equal(s.kills,1);assert.equal(s.drops.length,3);
    assert.ok(s.drops.find(d=>d.ammoType==='small').amount>=15&&s.drops.find(d=>d.ammoType==='small').amount<=20);
    assert.ok(s.drops.find(d=>d.ammoType==='large').amount>=7&&s.drops.find(d=>d.ammoType==='large').amount<=10);
    assert.ok(s.drops.find(d=>d.ammoType==='obsidian').amount>=10&&s.drops.find(d=>d.ammoType==='obsidian').amount<=18);
    hitEnemy(s,e,1000,'burn');advance(s,.5);assert.equal(s.drops.length,3);assert.equal(s.kills,1);
  }
});

test('burn damage is frame-rate independent and does not permanently stagger heavy enemies',()=>{
  for(const dt of [.05,1/60,1/120]){
    const s=run(),e=target(s,'centinela');activateFlames(s);advance(s,1,dt);
    assert.ok(Math.abs(e.hp-(620-45))<1e-6);assert.equal(e.stun,0);
    advance(s,4,dt);const hp=e.hp;advance(s,2,dt);assert.equal(e.hp,hp);assert.equal(s.drops.length,0);
  }
});

test('every weapon can finish a flame-marked enemy and drop all three ammo types exactly once',()=>{
  for(let weapon=0;weapon<6;weapon++){
    const s=run(),e=target(s,'centinela',{x:0,z:10,y:0});
    activateFlames(s);advance(s,1);assert.ok(e.burnRemaining>0);assert.equal(e.flameMarked,true);
    e.hp=1;selectWeapon(s,weapon);assert.equal(fire(s),true);
    assert.equal(s.kills,1);assert.equal(s.drops.length,3);
    assert.deepEqual(s.drops.map(d=>d.ammoType).sort(),['large','obsidian','small']);
    const obsidian=s.drops.find(d=>d.ammoType==='obsidian');assert.ok(obsidian.amount>=10&&obsidian.amount<=18);
    hitEnemy(s,e,999);advance(s,.2);assert.equal(s.drops.length,3);assert.equal(s.kills,1);
  }
});

test('R reward persists after the fire expires, even when the bow burn finishes the enemy',()=>{
  const s=run(),e=target(s,'centinela');activateFlames(s);advance(s,5);
  assert.equal(e.burnRemaining,0);assert.equal(e.flameMarked,true);
  e.hp=85;selectWeapon(s,4);fire(s);assert.equal(e.hp,10);assert.equal(s.drops.length,0);
  advance(s,1);assert.equal(s.kills,1);assert.equal(s.drops.length,3);
  assert.ok(s.events.some(e=>e.type==='kill'&&e.source==='arrowBurn'));
});

test('unmarked enemies grant no flame reward and new enemies do not inherit a previous mark',()=>{
  const s=run(),e=target(s);assert.equal(e.flameMarked,false);hitEnemy(s,e,999);assert.equal(s.drops.length,0);
  const next=target(s);assert.equal(next.flameMarked,false);assert.equal(next.burnRemaining,0);
});

test('ignition respects distance, aim, elevation and walls',()=>{
  const s=run(),front=target(s),back=target(s,'macabro',{x:0,z:15,y:0}),far=target(s,'macabro',{x:0,z:2,y:0});
  const high=target(s,'macabro',{x:0,z:8,y:6});activateFlames(s);step(s,{},.05);
  assert.ok(front.burnRemaining>0);for(const e of [back,far,high]){assert.equal(e.burnRemaining,0);assert.equal(e.flameMarked,false);}
  const w=run();w.player.x=7;const hidden=target(w,'macabro',{x:7,z:6,y:0});activateFlames(w);advance(w,1);
  assert.equal(hidden.burnRemaining,0);assert.equal(hidden.hp,100);assert.equal(hidden.flameMarked,false);
});

test('loot is physical, collected once, and only increments its named reserve',()=>{
  const s=run();target(s);activateFlames(s);advance(s,3);
  const original={...s.ammo},drops=s.drops.map(d=>({...d}));assert.equal(drops.length,3);
  for(const d of drops){Object.assign(s.player,{x:d.x,z:d.z,y:d.y});advance(s,.1);}
  assert.equal(s.drops.length,0);
  for(const d of drops)assert.equal(s.ammo[d.ammoType],original[d.ammoType]+d.amount);
  const once={...s.ammo};advance(s,1);assert.deepEqual(s.ammo,once);
});

test('three independent accumulated reserves require switching to a stocked weapon, without reload',()=>{
  const s=run();s.ammo={small:1,large:3,obsidian:1};selectWeapon(s,2);fire(s);assert.equal(s.ammo.obsidian,0);
  s.cooldown=0;selectWeapon(s,2);assert.equal(ammoForWeapon(s),0);assert.equal(fire(s),false);
  s.cooldown=0;selectWeapon(s,1);assert.equal(fire(s),true);assert.equal(s.ammo.small,0);
  s.cooldown=0;selectWeapon(s,5);assert.equal(fire(s,true),true);assert.equal(s.ammo.large,0);
  s.cooldown=0;selectWeapon(s,4);assert.equal(fire(s),false);
  s.cooldown=0;selectWeapon(s,0);assert.equal(fire(s),true);
});

test('pause and death freeze fire, burn and pickup timers; restart clears them',()=>{
  for(const phase of ['paused','dead']){
    const s=run();target(s);activateFlames(s);advance(s,.3);s.phase=phase;const before=structuredClone(s);
    advance(s,10);assert.equal(activateFlames(s),false);assert.deepEqual(s,before);
  }
  const s=createState();assert.equal(s.flameRemaining,0);assert.equal(s.flameCooldown,0);assert.equal(s.drops.length,0);
});

test('random arena ammo appears at valid positions, expires and stays bounded',()=>{
  const s=run();s.nextAmmoSpawn=.01;step(s,{},.05);
  assert.equal(s.drops.length,1);const d=s.drops[0];assert.equal(d.source,'arena');assert.equal(solid(d.x,d.z,.18,d.y,.3),false);
  s.nextAmmoSpawn=999;advance(s,46);assert.equal(s.drops.length,0);
});

test('burned pillar sentries drop at a reachable landing, not on the tall pillar',()=>{
  const s=run(),point=SPAWNS.find(p=>p.elevated),e=target(s,'macabro',point);
  hitEnemy(s,e,1000,'burn');assert.equal(s.drops.length,3);
  for(const d of s.drops){assert.ok(d.y<point.y);assert.ok(Math.hypot(d.x-point.landing.x,d.z-point.landing.z)<1);}
});
