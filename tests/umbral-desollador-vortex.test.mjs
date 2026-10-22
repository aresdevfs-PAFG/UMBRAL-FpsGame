import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,step,hitEnemy,damagePlayer,activateMacuahuitl,selectWeapon,fire,setRifleScope} from '../public/assets/js/umbral-core.mjs';
import {DESOLLADOR,stopDesolladorVortex,desolladorPose} from '../public/assets/js/umbral-desollador.mjs';
import {getArena} from '../public/assets/js/umbral-arena.mjs';
import {createBossDemoState} from '../public/assets/js/umbral-boss-demo.mjs';

const arena=getArena('corona');
const point=p=>({x:p.x,y:p.y,z:p.z});
function setup(at={x:5,y:0,z:27}){
  const s=createState('corona');
  Object.assign(s,{phase:'playing',portalUsed:true,health:100,shield:100,pending:0,nextWave:999});
  Object.assign(s.player,at,{safe:{...at},grounded:true,vy:0});
  const e=createEnemy(s,'desollador',{x:5,y:1.2,z:8});
  Object.assign(e,{attacks:2,attack:0});
  return {s,e};
}
function until(s,predicate,seconds=15,input=()=>({}),dt=1/60){
  for(let i=0;i<Math.ceil(seconds/dt)&&!predicate();i++)step(s,input(),dt);
  assert.ok(predicate(),'expected encounter state before timeout');
}
function ticks(s,seconds,input={}){for(let i=0;i<Math.ceil(seconds*60);i++)step(s,input,1/60);}
function captured(s){until(s,()=>!!s.player.windCapture,5);}
function aim(s,e){
  const dx=e.x-s.player.x,dz=e.z-s.player.z,dy=e.y+e.height*.5-s.player.y-1.6;
  s.player.yaw=Math.atan2(-dx,-dz);s.player.pitch=Math.atan2(dy,Math.hypot(dx,dz));
}
function supported(p){
  assert.ok(!arena.solid(p.x,p.z,.32,p.y,p.height));
  assert.ok(p.grounded);assert.equal(arena.groundHeight(p.x,p.z,p.y+.05),p.y);
  for(const dx of [-.55,.55])for(const dz of [-.55,.55])assert.ok(Math.abs(arena.groundHeight(p.x+dx,p.z+dz,p.y+.05)-p.y)<.05);
}

test('sword slashes apply exactly 50 through shields, overflow health and lethal damage',()=>{
  for(const [shield,health,wantShield,wantHealth] of [[100,100,50,100],[20,100,0,70],[0,50,0,0]]){
    const {s,e}=setup();Object.assign(s,{shield,health,shieldRegenAt:Infinity});Object.assign(e,{x:5,y:0,z:24});
    step(s,{},1/60);assert.equal(e.cast.attack,'melee');
    ticks(s,.7);assert.equal(s.shield,wantShield);assert.equal(s.health,wantHealth);
    assert.equal(s.events.filter(x=>x.type==='desolladorSlash').length,1);
    assert.equal(s.phase,wantHealth?'playing':'dead');
  }
});

test('a telegraphed close slash can be dodged before it resolves',()=>{
  const {s,e}=setup();Object.assign(e,{x:5,y:0,z:24});step(s,{},1/60);
  assert.equal(e.cast.attack,'melee');s.player.x=13;ticks(s,.7);
  assert.equal(s.shield,100);assert.equal(s.health,100);assert.ok(!s.events.some(x=>x.type==='desolladorSlash'));
});

test('sniper and bow hit the enlarged visible crown above the movement body, but miss above the sprite',()=>{
  for(const weapon of [2,4])for(const above of [false,true]){
    const {s,e}=setup();Object.assign(e,{x:5,y:20,z:8});
    assert.ok(e.hitHeight>e.height,'the crown has a taller hit volume than the movement body');
    const crown=e.y+e.hitHeight-.2,targetY=above?e.y+e.hitHeight+.75:crown;
    // Fire horizontally in open air so the ray crosses this exact slice of the
    // head, without an angled ray accidentally striking the lower body first.
    Object.assign(s.player,{x:5,y:targetY-1.6,z:27,yaw:0,pitch:0});
    assert.ok(crown>e.y+e.height,'the tested crown lies above the previous hitbox');
    if(above)assert.ok(targetY>e.y+.02+e.width*DESOLLADOR.spriteAspect*(1-.065),'miss is above the full sprite quad');
    selectWeapon(s,weapon);if(weapon===2)setRifleScope(s,true);
    const hp=e.hp;assert.ok(fire(s));
    if(above){assert.equal(e.hp,hp);assert.ok(!s.events.some(x=>x.type==='hit'));}
    else{assert.ok(e.hp<hp);assert.ok(s.events.some(x=>x.type==='hit'&&x.id===e.id));}
    assert.ok(s.events.some(x=>x.type===(weapon===2?'sniperTrail':'bowTrail')));
  }
});

test('vortex sweeps safely from ground, both terraces, sanctuary and below a terrace',()=>{
  for(const at of [{x:5,y:0,z:27},{x:-24,y:3,z:3},{x:24,y:3,z:-3},{x:0,y:6,z:-23},{x:-30,y:0,z:0}]){
    const {s,e}=setup(at);captured(s);
    assert.equal(e.x,0);assert.equal(e.z,0);assert.equal(arena.groundHeight(e.x,e.z),-Infinity);
    assert.equal(e.windSuction.maxHp,DESOLLADOR.vortexHealth);
    const safe={...s.player.windCapture.safe};let maxY=s.player.y;
    until(s,()=>s.player.windCapture?.phase==='strike',9,()=>{
      const p=s.player;assert.ok([p.x,p.y,p.z].every(Number.isFinite));
      assert.ok(!arena.solid(p.x,p.z,.32,p.y,p.height),`capture intersects geometry from ${JSON.stringify(at)}`);
      maxY=Math.max(maxY,p.y);return {forward:1,strafe:1,jump:true};
    });
    assert.ok(maxY>at.y+3);hitEnemy(s,e,DESOLLADOR.vortexHealth);
    assert.equal(s.player.windCapture.phase,'return');
    until(s,()=>!s.player.windCapture,3,()=>{
      const p=s.player;assert.ok(!arena.solid(p.x,p.z,.32,p.y,p.height),'return intersects geometry');return {};
    });
    assert.deepEqual(point(s.player),safe);supported(s.player);
    assert.equal(s.health,100);assert.equal(s.shield,100);assert.ok(!s.events.some(x=>x.type==='fallRecovery'));
  }
});

test('unanswered vortex delivers eight slashes over four seconds for exactly 70 damage at 20, 60 and 120 Hz',()=>{
  for(const dt of [1/20,1/60,1/120]){
    const {s,e}=setup();until(s,()=>!!s.player.windCapture,5,()=>({}),dt);
    until(s,()=>s.player.windCapture?.phase==='combo',10,()=>({}),dt);
    assert.equal(s.shield,100);assert.equal(s.health,100);
    const start=s.time,hitTimes=[];let previousHits=0;
    until(s,()=>s.player.windCapture?.phase==='return',5,()=>{
      const hits=s.events.filter(x=>x.type==='desolladorComboHit').length;
      if(hits>previousHits){hitTimes.push(s.time);previousHits=hits;}
      assert.equal(desolladorPose(e).state,'attack','the boss visibly uses its swords throughout the combo');
      return {};
    },dt);
    assert.ok(Math.abs(s.time-start-4)<dt*2+.001,'the combo lasts four seconds');
    assert.equal(s.shield,30);assert.equal(s.health,100);assert.equal(e.windSuction,null);
    const hits=s.events.filter(x=>x.type==='desolladorComboHit');
    assert.equal(hits.length,8);assert.equal(hits.reduce((total,x)=>total+x.damage,0),70);
    assert.ok(hitTimes.at(-1)-hitTimes[0]>3.4,'the damage is spread across the animation');
    until(s,()=>!s.player.windCapture,3,()=>({}),dt);supported(s.player);
    assert.equal(s.events.filter(x=>x.type==='desolladorComboHit').length,8);
    assert.ok(!s.events.some(x=>x.type==='fallRecovery'));
  }
});

test('the vortex spirals around the boss for a full turn without teleporting or entering geometry',()=>{
  for(const dt of [1/20,1/60,1/120]){
    const {s,e}=setup();until(s,()=>s.player.windCapture?.phase==='pull',7,()=>({}),dt);
    let previous=point(s.player),angle=Math.atan2(previous.z-e.z,previous.x-e.x),rotation=0,maxStep=0;
    const initialDistance=Math.hypot(previous.x-e.x,previous.z-e.z);
    until(s,()=>s.player.windCapture?.phase==='strike',8,()=>{
      const p=s.player,nextAngle=Math.atan2(p.z-e.z,p.x-e.x);
      rotation+=Math.atan2(Math.sin(nextAngle-angle),Math.cos(nextAngle-angle));angle=nextAngle;
      maxStep=Math.max(maxStep,Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z));previous=point(p);
      assert.ok([p.x,p.y,p.z,p.yaw,p.pitch].every(Number.isFinite));
      assert.ok(!arena.solid(p.x,p.z,.32,p.y,p.height),'orbit must stay above the arena geometry');
      return {};
    },dt);
    assert.ok(Math.abs(rotation)>Math.PI*2,`expected an orbit, got ${rotation} radians`);
    assert.ok(Math.hypot(s.player.x-e.x,s.player.z-e.z)<initialDistance*.25,'orbit closes toward the boss');
    assert.ok(maxStep<4,`unexpected teleport of ${maxStep} units`);
  }
});

test('the combo absorbs damage with shields first, overflows health and stops immediately on player death',()=>{
  for(const [shield,health,wantShield,wantHealth] of [[100,100,30,100],[20,100,0,50],[0,100,0,30],[0,50,0,0]]){
    const {s,e}=setup();Object.assign(s,{shield,health,shieldRegenAt:Infinity});
    until(s,()=>s.player.windCapture?.phase==='combo',15);
    until(s,()=>s.phase==='dead'||s.player.windCapture?.phase==='return',5);
    assert.equal(s.shield,wantShield);assert.equal(s.health,wantHealth);
    if(wantHealth){until(s,()=>!s.player.windCapture,3);supported(s.player);}
    else{
      assert.equal(s.phase,'dead');assert.equal(s.player.windCapture,null);assert.equal(e.windSuction,null);
      const count=s.events.filter(x=>x.type==='desolladorComboHit').length;ticks(s,3);
      assert.equal(s.events.filter(x=>x.type==='desolladorComboHit').length,count);
    }
  }
});

test('the interrupt meter closes during the combo while normal weapon damage still reaches the boss',()=>{
  const {s,e}=setup();until(s,()=>s.player.windCapture?.phase==='combo',15);
  const hp=e.hp,w=e.windSuction;hitEnemy(s,e,DESOLLADOR.vortexHealth);
  assert.equal(e.hp,hp-DESOLLADOR.vortexHealth);assert.equal(e.windSuction,w);
  assert.equal(s.player.windCapture.phase,'combo');
  assert.ok(!s.events.some(x=>x.type==='desolladorVortexBroken'));
});

test('pause freezes an ongoing sword combo and resuming does not duplicate its damage',()=>{
  const {s,e}=setup();until(s,()=>s.player.windCapture?.phase==='combo',15);ticks(s,1.1);
  const health=s.health,shield=s.shield,combo=JSON.stringify(e.windSuction),player=JSON.stringify(s.player);
  s.phase='paused';ticks(s,3);
  assert.equal(s.health,health);assert.equal(s.shield,shield);
  assert.equal(JSON.stringify(e.windSuction),combo);assert.equal(JSON.stringify(s.player),player);
  s.phase='playing';until(s,()=>s.player.windCapture?.phase==='return',4);
  assert.equal(s.shield,30);assert.equal(s.events.filter(x=>x.type==='desolladorComboHit').length,8);
  until(s,()=>!s.player.windCapture,3);supported(s.player);
});

test('rifle sustained input and scoped shots still hit and break the vortex while airborne',()=>{
  for(const secondary of [false,true]){
    const {s,e}=setup();captured(s);until(s,()=>s.player.windCapture.phase==='pull',2);
    selectWeapon(s,2);const before=s.ammo.obsidian,health=e.hp;
    until(s,()=>!e.windSuction,5,()=>{aim(s,e);return {primary:true,secondary,forward:1};});
    assert.ok(s.ammo.obsidian<before);assert.ok(e.hp<health);assert.equal(s.player.windCapture.phase,'return');
    assert.ok(s.events.some(x=>x.type==='desolladorVortexBroken'));
    assert.ok(s.events.some(x=>x.type===(secondary?'sniperTrail':'trace')));
    until(s,()=>!s.player.windCapture,3);supported(s.player);
  }
});

test('primary bow, shotgun, gauss, submachine gun and knife hits can deplete the separate vortex meter',()=>{
  for(const selected of [0,1,3,4,5]){
    const {s,e}=setup();captured(s);until(s,()=>s.player.windCapture.phase==='strike',9);
    selectWeapon(s,selected);aim(s,e);const before=e.windSuction.hp;
    step(s,{primary:true},1/60);
    assert.ok(!e.windSuction||e.windSuction.hp<before,`weapon ${selected} must damage the vortex`);
  }
});

test('pause freezes the vortex and return timelines without moving player aim',()=>{
  const {s,e}=setup();captured(s);ticks(s,.4);s.player.yaw=.73;s.player.pitch=.4;
  s.phase='paused';const before=JSON.stringify({p:s.player,w:e.windSuction,time:s.time});ticks(s,2);
  assert.equal(JSON.stringify({p:s.player,w:e.windSuction,time:s.time}),before);
  s.phase='playing';stopDesolladorVortex(s,e);ticks(s,.3);s.phase='paused';
  const returning=JSON.stringify(s.player);ticks(s,2);assert.equal(JSON.stringify(s.player),returning);
  s.phase='playing';until(s,()=>!s.player.windCapture,3);assert.equal(s.player.yaw,.73);assert.equal(s.player.pitch,.4);
});

test('charged F at the terminal approach interrupts and safely returns the captured player',()=>{
  const {s,e}=setup();captured(s);until(s,()=>s.player.windCapture.phase==='strike',9);aim(s,e);
  assert.ok(activateMacuahuitl(s));until(s,()=>s.player.windCapture?.phase==='return',1);
  assert.equal(e.windSuction,null);assert.ok(e.shockStunUntil>s.time);assert.equal(s.shield,100);
  until(s,()=>!s.player.windCapture,3);supported(s.player);
});

test('charged F or killing the boss during its sword combo cancels remaining slashes and returns safely',()=>{
  for(const reason of ['charged-F','boss-death']){
    const {s,e}=setup();until(s,()=>s.player.windCapture?.phase==='combo',15);ticks(s,.8);
    if(reason==='boss-death')hitEnemy(s,e,20000);
    else{aim(s,e);assert.ok(activateMacuahuitl(s));until(s,()=>s.player.windCapture?.phase==='return',1);}
    assert.equal(e.windSuction,null);
    const shield=s.shield,hits=s.events.filter(x=>x.type==='desolladorComboHit').length;
    assert.ok(hits>0&&hits<8,'the interruption occurs after damage has begun');
    until(s,()=>!s.player.windCapture,3);supported(s.player);
    assert.equal(s.shield,shield);assert.equal(s.events.filter(x=>x.type==='desolladorComboHit').length,hits);
  }
});

test('charged F shockwave also releases capture when a nearby imp was the primary target',()=>{
  const {s,e}=setup();captured(s);until(s,()=>s.player.windCapture.phase==='strike',9);
  const p=s.player,d=Math.hypot(e.x-p.x,e.z-p.z);
  const imp=createEnemy(s,'macabro',{x:p.x+(e.x-p.x)/d,y:p.y,z:p.z+(e.z-p.z)/d});
  aim(s,imp);assert.ok(activateMacuahuitl(s));until(s,()=>s.player.windCapture?.phase==='return',1);
  assert.ok(imp.hp<=0);assert.equal(e.hp,18000);assert.equal(e.windSuction,null);assert.ok(e.shockStunUntil>s.time);
  until(s,()=>!s.player.windCapture,3);supported(s.player);
});

test('boss death or disappearance returns the player, while player death clears capture immediately',()=>{
  for(const reason of ['boss-death','missing-owner','player-death']){
    const {s,e}=setup();captured(s);ticks(s,2);
    if(reason==='boss-death')hitEnemy(s,e,20000);
    else if(reason==='missing-owner')s.enemies=[];
    else damagePlayer(s,500);
    if(reason==='player-death'){
      assert.equal(s.phase,'dead');assert.equal(s.player.windCapture,null);assert.equal(e.windSuction,null);assert.equal(e.vortexTravel,null);
    }else{until(s,()=>!s.player.windCapture,3);supported(s.player);assert.ok(!s.events.some(x=>x.type==='fallRecovery'));}
  }
});

test('killing the boss during capture returns player before practice completion',()=>{
  const s=createBossDemoState('desollador');s.phase='playing';const e=s.enemies[0];Object.assign(e,{attacks:2,attack:0});
  captured(s);ticks(s,2);hitEnemy(s,e,20000);
  until(s,()=>s.phase==='boss-demo-complete',4);
  assert.equal(s.player.windCapture,null);supported(s.player);assert.equal(s.clearedWave,10);
});

test('a jump pad keeps its flight, and the vortex captures after a safe landing',()=>{
  const {s,e}=setup({x:0,y:0,z:24});
  step(s,{},1/60);assert.ok(s.player.flight);const f=s.player.flight;
  // Start channeling during the already active jump. It cannot hijack flight.
  e.cast=null;e.vortexTravel=null;Object.assign(e,{x:0,y:7,z:0,windSuction:{age:0,phase:'lift',hp:DESOLLADOR.vortexHealth,maxHp:DESOLLADOR.vortexHealth}});
  step(s,{},1/60);assert.equal(s.player.flight,f);assert.ok(!s.player.windCapture);
  until(s,()=>!!s.player.windCapture,4);assert.equal(s.player.flight,null);
  stopDesolladorVortex(s,e);until(s,()=>!s.player.windCapture,3);supported(s.player);
});
