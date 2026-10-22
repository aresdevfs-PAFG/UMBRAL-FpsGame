import {createState,createEnemy,INITIAL_AMMO,WEAPONS} from './umbral-core.mjs';
import {getArena} from './umbral-arena.mjs';

export function onboardingChoice(screen,yes){
  if(screen==='experience')return yes?'offer':'tutorial';
  if(screen==='offer')return yes?'tutorial':'game';
  return 'game';
}

// First-visit preferences belong to this browser. No login or server is required.
export function createTutorialPreferences({storage=null}={}){
  const key='umbral:offline:tutorial:v1';
  let local={seen:false,completed:false};
  try{const saved=JSON.parse(storage?.getItem(key)||'null');if(saved&&typeof saved==='object')local={seen:saved.seen===true,completed:saved.completed===true};}catch{}
  function save(value){local={...local,...value};try{storage?.setItem(key,JSON.stringify(local));}catch{}}
  return {
    async load(){return {...local};},
    async decide(){save({seen:true});},
    async complete(){save({seen:true,completed:true});},
  };
}

export function createTutorialState(){
  const s=createState('tutorial');s.mode='tutorial';s.portalUsed=true;s.health=70;s.selected=0;
  s.training={stage:0,distance:0,look:0,jumped:false,weapons:[],scoped:false,secondary:false,burnLoot:false,blood:false,
    last:{x:s.player.x,z:s.player.z,yaw:s.player.yaw,pitch:s.player.pitch},targets:[],completed:false,offered:false};
  s.training.targets=getArena('tutorial').SPAWNS.map(point=>({point,next:0,id:null}));
  updateTutorial(s,[]);
  return s;
}

export function updateTutorial(s,events){
  const t=s.training;if(!t)return false;
  const p=s.player;
  t.distance+=Math.hypot(p.x-t.last.x,p.z-t.last.z);
  t.look+=Math.abs(p.yaw-t.last.yaw)+Math.abs(p.pitch-t.last.pitch);
  Object.assign(t.last,{x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch});
  for(const e of events){
    if(e.type==='jump')t.jumped=true;
    if(e.type==='hit'&&['weapon','bow','knife'].includes(e.source)&&Number.isInteger(e.weaponIndex)&&!t.weapons.includes(e.weaponIndex))t.weapons.push(e.weaponIndex);
    if(e.type==='shot'&&e.scoped)t.scoped=true;
    if((e.type==='shot'&&e.secondary&&!e.scoped)||e.type==='dual')t.secondary=true;
    if(e.type==='pickup'&&e.kind==='ammo'&&e.source==='burn')t.burnLoot=true;
    if(e.type==='pickup'&&e.kind==='health'&&e.source==='sacrifice')t.blood=true;
  }
  const done=[t.distance>=4&&t.look>=.15&&t.jumped,t.weapons.length===6,t.scoped&&t.secondary,t.burnLoot,t.blood];
  const previous=t.stage;
  while(t.stage<5&&done[t.stage])t.stage++;
  // Make the healing exercise possible even if the player healed while experimenting.
  if(previous<4&&t.stage===4&&!t.blood)s.health=Math.min(s.health,70);
  t.completed=t.stage===5;
  for(const target of t.targets){
    const enemy=s.enemies.find(e=>e.id===target.id);
    if(enemy?.hp>0)continue;
    if(target.id!==null){target.id=null;target.next=s.time+2.5;}
    if(s.time<target.next)continue;
    const e=createEnemy(s,'macabro',target.point);e.trainingDummy=true;target.id=e.id;
  }
  // Supplies are unlimited here, but shot costs, recovery and power cooldowns stay real.
  for(const [kind,amount] of Object.entries(INITIAL_AMMO))if(s.ammo[kind]<4)s.ammo[kind]=amount;
  return t.completed&&!t.offered;
}

const weaponTips=[
  '1 · Cuchillo: acércate al blanco y pulsa clic izquierdo.',
  '2 · Escopeta: clic izquierdo. Clic derecho dispara los dos cañones.',
  '3 · Rifle: clic izquierdo. Mantén clic derecho y pulsa izquierdo para el sniper.',
  '4 · Subfusil: mantén clic izquierdo. Clic derecho: doble fuego durante 4 s.',
  '5 · Arco: clic izquierdo, fuego. Clic derecho, explosión.',
  '6 · Cañón Solar: clic izquierdo. Clic derecho: disparo potente.',
];
export function tutorialGuide(s){
  const t=s.training;if(!t)return null;
  const next=WEAPONS.findIndex((_,i)=>!t.weapons.includes(i));
  const steps=[
    ['Muévete y mira alrededor','WASD para caminar · Mouse para mirar · Espacio para saltar.',`${t.distance>=4?'✓':'○'} Camina  ${t.look>=.15?'✓':'○'} Mira  ${t.jumped?'✓':'○'} Salta`],
    ['Prueba las seis armas','Acierta a un blanco con cada arma. Se cambian con 1–6. '+weaponTips[Math.max(0,next)],WEAPONS.map((_,i)=>`${t.weapons.includes(i)?'✓':'○'} ${i+1}`).join('   ')],
    ['Prueba los ataques secundarios','3: mantén clic derecho y dispara con el izquierdo. Luego prueba clic derecho con 2, 4, 5 o 6.',`${t.scoped?'✓':'○'} Sniper  ${t.secondary?'✓':'○'} Otro secundario`],
    ['Quema para conseguir munición','Acércate y pulsa R. Mata al blanco quemado con cualquier arma y pasa sobre su munición. R recarga en 8 s.','R → mata → recoge'],
    ['Golpea para recuperar vida','Acércate y pulsa F cargado; recoge la sangre para curarte. Fallar no gasta el poder. Durante sus 8 s de recarga, pulsa F seguido: izquierda (90), derecha (120), descendente (180).','F cargado → recoge sangre'],
    ['Práctica libre','Ya conoces lo esencial. Prueba más armas o pulsa ESC para comenzar una partida.','✓ Tutorial completo'],
  ];
  const [title,copy,checks]=steps[t.stage];
  return {title,copy,checks,step:Math.min(t.stage+1,5)};
}
