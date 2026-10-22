import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,step,activateMacuahuitl,hitEnemy,TITAN} from '../public/assets/js/umbral-core.mjs';
import {beginTitanCast,releaseTitanCast,titanPose} from '../public/assets/js/umbral-titan.mjs';
import {getArena} from '../public/assets/js/umbral-arena.mjs';

function state(){
  const s=createState('cuenca');Object.assign(s,{phase:'playing',portalUsed:true,health:100,shield:100,wave:0,nextWave:999,supplies:[],nextAmmoSpawn:999});
  Object.assign(s.player,{x:0,y:0,z:20,yaw:0,pitch:0});return s;
}
function cannon(s,enraged=false){
  const e=createEnemy(s,'titan',{x:0,y:0,z:10});e.enraged=enraged;e.trainingDummy=true;e.attack=100;
  e.attacks=enraged?6:4;beginTitanCast(s,e);assert.equal(e.cast.attack,'cannon');
  assert.deepEqual(titanPose(e),{state:'attack',frame:0});releaseTitanCast(s,e);e.cast=null;
  return {e,b:s.projectiles[0]};
}
function tick(s,seconds,hz=60,input={}){for(let n=0;n<Math.ceil(seconds*hz);n++)step(s,input,1/hz);}

test('Titan cannon launches one aimed purple plasma ball from its right arm in both phases',()=>{
  for(const enraged of [false,true]){
    const s=state(),{e,b}=cannon(s,enraged);
    assert.equal(s.projectiles.length,1);assert.equal(b.kind,'titan-plasma');assert.equal(b.owner,e.id);
    assert.equal(b.damage,50);assert.equal(b.homing,false);assert.equal(b.gravity,0);
    assert.equal(b.x,e.x-e.width*.22);assert.equal(b.y,e.y+e.height*.6);assert.equal(b.z,e.z);
    assert.ok(Math.abs(Math.hypot(b.dx,b.dy,b.dz)-TITAN.cannonSpeed)<1e-8);
    assert.equal(s.events.filter(ev=>ev.type==='enemyAttack'&&ev.attack==='cannon').length,1);
  }
});

test('plasma deals exactly 50 to shields, health, or their overflow at 20/60/120 Hz, including rage',()=>{
  for(const hz of [20,60,120])for(const enraged of [false,true])for(const shield of [100,30,0]){
    const s=state();s.shield=shield;s.shieldRegenAt=999;cannon(s,enraged);tick(s,1,hz);
    assert.equal(s.shield,Math.max(0,shield-50));assert.equal(s.health,100-Math.max(0,50-shield));
    assert.equal(s.projectiles.length,0);
  }
});

test('plasma remains ballistic, can be dodged, freezes on pause, and expires',()=>{
  const s=state(),{b}=cannon(s);const velocity=[b.dx,b.dy,b.dz];
  tick(s,.12);Object.assign(s.player,{x:8,z:20});tick(s,.3);
  assert.deepEqual([b.dx,b.dy,b.dz],velocity);assert.equal(s.shield,100);
  s.phase='paused';const frozen=structuredClone(s);tick(s,1);assert.deepEqual(s,frozen);
  s.phase='playing';tick(s,6.2);assert.equal(s.projectiles.length,0);assert.equal(s.shield,100);
});

test('large plasma volume cannot pass through pillar sides, a bridge ceiling, or a floor',()=>{
  const a=getArena('cuenca'),wall=a.WALLS.find(w=>w.id==='south-west-pillar');
  for(const hz of [20,60,120]){
    const s=state(),{b}=cannon(s);
    Object.assign(s.player,{x:wall.x+wall.w/2+1,z:wall.z,y:0});
    Object.assign(b,{x:wall.x-wall.w/2-1,z:wall.z,y:1.05,dx:19,dy:0,dz:0});
    tick(s,1,hz);assert.equal(s.shield,100);assert.equal(s.projectiles.length,0,'pillar blocks ball');
    assert.ok(s.events.some(ev=>ev.type==='impact'&&ev.kind==='titan-plasma'));
  }
  for(const direction of ['ceiling','floor']){
    const s=state(),{b}=cannon(s);Object.assign(s.player,{x:0,z:-7.5,y:6});
    Object.assign(b,{x:0,z:-7.5,y:direction==='ceiling'?4.8:1,dx:0,dy:direction==='ceiling'?19:-19,dz:0});
    tick(s,.2);assert.equal(s.shield,100);assert.equal(s.projectiles.length,0,direction);
  }
  const s=state(),{b}=cannon(s);
  Object.assign(s.player,{x:0,z:20});
  // Centreline misses this pillar, but the ball's right edge contacts it.
  Object.assign(b,{x:wall.x-wall.w/2-.2,z:wall.z-4,y:1.05,dx:0,dy:0,dz:19});
  tick(s,.5);assert.equal(s.projectiles.length,0,'radius cannot clip the pillar');
});

test('F interrupts the cannon windup and a downed Titan removes released plasma before its finisher',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,y:0,z:18});e.attack=100;e.speed=0;e.attacks=4;
  beginTitanCast(s,e);assert.equal(e.cast.attack,'cannon');assert.equal(activateMacuahuitl(s),true);tick(s,.65);
  assert.equal(e.cast,null);assert.equal(s.projectiles.length,0);assert.ok(e.shockStunUntil>s.time);
  assert.ok(!s.events.some(ev=>ev.type==='enemyAttack'&&ev.attack==='cannon'));
  const other=state(),{e:boss}=cannon(other);other.wave=10;hitEnemy(other,boss,20000);
  assert.equal(boss.downed,true);assert.equal(other.projectiles.length,0);assert.equal(other.hazards.length,0);
  releaseTitanCast(other,boss);assert.equal(other.projectiles.length,0,'a cancelled/downed cast cannot release again');
});

test('live boss includes cannon in its loop without unlocking skulls or summons before rage',()=>{
  for(const enraged of [false,true])for(const hz of [20,60,120]){
    const s=state(),e=createEnemy(s,'titan',{x:0,y:0,z:10});s.shield=s.health=10000;e.attack=0;e.enraged=enraged;e.speed=0;
    const attacks=new Set();for(let n=0;n<hz*35;n++){step(s,{},1/hz);if(e.cast)attacks.add(e.cast.attack);}
    assert.ok(attacks.has('cannon'),`${hz} Hz ${enraged?'rage':'armour'} lacks cannon`);
    assert.ok(attacks.has('jump')&&attacks.has('charge')&&attacks.has('slam'));
    if(!enraged){assert.ok(!attacks.has('volley'));assert.ok(!attacks.has('summon'));}
  }
});
