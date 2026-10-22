// Small combat arena for the Titan encounter. No ranked or random-map entry.
const floor=(id,x,z,w,d,y=0,base=y-.7)=>({id,kind:y?'platform':'floor',x,z,w,d,y,base,thickness:y-base});
const ramp=(id,x,z,w,d,from,to,base=0)=>({id,kind:'ramp',x,z,w,d,y:Math.min(from,to),base,ramp:{axis:'z',from,to}});
export const TITAN_DEMO_ARENA={
  id:'titan-demo',name:'Patio del Titán',practice:true,
  BOUNDS:{minX:-24,maxX:24,minZ:-27,maxZ:24,entrance:{minX:-4,maxX:4,minZ:18,maxZ:24}},
  START:{x:0,z:15,y:0},FINISH_POINT:{x:0,z:2,y:0},PORTAL_Z:23,STEP_HEIGHT:.4,ELEVATED_PILLARS:[],
  SURFACES:[floor('plaza',0,4,40,40),floor('santuario',0,-22,12,10,4,3.3),
    ramp('santuario-rampa',0,-10,8,14,4,0),
    floor('oeste',-16,2,8,12,3,0),floor('este',16,2,8,12,3,0),
    ramp('oeste-rampa',-16,12,8,8,3,0),ramp('este-rampa',16,12,8,8,3,0)],
  WALLS:[{id:'sur',kind:'boundary',x:0,z:24,w:48,d:1,y:0,h:6},
    {id:'oeste',kind:'boundary',x:-24,z:0,w:1,d:54,y:0,h:3},
    {id:'este',kind:'boundary',x:24,z:0,w:1,d:54,y:0,h:3},
    {id:'norte',kind:'boundary',x:0,z:-27,w:48,d:1,y:0,h:8},
    {id:'altar-oeste',kind:'cover',x:-7,z:3,w:2.4,d:2.4,y:0,h:2.3},
    {id:'altar-este',kind:'cover',x:7,z:3,w:2.4,d:2.4,y:0,h:2.3}],
  SPAWNS:[{x:-12,z:-9,y:0},{x:12,z:-9,y:0},{x:-10,z:17,y:0},{x:10,z:17,y:0},{x:0,z:7,y:0}],
  BOSS_SPAWNS:[{x:0,z:-1,y:0}],
  SUPPLIES:[{x:-10,z:18,y:0,kind:'health'},{x:10,z:18,y:0,kind:'ammo'},
    {x:-16,z:3,y:3,kind:'ammo'},{x:16,z:3,y:3,kind:'health'},
    {x:0,z:-23,y:4,kind:'ammo'},{x:10,z:-10,y:0,kind:'health'},
    {x:-10,z:-10,y:0,kind:'ammo'}],
  PADS:[{id:'salto-santuario',x:9,z:-8,y:0,radius:1.15,to:{x:0,z:-23,y:4},duration:1.35}],
  WIND:[],panorama:'environment/mictlan-panorama.png',
};
