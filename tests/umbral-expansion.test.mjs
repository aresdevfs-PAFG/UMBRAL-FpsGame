import test from 'node:test';
import assert from 'node:assert/strict';
import {MAPS,getArena,chooseMap} from '../public/assets/js/umbral-arena.mjs';
import {createState,step,createEnemy,hitEnemy,isShielding,activateMacuahuitl,ENEMY_TYPES} from '../public/assets/js/umbral-core.mjs';
import {updateTraversal} from '../public/assets/js/umbral-traversal.mjs';
const near=(a,b,t=.05)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
function playing(map='cuenca',point={x:0,y:0,z:20}){const s=createState(map);s.phase='playing';s.portalUsed=true;s.health=100;s.pending=0;s.nextWave=1000;Object.assign(s.player,point);return s;}
const tick=(s,seconds,input={})=>{for(let i=0;i<seconds*60;i++)step(s,input,1/60);};
const combatMaps=Object.keys(MAPS).filter(id=>!MAPS[id].practice);

test('three combat maps and random boundary selection; cloned states retain independent geometry',()=>{
  assert.deepEqual(combatMaps,['cuenca','rio','corona']);assert.equal(chooseMap(0),'cuenca');assert.equal(chooseMap(.333),'cuenca');assert.equal(chooseMap(.334),'rio');assert.equal(chooseMap(.667),'corona');assert.equal(chooseMap(1),'corona');
  for(const id of combatMaps){const s=structuredClone(createState(id));assert.equal(s.mapId,id);assert.equal(s.health,5);assert.equal(s.supplies.length,8);}
  assert.equal(getArena('cuenca').groundHeight(0,0),0);assert.equal(getArena('corona').groundHeight(0,0),-Infinity);
});
test('space jumps once per press, peaks near 1.2m and returns in .7s while firing remains available',()=>{
  const s=playing();let max=0;for(let i=0;i<60;i++){step(s,{jump:true,primary:true},1/60);max=Math.max(max,s.player.y);}
  near(max,1.225,.05);near(s.player.y,0);assert.equal(s.events.filter(e=>e.type==='jump').length,1);assert.ok(s.shotSerial>0);
  step(s,{jump:false},1/60);step(s,{jump:true},1/60);assert.ok(s.player.vy>0);
});
test('airborne pause is exact; jump does not penetrate a bridge underside',()=>{
  const s=playing('cuenca',{x:0,z:-7.5,y:3.4});s.player.vy=7;
  step(s,{},1/60);assert.ok(s.player.y+1.75<=5.3);
  s.phase='paused';const before=structuredClone(s);step(s,{jump:true},.05);assert.deepEqual(s,before);
});
test('late jump input is buffered just before landing and coyote time allows leaving an edge',()=>{
  const s=playing();s.player.y=.15;s.player.vy=-3;
  step(s,{jump:true},1/60);tick(s,.1,{jump:true});assert.ok(s.player.vy>0);
  const c=playing('corona',{x:0,z:18.1,y:0});step(c,{},1/60);step(c,{forward:1},.05);step(c,{jump:true},1/60);assert.ok(c.player.vy>0);
});
test('all seals land on their separate destination at 20, 60 and 120 Hz without auto-bouncing',()=>{
  for(const id of Object.keys(MAPS))for(const pad of MAPS[id].PADS)for(const hz of [20,60,120]){
    const s=createState(id);Object.assign(s.player,{x:pad.x,y:pad.y,z:pad.z});
    for(let i=0;i<(pad.duration+1)*hz;i++){s.time+=1/hz;updateTraversal(s,{},1/hz);}
    assert.ok(Math.hypot(s.player.x-pad.to.x,s.player.z-pad.to.z)<.6,`${id}/${pad.id}/${hz}`);near(s.player.y,pad.to.y);
    assert.equal(s.events.filter(e=>e.type==='ascension').length,1);assert.equal(s.player.flight,null);
    assert.equal(getArena(id).solid(s.player.x,s.player.z,.32,s.player.y,1.75),false);
  }
});
test('Corona void recovery deals 15 damage to the shield first and cannot leave a falling player stuck',()=>{
  const s=playing('corona',{x:5,z:24,y:0});step(s,{},1/60);s.player.x=0;s.player.z=0;
  tick(s,1.4);assert.equal(s.health,100);assert.equal(s.shield,85);assert.equal(s.player.grounded,true);near(s.player.z,24);
});
test('all Corona spawns fit every enemy and walking navigation reaches supplies and all elevations',()=>{
  const a=getArena('corona');
  for(const from of a.SPAWNS){for(const type of Object.values(ENEMY_TYPES))assert.equal(a.solid(from.x,from.z,type.radius,from.y,type.height),false,JSON.stringify(from));
    for(const to of a.SUPPLIES)assert.ok(a.navigationPath(from,to).length,`${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    for(const target of [{x:0,z:24,y:0},{x:24,z:0,y:3},{x:0,z:-24,y:6}]){
      const b={...from,height:4.2};let reached=false;
      for(let i=0;i<3000;i++){const next=a.navigate(b,target,.05),dx=next.x-b.x,dz=next.z-b.z,d=Math.hypot(dx,dz);if(d>.01)a.move(b,dx/d*Math.min(.15,d),dz/d*Math.min(.15,d),.95);a.settle(b,.05);
        if(Math.hypot(b.x-target.x,b.z-target.z)<1&&Math.abs(b.y-target.y)<.2){reached=true;break;}}
      assert.equal(reached,true,`${JSON.stringify(from)} -> ${JSON.stringify(target)}`);
    }
  }
});
test('Tejedor protects at most three allies by 35%, does not stack and loses links to cover, stun and death',()=>{
  const s=playing(),w=createEnemy(s,'tejedor',{x:0,z:18,y:0}),w2=createEnemy(s,'tejedor',{x:1,z:18,y:0});
  const allies=[-2,-1,1,2].map(x=>createEnemy(s,'macabro',{x,z:16,y:0}));step(s,{},.001);
  assert.equal(s.shieldLinks.filter(l=>l.from===w.id).length,3);assert.equal(isShielding(s,w,w2),false);
  const e=allies[1];hitEnemy(s,e,20);near(e.hp,87);w.hp=0;w2.shockStunUntil=s.time+2;hitEnemy(s,e,20);near(e.hp,67);
  w.hp=210;w.x=7;w.z=9;e.x=7;e.z=4;assert.equal(isShielding(s,w,e),false);
});
test('macuahuitl execution bypasses shields and interrupts a Tejedor; marked loot stays all three types',()=>{
  const s=playing(),e=createEnemy(s,'macabro',{x:0,z:18,y:0}),w=createEnemy(s,'tejedor',{x:2,z:17,y:0});e.flameMarked=true;
  activateMacuahuitl(s);tick(s,.25);assert.ok(e.hp<=0);assert.ok(w.shockStunUntil>s.time);assert.deepEqual(s.drops.filter(d=>d.kind==='ammo').map(d=>d.ammoType),['small','large','obsidian']);
});
test('Acechador telegraphs a fixed landing, can be dodged, and lands without teleporting through walls',()=>{
  const s=playing(),e=createEnemy(s,'acechador',{x:0,z:12,y:0});e.attack=0;step(s,{},1/60);
  assert.equal(e.anim,'attack');assert.ok(e.cast?.target);const target={...e.cast.target};s.player.x=4;
  tick(s,.5);assert.deepEqual(e.cast.target,target);assert.equal(e.flight,undefined);
  tick(s,.4);assert.ok(e.flight);assert.ok(e.y>0);tick(s,1);assert.equal(s.health,100);assert.equal(s.shield,100);assert.ok(e.grounded);assert.ok(!getArena().solid(e.x,e.z,e.radius,e.y,e.height));
});
test('new enemies enter the first wave in both maps within the cap',()=>{
  for(const id of combatMaps){const s=playing(id,{x:0,z:28,y:getArena(id).groundHeight(0,28)});s.wave=1;s.pending=8;s.nextSpawn=0;s.health=10000;const kinds=new Set();
    for(let i=0;i<60*20;i++){step(s,{},1/60);for(const e of s.enemies)kinds.add(e.kind);assert.ok(s.enemies.filter(e=>e.hp>0).length+s.spawnWarnings.length<=14);}
    assert.ok(kinds.has('acechador'),id);assert.ok(kinds.has('tejedor'),id);
  }
});
test('Acechador can follow a player across the Corona launch connection with a visible windup',()=>{
  const s=playing('corona',{x:-24,z:1,y:3}),e=createEnemy(s,'acechador',{x:0,z:24,y:0});e.attack=0;e.grounded=true;
  step(s,{},1/60);assert.ok(e.cast);near(e.cast.target.y,3);assert.equal(e.anim,'attack');
  tick(s,2.5);assert.ok(e.y>=2.9);assert.ok(Math.hypot(e.x+24,e.z-1)<3);
});
test('Tejedor releases a slow, non-homing three-shot fan while vulnerable',()=>{
  const s=playing(),e=createEnemy(s,'tejedor',{x:0,z:10,y:0});e.attack=0;
  tick(s,1);assert.equal(s.projectiles.filter(p=>p.owner===e.id).length,3);
  for(const b of s.projectiles){assert.equal(b.homing,false);assert.equal(b.speed,6);assert.equal(b.tint,'#c9b4ff');}
});
test('seal air steering remains bounded to the landing and F still interrupts an airborne pursuer',()=>{
  const a=getArena('corona'),s=createState('corona'),pad=a.PADS[0];Object.assign(s.player,{x:pad.x,y:pad.y,z:pad.z});
  for(let i=0;i<90;i++){s.time+=1/60;updateTraversal(s,{strafe:1},1/60);}
  assert.ok(s.player.flight);assert.ok(Math.abs(s.player.flight.steerX)<=.5);
  const fight=playing(),target=createEnemy(fight,'macabro',{x:0,z:18,y:0}),e=createEnemy(fight,'acechador',{x:1,z:17,y:.8});
  e.flight={vx:1,vz:1,remaining:1};e.vy=2;activateMacuahuitl(fight);tick(fight,.25);
  assert.ok(target.hp<=0);assert.equal(e.flight,null);assert.ok(e.shockStunUntil>fight.time);
});
