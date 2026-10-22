import {windPhase} from './umbral-maps.mjs';

// Shared symbol textures replace individual meshes for every line and ring.
export function traversalVisuals(T,parent,arena){
  const group=new T.Group();parent.add(group);const wind=[],textures=[];
  function symbol(landing){
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
    ctx.strokeStyle=landing?'#91d8c6':'#6df9ed';ctx.lineWidth=landing?3:5;
    if(landing)ctx.strokeRect(4,4,120,120);
    else{
      ctx.fillStyle='#123539cc';ctx.beginPath();ctx.arc(64,64,59,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.lineWidth=2;ctx.beginPath();ctx.arc(64,64,43,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#c3ffed';ctx.lineWidth=4;
      for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(49,43+i*17);ctx.lineTo(64,55+i*17);ctx.lineTo(79,43+i*17);ctx.stroke();}
    }
    const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.magFilter=map.minFilter=T.NearestFilter;map.generateMipmaps=false;textures.push(map);
    return new T.MeshBasicMaterial({map,transparent:true,opacity:landing?.65:.9,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
  }
  const sealMat=symbol(false),landingMat=symbol(true),plane=new T.PlaneGeometry(1,1);
  for(const pad of arena.PADS){
    const disk=new T.Mesh(plane,sealMat);disk.position.set(pad.x,pad.y+.028,pad.z);
    disk.rotation.set(-Math.PI/2,0,Math.atan2(pad.to.x-pad.x,pad.to.z-pad.z));disk.scale.setScalar(pad.radius*2.3);disk.updateMatrix();disk.matrixAutoUpdate=false;group.add(disk);
    const landing=new T.Mesh(plane,landingMat);landing.position.set(pad.to.x,pad.to.y+.035,pad.to.z);landing.rotation.x=-Math.PI/2;landing.scale.setScalar(3.4);landing.updateMatrix();landing.matrixAutoUpdate=false;group.add(landing);
  }
  const sparkPositions=new Float32Array(arena.PADS.length*8*3),sparkGeo=new T.BufferGeometry();
  sparkGeo.setAttribute('position',new T.BufferAttribute(sparkPositions,3).setUsage(T.DynamicDrawUsage));
  const sparks=new T.Points(sparkGeo,new T.PointsMaterial({color:'#83ffeb',size:.09,transparent:true,opacity:.6,depthWrite:false}));sparks.frustumCulled=false;group.add(sparks);
  for(const zone of arena.WIND){
    const positions=new Float32Array(36*3),g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
    const points=new T.Points(g,new T.PointsMaterial({color:'#d2c8eb',size:.08,transparent:true,opacity:.5,depthWrite:false}));points.frustumCulled=false;group.add(points);wind.push({zone,points,positions});
  }
  return {update(time,detail=true){
    sealMat.opacity=.8+Math.sin(time*3)*.1;sparks.visible=detail;
    if(detail){arena.PADS.forEach((pad,p)=>{for(let i=0;i<8;i++){const at=(p*8+i)*3,cycle=(time*.65+i/8)%1;sparkPositions[at]=pad.x+Math.sin(i*2.4)*.86;sparkPositions[at+1]=pad.y+cycle*1.4;sparkPositions[at+2]=pad.z+Math.cos(i*2.4)*.86;}});sparkGeo.attributes.position.needsUpdate=true;}
    for(const {zone,points,positions} of wind){
      const phase=windPhase(time,zone);points.visible=phase!=='calm';if(!points.visible)continue;
      points.material.color.set(phase==='active'?'#ddd2ff':'#ffb976');
      for(let i=0;i<36;i++){const t=(time*(phase==='active'?.8:.16)+i*.618)%1;positions[i*3]=zone.x+(t-.5)*zone.w*Math.sign(zone.dx);positions[i*3+1]=zone.y+.15+(i%7)*.15;positions[i*3+2]=zone.z+((i*.381)%1-.5)*zone.d;}
      points.geometry.attributes.position.needsUpdate=true;
    }
  },dispose(){const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());parent.remove(group);}};
}
