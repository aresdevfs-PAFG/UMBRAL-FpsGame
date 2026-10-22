import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,step,activateMacuahuitl,damagePlayer,GROUND_FIRE} from '../public/assets/js/umbral-core.mjs';
import {beginTitanCast,updateTitanMotion} from '../public/assets/js/umbral-titan.mjs';
import {getArena} from '../public/assets/js/umbral-arena.mjs';

function state(){
  const s=createState('cuenca');Object.assign(s,{phase:'playing',portalUsed:true,health:100,wave:0,nextWave:999,supplies:[],nextAmmoSpawn:999});
  Object.assign(s.player,{x:0,y:0,z:24,yaw:0,pitch:0});return s;
}
function tick(s,seconds,hz=60){for(let n=0;n<Math.ceil(seconds*hz);n++)step(s,{},1/hz);}
const fireEvents=s=>s.events.filter(e=>e.type==='groundFireWave');

test('Centinela and Titan slam flames start after the telegraph and announce exactly one fire front',()=>{
  for(const kind of ['centinela','titan'])for(const hz of [20,60,120]){
    const s=state(),e=createEnemy(s,kind,{x:0,y:0,z:17});e.speed=0;e.interval=100;
    if(kind==='centinela'){e.attacks=1;e.attack=0;step(s,{},1/hz);}
    else{e.attacks=3;e.attack=100;beginTitanCast(s,e);}
    const h=s.hazards[0];assert.ok(h.flameWave,kind);assert.equal(fireEvents(s).length,0);
    tick(s,.5,hz);assert.equal(fireEvents(s).length,0,'warning stays silent');
    tick(s,.7,hz);const fire=fireEvents(s);assert.equal(fire.length,1,kind+' at '+hz);
    assert.equal(fire[0].id,h.id);assert.equal(fire[0].owner,e.id);assert.equal(fire[0].x,h.x);assert.equal(fire[0].z,h.z);
    assert.equal(fire[0].duration,h.duration);tick(s,.4,hz);assert.equal(fireEvents(s).length,1);
  }
});

test('F cancels a Centinela slam before ignition without a residual fire wave',()=>{
  const s=state(),e=createEnemy(s,'centinela',{x:0,y:0,z:22});e.speed=0;e.attacks=1;e.attack=0;
  step(s,{},.01);assert.equal(s.hazards.length,1);activateMacuahuitl(s);tick(s,1.5);
  assert.equal(s.hazards.length,0);assert.equal(fireEvents(s).length,0);
});

test('Titan high jump and spectral recovery both leave an immediate damaging fire wave on impact',()=>{
  for(const phase of ['jump','dive']){
    const s=state(),e=createEnemy(s,'titan',{x:0,y:0,z:10});e.attack=100;e.speed=0;
    e.bossMotion={phase,from:{x:0,y:0,z:10},target:{x:0,y:0,z:12},height:12,ceiling:12,age:.99,duration:1};
    updateTitanMotion(s,e,.02,()=>{});const h=s.hazards[0];
    assert.ok(h.flameWave);assert.equal(h.warning,0);assert.equal(h.damage,28,'the expanding flame front damages players beyond the impact');
    step(s,{},.01);assert.equal(fireEvents(s).length,1);assert.equal(fireEvents(s)[0].owner,e.id);
    s.phase='paused';const before=structuredClone(s);tick(s,1);assert.deepEqual(s,before);
  }
});

test('fire front remains jumpable and blocked by solid cover, without duplicate contact damage',()=>{
  for(const elevated of [false,true]){
    const s=state();if(elevated)Object.assign(s.player,{y:1.5,vy:8,grounded:false});
    s.hazards.push({id:900,owner:900,kind:'ground-shockwave',flameWave:true,x:0,y:0,z:24,age:0,warning:0,duration:1,radius:0,damage:20,hit:false});
    step(s,{},.01);assert.equal(s.shield,elevated?100:80);tick(s,.1);assert.equal(s.shield,elevated?100:80,'one hit per wave');
  }
  const s=state(),wall=getArena('cuenca').WALLS.find(w=>w.y===0&&w.h>2&&w.w<8&&Math.abs(w.x)<20&&Math.abs(w.z)<20);
  assert.ok(wall);const x=wall.x-wall.w/2-1,px=wall.x+wall.w/2+1,d=px-x;
  Object.assign(s.player,{x:px,z:wall.z});
  s.hazards.push({id:901,owner:901,kind:'ground-shockwave',flameWave:true,x,y:0,z:wall.z,age:(d-.3)/9-.01,warning:0,duration:3,radius:0,damage:20,hit:false});
  step(s,{},.01);assert.equal(s.shield,100,'a pillar blocks the fire front');
});

test('fire fronts damage at their visible height and sweep through the player at every frame rate',()=>{
  for(const hz of [20,60,120])for(const damage of [20,26,28,42]){
    const s=state();Object.assign(s.player,{x:0,z:20});
    s.hazards.push({id:905,kind:'ground-shockwave',flameWave:true,x:0,y:0,z:24,age:0,warning:0,duration:1,radius:0,damage});
    tick(s,.8,hz);assert.equal(s.shield,100-damage,`${damage} at ${hz} Hz`);
  }
  for(const feet of [GROUND_FIRE.height-.05,GROUND_FIRE.height+.05]){
    const s=state();Object.assign(s.player,{y:feet,vy:.1,grounded:false});
    s.hazards.push({id:906,kind:'ground-shockwave',flameWave:true,x:0,y:0,z:24,age:0,warning:0,duration:1,radius:0,damage:20});
    step(s,{},.001);assert.equal(s.shield,feet<GROUND_FIRE.height?80:100,'only jumping above the flames avoids damage');
  }
});

test('contact can damage again after cooldown instead of granting permanent immunity to that wave',()=>{
  const s=state();s.hazards.push({id:907,kind:'ground-shockwave',flameWave:true,x:0,y:0,z:24,age:0,warning:0,duration:2,radius:0,damage:20});
  step(s,{},.01);assert.equal(s.shield,80);tick(s,.45);
  // Re-enter the same expanding front after its contact cooldown expires.
  const h=s.hazards[0];Object.assign(s.player,{x:0,y:0,z:h.z-(.3+(h.age+.01)*9),vy:0});
  step(s,{},.01);assert.equal(s.shield,60);step(s,{},.01);assert.equal(s.shield,60);
});

test('Titan landing deals impact once and its outgoing flames remain dangerous farther away',()=>{
  for(const rage of [false,true])for(const direct of [false,true]){
    const s=state(),e=createEnemy(s,'titan',{x:0,y:0,z:12});e.enraged=rage;e.attack=100;e.speed=0;e.trainingDummy=true;
    Object.assign(s.player,{x:0,y:0,z:direct?12:18});
    e.bossMotion={phase:'dive',from:{x:0,y:12,z:12},target:{x:0,y:0,z:12},ceiling:12,age:.99,duration:1};
    updateTitanMotion(s,e,.02,damagePlayer);step(s,{},.01);
    assert.equal(s.shield,direct?100-32*(rage?1.5:1):100,'the landing frame does not apply impact and fire twice');
    tick(s,.8);assert.equal(s.shield,100-(direct?32:28)*(rage?1.5:1));
  }
});
