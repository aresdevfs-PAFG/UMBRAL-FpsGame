import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorialState,updateTutorial,tutorialGuide,onboardingChoice,createTutorialPreferences} from '../public/assets/js/umbral-tutorial.mjs';
import {step,fire,selectWeapon,activateFlames,activateMacuahuitl,setRifleScope,damagePlayer,hitEnemy} from '../public/assets/js/umbral-core.mjs';
import {getArena,chooseMap} from '../public/assets/js/umbral-arena.mjs';
import {createBossDemoState,continueBossDemo} from '../public/assets/js/umbral-boss-demo.mjs';

function run(){const s=createTutorialState();s.phase='playing';return s;}
function advance(s,seconds,input={}){for(let t=0;t<seconds-1e-9;t+=.02){step(s,input,Math.min(.02,seconds-t));updateTutorial(s,s.events);s.events=[];}}
function observe(s){updateTutorial(s,s.events);s.events=[];}
function aim(s,e,range=2){Object.assign(s.player,{x:e.x,z:e.z+range,y:e.y,yaw:0,pitch:0,vy:0,flight:null});}
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};

test('new players go to practice; experienced players may accept or skip it',()=>{
  assert.equal(onboardingChoice('experience',false),'tutorial');
  assert.equal(onboardingChoice('experience',true),'offer');
  assert.equal(onboardingChoice('offer',true),'tutorial');
  assert.equal(onboardingChoice('offer',false),'game');
});

test('practice targets stay still and respawn without waves or damage for two minutes',()=>{
  const s=run(),positions=s.enemies.map(e=>[e.x,e.z]);
  damagePlayer(s,10000);assert.equal(s.health,70);
  advance(s,120);assert.equal(s.health,70);assert.equal(s.wave,0);assert.equal(s.projectiles.length,0);assert.equal(s.enemies.length,3);
  assert.deepEqual(s.enemies.map(e=>[e.x,e.z]),positions);
  s.enemies.forEach(e=>hitEnemy(s,e,1000));observe(s);advance(s,3);
  assert.equal(s.enemies.filter(e=>e.hp>0).length,3);assert.equal(s.pending,0);assert.equal(s.wave,0);
  advance(s,10);assert.equal(s.enemies.length,3);assert.equal(s.phase,'playing');
  for(let value=0;value<=1;value+=.01)assert.notEqual(chooseMap(value),'tutorial');
});

test('guide can be completed using real movement, hits, scope, burn loot and sacrifice drops',()=>{
  const s=run();s.player.yaw=.2;advance(s,.9,{forward:1,jump:true});advance(s,.7);
  assert.equal(s.training.stage,1);
  for(let i=0;i<6;i++){
    advance(s,3);const e=s.enemies.find(e=>e.hp>0);aim(s,e);selectWeapon(s,i);
    assert.equal(fire(s),true);observe(s);assert.ok(s.training.weapons.includes(i),'weapon '+i);
  }
  assert.equal(s.training.stage,2);
  advance(s,3);selectWeapon(s,2);setRifleScope(s,true);assert.equal(fire(s),true);observe(s);
  advance(s,3);selectWeapon(s,4);assert.equal(fire(s,true),true);observe(s);
  assert.equal(s.training.stage,3);
  advance(s,4);let e=s.enemies.find(e=>e.hp>0);aim(s,e,3);activateFlames(s);advance(s,1.1);
  // Any weapon can finish a flame-marked target; the orange bow alone must not earn the lesson.
  selectWeapon(s,5);fire(s);observe(s);advance(s,.5);
  const ammo=s.drops.find(d=>d.source==='burn');assert.ok(ammo);Object.assign(s.player,{x:ammo.x,z:ammo.z,y:0});advance(s,1);
  assert.equal(s.training.burnLoot,true);assert.equal(s.training.stage,4);
  advance(s,3);e=s.enemies.find(e=>e.hp>0);aim(s,e);assert.equal(activateMacuahuitl(s),true);advance(s,.7);
  const blood=s.drops.find(d=>d.source==='sacrifice');assert.ok(blood);Object.assign(s.player,{x:blood.x,z:blood.z,y:0});advance(s,.8);
  assert.equal(s.training.completed,true);assert.ok(s.health>70);assert.equal(tutorialGuide(s).title,'Práctica libre');
  s.training.offered=true;assert.equal(updateTutorial(s,[]),false,'completion only opens the choice once');
});

test('missing hits or arena supplies never complete combat lessons, and supplies cannot run out',()=>{
  const s=run();s.player.yaw=Math.PI;fire(s);observe(s);assert.equal(s.training.weapons.length,0);
  updateTutorial(s,[{type:'pickup',kind:'ammo',source:'arena'},{type:'hit',source:'arrowBurn',weaponIndex:4}]);
  assert.equal(s.training.burnLoot,false);assert.equal(s.training.weapons.length,0);
  Object.keys(s.ammo).forEach(k=>s.ammo[k]=0);observe(s);assert.ok(Object.values(s.ammo).every(n=>n>10));
});

test('small courtyard supports the jump pad and the ramp back at 20, 60 and 120 Hz',()=>{
  const arena=getArena('tutorial'),pad=arena.PADS[0];
  for(const hz of [20,60,120]){
    const s=run();Object.assign(s.player,{x:pad.x,z:pad.z,y:pad.y});
    for(let i=0;i<hz*3;i++)step(s,{},1/hz);
    assert.ok(Math.hypot(s.player.x-pad.to.x,s.player.z-pad.to.z)<.35);
    assert.ok(Math.abs(s.player.y-pad.to.y)<.05);assert.equal(s.player.grounded,true);
    Object.assign(s.player,{x:10,z:-4,y:2});
    for(let i=0;i<hz*2;i++)step(s,{forward:-1},1/hz);
    assert.equal(s.player.y,0);assert.ok(s.player.z>5);
  }
});

test('Titan demo starts directly at wave 10 with full equipment and a 6250/6250 boss',()=>{
  const s=createBossDemoState(),boss=s.enemies[0];
  assert.equal(s.mode,'boss-demo');assert.equal(s.mapId,'titan-demo');assert.equal(s.training,undefined);
  assert.equal(s.phase,'ready');assert.equal(s.wave,10);assert.equal(s.clearedWave,9);
  assert.equal(s.portalUsed,true);assert.equal(s.health,100);assert.equal(s.shield,100);
  assert.deepEqual(s.ammo,{small:240,large:180,obsidian:480,thorns:600});
  assert.equal(s.enemies.length,1);assert.equal(boss.kind,'titan');assert.equal(boss.hp,6250);assert.equal(boss.shield,6250);
  assert.equal(s.pending,0);assert.equal(s.bossPending,false);assert.equal(s.bossSpawned,true);
  assert.equal(getArena(s.mapId).practice,true);
  for(let i=0;i<=100;i++)assert.ok(['cuenca','corona','rio'].includes(chooseMap(i/100)),'normal games never select either practice arena');
});

test('Titan arena has supported spawns and supplies, and a traversable approach to the boss',()=>{
  const s=createBossDemoState(),a=getArena(s.mapId),boss=s.enemies[0];
  for(const p of [s.player,boss,...a.SPAWNS,...a.SUPPLIES,a.FINISH_POINT]){
    assert.ok(Math.abs(a.groundHeight(p.x,p.z,p.y+.4)-p.y)<.01,JSON.stringify(p));
    assert.equal(a.solid(p.x,p.z,p.radius||.32,p.y,p.height||1.75),false);
  }
  assert.ok(a.navigationPath(boss,s.player).length>0);
  assert.ok(a.navigationPath(s.player,a.FINISH_POINT).length>0);
  assert.ok(a.PADS.length>0);assert.ok(a.SURFACES.some(p=>p.ramp));
  assert.equal(a.groundHeight(18,-22),-Infinity,'open edge allows the recovery mechanic');
  s.phase='playing';boss.trainingDummy=true;
  advance(s,1,{forward:1});assert.ok(s.player.z<10);assert.equal(s.player.y,0);
});

function finishDemo(){
  const s=createBossDemoState();s.phase='playing';const boss=s.enemies[0];
  hitEnemy(s,boss,12500);assert.equal(boss.downed,true);
  aim(s,boss,2.4);s.player.grounded=true;s.macuahuitlCooldown=8;
  assert.equal(activateMacuahuitl(s),true);
  advance(s,3.1);assert.equal(s.phase,'boss-demo-complete');
  return s;
}

test('mandatory remate completes the demo; repeat is fresh and continuation opens wave 11',()=>{
  const s=finishDemo();
  assert.equal(s.wave,10);assert.equal(s.clearedWave,10);assert.equal(s.kills,1);
  assert.ok(s.enemies.find(e=>e.kind==='titan').finished);assert.equal(s.bossFinish,null);
  advance(s,6);assert.equal(s.wave,10,'completion waits for the explicit choice');
  const repeated=createBossDemoState();
  assert.equal(repeated.health,100);assert.equal(repeated.shield,100);assert.equal(repeated.kills,0);assert.equal(repeated.time,0);
  assert.equal(repeated.enemies.length,1);assert.equal(repeated.enemies[0].shield,6250);assert.equal(repeated.enemies[0].hp,6250);
  assert.equal(repeated.bossFinish,null);assert.equal(repeated.projectiles.length,0);assert.equal(repeated.spawnWarnings.length,0);
  assert.equal(continueBossDemo(repeated),false,'active encounters cannot skip to wave 11');
  assert.equal(continueBossDemo(s),true);assert.equal(s.mode,'boss-demo');assert.equal(s.phase,'playing');
  advance(s,.1);assert.equal(s.wave,11);assert.equal(s.bossPending,false);
  assert.equal(s.enemies.filter(e=>e.kind==='titan'&&e.hp>0).length,0);
  assert.equal(continueBossDemo(s),false,'the transition cannot be replayed');
});

