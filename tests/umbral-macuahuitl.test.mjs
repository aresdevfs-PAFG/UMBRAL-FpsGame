import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createState,createEnemy,activateMacuahuitl,activateFlames,selectWeapon,fire,step,hitEnemy,WEAPONS,MACUAHUITL,FLAMES} from '../public/assets/js/umbral-core.mjs';
import {macuahuitlPose} from '../public/assets/js/umbral-macuahuitl.js';
function run(){const s=createState();s.phase='playing';s.portalUsed=true;s.health=100;s.nextWave=999;s.nextAmmoSpawn=999;s.supplies=[];Object.assign(s.player,{x:0,z:12,y:0,yaw:0,pitch:0});return s;}
function advance(s,seconds,dt=.01){for(let t=0;t<seconds-1e-9;t+=dt)step(s,{},Math.min(dt,seconds-t));}
function target(s,kind='macabro',x=0,z=10,y=0){const e=createEnemy(s,kind,{x,z,y});e.speed=0;e.attack=999;return e;}

test('macuahuitl is a separate F ability, not a numbered or clickable weapon; R remains flames',()=>{
  assert.equal(WEAPONS.length,6);assert.equal(WEAPONS.some(w=>w.id==='macuahuitl'),false);
  assert.equal(WEAPONS[0].id,'coaiztlactli');assert.equal(WEAPONS[4].id,'arco-jaguar');
  const js=readFileSync(new URL('../public/assets/js/umbral-demo.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/img/umbral-demo/assets.json',import.meta.url),'utf8'));
  assert.match(js,/e\.code==='KeyF'\)\{e\.preventDefault\(\);if\(!e\.repeat\)activateMacuahuitl\(s\)/);
  assert.match(js,/e\.code==='KeyR'\)\{e\.preventDefault\(\);if\(!e\.repeat\)activateFlames\(s\)/);
  assert.doesNotMatch(html,/<button[^>]*aria-label="\d Â· Macuahuitl"/);
  assert.equal(manifest.weapons.some(w=>w.id==='macuahuitl'),false);assert.equal(manifest.abilities.macuahuitl.key,'F');
});

test('a free swing executes exactly one aimed target of every enemy type at the animation impact',()=>{
  for(const kind of ['macabro','devorador','empalador','abominacion','centinela']){
    const s=run(),direct=target(s,kind),near=target(s,'centinela',2,10),ammo={...s.ammo},selected=s.selected;
    assert.equal(activateMacuahuitl(s),true);assert.equal(activateMacuahuitl(s),false);
    advance(s,MACUAHUITL.impactTime-.01);assert.ok(direct.hp>0);assert.equal(s.kills,0);
    advance(s,.01);assert.ok(direct.hp<=0);assert.equal(s.kills,1);assert.equal(near.hp,620);
    assert.ok(Math.abs(near.shockStunUntil-s.time-2)<1e-8);assert.deepEqual(s.ammo,ammo);assert.equal(s.selected,selected);
    advance(s,.5);assert.equal(s.kills,1);assert.equal(s.events.filter(e=>e.type==='macuahuitlImpact').length,1);
  }
});

test('range, facing, pitch and cover prevent executions; a miss produces no shockwave',()=>{
  for(const point of [{x:0,z:8},{x:0,z:14},{x:3,z:11},{x:0,z:10,y:6}]){
    const s=run(),e=target(s,'macabro',point.x,point.z,point.y??0);activateMacuahuitl(s);advance(s,.3);
    assert.equal(e.hp,100);assert.equal(s.events.some(e=>e.type==='macuahuitlImpact'),false);
  }
  const s=run();Object.assign(s.player,{x:7,z:9.3});const hidden=target(s,'macabro',7,6.5);
  activateMacuahuitl(s);advance(s,.3);assert.equal(hidden.hp,100);
});

test('targeting is resolved at impact: turning away can miss and lined-up enemies are not cleaved',()=>{
  const s=run(),near=target(s),far=target(s,'macabro',0,9.1);
  activateMacuahuitl(s);advance(s,.12);s.player.yaw=Math.PI;advance(s,.2);assert.equal(near.hp,100);
  const fresh=run(),a=target(fresh),b=target(fresh,'macabro',0,9.1);
  activateMacuahuitl(fresh);advance(fresh,.24);assert.equal(a.hp,0);assert.equal(b.hp,100);assert.ok(b.shockStunUntil>fresh.time);
});

test('shockwave respects distance, pillar walls and bridge floors',()=>{
  const s=run();s.player.x=3.8;target(s,'macabro',3.8,9.2);
  const hidden=target(s,'macabro',7,4.6),far=target(s,'macabro',-5,9.2);
  activateMacuahuitl(s);advance(s,.24);assert.equal(s.kills,1);assert.equal(hidden.shockStunUntil,0);assert.equal(far.shockStunUntil,0);
  const below=run();Object.assign(below.player,{z:-4});target(below,'macabro',0,-6);
  const above=target(below,'macabro',0,-7.5,6);activateMacuahuitl(below);advance(below,.24);
  assert.equal(below.kills,1);assert.equal(above.shockStunUntil,0);
});

test('two-second stun cancels casts, charges and pending ground attacks, then allows combat again',()=>{
  const s=run();target(s);const caster=target(s,'macabro',2,10),charger=target(s,'devorador',-2,10),spiker=target(s,'empalador',3,10);
  activateMacuahuitl(s);advance(s,.23);
  caster.cast={remaining:.005,dx:0,dz:1};caster.attack=0;
  charger.charge={remaining:1,dx:0,dz:1,hit:false};
  s.hazards.push({id:999,owner:spiker.id,kind:'obsidian-spikes',x:0,z:12,y:0,age:0,warning:1,duration:.65,radius:1,hit:false});
  advance(s,.01);assert.equal(caster.cast,null);assert.equal(charger.charge,null);assert.equal(s.hazards.length,0);assert.equal(s.projectiles.length,0);
  const position={x:charger.x,z:charger.z};hitEnemy(s,caster,1);advance(s,1.99);
  assert.deepEqual({x:charger.x,z:charger.z},position);assert.equal(caster.cast,null);assert.equal(s.projectiles.length,0);
  advance(s,.02);assert.ok(caster.cast);assert.equal(s.health,100);
});

test('stun duration is independent of simulation frame rate',()=>{
  for(const dt of [.05,1/60,1/120]){
    const s=run();target(s);const neighbor=target(s,'centinela',2,10);
    activateMacuahuitl(s);advance(s,.24,dt);neighbor.attack=0;
    assert.ok(Math.abs(neighbor.shockStunUntil-s.time-2)<1e-7);
    advance(s,1.99,dt);assert.equal(neighbor.cast,null);advance(s,.02,dt);assert.ok(neighbor.cast);
  }
});

test('eight-second recovery is independent of weapon switches and the eight-second flame cooldown',()=>{
  const s=run();target(s);activateMacuahuitl(s);advance(s,MACUAHUITL.duration);
  assert.ok(Math.abs(s.macuahuitlCooldown-8)<1e-8);selectWeapon(s,4);
  assert.equal(activateFlames(s),true);advance(s,1);assert.ok(Math.abs(s.flameCooldown-8)<1e-8);
  advance(s,6.99);assert.ok(Math.abs(s.macuahuitlCooldown-.01)<1e-8);advance(s,.01);assert.equal(activateMacuahuitl(s),true);
  assert.equal(s.macuahuitlCharged,true);
  assert.ok(s.flameCooldown>0);assert.equal(FLAMES.cooldown,8);
});

test('active powers exclude each other and firing, but cooldowns do not block ordinary weapons',()=>{
  const s=run();activateMacuahuitl(s);assert.equal(activateFlames(s),false);assert.equal(fire(s),false);
  advance(s,.62);assert.equal(fire(s),true);assert.equal(activateFlames(s),true);assert.equal(activateMacuahuitl(s),false);
  advance(s,1);s.cooldown=0;assert.equal(fire(s),true);
});

test('a macuahuitl execution of a previously burned target still drops all three ammunition types once',()=>{
  const s=run(),e=target(s,'centinela');activateFlames(s);advance(s,1);assert.equal(e.flameMarked,true);
  activateMacuahuitl(s);advance(s,.62);assert.equal(s.kills,1);assert.ok(s.drops.length>=4&&s.drops.length<=6);
  assert.deepEqual(s.drops.filter(d=>d.kind==='ammo').map(d=>d.ammoType).sort(),['large','obsidian','small']);
  const count=s.drops.length;hitEnemy(s,e,999);assert.equal(s.drops.length,count);
});

test('pause/death freeze swings, stun and cooldown; a new run resets all special-power state',()=>{
  for(const phase of ['paused','dead']){
    const s=run();target(s);target(s,'macabro',2,10);activateMacuahuitl(s);advance(s,.3);s.phase=phase;
    const before=structuredClone(s);assert.equal(activateMacuahuitl(s),false);advance(s,10);assert.deepEqual(s,before);
  }
  const fresh=createState();assert.equal(fresh.macuahuitlCooldown,0);assert.equal(fresh.macuahuitlRemaining,0);assert.equal(fresh.macuahuitlHit,false);
});

test('safe entrance swings animate without spending the power, starting hordes or damaging anything',()=>{
  const s=createState();s.phase='playing';const e=target(s,'macabro',0,34);activateMacuahuitl(s);advance(s,.62);
  assert.equal(s.health,5);assert.equal(e.hp,100);assert.equal(s.wave,0);assert.equal(s.macuahuitlCooldown,0);
});

test('missing never spends a ready power or resets an existing recharge, at several frame rates',()=>{
  for(const dt of [.05,1/60,1/120])for(const initial of [0,5]){
    const s=run();s.macuahuitlCooldown=initial;
    assert.equal(activateMacuahuitl(s),true);advance(s,MACUAHUITL.duration,dt);
    assert.ok(Math.abs(s.macuahuitlCooldown-Math.max(0,initial-MACUAHUITL.duration))<1e-8);
    assert.equal(s.events.filter(e=>e.type==='macuahuitlMiss').length,1);
    assert.equal(s.events.some(e=>e.type==='macuahuitlImpact'||e.type==='macuahuitlMeleeImpact'),false);
    assert.equal(activateMacuahuitl(s),true);
  }
  const s=run(),e=target(s);activateMacuahuitl(s);advance(s,.1);s.player.yaw=Math.PI;advance(s,.52);
  assert.equal(e.hp,100);assert.equal(s.macuahuitlCooldown,0,'turning away during the swing keeps the charge');
});

test('F during recharge cycles 90, 120, 180 damage without executing, stunning or spending the power',()=>{
  const s=run(),e=target(s,'centinela'),neighbor=target(s,'macabro',2,10);s.macuahuitlCooldown=8;
  let damage=0;
  for(let i=0;i<4;i++){
    assert.equal(activateMacuahuitl(s),true);assert.equal(s.macuahuitlCharged,false);
    assert.equal(s.macuahuitlCombo,i%3+1);
    if(i%3===0)assert.equal(s.macuahuitlDamage,90);
    else assert.equal(s.macuahuitlDamage,i%3===1?120:180);
    damage+=s.macuahuitlDamage;
    assert.equal(activateMacuahuitl(s),false);advance(s,.62);
    assert.equal(e.hp,620-damage);assert.ok(Math.abs(s.macuahuitlCooldown-(8-.62*(i+1)))<1e-8);
  }
  assert.equal(neighbor.hp,100);assert.equal(neighbor.shockStunUntil,0);assert.equal(s.drops.length,0);
  assert.equal(s.events.filter(e=>e.type==='macuahuitlMeleeImpact').length,4);
  assert.equal(s.events.some(e=>e.type==='macuahuitlImpact'),false);
});

test('normal melee kills do not grant sacrifice life but still grant ammo for a previously burned enemy',()=>{
  for(const burned of [false,true]){
    const s=run(),e=target(s);s.macuahuitlCooldown=8;e.flameMarked=burned;
    for(let i=0;i<4;i++){activateMacuahuitl(s);advance(s,.62);}
    assert.ok(e.hp<=0);assert.equal(s.kills,1);assert.equal(s.drops.filter(d=>d.kind==='health').length,0);
    assert.equal(s.events.some(e=>e.type==='pickup'&&e.kind==='health'),false);
    const ammo=[...s.drops.filter(d=>d.kind==='ammo'),...s.events.filter(e=>e.type==='pickup'&&e.kind==='ammo')];
    assert.deepEqual(ammo.map(d=>d.ammoType).sort(),burned?['large','obsidian','small']:[]);
  }
});

test('recharge completing mid-swing powers the next F press, not the in-flight normal strike',()=>{
  for(const dt of [.05,1/60,1/120]){
    const s=run(),e=target(s,'centinela');s.macuahuitlCooldown=.1;
    activateMacuahuitl(s);advance(s,.62,dt);assert.equal(e.hp,620-s.macuahuitlDamage);assert.equal(s.macuahuitlCooldown,0);
    assert.equal(activateMacuahuitl(s),true);assert.equal(s.macuahuitlCharged,true);
    advance(s,.62,dt);assert.equal(e.hp,0);assert.ok(Math.abs(s.macuahuitlCooldown-8)<1e-8);
    assert.ok(s.drops.some(d=>d.kind==='health'));assert.equal(s.events.filter(e=>e.type==='macuahuitlImpact').length,1);
  }
});

test('a normal swing interrupted by pause or death preserves its damage decision and recharge',()=>{
  for(const phase of ['paused','dead']){
    const s=run(),e=target(s);s.macuahuitlCooldown=4;activateMacuahuitl(s);advance(s,.1);s.phase=phase;
    const paused=structuredClone(s);advance(s,2);assert.deepEqual(s,paused);assert.equal(e.hp,100);
    s.phase='playing';advance(s,.52);assert.equal(e.hp,100-s.macuahuitlDamage);assert.ok(Math.abs(s.macuahuitlCooldown-3.38)<1e-8);
  }
});

test('left-hand slash enters and exits opposite edges with a continuous monotonic sweep',()=>{
  let previous=-Infinity;
  for(let t=0;t<=.62;t+=1/240){const p=macuahuitlPose(t);assert.ok(p.x>=previous);assert.ok(Number.isFinite(p.y)&&Number.isFinite(p.angle));previous=p.x;}
  assert.ok(macuahuitlPose(0).x<0);assert.ok(macuahuitlPose(.62).x>1);
  assert.ok(macuahuitlPose(MACUAHUITL.impactTime).x>.3&&macuahuitlPose(MACUAHUITL.impactTime).x<.5);
});

test('combo recovery buffers one F press without overlapping attacks or adding extra hits',()=>{
  for(const dt of [.05,1/60,1/120]){
    const s=run(),e=target(s,'centinela');s.macuahuitlCooldown=8;
    activateMacuahuitl(s);const first=s.macuahuitlDamage;
    advance(s,.3,dt);assert.equal(e.hp,620-first);
    assert.equal(activateMacuahuitl(s),true);assert.equal(activateMacuahuitl(s),false);
    advance(s,.32,dt);assert.equal(s.macuahuitlCombo,2);assert.equal(e.hp,620-first);
    advance(s,.3,dt);assert.equal(e.hp,620-first-120);
    assert.equal(activateMacuahuitl(s),true);advance(s,.32,dt);
    assert.equal(s.macuahuitlCombo,3);advance(s,.62,dt);
    assert.equal(e.hp,620-first-300);assert.equal(s.macuahuitlRemaining,0);
    assert.ok(Math.abs(s.macuahuitlCooldown-(8-3*.62))<1e-8);
  }
});

test('waiting beyond the combo window resets the next uncharged slash to the left',()=>{
  const s=run();s.macuahuitlCooldown=8;
  activateMacuahuitl(s);advance(s,.62);activateMacuahuitl(s);
  assert.equal(s.macuahuitlCombo,2);advance(s,.62+.81);
  activateMacuahuitl(s);assert.equal(s.macuahuitlCombo,1);
  assert.equal(s.macuahuitlDamage,90);
});

test('right slash crosses right to left and overhead stroke descends without changing hands',()=>{
  let lastX=Infinity,lastY=-Infinity;
  for(let t=0;t<=.62;t+=1/240){
    const right=macuahuitlPose(t,2),down=macuahuitlPose(t,3);
    assert.ok(right.x<=lastX);assert.ok(down.y>=lastY);
    assert.equal(down.x,.5);assert.ok(Number.isFinite(right.angle)&&Number.isFinite(down.angle));
    lastX=right.x;lastY=down.y;
  }
  assert.ok(macuahuitlPose(0,2).x>1);assert.ok(macuahuitlPose(.62,2).x<0);
  assert.ok(macuahuitlPose(0,3).y<0);assert.ok(macuahuitlPose(.62,3).y>1);
});
