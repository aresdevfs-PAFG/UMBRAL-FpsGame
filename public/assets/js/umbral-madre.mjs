import {getArena} from './umbral-arena.mjs';
import {MOTHER_WATER_POINTS,motherWaterPoint} from './umbral-madre-river.mjs';

export const MADRE=Object.freeze({
  health:12000,height:9,width:10,deathDuration:6.4,
  submergedDepth:7.25,headBottom:.08,headHeight:1.45,headRadius:.78,
  riseDuration:.8,airborneDuration:10,sinkDuration:.8,hoverHeight:.6,
  dragWarning:1.1,dragDuration:3,dragSpeed:4.8,dragHealth:700,dragCooldown:12,
  captureRush:.45,captureEmbrace:1,captureDamage:60,captureCooldown:2,
});
const emit=(s,type,e,data={})=>s.events.push({type,id:e.id,kind:e.kind,x:e.x,y:e.y,z:e.z,...data});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=t=>t*t*(3-2*t);
const isDirect=source=>source==='weapon'||source==='bow';
const isMelee=source=>source==='knife'||source==='macuahuitl'||source==='macuahuitlMelee'||source==='motherCounter';

function placeUnderwater(s,e,relocate=false){
  const arena=getArena('rio');
  // Keep a validated spawn warning's position. Older demo spawn points may be
  // on land, so direct creations still fall back to a clear, visible channel.
  const requested=!relocate&&MOTHER_WATER_POINTS.find(p=>Math.abs(p.x-e.x)<1e-6&&Math.abs(p.z-e.z)<1e-6);
  const valid=requested&&arena.groundHeight(e.x,e.z)<requested.y-.01&&
    !arena.solid(e.x,e.z,1.8,requested.y-1,2)&&!arena.solid(e.x,e.z,1.8,requested.y+MADRE.hoverHeight,MADRE.height);
  const point=valid?{...requested,y:requested.y+.02}:motherWaterPoint(s,relocate?e:null,false);
  Object.assign(e,{x:point.x,z:point.z,waterLevel:point.y,waterState:'submerged',waterAge:0,
    y:point.y-MADRE.submergedDepth,vy:0,cast:null,anim:'move',animTime:0});
}
export function initializeMother(s,e){
  placeUnderwater(s,e);
  e.dragAt=s.time+4;e.attacks=0;e.attack=1;
  return e;
}

/** Only the part above the water is a target; the hidden body cannot absorb shots. */
export function motherHitBounds(s,e){
  if(!e.waterState)initializeMother(s,e);
  if(e.waterState==='submerged')return {low:e.waterLevel+MADRE.headBottom,high:e.waterLevel+MADRE.headHeight,radius:MADRE.headRadius};
  return {low:Math.max(e.waterLevel+MADRE.headBottom,e.y+.1),high:e.y+e.height,radius:e.radius};
}
export function madreAllowsDamage(s,e,source,impactY=null){
  if(isMelee(source))return false;
  if(!e.waterState)initializeMother(s,e);
  // Explicit engine calls without a ray remain usable for debug/admin damage.
  if(source==='weapon'&&impactY===null)return true;
  if(e.waterState!=='submerged')return true;
  if(!isDirect(source)||!Number.isFinite(impactY))return false;
  const b=motherHitBounds(s,e);
  return impactY>=b.low-1e-6&&impactY<=b.high+1e-6;
}

function endDrag(s,reason='ended'){
  const d=s.motherDrag;if(!d)return;
  s.motherDrag=null;
  const e=s.enemies.find(a=>a.id===d.id);
  if(e){e.dragAt=s.time+MADRE.dragCooldown;e.attack=Math.max(e.attack,1);e.anim='move';emit(s,'motherDragEnd',e,{reason});}
}
export function clearMotherEncounter(s,reason='ended'){
  endDrag(s,reason);
  endCapture(s,reason,false);
  s.motherDarkness=null;
}
export function onMotherHit(s,e,damage,source,impactY=null){
  if(!isDirect(source)||!Number.isFinite(damage)||damage<=0||!madreAllowsDamage(s,e,source,impactY))return;
  if(e.waterState==='submerged'){
    e.waterState='rising';e.waterAge=0;e.anim='rush';e.animTime=0;
    emit(s,'motherRise',e);
  }
  const d=s.motherDrag;
  if(d?.id===e.id){
    d.hp=Math.max(0,d.hp-damage);
    if(d.hp<=0)endDrag(s,'interrupted');
  }
}

export function beginMotherDrag(s,e){
  if(s.motherDrag||s.phase!=='playing'||e.hp<=0||e.waterState!=='airborne')return false;
  const p=s.player;
  if(p.flight||p.y+.12<e.waterLevel)return false;
  s.motherDrag={id:e.id,phase:'warning',age:0,hp:MADRE.dragHealth,maxHp:MADRE.dragHealth,
    target:{x:e.x,y:e.waterLevel,z:e.z},direction:{x:0,z:0}};
  e.cast=null;e.anim='hands';e.animTime=0;
  emit(s,'enemyWindup',e,{attack:'hands'});emit(s,'motherDragWarning',e,{duration:MADRE.dragWarning});
  return true;
}

/** Adds a bounded pull to normal traversal. It never owns the camera, input or gravity. */
export function updateMotherDrag(s,dt){
  const d=s.motherDrag;if(!d||s.phase==='paused')return;
  const e=s.enemies.find(a=>a.id===d.id&&a.hp>0);
  if(s.phase!=='playing'||!e){endDrag(s,e?'player-death':'defeated');return;}
  const p=s.player,a=getArena(s.mapId);
  if(p.y+.12<e.waterLevel){endDrag(s,'water');return;}
  if(p.flight){endDrag(s,'escaped');return;}
  const dx=d.target.x-p.x,dz=d.target.z-p.z,length=Math.hypot(dx,dz);
  d.direction={x:length>.01?dx/length:0,z:length>.01?dz/length:0};
  const before=d.age;d.age+=Math.max(0,dt);
  if(d.phase==='warning'){
    if(d.age<MADRE.dragWarning)return;
    d.phase='pull';d.age-=MADRE.dragWarning;
    emit(s,'motherDragStart',e,{duration:MADRE.dragDuration});
    dt=Math.min(dt,d.age);
  }else dt=Math.min(dt,Math.max(0,MADRE.dragDuration-before));
  if(length>.1&&dt>0){
    const strength=MADRE.dragSpeed*dt;
    a.move(p,d.direction.x*strength,d.direction.z*strength,p.collisionRadius??.32);
  }
  if(d.age>=MADRE.dragDuration)endDrag(s,'escaped');
}

export const motherCaptureLocked=s=>!!s.motherCapture;
function safeCaptureReturn(s,e){
  const a=getArena(s.mapId),p=s.player,water=e.waterLevel-.02;
  const valid=q=>q&&Number.isFinite(q.y)&&q.y>=water-.01&&
    !a.solid(q.x,q.z,.36,q.y,p.height||1.75)&&
    [-.55,0,.55].every(dx=>[-.55,0,.55].every(dz=>Math.abs(a.groundHeight(q.x+dx,q.z+dz)-q.y)<.04))&&
    !a.PADS.some(pad=>Math.hypot(q.x-pad.x,q.z-pad.z)<pad.radius+.6&&Math.abs(q.y-pad.y)<1);
  if(valid(p.safe))return {...p.safe};
  const candidates=[a.START,...a.SPAWNS,...a.SURFACES.filter(q=>!q.ramp).map(q=>({x:q.x,y:q.y,z:q.z}))];
  const safe=candidates.filter(valid).sort((x,y)=>Math.hypot(x.x-p.x,x.z-p.z)-Math.hypot(y.x-p.x,y.z-p.z))[0];
  return safe?{x:safe.x,y:safe.y,z:safe.z}:null;
}
function endCapture(s,reason,returnPlayer){
  const capture=s.motherCapture;if(!capture)return;
  s.motherCapture=null;
  const e=s.enemies.find(enemy=>enemy.id===capture.id);
  if(returnPlayer&&s.phase==='playing'&&s.health>0){
    Object.assign(s.player,capture.returnTo,{vy:0,flight:null,windCapture:null,grounded:true,jumpBuffer:0,padCooldown:1});
    s.player.safe={...capture.returnTo};s.riverImmersed=false;
  }
  s.motherCaptureAfter=s.time+MADRE.captureCooldown;
  if(e){
    if(e.hp>0){placeUnderwater(s,e,true);e.dragAt=s.time+MADRE.dragCooldown;}
    emit(s,'motherCaptureEnd',e,{reason});
  }
}
function beginCapture(s,e){
  const returnTo=safeCaptureReturn(s,e);if(!returnTo)return false;
  endDrag(s,'capture');e.cast=null;e.charge=null;e.waterState='capturing';e.anim='rush';e.animTime=0;
  s.projectiles=s.projectiles.filter(p=>p.owner!==e.id);s.hazards=s.hazards.filter(h=>h.owner!==e.id);
  if(s.flameRemaining>0)s.flameCooldown=Math.max(s.flameCooldown||0,8);
  if(s.smgDualRemaining>0)s.smgDualCooldown=Math.max(s.smgDualCooldown||0,7);
  if(s.macuahuitlSpent)s.macuahuitlCooldown=Math.max(s.macuahuitlCooldown||0,8);
  s.rifleScoped=false;s.flameRemaining=0;s.smgDualRemaining=0;s.macuahuitlRemaining=0;s.macuahuitlQueued=false;s.macuahuitlSpent=false;
  const p=s.player,from={x:e.x,y:e.waterLevel+.8,z:e.z},target={x:p.x,y:p.y+1.3,z:p.z};
  s.motherCapture={id:e.id,phase:'rush',age:0,totalAge:0,from,target,position:{...from},returnTo,damaged:false};
  emit(s,'motherCaptureStart',e,{duration:MADRE.captureRush+MADRE.captureEmbrace});return true;
}
/** Process before ordinary river damage. Return true to skip normal simulation this frame. */
export function updateMotherCapture(s,dt,damagePlayer){
  if(s.phase==='paused')return motherCaptureLocked(s);
  if(s.phase!=='playing'||s.health<=0){endCapture(s,'death',false);return false;}
  let capture=s.motherCapture;
  if(!capture){
    if(s.mapId!=='rio'||s.training||!s.portalUsed||!s.riverImmersed||s.time<(s.motherCaptureAfter||0))return false;
    const mother=s.enemies.find(e=>e.kind==='madre'&&e.hp>0);
    return !!mother&&beginCapture(s,mother);
  }
  const e=s.enemies.find(e=>e.id===capture.id&&e.hp>0);
  if(!e){endCapture(s,'defeated',false);return true;}
  const elapsed=Math.max(0,Number.isFinite(dt)?dt:0);capture.age+=elapsed;capture.totalAge+=elapsed;
  if(capture.phase==='rush'){
    const t=ease(clamp(capture.age/MADRE.captureRush,0,1));
    capture.position={x:capture.from.x+(capture.target.x-capture.from.x)*t,y:capture.from.y+(capture.target.y-capture.from.y)*t,z:capture.from.z+(capture.target.z-capture.from.z)*t};
    if(capture.age+1e-8<MADRE.captureRush)return true;
    capture.phase='embrace';capture.age=Math.max(0,capture.age-MADRE.captureRush);capture.position={...capture.target};
    e.anim='hands';e.animTime=0;
    emit(s,'motherScreamer',e,{...capture.target,capture:true});
  }
  if(capture.age+1e-8>=MADRE.captureEmbrace){
    // Keep the full embrace visible even for a lethal hit. Commit before the
    // callback, which can synchronously clear the encounter on player death.
    capture.damaged=true;
    damagePlayer(s,MADRE.captureDamage,{bypassShield:true,motherCapture:true});
    if(s.health<=0||s.phase!=='playing'){endCapture(s,'death',false);return true;}
    if(s.motherCapture!==capture)return true;
    endCapture(s,'released',true);
  }
  return true;
}

function release(s,e){
  const c=e.cast;e.cast=null;const p=s.player;
  if(c.attack==='wave'){
    const origin={x:e.x,y:e.y+1.1,z:e.z},dx=p.x-origin.x,dz=p.z-origin.z,dy=p.y+1-origin.y,length=Math.max(.01,Math.hypot(dx,dz,dy));
    for(const offset of (e.enraged?[-.18,0,.18]:[-.14,0,.14])){
      const angle=Math.atan2(dx,dz)+offset,flat=Math.hypot(dx,dz)/length*14;
      s.projectiles.push({id:s.nextId++,owner:e.id,kind:'madre-wave',...origin,dx:Math.sin(angle)*flat,dz:Math.cos(angle)*flat,dy:dy/length*14,speed:14,gravity:0,age:0,life:6,radius:.65,damage:25});
    }
    emit(s,'enemyAttack',e,{attack:'wave'});
  }
  e.attack=e.enraged?2.2:3.2;e.anim='move';
}
function castAttack(s,e){
  const a=getArena(s.mapId),p=s.player;
  const attack=e.attacks++%2?'hands':'wave';e.anim=attack;e.animTime=0;e.cast={attack,remaining:1.15};
  if(attack==='hands'){
    for(const offset of (e.enraged?[-2.4,0,2.4]:[0])){
      const x=p.x+offset,z=p.z,y=a.groundHeight(x,z);
      if(!Number.isFinite(y)||a.solid(x,z,.35,y,1))continue;
      s.hazards.push({id:s.nextId++,owner:e.id,kind:'madre-hands',attack:'hands',attackGroup:'mother-'+e.id+'-'+e.attacks,x,y,z,radius:1.5,age:0,warning:1.15,duration:1.2,damage:28,hit:false});
    }
  }
  emit(s,'enemyWindup',e,{attack});emit(s,'motherWarning',e,{attack});
}

export function updateMadre(s,e,dt){
  if(s.phase!=='playing'||e.hp<=0)return;
  if(s.motherCapture?.id===e.id)return;
  if(!e.waterState)initializeMother(s,e);
  if(!e.enraged&&e.hp<=e.maxHp*.25){e.enraged=true;emit(s,'bossRage',e);}
  e.vy=0;e.waterAge+=dt;
  if(e.waterState==='submerged'){
    e.y=e.waterLevel-MADRE.submergedDepth;e.anim='move';return;
  }
  if(e.waterState==='rising'){
    e.y=e.waterLevel-MADRE.submergedDepth+(MADRE.submergedDepth+MADRE.hoverHeight)*ease(clamp(e.waterAge/MADRE.riseDuration,0,1));
    if(e.waterAge>=MADRE.riseDuration){e.waterState='airborne';e.waterAge=0;e.attack=.4;e.anim='move';}
    return;
  }
  if(e.waterState==='sinking'){
    e.y=e.waterLevel+MADRE.hoverHeight-(MADRE.submergedDepth+MADRE.hoverHeight)*ease(clamp(e.waterAge/MADRE.sinkDuration,0,1));
    if(e.waterAge>=MADRE.sinkDuration){placeUnderwater(s,e,true);emit(s,'motherSubmerge',e);}
    return;
  }
  e.y=e.waterLevel+MADRE.hoverHeight+Math.sin(s.time*2)*.12;
  if(e.waterAge>=MADRE.airborneDuration&&!s.motherDrag){
    e.waterState='sinking';e.waterAge=0;e.cast=null;e.anim='move';emit(s,'motherSink',e);return;
  }
  if(s.motherDrag?.id===e.id){e.anim='hands';return;}
  if(e.cast){e.cast.remaining-=dt;if(e.cast.remaining<=0)release(s,e);return;}
  if(e.shockStunUntil>s.time)return;
  e.attack-=dt;
  if(e.attack>0||Math.hypot(e.x-s.player.x,e.z-s.player.z)>70)return;
  if(e.attacks>0&&s.time>=e.dragAt&&beginMotherDrag(s,e))return;
  castAttack(s,e);
}

export function updateMotherDeath(s,e,dt){
  e.deadTime+=dt;
  if(e.deathBaseY===undefined){e.deathOriginY=e.y;e.deathBaseY=Math.max(e.y,(e.waterLevel??e.y)+MADRE.hoverHeight);}
  e.y=e.deathOriginY+(e.deathBaseY-e.deathOriginY)*ease(clamp(e.deadTime/.4,0,1))+Math.max(0,e.deadTime-1.2)*3.5;
  if(e.deadTime>=.4&&!e.deathCry){e.deathCry=true;emit(s,'motherDeathCry',e);}
}
export function madrePose(e,s){
  if(e.hp<=0)return {state:'death',frame:e.deadTime<.4?0:e.deadTime<1.2?1:e.deadTime<MADRE.deathDuration-1.8?2:3};
  if(s.motherCapture?.id===e.id)return {state:s.motherCapture.phase==='rush'?'rush':'hands',frame:Math.min(3,Math.floor(s.motherCapture.age/MADRE.captureRush*4))};
  if(s.motherCapture?.id===e.id)return {state:s.motherCapture.phase==='rush'?'rush':'hands',frame:Math.min(3,Math.floor(s.motherCapture.age*8))};
  if(s.motherDrag?.id===e.id)return {state:'hands',frame:Math.floor(e.animTime*5)%4};
  if(e.waterState==='rising')return {state:'rush',frame:Math.min(3,Math.floor(e.waterAge/MADRE.riseDuration*4))};
  return {state:e.cast?.attack||'move',frame:Math.floor(e.animTime*5)%4};
}

// Compatibility for cached callers while the gameplay entry points are upgraded.
export const motherDarkness=()=>false;
export const clearMotherDarkness=clearMotherEncounter;
export const tryMotherCounter=()=>null;
