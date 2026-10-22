import {getArena} from './umbral-arena.mjs';
import {riverTide,RIVER_DECK_HEIGHT} from './umbral-maps.mjs';
import {aimDirection} from './umbral-aim.mjs';

// Open channels, including five positions facing the southern starting bank.
// No waypoint uses a bridge, island or ramp. The giant rises vertically in place.
export const MOTHER_WATER_POINTS=Object.freeze([
  [-21,18],[-6,18],[0,18],[6,18],[21,18],
  [-21,15],[-6,15],[0,15],[6,15],[21,15],
  [-6,10],[0,10],[6,10],[-21,-8],[21,-8],
  [-21,-15],[-6,-15],[6,-15],[21,-15],
  [-21,-19],[-6,-19],[6,-19],[21,-19],
].map(([x,z])=>Object.freeze({x,y:RIVER_DECK_HEIGHT,z})));

function waterSpace(arena,q,level=RIVER_DECK_HEIGHT,radius=1.8){
  if(!arena.inBounds(q.x,q.z,radius)||arena.groundHeight(q.x,q.z)>=level-.01)return false;
  // Check the rim beneath the surface, as well as the flying body's clearance.
  return !arena.solid(q.x,q.z,radius,level-1,2)&&!arena.solid(q.x,q.z,radius,level+.6,9);
}

function headVisible(s,q,level=q.y){
  const p=s.player,a=getArena('rio'),dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);
  const eye=(p.y||0)+1.6,target=level+.8;
  if(d<.001)return a.wallDistance(p.x,p.z,0,0,Math.abs(target-eye),eye,Math.sign(target-eye))>=Math.abs(target-eye)-.04;
  return a.wallDistance(p.x,p.z,dx/d,dz/d,d,eye,(target-eye)/d)>=d-.04;
}

/** Bounded, deterministic water placement, without consuming combat RNG. */
export function motherWaterPoint(s,e=null,preferNearPlayer=false){
  const a=getArena('rio'),p=s.player||a.START;
  const offset=Math.abs(((e?.id||0)+(e?.attacks||0)*7+(s.wave||0)*3)|0)%MOTHER_WATER_POINTS.length;
  let best=null,bestScore=Infinity;
  for(let i=0;i<MOTHER_WATER_POINTS.length;i++){
    const q=MOTHER_WATER_POINTS[(i+offset)%MOTHER_WATER_POINTS.length];
    if(!waterSpace(a,q))continue;
    const distance=Math.hypot(q.x-p.x,q.z-p.z),visible=headVisible({...s,player:p},q);
    // Repositioning favors another clear channel while keeping the head shootable.
    const same=e&&Math.hypot(q.x-e.x,q.z-e.z)<4;
    const score=(visible?0:1000)+(preferNearPlayer?distance:Math.abs(distance-16))+(same&&!preferNearPlayer?18:0)+i*.001;
    if(score<bestScore){best=q;bestScore=score;}
  }
  if(!best)throw new Error('Mother has no clear water placement in the river arena');
  return {...best,y:RIVER_DECK_HEIGHT+.02};
}

const enabled=s=>s.mapId==='rio'&&s.phase==='playing'&&s.portalUsed&&!s.training&&s.mode!=='boss-demo'&&s.wave>=1&&s.wave<10&&
  !s.bossPending&&!s.spawnWarnings?.some(e=>e.kind==='madre')&&!s.enemies?.some(e=>e.kind==='madre'&&e.hp>0);
function omenRandom(s){
  if(!Number.isInteger(s.motherOmenSeed))s.motherOmenSeed=((s.seed??1)^0x4d4f5448)>>>0;
  s.motherOmenSeed=(Math.imul(s.motherOmenSeed,1664525)+1013904223)>>>0;
  return s.motherOmenSeed/4294967296;
}
const nextOmen=s=>18+omenRandom(s)*12;
function lookingAt(s,q){
  const p=s.player,dx=q.x-p.x,dy=q.y+.8-((p.y||0)+1.6),dz=q.z-p.z,d=Math.hypot(dx,dy,dz);
  if(d<.001)return true;
  const aim=aimDirection(p.yaw||0,p.pitch||0);
  return (aim.x*dx+aim.y*dy+aim.z*dz)/d>.985&&headVisible(s,q);
}

/** Call before weapon input: a directly observed omen is never a damage target. */
export function hideMotherOmenOnAim(s){
  if(s.phase==='paused')return false;
  const o=s.motherOmen;
  if(!enabled(s)){s.motherOmen=null;return false;}
  if(!o||o.phase==='hiding'||!lookingAt(s,o))return false;
  o.phase='hiding';o.hidingAge=0;return true;
}

/** Cosmetic foreshadowing only: no enemy, ID, health, drops, score or combat RNG. */
export function updateMotherOmen(s,dt){
  if(s.phase==='paused')return;
  if(!enabled(s)){s.motherOmen=null;return;}
  const elapsed=Math.max(0,Number.isFinite(dt)?dt:0);
  const level=riverTide(s.time-(s.riverStartedAt||0),s).level;
  let o=s.motherOmen;
  if(o){
    o.y=level+.02;o.age+=elapsed;
    hideMotherOmenOnAim(s);
    if(o.phase!=='hiding'&&o.age>=o.life){o.phase='hiding';o.hidingAge=0;}
    if(o.phase==='hiding'){
      o.hidingAge+=elapsed;
      if(o.hidingAge>=.15-1e-8){s.motherOmen=null;s.motherOmenDelay=nextOmen(s);}
    }
    return;
  }
  if(!Number.isFinite(s.motherOmenDelay))s.motherOmenDelay=nextOmen(s);
  s.motherOmenDelay-=elapsed;if(s.motherOmenDelay>0)return;
  const a=getArena('rio'),offset=Math.floor(omenRandom(s)*MOTHER_WATER_POINTS.length);
  for(let i=0;i<MOTHER_WATER_POINTS.length;i++){
    const q=MOTHER_WATER_POINTS[(i+offset)%MOTHER_WATER_POINTS.length],candidate={...q,y:level+.02};
    const d=Math.hypot(q.x-s.player.x,q.z-s.player.z);
    if(d<5||d>42||a.groundHeight(q.x,q.z)>=level-.01||!headVisible(s,candidate)||lookingAt(s,candidate))continue;
    s.motherOmen={...candidate,age:0,phase:'watching',hidingAge:0,life:4.5};return;
  }
  // A hidden or unsuitable view retries later, with a bounded search each time.
  s.motherOmenDelay=3;
}
