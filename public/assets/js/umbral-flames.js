import {FLAMES} from './umbral-core.mjs';
import {getArena} from './umbral-arena.mjs';
import {aimDirection} from './umbral-aim.mjs';

// A small shared pixel atlas animates both the hand jets and burning enemies.
// Sprite counts are bounded by the live enemy cap; no per-frame texture uploads.
export function createFlameVisuals(T,scene,atlas,sequence){
  const texture=new T.CanvasTexture(atlas);texture.magFilter=T.NearestFilter;texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;texture.colorSpace=T.SRGBColorSpace;
  const enemies=new Map(),jets=[];
  function sprite(){
    const map=texture.clone();map.repeat.set(1/sequence.columns,1/sequence.rows);map.needsUpdate=true;
    const s=new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthWrite:false,alphaTest:.08}));scene.add(s);return s;
  }
  function remove(s){scene.remove(s);s.material.map.dispose();s.material.dispose();}
  function frame(s,time){
    const f=Math.floor(time*12)%sequence.frames;
    s.material.map.offset.set((f%sequence.columns)/sequence.columns,1-(Math.floor(f/sequence.columns)+1)/sequence.rows);
  }
  for(let i=0;i<12;i++){const s=sprite();s.visible=false;jets.push(s);}
  function clear(){for(const pair of enemies.values())pair.forEach(remove);enemies.clear();jets.forEach(s=>s.visible=false);}
  return {
    update(state){
      const burning=new Set(state.enemies.filter(e=>(e.burnRemaining>0||e.arrowBurnRemaining>0)&&(e.hp>0||e.deadTime<.65)).map(e=>e.id));
      for(const [id,pair] of enemies)if(!burning.has(id)){pair.forEach(remove);enemies.delete(id);}
      for(const e of state.enemies){
        if(!burning.has(e.id))continue;
        let pair=enemies.get(e.id);if(!pair){pair=[sprite(),sprite()];enemies.set(e.id,pair);}
        pair.forEach((s,i)=>{
          s.position.set(e.x+(i-.5)*e.radius,e.y+e.height*(.28+i*.25)+(e.kind==='devorador'?.45:0),e.z);
          s.scale.set(e.height*.62,e.height*.9,1);s.material.opacity=e.hp>0?.8:Math.max(0,1-e.deadTime/.65);
          frame(s,state.time+e.id*.1+i*.2);
        });
      }
      if(state.flameRemaining<=0){jets.forEach(s=>s.visible=false);return;}
      const p=state.player,{x:dx,y:dy,z:dz}=aimDirection(p.yaw,p.pitch),y=p.y+1.6;
      const reach=getArena(state.mapId).wallDistance(p.x,p.z,dx,dz,FLAMES.range,y,dy);
      jets.forEach((s,i)=>{
        s.visible=state.flameRemaining>0;if(!s.visible)return;
        const travel=((state.time*1.7+i/12)%1),d=1.1+travel*(FLAMES.range-1.1),side=i%2?1:-1;
        if(d>reach){s.visible=false;return;}
        const spread=side*(.55*(1-travel)+.12);
        const below=-.25+travel*.12;
        s.position.set(p.x+dx*d+Math.cos(p.yaw)*spread+Math.sin(p.yaw)*Math.sin(p.pitch)*below,y+dy*d+Math.cos(p.pitch)*below,p.z+dz*d-Math.sin(p.yaw)*spread+Math.cos(p.yaw)*Math.sin(p.pitch)*below);
        s.scale.set(.3+travel*.65,.45+travel*.9,1);s.material.opacity=(1-travel)*.6;s.material.rotation=side*.25;
        frame(s,state.time+i*.12);
      });
    },
    clear,
    dispose(){clear();jets.forEach(remove);texture.dispose();}
  };
}
