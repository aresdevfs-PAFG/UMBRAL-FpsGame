import test from 'node:test';
import assert from 'node:assert/strict';
import {createBossDemoState} from '../public/assets/js/umbral-boss-demo.mjs';
import {createEnemy,step,fire,hitEnemy,damagePlayer,selectWeapon,setRifleScope,activateFlames,activateMacuahuitl,activateDual} from '../public/assets/js/umbral-core.mjs';
import {getArena} from '../public/assets/js/umbral-arena.mjs';
import {MADRE} from '../public/assets/js/umbral-madre.mjs';

function setup(){const s=createBossDemoState('madre');s.phase='playing';s.enemies[0].attack=Infinity;return s;}
function tick(s,seconds,hz=60,input={}){for(let i=0;i<Math.ceil(seconds*hz);i++)step(s,input,1/hz);}
function aim(s,target){const p=s.player,dx=target.x-p.x,dz=target.z-p.z;p.yaw=Math.atan2(-dx,-dz);p.pitch=Math.atan2(target.y-p.y-1.6,Math.hypot(dx,dz));}
function walkIntoWater(s,hz){
 s.player.yaw=0;
 for(let i=0;i<hz*3&&!s.motherCapture;i++)step(s,{forward:1},1/hz);
 assert.ok(s.motherCapture,'walking off the southern bank starts the real capture');
 assert.equal(s.riverImmersed,true);
}

test('real step captures a fall for exactly 60 health, freezes other damage and returns with controls unlocked',()=>{
 for(const hz of [20,60,120]){
  const s=setup();walkIntoWater(s,hz);const position={x:s.player.x,y:s.player.y,z:s.player.z},returnTo={...s.motherCapture.returnTo};
  const ammo={...s.ammo};assert.equal(s.health,100);assert.equal(s.shield,100);
  s.projectiles.push({id:998,owner:999,kind:'madre-wave',x:s.player.x,y:s.player.y+1,z:s.player.z,dx:0,dy:0,dz:0,gravity:0,life:3,age:0,radius:.65,damage:25});
  s.hazards.push({id:997,owner:999,kind:'madre-hands',x:s.player.x,y:s.player.y,z:s.player.z,age:2,warning:1,duration:10,radius:2,damage:28});
  const frozenProjectile=JSON.stringify(s.projectiles),frozenHazards=JSON.stringify(s.hazards);
  assert.equal(fire(s),false);assert.equal(selectWeapon(s,2),false);assert.equal(setRifleScope(s,true),false);
  assert.equal(activateFlames(s),false);assert.equal(activateMacuahuitl(s),false);assert.equal(activateDual(s),false);
  damagePlayer(s,500);damagePlayer(s,500,{bypassShield:true});assert.equal(s.health,100);assert.equal(s.shield,100);
  while(s.motherCapture?.phase==='rush')step(s,{forward:1,strafe:1,jump:true,primary:true,secondary:true},1/hz);
  assert.equal(s.motherCapture.phase,'embrace');assert.equal(s.health,100);assert.equal(s.phase,'playing');
  assert.equal(s.events.filter(e=>e.type==='motherScreamer').length,1);
  assert.deepEqual({x:s.player.x,y:s.player.y,z:s.player.z},position);
  assert.equal(JSON.stringify(s.projectiles),frozenProjectile);assert.equal(JSON.stringify(s.hazards),frozenHazards);
  while(s.motherCapture)step(s,{forward:1,strafe:1,jump:true,primary:true,secondary:true},1/hz);
  assert.equal(s.health,40);assert.equal(s.shield,100);assert.deepEqual(s.ammo,ammo);
  assert.deepEqual({x:s.player.x,y:s.player.y,z:s.player.z},returnTo);assert.equal(s.player.vy,0);assert.equal(s.riverImmersed,false);
  const a=getArena('rio');assert.ok(!a.solid(s.player.x,s.player.z,.36,s.player.y,1.75));
  for(const dx of [-.55,.55])for(const dz of [-.55,.55])assert.equal(a.groundHeight(s.player.x+dx,s.player.z+dz),5);
  assert.equal(s.events.filter(e=>e.type==='pain').length,1);
  s.projectiles=[];s.hazards=[];const x=s.player.x;tick(s,.15,hz,{strafe:1});assert.ok(s.player.x>x);
  assert.ok(selectWeapon(s,2));aim(s,{x:s.player.x,y:s.player.y+20,z:s.player.z-20});assert.ok(fire(s));assert.ok(s.ammo.obsidian<ammo.obsidian);
  assert.equal(s.health,40);assert.equal(s.shield,100);
 }
});
test('real lethal capture preserves the screamer until the final hit, with no relocation or revival',()=>{
 for(const hp of [1,60]){
  const s=setup();s.health=hp;walkIntoWater(s,60);const p={x:s.player.x,y:s.player.y,z:s.player.z};
  while(s.motherCapture?.phase==='rush')step(s,{},1/60);
  assert.equal(s.events.filter(e=>e.type==='motherScreamer').length,1);assert.equal(s.phase,'playing');assert.equal(s.health,hp);
  tick(s,.8);assert.equal(s.phase,'playing');assert.equal(s.health,hp);
  while(s.motherCapture&&s.phase==='playing')step(s,{},1/60);
  assert.equal(s.phase,'dead');assert.equal(s.health,0);assert.equal(s.shield,100);assert.equal(s.motherCapture,null);
  assert.deepEqual({x:s.player.x,y:s.player.y,z:s.player.z},p);assert.equal(s.events.filter(e=>e.type==='death').length,1);
  tick(s,3);assert.equal(s.health,0);assert.deepEqual({x:s.player.x,y:s.player.y,z:s.player.z},p);
 }
});
test('real pause freezes the entire capture and a fresh demo starts with no old capture or cooldown',()=>{
 const s=setup();walkIntoWater(s,60);tick(s,.2);s.phase='paused';const before=JSON.stringify(s);
 tick(s,4,60,{forward:1,primary:true});assert.equal(JSON.stringify(s),before);
 s.phase='playing';while(s.motherCapture)step(s,{},1/60);assert.equal(s.health,40);
 const fresh=createBossDemoState('madre');assert.equal(fresh.health,100);assert.ok(!fresh.motherCapture);assert.ok(!fresh.motherCaptureAfter);assert.equal(fresh.enemies[0].waterState,'submerged');
});
test('real central waves hit a stationary player, can be strafed, and collide with cover',()=>{
 for(const hz of [20,60,120])for(const mode of ['stationary','strafe','cover']){
  const s=setup();let e=s.enemies[0];
  if(mode==='cover'){
   s.enemies=[];Object.assign(s.player,{x:5,y:5,z:1,yaw:0,pitch:0});e=createEnemy(s,'madre',{x:6,y:5,z:-15});
  }
  hitEnemy(s,e,1,'weapon',e.waterLevel+.8);tick(s,1,hz);
  e.attack=0;e.attacks=0;e.dragAt=Infinity;
  let launched=false;
  for(let i=0;i<hz*3;i++){
   step(s,mode==='strafe'&&launched?{strafe:1}:{},1/hz);
   if(s.projectiles.some(p=>p.kind==='madre-wave'))launched=true;
  }
  assert.ok(launched);assert.equal(s.health,100);assert.equal(s.shield,mode==='stationary'?75:100);
  if(mode==='cover')assert.ok(s.events.some(e=>e.type==='impact'&&e.kind==='madre-wave'));
 }
});
test('head shots trigger one reactive guardian with every ranged weapon, including sniper, solar piercing and bow explosion',()=>{
 for(const [selected,mode] of [[1,'primary'],[1,'secondary'],[2,'primary'],[2,'sniper'],[3,'primary'],[3,'dual'],[4,'primary'],[4,'secondary'],[5,'primary'],[5,'secondary']]){
  const s=setup();s.selected=selected;
  step(s,{},.001);const e=s.enemies[0];
  assert.equal(e.motherGuardianReserve,8);assert.deepEqual(e.motherGuardians,[]);
  aim(s,{x:e.x,y:e.waterLevel+.8,z:e.z});
  if(mode==='sniper')assert.ok(setRifleScope(s,true));
  if(mode==='dual')assert.ok(activateDual(s));
  const hp=e.hp,kills=s.kills,drops=s.drops.length;assert.ok(fire(s,mode==='secondary'));
  const interception=s.events.filter(event=>event.type==='motherGuardianIntercept');
  assert.equal(interception.length,1,`${selected} ${mode} consumes one guardian per trigger`);
  assert.equal(e.motherGuardianReserve,7);assert.equal(e.motherGuardians.length,1);assert.equal(e.hp,hp);assert.equal(e.waterState,'submerged');assert.equal(s.kills,kills);assert.equal(s.drops.length,drops);
  if(mode==='secondary'&&selected===4)assert.ok(s.events.some(event=>event.type==='bowExplosion'));
  if(selected===5){const trace=s.events.findLast(event=>event.type==='trace');assert.ok(Math.hypot(trace.tx-s.player.x,trace.tz-s.player.z)<Math.hypot(e.x-s.player.x,e.z-s.player.z));}
 }
});
test('eight real head shots exhaust the invisible reserve and the ninth makes the Mother emerge',()=>{
 const s=setup();s.selected=2;step(s,{},.001);const e=s.enemies[0];
 for(let i=0;i<8;i++){
  aim(s,{x:e.x,y:e.waterLevel+.8,z:e.z});assert.ok(fire(s));
  assert.equal(e.hp,e.maxHp);assert.equal(e.waterState,'submerged');assert.equal(e.motherGuardianReserve,7-i);tick(s,.35);
  assert.deepEqual(e.motherGuardians,[],'interception sprites disappear after shattering');
 }
 assert.equal(e.motherGuardianReserve,0);assert.equal(s.kills,0);assert.equal(s.drops.length,0);
 assert.equal(s.events.filter(e=>e.type==='motherGuardianIntercept').length,8);
 aim(s,{x:e.x,y:e.waterLevel+.8,z:e.z});assert.ok(fire(s));assert.equal(e.hp,e.maxHp-19);assert.equal(e.waterState,'rising');
 tick(s,MADRE.riseDuration+.05);assert.equal(e.waterState,'airborne');assert.equal(e.motherGuardians.length,0);
});
test('an immediate first mouse shot initializes the reactive defense before any simulation step',()=>{
 const s=setup(),e=s.enemies[0];s.selected=2;aim(s,{x:e.x,y:e.waterLevel+.8,z:e.z});
 assert.ok(fire(s));assert.equal(e.hp,e.maxHp);assert.equal(e.waterState,'submerged');assert.equal(e.motherGuardianReserve,7);
 assert.equal(s.events.filter(event=>event.type==='motherGuardianIntercept').length,1);
 tick(s,.4);assert.deepEqual(e.motherGuardians,[]);assert.equal(e.motherGuardianReserve,7);
});
test('misses, a wall or a nearer enemy never summon or consume a head defender',()=>{
 for(const mode of ['miss','underwater','wall','nearer-enemy']){
  const s=setup();s.selected=2;let e=s.enemies[0],front=null;
  if(mode==='wall'){
   s.enemies=[];Object.assign(s.player,{x:5,y:5,z:1,yaw:0,pitch:0});e=createEnemy(s,'madre',{x:6,y:5,z:-15});
  }
  step(s,{},.001);
  if(mode==='nearer-enemy')front=createEnemy(s,'macabro',{x:0,y:5,z:24});
  aim(s,mode==='miss'?{x:e.x+15,y:e.waterLevel+15,z:e.z}:{x:e.x,y:e.waterLevel+(mode==='underwater'?-2:.8),z:e.z});
  const hp=e.hp;assert.ok(fire(s));assert.equal(e.hp,hp);assert.equal(e.motherGuardianReserve,8);assert.deepEqual(e.motherGuardians,[]);
  assert.ok(!s.events.some(event=>event.type==='motherGuardianIntercept'));
  if(front)assert.ok(front.hp<front.maxHp);
 }
});
test('all sixteen pellets of the last guarded shotgun trigger are absorbed before a later trigger can wake her',()=>{
 const s=setup();s.selected=2;step(s,{},.001);const e=s.enemies[0];
 for(let i=0;i<7;i++){aim(s,{x:e.x,y:e.waterLevel+.8,z:e.z});assert.ok(fire(s));tick(s,.14);}
 assert.equal(e.motherGuardianReserve,1);assert.ok(selectWeapon(s,1));aim(s,{x:e.x,y:e.waterLevel+.8,z:e.z});assert.ok(fire(s,true));
 assert.equal(e.motherGuardianReserve,0);assert.equal(e.hp,e.maxHp);assert.equal(e.waterState,'submerged');
 assert.equal(s.events.filter(event=>event.type==='motherGuardianIntercept').length,8);
 tick(s,1.4);assert.ok(selectWeapon(s,2));aim(s,{x:e.x,y:e.waterLevel+.8,z:e.z});assert.ok(fire(s));
 assert.equal(e.hp,e.maxHp-19);assert.equal(e.waterState,'rising');
});
