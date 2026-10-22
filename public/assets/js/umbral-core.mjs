// Deterministic combat: movement, sight and projectiles share the arena surfaces.
import {getArena,START,PORTAL_Z,WALLS,SPAWNS,SUPPLIES,groundHeight,solid,move,settle,wallDistance,visible,navigate} from './umbral-arena.mjs';
import {updateTraversal,launch,flightStep} from './umbral-traversal.mjs';
import {aimDirection,rayCylinder} from './umbral-aim.mjs';
import {riverTide} from './umbral-maps.mjs';
import {DESOLLADOR,bossForMap,updateDesollador,damageDesolladorVortex,stopDesolladorVortex,updateWindCapture} from './umbral-desollador.mjs';
import {MADRE,initializeMother,motherHitBounds,madreAllowsDamage,onMotherHit,updateMotherDrag,clearMotherEncounter,updateMadre,updateMotherDeath,motherCaptureLocked,updateMotherCapture} from './umbral-madre.mjs';
import {updateMotherGuardians,interceptMotherShot} from './umbral-madre-guardians.mjs';
import {MOTHER_WATER_POINTS,updateMotherOmen,hideMotherOmenOnAim} from './umbral-madre-river.mjs';
import {TITAN,absorbTitanDamage,beginTitanCast,releaseTitanCast,updateTitanMotion,guideTitanSkull} from './umbral-titan.mjs';
import {downTitan,updateBossFinisher,tryBossFinisher,finisherLocked} from './umbral-finisher.mjs';
import {VARIANT_RULES,variantsEnabled,applyEnemyVariant,enemyDamage} from './umbral-variants.mjs';
export {ENEMY_VARIANTS,VARIANT_RULES} from './umbral-variants.mjs';
export {TITAN};
export {PORTAL_Z,WALLS,SPAWNS,SUPPLIES,solid,move,wallDistance,visible};
export const WEAPONS = [
  {id:'coaiztlactli',name:'Coaiztlactli',ammo:Infinity,cost:0,delay:.24,damage:30,range:2.5,kind:'melee'},
  {id:'escopeta',name:'Escopeta de obsidiana',ammoType:'small',cost:1,delay:.18,damage:15,range:35,kind:'shotgun'},
  {id:'clavadora',name:'Rifle de asalto · Itztepec',ammoType:'obsidian',cost:1,delay:.12,damage:19,range:65,kind:'nail'},
  {id:'espinario',name:'Espinario · Subfusil',ammoType:'thorns',cost:1,delay:.07,damage:12,range:48,kind:'smg'},
  {id:'arco-jaguar',name:'Arco del Jaguar',ammoType:'large',cost:1,delay:.32,damage:75,range:90,kind:'bow'},
  {id:'canon-solar',name:'Cañón Solar',ammoType:'large',cost:1,delay:.65,damage:115,range:95,kind:'gauss'},
];
export const SHOTGUN_RECOIL=.18;
export const SHOTGUN_CYCLE_DURATION=1.15;
export const AMMO_TYPES=Object.freeze({
  small:{label:'CHICA',color:'#e6a340',min:10,max:10},
  large:{label:'GRANDE',color:'#57c8c4',min:4,max:4},
  obsidian:{label:'OBSIDIANA',color:'#b7a0e9',min:10,max:18},
  thorns:{label:'ESPINAS',color:'#9adc57',min:20,max:30},
});
export const INITIAL_AMMO=Object.freeze({small:60,large:24,obsidian:60,thorns:120});
export const SMG_DUAL=Object.freeze({duration:4,cooldown:7});
export const RIFLE_SCOPE=Object.freeze({cooldown:.7,damage:120,cost:3,range:110,fov:32});
// Player energy shield; independent of collectible obsidian ammunition.
export const OBSIDIAN_SHIELD=Object.freeze({max:100,regenDelay:5,regenRate:20,regenDecrease:3,minRegenRate:5,lockFromWave:7});
export const shieldRegenRate=wave=>Math.max(OBSIDIAN_SHIELD.minRegenRate,OBSIDIAN_SHIELD.regenRate-OBSIDIAN_SHIELD.regenDecrease*(Math.max(1,wave)-1));
export const FLAMES=Object.freeze({duration:1,cooldown:8,range:7,angle:.38,burnDuration:3,damagePerSecond:45});
export const MACUAHUITL=Object.freeze({duration:.62,impactTime:.24,cooldown:8,comboWindow:.8,firstDamage:90,secondDamage:120,thirdDamage:180,range:3,angle:.48,shockRadius:6,stunDuration:2});
export const BOW=Object.freeze({nockDuration:.32,secondaryCooldown:3,secondaryCost:3,blastDamage:260,blastRadius:5,burnDuration:2,burnDamage:15});
export const GROUND_FIRE=Object.freeze({height:1.1,halfWidth:.6,speed:9,contactCooldown:.35});
export const ammoForWeapon=(s,index=s.selected)=>WEAPONS[index]?.ammoType?s.ammo[WEAPONS[index].ammoType]:Infinity;
export const ENEMY_TYPES={
  macabro:{hp:100,height:2.6,radius:.52,speed:2.4,interval:2.7,range:38,windup:.48},
  devorador:{hp:70,height:2.1,radius:.48,speed:3.8,interval:2.7,range:15,windup:.65},
  empalador:{hp:190,height:3.3,radius:.6,speed:2.1,interval:3.8,range:25,windup:.75},
  abominacion:{hp:330,height:3.7,radius:.9,speed:1.7,interval:3.4,range:40,windup:.7},
  centinela:{hp:620,height:4.2,radius:.95,speed:2,interval:3.8,range:44,windup:.85},
  acechador:{hp:150,height:1.85,width:2.7,radius:.65,speed:4.5,interval:3.5,range:14,windup:.7},
  tejedor:{hp:210,height:3,radius:.6,speed:1.8,interval:3.8,range:28,windup:.9},
  desollador:{hp:DESOLLADOR.health,shield:0,maxShield:0,height:DESOLLADOR.height,hitHeight:DESOLLADOR.hitHeight,width:DESOLLADOR.width,radius:DESOLLADOR.radius,speed:3,interval:3.2,range:65,windup:1.1,boss:true},
  madre:{hp:MADRE.health,shield:0,maxShield:0,height:MADRE.height,width:MADRE.width,radius:1,speed:2,interval:3.2,range:70,windup:1.15,boss:true},
  titan:{hp:TITAN.maxHealth,shield:TITAN.maxShield,maxShield:TITAN.maxShield,height:4.6*TITAN.scale,width:5.2*TITAN.scale,radius:.95,speed:1.7,interval:3.8,range:44,windup:1.05,boss:true},
};
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const foot=e=>(e.y||0)+(e.kind==='devorador'?.45:0);
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
const ammoTypes=Object.keys(AMMO_TYPES);
const randomAmmoType=s=>ammoTypes[Math.floor(random(s)*ammoTypes.length)];
function ammoAmount(s,type){const {min,max}=AMMO_TYPES[type];return min+(max>min?Math.floor(random(s)*(max-min+1)):0);}
function emit(s,type,data={}){s.events.push({type,...data});}
const enemySource=e=>({id:e.id,kind:e.kind,x:e.x,y:e.y,z:e.z});
const enemyAttackName=e=>e.boss?e.bossAttack:({macabro:'projectile',devorador:'charge',abominacion:'acid-volley',centinela:'plasma',acechador:'jump',empalador:'spikes',tejedor:'plasma'})[e.kind];
export function createState(mapId='cuenca'){const arena=getArena(mapId);return {
  mapId,
  time:0,phase:'ready',health:5,portalUsed:false,wave:0,kills:0,selected:1,
  shield:OBSIDIAN_SHIELD.max,shieldRegenAt:0,shieldFlash:0,shieldLockedWave:0,clearedWave:0,
  ammo:{...INITIAL_AMMO},flameRemaining:0,flameCooldown:0,player:{...arena.START,vy:0,yaw:0,pitch:0,height:1.75,grounded:true},
  macuahuitlRemaining:0,macuahuitlCooldown:0,macuahuitlHit:false,macuahuitlCharged:false,macuahuitlSpent:false,
  macuahuitlCombo:0,macuahuitlComboUntil:0,macuahuitlDamage:0,macuahuitlQueued:false,
  enemies:[],projectiles:[],hazards:[],spawnWarnings:[],shieldLinks:[],
  supplies:arena.SUPPLIES.map((p,i)=>({...p,id:i,cooldown:0,ammoType:i===6?'thorns':i===4?'obsidian':i%2?'small':'large'})),drops:[],nextAmmoSpawn:16,events:[],cooldown:0,cooldownWeapon:null,
  // This is a firing rhythm, not a magazine. Both barrels use the small reserve.
  shotgunShots:0,shotgunRecoilRemaining:0,shotgunCycleRemaining:0,
  bowRecoveryRemaining:0,bowSecondaryCooldown:0,triggerHeld:{primary:false,secondary:false},
  rifleScoped:false,rifleSecondaryCooldown:0,smgDualRemaining:0,smgDualCooldown:0,
  nextWave:0,nextSpawn:0,pending:0,spawnCount:0,variantSpawnCount:0,elevatedSpawnScheduled:false,nextId:1,shotSerial:0,seed:32026,
  damageFlash:0,portalFlash:0,bossPending:false,bossSpawned:false,bossFinish:null,tidePhase:'calm',riverStartedAt:0,riverImmersed:false,motherDrag:null,motherOmen:null,motherCapture:null,motherCaptureAfter:0,
};}
export function selectWeapon(s,index){
  if(finisherLocked(s)||motherCaptureLocked(s))return false;
  if(!Number.isInteger(index)||!WEAPONS[index])return false;
  if(index!==s.selected)endDual(s);s.rifleScoped=false;s.selected=index;emit(s,'equip',{index});return true;
}
function endDual(s){if(s.smgDualRemaining>0){s.smgDualRemaining=0;s.smgDualCooldown=SMG_DUAL.cooldown;}}
export function activateDual(s){
  if(finisherLocked(s)||motherCaptureLocked(s)||s.phase!=='playing'||WEAPONS[s.selected].kind!=='smg'||s.smgDualRemaining>0||s.smgDualCooldown>1e-8||s.flameRemaining>0||s.macuahuitlRemaining>0)return false;
  s.smgDualRemaining=SMG_DUAL.duration;emit(s,'dual');return true;
}
export function setRifleScope(s,active){s.rifleScoped=!!active&&!finisherLocked(s)&&!motherCaptureLocked(s)&&s.phase==='playing'&&s.selected===2&&s.flameRemaining<=0&&s.macuahuitlRemaining<=0;return s.rifleScoped;}
export function damagePlayer(s,amount,{bypassShield=false,motherCapture=false}={}){
  if(s.training||finisherLocked(s)||(motherCaptureLocked(s)&&!motherCapture))return;
  // The defeated river boss gets one uninterrupted farewell before the next wave.
  if(s.enemies.some(e=>e.kind==='madre'&&e.hp<=0&&e.deadTime<MADRE.deathDuration))return;
  if(s.phase!=='playing'||!s.portalUsed||!Number.isFinite(amount)||amount<=0)return;
  const absorbed=bypassShield?0:Math.min(s.shield,amount),overflow=amount-absorbed;
  s.shield-=absorbed;s.shieldRegenAt=s.time+OBSIDIAN_SHIELD.regenDelay;
  // Damage after a cleared wave cannot re-lock the shield to that finished wave.
  if(s.shield===0&&s.wave>=OBSIDIAN_SHIELD.lockFromWave&&s.wave>s.clearedWave)s.shieldLockedWave=s.wave;
  if(absorbed>0){s.shieldFlash=.3;emit(s,'shieldHit');if(s.shield===0)emit(s,'shieldBreak');}
  if(overflow>0){s.health=Math.max(0,s.health-overflow);s.damageFlash=.3;emit(s,'pain');}
  if(!s.health){s.phase='dead';clearMotherEncounter(s,'death');s.motherOmen=null;s.player.windCapture=null;for(const e of s.enemies)if(e.kind==='desollador'){e.windSuction=null;e.vortexTravel=null;e.bladeStorm=null;}emit(s,'death');}
}
function regeneratePlayerShield(s,dt){
  if(s.phase!=='playing'||s.shieldLockedWave||s.shield>=OBSIDIAN_SHIELD.max)return;
  // Count only the portion of this simulation step after the delay expires.
  const eligible=Math.max(0,s.time-Math.max(s.time-dt,s.shieldRegenAt));
  s.shield=Math.min(OBSIDIAN_SHIELD.max,s.shield+shieldRegenRate(s.wave)*eligible);
  if(OBSIDIAN_SHIELD.max-s.shield<1e-8)s.shield=OBSIDIAN_SHIELD.max;
}
export function createEnemy(s,kind,point){
  const arena=getArena(s.mapId);
  const type=ENEMY_TYPES[kind];
  const pillar=point.elevated?arena.WALLS.find(w=>w.id===point.pillarId):null;
  const e={...point,...type,maxHp:type.hp,enraged:false,exposedUntil:0,id:s.nextId++,kind,y:point.y??arena.groundHeight(point.x,point.z),vy:0,
    anim:'move',animTime:0,attack:1.2+random(s),stun:0,deadTime:0,turn:random(s)>.5?1:-1,
    cast:null,charge:null,attacks:0,burnRemaining:0,flameMarked:false,arrowBurnRemaining:0,shockStunUntil:0,
    perch:pillar?{x:pillar.x,z:pillar.z,w:pillar.w,d:pillar.d,y:point.y,
      landing:{...point.landing},hiddenTime:0,descending:false,falling:false}:null};
  if(!variantsEnabled(s))e.variant=false;
  applyEnemyVariant(e);
  if(kind==='madre'){initializeMother(s,e);updateMotherGuardians(s,e,0);}
  if(e.variant&&point.variantWave===s.wave)s.variantSpawnCount++;
  s.enemies.push(e);emit(s,'enemySpawn',enemySource(e));return e;
}
export function hitEnemy(s,e,damage,source='weapon',impactY=null){
  const arena=getArena(s.mapId);
  if(e.hp<=0||(e.downed&&source!=='finisher')||!Number.isFinite(damage)||damage<=0)return;
  if(e.kind==='madre'&&!madreAllowsDamage(s,e,source,impactY))return;
  // The chest is a real weak point: only aimed direct hits during recovery get the bonus.
  if(e.boss&&e.shield<=0&&e.exposedUntil>s.time&&impactY!==null&&impactY>=foot(e)+e.height*.43&&impactY<=foot(e)+e.height*.76)damage*=TITAN.weakMultiplier;
  if(source!=='macuahuitl'&&source!=='burn'&&source!=='arrowBurn'&&s.enemies.some(w=>isShielding(s,w,e)))damage*=.65;
  if(e.kind==='titan')damage=absorbTitanDamage(s,e,damage);
  if(e.kind==='desollador'&&source!=='burn'&&source!=='arrowBurn')damageDesolladorVortex(s,e,damage);
  if(e.kind==='madre')onMotherHit(s,e,damage,source,impactY);
  e.hp-=damage;
  if(e.kind==='madre')updateMotherGuardians(s,e,0);
  if(e.kind==='titan'&&e.hp<=0&&source!=='finisher'){
    downTitan(s,e);emit(s,'hit',{...enemySource(e),source,weaponIndex:s.selected,y:foot(e)+e.height*.5,dead:false});return;
  }
  const dot=source==='burn'||source==='arrowBurn';
  if(!dot||e.hp<=0){if(!e.boss||e.hp<=0){e.anim=e.hp<=0?'death':'hurt';e.animTime=0;}if(!dot&&!e.boss)e.stun=.15;}
  if(!dot||e.hp<=0){
    const bounds=e.kind==='madre'?motherHitBounds(s,e):null;
    const hitY=bounds?(Number.isFinite(impactY)?impactY:(bounds.low+bounds.high)*.5):foot(e)+e.height*.5;
    emit(s,'hit',{...enemySource(e),source,weaponIndex:s.selected,y:hitY,dead:e.hp<=0});
  }
  if(e.hp>0)return;
  s.kills++;e.deadTime=0;e.cast=null;e.charge=null;delete e.audioLandingPending;emit(s,'kill',{...enemySource(e),source});
  if(e.kind==='madre')clearMotherEncounter(s,'defeated');
  if(e.kind==='desollador')stopDesolladorVortex(s,e,'defeated');
  if(e.boss){e.windSuction=null;e.bossMotion=null;s.projectiles=s.projectiles.filter(b=>b.owner!==e.id);s.hazards=s.hazards.filter(h=>h.owner!==e.id);s.spawnWarnings=s.spawnWarnings.filter(w=>w.summonedBy!==e.id);emit(s,'bossDefeated',enemySource(e));}
  // Pillar sentries release loot at their walkable landing, not on an unreachable crown.
  const lootPoint=e.perch?.landing?{...e.perch.landing,y:arena.groundHeight(e.perch.landing.x,e.perch.landing.z)}:e;
  if(source==='macuahuitl'||source==='finisher'){
    const roll=random(s),count=roll<.45?1:roll<.9?2:3;
    for(let i=0;i<count;i++)addDrop(s,lootPoint,{kind:'health',amount:8+Math.floor(random(s)*3),source:'sacrifice'});
  }
  if(e.flameMarked||source==='burn'){
    addAmmoDrop(s,lootPoint,'small',15+Math.floor(random(s)*6),'burn');
    addAmmoDrop(s,lootPoint,'large',7+Math.floor(random(s)*4),'burn');
    addAmmoDrop(s,lootPoint,'obsidian',ammoAmount(s,'obsidian'),'burn');
    emit(s,'burnKill',{id:e.id});
  }
  if(e.kind==='devorador'){
    emit(s,'burst',{x:e.x,y:foot(e)+.8,z:e.z,kind:'plasma-projectile'});
    if(distance(e,s.player)<2.8&&Math.abs(foot(e)-(s.player.y||0))<2&&arena.visible(e,s.player))damagePlayer(s,enemyDamage(e,10));
  }
  if(e.kind==='abominacion'){
    for(const side of [-1,1]){
      const point={x:e.x+side*1.8,z:e.z,y:e.y,variant:e.variant};
      if(!arena.solid(point.x,point.z,.48,point.y,2.1)&&s.enemies.filter(a=>a.hp>0).length<16)createEnemy(s,'devorador',point);
    }
  }
}
function hitscan(s,angle,pitch,range,damage,pierce=false,sniper=false){
  const arena=getArena(s.mapId);
  const p=s.player,direction=aimDirection(angle,pitch),{x:dx,y:dy,z:dz}=direction,origin=(p.y||0)+1.6;
  const wall=arena.wallDistance(p.x,p.z,dx,dz,range,origin,dy);
  const hits=s.enemies.filter(e=>e.hp>0).map(e=>{
    const bounds=e.kind==='madre'?motherHitBounds(s,e):{low:foot(e)+.1,high:foot(e)+(e.hitHeight||e.height),radius:e.radius};
    const t=rayCylinder({x:p.x,y:origin,z:p.z},direction,{x:e.x,z:e.z,radius:bounds.radius},bounds.low,bounds.high,wall);
    return {e,t};
  }).filter(h=>h.t!==null).sort((a,b)=>a.t-b.t);
  const selected=pierce?hits:hits.slice(0,1);
  let length=wall,intercepted=false;
  for(const h of selected){
    // Only a shot that would reach her exposed head can summon a defender.
    // A single trigger pull shares its interception across pellets/dual fire.
    const guard=h.e.kind==='madre'?interceptMotherShot(s,h.e,{x:p.x,y:origin,z:p.z},direction,h.t,s.shotSerial):null;
    if(guard){length=guard.t;intercepted=true;break;}
    hitEnemy(s,h.e,damage,'weapon',origin+dy*h.t);
    if(!pierce){length=h.t;break;}
  }
  emit(s,sniper?'sniperTrail':'trace',{secondary:sniper,intercepted,x:p.x,z:p.z,y:origin,tx:p.x+dx*length,tz:p.z+dz*length,ty:origin+dy*length,kind:WEAPONS[s.selected].kind});
}
function fireBow(s,secondary,w){
  const arena=getArena(s.mapId);
  const p=s.player,direction=aimDirection(p.yaw,p.pitch),{x:dx,y:dy,z:dz}=direction,y=(p.y||0)+1.6;
  const wall=arena.wallDistance(p.x,p.z,dx,dz,w.range,y,dy);
  let guard=null,length=wall,direct=null;
  for(const e of s.enemies){
    if(e.hp<=0)continue;
    const bounds=e.kind==='madre'?motherHitBounds(s,e):{low:foot(e)+.1,high:foot(e)+(e.hitHeight||e.height),radius:e.radius};
    const hit=rayCylinder({x:p.x,y,z:p.z},direction,{x:e.x,z:e.z,radius:bounds.radius},bounds.low,bounds.high,length);
    if(hit!==null){length=hit;direct=e;}
  }
  if(direct?.kind==='madre'){
    guard=interceptMotherShot(s,direct,{x:p.x,y,z:p.z},direction,length,s.shotSerial);
    if(guard){length=guard.t;direct=null;}
  }
  // Keep wall impacts just outside the surface so the flash and blast remain visible.
  if(!direct&&!guard&&wall<w.range)length=Math.max(0,length-.025);
  const point={x:p.x+dx*length,y:y+dy*length,z:p.z+dz*length};
  emit(s,'bowTrail',{x:p.x,y,z:p.z,tx:point.x,ty:point.y,tz:point.z,secondary,intercepted:!!guard});
  if(secondary){if(direct||guard||wall<w.range)explodeBow(s,point,direct);}
  else{
    if(direct){hitEnemy(s,direct,w.damage,'bow',point.y);if(direct.hp>0)direct.arrowBurnRemaining=BOW.burnDuration;}
    if(direct||guard||wall<w.range)emit(s,'impact',{...point,kind:'jaguar-impact-orange'});
  }
}
function aimedTarget(s,e,horizontalAngle,verticalAngle,range){
  const p=s.player,eye=(p.y||0)+1.6,aim=aimDirection(p.yaw,p.pitch);
  const dx=e.x-p.x,dz=e.z-p.z,horizontal=Math.hypot(dx,dz),flat=Math.hypot(aim.x,aim.z);
  const bounds=e.kind==='madre'?motherHitBounds(s,e):null;
  const low=bounds?.low??foot(e)+.15,high=bounds?.high??foot(e)+(e.hitHeight||e.height)-.1;
  const targetY=flat<1e-8?(aim.y>0?low:high):clamp(eye+aim.y*horizontal/flat,low,high);
  const dy=targetY-eye,d=Math.hypot(dx,dy,dz);if(d<1e-8||d>=range)return null;
  const forward=dx*aim.x+dy*aim.y+dz*aim.z;
  const side=dx*Math.cos(p.yaw)-dz*Math.sin(p.yaw);
  const up=dx*Math.sin(p.yaw)*Math.sin(p.pitch)+dy*Math.cos(p.pitch)+dz*Math.cos(p.yaw)*Math.sin(p.pitch);
  if(forward<=0||Math.abs(Math.atan2(side,forward))>=horizontalAngle||Math.abs(Math.atan2(up,forward))>=verticalAngle)return null;
  if(getArena(s.mapId).wallDistance(p.x,p.z,dx/d,dz/d,d,eye,dy/d)<d-.02)return null;
  return {e,d,alignment:forward/d};
}
export function fire(s,secondary=false){
  if(finisherLocked(s)||motherCaptureLocked(s)||s.phase!=='playing'||s.flameRemaining>0||s.macuahuitlRemaining>0)return false;
  hideMotherOmenOnAim(s);
  for(const e of s.enemies)if(e.kind==='madre')updateMotherGuardians(s,e,0);
  const w=WEAPONS[s.selected],shotgun=w.kind==='shotgun';
  if(w.kind==='nail'&&secondary)return setRifleScope(s,true);
  const scoped=w.kind==='nail'&&s.rifleScoped;
  if(scoped&&s.rifleSecondaryCooldown>1e-8)return false;
  if(w.kind==='smg'&&secondary)return activateDual(s);
  const dual=w.kind==='smg'&&s.smgDualRemaining>0;
  if(w.kind==='bow'){
    s.triggerHeld[secondary?'secondary':'primary']=true;
    if(s.bowRecoveryRemaining>1e-8||(secondary&&s.bowSecondaryCooldown>1e-8))return false;
  }
  if(s.cooldown>1e-8&&(s.cooldownWeapon!==1||shotgun))return false;
  if(shotgun&&(s.shotgunRecoilRemaining>1e-8||s.shotgunCycleRemaining>1e-8))return false;
  const cost=dual?0:scoped?RIFLE_SCOPE.cost:w.kind==='bow'&&secondary?BOW.secondaryCost:w.cost*(secondary?(shotgun?2:3):1);
  if(ammoForWeapon(s)<cost){s.cooldown=.2;s.cooldownWeapon=s.selected;emit(s,'empty');return false;}
  if(w.ammoType)s.ammo[w.ammoType]-=cost;
  s.cooldown=shotgun?SHOTGUN_RECOIL:w.delay*(secondary?1.65:1);s.cooldownWeapon=s.selected;s.shotSerial++;
  emit(s,'shot',{index:s.selected,secondary:scoped||secondary,scoped,dual});
  if(scoped){s.rifleSecondaryCooldown=RIFLE_SCOPE.cooldown;hitscan(s,s.player.yaw,s.player.pitch,RIFLE_SCOPE.range,RIFLE_SCOPE.damage,false,true);return true;}
  if(w.kind==='bow'){
    s.bowRecoveryRemaining=BOW.nockDuration;s.cooldown=BOW.nockDuration;
    if(secondary)s.bowSecondaryCooldown=BOW.secondaryCooldown;
    fireBow(s,secondary,w);
    return true;
  }
  if(shotgun){
    s.shotgunRecoilRemaining=SHOTGUN_RECOIL;
    if(secondary||s.shotgunShots===1){
      s.shotgunShots=0;s.shotgunCycleRemaining=SHOTGUN_RECOIL+SHOTGUN_CYCLE_DURATION;
      emit(s,'shotgunCycle',{index:s.selected,offset:SHOTGUN_RECOIL,duration:SHOTGUN_CYCLE_DURATION,total:s.shotgunCycleRemaining});
    }else s.shotgunShots=1;
  }
  const p=s.player,boost=secondary?2:1;
  if(w.kind==='melee'){
    for(const e of s.enemies){
      if(e.hp<=0)continue;
      if(aimedTarget(s,e,.75,.65,w.range))hitEnemy(s,e,w.damage*boost,'knife');
    }
  }else if(w.kind==='shotgun'){
    for(let i=0;i<(secondary?16:8);i++)hitscan(s,p.yaw+(random(s)-.5)*.19,p.pitch+(random(s)-.5)*.11,w.range,w.damage);
  }else {hitscan(s,p.yaw,p.pitch,w.range,w.damage*boost,w.kind==='gauss');if(dual)hitscan(s,p.yaw,p.pitch,w.range,w.damage);}
  return true;
}
export function activateFlames(s){
  if(finisherLocked(s)||motherCaptureLocked(s)||s.phase!=='playing'||s.flameRemaining>0||s.macuahuitlRemaining>0||s.flameCooldown>1e-8)return false;
  endDual(s);s.rifleScoped=false;s.flameRemaining=FLAMES.duration;emit(s,'flames');return true;
}
export function activateMacuahuitl(s){
  if(tryBossFinisher(s))return true;
  if(finisherLocked(s)||motherCaptureLocked(s))return false;
  if(s.phase!=='playing'||s.flameRemaining>0)return false;
  if(s.macuahuitlRemaining>0){
    // Buffer one fresh press during recovery, never stack several attacks at once.
    if(!s.macuahuitlCharged&&s.macuahuitlHit&&!s.macuahuitlQueued){s.macuahuitlQueued=true;return true;}
    return false;
  }
  endDual(s);s.rifleScoped=false;s.macuahuitlRemaining=MACUAHUITL.duration;s.macuahuitlHit=false;
  // Latch the attack at key-down: a melee swing cannot turn into an execution mid-swing.
  s.macuahuitlCharged=s.macuahuitlCooldown<=1e-8;s.macuahuitlSpent=false;
  s.macuahuitlQueued=false;
  s.macuahuitlCombo=s.macuahuitlCharged?0:s.time<=s.macuahuitlComboUntil?s.macuahuitlCombo%3+1:1;
  s.macuahuitlComboUntil=s.macuahuitlCharged?0:s.time+MACUAHUITL.duration+MACUAHUITL.comboWindow;
  s.macuahuitlDamage=s.macuahuitlCharged?0:s.macuahuitlCombo===3?MACUAHUITL.thirdDamage:s.macuahuitlCombo===2?MACUAHUITL.secondDamage:MACUAHUITL.firstDamage;
  emit(s,'macuahuitl',{charged:s.macuahuitlCharged,combo:s.macuahuitlCombo});return true;
}
function strikeMacuahuitl(s){
  const arena=getArena(s.mapId);
  if(!s.portalUsed)return;
  // Select exactly one reachable target nearest the crosshair at the impact frame.
  const targets=s.enemies.filter(e=>e.hp>0&&!e.downed&&e.kind!=='madre').map(e=>aimedTarget(s,e,MACUAHUITL.angle,.45,MACUAHUITL.range))
    .filter(Boolean).sort((a,b)=>b.alignment-a.alignment||a.d-b.d);
  const target=targets[0]?.e;if(!target){emit(s,'macuahuitlMiss');return;}
  const origin={x:target.x,y:foot(target)+target.height*.45,z:target.z};
  if(!s.macuahuitlCharged){
    hitEnemy(s,target,s.macuahuitlDamage,'macuahuitlMelee');
    emit(s,'macuahuitlMeleeImpact',{...origin,id:target.id,combo:s.macuahuitlCombo,damage:s.macuahuitlDamage});
    return;
  }
  s.macuahuitlSpent=true;
  hitEnemy(s,target,target.boss?TITAN.chargedDamage:target.macuahuitlImmune?VARIANT_RULES.chargedMacuahuitlDamage:target.hp,'macuahuitl');
  const stunned=[];
  // A true interrupt: pending casts/charges and untriggered ground attacks are cancelled.
  for(const e of s.enemies){
    if(e.hp<=0||e.downed||e.kind==='madre')continue;
    const dx=e.x-origin.x,dz=e.z-origin.z,dy=foot(e)+e.height*.45-origin.y,horizontal=Math.hypot(dx,dz);
    if(Math.hypot(horizontal,dy)>MACUAHUITL.shockRadius)continue;
    const length=Math.max(.001,horizontal);
    if(arena.wallDistance(origin.x,origin.z,dx/length,dz/length,length,origin.y,dy/length)<length-.02)continue;
    if(e.kind==='desollador')stopDesolladorVortex(s,e);
    e.shockStunUntil=s.time+MACUAHUITL.stunDuration;e.cast=null;e.charge=null;e.flight=null;e.bossMotion=null;e.windSuction=null;e.anim='hurt';e.animTime=0;
    stunned.push(e.id);
  }
  const interrupted=new Set([target.id,...stunned]);
  s.hazards=s.hazards.filter(h=>!interrupted.has(h.owner)||h.age>=h.warning);
  emit(s,'macuahuitlImpact',{...origin,groundY:foot(target),radius:MACUAHUITL.shockRadius,stunned:stunned.length,boss:!!target.boss,resistant:!!target.macuahuitlImmune});
}
function updateMacuahuitl(s,dt){
  s.macuahuitlCooldown=Math.max(0,s.macuahuitlCooldown-dt);
  if(s.macuahuitlRemaining<=0)return;
  const activeTime=Math.min(dt,s.macuahuitlRemaining);
  s.macuahuitlRemaining=Math.max(0,s.macuahuitlRemaining-dt);
  if(!s.macuahuitlHit&&MACUAHUITL.duration-s.macuahuitlRemaining>=MACUAHUITL.impactTime-1e-8){
    s.macuahuitlHit=true;strikeMacuahuitl(s);
  }
  if(s.macuahuitlRemaining<1e-8){
    s.macuahuitlRemaining=0;
    // Only a confirmed powered hit spends the charge. Misses and ordinary melee
    // leave the existing recharge timer running, including when it reaches zero.
    if(s.macuahuitlSpent)s.macuahuitlCooldown=MACUAHUITL.cooldown-(dt-activeTime);
    if(s.macuahuitlQueued){
      s.macuahuitlQueued=false;
      if(activateMacuahuitl(s))s.macuahuitlRemaining=Math.max(0,s.macuahuitlRemaining-(dt-activeTime));
    }
  }
}
function updateFlames(s,dt){
  const activeTime=Math.min(dt,s.flameRemaining);
  s.flameCooldown=Math.max(0,s.flameCooldown-dt);
  if(activeTime>0){
    s.flameRemaining=Math.max(0,s.flameRemaining-dt);
    if(s.flameRemaining<1e-8){s.flameRemaining=0;s.flameCooldown=FLAMES.cooldown-(dt-activeTime);}
  }
  if(!s.portalUsed)return;
  for(const e of [...s.enemies]){
    if(s.phase!=='playing')break;
    if(e.hp<=0||e.downed)continue;
    if(activeTime>0){
      if(aimedTarget(s,e,FLAMES.angle,.55,FLAMES.range)){
        e.burnRemaining=FLAMES.burnDuration;
        // This reward survives extinguishing and any later finishing weapon.
        e.flameMarked=true;
      }
    }
    if(e.burnRemaining>0){
      const burning=Math.min(dt,e.burnRemaining);e.burnRemaining=Math.max(0,e.burnRemaining-dt);
      hitEnemy(s,e,FLAMES.damagePerSecond*burning,'burn');
    }
    if(e.hp>0&&e.arrowBurnRemaining>0){
      const burning=Math.min(dt,e.arrowBurnRemaining);e.arrowBurnRemaining=Math.max(0,e.arrowBurnRemaining-dt);
      hitEnemy(s,e,BOW.burnDamage*burning,'arrowBurn');
    }
  }
}
function addDrop(s,point,reward){
  const arena=getArena(s.mapId);
  if(s.drops.length>=64)s.drops.shift();
  const drop={id:s.nextId++,x:point.x,z:point.z,y:(point.y||0)+.25,vy:2,collisionHeight:.3,...reward,life:45,age:0};
  // Scatter on the current walkable surface; collision prevents loot entering walls.
  const angle=random(s)*Math.PI*2;
  arena.move(drop,Math.cos(angle)*.65,Math.sin(angle)*.65,.18);
  s.drops.push(drop);return drop;
}
function addAmmoDrop(s,point,ammoType,amount,source){return addDrop(s,point,{kind:'ammo',ammoType,amount,source});}
function updateDrops(s,dt){
  const arena=getArena(s.mapId);
  s.nextAmmoSpawn-=dt;
  if(s.nextAmmoSpawn<=0){
    s.nextAmmoSpawn=18+random(s)*10;
    if(s.drops.filter(d=>d.source==='arena').length<6){
      const candidates=arena.SUPPLIES.filter(p=>distance(p,s.player)>4&&!s.drops.some(d=>distance(d,p)<2));
      if(candidates.length){
        const point=candidates[Math.floor(random(s)*candidates.length)],type=randomAmmoType(s);
        addAmmoDrop(s,point,type,ammoAmount(s,type),'arena');
      }
    }
  }
  for(const drop of s.drops){
    drop.life-=dt;drop.age+=dt;arena.settle(drop,dt);
    if(drop.life<=0||drop.age<.35||distance(drop,s.player)>1.2||Math.abs(drop.y-(s.player.y||0))>.7||!arena.visible(s.player,drop))continue;
    if(drop.kind==='health'){
      if(s.health>=100)continue;
      const amount=Math.min(drop.amount,100-s.health);s.health+=amount;
      emit(s,'pickup',{kind:'health',amount,source:drop.source});
    }else{
      s.ammo[drop.ammoType]+=drop.amount;
      emit(s,'pickup',{kind:'ammo',ammoType:drop.ammoType,amount:drop.amount,source:drop.source});
    }
    drop.life=0;
  }
  s.drops=s.drops.filter(d=>d.life>0&&d.y>-12);
}
function beginWave(s){
  s.wave++;s.pending=Math.min(6+s.wave*2,32);s.nextSpawn=.2;s.nextWave=0;s.spawnCount=0;s.variantSpawnCount=0;s.elevatedSpawnScheduled=false;
  // Wave 10 has a single scheduled enemy. Only the boss may summon its imps.
  s.bossPending=s.wave===TITAN.wave&&!s.bossSpawned&&!!bossForMap(s.mapId);
  if(s.bossPending)s.pending=1;
  if(s.wave>=OBSIDIAN_SHIELD.lockFromWave&&s.shield===0)s.shieldLockedWave=s.wave;
  emit(s,'wave',{wave:s.wave});
}
function finishWave(s){
  if(s.wave<=s.clearedWave)return;
  s.clearedWave=s.wave;
  if(s.shieldLockedWave&&s.shieldLockedWave<=s.clearedWave){
    s.shieldLockedWave=0;
    // Resume next tick; neither refill nor credit time spent locked. Keep the damage delay.
    s.shieldRegenAt=Math.max(s.shieldRegenAt,s.time);emit(s,'shieldUnlocked');
  }
}
function nextKind(s){
  const pool=s.wave===1?['macabro','acechador','devorador','tejedor','empalador']:
    s.wave===2?['macabro','acechador','tejedor','empalador','abominacion']:
    ['macabro','acechador','devorador','empalador','tejedor','abominacion','centinela'];
  const kind=pool[s.spawnCount%pool.length],cap=kind==='tejedor'?2:kind==='acechador'?3:14;
  return s.enemies.filter(e=>e.hp>0&&e.kind===kind).length+s.spawnWarnings.filter(e=>e.kind===kind).length>=cap?'macabro':kind;
}
function scheduleSpawn(s){
  const arena=getArena(s.mapId);
  const p=s.player;
  function available(q,kind,allowVisible=false){
    const type=ENEMY_TYPES[kind];
    if(q.elevated&&['abominacion','acechador','tejedor'].includes(kind))return false;
    const d=distance(q,p),dot=(-Math.sin(p.yaw)*(q.x-p.x)-Math.cos(p.yaw)*(q.z-p.z))/Math.max(1,d);
    return d>11&&!arena.solid(q.x,q.z,type.radius,q.y,type.height)&&
      !s.enemies.some(e=>e.hp>0&&distance(e,q)<3)&&!s.spawnWarnings.some(w=>distance(w,q)<3)&&(allowVisible||dot<.6||!arena.visible(p,q));
  }
  // A visibly telegraphed Macabro demonstrates the elevated threat each wave.
  // Remaining arrivals retain the normal off-camera spawn policy and pool.
  let kind=nextKind(s),candidates=[],priorityElevated=false;
  const boss=s.bossPending;
  if(boss){kind=bossForMap(s.mapId);candidates=(kind==='madre'?MOTHER_WATER_POINTS:arena.BOSS_SPAWNS||arena.SPAWNS.filter(q=>!q.elevated)).filter(q=>available(q,kind,true));}
  if(!boss&&!s.elevatedSpawnScheduled){
    candidates=arena.SPAWNS.filter(q=>q.elevated&&available(q,'macabro',true));
    if(candidates.length){kind='macabro';priorityElevated=true;}
  }
  if(!boss&&!candidates.length)candidates=arena.SPAWNS.filter(q=>available(q,kind)&&(!q.elevated||s.elevatedSpawnScheduled));
  if(!candidates.length){s.nextSpawn=.4;return;}
  const q=candidates[Math.floor(random(s)*candidates.length)];
  const delay=boss?2.5:1.25;
  // Reserve the first variant in an eligible wave. A rejected warning is not
  // counted as a spawn, so the next successful arrival still fulfils it.
  const variant=!boss&&variantsEnabled(s)&&((s.variantSpawnCount===0&&!s.spawnWarnings.some(w=>w.variant&&w.variantWave===s.wave))||random(s)<VARIANT_RULES.chance);
  s.spawnWarnings.push({...q,id:s.nextId++,kind,variant,variantWave:s.wave,priorityElevated,remaining:delay,total:delay});
  if(boss)s.bossPending=false;
  if(priorityElevated)s.elevatedSpawnScheduled=true;
  s.pending--;s.spawnCount++;s.nextSpawn=1.3;emit(s,'spawnWarning',q);
}
function releaseSpawns(s,dt){
  const arena=getArena(s.mapId);
  for(const warning of s.spawnWarnings){
    if(warning.summonedBy&&!s.enemies.some(e=>e.id===warning.summonedBy&&e.hp>0)){warning.finished=true;continue;}
    warning.remaining-=dt;if(warning.remaining>0)continue;
    const type=ENEMY_TYPES[warning.kind];
    if(distance(warning,s.player)<6||arena.solid(warning.x,warning.z,type.radius,warning.y,type.height)){
      if(warning.priorityElevated)s.elevatedSpawnScheduled=false;
      if(type.boss)s.bossPending=true;
      if(!warning.summonedBy)s.pending++;warning.finished=true;continue;
    }
    createEnemy(s,warning.kind,warning);warning.finished=true;emit(s,'spawn',warning);
    if(type.boss){s.bossSpawned=true;emit(s,'bossArrived',{kind:warning.kind});}
  }
  s.spawnWarnings=s.spawnWarnings.filter(w=>!w.finished);
}
function projectile(s,e,kind,offset=0){
  const p=s.player,d=Math.max(.1,distance(e,p)),angle=Math.atan2(p.x-e.x,p.z-e.z)+offset;
  const speed=kind==='plasma-projectile'?8:kind==='acid-projectile'?8.5:10;
  const y=foot(e)+e.height*.65,gravity=kind==='acid-projectile'?.6:0,travel=d/speed;
  s.projectiles.push({id:s.nextId++,kind,owner:e.id,x:e.x,y,z:e.z,dx:Math.sin(angle)*speed,dz:Math.cos(angle)*speed,
    dy:(((p.y||0)+1.1-y)/d)*speed+gravity*travel*.5,speed,gravity,homing:kind==='plasma-projectile',age:0,life:8,
    radius:kind==='acid-projectile'?.22:.18,damage:enemyDamage(e,kind==='plasma-projectile'?12:kind==='acid-projectile'?10:8)});
}
function startAttack(s,e){
  const arena=getArena(s.mapId);
  const p=s.player;e.anim='attack';e.animTime=0;e.attacks++;e.attack=e.interval+random(s)*.6;
  if(e.boss){
    beginTitanCast(s,e);
  }else if(e.kind==='acechador'){
    const target={x:p.x,z:p.z,y:arena.groundHeight(p.x,p.z,(p.y||0)+.4)};
    const duration=.8+Math.min(.3,distance(e,p)/40);
    if(s.enemies.filter(o=>o!==e&&o.hp>0&&o.kind==='acechador'&&(o.flight||o.cast)).length<2&&safeLeap(arena,e,target,duration))e.cast={remaining:e.windup,target,duration};
    else{e.anim='move';e.attack=.6;}
  }else if(e.kind==='empalador'){
    const angle=Math.atan2(p.x-e.x,p.z-e.z);
    for(let i=-1;i<=1;i++){
      const x=p.x+Math.sin(angle)*i*1.8,z=p.z+Math.cos(angle)*i*1.8,y=arena.groundHeight(x,z,(p.y||0)+.4);
      if(!Number.isFinite(y)||arena.solid(x,z,.3,y,.6))continue;
      s.hazards.push({id:s.nextId++,owner:e.id,kind:'obsidian-spikes',attack:'spikes',attackGroup:`${e.id}:${e.attacks}`,x,y,z,age:0,warning:.8+(i+1)*.12,duration:.65,radius:1.15,damage:enemyDamage(e,16),hit:false});
    }
  }else if(e.kind==='centinela'&&e.attacks%2===0&&distance(e,p)<19&&Math.abs(e.y-(p.y||0))<1){
    e.anim='mace';
    s.hazards.push({id:s.nextId++,owner:e.id,kind:'ground-shockwave',flameWave:true,attack:'slam',x:e.x,y:e.y,z:e.z,age:0,warning:.85,duration:2,radius:0,damage:enemyDamage(e,20),hit:false});
  }else{
    const d=Math.max(.01,distance(e,p));e.cast={remaining:e.windup,dx:(p.x-e.x)/d,dz:(p.z-e.z)/d};
  }
  if(e.kind!=='acechador'||e.cast)emit(s,'enemyWindup',{...enemySource(e),y:foot(e)+e.height*.7,attack:e.anim==='mace'?'slam':enemyAttackName(e)});
}
function releaseAttack(s,e){
  if(e.boss){
    releaseTitanCast(s,e);e.animTime=0;
  }
  else if(e.kind==='acechador'){launch(e,e.cast.target,e.cast.duration);e.leapHit=false;e.audioLandingPending=true;}
  else if(e.kind==='tejedor')for(const offset of [-.24,0,.24]){
    projectile(s,e,'plasma-projectile',offset);const b=s.projectiles.at(-1);
    b.dx*=.75;b.dz*=.75;b.dy*=.75;b.speed=6;b.homing=false;b.damage=enemyDamage(e,7);b.tint='#c9b4ff';
  }
  else if(e.kind==='devorador')e.charge={dx:e.cast.dx,dz:e.cast.dz,remaining:.9,hit:false};
  else if(e.kind==='abominacion')for(const offset of [-.16,0,.16])projectile(s,e,'acid-projectile',offset);
  else if(e.kind==='centinela'){projectile(s,e,'plasma-projectile',-.09);projectile(s,e,'plasma-projectile',.09);}
  else if(e.kind==='macabro')projectile(s,e,'blood-projectile');
  // Released effects have their own cue, so an interrupted windup stays silent.
  if(!e.boss)emit(s,'enemyAttack',{...enemySource(e),attack:enemyAttackName(e)});
  e.cast=null;
}
function safeLeap(arena,e,target,duration){
  if(!Number.isFinite(target.y)||Math.abs(target.y-e.y)>6||arena.solid(target.x,target.z,e.radius,target.y,e.height))return false;
  const probe={x:e.x,y:e.y,z:e.z,vy:0,height:e.height};launch(probe,target,duration);
  const vy=probe.vy;
  for(let i=1;i<=32;i++){const t=duration*i/32,x=e.x+(target.x-e.x)*i/32,z=e.z+(target.z-e.z)*i/32,y=e.y+vy*t-10*t*t;
    if(arena.solid(x,z,e.radius,y,e.height))return false;
  }
  return true;
}
function shieldTargets(s,w){
  if(w.kind!=='tejedor'||w.hp<=0||w.stun>0||w.shockStunUntil>s.time||w.cast||w.flight||(s.time+w.id*.17)%7>=4)return [];
  const a=getArena(s.mapId);
  return s.enemies.filter(e=>e!==w&&e.hp>0&&e.kind!=='tejedor'&&Math.hypot(e.x-w.x,e.z-w.z,e.y-w.y)<12&&a.visible(w,e))
    .sort((a,b)=>distance(a,w)-distance(b,w)).slice(0,3);
}
export function isShielding(s,w,e){return shieldTargets(s,w).includes(e);}
function updateShields(s){s.shieldLinks=[];for(const w of s.enemies)if(w.kind==='tejedor')for(const e of shieldTargets(s,w))s.shieldLinks.push({from:w.id,to:e.id});}
function announceEnemyLanding(s,e){
  if(e.kind!=='acechador'||!e.audioLandingPending||!e.grounded||e.hp<=0)return;
  delete e.audioLandingPending;emit(s,'enemyLanding',{...enemySource(e),attack:'jump'});
}
function settleEnemy(s,e,dt){
  const arena=getArena(s.mapId);
  const perch=e.perch;
  if(perch&&!perch.falling){
    const nx=clamp(e.x,perch.x-perch.w/2,perch.x+perch.w/2),nz=clamp(e.z,perch.z-perch.d/2,perch.z+perch.d/2);
    if(Math.hypot(e.x-nx,e.z-nz)<e.radius+.04){
      // Keep the feet supported until the complete collision footprint clears
      // the ledge. Starting gravity earlier wedges the actor into the sidewall.
      e.y=perch.y;e.vy=0;e.grounded=true;announceEnemyLanding(s,e);return;
    }
    perch.falling=true;perch.descending=true;
  }
  arena.settle(e,dt);
  announceEnemyLanding(s,e);
  if(perch?.falling&&e.grounded&&e.y<perch.y-.5){e.perch=null;e.elevated=false;e._navigation=null;}
}
function updateEnemies(s,dt){
  const arena=getArena(s.mapId);
  const p=s.player;
  for(const e of s.enemies){
    e.animTime+=dt;if(e.hp<=0){if(e.kind==='madre')updateMotherDeath(s,e,dt);else e.deadTime+=dt;continue;}
    if(e.downed)continue;
    e.stun=Math.max(0,e.stun-dt);
    if(e.trainingDummy){
      settleEnemy(s,e,dt);
      if(e.anim==='hurt'&&e.animTime>.3){e.anim='move';e.animTime=0;}
      continue;
    }
    if(e.kind==='desollador'){updateDesollador(s,e,dt,damagePlayer);continue;}
    if(e.kind==='madre'){updateMadre(s,e,dt,damagePlayer);continue;}
    if(e.shockStunUntil>s.time+1e-8){settleEnemy(s,e,dt);continue;}
    if(e.boss&&updateTitanMotion(s,e,dt,damagePlayer))continue;
    if(e.y<-12){const safe=arena.SPAWNS.find(q=>!q.elevated&&!arena.solid(q.x,q.z,e.radius,q.y,e.height));if(safe){Object.assign(e,{x:safe.x,y:safe.y,z:safe.z,vy:0,flight:null,cast:null,charge:null,_navigation:null});delete e.audioLandingPending;}continue;}
    if(e.flight){
      flightStep(arena,e,dt,e.radius);
      announceEnemyLanding(s,e);
      if(!e.leapHit&&distance(e,p)<e.radius+.65&&Math.abs(e.y-p.y)<1.5&&arena.visible(e,p)){damagePlayer(s,enemyDamage(e,18));e.leapHit=true;}
      if(!e.flight){e.anim='attack';e.animTime=.55;e.stun=.45;}
      continue;
    }
    e.attack-=dt;
    if(e.cast){e.cast.remaining-=dt;if(e.cast.remaining<=0)releaseAttack(s,e);}
    if(e.bossMotion)continue;
    if(e.charge){
      const c=e.charge,before={x:e.x,z:e.z};c.remaining-=dt;
      arena.move(e,c.dx*15*dt,c.dz*15*dt,e.radius);settleEnemy(s,e,dt);
      if(!c.hit&&distance(e,p)<e.radius+.5&&Math.abs(foot(e)-(p.y||0))<2&&arena.visible(e,p)){damagePlayer(s,c.damage??enemyDamage(e,16));c.hit=true;c.remaining=0;}
      if(c.remaining<=0||distance(e,before)<dt*3){e.charge=null;e.anim='move';e.animTime=0;if(e.boss)e.exposedUntil=s.time+TITAN.exposure;}
      continue;
    }
    if(e.anim==='hurt'&&e.animTime>.3||(e.anim==='attack'||e.anim==='mace')&&!e.cast&&e.animTime>1.05){e.anim='move';e.animTime=0;}
    const d=distance(e,p),los=arena.visible(e,p);
    if(e.perch&&!e.perch.descending){
      const cannotAttack=!los||d>=e.range||(e.kind==='devorador'&&d<1.2);
      e.perch.hiddenTime=cannotAttack?e.perch.hiddenTime+dt:0;
      if(e.perch.hiddenTime>1.2)e.perch.descending=true;
    }
    const channeling=e.kind==='tejedor'&&s.shieldLinks.some(link=>link.from===e.id);
    const leapPad=e.kind==='acechador'&&e.attack<=0&&!e.cast&&e.grounded&&s.enemies.filter(o=>o!==e&&o.hp>0&&o.kind==='acechador'&&(o.flight||o.cast)).length<2?
      arena.PADS.filter(q=>Math.abs(q.y-e.y)<.5&&Math.abs(q.to.y-p.y)<1.5&&distance(q.to,p)+distance(q,e)*.4<d-6)
        .sort((a,b)=>distance(a,e)-distance(b,e))[0]:null;
    if(leapPad&&distance(e,leapPad)<.85&&safeLeap(arena,e,leapPad.to,leapPad.duration)){
      e.cast={remaining:e.windup,target:{...leapPad.to},duration:leapPad.duration};e.anim='attack';e.animTime=0;e.attack=e.interval;
      emit(s,'enemyWindup',{...enemySource(e),y:e.y+.8,attack:'jump'});
    }
    if(e.stun<=0&&!e.cast&&!channeling&&!(e.boss&&e.exposedUntil>s.time)&&e.anim==='move'&&(d>1.2||Math.abs(e.y-(p.y||0))>.6)){
      const waypoint=e.perch?(e.perch.descending?e.perch.landing:null):arena.navigate(e,leapPad||p,dt);
      if(waypoint){
        const dx=waypoint.x-e.x,dz=waypoint.z-e.z,length=Math.hypot(dx,dz);
        let speed=e.speed;if(d<9&&los&&e.kind==='macabro'&&!e.perch?.descending)speed=.65;
        if(length>.05){
          const nx=e.x+dx/length*speed*dt,nz=e.z+dz/length*speed*dt;
          const crowded=s.enemies.some(o=>o!==e&&o.hp>0&&Math.abs((o.y||0)-(e.y||0))<2&&Math.hypot(o.x-nx,o.z-nz)<(e.radius+o.radius)*.75);
          if(!crowded)arena.move(e,dx/length*speed*dt,dz/length*speed*dt,e.radius);
          else arena.move(e,-dz/length*speed*dt*e.turn,dx/length*speed*dt*e.turn,e.radius);
        }
      }
    }
    settleEnemy(s,e,dt);
    if(e.attack<=0&&!e.cast&&!channeling&&e.stun<=0&&!(e.boss&&e.exposedUntil>s.time)&&(los||e.boss)&&d<e.range&&!e.perch?.descending){
      if(d<1.8&&Math.abs(foot(e)-(p.y||0))<1.5&&e.kind!=='devorador'&&!e.boss){
        damagePlayer(s,enemyDamage(e,9));e.attack=e.interval;e.anim='attack';e.animTime=0;emit(s,'enemyAttack',{...enemySource(e),attack:'melee'});
      }else startAttack(s,e);
    }
    if(s.phase==='dead')break;
  }
  s.enemies=s.enemies.filter(e=>e.hp>0||e.deadTime<(e.kind==='madre'?MADRE.deathDuration+.1:5));
}
function explodeBow(s,b,direct){
  const arena=getArena(s.mapId);
  emit(s,'bowExplosion',{x:b.x,y:b.y,z:b.z,radius:BOW.blastRadius});
  for(const e of [...s.enemies]){
    if(e.hp<=0)continue;
    const tx=e.x-b.x,tz=e.z-b.z,ty=foot(e)+e.height*.5-b.y,horizontal=Math.hypot(tx,tz),d=Math.hypot(horizontal,ty);
    if(e!==direct&&d>BOW.blastRadius)continue;
    // Test the blast at its actual height, including bridge slabs and pillar sides.
    const length=Math.max(.001,horizontal);
    if(e!==direct&&arena.wallDistance(b.x,b.z,tx/length,tz/length,length,b.y,ty/length)<length-.02)continue;
    hitEnemy(s,e,e===direct?BOW.blastDamage:BOW.blastDamage*(1-.8*d/BOW.blastRadius),e===direct?'bow':'bowSplash',e===direct?b.y:null);
  }
}
function updateProjectiles(s,dt){
  const arena=getArena(s.mapId);
  const p=s.player;
  for(const b of s.projectiles){
    b.age+=dt;b.life-=dt;
    if(b.kind==='titan-skull')guideTitanSkull(b,p,dt);
    else if(b.homing&&b.age<2.5){
      const d=Math.max(.1,distance(b,p)),factor=1-Math.exp(-.48*dt);
      const wanted={x:(p.x-b.x)/d*b.speed,z:(p.z-b.z)/d*b.speed,y:((p.y||0)+1.1-b.y)/d*b.speed};
      b.dx+=(wanted.x-b.dx)*factor;b.dz+=(wanted.z-b.dz)*factor;b.dy+=(wanted.y-b.dy)*factor;
      const length=Math.hypot(b.dx,b.dz,b.dy)||1;b.dx*=b.speed/length;b.dz*=b.speed/length;b.dy*=b.speed/length;
    }
    b.dy-=b.gravity*dt;
    const pieces=Math.max(1,Math.ceil(Math.hypot(b.dx,b.dy,b.dz)*dt/.14));
    const offsets=b.kind==='titan-plasma'?[[0,0,0],[b.radius,0,0],[-b.radius,0,0],[0,b.radius,0],[0,-b.radius,0],[0,0,b.radius],[0,0,-b.radius]]:[[0,0,0]];
    for(let i=0;i<pieces&&b.life>0;i++){
      const interval=dt/pieces,horizontal=Math.hypot(b.dx,b.dz)||.001,travel=horizontal*interval;
      // A cannon ball has real volume: sweep its centre and outer extents into
      // walls and bridge slabs, rather than letting the large sprite clip them.
      if(offsets.some(([ox,oy,oz])=>arena.wallDistance(b.x+ox,b.z+oz,b.dx/horizontal,b.dz/horizontal,travel+.02,b.y+oy,b.dy/horizontal)<=travel)){b.life=0;break;}
      b.x+=b.dx*interval;b.y+=b.dy*interval;b.z+=b.dz*interval;
      if(distance(b,p)<.32+b.radius&&b.y>(p.y||0)+.12&&b.y<(p.y||0)+1.8){damagePlayer(s,b.damage);b.life=0;}
    }
    if(b.life<=0)emit(s,'impact',{x:b.x,y:b.y,z:b.z,kind:b.kind});
    if(s.phase==='dead')break;
  }
  s.projectiles=s.projectiles.filter(b=>b.life>0);
}
function updateHazards(s,dt,previousPlayer=s.player){
  const arena=getArena(s.mapId);
  const p=s.player;
  for(const h of s.hazards){
    const previousAge=h.age;h.age+=dt;const active=h.age-h.warning;if(active<0)continue;
    // Sector attacks announce the actual eruption, not the warning. The three
    // spikes share one cue, including when one of the candidate tiles was blocked.
    if(h.attack&&!h.attackEmitted){
      h.attackEmitted=true;
      if(h.attackGroup)for(const sibling of s.hazards)if(sibling.attackGroup===h.attackGroup)sibling.attackEmitted=true;
      const owner=s.enemies.find(e=>e.id===h.owner);
      if(owner?.hp>0&&!owner.downed)emit(s,'enemyAttack',{...enemySource(owner),attack:h.attack,x:h.x,y:h.y,z:h.z,...(h.kind==='obsidian-spikes'?{fixedPosition:true,hazardId:h.id}:{})});
    }
    if(h.kind==='ground-shockwave'){
      h.radius=.3+active*GROUND_FIRE.speed;
      if(h.flameWave&&!h.flameEmitted){
        h.flameEmitted=true;emit(s,'groundFireWave',{id:h.id,owner:h.owner,x:h.x,y:h.y,z:h.z,radius:h.radius,duration:h.duration});
      }
    }
    const d=distance(h,p);
    if(h.flameWave){
      // Sweep the moving front against the player's movement in this step. This
      // catches contact between frames at 20, 60 and 120 Hz without a wide aura.
      const start=dt?clamp((h.warning-previousAge)/dt,0,1):0,end=dt?clamp((h.warning+h.duration-previousAge)/dt,0,1):1;
      if(previousAge>h.warning+h.duration||end<start)continue;
      const from={x:previousPlayer.x+(p.x-previousPlayer.x)*start,z:previousPlayer.z+(p.z-previousPlayer.z)*start};
      const to={x:previousPlayer.x+(p.x-previousPlayer.x)*end,z:previousPlayer.z+(p.z-previousPlayer.z)*end};
      const previousRadius=.3+Math.max(0,previousAge+start*dt-h.warning)*GROUND_FIRE.speed;
      const currentRadius=.3+Math.min(h.duration,Math.max(0,previousAge+end*dt-h.warning))*GROUND_FIRE.speed;
      const before=distance(h,from)-previousRadius,after=distance(h,to)-currentRadius;
      const inShape=Math.min(before,after)<=GROUND_FIRE.halfWidth&&Math.max(before,after)>=-GROUND_FIRE.halfWidth;
      if(!inShape||s.time-(h.lastDamageAt??-Infinity)<GROUND_FIRE.contactCooldown-1e-8)continue;
      const t=start+(end-start)*(before===after?1:clamp(before/(before-after),0,1));
      const y=(previousPlayer.y||0)+((p.y||0)-(previousPlayer.y||0))*t;
      if(y>=h.y+GROUND_FIRE.height||y+(p.height||1.75)<=h.y)continue;
      const x=previousPlayer.x+(p.x-previousPlayer.x)*t,z=previousPlayer.z+(p.z-previousPlayer.z)*t,length=Math.hypot(x-h.x,z-h.z);
      if(arena.wallDistance(h.x,h.z,(x-h.x)/Math.max(.001,length),(z-h.z)/Math.max(.001,length),length+.01,h.y+GROUND_FIRE.height*.5,0)<length-.05)continue;
      damagePlayer(s,h.damage??20);h.lastDamageAt=s.time;h.hit=true;continue;
    }
    const inShape=h.kind==='obsidian-spikes'||h.kind==='madre-hands'?d<h.radius:Math.abs(d-h.radius)<.6+9*dt;
    if(!h.hit&&inShape&&Math.abs((p.y||0)-h.y)<.65&&
      arena.wallDistance(h.x,h.z,(p.x-h.x)/Math.max(.001,d),(p.z-h.z)/Math.max(.001,d),d+.01,h.y+.25,0)>=d-.05){
      damagePlayer(s,h.damage??(h.kind==='obsidian-spikes'?16:20));h.hit=true;
    }
  }
  s.hazards=s.hazards.filter(h=>h.age<h.warning+h.duration);
}
export function step(s,input,dt){
  const arena=getArena(s.mapId);
  if(s.phase!=='playing')return;
  dt=clamp(dt,0,.05);s.time+=dt;
  if(updateBossFinisher(s,dt,(state,e)=>{
    e.downed=false;e.finished=true;hitEnemy(state,e,e.hp+1,'finisher');finishWave(state);state.nextWave=4;
    if(state.mode==='boss-demo')state.phase='boss-demo-complete';
  }))return;
  s.cooldown=Math.max(0,s.cooldown-dt);s.damageFlash=Math.max(0,s.damageFlash-dt);s.portalFlash=Math.max(0,s.portalFlash-dt);
  s.shieldFlash=Math.max(0,s.shieldFlash-dt);
  s.shotgunRecoilRemaining=Math.max(0,s.shotgunRecoilRemaining-dt);
  s.shotgunCycleRemaining=Math.max(0,s.shotgunCycleRemaining-dt);
  s.bowRecoveryRemaining=Math.max(0,s.bowRecoveryRemaining-dt);s.bowSecondaryCooldown=Math.max(0,s.bowSecondaryCooldown-dt);
  s.rifleSecondaryCooldown=Math.max(0,s.rifleSecondaryCooldown-dt);
  s.smgDualCooldown=Math.max(0,s.smgDualCooldown-dt);
  if(s.smgDualRemaining>0){const remaining=s.smgDualRemaining;s.smgDualRemaining=Math.max(0,remaining-dt);if(s.smgDualRemaining<1e-8){s.smgDualRemaining=0;s.smgDualCooldown=SMG_DUAL.cooldown-Math.max(0,dt-remaining);}}
  if(motherCaptureLocked(s)){updateMotherCapture(s,dt,damagePlayer);for(const e of s.enemies)if(e.kind==='madre')updateMotherGuardians(s,e,0);return;}
  const p=s.player,previousPlayer={x:p.x,y:p.y,z:p.z};
  if(!updateWindCapture(s,dt)&&updateTraversal(s,input,dt)){damagePlayer(s,15);if(s.phase==='dead')return;}
  updateMotherDrag(s,dt);
  updateMotherOmen(s,dt);
  if(!s.portalUsed&&p.z<arena.PORTAL_Z&&Math.abs(p.x)<4){s.portalUsed=true;s.health=100;s.portalFlash=1.2;s.nextWave=2;s.riverStartedAt=s.time;emit(s,'portal');}
  if(s.portalUsed&&s.mapId==='rio'){
    const tide=riverTide(s.time-s.riverStartedAt,s);
    if(tide.phase!==s.tidePhase){s.tidePhase=tide.phase;if(tide.phase==='warning')emit(s,'floodWarning');}
    s.riverImmersed=!s.enemies.some(e=>e.kind==='madre'&&e.hp<=0&&e.deadTime<MADRE.deathDuration)&&tide.danger&&p.y+.12<tide.level;
    if(updateMotherCapture(s,dt,damagePlayer)){for(const e of s.enemies)if(e.kind==='madre')updateMotherGuardians(s,e,0);return;}
    if(s.riverImmersed){damagePlayer(s,8*dt,{bypassShield:true});if(s.phase==='dead')return;}
  }
  for(const e of s.enemies)if(e.kind==='madre')updateMotherGuardians(s,e,dt);
  updateShields(s);
  updateFlames(s,dt);if(s.phase==='dead')return;
  updateMacuahuitl(s,dt);if(s.phase==='dead')return;
  const secondary=!!input.secondary,trigger=secondary?'secondary':'primary',pressed=!!input[trigger]&&!s.triggerHeld[trigger];
  s.triggerHeld.primary=!!input.primary;s.triggerHeld.secondary=secondary;
  if(s.selected===2){setRifleScope(s,secondary);if(input.primary)fire(s,false);}
  else if(WEAPONS[s.selected].kind==='smg'){if(secondary&&pressed)activateDual(s);if(s.smgDualRemaining>0||input.primary)fire(s,false);}
  else if((input.primary||input.secondary)&&(WEAPONS[s.selected].kind!=='bow'||pressed))fire(s,secondary);
  if(s.phase==='dead')return;
  if(!s.portalUsed)return;
  if(!s.training){
    releaseSpawns(s,dt);
    if(s.pending>0){s.nextSpawn-=dt;if(s.nextSpawn<=0&&s.enemies.filter(e=>e.hp>0).length+s.spawnWarnings.length<14)scheduleSpawn(s);}
    else if(!s.spawnWarnings.length&&!s.enemies.some(e=>e.hp>0)){
      if(s.enemies.some(e=>e.kind==='madre'&&e.deadTime<MADRE.deathDuration)){updateEnemies(s,dt);return;}
      if(s.mode==='boss-demo'&&s.wave===10&&!s.bossDemoWon){
        // Let the authored death animation and sound finish before opening the menu.
        if(s.enemies.some(e=>e.boss&&e.deadTime<3.2)){updateEnemies(s,dt);return;}
        finishWave(s);s.bossDemoWon=true;s.phase='boss-demo-complete';emit(s,'bossDemoComplete');return;
      }
      finishWave(s);if(s.nextWave<=0)s.nextWave=4;s.nextWave-=dt;if(s.nextWave<=0)beginWave(s);}
  }
  for(const pickup of s.supplies){
    pickup.cooldown=Math.max(0,pickup.cooldown-dt);
    if(pickup.cooldown>0||distance(p,pickup)>1||Math.abs((p.y||0)-pickup.y)>.65)continue;
    if(pickup.kind==='health'){if(s.health>=100)continue;const amount=Math.min(25,100-s.health);s.health+=amount;emit(s,'pickup',{kind:'health',amount});}
    else{const amount=ammoAmount(s,pickup.ammoType);s.ammo[pickup.ammoType]+=amount;emit(s,'pickup',{kind:'ammo',ammoType:pickup.ammoType,amount});}
    pickup.cooldown=18;if(pickup.kind!=='health')pickup.ammoType=randomAmmoType(s);
  }
  updateDrops(s,dt);
  updateEnemies(s,dt);if(s.phase==='dead')return;
  updateProjectiles(s,dt);if(s.phase==='dead')return;updateHazards(s,dt,previousPlayer);
  regeneratePlayerShield(s,dt);
}

