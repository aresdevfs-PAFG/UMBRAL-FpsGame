/** Cuenca de Obsidiana: shared walkable geometry, collision, rays and navigation.
 * Coordinates are metres; y is the actor's feet. A surface is a rectangle in X/Z.
 * A ramp's `from` and `to` are its top heights at the MIN/MAX coordinate of axis.
 * `base` is the bottom of the solid ramp/platform; bridges have a real empty
 * space below their slab. Renderers should use these same extents and heights.
 */
import {TITAN_DEMO_ARENA} from './umbral-boss-arena.mjs';
export const BOUNDS = Object.freeze({minX:-35,maxX:35,minZ:-30,maxZ:30,entrance:{minX:-4,maxX:4,minZ:30,maxZ:39}});
export const START = Object.freeze({x:0,z:35,y:0});
export const PORTAL_Z = 29;
export const STEP_HEIGHT = .4;
/** Four independent blood pillars. Their flat crowns are one-way elevated spawn platforms. */
export const ELEVATED_PILLARS = [
  {id:'south-west-pillar',x:-7,z:7,w:3.8,d:3.8,y:0,h:6.4,landing:{x:-3.8,z:7,y:0}},
  {id:'south-east-pillar',x:7,z:7,w:3.8,d:3.8,y:0,h:6.4,landing:{x:3.8,z:7,y:0}},
  {id:'north-west-pillar',x:-6,z:-16,w:3.8,d:3.8,y:0,h:6.4,landing:{x:-2.8,z:-16,y:0}},
  {id:'north-east-pillar',x:6,z:-16,w:3.8,d:3.8,y:0,h:6.4,landing:{x:2.8,z:-16,y:0}},
];
export const SURFACES = [
  {id:'plaza',kind:'floor',x:0,z:0,w:70,d:60,y:0,base:-.5,thickness:.5},
  {id:'entrance',kind:'floor',x:0,z:34.5,w:8,d:9,y:0,base:-.5,thickness:.5},
  {id:'west-terrace',kind:'platform',x:-29,z:0,w:12,d:60,y:3,base:0,thickness:3},
  {id:'east-terrace',kind:'platform',x:29,z:0,w:12,d:60,y:3,base:0,thickness:3},
  {id:'north-terrace',kind:'platform',x:0,z:-26,w:46,d:8,y:3,base:0,thickness:3},
  {id:'west-south-ramp',kind:'ramp',x:-16,z:15,w:14,d:6,y:0,base:0,ramp:{axis:'x',from:3,to:0}},
  {id:'west-north-ramp',kind:'ramp',x:-16,z:-13,w:14,d:6,y:0,base:0,ramp:{axis:'x',from:3,to:0}},
  {id:'east-south-ramp',kind:'ramp',x:16,z:15,w:14,d:6,y:0,base:0,ramp:{axis:'x',from:0,to:3}},
  {id:'east-north-ramp',kind:'ramp',x:16,z:-13,w:14,d:6,y:0,base:0,ramp:{axis:'x',from:0,to:3}},
  {id:'upper-bridge',kind:'bridge',x:0,z:-7.5,w:62,d:5,y:6,base:5.3,thickness:.7},
  {id:'west-jump-slab',kind:'platform',x:-11,z:24,w:3,d:2,y:.75,base:0,thickness:.75},
  {id:'east-jump-slab',kind:'platform',x:11,z:24,w:3,d:2,y:.75,base:0,thickness:.75},
  {id:'west-upper-ramp',kind:'ramp',x:-28,z:-17,w:6,d:14,y:3,base:3,ramp:{axis:'z',from:3,to:6}},
  {id:'east-upper-ramp',kind:'ramp',x:28,z:-17,w:6,d:14,y:3,base:3,ramp:{axis:'z',from:3,to:6}},
  ...ELEVATED_PILLARS.map(p=>({id:p.id+'-crown',pillarId:p.id,kind:'platform',x:p.x,z:p.z,w:p.w,d:p.d,y:p.h,base:0,thickness:p.h,elevated:true})),
];
export const WALLS = [
  {id:'west-boundary',kind:'boundary',x:-35.5,z:0,w:1,d:61,y:0,h:6.5},
  {id:'east-boundary',kind:'boundary',x:35.5,z:0,w:1,d:61,y:0,h:6.5},
  {id:'north-boundary',kind:'boundary',x:0,z:-30.5,w:72,d:1,y:0,h:12},
  {id:'south-west-boundary',kind:'boundary',x:-19.5,z:30.5,w:31,d:1,y:0,h:5.5},
  {id:'south-east-boundary',kind:'boundary',x:19.5,z:30.5,w:31,d:1,y:0,h:5.5},
  {id:'entrance-west',kind:'boundary',x:-4.5,z:34.5,w:1,d:9,y:0,h:5},
  {id:'entrance-east',kind:'boundary',x:4.5,z:34.5,w:1,d:9,y:0,h:5},
  {id:'entrance-back',kind:'boundary',x:0,z:39.5,w:10,d:1,y:0,h:5},
  ...ELEVATED_PILLARS.map(p=>({...p,kind:'pillar',elevated:true})),
  {id:'west-bridge-pier',kind:'pillar',x:-17,z:-7.5,w:2,d:2,y:0,h:5.3},
  {id:'east-bridge-pier',kind:'pillar',x:17,z:-7.5,w:2,d:2,y:0,h:5.3},
];
export const SPAWNS = [
  {x:-17,z:24,y:0},{x:17,z:24,y:0},{x:-18,z:1,y:0},{x:18,z:1,y:0},
  {x:0,z:-19,y:0},{x:-31,z:21,y:3},{x:31,z:21,y:3},
  {x:-19,z:-27,y:3},{x:19,z:-27,y:3},{x:-30,z:-27,y:3},{x:30,z:-27,y:3},
  {x:-10,z:-7.5,y:6},{x:10,z:-7.5,y:6},
  ...ELEVATED_PILLARS.map(p=>({x:p.x,z:p.z,y:p.h,elevated:true,pillarId:p.id,landing:{...p.landing},exit:{x:p.landing.x,z:p.landing.z,y:p.h}})),
];
export const SUPPLIES = [
  {x:-17,z:23,y:0,kind:'health'},{x:17,z:23,y:0,kind:'ammo'},
  {x:0,z:3,y:0,kind:'ammo'},{x:0,z:-18,y:0,kind:'health'},
  {x:-31,z:3,y:3,kind:'ammo'},{x:31,z:3,y:3,kind:'health'},
  {x:0,z:-26,y:3,kind:'ammo'},{x:0,z:-7.5,y:6,kind:'health'},
];

const pad=(id,x,z,y,tx,tz,ty,duration)=>({id,x,z,y,radius:1.15,to:{x:tx,z:tz,y:ty},duration});
const cuencaPads=[
  pad('poniente',-18,21,0,-29,12,3,1.2),pad('oriente',18,21,0,29,12,3,1.2),
  pad('puente-oeste',-29,-2,3,-20,-7.5,6,1.05),pad('puente-este',29,-2,3,20,-7.5,6,1.05),
];
const floor=(id,x,z,w,d,y=0,base=y-.7)=>({id,kind:y?'platform':'floor',x,z,w,d,y,base,thickness:y-base});
const ramp=(id,x,z,w,d,axis,from,to,base=0)=>({id,kind:'ramp',x,z,w,d,y:Math.min(from,to),base,ramp:{axis,from,to}});
const coronaSurfaces=[
  floor('entrada',0,34.5,8,9),floor('anillo-sur',0,24,70,12),
  floor('anillo-oeste',-28.5,0,13,48),floor('anillo-este',28.5,0,13,48),floor('anillo-norte',0,-25,70,10),
  floor('terraza-oeste',-24,0,20,16,3,2.3),floor('terraza-este',24,0,20,16,3,2.3),
  ramp('acceso-oeste',-26,13,8,10,'z',3,0),ramp('acceso-este',26,13,8,10,'z',3,0),
  floor('enlace-oeste',-26,-13,8,10,3,2.3),floor('enlace-este',26,-13,8,10,3,2.3),
  floor('ala-oeste',-23.5,-24,23,12,3,0),floor('ala-este',23.5,-24,23,12,3,0),
  floor('santuario',0,-24,24,12,6,0),
  ramp('santuario-oeste',-18,-24,12,8,'x',3,6,3),ramp('santuario-este',18,-24,12,8,'x',6,3,3),
];
const coronaWalls=[
  ...WALLS.filter(w=>w.kind==='boundary').map(w=>({...w,h:w.id==='north-boundary'?13:w.id.startsWith('entrance')?5:1.1})),
  {id:'altar-oeste',kind:'cover',x:-31,z:4,w:2,d:2,y:3,h:2.3},
  {id:'altar-este',kind:'cover',x:31,z:-4,w:2,d:2,y:3,h:2.3},
  {id:'corona-oeste',kind:'cover',x:-9,z:-27,w:2,d:2,y:6,h:3},
  {id:'corona-este',kind:'cover',x:9,z:-27,w:2,d:2,y:6,h:3},
];
// A dry circuit links three sanctuaries; broad ramps let players leave the floodplain.
// The underside clears the sloping low banks plus a full player jump.
export const RIVER_DECK_HEIGHT=5;
const riverDeck=RIVER_DECK_HEIGHT,riverSoffit=riverDeck-.7;
const riverSurfaces=[
  floor('lecho',0,0,70,60),floor('entrada',0,34.5,8,9,riverDeck,0),
  floor('ribera-sur',0,26,70,8,riverDeck,0),floor('santuario-norte',0,-26,70,8,riverDeck,0),
  floor('isla-oeste',-27,4,14,18,riverDeck,0),floor('isla-este',27,4,14,18,riverDeck,0),
  floor('isla-central',0,0,16,16,riverDeck,0),
  ...[-27,27].flatMap(x=>[floor('puente-norte-'+x,x,-13.5,8,17,riverDeck,riverSoffit),floor('puente-sur-'+x,x,17.5,8,9,riverDeck,riverSoffit)]),
  floor('puente-oeste',-14,0,12,8,riverDeck,riverSoffit),floor('puente-este',14,0,12,8,riverDeck,riverSoffit),
  floor('puente-altar',0,-15,8,14,riverDeck,riverSoffit),
  ...[-14,14].flatMap(x=>[floor('ribera-baja-'+x,x,4,8,12,.35,0),
    ramp('rampa-norte-'+x,x,-12,8,20,'z',riverDeck,.35),ramp('rampa-sur-'+x,x,16,8,12,'z',.35,riverDeck)]),
];
const riverWalls=[
  ...WALLS.filter(w=>w.kind==='boundary').map(w=>({...w,h:riverDeck+(w.id==='north-boundary'?9:w.id.startsWith('entrance')?4:1.1)})),
  ...[-1,1].flatMap(side=>[
    {id:'estatua-'+side,kind:'cover',x:side*31,z:4,w:2,d:2,y:riverDeck,h:4},
    {id:'altar-'+side,kind:'cover',x:side*5,z:-5,w:2,d:2,y:riverDeck,h:2.8}]),
];
export const MAPS=Object.freeze({
  'titan-demo':TITAN_DEMO_ARENA,
  tutorial:{id:'tutorial',name:'Patio del Umbral',practice:true,
    BOUNDS:{minX:-14,maxX:14,minZ:-16,maxZ:16,entrance:{minX:-3,maxX:3,minZ:12,maxZ:16}},
    START:{x:0,z:9,y:0},PORTAL_Z:15,STEP_HEIGHT,ELEVATED_PILLARS:[],
    SURFACES:[floor('patio',0,0,28,32),floor('balcon',10,-8,6,10,2,0),ramp('rampa',10,1,6,8,'z',2,0)],
    WALLS:[{id:'norte',kind:'boundary',x:0,z:-16,w:28,d:1,y:0,h:5},
      {id:'sur',kind:'boundary',x:0,z:16,w:28,d:1,y:0,h:5},
      {id:'oeste',kind:'boundary',x:-14,z:0,w:1,d:32,y:0,h:5},
      {id:'este',kind:'boundary',x:14,z:0,w:1,d:32,y:0,h:5}],
    SPAWNS:[{x:-6,z:-6,y:0},{x:0,z:-6,y:0},{x:5,z:-8,y:0}],
    SUPPLIES:[{x:-9,z:4,y:0,kind:'ammo'},{x:-9,z:8,y:0,kind:'ammo'}],
    PADS:[pad('practica',8,9,0,10,-8,2,1.4)],WIND:[],panorama:'environment/mictlan-panorama.png'},
  cuenca:{id:'cuenca',name:'Cuenca de Obsidiana',BOUNDS,START,PORTAL_Z,STEP_HEIGHT,ELEVATED_PILLARS,SURFACES,WALLS,SPAWNS,SUPPLIES,PADS:cuencaPads,WIND:[],panorama:'environment/mictlan-panorama.png'},
  rio:{id:'rio',name:'El Río de las Ánimas',BOUNDS,START:{...START,y:riverDeck},PORTAL_Z,STEP_HEIGHT,
    ELEVATED_PILLARS:[],SURFACES:riverSurfaces,WALLS:riverWalls,
    SPAWNS:[{x:-20,z:26,y:riverDeck},{x:20,z:26,y:riverDeck},{x:-30,z:10,y:riverDeck},{x:30,z:10,y:riverDeck},
      {x:-27,z:-16,y:riverDeck},{x:27,z:-16,y:riverDeck},{x:-22,z:-26,y:riverDeck},{x:22,z:-26,y:riverDeck},{x:0,z:-26,y:riverDeck},{x:0,z:3,y:riverDeck}],
    BOSS_SPAWNS:[{x:0,z:-26,y:riverDeck},{x:-27,z:8,y:riverDeck},{x:27,z:8,y:riverDeck}],
    SUPPLIES:[{x:-7,z:26,y:riverDeck,kind:'health'},{x:7,z:26,y:riverDeck,kind:'ammo'},
      {x:-25,z:5,y:riverDeck,kind:'ammo'},{x:25,z:5,y:riverDeck,kind:'health'},
      {x:0,z:4,y:riverDeck,kind:'ammo'},{x:0,z:-26,y:riverDeck,kind:'health'},
      {x:-14,z:10,y:.35,kind:'ammo'},{x:14,z:10,y:.35,kind:'ammo'}],
    PADS:[pad('ribera-oeste',-27,10,riverDeck,-25,-25,riverDeck,1.9),pad('santuario',12,-26,riverDeck,27,7,riverDeck,1.85),
      pad('ribera-este',27,11,riverDeck,7,26,riverDeck,1.5),pad('altar',0,5,riverDeck,0,-25,riverDeck,1.8)],
    WIND:[],panorama:'environment/rio-panorama.png'},
  corona:{id:'corona',name:'La Corona del Viento',BOUNDS,START,PORTAL_Z,STEP_HEIGHT,ELEVATED_PILLARS:[],SURFACES:coronaSurfaces,WALLS:coronaWalls,
    SPAWNS:[{x:-16,z:24,y:0},{x:16,z:24,y:0},{x:-30,z:24,y:0},{x:30,z:24,y:0},
      {x:-30,z:-5,y:3},{x:30,z:6,y:3},{x:-28,z:-24,y:3},{x:28,z:-24,y:3},{x:0,z:-27,y:6},{x:0,z:-21,y:6}],
    SUPPLIES:[{x:-10,z:24,y:0,kind:'health'},{x:10,z:24,y:0,kind:'ammo'},
      {x:-30,z:19,y:0,kind:'ammo'},{x:30,z:19,y:0,kind:'health'},
      {x:-20,z:3,y:3,kind:'ammo'},{x:20,z:-3,y:3,kind:'health'},
      {x:0,z:-26,y:6,kind:'ammo'},{x:0,z:-20,y:6,kind:'health'}],
    PADS:[pad('sur',0,24,0,-24,1,3,1.65),pad('oeste',-24,-3,3,-5,-24,6,1.6),
      pad('cima',4,-24,6,24,0,3,1.6),pad('este',24,3,3,5,24,0,1.4)],
    WIND:[{x:-17,z:24,w:6,d:8,y:0,dx:2,dz:0,offset:0},{x:17,z:24,w:6,d:8,y:0,dx:-2,dz:0,offset:6}],
    panorama:'environment/corona-panorama.png',
  },
});
export function chooseMap(value=Math.random()){const ids=Object.keys(MAPS).filter(id=>!MAPS[id].practice);return ids[Math.min(ids.length-1,Math.max(0,Math.floor(value*ids.length)))];}
export function windPhase(time,zone){const phase=(time+zone.offset)%12;return phase<1?'warning':phase<4?'active':'calm';}

export function riverTide(time,state=null){
  // The Mother owns the river from her spawn warning through her final ascent.
  // Keep the one-argument cycle for callers outside an active encounter.
  if(state?.mapId==='rio'&&(state.bossPending||
    state.spawnWarnings?.some(w=>w.kind==='madre'&&!w.finished)||
    state.enemies?.some(e=>e.kind==='madre'&&(e.hp>0||(e.deadTime??0)<6.4)))){
    return {phase:'high',level:RIVER_DECK_HEIGHT,danger:true,haunted:true};
  }
  const t=((time%36)+36)%36;
  const phase=t<18?'calm':t<22?'warning':t<25?'rising':t<32?'high':'falling';
  const rise=RIVER_DECK_HEIGHT-.06;
  const level=t<22?.06:t<25?.06+(t-22)/3*rise:t<32?RIVER_DECK_HEIGHT:RIVER_DECK_HEIGHT-(t-32)/4*rise;
  return {phase,level,danger:t>=22,haunted:t>=22};
}

