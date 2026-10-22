import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,hitEnemy,step,activateMacuahuitl,ENEMY_TYPES,MACUAHUITL,TITAN} from '../public/assets/js/umbral-core.mjs';
import {ENEMY_VARIANTS,VARIANT_RULES,enemyDamage} from '../public/assets/js/umbral-variants.mjs';
import {launch} from '../public/assets/js/umbral-traversal.mjs';

function state(mapId='cuenca'){
  const s=createState(mapId);Object.assign(s,{phase:'playing',portalUsed:true,health:100,wave:3,nextWave:999,nextAmmoSpawn:999,supplies:[]});
  Object.assign(s.player,{x:0,y:0,z:12,yaw:0,pitch:0});return s;
}
function tick(s,duration,dt=.01){while(duration>1e-9){const part=Math.min(dt,duration);step(s,{},part);duration-=part;}}
function enemy(s,kind,point={x:0,y:0,z:7},variant=true){const e=createEnemy(s,kind,{...point,variant});e.speed=0;e.attack=999;return e;}
const close=(actual,wanted)=>assert.ok(Math.abs(actual-wanted)<1e-7,`${actual} != ${wanted}`);

test('all seven normal species have colored variants with double health and the same collision and speed',()=>{
  assert.equal(Object.keys(ENEMY_VARIANTS).length,7);
  for(const kind of Object.keys(ENEMY_VARIANTS)){
    const s=state(),e=createEnemy(s,kind,{x:0,y:0,z:7,variant:true});
    assert.equal(e.variant,true);assert.equal(e.macuahuitlImmune,true);
    assert.equal(e.hp,ENEMY_TYPES[kind].hp*2);assert.equal(e.maxHp,e.hp);
    for(const property of ['radius','height','speed','windup','interval'])assert.equal(e[property],ENEMY_TYPES[kind][property]);
    close(enemyDamage(e,10),13);assert.match(ENEMY_VARIANTS[kind].color,/^#[\da-f]{6}$/i);
  }
});

test('early waves, training, tutorial and boss demos stay normal, and direct creation never rolls a variant',()=>{
  for(const setup of [{wave:1},{wave:2},{training:{}},{mode:'tutorial'},{mode:'boss-demo'}]){
    const s=state();Object.assign(s,setup);
    for(const kind of Object.keys(ENEMY_VARIANTS)){
      const e=enemy(s,kind,undefined,true);assert.equal(e.variant,false);assert.equal(e.hp,ENEMY_TYPES[kind].hp);
    }
  }
  for(const map of ['tutorial','titan-demo']){const s=state(map),e=enemy(s,'macabro');assert.equal(e.variant,false);}
  const s=state();s.wave=20;
  for(let i=0;i<30;i++)assert.equal(createEnemy(s,'macabro',{x:0,y:0,z:7}).variant,false);
  const titan=enemy(s,'titan');assert.equal(titan.variant,false);assert.equal(titan.shield,TITAN.maxShield);assert.equal(titan.hp,TITAN.maxHealth);
});

function spawnWave(wave,seed){
  const s=state();s.wave=wave;s.seed=seed;s.pending=16;s.nextSpawn=0;Object.assign(s.player,{z:24});
  const seen=new Set(),born=[],warnings=[];
  for(let i=0;i<1000&&(s.pending||s.spawnWarnings.length);i++){
    step(s,{},.05);
    for(const w of s.spawnWarnings)if(!warnings.some(v=>v.id===w.id))warnings.push({id:w.id,variant:w.variant});
    for(const e of s.enemies)if(!seen.has(e.id)){seen.add(e.id);born.push(e);e.hp=0;e.deadTime=10;}
    s.enemies=[];
  }
  assert.equal(s.pending,0);assert.equal(s.spawnWarnings.length,0);assert.equal(born.length,16);
  return {s,born,warnings};
}

test('scheduled hordes mix regular enemies with variants starting at wave 3 and carry the warning identity',()=>{
  for(const wave of [1,2])assert.equal(spawnWave(wave,32026).born.some(e=>e.variant),false);
  let variants=0,total=0;
  for(let seed=1;seed<=30;seed++){
    const {s,born,warnings}=spawnWave(3,seed);assert.ok(born.some(e=>e.variant));assert.ok(born.some(e=>!e.variant));
    assert.equal(s.variantSpawnCount,born.filter(e=>e.variant).length);
    for(let i=0;i<born.length;i++)assert.equal(born[i].variant,warnings[i].variant);
    variants+=born.filter(e=>e.variant).length;total+=born.length;
  }
  // The first guaranteed arrival adds a small bias to the remaining 25% rolls.
  assert.ok(variants/total>.2&&variants/total<.4);
  assert.ok(spawnWave(11,32026).born.some(e=>e.variant));
});

test('an arrival rejected near the player does not consume the guaranteed variant of that horde',()=>{
  const s=state();s.pending=3;s.nextSpawn=0;Object.assign(s.player,{z:24});step(s,{},.05);
  const warning=s.spawnWarnings[0];assert.ok(warning?.variant);assert.equal(s.variantSpawnCount,0);
  Object.assign(s.player,{x:warning.x,y:warning.y,z:warning.z});s.nextSpawn=999;
  tick(s,1.3);assert.equal(s.spawnWarnings.length,0);assert.equal(s.enemies.length,0);assert.equal(s.variantSpawnCount,0);
  Object.assign(s.player,{x:0,y:0,z:24});s.nextSpawn=0;step(s,{},.05);
  assert.equal(s.spawnWarnings[0]?.variant,true);tick(s,1.3);
  assert.ok(s.enemies.some(e=>e.variant));assert.ok(s.variantSpawnCount>=1);
});

test('charged F deals 75 and stuns a variant; the uncharged combo still damages it normally',()=>{
  for(const dt of [.05,1/60,1/120]){
    const s=state(),e=enemy(s,'macabro',{x:0,y:0,z:10});
    e.cast={remaining:2,dx:0,dz:1};s.hazards.push({id:999,owner:e.id,kind:'obsidian-spikes',x:0,y:0,z:12,age:0,warning:1,duration:1,radius:1});
    activateMacuahuitl(s);tick(s,MACUAHUITL.impactTime,dt);
    assert.equal(e.hp,200-75);assert.equal(s.kills,0);assert.equal(e.cast,null);assert.equal(s.hazards.length,0);
    assert.equal(s.events.find(event=>event.type==='macuahuitlImpact').resistant,true);
    close(e.shockStunUntil-s.time,2);tick(s,MACUAHUITL.duration-MACUAHUITL.impactTime,dt);close(s.macuahuitlCooldown,8);
    activateMacuahuitl(s);tick(s,MACUAHUITL.duration,dt);assert.equal(e.hp,125-s.macuahuitlDamage);assert.equal(s.kills,0);
    close(s.macuahuitlCooldown,8-MACUAHUITL.duration);
  }
  const s=state(),normal=enemy(s,'macabro',{x:0,y:0,z:10},false);activateMacuahuitl(s);tick(s,.62);assert.equal(normal.hp,0);
});

test('projectiles and sector attacks snapshot 30% extra damage, including Tejedor overrides, after their owner dies',()=>{
  for(const [kind,base,count] of [['macabro',8,1],['abominacion',10,3],['centinela',12,2],['tejedor',7,3]]){
    const s=state(),e=enemy(s,kind);e.attack=0;step(s,{},.01);tick(s,e.windup+.01);
    const shots=s.projectiles.filter(b=>b.owner===e.id);assert.equal(shots.length,count,kind);
    for(const shot of shots)close(shot.damage,base*1.3);
    hitEnemy(s,e,e.hp,'weapon');s.enemies=[];tick(s,.01);
    for(const shot of shots)close(shot.damage,base*1.3);
  }
  const s=state(),e=enemy(s,'empalador');e.attack=0;step(s,{},.01);assert.equal(s.hazards.length,3);
  for(const h of s.hazards)close(h.damage,16*1.3);
  hitEnemy(s,e,e.hp);s.enemies=[];tick(s,1.1);close(s.shield,100-16*1.3);
  const slam=state(),guard=enemy(slam,'centinela');guard.attack=0;guard.attacks=1;step(slam,{},.01);
  assert.equal(slam.hazards.length,1);close(slam.hazards[0].damage,26);assert.equal(slam.hazards[0].flameWave,true);
});

test('variant melee, Devorador charges and death bursts, and Acechador leaps use increased contact damage once',()=>{
  const melee=state(),a=enemy(melee,'macabro',{x:0,y:0,z:10.6});a.attack=0;step(melee,{},.01);close(melee.shield,100-9*1.3);
  const charge=state(),b=enemy(charge,'devorador',{x:0,y:0,z:11.2});b.charge={dx:0,dz:1,remaining:1,hit:false};step(charge,{},.01);close(charge.shield,100-16*1.3);
  const burst=state(),c=enemy(burst,'devorador',{x:0,y:0,z:11});hitEnemy(burst,c,c.hp);close(burst.shield,100-10*1.3);
  const leap=state(),d=enemy(leap,'acechador',{x:0,y:0,z:11.5});launch(d,{x:0,y:0,z:12},1);step(leap,{},.01);close(leap.shield,100-18*1.3);step(leap,{},.01);close(leap.shield,100-18*1.3);
});

test('Devoradores born from a variant Abomination inherit the variant and burning still rewards the normal ammo amounts',()=>{
  const s=state(),e=enemy(s,'abominacion',{x:0,y:0,z:7});e.flameMarked=true;hitEnemy(s,e,e.hp,'weapon');
  const children=s.enemies.filter(a=>a.kind==='devorador');assert.equal(children.length,2);
  for(const child of children){assert.equal(child.variant,true);assert.equal(child.hp,140);assert.equal(child.macuahuitlImmune,true);}
  const ammo=s.drops.filter(d=>d.kind==='ammo');assert.equal(ammo.length,3);
  for(const [type,min,max] of [['small',15,20],['large',7,10],['obsidian',10,18]]){const d=ammo.find(d=>d.ammoType===type);assert.ok(d.amount>=min&&d.amount<=max);}
});

test('ground flame wave announces once at activation and a cancelled Centinela warning never erupts',()=>{
  const s=state(),e=enemy(s,'centinela',undefined,false);e.attack=0;e.attacks=1;step(s,{},.01);
  const h=s.hazards[0];assert.equal(h.flameWave,true);assert.equal(s.events.some(e=>e.type==='groundFireWave'),false);
  tick(s,.9);const events=s.events.filter(e=>e.type==='groundFireWave');assert.equal(events.length,1);
  assert.equal(events[0].id,h.id);assert.equal(events[0].owner,e.id);assert.equal(events[0].duration,h.duration);tick(s,.5);assert.equal(s.events.filter(e=>e.type==='groundFireWave').length,1);
  const canceled=state(),guard=enemy(canceled,'centinela',{x:0,y:0,z:10},false);guard.attacks=1;guard.attack=0;step(canceled,{},.01);
  assert.equal(canceled.hazards.length,1);activateMacuahuitl(canceled);tick(canceled,.62);assert.equal(canceled.hazards.length,0);tick(canceled,1);
  assert.equal(canceled.events.some(e=>e.type==='groundFireWave'),false);
});
