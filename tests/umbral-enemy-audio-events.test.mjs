import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,hitEnemy,step,activateMacuahuitl,TITAN} from '../public/assets/js/umbral-core.mjs';
import {beginTitanCast,releaseTitanCast,updateTitanMotion} from '../public/assets/js/umbral-titan.mjs';

function state(){
  const s=createState('titan-demo');
  Object.assign(s,{phase:'playing',portalUsed:true,health:100,wave:10,nextWave:1000});
  return s;
}
const tick=(s,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)step(s,{},1/60);};
const events=(s,type,id)=>s.events.filter(ev=>ev.type===type&&(id===undefined||ev.id===id));
function location(ev,e){
  assert.equal(ev.id,e.id);assert.equal(ev.kind,e.kind);
  assert.equal(ev.x,e.x);assert.equal(ev.z,e.z);assert.ok(Number.isFinite(ev.y));
}

test('direct spawns and Devoradores born from an Abomination emit spatial identity once',()=>{
  const s=state(),a=createEnemy(s,'abominacion',{x:0,y:0,z:7});
  const born=events(s,'enemySpawn',a.id);assert.equal(born.length,1);location(born[0],a);
  hitEnemy(s,a,a.hp,'weapon');
  const children=s.enemies.filter(e=>e.kind==='devorador');assert.equal(children.length,2);
  for(const e of children){const spawned=events(s,'enemySpawn',e.id);assert.equal(spawned.length,1);location(spawned[0],e);}
  tick(s,.1);assert.equal(events(s,'enemySpawn').length,3);
});

test('projectiles, charge and leaps emit one release after their windup',()=>{
  for(const [kind,attack,count] of [['macabro','projectile',1],['devorador','charge',0],['abominacion','acid-volley',3],['centinela','plasma',2],['tejedor','plasma',3],['acechador','jump',0]]){
    const s=state(),e=createEnemy(s,kind,{x:0,y:0,z:7});e.attack=0;e.speed=0;e.interval=100;
    step(s,{},.01);
    const windup=events(s,'enemyWindup',e.id);assert.equal(windup.length,1,kind);location(windup[0],e);assert.equal(windup[0].attack,attack);
    assert.equal(events(s,'enemyAttack',e.id).length,0,kind);
    tick(s,e.windup+.03);
    const released=events(s,'enemyAttack',e.id);assert.equal(released.length,1,kind);assert.equal(released[0].kind,kind);assert.equal(released[0].attack,attack);
    assert.ok(Number.isFinite(released[0].x)&&Number.isFinite(released[0].y)&&Number.isFinite(released[0].z),kind);
    if(count)assert.equal(s.projectiles.filter(b=>b.owner===e.id).length,count,kind);else assert.ok(kind==='acechador'?e.flight:e.charge,kind);
    tick(s,.1);assert.equal(events(s,'enemyAttack',e.id).length,1,kind);
  }
});

test('Centinel mace releases one sound with the actual expanding wave, not its warning',()=>{
  const s=state(),e=createEnemy(s,'centinela',{x:0,y:0,z:7});e.attack=0;e.attacks=1;e.speed=0;e.interval=100;
  step(s,{},.01);assert.equal(e.cast,null);assert.equal(events(s,'enemyWindup',e.id)[0].attack,'slam');
  assert.equal(events(s,'enemyAttack',e.id).length,0);
  tick(s,.9);const released=events(s,'enemyAttack',e.id);assert.equal(released.length,1);assert.equal(released[0].attack,'slam');location(released[0],e);
  tick(s,.5);assert.equal(events(s,'enemyAttack',e.id).length,1);
});

test('powered Macuahuitl interruption cancels pending cast and hazard release cues',()=>{
  for(const kind of ['macabro','centinela','empalador','tejedor','acechador']){
    const s=state(),caster=createEnemy(s,kind,{x:0,y:0,z:7});caster.attack=0;caster.speed=0;caster.interval=100;
    if(kind==='centinela')caster.attacks=1;
    step(s,{},.01);assert.equal(events(s,'enemyWindup',caster.id).length,1);
    // Add the melee target after windup so a Tejedor begins its cast instead of shielding it.
    const target=createEnemy(s,'macabro',{x:0,y:0,z:12.5});target.attack=100;target.speed=0;
    assert.equal(activateMacuahuitl(s),true);tick(s,1);
    assert.equal(target.hp<=0,true);assert.equal(caster.cast,null);assert.ok(caster.shockStunUntil>s.time);
    assert.equal(events(s,'enemyAttack',caster.id).length,0,kind);
    assert.equal(events(s,'enemyLanding',caster.id).length,0,kind);
  }
});

test('Empalador erupts one spatial attack per three-spike salvo at the actual hazard position',()=>{
  const s=state(),e=createEnemy(s,'empalador',{x:0,y:0,z:7});e.attack=0;e.speed=0;e.interval=100;
  step(s,{},.01);assert.equal(events(s,'enemyWindup',e.id)[0].attack,'spikes');assert.equal(s.hazards.length,3);
  const first={...s.hazards[0]};assert.equal(events(s,'enemyAttack',e.id).length,0);
  tick(s,.76);assert.equal(events(s,'enemyAttack',e.id).length,0);
  tick(s,.1);const released=events(s,'enemyAttack',e.id);assert.equal(released.length,1);
  assert.deepEqual(released[0],{type:'enemyAttack',id:e.id,kind:e.kind,x:first.x,y:first.y,z:first.z,attack:'spikes',fixedPosition:true,hazardId:first.id});
  tick(s,1.3);assert.equal(events(s,'enemyAttack',e.id).length,1);assert.equal(s.hazards.length,0);
  e.attack=0;tick(s,1.2);assert.equal(events(s,'enemyAttack',e.id).length,2);
});

test('a dead Empalador cannot emit an untriggered spike release',()=>{
  const s=state(),e=createEnemy(s,'empalador',{x:0,y:0,z:7});e.attack=0;e.speed=0;
  step(s,{},.01);assert.equal(s.hazards.length,3);hitEnemy(s,e,e.hp,'weapon');
  tick(s,1.2);assert.equal(events(s,'enemyAttack',e.id).length,0);
});

test('Acechador landing is emitted once on physical ground contact after an actual launch',()=>{
  const s=state(),e=createEnemy(s,'acechador',{x:0,y:0,z:7});e.attack=0;e.speed=0;e.interval=100;
  step(s,{},.01);tick(s,.74);assert.ok(e.flight);assert.equal(e.grounded,false);
  assert.equal(events(s,'enemyAttack',e.id).length,1);assert.equal(events(s,'enemyLanding',e.id).length,0);
  tick(s,1.4);const landed=events(s,'enemyLanding',e.id);assert.equal(landed.length,1);assert.equal(landed[0].attack,'jump');location(landed[0],e);
  assert.equal(e.grounded,true);assert.equal(landed[0].y,0);tick(s,.5);assert.equal(events(s,'enemyLanding',e.id).length,1);
});

test('Acechador jump-pad traversal emits release and landing with its elevated physical position',()=>{
  const s=createState('corona');Object.assign(s,{phase:'playing',portalUsed:true,health:100,wave:10,nextWave:1000});
  Object.assign(s.player,{x:-24,z:1,y:3});
  const e=createEnemy(s,'acechador',{x:0,z:24,y:0});e.attack=0;e.speed=0;e.interval=100;e.grounded=true;
  step(s,{},.01);assert.ok(e.cast);assert.equal(e.cast.target.y,3);assert.equal(events(s,'enemyAttack',e.id).length,0);
  tick(s,.8);assert.equal(events(s,'enemyAttack',e.id).length,1);assert.equal(events(s,'enemyLanding',e.id).length,0);
  tick(s,2);const landed=events(s,'enemyLanding',e.id);assert.equal(landed.length,1);location(landed[0],e);assert.equal(landed[0].y,3);
});

test('Acechador death, idle support and void teleport never produce a false landing cue',()=>{
  const idle=state(),standing=createEnemy(idle,'acechador',{x:0,y:0,z:7});standing.attack=100;standing.speed=0;
  tick(idle,.2);assert.equal(events(idle,'enemyLanding',standing.id).length,0);
  for(const reason of ['death','teleport']){
    const s=state(),e=createEnemy(s,'acechador',{x:0,y:0,z:7});e.attack=0;e.speed=0;e.interval=100;
    step(s,{},.01);tick(s,.74);assert.ok(e.audioLandingPending);
    if(reason==='death')hitEnemy(s,e,e.hp,'weapon');else{e.y=-13;e.vy=-1;}
    tick(s,2);assert.equal(events(s,'enemyLanding',e.id).length,0,reason);assert.equal(e.audioLandingPending,undefined,reason);
  }
});

test('a flight ending in midair stays silent until the Acechador physically lands',()=>{
  const s=state(),e=createEnemy(s,'acechador',{x:0,y:0,z:7});e.attack=0;e.speed=0;e.interval=100;
  step(s,{},.01);tick(s,.85);assert.ok(e.y>0);e.flight.remaining=.001;
  step(s,{},.01);assert.equal(e.flight,null);assert.equal(e.grounded,false);assert.equal(events(s,'enemyLanding',e.id).length,0);
  tick(s,1.5);assert.equal(events(s,'enemyLanding',e.id).length,1);assert.equal(e.grounded,true);
});

test('an Acechador blocked by the simultaneous leap limit emits no windup or launch cue',()=>{
  const s=state();
  for(const x of [-4,4]){
    const other=createEnemy(s,'acechador',{x,y:0,z:10});other.attack=100;other.speed=0;
    other.cast={remaining:10,target:{x,y:0,z:15},duration:1};
  }
  const e=createEnemy(s,'acechador',{x:0,y:0,z:7});e.attack=0;e.speed=0;
  step(s,{},.01);assert.equal(e.cast,null);assert.equal(events(s,'enemyWindup',e.id).length,0);
  assert.equal(events(s,'enemyAttack',e.id).length,0);assert.equal(events(s,'enemyLanding',e.id).length,0);
});

test('hit and death events retain source and spatial data after the corpse is removed',()=>{
  const s=state(),e=createEnemy(s,'macabro',{x:10,y:0,z:17});
  hitEnemy(s,e,10,'macuahuitlMelee');hitEnemy(s,e,e.hp,'weapon');
  const hit=events(s,'hit',e.id),kill=events(s,'kill',e.id);
  assert.equal(hit.length,2);assert.equal(hit[0].source,'macuahuitlMelee');assert.equal(hit[0].dead,false);assert.equal(hit[1].dead,true);
  assert.equal(kill.length,1);location(kill[0],e);assert.equal(kill[0].source,'weapon');
  s.enemies=[];location(kill[0],e);
});

test('Titan phase, attack and landing cues carry the same boss identity at actual positions',()=>{
  const s=state(),e=createEnemy(s,'titan',{x:0,y:0,z:-1});
  hitEnemy(s,e,TITAN.maxShield);const rage=events(s,'bossRage',e.id);assert.equal(rage.length,1);location(rage[0],e);
  hitEnemy(s,e,1);assert.equal(events(s,'bossRage',e.id).length,1);
  e.attacks=1;beginTitanCast(s,e);assert.equal(e.cast.attack,'volley');location(events(s,'bossSkulls',e.id)[0],e);
  releaseTitanCast(s,e);assert.equal(events(s,'enemyAttack',e.id)[0].attack,'volley');assert.equal(s.projectiles.length,7);
  e.cast=null;e.attacks=2;beginTitanCast(s,e);assert.equal(e.cast.attack,'jump');location(events(s,'bossLeap',e.id)[0],e);
  releaseTitanCast(s,e);e.cast=null;
  for(let i=0;i<130;i++)updateTitanMotion(s,e,1/60,()=>{});
  const landing=events(s,'bossLanding',e.id);assert.equal(landing.length,1);location(landing[0],e);
  const jump=events(s,'enemyAttack',e.id).filter(ev=>ev.attack==='jump');assert.equal(jump.length,1);
});

test('Titan spectral recovery announcement retains its submerged source position',()=>{
  const s=createState('rio'),e=createEnemy(s,'titan',{x:14,y:-4,z:10});
  updateTitanMotion(s,e,.01,()=>{});const recovery=events(s,'bossRecovery',e.id);
  assert.equal(recovery.length,1);assert.equal(recovery[0].kind,'titan');assert.equal(recovery[0].x,14);assert.equal(recovery[0].y,-4);assert.equal(recovery[0].z,10);
  updateTitanMotion(s,e,.01,()=>{});assert.equal(events(s,'bossRecovery',e.id).length,1);
});
