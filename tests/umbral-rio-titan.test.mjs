import test from 'node:test';
import assert from 'node:assert/strict';
import {getArena} from '../public/assets/js/umbral-arena.mjs';
import {riverTide,RIVER_DECK_HEIGHT} from '../public/assets/js/umbral-maps.mjs';
import {updateTraversal} from '../public/assets/js/umbral-traversal.mjs';
import {createState,createEnemy,hitEnemy,step,activateMacuahuitl,activateFlames,fire,selectWeapon,damagePlayer,TITAN,ENEMY_TYPES,RIFLE_SCOPE} from '../public/assets/js/umbral-core.mjs';
import {beginTitanCast,releaseTitanCast,updateTitanMotion,guideTitanSkull,titanPose} from '../public/assets/js/umbral-titan.mjs';
import {FINISHER,finisherPrompt,tryBossFinisher} from '../public/assets/js/umbral-finisher.mjs';
const tick=(s,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)step(s,{},1/60);};
function state(map='cuenca',point={x:0,y:0,z:20}){const s=createState(map);s.phase='playing';s.portalUsed=true;s.health=100;s.nextWave=1000;Object.assign(s.player,point);return s;}
function rage(s,e){hitEnemy(s,e,TITAN.maxShield);assert.equal(e.enraged,true);assert.equal(e.hp,TITAN.maxHealth);}
function finish(s,e){
  tick(s,1.3);assert.equal(s.bossFinish.phase,'ready');
  Object.assign(s.player,{x:e.x,y:e.y,z:e.z+2.8,yaw:0,pitch:0,grounded:true,vy:0});
  assert.equal(activateMacuahuitl(s),true);assert.equal(s.bossFinish.phase,'executing');tick(s,3.1);
}

test('both river underpasses allow continuous walking in both directions at 20, 60 and 120 Hz',()=>{
  const a=getArena('rio');
  for(const x of [-14,14])for(const direction of [-1,1])for(const hz of [20,60,120]){
    const s=createState('rio'),z=direction===1?8:-26;
    Object.assign(s.player,{x,z,y:direction===1?.35:a.START.y});
    for(let i=0;i<6*hz;i++){
      s.time+=1/hz;updateTraversal(s,{forward:direction},1/hz);
      if(direction===1?s.player.z<-25:s.player.z>7)break;
    }
    assert.ok(direction===1?s.player.z<-25:s.player.z>7,`x=${x}, direction=${direction}, ${hz}Hz stopped at z=${s.player.z}, y=${s.player.y}`);
    assert.equal(a.solid(s.player.x,s.player.z,.32,s.player.y,1.75),false);
  }
});
test('jumping below either crossing clears the ceiling and lands on the low bank',()=>{
  for(const x of [-14,14])for(const hz of [20,60,120]){
    const s=createState('rio');Object.assign(s.player,{x,z:0,y:.35});let peak=.35;
    for(let i=0;i<hz;i++){s.time+=1/hz;updateTraversal(s,{jump:true},1/hz);peak=Math.max(peak,s.player.y);}
    assert.ok(peak>1.45,`Ceiling clipped jump: ${peak}`);assert.ok(Math.abs(s.player.y-.35)<.01);
  }
});

test('river spawns fit all enemies; both shores connect to every supply and the high circuit',()=>{
  const a=getArena('rio');
  for(const q of a.SPAWNS){
    for(const type of Object.values(ENEMY_TYPES))assert.equal(a.solid(q.x,q.z,type.radius,q.y,type.height),false,JSON.stringify(q));
    for(const target of a.SUPPLIES)assert.ok(a.navigationPath(q,target).length,`${JSON.stringify(q)} -> ${JSON.stringify(target)}`);
  }
  for(const x of [-14,14]){
    const p={x,y:.35,z:10,height:1.75,vy:0};
    for(let i=0;i<200;i++){a.move(p,0,.09,.32);a.settle(p,.03);}
    assert.ok(p.y>RIVER_DECK_HEIGHT-.01);assert.ok(p.z>24);assert.equal(a.solid(p.x,p.z,.32,p.y,1.75),false);
  }
});
test('tide gives four seconds warning, damages only flooded low ground, freezes on pause',()=>{
  assert.equal(riverTide(18).phase,'warning');assert.equal(riverTide(21.99).danger,false);assert.equal(riverTide(26).level,RIVER_DECK_HEIGHT);
  const low=state('rio',{x:14,y:.35,z:10}),high=state('rio',{x:9,y:RIVER_DECK_HEIGHT,z:26});
  low.time=high.time=25;tick(low,1);tick(high,1);assert.ok(low.health<93);assert.equal(low.shield,100);assert.equal(high.health,100);assert.equal(high.shield,100);
  low.phase='paused';const before=structuredClone(low);tick(low,1);assert.deepEqual(low,before);
  const s=state('rio',{x:9,y:RIVER_DECK_HEIGHT,z:26});s.time=17.9;tick(s,.3);assert.equal(s.events.filter(e=>e.type==='floodWarning').length,1);
});
test('titan can continuously pursue along bridges and ramps without getting stuck',()=>{
  const a=getArena('rio');
  for(const from of a.BOSS_SPAWNS)for(const target of [{x:0,z:26,y:RIVER_DECK_HEIGHT},{x:14,z:10,y:.35},{x:-14,z:10,y:.35}]){
    const b={...from,height:ENEMY_TYPES.titan.height,vy:0};let arrived=false;
    for(let i=0;i<4500;i++){
      const next=a.navigate(b,target,.05),dx=next.x-b.x,dz=next.z-b.z,d=Math.hypot(dx,dz);
      if(d>.01)a.move(b,dx/d*Math.min(.14,d),dz/d*Math.min(.14,d),.95);a.settle(b,.05);
      if(Math.hypot(b.x-target.x,b.z-target.z)<1&&Math.abs(b.y-target.y)<.2){arrived=true;break;}
    }
    assert.equal(arrived,true,`${JSON.stringify(from)} -> ${JSON.stringify(target)} ended ${JSON.stringify(b)}`);
  }
});
test('first flood cycle starts at the threshold, even after waiting in the entrance',()=>{
  const s=createState('rio');s.phase='playing';s.time=25;s.player.z=28;
  step(s,{},.02);assert.equal(s.portalUsed,true);assert.equal(s.tidePhase,'calm');assert.equal(riverTide(s.time-s.riverStartedAt).level,.06);
});
test('exactly one titan at wave 10 in Cuenca; boss counts toward wave completion',()=>{
  for(const map of ['cuenca']){
    const a=getArena(map),s=state(map,{x:0,z:28,y:a.START.y});s.wave=9;s.clearedWave=9;s.nextWave=.01;
    step(s,{},.02);assert.equal(s.wave,10);assert.equal(s.pending,1);assert.equal(s.bossPending,true);
    tick(s,3);assert.equal(s.enemies.filter(e=>e.boss).length,1,map);assert.equal(s.bossSpawned,true);
    const boss=s.enemies.find(e=>e.boss);s.enemies=[boss];s.pending=0;s.spawnWarnings=[];s.nextWave=.01;boss.attack=100;
    tick(s,.2);assert.equal(s.wave,10);assert.ok(s.clearedWave<10);
    hitEnemy(s,boss,99999);tick(s,.03);assert.equal(s.wave,10);assert.equal(boss.downed,true);assert.equal(s.kills,0);
    finish(s,boss);tick(s,4.1);assert.equal(s.wave,11);assert.equal(s.bossPending,false);assert.equal(s.kills,1);
  }
});
test('boss spawn cancellation retries once instead of dropping or duplicating the boss',()=>{
  const s=state('cuenca',{x:0,y:0,z:28});s.wave=9;s.clearedWave=9;s.nextWave=.01;tick(s,.3);
  const warning=s.spawnWarnings.find(w=>w.kind==='titan');assert.ok(warning);
  Object.assign(s.player,{x:warning.x,y:warning.y,z:warning.z});s.nextSpawn=100;
  tick(s,2.6);assert.equal(s.bossPending,true);assert.equal(s.bossSpawned,false);
  Object.assign(s.player,{x:0,y:0,z:28});s.nextSpawn=0;tick(s,3);
  assert.equal(s.enemies.filter(e=>e.boss).length,1);assert.equal(s.bossPending,false);
});
test('earlier waves do not schedule a boss',()=>{
  for(const wave of [0,1,7,8]){const s=state();s.wave=wave;s.clearedWave=wave;s.nextWave=.01;tick(s,.3);assert.equal(s.bossPending,false);assert.ok(!s.spawnWarnings.some(w=>w.kind==='titan'));}
});
test('volley, fixed-direction charge and jumpable slam are telegraphed',()=>{
  for(const previous of [0,3,4]){
    const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});rage(s,e);e.attacks=previous;e.attack=0;
    step(s,{},.01);assert.equal(e.cast.attack,({0:'volley',3:'charge',4:'slam'})[previous]);assert.equal(s.projectiles.length,0);
    if(previous===3){const dx=e.cast.dx;s.player.x=5;tick(s,1.1);assert.equal(e.charge.dx,dx);}
    else if(previous===0){tick(s,1.1);assert.equal(s.projectiles.filter(b=>b.owner===e.id).length,7);assert.ok(e.exposedUntil>s.time);}
    else{assert.equal(s.hazards.length,1);assert.equal(s.hazards[0].warning,e.windup);s.player.y=2;s.player.vy=7;tick(s,.05);assert.equal(s.shield,100);}
  }
});
test('weak point opens after shield break and rage triggers only once',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});
  hitEnemy(s,e,100,'weapon',e.height*.6);assert.equal(e.shield,6150);e.exposedUntil=2;
  hitEnemy(s,e,100,'weapon',1);assert.equal(e.shield,6050);
  hitEnemy(s,e,100,'weapon',e.height*.6);assert.equal(e.shield,5950);assert.equal(e.hp,6250);
  hitEnemy(s,e,e.shield);assert.equal(e.enraged,true);assert.ok(e.speed>ENEMY_TYPES.titan.speed);
  hitEnemy(s,e,100,'weapon',e.height*.6);assert.equal(e.hp,6250-100*TITAN.weakMultiplier);
  assert.equal(s.events.filter(e=>e.type==='bossRage').length,1);
});
test('F interrupts the titan with damage and consumes charge; no sacrifice loot before death',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,z:18,y:0});e.attack=100;e.cast={remaining:2,attack:'charge',dx:0,dz:1};
  activateMacuahuitl(s);tick(s,.65);assert.equal(e.shield,TITAN.maxShield-TITAN.chargedDamage);assert.equal(e.hp,TITAN.maxHealth);assert.equal(e.cast,null);assert.ok(e.shockStunUntil>s.time);
  assert.ok(s.macuahuitlCooldown>7);assert.equal(s.drops.length,0);assert.equal(s.kills,0);
  activateMacuahuitl(s);tick(s,.3);assert.equal(e.shield,TITAN.maxShield-TITAN.chargedDamage-90);assert.equal(e.hp,TITAN.maxHealth);
});

test('boss is 35% taller and uses clearance matching its new height',()=>{
  assert.equal(ENEMY_TYPES.titan.height,4.6*1.35);assert.equal(ENEMY_TYPES.titan.width,5.2*1.35);
  const a=getArena('cuenca'),from={x:0,z:12,y:0,height:ENEMY_TYPES.titan.height},to={x:0,z:-20,y:3};
  for(const q of a.navigationPath(from,to))assert.equal(a.solid(q.x,q.z,.95,q.y,from.height),false);
});

test('seven skulls launch upward, turn at bounded speed, then fly straight and expire',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});rage(s,e);e.attacks=1;
  beginTitanCast(s,e);releaseTitanCast(s,e);e.cast=null;e.attack=100;e.trainingDummy=true;
  assert.equal(s.projectiles.length,7);assert.ok(s.projectiles.every(b=>b.kind==='titan-skull'&&b.dy>10&&b.homing));
  const start=s.projectiles.map(b=>b.y);tick(s,.3);s.projectiles.forEach((b,i)=>assert.ok(b.y>start[i]+3));
  const b={...s.projectiles[0],age:.8,dx:0,dy:19,dz:0,x:0,y:20,z:20},p={x:0,y:0,z:20};
  guideTitanSkull(b,p,1/60);
  assert.ok(Math.abs(Math.hypot(b.dx,b.dy,b.dz)-TITAN.skullSpeed)<1e-8);
  assert.ok(Math.acos(b.dy/TITAN.skullSpeed)<=TITAN.skullTurnRate/60+1e-7);
  for(let i=0;i<110;i++){b.age+=1/60;guideTitanSkull(b,p,1/60);}
  assert.ok(b.dy<0,'Skull must reverse direction toward a player below it');
  b.age=b.seekUntil+.1;const before={...b};guideTitanSkull(b,{x:50,y:100,z:20},1);assert.deepEqual(b,before);
  s.phase='paused';const frozen=structuredClone(s);tick(s,1);assert.deepEqual(s,frozen);
  s.phase='playing';s.health=10000;s.shield=10000;tick(s,6.2);assert.equal(s.projectiles.length,0);
});

test('high jump locks its marked destination, reaches 12 units and is dodgeable',()=>{
  for(const dodge of [false,true])for(const hz of [20,60,120]){
    const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});e.attacks=1;
    beginTitanCast(s,e);assert.equal(e.cast.attack,'jump');const target={...e.cast.target};
    assert.deepEqual(titanPose(e),{state:'sky',frame:2});
    releaseTitanCast(s,e);e.cast=null;let peak=0,damage=0;
    if(dodge)s.player.x+=8;
    for(let i=0;i<Math.ceil(TITAN.jumpDuration*hz)+1;i++){
      updateTitanMotion(s,e,1/hz,(_,n)=>damage+=n);peak=Math.max(peak,e.y);
      assert.equal(getArena(s.mapId).solid(e.x,e.z,e.radius,e.y,e.height),false,'Jump passes through scenery');
    }
    assert.ok(peak>=11.99);assert.equal(e.bossMotion,null);assert.equal(e.x,target.x);assert.equal(e.z,target.z);
    assert.equal(damage,dodge?0:TITAN.landingDamage);assert.equal(s.events.filter(v=>v.type==='bossLanding').length,1);
  }
});

test('void/water recovery floats visibly, marks a fixed landing and allows evasion',()=>{
  for(const map of ['corona','rio'])for(const dodge of [false,true]){
    const a=getArena(map),s=state(map,map==='rio'?{x:0,z:26,y:5}:{x:0,z:24,y:0});
    const e=createEnemy(s,'titan',{x:0,y:-1,z:0});e.vy=-3;e.cast={attack:'volley',remaining:1};e.charge={remaining:1};
    let damage=0;updateTitanMotion(s,e,.02,(_,n)=>damage+=n);
    assert.equal(e.bossMotion.phase,'rise');assert.ok(e.y>-1&&e.y<0,'Recovery must not teleport');
    assert.equal(e.cast,null);assert.equal(e.charge,null);
    const target={...e.bossMotion.target};if(dodge)s.player.x+=8;
    const phases=new Set();for(let i=0;i<180;i++){if(e.bossMotion)phases.add(e.bossMotion.phase);updateTitanMotion(s,e,1/60,(_,n)=>damage+=n);}
    assert.ok(phases.has('hover')&&phases.has('dive'));assert.equal(e.bossMotion,null);
    assert.equal(e.x,target.x);assert.equal(e.z,target.z);assert.equal(e.y,target.y);
    assert.equal(a.solid(e.x,e.z,e.radius,e.y,e.height),false);assert.equal(damage,dodge?0:TITAN.landingDamage);
  }
});

test('boss wave stays exclusive until it explicitly summons only imps, with bounded population',()=>{
  for(const map of ['cuenca']){
    const a=getArena(map),s=state(map,{x:0,z:28,y:a.START.y});s.wave=9;s.clearedWave=9;s.nextWave=.01;
    tick(s,3);const e=s.enemies.find(e=>e.boss);assert.ok(e);e.trainingDummy=true;rage(s,e);
    tick(s,8);assert.equal(s.enemies.length,1);assert.equal(s.pending,0);assert.equal(s.spawnWarnings.length,0);
    const summon=()=>{e.attacks=3;beginTitanCast(s,e);releaseTitanCast(s,e);e.cast=null;};
    summon();assert.ok(s.spawnWarnings.length>0);assert.ok(s.spawnWarnings.every(w=>w.kind==='macabro'&&w.summonedBy===e.id));
    tick(s,1.6);let imps=s.enemies.filter(o=>o.summonedBy===e.id&&o.hp>0);assert.ok(imps.length>0&&imps.length<=4);
    summon();assert.equal(s.spawnWarnings.length,0);assert.equal(s.pending,0);
    for(let j=0;j<12;j++){
      for(const imp of imps)hitEnemy(s,imp,10000);
      summon();tick(s,1.6);imps=s.enemies.filter(o=>o.summonedBy===e.id&&o.hp>0);
      assert.ok(imps.length<=4);assert.ok((e.summonedCount||0)<=24);s.shield=10000;
    }
    assert.equal(s.enemies.filter(o=>o.hp>0&&!o.boss&&o.kind!=='macabro').length,0);assert.equal(s.pending,0);
  }
});

test('cancelled summons do not become regular wave spawns and death cancels pending casts',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});s.wave=10;e.trainingDummy=true;
  rage(s,e);
  e.attacks=3;beginTitanCast(s,e);releaseTitanCast(s,e);e.cast=null;
  const w=s.spawnWarnings[0];assert.ok(w);Object.assign(s.player,{x:w.x,y:w.y,z:w.z});
  tick(s,1.6);assert.equal(s.pending,0);assert.ok(!s.enemies.some(o=>o.summonedBy===e.id&&o.x===w.x&&o.z===w.z));
  s.spawnWarnings.push({...w,id:s.nextId++,remaining:2});e.bossMotion={phase:'rise'};
  hitEnemy(s,e,99999);assert.equal(e.bossMotion,null);assert.equal(s.spawnWarnings.length,0);
  assert.equal(s.events.filter(v=>v.type==='bossDefeated').length,0);assert.equal(e.downed,true);
  assert.equal(s.enemies.filter(o=>o.summonedBy===e.id).length,0);tick(s,.1);assert.equal(s.clearedWave,0);
});

test('live boss completes its attack cycle at 20/60/120 Hz and F cancels airborne motion',()=>{
  for(const hz of [20,60,120]){
    const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});rage(s,e);s.wave=10;s.health=s.shield=10000;e.attack=0;
    const attacks=new Set(),poses=new Set();let high=0;
    for(let i=0;i<hz*30;i++){
      step(s,{},1/hz);if(e.cast)attacks.add(e.cast.attack);if(e.bossMotion)poses.add(e.bossMotion.phase);
      high=Math.max(high,e.y);assert.ok(Number.isFinite(e.y));assert.ok(s.projectiles.filter(b=>b.kind==='titan-skull').length<=14);
    }
    assert.ok(attacks.has('volley')&&attacks.has('jump')&&attacks.has('summon'),[...attacks].join(','));
    assert.ok(poses.has('jump'));assert.ok(high>10);assert.ok(s.enemies.every(o=>o.boss||o.kind==='macabro'));
  }
  const s=state(),e=createEnemy(s,'titan',{x:0,y:.2,z:18});
  e.bossMotion={phase:'jump',from:{x:0,y:0,z:18},target:{x:0,y:0,z:20},height:1,age:0,duration:10};
  activateMacuahuitl(s);tick(s,.3);assert.equal(e.bossMotion,null);assert.ok(e.shockStunUntil>s.time);
  s.phase='paused';const before=structuredClone(s);tick(s,1);assert.deepEqual(s,before);
});

test('12500 total durability has 6250 non-regenerating shield, exact break and health overflow',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});e.trainingDummy=true;
  assert.equal(e.hp,6250);assert.equal(e.maxHp,6250);assert.equal(e.shield,6250);assert.equal(e.maxShield,6250);
  assert.equal(e.hp+e.shield,12500);assert.equal(RIFLE_SCOPE.damage,120);
  hitEnemy(s,e,6249);assert.equal(e.shield,1);assert.equal(e.hp,6250);assert.equal(e.enraged,false);
  tick(s,20);assert.equal(e.shield,1,'boss shield must not regenerate');assert.equal(e.enraged,false);
  hitEnemy(s,e,1);assert.equal(e.shield,0);assert.equal(e.hp,6250);assert.equal(e.enraged,true);
  hitEnemy(s,e,120);assert.equal(e.hp,6130);assert.equal(s.events.filter(v=>v.type==='bossRage').length,1);
  const other=createEnemy(s,'titan',{x:8,z:10,y:0});hitEnemy(s,other,6260);
  assert.equal(other.shield,0);assert.equal(other.hp,6240);assert.equal(other.enraged,true);
});

test('armoured phase permits jump, charge, slam and cannon but never skulls or imps',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});const attacks=new Set();
  for(let i=1;i<=12;i++){
    e.attacks=i;beginTitanCast(s,e);attacks.add(e.cast.attack);releaseTitanCast(s,e);
    e.cast=null;e.charge=null;e.bossMotion=null;
  }
  assert.deepEqual([...attacks].sort(),['cannon','charge','jump','slam']);assert.ok(s.projectiles.every(b=>b.kind==='titan-plasma'&&b.damage===50));assert.equal(s.spawnWarnings.length,0);
  s.projectiles=[];
  // Even a previously queued or externally restored locked attack cannot release.
  for(const attack of ['volley','summon']){e.cast={attack};releaseTitanCast(s,e);}
  assert.equal(s.projectiles.length,0);assert.equal(s.spawnWarnings.length,0);
  rage(s,e);e.attacks=1;beginTitanCast(s,e);releaseTitanCast(s,e);
  assert.equal(s.projectiles.length,7);assert.ok(s.projectiles.every(b=>b.damage===18));
  e.attacks=3;beginTitanCast(s,e);releaseTitanCast(s,e);assert.ok(s.spawnWarnings.length>0);
  assert.ok(s.spawnWarnings.every(w=>w.kind==='macabro'));
});

test('rage raises charge, shockwave, high-jump and recovery damage by fifty percent',()=>{
  for(const enraged of [false,true]){
    const factor=enraged?1.5:1,s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});if(enraged)rage(s,e);
    e.attacks=enraged?4:2;beginTitanCast(s,e);releaseTitanCast(s,e);assert.equal(e.charge.damage,30*factor);
    e.attacks=enraged?5:3;beginTitanCast(s,e);assert.equal(s.hazards.at(-1).damage,28*factor);
    e.attacks=enraged?2:1;beginTitanCast(s,e);releaseTitanCast(s,e);e.cast=null;
    let damage=0;for(let i=0;i<127;i++)updateTitanMotion(s,e,1/60,(_,n)=>damage+=n);
    assert.equal(damage,32*factor);
    const recovery=state('corona',{x:0,z:24,y:0}),fallen=createEnemy(recovery,'titan',{x:0,z:0,y:-1});
    fallen.vy=-3;if(enraged)rage(recovery,fallen);damage=0;
    for(let i=0;i<180;i++)updateTitanMotion(recovery,fallen,1/60,(_,n)=>damage+=n);
    assert.equal(damage,32*factor);
  }
});

test('lethal damage requires a finisher and removes dangerous summons without extra kill credit',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});s.wave=10;s.clearedWave=9;
  const imp=createEnemy(s,'macabro',{x:4,z:10,y:0,summonedBy:e.id});
  s.projectiles=[{owner:e.id},{owner:imp.id}];s.hazards=[{owner:e.id},{owner:imp.id}];
  s.spawnWarnings=[{id:s.nextId++,kind:'macabro',summonedBy:e.id,remaining:1}];
  hitEnemy(s,e,20000);
  assert.equal(e.downed,true);assert.equal(e.hp,1);assert.equal(e.shield,0);assert.equal(s.kills,0);assert.equal(s.clearedWave,9);
  assert.equal(s.projectiles.length,0);assert.equal(s.hazards.length,0);assert.equal(s.spawnWarnings.length,0);assert.deepEqual(s.enemies,[e]);
  const downedHp=e.hp;for(const source of ['weapon','burn','arrowBurn','macuahuitl'])hitEnemy(s,e,20000,source);
  assert.equal(e.hp,downedHp);assert.equal(s.kills,0);tick(s,10);
  assert.equal(s.wave,10);assert.equal(s.clearedWave,9);assert.equal(s.bossFinish.phase,'ready');
  assert.equal(s.events.filter(v=>v.type==='bossDowned').length,1);assert.equal(s.events.filter(v=>v.type==='bossDefeated').length,0);
});

test('F remate requires proximity, facing and ground, then bypasses the power cooldown',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});s.wave=10;hitEnemy(s,e,20000);tick(s,1.3);
  assert.equal(finisherPrompt(s).ready,false);assert.equal(tryBossFinisher(s),false);
  Object.assign(s.player,{x:e.x,y:e.y,z:e.z+2.8,yaw:Math.PI,grounded:true});assert.equal(tryBossFinisher(s),false);
  s.player.yaw=0;s.player.grounded=false;assert.equal(tryBossFinisher(s),false);
  s.player.grounded=true;s.player.y=e.y+1;assert.equal(tryBossFinisher(s),false);
  s.player.y=e.y;s.macuahuitlCooldown=7;s.macuahuitlRemaining=.5;s.flameRemaining=.6;
  assert.equal(finisherPrompt(s).ready,true);assert.equal(activateMacuahuitl(s),true);assert.equal(s.bossFinish.phase,'executing');
  assert.equal(s.flameRemaining,0);assert.equal(s.macuahuitlRemaining,0);assert.equal(s.macuahuitlCooldown,7);
});

test('finisher protects the player, locks weapons and movement, pauses, and credits exactly one kill',()=>{
  for(const hz of [20,60,120]){
    const s=state(),e=createEnemy(s,'titan',{x:0,z:10,y:0});s.wave=10;s.clearedWave=9;hitEnemy(s,e,20000);tick(s,1.3);
    Object.assign(s.player,{x:e.x,y:e.y,z:e.z+2.8,yaw:0,grounded:true});s.health=1;s.shield=0;
    assert.equal(activateMacuahuitl(s),true);const selected=s.selected,ammo={...s.ammo};
    assert.equal(fire(s),false);assert.equal(activateFlames(s),false);assert.equal(selectWeapon(s,3),false);
    damagePlayer(s,10000);assert.equal(s.health,1);assert.equal(s.phase,'playing');
    for(let i=0;i<hz;i++)step(s,{forward:1,strafe:1,jump:true,primary:true,secondary:true},1/hz);
    assert.equal(s.selected,selected);assert.deepEqual(s.ammo,ammo);assert.equal(e.hp,1);assert.equal(s.kills,0);
    assert.ok(Math.abs(Math.hypot(s.player.x-e.x,s.player.z-e.z)-FINISHER.stanceDistance)<1e-8);
    s.phase='paused';const paused=structuredClone(s);tick(s,1);assert.deepEqual(s,paused);s.phase='playing';
    tick(s,1.8);assert.equal(e.hp,1);assert.equal(s.clearedWave,9);
    tick(s,.3);assert.equal(e.hp<=0,true);assert.equal(s.kills,1);assert.equal(s.clearedWave,10);
    for(const type of ['bossStab','bossHammer','bossFinisherEnd','bossDefeated'])assert.equal(s.events.filter(v=>v.type===type).length,1,type);
    tick(s,4.1);assert.equal(s.wave,11);assert.equal(s.kills,1);assert.equal(s.bossPending,false);
  }
});

test('defeated airborne and submerged titans land on reachable ground before remate',()=>{
  for(const map of ['cuenca','corona','rio']){
    const a=getArena(map),p=map==='rio'?{x:0,z:26,y:5}:{x:0,z:24,y:0},s=state(map,p);
    const e=createEnemy(s,'titan',{x:0,z:0,y:map==='cuenca'?15:-1});s.wave=10;
    hitEnemy(s,e,20000);assert.equal(s.bossFinish.phase,'settling');assert.equal(tryBossFinisher(s),false);
    const target={...s.bossFinish.target};tick(s,1.3);assert.equal(s.bossFinish.phase,'ready');
    assert.equal(e.y,target.y);assert.equal(e.x,target.x);assert.equal(e.z,target.z);assert.equal(a.solid(e.x,e.z,e.radius,e.y,e.height),false);
    if(map==='rio')assert.ok(e.y>=1.4,'defeated boss must leave flooded ground');
    assert.ok(a.navigationPath(s.player,{...target,z:target.z+2.4}).length>0||Math.hypot(s.player.x-e.x,s.player.z-e.z)<4);
    assert.equal(s.kills,0);assert.equal(s.wave,10);
  }
});


test('haunted river reaches deck height, bites health consistently and stops on leaving water',()=>{
  assert.equal(riverTide(21.99).haunted,false);
  assert.equal(riverTide(22).haunted,true);
  for(let t=0;t<72;t+=.1)assert.ok(riverTide(t).level<=RIVER_DECK_HEIGHT);
  for(const hz of [20,60,120]){
    const s=state('rio',{x:14,y:.35,z:10});s.time=25;
    for(let i=0;i<hz;i++)step(s,{},1/hz);
    assert.ok(Math.abs(s.health-92)<1e-6);assert.equal(s.shield,100);assert.equal(s.riverImmersed,true);
    Object.assign(s.player,{x:9,y:RIVER_DECK_HEIGHT,z:26,vy:0});const health=s.health;
    step(s,{},1/hz);assert.equal(s.riverImmersed,false);assert.equal(s.health,health);
    Object.assign(s.player,{x:14,y:.35,z:10,vy:0});s.health=.01;
    step(s,{},1/hz);assert.equal(s.phase,'dead');assert.equal(s.shield,100);
  }
});
test('a flooded player can climb the existing ramp out without special input',()=>{
  const s=state('rio',{x:14,y:.35,z:10});s.time=25;
  for(let i=0;i<180;i++)step(s,{forward:-1},1/60);
  assert.ok(s.player.y>=RIVER_DECK_HEIGHT-.01);assert.equal(s.riverImmersed,false);assert.ok(s.health>60);
});


test('river visuals reuse a bounded pool, remain in water, freeze and release GPU resources',async()=>{
  const T=await import('../public/assets/vendor/three/three.module.min.js');
  const {createRiverVisuals}=await import('../public/assets/js/umbral-river-visuals.mjs');
  const scene=new T.Scene(),arena=getArena('rio'),visuals=createRiverVisuals(T,scene,arena);
  const s=state('rio',{x:10,y:5,z:23});s.time=26;
  visuals.update(s.time,s,{id:'high'});
  const souls=scene.children.find(o=>o.isInstancedMesh),water=scene.children.find(o=>!o.isInstancedMesh);
  assert.equal(scene.children.length,2);assert.equal(souls.count,32);assert.ok(Math.abs(water.position.y-5)<.01);
  const buffer=souls.instanceMatrix.array;const m=new T.Matrix4(),v=new T.Vector3();let visible=0;
  for(let i=0;i<32;i++){souls.getMatrixAt(i,m);v.setFromMatrixPosition(m);if(Math.hypot(m.elements[0],m.elements[1],m.elements[2])>0){visible++;assert.ok(arena.groundHeight(v.x,v.z)<5);}}
  assert.ok(visible>0);
  const before=Array.from(buffer);visuals.update(s.time,s,{id:'high'});assert.deepEqual(Array.from(buffer),before);
  s.player.x=14;for(let i=0;i<60;i++)visuals.update(s.time+=1/60,s,{id:'low'});
  assert.equal(souls.count,16);assert.equal(souls.instanceMatrix.array,buffer);
  visuals.update(0,s,{id:'low'});assert.equal(souls.visible,false);
  let disposed=0;for(const object of scene.children){object.geometry.addEventListener('dispose',()=>disposed++);object.material.addEventListener('dispose',()=>disposed++);}
  visuals.dispose();assert.equal(scene.children.length,0);assert.equal(disposed,4);
});


test('authored river atlases match the manifest and advance bites only with simulation time',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {drawRiverBites,riverSpriteFrame,createRiverVisuals}=await import('../public/assets/js/umbral-river-visuals.mjs');
  const T=await import('../public/assets/vendor/three/three.module.min.js');
  const root=new URL('../public/assets/img/umbral-demo/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('assets.json',root),'utf8'));
  for(const kind of ['bite','swarm']){
    const seq=manifest.effects['river-soul-'+kind],png=await readFile(new URL(seq.file,root));
    assert.equal(png.readUInt32BE(16),seq.columns*256);assert.equal(png.readUInt32BE(20),seq.rows*256);
    assert.equal(seq.frames,8);assert.equal(seq.fps,12.5);
    const gif=await readFile(new URL('../design/umbral/river-souls-v1/river-soul-'+kind+'.gif',import.meta.url));
    assert.equal(gif.subarray(0,6).toString(),'GIF89a');
  }
  const sequence=manifest.effects['river-soul-bite'],sprite={image:{width:1024,height:512},sequence};
  const draws=[],ctx={save(){},restore(){},fillRect(){},createRadialGradient(){return {addColorStop(){}};},translate(){},scale(){},drawImage(...a){draws.push(a);}};
  const s={mapId:'rio',riverImmersed:true,time:.24};drawRiverBites(ctx,1280,720,s,sprite);assert.equal(draws.length,6);
  const first=draws.map(a=>a.slice(1,5));draws.length=0;drawRiverBites(ctx,1280,720,s,sprite);assert.deepEqual(draws.map(a=>a.slice(1,5)),first);
  assert.equal(riverSpriteFrame(0,sequence),0);assert.equal(riverSpriteFrame(.64,sequence),0);assert.equal(riverSpriteFrame(.32,sequence),4);
  s.riverImmersed=false;draws.length=0;drawRiverBites(ctx,1280,720,s,sprite);assert.equal(draws.length,0);
  const scene=new T.Scene(),visuals=createRiverVisuals(T,scene,getArena('rio'),sprite),mesh=scene.children.find(m=>m.isInstancedMesh);
  assert.equal(mesh.material.uniforms.soulAtlas.value.image,sprite.image);assert.equal(mesh.geometry.attributes.soulPhase.count,32);
  let disposed=false;mesh.material.uniforms.soulAtlas.value.addEventListener('dispose',()=>disposed=true);visuals.dispose();assert.equal(disposed,true);
});
