export const MOTHER_GUARDIANS=Object.freeze({
  count:8,radius:.32,arrivalDuration:.09,breakDuration:.2,duration:.29,impactLead:.55,
});

const active=(s,e)=>s.phase==='playing'&&e.kind==='madre'&&e.hp>0&&e.waterState==='submerged'&&!s.motherCapture;

/** Reserve is invisible until a shot triggers it. Effects are transient, not targets. */
export function updateMotherGuardians(s,e,dt){
  if(s.phase==='paused')return;
  if(!active(s,e)){
    if(e.motherGuardians)e.motherGuardians.length=0;
    e._motherGuardiansActive=false;e.motherGuardianReserve=0;e._motherGuardianShots=null;return;
  }
  if(!e._motherGuardiansActive){
    e.motherGuardianCycle=(e.motherGuardianCycle||0)+1;
    e.motherGuardianReserve=MOTHER_GUARDIANS.count;e.motherGuardians=[];
    e._motherGuardianShots=new Map();e._motherGuardiansActive=true;
  }
  const elapsed=Math.max(0,Number.isFinite(dt)?dt:0),effects=e.motherGuardians;
  // Compact the bounded pool in place rather than allocating an array every tick.
  let count=0;
  for(const g of effects){
    g.age+=elapsed;
    if(g.age>=MOTHER_GUARDIANS.duration-1e-8)continue;
    g.phase=g.age<MOTHER_GUARDIANS.arrivalDuration?'intercept':'shatter';
    effects[count++]=g;
  }
  effects.length=count;
}

/**
 * Resolve one already-validated shot at the submerged head. The caller must
 * establish wall/enemy ordering first. This action consumes a reserve; it is
 * deliberately separate from collision queries. All pellets share one shotId.
 */
export function interceptMotherShot(s,e,origin,direction,targetDistance,shotId){
  if(!active(s,e)||shotId===undefined||shotId===null||!Number.isFinite(targetDistance)||targetDistance<=0)return null;
  const magnitude=Math.hypot(direction.x,direction.y,direction.z);
  if(!Number.isFinite(magnitude)||magnitude<1e-10||![origin.x,origin.y,origin.z].every(Number.isFinite))return null;
  if(!e._motherGuardiansActive)updateMotherGuardians(s,e,0);
  const t=Math.max(0,targetDistance-MOTHER_GUARDIANS.impactLead);
  const previous=e._motherGuardianShots.get(shotId);
  // Recompute distance for each pellet without moving the first impact's visual.
  if(previous)return {e,guardian:previous,t};
  if(e.motherGuardianReserve<=0)return null;

  const index=MOTHER_GUARDIANS.count-e.motherGuardianReserve;
  const dx=direction.x/magnitude,dy=direction.y/magnitude,dz=direction.z/magnitude;
  const target={x:origin.x+dx*t,y:origin.y+dy*t,z:origin.z+dz*t};
  const horizontal=Math.hypot(dx,dz),side=index%2?-1:1;
  const rx=horizontal>.001?dz/horizontal:1,rz=horizontal>.001?-dx/horizontal:0;
  // The skull comes up from the clear water immediately beside the Mother's head.
  const from={x:e.x+rx*side*1.3,y:e.waterLevel+.08,z:e.z+rz*side*1.3};
  const guardian={id:'mother-guardian-'+e.id+'-'+e.motherGuardianCycle+'-'+index,index,
    ...target,from,target,fromX:from.x,fromY:from.y,fromZ:from.z,
    radius:MOTHER_GUARDIANS.radius,hp:0,age:0,phase:'intercept'};
  e.motherGuardianReserve--;e.motherGuardians.push(guardian);e._motherGuardianShots.set(shotId,guardian);
  s.events.push({type:'motherGuardianIntercept',id:guardian.id,owner:e.id,kind:'madre-guardian',index,
    x:guardian.x,y:guardian.y,z:guardian.z,fromX:from.x,fromY:from.y,fromZ:from.z,guardian});
  return {e,guardian,t};
}
