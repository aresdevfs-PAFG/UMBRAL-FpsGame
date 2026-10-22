import {getArena} from './umbral-arena.mjs';

export const FINISHER=Object.freeze({duration:3,reach:3.2,stanceDistance:3,heartHeight:2.2,approach:.35,stab:.85,hammer:1.7});
const event=(s,type,data={})=>s.events.push({type,...data});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=p=>({x:p.x,y:p.y,z:p.z});
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);
export const finisherLocked=s=>s.bossFinish?.phase==='executing';

function supported(a,q,r=.4,height=1.75){
  if(!Number.isFinite(q.y)||a.solid(q.x,q.z,r,q.y,height))return false;
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,y=a.groundHeight(q.x+Math.cos(angle)*r,q.z+Math.sin(angle)*r,q.y+.4);
    if(!Number.isFinite(y)||Math.abs(q.y-y)>.4)return false;
  }
  return true;
}
function walkable(a,from,to){
  const steps=Math.max(1,Math.ceil(distance(from,to)/.16));let y=from.y;
  for(let i=1;i<=steps;i++){
    const x=mix(from.x,to.x,i/steps),z=mix(from.z,to.z,i/steps),next=a.groundHeight(x,z,y+.4);
    if(!Number.isFinite(next)||Math.abs(next-y)>.4||!supported(a,{x,y:next,z}))return false;
    y=next;
  }
  return Math.abs(y-to.y)<.4;
}
function clearStance(a,e,angle){
  const x=e.x+Math.sin(angle)*FINISHER.stanceDistance,z=e.z+Math.cos(angle)*FINISHER.stanceDistance;
  const q={x,z,y:a.groundHeight(x,z,e.y+.4)};
  return Math.abs(q.y-e.y)<.4&&supported(a,q)?q:null;
}
function reachableLanding(s,e){
  const a=getArena(s.mapId),p=s.player,candidates=[];
  // Prefer the existing arena position, then dry ground around the player.
  for(const center of [e,p])for(const radius of [0,3,6,9])for(let i=0;i<(radius?16:1);i++){
    const angle=i*Math.PI/8,x=center.x+Math.sin(angle)*radius,z=center.z+Math.cos(angle)*radius;
    candidates.push({x,z,y:a.groundHeight(x,z,(center===p?p.y:e.y)+.4)});
  }
  if(a.FINISH_POINT)candidates.push(a.FINISH_POINT);
  candidates.push(...a.SPAWNS.filter(q=>!q.elevated));
  for(const q of candidates){
    if(!supported(a,q,e.radius,e.height)||(s.mapId==='rio'&&q.y<1.4))continue;
    const stances=Array.from({length:8},(_,i)=>clearStance(a,q,i*Math.PI/4)).filter(Boolean);
    const accessible=stances.some(stance=>walkable(a,p,stance)||a.navigationPath(p,stance).length>0);
    if(accessible)return point(q);
  }
  // All supported combat maps provide an open FINISH_POINT or reachable spawns.
  return point(a.FINISH_POINT||a.SPAWNS.find(q=>!q.elevated)||a.START);
}

export function downTitan(s,e){
  if(e.downed||s.bossFinish)return;
  e.hp=1;e.shield=0;e.downed=true;e.cast=null;e.charge=null;e.bossMotion=null;e.flight=null;
  e.burnRemaining=e.arrowBurnRemaining=0;e.shockStunUntil=0;e.stun=0;e.anim='hurt';e.animTime=0;e.vy=0;
  const minions=new Set(s.enemies.filter(o=>o.summonedBy===e.id).map(o=>o.id));
  // An explosion/burn update may still hold references to the previous enemy list.
  // Mark disappearing summons inactive before removing them, without granting kills.
  for(const o of s.enemies)if(minions.has(o.id)){o.hp=0;o.dissolved=true;}
  s.enemies=s.enemies.filter(o=>!minions.has(o.id));
  s.spawnWarnings=s.spawnWarnings.filter(w=>w.summonedBy!==e.id);
  s.projectiles=s.projectiles.filter(b=>b.owner!==e.id&&!minions.has(b.owner));
  s.hazards=s.hazards.filter(h=>h.owner!==e.id&&!minions.has(h.owner));
  if(s.wave===10){s.pending=0;s.bossPending=false;}
  const target=reachableLanding(s,e),settle=Math.hypot(e.x-target.x,e.y-target.y,e.z-target.z)>.15;
  s.bossFinish={phase:settle?'settling':'ready',enemyId:e.id,age:0,duration:FINISHER.duration,from:point(e),target};
  if(!settle)Object.assign(e,target,{grounded:true});
  event(s,'bossDowned',{id:e.id});
}

function stanceFor(s){
  const f=s.bossFinish;if(f?.phase!=='ready')return null;
  const e=s.enemies.find(o=>o.id===f.enemyId&&o.downed),p=s.player,a=getArena(s.mapId);
  if(!e||distance(e,p)>FINISHER.reach||Math.abs(e.y-p.y)>.6||!p.grounded)return null;
  const dx=e.x-p.x,dz=e.z-p.z,d=Math.max(.001,Math.hypot(dx,dz));
  if((-Math.sin(p.yaw)*dx-Math.cos(p.yaw)*dz)/d<.25)return null;
  if(a.wallDistance(p.x,p.z,dx/d,dz/d,d,p.y+1.6,(e.y+FINISHER.heartHeight-p.y-1.6)/d)<d-.05)return null;
  const q=clearStance(a,e,Math.atan2(p.x-e.x,p.z-e.z));
  return q&&walkable(a,p,q)?{e,stance:q}:null;
}
export function finisherPrompt(s){
  if(s.bossFinish?.phase==='settling')return {text:'EL TITÁN ESTÁ CAYENDO',ready:false};
  if(s.bossFinish?.phase!=='ready')return null;
  return stanceFor(s)?{text:'F · REMATAR',key:'F',ready:true}:{text:'ACÉRCATE AL TITÁN · F PARA REMATAR',key:'F',ready:false};
}
export function tryBossFinisher(s){
  if(s.phase!=='playing')return false;
  const ready=stanceFor(s);if(!ready)return false;
  const {e,stance}=ready,f=s.bossFinish,p=s.player;
  const yaw=Math.atan2(-(e.x-stance.x),-(e.z-stance.z));
  const yawDelta=Math.atan2(Math.sin(yaw-p.yaw),Math.cos(yaw-p.yaw));
  Object.assign(f,{phase:'executing',age:0,playerFrom:{...point(p),yaw:p.yaw,pitch:p.pitch},stance,yaw:p.yaw+yawDelta,
    pitch:Math.atan2(e.y+FINISHER.heartHeight-stance.y-1.6,distance(e,stance)),stabbed:false,hammered:false});
  p.vy=0;p.flight=null;p.jumpBuffer=0;s.rifleScoped=false;s.flameRemaining=0;s.macuahuitlRemaining=0;
  if(s.smgDualRemaining>0){s.smgDualRemaining=0;s.smgDualCooldown=7;}
  s.triggerHeld.primary=s.triggerHeld.secondary=false;
  event(s,'bossFinisherStart',{id:e.id});return true;
}

// Returns true only while the cinematic owns simulation and input.
export function updateBossFinisher(s,dt,complete){
  const f=s.bossFinish;if(!f)return false;
  const e=s.enemies.find(o=>o.id===f.enemyId);if(!e){s.bossFinish=null;return false;}
  if(f.phase==='settling'){
    f.age+=dt;const t=Math.min(1,f.age/1.25),curve=ease(t);
    // The defeated spirit returns to reachable ground without inflicting damage.
    e.x=mix(f.from.x,f.target.x,curve);e.z=mix(f.from.z,f.target.z,curve);
    e.y=mix(f.from.y,f.target.y,curve)+Math.sin(t*Math.PI)*2;
    if(t===1){Object.assign(e,f.target,{grounded:true});f.phase='ready';f.age=0;}
    return false;
  }
  if(f.phase!=='executing')return false;
  f.age=Math.min(FINISHER.duration,f.age+dt);
  const t=ease(Math.min(1,f.age/FINISHER.approach)),p=s.player;
  p.x=mix(f.playerFrom.x,f.stance.x,t);p.y=mix(f.playerFrom.y,f.stance.y,t);p.z=mix(f.playerFrom.z,f.stance.z,t);
  p.yaw=mix(f.playerFrom.yaw,f.yaw,t);p.pitch=mix(f.playerFrom.pitch,f.pitch,t);
  if(!f.stabbed&&f.age>=FINISHER.stab){f.stabbed=true;event(s,'bossStab',{id:e.id});}
  if(!f.hammered&&f.age>=FINISHER.hammer){f.hammered=true;event(s,'bossHammer',{id:e.id});}
  if(f.age>=FINISHER.duration){
    s.bossFinish=null;complete(s,e);event(s,'bossFinisherEnd',{id:e.id});
  }
  return true;
}
