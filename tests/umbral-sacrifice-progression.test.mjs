import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,activateMacuahuitl,damagePlayer,hitEnemy,step} from '../public/assets/js/umbral-core.mjs';
import {getArena} from '../public/assets/js/umbral-arena.mjs';

function run(map='cuenca',wave=1){
  const s=createState(map);Object.assign(s,{phase:'playing',portalUsed:true,health:100,wave,nextWave:999,nextAmmoSpawn:999,supplies:[]});
  Object.assign(s.player,{x:map==='corona'?5:0,y:0,z:24,yaw:0,pitch:0});return s;
}
function target(s,kind='macabro',point={x:s.player.x,y:0,z:22}){const e=createEnemy(s,kind,point);e.speed=0;e.attack=999;return e;}
function tick(s,seconds,hz=60){for(let t=0;t<seconds-1e-9;t+=1/hz)step(s,{},Math.min(1/hz,seconds-t));}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const blood=s=>s.drops.filter(d=>d.kind==='health');

test('each execution releases 1–3 drops of 8–10 health; 3 is exceptional, across both arenas',()=>{
  const counts=[0,0,0,0],amounts=new Set();
  for(const map of ['cuenca','corona'])for(let seed=1;seed<=160;seed++){
    const s=run(map);s.seed=seed*99991;const e=target(s);activateMacuahuitl(s);tick(s,.3);
    assert.equal(e.hp,0);const drops=blood(s);assert.ok(drops.length>=1&&drops.length<=3);counts[drops.length]++;
    for(const d of drops){assert.ok(Number.isInteger(d.amount)&&d.amount>=8&&d.amount<=10);amounts.add(d.amount);assert.equal(d.source,'sacrifice');}
    const ids=s.drops.map(d=>d.id);hitEnemy(s,e,999,'macuahuitl');tick(s,.4);assert.deepEqual(s.drops.map(d=>d.id),ids);
  }
  assert.deepEqual([...amounts].sort((a,b)=>a-b),[8,9,10]);assert.ok(counts[3]>0&&counts[3]<counts[1]&&counts[3]<counts[2]);
});

test('only the executed target rewards blood; ordinary kills, burns and missed swings do not',()=>{
  for(const source of ['weapon','bow','arrowBurn','burn']){const s=run(),e=target(s);hitEnemy(s,e,999,source);assert.equal(blood(s).length,0);}
  const s=run();target(s,'macabro',{x:0,y:0,z:30});activateMacuahuitl(s);tick(s,.4);assert.equal(blood(s).length,0);
  const hit=run();target(hit);const neighbor=target(hit,'centinela',{x:2,y:0,z:22});activateMacuahuitl(hit);tick(hit,.3);
  assert.equal(hit.kills,1);assert.equal(neighbor.hp,620);assert.ok(neighbor.shockStunUntil>hit.time);assert.ok(blood(hit).length<=3);
});

test('blood heals only health on collection, once; full health keeps drops and overheal is capped',()=>{
  for(const map of ['cuenca','corona']){
    const s=run(map),e=target(s);hitEnemy(s,e,999,'macuahuitl');const d=blood(s)[0];s.drops=[d];tick(s,1);
    Object.assign(s.player,{x:d.x,y:d.y,z:d.z});tick(s,.1);assert.equal(s.drops.length,1);
    s.health=50;s.shield=41;s.shieldRegenAt=1000;const ammo={...s.ammo};tick(s,.1);
    assert.equal(s.health,50+d.amount);assert.equal(s.shield,41);assert.deepEqual(s.ammo,ammo);assert.equal(s.drops.length,0);
    tick(s,.1);assert.equal(s.health,50+d.amount);
    s.health=99;s.drops=[{...d,id:999,life:45,age:1}];tick(s,.1);
    assert.equal(s.health,100);assert.equal(s.shield,41);assert.equal(s.events.filter(e=>e.type==='pickup').at(-1).amount,1);
  }
});

test('burned executions keep all three ammo rewards alongside blood, within their ranges',()=>{
  const s=run(),e=target(s);e.flameMarked=true;activateMacuahuitl(s);tick(s,.3);
  const ammo=s.drops.filter(d=>d.kind==='ammo');assert.equal(ammo.length,3);assert.ok(blood(s).length>=1);
  for(const [type,min,max] of [['small',15,20],['large',7,10],['obsidian',10,18]]){const d=ammo.find(d=>d.ammoType===type);assert.ok(d.amount>=min&&d.amount<=max);}
  const rewards=structuredClone(s.drops);hitEnemy(s,e,999,'burn');assert.deepEqual(s.drops,rewards);
});

test('blood cannot be collected across a floor and expires; pause/death freeze it and retry clears it',()=>{
  const s=run(),e=target(s);hitEnemy(s,e,999,'macuahuitl');tick(s,1);s.health=50;
  const d=blood(s)[0];Object.assign(s.player,{x:d.x,z:d.z,y:6});step(s,{},.01);assert.equal(s.health,50);
  for(const phase of ['paused','dead']){s.phase=phase;const before=structuredClone(s);tick(s,50);assert.deepEqual(s,before);}
  s.phase='playing';Object.assign(s.player,{x:0,y:0,z:24});tick(s,46);assert.equal(s.drops.length,0);assert.equal(createState().drops.length,0);
});

test('pillar executions place blood at the reachable landing',()=>{
  const s=run(),point=getArena().SPAWNS.find(p=>p.elevated),e=target(s,'macabro',point);hitEnemy(s,e,999,'macuahuitl');
  for(const d of blood(s)){assert.ok(Math.hypot(d.x-point.landing.x,d.z-point.landing.z)<1);assert.ok(d.y<point.y);}
});

test('shield regeneration slows 20,17,14,11,8,5 per second, then stays at 5',()=>{
  for(const map of ['cuenca','corona'])for(const hz of [20,60,120])for(const [wave,rate] of [[1,20],[2,17],[3,14],[4,11],[5,8],[6,5],[7,5],[20,5]]){
    const s=run(map,wave);target(s);s.health=1;damagePlayer(s,90);tick(s,5,hz);near(s.shield,10);tick(s,1,hz);near(s.shield,10+rate);assert.equal(s.health,1);
  }
});

test('wave 6 can recover from zero; wave 7 depletion stays locked despite no incoming damage',()=>{
  for(const wave of [6,7,8]){const s=run('cuenca',wave);target(s);damagePlayer(s,100);tick(s,8);
    near(s.shield,wave===6?15:0);assert.equal(s.shieldLockedWave,wave===6?0:wave);assert.equal(s.health,100);
  }
});

test('lock survives pending spawns, warnings and living enemies; actual clear unlocks without refill',()=>{
  const s=run('cuenca',7);s.pending=1;s.nextSpawn=999;damagePlayer(s,100);tick(s,6);assert.equal(s.shieldLockedWave,7);
  s.pending=0;s.spawnWarnings=[{id:999,kind:'macabro',x:0,y:0,z:22,remaining:999,total:999}];tick(s,1);assert.equal(s.shieldLockedWave,7);
  s.spawnWarnings=[];const e=target(s);tick(s,1);assert.equal(s.shieldLockedWave,7);hitEnemy(s,e,999);step(s,{},.01);
  assert.equal(s.clearedWave,7);assert.equal(s.shieldLockedWave,0);assert.equal(s.shield,0);tick(s,1);near(s.shield,5);
  assert.equal(s.events.filter(e=>e.type==='shieldUnlocked').length,1);
});

test('a quick clear preserves the remaining five-second damage delay and the next wave can lock again',()=>{
  const s=run('cuenca',7),e=target(s);damagePlayer(s,100);tick(s,1);hitEnemy(s,e,999);step(s,{},.01);
  assert.equal(s.shieldLockedWave,0);assert.equal(s.shield,0);tick(s,3.99);near(s.shield,0);tick(s,1);near(s.shield,5);
  s.nextWave=.01;step(s,{},.01);assert.equal(s.wave,8);const current=s.shield;damagePlayer(s,current);
  assert.equal(s.shieldLockedWave,8);s.nextSpawn=999;tick(s,6);assert.equal(s.shield,0);
});

test('surviving child enemies prevent a false clear and late intermission damage cannot re-lock a cleared wave',()=>{
  const s=run('cuenca',7),e=target(s,'abominacion');damagePlayer(s,100);hitEnemy(s,e,999);step(s,{},.01);
  assert.equal(s.enemies.filter(e=>e.hp>0).length,2);assert.equal(s.shieldLockedWave,7);
  s.player.z=28;for(const child of s.enemies)if(child.hp>0)hitEnemy(s,child,999);step(s,{},.01);assert.equal(s.shieldLockedWave,0);
  tick(s,6);damagePlayer(s,s.shield);assert.equal(s.shieldLockedWave,0);assert.equal(s.shield,0);tick(s,6);near(s.shield,5);
});

test('an empty shield entering wave 7 locks; pause/death freeze lock and retry resets progression',()=>{
  const s=run('cuenca',6);s.shield=0;s.shieldRegenAt=100;s.nextWave=.01;step(s,{},.01);
  assert.equal(s.wave,7);assert.equal(s.shieldLockedWave,7);
  for(const phase of ['paused','dead']){s.phase=phase;const before=structuredClone(s);tick(s,8);assert.deepEqual(s,before);}
  const fresh=createState();assert.equal(fresh.shield,100);assert.equal(fresh.shieldLockedWave,0);assert.equal(fresh.clearedWave,0);assert.equal(fresh.wave,0);
});
