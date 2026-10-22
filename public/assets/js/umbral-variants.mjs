// Variants reuse the normal animation bank and collision body. Their palette,
// durability and attacks are the only changes, keeping horde rendering cheap.
export const VARIANT_RULES=Object.freeze({firstWave:3,chance:.25,healthMultiplier:2,damageMultiplier:1.3,chargedMacuahuitlDamage:75});
export const ENEMY_VARIANTS=Object.freeze({
  macabro:Object.freeze({label:'Macabro venenoso',color:'#9fcf5a'}),
  devorador:Object.freeze({label:'Devorador espectral',color:'#bb79e8'}),
  empalador:Object.freeze({label:'Empalador de jade',color:'#43d6c4'}),
  abominacion:Object.freeze({label:'Abominación púrpura',color:'#dd8cce'}),
  centinela:Object.freeze({label:'Centinela áureo',color:'#e0a443'}),
  acechador:Object.freeze({label:'Acechador cobalto',color:'#7899e8'}),
  tejedor:Object.freeze({label:'Tejedor carmesí',color:'#e27c58'}),
});
export const variantsEnabled=s=>s.wave>=VARIANT_RULES.firstWave&&!s.training&&!['tutorial','boss-demo'].includes(s.mode)&&!['tutorial','titan-demo'].includes(s.mapId);
export function applyEnemyVariant(e){
  if(!e.variant||e.boss||e.trainingDummy||!ENEMY_VARIANTS[e.kind]){e.variant=false;return e;}
  e.maxHp*=VARIANT_RULES.healthMultiplier;e.hp=e.maxHp;
  e.macuahuitlImmune=true;e.damageMultiplier=VARIANT_RULES.damageMultiplier;
  return e;
}
// Snapshot this value into released projectiles and hazards, so they retain
// their strength after the shooter dies or leaves the enemy list.
export const enemyDamage=(e,base)=>base*(e?.variant?VARIANT_RULES.damageMultiplier:1);
