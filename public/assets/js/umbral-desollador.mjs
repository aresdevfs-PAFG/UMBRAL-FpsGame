import {getArena} from './umbral-arena.mjs';
import {titanLanding} from './umbral-titan.mjs';

const sizeScale=1.45;
export const DESOLLADOR=Object.freeze({health:18000,height:9.2*sizeScale,width:10*sizeScale,radius:.9*sizeScale,spriteAspect:1.15,hover:1.2,
  // The atlas crown extends above the movement body; it must still take hits.
  hitHeight:10*sizeScale*1.15*.91,
  bladeSpeed:18,bladeDamage:24,diveRadius:3.2,recovery:3.2,
  cutDuration:5.5,cutDamage:40,cutRageDamage:50,cutSpeed:22,cutRageSpeed:1.3,
  cutInterval:.6,cutCount:10,cutLife:2,cutWindup:.18,
  meleeDamage:50,meleeRange:4.2,meleeWindup:.65,meleeCooldown:1.7,
  vortexHealth:700,vortexTravel:1.6,vortexLift:1.2,vortexPull:5.8,vortexTurns:1.5,vortexStrike:.7,
  vortexCombo:4,vortexComboDamage:70,vortexComboHits:8,vortexReturn:1.6,suctionRange:65,
  vortexEyeRadius:2.2,vortexEyeHeight:9.2*sizeScale*.5-1.6,vortexOrbitHeight:7*sizeScale});
export const bossForMap=map=>map==='rio'?'madre':map==='corona'?'desollador':map==='cuenca'||map==='titan-demo'?'titan':null;
const emit=(s,type,e,data={})=>s.events.push({type,id:e.id,kind:e.kind,x:e.x,y:e.y,z:e.z,...data});
const point=e=>({x:e.x,y:e.y,z:e.z});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const mix=(a,b,t)=>a+(b-a)*t;
const clear=(a,from,to)=>{const d=dist(from,to);return a.wallDistance(from.x,from.z,(to.x-from.x)/Math.max(.001,d),(to.z-from.z)/Math.max(.001,d),d+.01,from.y,(to.y-from.y)/Math.max(.001,d))>=d-.05;};

// Authored flights are swept against the same volumes used by walking and shots.
// A high corridor clears the terraces; side exits also work below their overhangs.
function segmentClear(a,from,to,r,height){
  const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)/.2));
  for(let i=0;i<=n;i++){const t=i/n;if(a.solid(mix(from.x,to.x,t),mix(from.z,to.z,t),r,mix(from.y,to.y,t),height))return false;}
  return true;
}
function flightPath(a,from,to,r,height){
  const sky=Math.max(from.y,to.y,14);
  const corridors=q=>{
    const candidates=[{...q}];
    for(const distance of [3,6,12,18])for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])candidates.push({x:q.x+dx*distance,y:q.y,z:q.z+dz*distance});
    return candidates.filter(exit=>segmentClear(a,q,exit,r,height)&&segmentClear(a,exit,{...exit,y:sky},r,height));
  };
  const exits=corridors(from),entries=corridors(to);
  for(const exit of exits)for(const entry of entries){
    if(segmentClear(a,{...exit,y:sky},{...entry,y:sky},r,height))
      return [{...from},exit,{...exit,y:sky},{...entry,y:sky},entry,{...to}];
  }
  return null;
}
function pathPoint(points,t){
  const lengths=points.slice(1).map((q,i)=>Math.hypot(q.x-points[i].x,q.y-points[i].y,q.z-points[i].z));
  let remaining=lengths.reduce((a,b)=>a+b,0)*Math.min(1,Math.max(0,t));
  for(let i=0;i<lengths.length;i++){
    if(remaining<=lengths[i]&&lengths[i]>1e-8){const f=remaining/lengths[i];return {x:mix(points[i].x,points[i+1].x,f),y:mix(points[i].y,points[i+1].y,f),z:mix(points[i].z,points[i+1].z,f)};}
    remaining-=lengths[i];
  }
  return {...points.at(-1)};
}
function safeFloor(a,q){
  if(!q||!Number.isFinite(q.y)||a.solid(q.x,q.z,.36,q.y,1.75))return false;
  return [-.55,.55].every(x=>[-.55,.55].every(z=>Math.abs(a.groundHeight(q.x+x,q.z+z,q.y+.05)-q.y)<.05))&&
    !a.PADS.some(p=>dist(p,q)<p.radius+.7);
}
function returnPoint(s){
  const a=getArena(s.mapId),p=s.player;
  const candidates=[point(p),p.safe,...a.SPAWNS.filter(q=>!q.elevated).slice().sort((x,y)=>dist(x,p)-dist(y,p)),a.START];
  return candidates.find(q=>safeFloor(a,q));
}
function returnPlayer(s,e){
  const p=s.player,c=p.windCapture;if(!c||c.owner!==e.id||c.phase==='return')return;
  const a=getArena(s.mapId),safe=c.safe;
  const path=flightPath(a,point(p),safe,.32,p.height);
  // The saved footprint is validated before capture. Emergency recovery cannot
  // strand a player if the encounter is cancelled midway through a flight.
  if(!path){Object.assign(p,safe,{windCapture:null,vy:0,flight:null,grounded:true,padCooldown:1});return;}
  p.windCapture={owner:e.id,phase:'return',age:0,path,safe};p.vy=0;p.flight=null;
  emit(s,'desolladorReturn',e);
}
export function stopDesolladorVortex(s,e,reason='interrupt'){
  returnPlayer(s,e);e.windSuction=null;e.vortexTravel=null;
  if(e.bladeStorm)s.projectiles=s.projectiles.filter(b=>b.owner!==e.id||b.kind!=='wind-cut');
  e.bladeStorm=null;
  e.exposedUntil=s.time+DESOLLADOR.recovery;e.attack=DESOLLADOR.recovery+.8;
  if(e.hp>0){e.anim='move';e.animTime=0;}
  if(reason==='broken')emit(s,'desolladorVortexBroken',e);
}
export function damageDesolladorVortex(s,e,amount){
  const w=e.windSuction;if(!w||w.phase==='combo'||!Number.isFinite(w.hp))return;
  w.hp=Math.max(0,w.hp-amount);
  if(w.hp<=0)stopDesolladorVortex(s,e,'broken');
}
// Called in place of gravity, walking and jump-pad traversal, never in place of
// aiming or weapon input. Returns independently even if its owner has died.
export function updateWindCapture(s,dt){
  const p=s.player,c=p.windCapture;if(!c)return false;
  p.vy=0;p.flight=null;p.grounded=false;p.coyote=0;p.jumpBuffer=0;
  if(c.phase==='return'){
    c.age=Math.min(DESOLLADOR.vortexReturn,c.age+dt);
    const t=c.age/DESOLLADOR.vortexReturn;
    Object.assign(p,pathPoint(c.path,t*t*(3-2*t)));
    if(t>=1)Object.assign(p,c.safe,{safe:{...c.safe},windCapture:null,grounded:true,padCooldown:1});
  }else{
    const e=s.enemies.find(e=>e.id===c.owner);
    if(!e||e.hp<=0||!e.windSuction)returnPlayer(s,{id:c.owner,kind:'desollador',...point(p)});
  }
  return true;
}

function bladeVolley(s,e){
  const p=s.player,from={x:e.x,y:e.y+e.height*.3,z:e.z},dy=p.y+1.05-from.y,d=Math.max(.01,dist(from,p));
  const angle=Math.atan2(p.x-e.x,p.z-e.z),speed=DESOLLADOR.bladeSpeed;
  for(const offset of (e.enraged?[-.28,-.14,0,.14,.28]:[-.18,0,.18])){
    const length=Math.hypot(d,dy),horizontal=d/length*speed;
    s.projectiles.push({id:s.nextId++,owner:e.id,kind:'wind-blade',...from,dx:Math.sin(angle+offset)*horizontal,dz:Math.cos(angle+offset)*horizontal,dy:dy/length*speed,
      speed,gravity:0,homing:false,age:0,life:5,radius:.5,damage:DESOLLADOR.bladeDamage});
  }
  emit(s,'enemyAttack',e,{attack:'blades'});
}

function cutVolley(s,e){
  const w=e.bladeStorm,p=s.player,from={x:e.x,y:e.y+1.05,z:e.z};
  const speed=DESOLLADOR.cutSpeed*(e.enraged?DESOLLADOR.cutRageSpeed:1);
  const damage=e.enraged?DESOLLADOR.cutRageDamage:DESOLLADOR.cutDamage;
  // Alternating spokes leave escape lanes. Every second volley has a spoke
  // aimed at the player; all cuts remain straight, dodgeable projectiles.
  const spacing=Math.PI*2/DESOLLADOR.cutCount;
  const angle=Math.atan2(p.x-e.x,p.z-e.z)+(w.volleys%2)*spacing*.5;
  const pitch=Math.max(-.35,Math.min(.35,Math.atan2(p.y+1.05-from.y,Math.max(1,dist(e,p)))));
  for(let i=0;i<DESOLLADOR.cutCount;i++){
    const heading=angle+i*spacing,horizontal=speed*Math.cos(pitch);
    s.projectiles.push({id:s.nextId++,owner:e.id,kind:'wind-cut',...from,
      dx:Math.sin(heading)*horizontal,dz:Math.cos(heading)*horizontal,dy:Math.sin(pitch)*speed,
      speed,gravity:0,homing:false,age:0,life:DESOLLADOR.cutLife,radius:.45,damage,
      slashMirror:w.volleys%2===1});
  }
  w.volleys++;w.lastVolleyAt=w.nextVolley;
  emit(s,'enemyAttack',e,{attack:'cuts'});
}

function cutStorm(s,e,dt){
  const w=e.bladeStorm;
  w.age=Math.min(DESOLLADOR.cutDuration,w.age+dt);
  const interval=DESOLLADOR.cutInterval/(e.enraged?DESOLLADOR.cutRageSpeed:1);
  // At most 50 short-lived cuts in flight, independent of render FPS.
  while(w.nextVolley<DESOLLADOR.cutDuration&&w.age+1e-8>=w.nextVolley){
    cutVolley(s,e);w.nextVolley+=interval;
  }
  e.vy=0;e.grounded=true;e.anim='attack';
  if(w.age+1e-8>=DESOLLADOR.cutDuration){
    e.bladeStorm=null;e.anim='move';e.animTime=0;
    e.exposedUntil=s.time+DESOLLADOR.recovery;e.attack=DESOLLADOR.recovery+.6;
    emit(s,'desolladorCutsEnd',e);
  }
}

function divePath(s,e,target){
  if(!target)return null;
  const a=getArena(s.mapId),from=point(e);
  for(const height of [10,16]){
    let valid=true;
    for(let i=1;i<=48;i++){
      const t=i/48,q={x:mix(from.x,target.x,t),z:mix(from.z,target.z,t),y:mix(from.y,target.y,t)+4*height*t*(1-t)};
      if(a.solid(q.x,q.z,e.radius,q.y,e.height)){valid=false;break;}
    }
    if(valid)return {phase:'wind-dive',from,target:{...target},height,age:0,duration:1.15};
  }
  return null;
}

function begin(s,e,forced=null){
  const cycle=e.enraged?['blades','dive','suction','dive']:['blades','dive','suction'];
  let attack=forced||cycle[e.attacks++%cycle.length],motion=null;
  if(attack==='dive'){motion=divePath(s,e,titanLanding(s,e));if(!motion)attack='blades';}
  if(attack==='suction'){
    const a=getArena(s.mapId),target={x:0,y:7,z:0};
    const path=!Number.isFinite(a.groundHeight(0,0))&&flightPath(a,point(e),target,e.radius,e.height);
    if(path)motion={path,age:0,duration:DESOLLADOR.vortexTravel};else attack='blades';
  }
  e.bossAttack=attack;e.anim=['blades','melee'].includes(attack)?'attack':attack;e.animTime=0;
  e.cast={attack,remaining:attack==='melee'?DESOLLADOR.meleeWindup:attack==='suction'?1.3:attack==='dive'?1.1:.85,motion,target:motion?.target};
  emit(s,'enemyWindup',e,{attack});emit(s,'desolladorWarning',e,{attack});
}

function canSlash(s,e){
  const p=s.player;
  return dist(e,p)<=DESOLLADOR.meleeRange&&p.y+1.75>e.y-.4&&p.y<e.y+e.height&&
    clear(getArena(s.mapId),{...e,y:p.y+1.1},{...p,y:p.y+1.1});
}
function slash(s,e,damage){
  e.anim='attack';e.animTime=.5;e.swordSlash=.32;
  emit(s,'enemyAttack',e,{attack:'melee'});
  if(canSlash(s,e)){damage(s,DESOLLADOR.meleeDamage);emit(s,'desolladorSlash',e,{damage:DESOLLADOR.meleeDamage});}
}
function release(s,e,damage){
  const c=e.cast;e.cast=null;
  if(c.attack==='blades'){bladeVolley(s,e);e.exposedUntil=s.time+.8;}
  if(c.attack==='dive'){e.bossMotion=c.motion;emit(s,'enemyAttack',e,{attack:'dive'});}
  if(c.attack==='suction')e.vortexTravel=c.motion;
  if(c.attack==='melee'){slash(s,e,damage);e.meleeReadyAt=s.time+DESOLLADOR.meleeCooldown;e.exposedUntil=s.time+.45;}
  e.attack=e.enraged?2.1:3.2;
}

function capturePlayer(s,e){
  const a=getArena(s.mapId),p=s.player;
  if(p.flight||p.windCapture||dist(e,p)>DESOLLADOR.suctionRange)return false;
  const safe=returnPoint(s);if(!safe)return false;
  // Keep the full orbit inside Corona's boundaries. Rise above the terraces
  // before the first revolution, then spiral into knife range at the eye.
  const orbit={x:e.x,z:e.z,y:Math.max(14,p.y,e.y+DESOLLADOR.vortexOrbitHeight),endY:e.y+DESOLLADOR.vortexEyeHeight,radius:Math.max(8,Math.min(26,dist(e,p))),angle:Math.atan2(p.z-e.z,p.x-e.x)};
  const start=orbitPoint(orbit,0),path=flightPath(a,point(p),start,.32,p.height);if(!path)return false;
  let last=start;
  for(let i=1;i<=128;i++){
    const next=orbitPoint(orbit,i/128);
    if(!segmentClear(a,last,next,.32,p.height))return false;
    last=next;
  }
  p.windCapture={owner:e.id,phase:'lift',age:0,safe:{...safe},lift:path,orbit,orbitAngle:orbit.angle};
  p.vy=0;p.grounded=false;p.jumpBuffer=0;p.coyote=0;
  return true;
}
function orbitPoint(o,t){
  const angle=o.angle+Math.PI*2*DESOLLADOR.vortexTurns*t,r=mix(o.radius,DESOLLADOR.vortexEyeRadius,t);
  return {x:o.x+Math.cos(angle)*r,y:mix(o.y,o.endY,t),z:o.z+Math.sin(angle)*r};
}
function combo(s,e,c,dt,damage){
  const w=e.windSuction;c.age=Math.min(DESOLLADOR.vortexCombo,c.age+dt);w.comboAge=c.age;
  const interval=DESOLLADOR.vortexCombo/DESOLLADOR.vortexComboHits;
  while(w.comboHits<DESOLLADOR.vortexComboHits&&c.age+1e-8>=interval*(w.comboHits+.5)){
    const index=w.comboHits++,amount=DESOLLADOR.vortexComboDamage/DESOLLADOR.vortexComboHits;
    e.swordSlash=.24;e.anim='attack';e.animTime=0;
    emit(s,'enemyAttack',e,{attack:'melee'});
    damage(s,amount);
    emit(s,'desolladorComboHit',e,{damage:amount,index,total:DESOLLADOR.vortexComboHits});
    // Death clears the channel immediately; never deliver more hits afterward.
    if(s.phase!=='playing'||e.windSuction!==w)return;
  }
  if(c.age>=DESOLLADOR.vortexCombo)stopDesolladorVortex(s,e);
}
function suction(s,e,dt,damage){
  const w=e.windSuction;w.age+=dt;
  const p=s.player;
  if(!p.windCapture){
    if(!capturePlayer(s,e)){if(w.age>4)stopDesolladorVortex(s,e);return;}
  }
  const c=p.windCapture;if(c.owner!==e.id||c.phase==='return'){stopDesolladorVortex(s,e);return;}
  if(c.phase==='combo'){combo(s,e,c,dt,damage);return;}
  c.age+=dt;w.phase=c.phase;
  const duration=c.phase==='lift'?DESOLLADOR.vortexLift:c.phase==='pull'?DESOLLADOR.vortexPull:DESOLLADOR.vortexStrike;
  const t=Math.min(1,c.age/duration);
  const progress=t*t*(3-2*t);
  if(c.phase==='lift')Object.assign(p,pathPoint(c.lift,progress));
  if(c.phase==='pull'){
    const angle=c.orbit.angle+Math.PI*2*DESOLLADOR.vortexTurns*progress;
    Object.assign(p,orbitPoint(c.orbit,progress));
    // Carry the view with the orbit while preserving all manual aim offsets.
    p.yaw-=angle-c.orbitAngle;c.orbitAngle=angle;
  }
  if(t>=1){
    if(c.phase==='strike'){
      c.phase='combo';c.age=0;w.phase='combo';w.comboAge=0;w.comboHits=0;
      emit(s,'desolladorComboStart',e,{duration:DESOLLADOR.vortexCombo,damage:DESOLLADOR.vortexComboDamage});
    }
    else{c.phase=c.phase==='lift'?'pull':'strike';c.age=0;w.phase=c.phase;
      if(c.phase==='strike'){emit(s,'enemyWindup',e,{attack:'melee'});emit(s,'desolladorWarning',e,{attack:'melee'});}}
  }
}

export function updateDesollador(s,e,dt,damage){
  const a=getArena(s.mapId),p=s.player;
  e.swordSlash=Math.max(0,(e.swordSlash||0)-dt);
  if(!e.enraged&&e.hp<=e.maxHp*.5){e.enraged=true;emit(s,'bossRage',e);}
  // Charged F interrupts the cast, dive, cuts and wind channel.
  if(e.shockStunUntil>s.time){if(e.windSuction||e.vortexTravel||e.bladeStorm)stopDesolladorVortex(s,e);return;}
  if(e.vortexTravel){
    const m=e.vortexTravel;m.age=Math.min(m.duration,m.age+dt);const t=m.age/m.duration;
    Object.assign(e,pathPoint(m.path,t*t*(3-2*t)));e.vy=0;e.grounded=false;
    if(t>=1){e.vortexTravel=null;e.windSuction={age:0,phase:'lift',hp:DESOLLADOR.vortexHealth,maxHp:DESOLLADOR.vortexHealth};emit(s,'desolladorSuction',e);}
    return;
  }
  if(e.bossMotion){
    const m=e.bossMotion;m.age=Math.min(m.duration,m.age+dt);const t=m.age/m.duration;
    e.x=mix(m.from.x,m.target.x,t);e.z=mix(m.from.z,m.target.z,t);e.y=mix(m.from.y,m.target.y,t)+4*m.height*t*(1-t);
    if(t>=1){
      e.bossMotion=null;e.grounded=true;e.vy=0;e.anim='attack';e.animTime=0;e.exposedUntil=0;
      e.bladeStorm={age:0,nextVolley:DESOLLADOR.cutWindup,lastVolleyAt:0,volleys:0};
      emit(s,'desolladorLanding',e);
    }
    return;
  }
  if(e.bladeStorm){cutStorm(s,e,dt);return;}
  if(e.windSuction){suction(s,e,dt,damage);return;}
  if(e.cast){e.cast.remaining-=dt;if(e.cast.remaining<=0)release(s,e,damage);return;}
  if(e.exposedUntil>s.time)return;
  e.anim='move';e.attack-=dt;
  if(!p.windCapture&&s.time>=(e.meleeReadyAt||0)&&canSlash(s,e)){begin(s,e,'melee');return;}
  const ground=a.groundHeight(e.x,e.z),base=Number.isFinite(ground)?ground:Math.max(0,p.y);
  const targetY=Math.max(base,p.y)+DESOLLADOR.hover;
  e.y+=Math.max(-dt*4,Math.min(dt*4,targetY-e.y));e.vy=0;e.grounded=false;
  const d=dist(e,p);
  if(d>14){
    const old=point(e);a.move(e,(p.x-e.x)/d*3*dt,(p.z-e.z)/d*3*dt,e.radius);
    if(dist(old,e)<dt*.1)e.y+=dt*4; // climb over blocked edges; never teleport through a wall
  }
  if(e.attack<=0&&d<65&&!p.windCapture)begin(s,e);
}

export function desolladorPose(e){
  if(e.hp<=0)return {state:'death',frame:e.deadTime<.18?0:e.deadTime<.42?1:e.deadTime<.77?2:3};
  if(e.shockStunUntil>0&&e.anim==='hurt')return null;
  if(e.bladeStorm){
    const w=e.bladeStorm,interval=DESOLLADOR.cutInterval/(e.enraged?DESOLLADOR.cutRageSpeed:1);
    const progress=Math.max(0,(w.age-w.lastVolleyAt)/interval);
    return {state:'attack',frame:w.volleys?Math.min(3,Math.floor(progress*4)):0,mirror:w.volleys%2===0};
  }
  if(e.windSuction?.phase==='combo'){
    const age=e.windSuction.comboAge||0,interval=DESOLLADOR.vortexCombo/DESOLLADOR.vortexComboHits;
    const beat=age/interval,index=Math.min(DESOLLADOR.vortexComboHits-1,Math.floor(beat));
    return {state:'attack',frame:Math.min(3,Math.floor((beat-index)*4)),mirror:index%2===1};
  }
  if(e.swordSlash>0)return {state:'attack',frame:3};
  if(e.bossMotion)return {state:'dive',frame:e.bossMotion.age/e.bossMotion.duration<.7?2:3};
  if(e.vortexTravel)return {state:'suction',frame:Math.floor(e.vortexTravel.age*8)%4};
  if(e.windSuction?.phase==='strike')return {state:'attack',frame:2};
  if(e.windSuction)return {state:'suction',frame:Math.floor(e.windSuction.age*8)%4};
  if(e.cast)return {state:['blades','melee'].includes(e.cast.attack)?'attack':e.cast.attack,frame:e.cast.remaining>.45?0:1};
  if(e.anim==='dive')return {state:'dive',frame:3};
  return null;
}
