import {MACUAHUITL,clamp} from './umbral-core.mjs';

// Animate the existing pixel-art sprite continuously for all three combo strokes.
// The centre of the sweep is aligned with the combat impact frame (.24 s).
const POSES=[
  [0,-.28,1.35,-.95], [.12,.03,.91,-.8], [.24,.38,.86,.25],
  [.34,.78,.98,1.05], [.62,1.35,1.55,1.45],
];
const OVERHEAD_POSES=[
  [0,.5,-.6,-.45], [.12,.5,.05,-.45], [.24,.5,1.1,-.45],
  [.34,.5,1.38,-.3], [.62,.5,2.2,-.15],
];
export function macuahuitlPose(time,combo=1){
  const t=clamp(time,0,MACUAHUITL.duration);
  const poses=combo===3?OVERHEAD_POSES:POSES;
  let i=0;while(i<poses.length-2&&t>poses[i+1][0])i++;
  const a=poses[i],b=poses[i+1],u=clamp((t-a[0])/(b[0]-a[0]),0,1),ease=u*u*(3-2*u);
  const pose={x:a[1]+(b[1]-a[1])*ease,y:a[2]+(b[2]-a[2])*ease,angle:a[3]+(b[3]-a[3])*ease};
  if(combo===2){pose.x=1-pose.x;pose.angle=-pose.angle-.8;}
  return pose;
}
export function createMacuahuitlVisuals(T,scene,image){
  const waves=[];
  const sparksGeometry=new T.BufferGeometry(),positions=new Float32Array(96*3);
  sparksGeometry.setAttribute('position',new T.BufferAttribute(positions,3));sparksGeometry.setDrawRange(0,0);
  const sparks=new T.Points(sparksGeometry,new T.PointsMaterial({color:'#b6fff1',size:.16,transparent:true,opacity:.9,depthWrite:false}));
  sparks.frustumCulled=false;scene.add(sparks);
  function clear(){for(const w of waves){scene.remove(w.mesh);w.mesh.geometry.dispose();w.mesh.material.dispose();}waves.length=0;sparksGeometry.setDrawRange(0,0);}
  return {
    impact(event,state){
      for(let i=0;i<2;i++){
        const mesh=new T.Mesh(new T.RingGeometry(.9,1,48),new T.MeshBasicMaterial({
          color:i?'#cfffee':'#6edacb',transparent:true,opacity:.8,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending}));
        mesh.rotation.x=-Math.PI/2;mesh.position.set(event.x,event.groundY+.08+i*.28,event.z);
        scene.add(mesh);waves.push({mesh,start:state.time+i*.055,radius:event.radius,duration:.46});
      }
    },
    update(state){
      for(let i=waves.length-1;i>=0;i--){
        const w=waves[i],age=state.time-w.start,t=clamp(age/w.duration,0,1);
        w.mesh.visible=age>=0;w.mesh.scale.setScalar(.2+w.radius*(1-(1-t)**2));w.mesh.material.opacity=(1-t)*.85;
        if(t>=1){scene.remove(w.mesh);w.mesh.geometry.dispose();w.mesh.material.dispose();waves.splice(i,1);}
      }
      let count=0;
      for(const e of state.enemies){
        if(e.hp<=0||!(e.shockStunUntil>state.time))continue;
        for(let i=0;i<3&&count<96;i++){
          const angle=state.time*5+i*Math.PI*2/3,radius=e.radius*.65,at=count++*3;
          positions[at]=e.x+Math.cos(angle)*radius;
          positions[at+1]=e.y+e.height+.2+(e.kind==='devorador'?.45:0)+Math.sin(angle*2)*.1;
          positions[at+2]=e.z+Math.sin(angle)*radius;
        }
      }
      sparksGeometry.setDrawRange(0,count);sparksGeometry.attributes.position.needsUpdate=count>0;
    },
    drawSlash(ctx,width,height,state){
      if(state.macuahuitlRemaining<=0)return;
      const combo=state.macuahuitlCharged?1:state.macuahuitlCombo;
      const t=MACUAHUITL.duration-state.macuahuitlRemaining,pose=macuahuitlPose(t,combo),size=height*1.45;
      ctx.save();ctx.imageSmoothingEnabled=false;
      // Matching afterimages follow the stroke, including the downward finisher.
      for(let i=3;i>=0;i--){
        if(i&&!(t>.13&&t<.4))continue;
        const p=i?macuahuitlPose(Math.max(0,t-i*.018),combo):pose;
        ctx.save();ctx.globalAlpha=i?.09:.98;ctx.translate(p.x*width,p.y*height);ctx.rotate(p.angle);
        ctx.drawImage(image,-size*.47,-size*.8,size,size);ctx.restore();
      }
      ctx.restore();
    },
    clear,
    dispose(){clear();scene.remove(sparks);sparksGeometry.dispose();sparks.material.dispose();},
  };
}
