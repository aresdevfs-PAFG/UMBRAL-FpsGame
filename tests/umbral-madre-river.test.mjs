import test from 'node:test';
import assert from 'node:assert/strict';
import {getArena} from '../public/assets/js/umbral-arena.mjs';
import {riverTide,RIVER_DECK_HEIGHT} from '../public/assets/js/umbral-maps.mjs';
import {MOTHER_WATER_POINTS,motherWaterPoint,updateMotherOmen,hideMotherOmenOnAim} from '../public/assets/js/umbral-madre-river.mjs';

const arena=getArena('rio');
const state=()=>({mapId:'rio',phase:'playing',portalUsed:true,wave:1,time:26,riverStartedAt:0,seed:17,nextId:12,
  enemies:[],spawnWarnings:[],kills:8,player:{x:0,y:5,z:26,yaw:0,pitch:0}});
function aim(s,q){
  const dx=q.x-s.player.x,dz=q.z-s.player.z,dy=q.y+.8-s.player.y-1.6;
  s.player.yaw=Math.atan2(-dx,-dz);s.player.pitch=Math.atan2(dy,Math.hypot(dx,dz));
}
function visible(s,q){
  const p=s.player,dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);
  return arena.wallDistance(p.x,p.z,dx/d,dz/d,d,p.y+1.6,(q.y+.8-p.y-1.6)/d)>=d-.04;
}
function appear(s){s.motherOmenDelay=0;updateMotherOmen(s,.01);assert.ok(s.motherOmen);return s.motherOmen;}

test('Mother keeps river purple at deck height from warning to final ascent, then normal tides resume',()=>{
  const s=state();s.wave=10;
  for(const stage of ['pending','warning','alive','farewell']){
    s.bossPending=stage==='pending';s.spawnWarnings=stage==='warning'?[{kind:'madre'}]:[];
    s.enemies=stage==='alive'?[{kind:'madre',hp:12000}]:stage==='farewell'?[{kind:'madre',hp:0,deadTime:6.3}]:[];
    for(const time of [0,19,23,30,35,90])assert.deepEqual(riverTide(time,s),{phase:'high',level:RIVER_DECK_HEIGHT,danger:true,haunted:true});
  }
  s.enemies[0].deadTime=6.4;assert.deepEqual(riverTide(0,s),riverTide(0));
  s.bossPending=true;s.mapId='cuenca';assert.deepEqual(riverTide(0,s),riverTide(0));
  s.mapId='rio';s.bossPending=false;s.enemies=[];s.spawnWarnings=[{kind:'madre',finished:true}];assert.deepEqual(riverTide(0,s),riverTide(0));
});

test('every authored point is genuine water with a clear giant and enough shoreline clearance',()=>{
  assert.ok(MOTHER_WATER_POINTS.length>=12);
  for(const q of MOTHER_WATER_POINTS){
    assert.equal(q.y,RIVER_DECK_HEIGHT);assert.equal(arena.groundHeight(q.x,q.z),0,JSON.stringify(q));
    assert.ok(arena.inBounds(q.x,q.z,1.8));
    assert.equal(arena.solid(q.x,q.z,1.8,4,2),false,JSON.stringify(q));
    assert.equal(arena.solid(q.x,q.z,1.8,5.6,9),false,JSON.stringify(q));
  }
  assert.ok(MOTHER_WATER_POINTS.filter(q=>q.z>=15).length>=4);
});

test('water selection is deterministic, shootable from every bank, and never consumes combat RNG',()=>{
  for(const position of arena.SPAWNS){
    const s=state();Object.assign(s.player,position);const before=JSON.stringify(s);
    const a=motherWaterPoint(s),b=motherWaterPoint(s);
    assert.deepEqual(a,b);assert.equal(a.y,5.02);assert.ok(visible(s,a),JSON.stringify({position,a}));
    assert.equal(JSON.stringify(s),before);
    const near=motherWaterPoint(s,null,true);assert.ok(visible(s,near));
    assert.ok(Math.hypot(near.x-s.player.x,near.z-s.player.z)<=Math.hypot(a.x-s.player.x,a.z-s.player.z)+.001);
  }
});

test('omens appear occasionally in water outside the reticle, without enemies, score or combat RNG',()=>{
  const s=state(),seed=s.seed;updateMotherOmen(s,0);
  assert.ok(s.motherOmenDelay>=18&&s.motherOmenDelay<=30);assert.equal(s.motherOmen,undefined);
  const delay=s.motherOmenDelay;updateMotherOmen(s,delay+.01);
  const o=s.motherOmen;assert.ok(o);assert.equal(o.y,5.02);assert.equal(o.phase,'watching');assert.ok(visible(s,o));
  assert.equal(hideMotherOmenOnAim(s),false,'does not spawn under direct aim');
  assert.equal(s.seed,seed);assert.equal(s.nextId,12);assert.equal(s.kills,8);assert.equal(s.enemies.length,0);assert.equal(o.id,undefined);assert.equal(o.hp,undefined);
});

test('direct sight sinks the head before the next shot and removes it within 150ms at 20/60/120Hz',()=>{
  for(const hz of [20,60,120]){
    const s=state(),o=appear(s);aim(s,o);
    assert.equal(hideMotherOmenOnAim(s),true);assert.equal(o.phase,'hiding');assert.equal(o.hidingAge,0);
    assert.equal(hideMotherOmenOnAim(s),false);
    for(let i=0;i<Math.ceil(.15*hz);i++)updateMotherOmen(s,1/hz);
    assert.equal(s.motherOmen,null);assert.ok(s.motherOmenDelay>=18&&s.motherOmenDelay<=30);
    assert.equal(s.enemies.length,0);assert.equal(s.kills,8);
  }
});

test('head observation uses pitch and world occlusion, not just horizontal facing',()=>{
  const s=state(),o=appear(s);aim(s,o);s.player.pitch=Math.PI/2;
  assert.equal(hideMotherOmenOnAim(s),false);
  Object.assign(s.player,{x:0,y:5,z:0});Object.assign(o,{x:0,y:.08,z:18});aim(s,o);
  assert.equal(hideMotherOmenOnAim(s),false,'central island occludes the low head');
});

test('omen follows the water surface, expires without observation and pauses without advancing',()=>{
  const s=state(),o=appear(s);s.time=34;updateMotherOmen(s,.05);
  assert.equal(o.y,riverTide(34).level+.02);s.phase='paused';const before=JSON.stringify(s);
  updateMotherOmen(s,20);hideMotherOmenOnAim(s);assert.equal(JSON.stringify(s),before);
  s.phase='playing';s.player.yaw=Math.PI;updateMotherOmen(s,4.5);assert.equal(s.motherOmen,null);
});

test('omen lifecycle excludes tutorials, demos, other maps and wave ten, and cleans up after death',()=>{
  for(const change of [{training:true},{mode:'boss-demo'},{mapId:'cuenca'},{mapId:'corona'},{wave:10},{wave:11},{phase:'dead'},{portalUsed:false},{bossPending:true}]){
    const s=state();appear(s);Object.assign(s,change);updateMotherOmen(s,.1);assert.equal(s.motherOmen,null,JSON.stringify(change));
  }
  const s=state();assert.equal(s.motherOmen,undefined,'fresh sessions inherit no apparition');
});

test('omen scheduling and locations remain stable regardless of later combat RNG consumption',()=>{
  const a=state(),b=state();updateMotherOmen(a,0);updateMotherOmen(b,0);b.seed=99999;
  updateMotherOmen(a,a.motherOmenDelay+.01);updateMotherOmen(b,b.motherOmenDelay+.01);
  assert.deepEqual(a.motherOmen,b.motherOmen);assert.equal(a.motherOmenSeed,b.motherOmenSeed);
  assert.equal(a.seed,17);assert.equal(b.seed,99999);
});
