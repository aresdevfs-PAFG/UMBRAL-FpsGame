import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,step,hitEnemy} from '../public/assets/js/umbral-core.mjs';

function arena(x=0,z=12,y=0){const s=createState();s.phase='playing';s.portalUsed=true;s.health=100;s.wave=1;s.nextWave=100;Object.assign(s.player,{x,z,y});return s;}
function advance(s,seconds){for(let t=0;t<seconds-1e-8;t+=.05)step(s,{},Math.min(.05,seconds-t));}
function attacker(s,kind){const e=createEnemy(s,kind,{x:0,z:0,y:0});e.attack=0;return e;}

test('ranged enemy types telegraph before releasing their distinct authored projectile kinds',()=>{
  for(const [kind,projectile,count,windup]of [
    ['macabro','blood-projectile',1,.48],['abominacion','acid-projectile',3,.7],['centinela','plasma-projectile',2,.85],
  ]){
    const s=arena();attacker(s,kind);step(s,{},.05);
    assert.equal(s.projectiles.length,0);assert.ok(s.events.some(e=>e.type==='enemyWindup'&&e.kind===kind));
    advance(s,windup-.1);assert.equal(s.projectiles.length,0);
    advance(s,.15);assert.equal(s.projectiles.length,count,kind);
    assert.ok(s.projectiles.every(p=>p.kind===projectile&&Number.isFinite(p.y)&&Number.isFinite(p.dy)));
    if(kind==='centinela')assert.ok(s.projectiles.every(p=>p.homing));
    if(kind==='abominacion')assert.ok(s.projectiles.every(p=>p.gravity>0));
  }
});

test('Devorador locks an announced body charge and never creates a projectile',()=>{
  const s=arena(),e=attacker(s,'devorador');step(s,{},.05);advance(s,.4);
  assert.equal(e.charge,null);assert.equal(s.projectiles.length,0);
  s.player.x=4;advance(s,.4);
  assert.ok(e.charge);assert.ok(Math.abs(e.x)<.05,'charge retargeted the dodge');
  assert.equal(s.projectiles.length,0);
  advance(s,.8);assert.equal(s.health,100);assert.equal(s.shield,100);assert.equal(s.projectiles.length,0);
});

test('a Devorador charge can hurt once, and its death explosion respects elevation',()=>{
  const s=arena();attacker(s,'devorador');advance(s,1.6);
  assert.equal(s.health,100);assert.equal(s.shield,84);assert.equal(s.projectiles.length,0);
  const elevated=arena(0,-7.5,6),below=createEnemy(elevated,'devorador',{x:0,z:-7.5,y:0});
  hitEnemy(elevated,below,999);assert.equal(elevated.health,100);assert.equal(elevated.shield,100);assert.equal(elevated.kills,1);
});

test('Empalador creates warned ground spikes which can be dodged',()=>{
  const s=arena();attacker(s,'empalador');step(s,{},.05);
  assert.equal(s.hazards.length,3);assert.ok(s.hazards.every(h=>h.kind==='obsidian-spikes'&&h.warning>=.8));
  assert.equal(s.projectiles.length,0);advance(s,.6);assert.equal(s.health,100);
  s.player.x=4;advance(s,1);assert.equal(s.health,100);assert.equal(s.shield,100);
  const hit=arena();attacker(hit,'empalador');advance(hit,1.1);assert.equal(hit.health,100);assert.equal(hit.shield,84);
});

test('Centinela alternate attack expands a warned ground ring and deals damage once',()=>{
  const s=arena(),e=attacker(s,'centinela');e.attacks=1;step(s,{},.05);
  assert.equal(e.anim,'mace');assert.equal(s.hazards[0].kind,'ground-shockwave');assert.equal(s.projectiles.length,0);
  advance(s,.6);assert.equal(s.health,100);assert.equal(s.shield,100);advance(s,1.75);assert.equal(s.health,100);assert.equal(s.shield,80);
  advance(s,.3);assert.equal(s.shield,80);
});

test('ground hazards do not hit a player on the bridge above them',()=>{
  const s=arena(0,-7.5,6);
  s.hazards.push({id:900,kind:'obsidian-spikes',x:0,z:-7.5,y:0,age:0,warning:0,duration:2,radius:2,hit:false});
  advance(s,.5);assert.equal(s.health,100);assert.equal(s.shield,100);
});

test('vertical enemy projectiles collide with the bridge slab before reaching the upper player',()=>{
  const s=arena(0,-7.5,6);
  s.projectiles.push({id:900,kind:'blood-projectile',x:0,z:-7.5,y:2,dx:0,dz:0,dy:8,speed:8,gravity:0,homing:false,age:0,life:2,radius:.18,damage:8});
  advance(s,1);assert.equal(s.projectiles.length,0);assert.equal(s.health,100);assert.equal(s.shield,100);
  const impact=s.events.find(e=>e.type==='impact');assert.ok(impact&&impact.y<=5.3);
});

test('Abominación death releases two Devoradores and keeps them in the wave',()=>{
  const s=arena(),e=attacker(s,'abominacion');hitEnemy(s,e,999);
  assert.equal(s.kills,1);assert.equal(s.enemies.filter(e=>e.hp>0&&e.kind==='devorador').length,2);
  advance(s,.5);assert.equal(s.wave,1);assert.ok(s.enemies.some(e=>e.hp>0));
});

test('warning portals defer close arrivals instead of spawning on top of the player',()=>{
  const s=arena(0,20);s.nextSpawn=10;s.spawnWarnings.push({id:900,kind:'macabro',x:0,z:20,y:0,remaining:.01,total:1.25});
  step(s,{},.05);assert.equal(s.enemies.length,0);assert.equal(s.spawnWarnings.length,0);assert.equal(s.pending,1);
});

test('an enemy directly below a player follows the ramp route instead of idling at equal X/Z',()=>{
  const s=arena(0,-8,6),e=createEnemy(s,'macabro',{x:0,z:-8,y:0});e.attack=100;
  advance(s,1);assert.ok(Math.hypot(e.x,e.z+8)>.2,'enemy beneath bridge stayed idle');
});
