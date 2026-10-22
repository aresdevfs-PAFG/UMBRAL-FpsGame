import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createState,createEnemy,hitEnemy,step,activateMacuahuitl,activateFlames} from '../public/assets/js/umbral-core.mjs';
import {DESOLLADOR,bossForMap,updateDesollador,desolladorPose} from '../public/assets/js/umbral-desollador.mjs';
import {getArena} from '../public/assets/js/umbral-arena.mjs';
import {createBossDemoState,continueBossDemo,isBossDemo} from '../public/assets/js/umbral-boss-demo.mjs';
const tick=(s,n)=>{for(let i=0;i<Math.ceil(n*60);i++)step(s,{},1/60);};
function setup(){const s=createState('corona');s.phase='playing';s.portalUsed=true;s.health=100;s.nextWave=999;s.pending=0;Object.assign(s.player,{x:5,y:0,z:24,yaw:0,pitch:0});return s;}
const boss=s=>createEnemy(s,'desollador',{x:5,y:0,z:16});
test('direct Desollador demo uses the real Corona map and resets equipment and encounter',()=>{
  const s=createBossDemoState('desollador'),e=s.enemies[0],a=getArena(s.mapId);
  assert.equal(s.mapId,'corona');assert.ok(isBossDemo(s));assert.equal(s.demoBoss,'desollador');
  assert.equal(s.phase,'ready');assert.equal(s.wave,10);assert.equal(s.pending,0);assert.equal(s.portalUsed,true);
  assert.equal(s.health,100);assert.equal(s.shield,100);assert.equal(s.enemies.length,1);assert.equal(e.kind,'desollador');assert.equal(e.hp,18000);
  assert.ok(Object.values(s.ammo).every(n=>n>=180));assert.equal(a.groundHeight(s.player.x,s.player.z),s.player.y);
  assert.ok(!a.solid(e.x,e.z,e.radius,e.y,e.height));assert.equal(continueBossDemo(s),false);
  s.health=1;s.ammo.large=0;e.hp=1;const reset=createBossDemoState(s.demoBoss);
  assert.equal(reset.mapId,'corona');assert.equal(reset.health,100);assert.equal(reset.enemies[0].hp,18000);assert.equal(reset.kills,0);
});
test('Desollador demo shows completion after death animation and waits for explicit continuation',()=>{
  const s=createBossDemoState('desollador');s.phase='playing';hitEnemy(s,s.enemies[0],20000);tick(s,1);
  assert.equal(s.phase,'playing');tick(s,2.5);assert.equal(s.phase,'boss-demo-complete');assert.equal(s.clearedWave,10);
  assert.equal(s.events.filter(e=>e.type==='bossDemoComplete').length,1);tick(s,8);assert.equal(s.wave,10);
  assert.ok(continueBossDemo(s));tick(s,.1);assert.equal(s.wave,11);assert.equal(s.mode,'boss-demo');assert.equal(s.mapId,'corona');
});
test('map-exclusive bosses: giant Desollador for Corona, Titan for Cuenca, Mother for river',()=>{
  assert.equal(bossForMap('corona'),'desollador');assert.equal(bossForMap('cuenca'),'titan');assert.equal(bossForMap('rio'),'madre');
  for(const map of ['corona','cuenca','rio']){
    const s=setup();s.mapId=map;s.wave=9;s.clearedWave=9;s.nextWave=.01;step(s,{},.02);tick(s,3);
    const bosses=s.enemies.filter(e=>e.boss);
    assert.equal(bosses.length,1);assert.equal(bosses[0].kind,bossForMap(map));assert.equal(s.enemies.length,1);
    if(map==='corona'){
      assert.equal(bosses[0].height,9.2*1.45);assert.equal(bosses[0].width,10*1.45);
      assert.equal(bosses[0].radius,.9*1.45);assert.equal(DESOLLADOR.spriteAspect,1.15);
      assert.equal(bosses[0].hp,18000);
    }
  }
});
test('blade volley is telegraphed, non-homing, and grows from three to five in phase two',()=>{
  const s=setup(),e=boss(s);e.attack=0;step(s,{},.01);assert.equal(e.cast.attack,'blades');assert.equal(s.projectiles.length,0);
  tick(s,.9);assert.equal(s.projectiles.length,3);assert.ok(s.projectiles.every(p=>p.kind==='wind-blade'&&!p.homing&&p.damage===24));
  const p=s.projectiles[0],dx=p.dx;s.player.x+=2;tick(s,.02);assert.equal(p.dx,dx);
  s.projectiles=[];hitEnemy(s,e,9000);e.exposedUntil=0;e.attack=0;e.attacks=0;step(s,{},.01);assert.equal(e.enraged,true);
  tick(s,.9);assert.equal(s.projectiles.length,5);assert.equal(s.events.filter(x=>x.type==='bossRage').length,1);
});
test('dive locks a safe landing point before launch and begins stationary sword cuts',()=>{
  const s=setup(),e=boss(s);e.attack=0;e.attacks=1;step(s,{},.01);assert.equal(e.cast.attack,'dive');
  const target={...e.cast.target};assert.ok(Number.isFinite(target.y));assert.ok(!getArena('corona').solid(target.x,target.z,e.radius,target.y,e.height));
  Object.assign(s.player,{x:10,y:0,z:27});tick(s,1.12);assert.ok(e.bossMotion);assert.deepEqual(e.bossMotion.target,target);
  tick(s,1.2);assert.equal(e.bossMotion,null);assert.ok(e.bladeStorm);assert.equal(e.exposedUntil,0);assert.equal(e.y,target.y);assert.equal(desolladorPose(e).state,'attack');
});
test('landing starts the sword sequence without adding the old instant impact damage',()=>{
  for(const [height,expected] of [[0,0],[2,0]]){
    const s=setup(),e=boss(s);Object.assign(s.player,{x:5,z:24,y:height});
    e.bossMotion={from:{x:5,y:10,z:24},target:{x:5,y:0,z:24},age:1,duration:1.01,height:10};
    let damage=0;updateDesollador(s,e,.02,(_,amount)=>damage+=amount);assert.equal(damage,expected);
  }
});
test('vortex is telegraphed, lifts over the void, pauses and returns safely on interruption',()=>{
  const s=setup(),e=boss(s);Object.assign(e,{x:13,z:24,attack:0,attacks:2});step(s,{},.01);
  assert.equal(e.cast.attack,'suction');assert.equal(e.windSuction,undefined);
  tick(s,1.32);assert.ok(e.vortexTravel);tick(s,1.7);assert.ok(e.windSuction);
  assert.equal(getArena('corona').groundHeight(e.x,e.z),-Infinity);assert.equal(e.windSuction.hp,DESOLLADOR.vortexHealth);
  const y=s.player.y;tick(s,.2);assert.ok(s.player.y>y);assert.ok(s.player.windCapture);
  s.phase='paused';const age=e.windSuction.age;step(s,{},.05);assert.equal(e.windSuction.age,age);
  s.phase='playing';hitEnemy(s,e,DESOLLADOR.vortexHealth);assert.equal(e.windSuction,null);assert.equal(s.player.windCapture.phase,'return');
  tick(s,1.7);assert.equal(s.player.windCapture,null);assert.equal(s.player.y,getArena('corona').groundHeight(s.player.x,s.player.z));
  assert.equal(s.events.filter(e=>e.type==='fallRecovery').length,0);
});
test('F interrupts the channel while R can mark the vulnerable boss',()=>{
  const s=setup(),e=boss(s);e.windSuction={age:0,phase:'lift',hp:DESOLLADOR.vortexHealth,maxHp:DESOLLADOR.vortexHealth};e.trainingDummy=true;
  Object.assign(e,{x:5,z:21.5,y:0,exposedUntil:100,attack:100,cast:null});Object.assign(s.player,{x:5,z:24,y:0});
  assert.ok(activateMacuahuitl(s));tick(s,.3);assert.ok(e.hp<18000);assert.ok(e.shockStunUntil>s.time);assert.equal(e.windSuction,null);
  tick(s,.4);assert.ok(activateFlames(s));tick(s,.4);assert.equal(e.flameMarked,true);
});
test('normal boss death clears owned attacks, plays death poses and unlocks wave 11 without Titan finisher',()=>{
  const s=setup(),e=boss(s);s.wave=10;s.clearedWave=9;s.bossSpawned=true;s.nextWave=.01;
  e.windSuction={age:0,duration:3};s.projectiles=[{owner:e.id}];s.hazards=[{owner:e.id}];
  hitEnemy(s,e,18001);assert.ok(e.hp<=0);assert.ok(!e.downed);assert.equal(s.bossFinish,null);assert.equal(e.windSuction,null);
  assert.equal(s.projectiles.length,0);assert.equal(s.hazards.length,0);assert.equal(s.kills,1);assert.equal(desolladorPose(e).state,'death');
  tick(s,4);assert.equal(s.wave,11);assert.equal(s.bossPending,false);
});
test('all boss atlas states, animated effect sheets and audio files exist',()=>{
  const root=new URL('../public/assets/img/umbral-demo/',import.meta.url),assets=JSON.parse(readFileSync(new URL('assets.json',root)));
  for(const seq of [...Object.values(assets.enemies.desollador.states),assets.effects['wind-blade'],assets.effects['wind-vortex']]){assert.equal(seq.frames,4);assert.ok(existsSync(new URL(seq.file,root)));}
  for(const name of ['arrival','presence','windup','attack','dive','suction','hurt','death'])assert.ok(existsSync(new URL('../public/assets/audio/umbral/enemies/desollador-'+name+'.mp3',import.meta.url)));
});
