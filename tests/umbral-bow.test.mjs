import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createState,createEnemy,selectWeapon,step,fire,activateFlames,BOW} from '../public/assets/js/umbral-core.mjs';
function run(){const s=createState();s.phase='playing';s.portalUsed=true;s.health=100;s.nextWave=999;s.nextAmmoSpawn=999;s.supplies=[];Object.assign(s.player,{x:0,z:12,y:0,yaw:0,pitch:0});selectWeapon(s,4);return s;}
function advance(s,seconds,input={},dt=.01){for(let t=0;t<seconds-1e-8;t+=dt)step(s,input,Math.min(dt,seconds-t));}
function target(s,x=0,z=8,hp=100){const e=createEnemy(s,'macabro',{x,z,y:0});e.speed=0;e.attack=999;e.hp=hp;return e;}

test('slot 5 selects a bow without activating the special power',()=>{
  const s=run();assert.equal(s.selected,4);assert.equal(s.flameRemaining,0);
  activateFlames(s);assert.equal(s.selected,4);assert.equal(s.flameRemaining,1);
});
test('R is the only flame input; HUD shows the equipped weapon and number keys still switch',()=>{
  const js=readFileSync(new URL('../public/assets/js/umbral-demo.js',import.meta.url),'utf8');
  const view=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(js,/e\.code==='KeyR'/);assert.doesNotMatch(js,/e\.code==='Digit5'|on\(\$\('umbralFlames'\),'click'/);
  assert.match(view,/<span id="umbralFlames"/);assert.doesNotMatch(view,/data-weapon=/);
  assert.match(view,/id="umbralWeaponIcon"/);assert.match(js,/selectWeapon\(s,Number\(e.key\)-1\)/);
});
test('held primary fires only once; releasing and pressing again produces a second instant trail',()=>{
  const s=run();advance(s,1,{primary:true});assert.equal(s.shotSerial,1);assert.equal(s.ammo.large,23);
  advance(s,.02);advance(s,.05,{primary:true});assert.equal(s.shotSerial,2);assert.equal(s.ammo.large,22);
  assert.equal(s.events.filter(e=>e.type==='bowTrail').length,2);assert.equal(s.projectiles.length,0);
});
test('pointer-down fire followed by held simulation input never duplicates the shot',()=>{
  const s=run();fire(s);advance(s,1,{primary:true});assert.equal(s.shotSerial,1);
});
test('orange trail immediately hits only the first enemy; its burn cannot farm R flame ammo',()=>{
  const s=run(),e=target(s),far=target(s,0,3);fire(s);assert.equal(e.hp,25);
  assert.ok(e.arrowBurnRemaining>0);assert.equal(e.flameMarked,false);assert.equal(s.projectiles.length,0);
  const trail=s.events.find(e=>e.type==='bowTrail');assert.equal(trail.secondary,false);assert.ok(trail.tz>e.z&&trail.tz<e.z+e.radius+.11);
  advance(s,2);assert.ok(e.hp<=0);assert.equal(far.hp,100);assert.equal(s.drops.length,0);assert.equal(s.kills,1);
});
test('purple trail immediately deals heavy area damage and consumes three large rounds',()=>{
  const s=run(),direct=target(s,0,8,330),near=target(s,2,8,330),far=target(s,9,8,330);
  fire(s,true);assert.equal(s.ammo.large,21);assert.equal(direct.hp,70);assert.ok(near.hp<330);assert.equal(far.hp,330);
  assert.equal(s.projectiles.length,0);assert.equal(s.events.find(e=>e.type==='bowTrail').secondary,true);
  assert.equal(s.events.filter(e=>e.type==='bowExplosion').length,1);
});
test('secondary has exactly three seconds of cooldown across weapon switches; primary is still usable',()=>{
  const s=run();fire(s,true);assert.equal(s.bowSecondaryCooldown,3);
  advance(s,BOW.nockDuration+.01);assert.equal(fire(s),true);
  selectWeapon(s,2);advance(s,.5);selectWeapon(s,4);assert.equal(fire(s,true),false);
  advance(s,3-s.time-.01);assert.equal(fire(s,true),false);
  advance(s,.01);assert.equal(fire(s,true),true);
});
test('holding secondary cannot queue automatic explosions when the cooldown finishes',()=>{
  const s=run();advance(s,7,{secondary:true});assert.equal(s.shotSerial,1);
  advance(s,.01);advance(s,.01,{secondary:true});assert.equal(s.shotSerial,2);
});
test('instant trails and blasts stop at the tall pillar and cannot hit through it',()=>{
  for(const secondary of [false,true]){
    const s=run();s.player.x=7;const e=target(s,7,4.6,330);fire(s,secondary);
    assert.equal(e.hp,330);assert.equal(s.projectiles.length,0);
    assert.ok(s.events.some(e=>e.type===(secondary?'bowExplosion':'impact')));
    assert.ok(s.events.find(e=>e.type==='bowTrail').tz>e.z);
  }
});
test('insufficient shared reserve causes no trail, damage, recovery or explosive cooldown',()=>{
  const s=run();s.ammo.large=2;assert.equal(fire(s,true),false);assert.equal(s.ammo.large,2);assert.equal(s.bowSecondaryCooldown,0);assert.equal(s.projectiles.length,0);
  s.cooldown=0;s.ammo.large=0;assert.equal(fire(s),false);assert.equal(s.bowRecoveryRemaining,0);
  assert.equal(s.events.some(e=>e.type==='bowTrail'||e.type==='bowExplosion'),false);
});
test('pause freezes nocking and explosive cooldown; new run resets all',()=>{
  const s=run();fire(s,true);advance(s,.05);s.phase='paused';const before=structuredClone(s);advance(s,5);assert.deepEqual(s,before);
  const fresh=createState();assert.equal(fresh.bowRecoveryRemaining,0);assert.equal(fresh.bowSecondaryCooldown,0);assert.equal(fresh.projectiles.length,0);
});
test('instant trails also fire in the safe entrance without hurting the player',()=>{
  const s=createState();s.phase='playing';selectWeapon(s,4);fire(s,true);advance(s,.1);
  assert.ok(s.events.find(e=>e.type==='bowTrail').tz<s.player.z);assert.equal(s.projectiles.length,0);assert.equal(s.health,5);
});

test('pitched trails hit elevated enemies only when aimed at their height',()=>{
  for(const pitch of [0,Math.atan2(4,10)]){
    const s=run(),e=target(s,0,2);e.y=4;s.player.pitch=pitch;fire(s);
    assert.equal(e.hp,pitch?25:100);
    const trail=s.events.find(e=>e.type==='bowTrail');
    if(pitch)assert.ok(trail.ty>4&&trail.ty<6.6);
  }
});

test('a distant enemy is damaged in the firing call without simulation time or a traveling arrow',()=>{
  const s=run(),e=target(s,0,-12);fire(s);
  assert.equal(s.time,0);assert.equal(e.hp,25);assert.equal(s.projectiles.length,0);
});
