import {createPool} from './umbral-performance.mjs';
// Both shots share a brief energy trail; only their palette changes.
const PALETTES={
  primary:['#d84b0c','#ff851b','#fff1b5'],
  secondary:['#6021ad','#b04bff','#efd6ff'],
};
export function createBowTrailPool(T){
  const layers=[.13,.058,.019].map(radius=>createPool(()=>{
    const geometry=new T.CylinderGeometry(radius*.3,radius,1,8,1,true);
    const material=new T.MeshBasicMaterial({transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,toneMapped:false,forceSinglePass:true});
    return new T.Mesh(geometry,material);
  },mesh=>{mesh.geometry.dispose();mesh.material.dispose();},8));
  return {layers,dispose(){layers.forEach(layer=>layer.dispose());}};
}
export function createBowTrail(T,event,pool){
  const start=new T.Vector3(event.x,event.y,event.z),end=new T.Vector3(event.tx,event.ty,event.tz);
  const forward=end.clone().sub(start),distance=forward.length();
  if(distance<.02)return [];
  forward.normalize();
  const reference=Math.abs(forward.y)>.999?new T.Vector3(0,0,1):new T.Vector3(0,1,0);
  const right=new T.Vector3().crossVectors(forward,reference).normalize();
  const up=new T.Vector3().crossVectors(right,forward).normalize();
  // Emerge from the lowered, centered bow, then converge exactly on the aim ray.
  start.addScaledVector(forward,Math.min(.5,distance*.4)).addScaledVector(up,-Math.min(.32,distance*.25));
  const direction=end.clone().sub(start),length=direction.length();direction.normalize();
  const colors=PALETTES[event.secondary?'secondary':'primary'];
  return [.13,.058,.019].map((radius,layer)=>{
    const opacity=[.24,.6,1][layer],total=.22;
    const mesh=pool?pool.layers[layer].take():new T.Mesh(new T.CylinderGeometry(radius*.3,radius,1,8,1,true),new T.MeshBasicMaterial({transparent:true,
      blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,toneMapped:false,forceSinglePass:true}));
    mesh.material.color.set(colors[layer]);mesh.material.opacity=opacity;mesh.scale.set(1,length,1);
    mesh.position.copy(start).addScaledVector(direction,length*.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);
    return {mesh,life:total,total,opacity,trail:true,length,release:pool?.layers[layer].release};
  });
}

// Small animated impact atlases, never a shaft, arrowhead or flying arrow sprite.
export function installBowEffects(assets,images){
  for(const kind of ['jaguar-impact-orange','jaguar-explosion']){
    const colors=PALETTES[kind==='jaguar-explosion'?'secondary':'primary'];
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
    const ctx=canvas.getContext('2d');
    for(let f=0;f<4;f++){
      ctx.save();ctx.translate(f*64,0);
      const radius=10+f*6;
      for(let layer=0;layer<3;layer++){
        ctx.fillStyle=colors[layer];ctx.beginPath();
        for(let i=0;i<20;i++){
          const a=i*Math.PI/10,r=(radius-layer*4)*(i%2?.63:1);
          const x=Math.round((32+Math.cos(a)*r)/2)*2,y=Math.round((32+Math.sin(a)*r)/2)*2;
          if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }
    const file='runtime/'+kind;images.set(file,canvas);
    assets.effects[kind]={file,frames:4,durations:[65,65,65,65],threeSpriteCenter:[.5,.5]};
  }
}
