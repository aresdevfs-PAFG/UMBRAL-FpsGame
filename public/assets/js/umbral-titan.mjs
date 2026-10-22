import {getArena} from './umbral-arena.mjs';
import {riverTide} from './umbral-maps.mjs';

export const TITAN=Object.freeze({wave:10,scale:1.35,maxHealth:6250,maxShield:6250,total:12500,rageDamageMultiplier:1.5,chargedDamage:250,exposure:1.7,weakMultiplier:1.65,
  jumpHeight:12,jumpDuration:2.1,landingRadius:3.4,landingDamage:32,
  skullCount:7,skullSpeed:19,skullTurnRate:1.9,skullLife:6,
  cannonDamage:50,cannonSpeed:19,cannonRadius:.38,cannonLife:6,
  summonBatch:4,summonAlive:4,summonLimit:24});
const event=(s,type,data={})=>s.events.push({type,...data});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=e=>({x:e.x,y:e.y,z:e.z});
const source=e=>({id:e.id,kind:e.kind,...point(e)});
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
export const titanDamage=(e,base)=>base*(e.enraged?TITAN.rageDamageMultiplier:1);

// The armour is a separate, non-regenerating pool. Overflow reaches health.
export function absorbTitanDamage(s,e,damage){
  const absorbed=Math.min(e.shield,damage);e.shield-=absorbed;
  if(!e.enraged&&e.shield<=0){
    e.enraged=true;e.attacks=0;e.speed=2.8;e.interval=2.7;e.windup=.8;
    event(s,'bossRage',source(e));
  }
  return damage-absorbed;
}

function safeGround(arena,e,q){
  if(!Number.isFinite(q.y)||arena.solid(q.x,q.z,e.radius,q.y,e.height))return false;
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,y=arena.groundHeight(q.x+Math.cos(angle)*e.radius,q.z+Math.sin(angle)*e.radius,q.y+.4);
    if(!Number.isFinite(y)||Math.abs(y-q.y)>.4)return false;
  }
  return true;
}

// Prefer the player's current platform, then the nearest place the giant fits.
// The locked landing point is also the point shown by the warning ring.
export function titanLanding(s,e){
  const arena=getArena(s.mapId),p=s.player,candidates=[];
  for(const radius of [0,2,4,6,9])for(let i=0;i<(radius?16:1);i++){
    const a=i*Math.PI/8,x=p.x+Math.cos(a)*radius,z=p.z+Math.sin(a)*radius;
    candidates.push({x,z,y:arena.groundHeight(x,z,(p.y||0)+.4)});
  }
  candidates.push(...arena.SPAWNS.filter(q=>!q.elevated));
  return candidates.filter(q=>safeGround(arena,e,q)).sort((a,b)=>distance(a,p)-distance(b,p))[0]||null;
}

function arcPosition(from,to,height,t){return {x:lerp(from.x,to.x,t),z:lerp(from.z,to.z,t),y:lerp(from.y,to.y,t)+4*height*t*(1-t)};}
function jumpArc(s,e,target){
  const arena=getArena(s.mapId),from=point(e);
  for(const height of [TITAN.jumpHeight,18]){
    let clear=true;
    for(let i=1;i<=64;i++){const q=arcPosition(from,target,height,i/64);if(arena.solid(q.x,q.z,e.radius,q.y,e.height)){clear=false;break;}}
    if(clear)return height;
  }
  return null;
}

export function beginTitanCast(s,e){
  const p=s.player,d=Math.max(.01,distance(e,p));
  const cycle=e.enraged?['volley','jump','summon','charge','slam','cannon']:['jump','charge','slam','cannon'];
  let attack=cycle[(e.attacks-1)%cycle.length];
  if(attack==='summon'&&((e.summonedCount||0)>=TITAN.summonLimit||s.enemies.filter(o=>o.hp>0&&o.summonedBy===e.id).length+s.spawnWarnings.filter(w=>w.summonedBy===e.id).length>=TITAN.summonAlive))attack='volley';
  let target=null,height=null;
  if(attack==='jump'){
    target=titanLanding(s,e);height=target&&jumpArc(s,e,target);
    if(height===null)attack=e.enraged?'volley':'charge';
  }
  e.bossAttack=attack;
  e.cast={remaining:attack==='jump'?1.1:e.windup,attack,dx:(p.x-e.x)/d,dz:(p.z-e.z)/d,target,height};
  if(attack==='slam')s.hazards.push({id:s.nextId++,owner:e.id,kind:'ground-shockwave',flameWave:true,x:e.x,y:e.y,z:e.z,age:0,warning:e.windup,duration:2.5,radius:0,damage:titanDamage(e,28),hit:false});
  if(attack==='jump')event(s,'bossLeap',source(e));
  if(attack==='volley')event(s,'bossSkulls',source(e));
  if(attack==='summon')event(s,'bossSummon',source(e));
}

function summon(s,e){
  const arena=getArena(s.mapId),living=s.enemies.filter(o=>o.hp>0&&o.summonedBy===e.id).length+s.spawnWarnings.filter(w=>w.summonedBy===e.id).length;
  const count=Math.min(TITAN.summonBatch,TITAN.summonAlive-living,TITAN.summonLimit-(e.summonedCount||0));
  const imp={radius:.52,height:2.6};
  const options=arena.SPAWNS.filter(q=>!q.elevated&&safeGround(arena,imp,q)&&distance(q,s.player)>7&&distance(q,e)>3)
    .sort((a,b)=>distance(a,e)-distance(b,e));
  let placed=0;
  for(const q of options){
    if(placed>=count)break;
    if(s.enemies.some(o=>o.hp>0&&distance(o,q)<3)||s.spawnWarnings.some(w=>distance(w,q)<3))continue;
    s.spawnWarnings.push({...q,id:s.nextId++,kind:'macabro',summonedBy:e.id,remaining:1.4,total:1.4});placed++;
  }
  e.summonedCount=(e.summonedCount||0)+placed;
}

export function releaseTitanCast(s,e){
  const c=e.cast;
  if(!c||e.hp<=0||e.downed)return;
  if(c.attack==='cannon'){
    // The cannon is the giant's anatomical right arm (left in its front sprite).
    // Lock the shot at release: this large, powerful ball remains dodgeable.
    const side=(e.width||e.height)*.22,x=e.x-c.dz*side,z=e.z+c.dx*side,y=e.y+e.height*.6;
    const dx=s.player.x-x,dy=(s.player.y||0)+1.05-y,dz=s.player.z-z,length=Math.hypot(dx,dy,dz)||1;
    s.projectiles.push({id:s.nextId++,owner:e.id,kind:'titan-plasma',x,y,z,
      dx:dx/length*TITAN.cannonSpeed,dy:dy/length*TITAN.cannonSpeed,dz:dz/length*TITAN.cannonSpeed,
      speed:TITAN.cannonSpeed,gravity:0,homing:false,age:0,life:TITAN.cannonLife,radius:TITAN.cannonRadius,
      damage:TITAN.cannonDamage});
  }else if(c.attack==='volley'&&e.enraged){
    for(let i=0;i<TITAN.skullCount;i++){
      const angle=i*Math.PI*2/TITAN.skullCount;
      s.projectiles.push({id:s.nextId++,owner:e.id,kind:'titan-skull',x:e.x,y:e.y+e.height*.92,z:e.z,
        dx:Math.sin(angle)*2.8,dy:13,dz:Math.cos(angle)*2.8,speed:TITAN.skullSpeed,gravity:0,
        homing:true,seekAt:.45+i*.045,seekUntil:3.2,age:0,life:TITAN.skullLife,radius:.27,damage:titanDamage(e,12)});
    }
  }else if(c.attack==='jump'){
    e.bossMotion={phase:'jump',from:point(e),target:{...c.target},height:c.height,age:0,duration:TITAN.jumpDuration};
    e.grounded=false;e.vy=0;
  }else if(c.attack==='charge')e.charge={dx:c.dx,dz:c.dz,remaining:1.05,hit:false,damage:titanDamage(e,30)};
  else if(c.attack==='summon'&&e.enraged)summon(s,e);
  if(c.attack!=='jump'&&c.attack!=='charge')e.exposedUntil=s.time+TITAN.exposure;
  if((c.attack!=='volley'&&c.attack!=='summon')||e.enraged)event(s,'enemyAttack',{...source(e),attack:c.attack});
}

export function guideTitanSkull(b,p,dt){
  if(b.age<b.seekAt||b.age>b.seekUntil)return;
  const dx=p.x-b.x,dy=(p.y||0)+1.1-b.y,dz=p.z-b.z,length=Math.hypot(dx,dy,dz)||1;
  const speed=Math.hypot(b.dx,b.dy,b.dz)||1,ux=b.dx/speed,uy=b.dy/speed,uz=b.dz/speed;
  const tx=dx/length,ty=dy/length,tz=dz/length;
  const angle=Math.acos(Math.max(-1,Math.min(1,ux*tx+uy*ty+uz*tz)));
  const turn=Math.min(angle,TITAN.skullTurnRate*dt),dot=ux*tx+uy*ty+uz*tz;
  // Rotate by a bounded angle, including an exact reversal after the upward launch.
  let ax=tx-ux*dot,ay=ty-uy*dot,az=tz-uz*dot,norm=Math.hypot(ax,ay,az);
  if(norm<1e-6){ax=-uy;ay=ux;az=0;norm=Math.hypot(ax,ay);if(norm<1e-6){ax=1;norm=1;}}
  const c=Math.cos(turn),k=Math.sin(turn)/norm;
  b.dx=(ux*c+ax*k)*b.speed;b.dy=(uy*c+ay*k)*b.speed;b.dz=(uz*c+az*k)*b.speed;
}

function land(s,e,m,damage){
  Object.assign(e,m.target,{bossMotion:null,vy:0,grounded:true,_navigation:null,anim:'attack',animTime:.55,bossAttack:'landing'});
  e.exposedUntil=s.time+TITAN.exposure;e.attack=Math.max(e.attack,2.2);
  const p=s.player,d=distance(e,p),a=getArena(s.mapId);
  const direct=d<TITAN.landingRadius&&Math.abs((p.y||0)-e.y)<.8&&a.wallDistance(e.x,e.z,(p.x-e.x)/Math.max(.001,d),(p.z-e.z)/Math.max(.001,d),d+.01,e.y+.3,0)>=d-.02;
  if(direct)damage(s,titanDamage(e,TITAN.landingDamage));
  // The impact and expanding flames are separate hazards. A direct impact seeds
  // the fire contact cooldown, preventing two hits during the landing frame.
  s.hazards.push({id:s.nextId++,owner:e.id,kind:'ground-shockwave',flameWave:true,x:e.x,y:e.y,z:e.z,age:0,warning:0,duration:1.2,radius:0,damage:titanDamage(e,28),hit:false,lastDamageAt:direct?s.time:-Infinity});
  event(s,'bossLanding',source(e));
}

export function updateTitanMotion(s,e,dt,damage){
  const arena=getArena(s.mapId);
  if(!e.bossMotion){
    const support=arena.groundHeight(e.x,e.z,e.y+.4);
    const water=s.mapId==='rio'&&e.y<riverTide(s.time-s.riverStartedAt).level-.02;
    if(e.y<-3||water||(!Number.isFinite(support)&&e.vy<0)){
      const target=titanLanding(s,e);if(!target)return false;
      // Spectral recovery emerges visibly from water/void, including below slabs.
      // Only this recovery ascent phases through geometry; it cannot deal damage.
      const ceiling=Math.max(e.y+10,target.y+12,...arena.SURFACES.map(q=>q.ramp?Math.max(q.ramp.from,q.ramp.to)+2:q.y+2));
      e.bossMotion={phase:'rise',from:point(e),target:{...target},ceiling,age:0,duration:1.1};
      e.cast=null;e.charge=null;e.flight=null;e.vy=0;e.anim='attack';e.animTime=0;e.bossAttack='recovery';
      event(s,'bossRecovery',source(e));
    }else return false;
  }
  let remaining=dt;
  while(remaining>1e-8&&e.bossMotion){
    const m=e.bossMotion,part=Math.min(remaining,m.duration-m.age);m.age+=part;remaining-=part;
    const t=Math.min(1,m.age/m.duration);
    if(m.phase==='jump')Object.assign(e,arcPosition(m.from,m.target,m.height,t));
    else if(m.phase==='rise')e.y=lerp(m.from.y,m.ceiling,smooth(t));
    else if(m.phase==='hover'){e.x=lerp(m.from.x,m.target.x,smooth(t));e.z=lerp(m.from.z,m.target.z,smooth(t));e.y=m.ceiling;}
    else if(m.phase==='dive')e.y=lerp(m.ceiling,m.target.y,t*t);
    if(t<1)break;
    if(m.phase==='rise'){m.phase='hover';m.from=point(e);m.duration=1.15;m.age=0;}
    else if(m.phase==='hover'){m.phase='dive';m.duration=.65;m.age=0;}
    else land(s,e,m,damage);
  }
  return true;
}

export function titanPose(e){
  const m=e.bossMotion;
  if(m)return {state:m.phase==='jump'?'sky':'ritual',frame:m.phase==='jump'?3:m.phase==='dive'?1:0};
  if(e.bossAttack==='volley'&&(e.cast||e.anim==='attack'))return {state:'sky',frame:e.cast?0:1};
  if(e.cast?.attack==='jump')return {state:'sky',frame:2};
  if(e.bossAttack==='summon'&&(e.cast||e.anim==='attack'))return {state:'ritual',frame:3};
  if(e.bossAttack==='landing'&&e.anim==='attack')return {state:'ritual',frame:2};
  if(e.bossAttack==='cannon'&&(e.cast||e.anim==='attack'))return {state:'attack',frame:e.cast?0:1};
  return null;
}
