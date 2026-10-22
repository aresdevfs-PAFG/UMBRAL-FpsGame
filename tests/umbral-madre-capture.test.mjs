import test from 'node:test';
import assert from 'node:assert/strict';
import {createBossDemoState} from '../public/assets/js/umbral-boss-demo.mjs';
import {getArena} from '../public/assets/js/umbral-arena.mjs';
import {MADRE,motherCaptureLocked,updateMotherCapture,clearMotherEncounter,updateMadre,beginMotherDrag,madrePose} from '../public/assets/js/umbral-madre.mjs';

function setup(){
 const s=createBossDemoState('madre');s.phase='playing';s.riverImmersed=true;
 Object.assign(s.player,{x:0,y:4.8,z:21.5,vy:-3,safe:{x:0,y:5,z:26}});
 return s;
}
function damageLog(s){
 const calls=[];
 const damage=(state,amount,options)=>{
  assert.equal(state,s);calls.push({amount,options,time:s.time,phase:s.motherCapture?.phase});
  state.health=Math.max(0,state.health-amount);if(!state.health)state.phase='dead';
 };
 return {calls,damage};
}
function advance(s,seconds,hz,damage){
 for(let i=0;i<Math.ceil(seconds*hz);i++){s.time+=1/hz;updateMotherCapture(s,1/hz,damage);}
}
test('fall triggers a fast rush then a full one-second embrace before one 60-health hit',()=>{
 for(const hz of [20,60,120]){
  const s=setup(),e=s.enemies[0],{calls,damage}=damageLog(s),player={...s.player};
  s.shield=73;assert.equal(updateMotherCapture(s,0,damage),true);assert.ok(motherCaptureLocked(s));
  assert.equal(s.motherCapture.phase,'rush');assert.equal(e.waterState,'capturing');
  const initial=structuredClone(s.motherCapture);
  advance(s,.2,hz,damage);assert.equal(calls.length,0);assert.notDeepEqual(s.motherCapture.position,initial.position);
  assert.equal(s.player.x,player.x);assert.equal(s.player.y,player.y);assert.equal(s.player.z,player.z);
  advance(s,.3,hz,damage);assert.equal(s.motherCapture.phase,'embrace');assert.equal(calls.length,0);
  assert.equal(s.events.filter(e=>e.type==='motherScreamer').length,1);
  assert.equal(madrePose(e,s).state,'hands');
  advance(s,.8,hz,damage);assert.equal(calls.length,0);assert.ok(motherCaptureLocked(s));
  advance(s,.2,hz,damage);assert.equal(calls.length,1);assert.equal(calls[0].amount,60);
  assert.deepEqual(calls[0].options,{bypassShield:true,motherCapture:true});assert.equal(calls[0].phase,'embrace');
  assert.ok(calls[0].time>=MADRE.captureRush+MADRE.captureEmbrace-1e-8);
  assert.equal(s.health,40);assert.equal(s.shield,73);assert.equal(s.motherCapture,null);
  assert.equal(s.player.y,5);assert.equal(s.player.vy,0);assert.equal(s.player.grounded,true);assert.equal(s.riverImmersed,false);
  assert.equal(e.waterState,'submerged');assert.ok(getArena('rio').groundHeight(e.x,e.z)<5);
  assert.equal(s.events.filter(e=>e.type==='motherCaptureStart').length,1);
  assert.equal(s.events.filter(e=>e.type==='motherCaptureEnd').length,1);
  advance(s,.5,hz,damage);assert.equal(calls.length,1);
 }
});
test('capture cancels active boss attacks and powers without refunding spent cooldowns',()=>{
 const s=setup(),e=s.enemies[0],{damage}=damageLog(s);
 Object.assign(e,{waterState:'airborne',cast:{attack:'wave'},attack:0});s.player.y=5;beginMotherDrag(s,e);s.player.y=4.8;
 s.projectiles=[{owner:e.id},{owner:999}];s.hazards=[{owner:e.id},{owner:999}];
 Object.assign(s,{rifleScoped:true,flameRemaining:.6,smgDualRemaining:3,macuahuitlRemaining:.3,macuahuitlSpent:true,macuahuitlQueued:true});
 updateMotherCapture(s,0,damage);
 assert.equal(s.motherDrag,null);assert.equal(e.cast,null);assert.equal(s.rifleScoped,false);
 assert.equal(s.flameRemaining,0);assert.equal(s.smgDualRemaining,0);assert.equal(s.macuahuitlRemaining,0);assert.equal(s.macuahuitlQueued,false);
 assert.equal(s.flameCooldown,8);assert.equal(s.smgDualCooldown,7);assert.equal(s.macuahuitlCooldown,8);
 assert.deepEqual(s.projectiles,[{owner:999}]);assert.deepEqual(s.hazards,[{owner:999}]);
 const before=JSON.stringify(e);updateMadre(s,e,4);assert.equal(JSON.stringify(e),before);
});
test('return fallback rejects water, ledges, pillars and launch seals and uses a full dry footprint',()=>{
 for(const safe of [null,{x:0,y:0,z:18},{x:0,y:5,z:22.1},{x:-31,y:5,z:4},{x:27,y:5,z:11}]){
  const s=setup(),e=s.enemies[0],a=getArena('rio'),{damage}=damageLog(s);s.player.safe=safe;
  updateMotherCapture(s,0,damage);const q=s.motherCapture.returnTo;
  assert.ok(q);assert.ok(q.y>=5);assert.ok(!a.solid(q.x,q.z,.36,q.y,1.75));
  for(const dx of [-.55,0,.55])for(const dz of [-.55,0,.55])assert.ok(Math.abs(a.groundHeight(q.x+dx,q.z+dz)-q.y)<.04);
  assert.ok(!a.PADS.some(p=>Math.hypot(q.x-p.x,q.z-p.z)<p.radius+.6));
  advance(s,1.5,60,damage);assert.deepEqual({x:s.player.x,y:s.player.y,z:s.player.z},q);
 }
});
test('lethal captures still show the whole embrace and never return or resurrect the player',()=>{
 for(const health of [1,60]){
  const s=setup(),{calls,damage}=damageLog(s);s.health=health;
  const p={x:s.player.x,y:s.player.y,z:s.player.z};updateMotherCapture(s,0,damage);
  advance(s,1.3,60,damage);assert.equal(s.health,health);assert.equal(s.phase,'playing');assert.equal(s.motherCapture.phase,'embrace');
  advance(s,.2,60,damage);assert.equal(s.health,0);assert.equal(s.phase,'dead');assert.equal(s.shield,100);
  assert.equal(s.motherCapture,null);assert.deepEqual({x:s.player.x,y:s.player.y,z:s.player.z},p);assert.equal(calls.length,1);
  assert.equal(s.events.filter(e=>e.type==='motherScreamer').length,1);
  advance(s,4,60,damage);assert.equal(s.health,0);assert.equal(calls.length,1);
 }
});
test('capture freezes on pause and clears without damage or return on boss death or reset',()=>{
 for(const reason of ['pause','boss-death','reset']){
  const s=setup(),{calls,damage}=damageLog(s);updateMotherCapture(s,0,damage);advance(s,.2,60,damage);
  const p={x:s.player.x,y:s.player.y,z:s.player.z};
  if(reason==='pause'){
   s.phase='paused';const before=JSON.stringify(s.motherCapture);assert.equal(updateMotherCapture(s,8,damage),true);assert.equal(JSON.stringify(s.motherCapture),before);
   s.phase='playing';advance(s,1.3,60,damage);assert.equal(calls.length,1);assert.equal(s.motherCapture,null);
  }else{
   if(reason==='boss-death'){s.enemies[0].hp=0;updateMotherCapture(s,.1,damage);}else clearMotherEncounter(s,'reset');
   assert.equal(s.motherCapture,null);assert.equal(calls.length,0);assert.deepEqual({x:s.player.x,y:s.player.y,z:s.player.z},p);
  }
 }
});
test('capture requires a living Mother and water immersion and respects the re-grab cooldown',()=>{
 const s=setup(),{calls,damage}=damageLog(s);
 s.riverImmersed=false;assert.equal(updateMotherCapture(s,.1,damage),false);
 s.riverImmersed=true;s.enemies[0].hp=0;assert.equal(updateMotherCapture(s,.1,damage),false);
 s.enemies[0].hp=12000;updateMotherCapture(s,0,damage);advance(s,1.5,60,damage);assert.equal(calls.length,1);
 s.riverImmersed=true;assert.equal(updateMotherCapture(s,.1,damage),false);
 s.time=s.motherCaptureAfter;assert.equal(updateMotherCapture(s,0,damage),true);assert.ok(s.motherCapture);
});
test('normal and enraged waves include a central projectile precisely aimed at the player',()=>{
 for(const rage of [false,true]){
  const s=setup(),e=s.enemies[0];s.riverImmersed=false;
  Object.assign(e,{waterState:'airborne',waterAge:0,attack:0,attacks:0,dragAt:Infinity,hp:rage?2000:12000});
  updateMadre(s,e,.01);assert.equal(e.cast.attack,'wave');updateMadre(s,e,1.15);
  const shots=s.projectiles.filter(p=>p.kind==='madre-wave');assert.equal(shots.length,3);
  const b=shots[1],dx=s.player.x-b.x,dy=s.player.y+1-b.y,dz=s.player.z-b.z,length=Math.hypot(dx,dy,dz);
  assert.ok(Math.abs(b.dx-dx/length*14)<1e-8);assert.ok(Math.abs(b.dy-dy/length*14)<1e-8);assert.ok(Math.abs(b.dz-dz/length*14)<1e-8);
 }
});
