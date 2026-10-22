import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,damagePlayer,step,fire,selectWeapon} from '../public/assets/js/umbral-core.mjs';

function playing(map='cuenca'){
  const s=createState(map);s.phase='playing';s.portalUsed=true;s.health=100;s.nextWave=1000;s.nextAmmoSpawn=1000;s.supplies=[];
  Object.assign(s.player,{x:0,y:0,z:24});return s;
}
function advance(s,seconds,hz=60){for(let t=0;t<seconds-1e-9;t+=1/hz)step(s,{},Math.min(1/hz,seconds-t));}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('energy Obsidiana absorbs hits, spills only excess into health, and reports a break once',()=>{
  const s=playing();damagePlayer(s,40);assert.equal(s.health,100);assert.equal(s.shield,60);
  assert.equal(s.damageFlash,0);assert.ok(s.shieldFlash>0);assert.ok(!s.events.some(e=>e.type==='pain'));
  damagePlayer(s,70);assert.equal(s.shield,0);assert.equal(s.health,90);assert.ok(s.damageFlash>0);
  damagePlayer(s,5);assert.equal(s.health,85);assert.equal(s.events.filter(e=>e.type==='shieldBreak').length,1);
});
test('one health can coexist with a full shield; the next hit after exact depletion is lethal',()=>{
  const s=playing();s.health=1;damagePlayer(s,100);
  assert.equal(s.phase,'playing');assert.equal(s.health,1);assert.equal(s.shield,0);
  damagePlayer(s,1);assert.equal(s.phase,'dead');assert.equal(s.health,0);
  damagePlayer(s,1000);assert.equal(s.events.filter(e=>e.type==='death').length,1);
  const lethal=playing();lethal.health=1;damagePlayer(lethal,101);assert.equal(lethal.phase,'dead');
});
test('5 second delay then 20 per second, independent of frame rate and remaining health',()=>{
  for(const map of ['cuenca','corona'])for(const hz of [20,60,120]){
    const s=playing(map);s.health=1;damagePlayer(s,100);
    advance(s,4.99,hz);near(s.shield,0);advance(s,.025,hz);near(s.shield,.3);
    advance(s,.985,hz);near(s.shield,20);advance(s,5,hz);assert.equal(s.shield,100);assert.equal(s.health,1);
  }
});
test('new damage interrupts regeneration and restarts the full delay, even when empty',()=>{
  const s=playing();damagePlayer(s,100);advance(s,6);near(s.shield,20);
  damagePlayer(s,25);near(s.shield,0);near(s.health,95);
  advance(s,4);damagePlayer(s,1);near(s.health,94);advance(s,4.99);near(s.shield,0);
  advance(s,1.01);near(s.shield,20);
});
test('invalid damage, safe entrance, paused and dead states cannot consume or recharge shield',()=>{
  const s=playing();damagePlayer(s,20);advance(s,1);
  const before=structuredClone(s);for(const amount of [0,-5,NaN,Infinity])damagePlayer(s,amount);assert.deepEqual(s,before);
  for(const phase of ['paused','dead','ready']){s.phase=phase;const snapshot=structuredClone(s);advance(s,20);damagePlayer(s,10);assert.deepEqual(s,snapshot);}
  s.phase='playing';advance(s,3.99);near(s.shield,80);advance(s,1.01);near(s.shield,100);
  const entrance=createState();entrance.phase='playing';damagePlayer(entrance,999);assert.equal(entrance.health,5);assert.equal(entrance.shield,100);
});
test('health and obsidian ammunition pickups never refill the shield; shooting never consumes it',()=>{
  const s=playing();damagePlayer(s,150);assert.equal(s.health,50);
  const ammo=s.ammo.obsidian;s.supplies=[{id:1,kind:'ammo',ammoType:'obsidian',x:0,z:24,y:0,cooldown:0}];
  step(s,{},.01);assert.ok(s.ammo.obsidian>=ammo+10&&s.ammo.obsidian<=ammo+18);assert.equal(s.shield,0);
  s.supplies=[{id:2,kind:'health',x:0,z:24,y:0,cooldown:0}];step(s,{},.01);assert.equal(s.health,75);assert.equal(s.shield,0);
  advance(s,6);near(s.shield,20.4);const reserve=s.ammo.obsidian,shield=s.shield;
  selectWeapon(s,2);assert.equal(fire(s),true);assert.equal(s.ammo.obsidian,reserve-1);assert.equal(s.shield,shield);
});
test('projectiles and terrain damage use the same shield and block regeneration on an impact frame',()=>{
  const s=playing();damagePlayer(s,50);advance(s,5.1);near(s.shield,52);
  s.projectiles.push({id:999,kind:'blood-projectile',x:0,z:24,y:1,dx:0,dz:0,dy:0,speed:0,gravity:0,homing:false,age:0,life:2,radius:.18,damage:8});
  step(s,{},.05);near(s.shield,44);assert.equal(s.health,100);advance(s,4.99);near(s.shield,44);
  const fall=playing('corona');fall.player.x=5;step(fall,{},.01);damagePlayer(fall,90);fall.player.x=0;fall.player.z=0;
  advance(fall,1.4);assert.equal(fall.shield,0);assert.equal(fall.health,95);
});
test('a retry starts with 100 shield and clears damage and regeneration timers',()=>{
  const old=playing();damagePlayer(old,1000);assert.equal(old.phase,'dead');
  const fresh=createState('corona');assert.equal(fresh.health,5);assert.equal(fresh.shield,100);assert.equal(fresh.shieldRegenAt,0);assert.equal(fresh.shieldFlash,0);
});
