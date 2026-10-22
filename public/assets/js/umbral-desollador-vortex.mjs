import {DESOLLADOR} from './umbral-desollador.mjs';

// A single, reusable 3D mesh: narrow wind ribbons leave the arena, boss and
// crosshair visible. Rotation and flow run on the GPU, with no texture uploads.
export const DESOLLADOR_VORTEX_VISUALS=Object.freeze({
  radius:38,eyeRadius:DESOLLADOR.vortexEyeRadius,ribbons:7,segments:96,orbitSegments:64,
  orbitRadius:28,groundHeight:.45,maxDrawCalls:1,maxVertices:6720,
  lod:Object.freeze({low:3,medium:5,high:7}),
});

export function createDesolladorVortex(T,scene){
  const config=DESOLLADOR_VORTEX_VISUALS,positions=[],uvs=[],flows=[];
  const tau=Math.PI*2;
  // Lanes are stored consecutively, so reducing detail draws a smaller prefix
  // of the same buffer. The golden-angle spacing stays balanced at every LOD.
  function vertex(t,side,lane,kind){
    const phase=lane*2.399963229728653;
    let radius,height,angle,width;
    if(kind===0){
      radius=config.eyeRadius+(config.radius-config.eyeRadius)*Math.pow(1-t,1.35);
      height=t;angle=phase+t*tau*1.7;width=.22+.42*(1-t);
    }else{
      // Sparse upper spirals surround the airborne orbit and join the broad,
      // floor-reaching funnel. The eye follows the boss's enlarged reach.
      radius=config.eyeRadius+(config.orbitRadius-config.eyeRadius)*(1-t);
      height=1-t;angle=phase+t*tau*1.35;width=.13+.18*(1-t);
    }
    positions.push(Math.cos(angle)*radius,height,Math.sin(angle)*radius);
    uvs.push(t,side);
    flows.push(kind,lane,side*width);
  }
  function ribbon(lane,kind,segments){
    for(let i=0;i<segments;i++){
      const a=i/segments,b=(i+1)/segments;
      vertex(a,-1,lane,kind);vertex(b,-1,lane,kind);vertex(a,1,lane,kind);
      vertex(b,-1,lane,kind);vertex(b,1,lane,kind);vertex(a,1,lane,kind);
    }
  }
  for(let lane=0;lane<config.ribbons;lane++){
    ribbon(lane,0,config.segments);ribbon(lane,1,config.orbitSegments);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('windFlow',new T.Float32BufferAttribute(flows,3));
  const uniforms={clock:{value:0},opacity:{value:0},eyeY:{value:9},combo:{value:0}};
  const material=new T.ShaderMaterial({
    transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.AdditiveBlending,
    uniforms,
    vertexShader:`
      attribute vec3 windFlow;
      uniform float clock; uniform float eyeY; uniform float combo;
      varying vec2 flowUv; varying float lane; varying float upper;
      void main(){
        flowUv=uv;lane=windFlow.y;upper=windFlow.x;
        vec3 p=position;
        float rotation=clock*(1.35+position.y*.38)+.09*sin(clock*2.8+lane);
        float c=cos(rotation),s=sin(rotation);
        p.xz=mat2(c,-s,s,c)*p.xz;
        if(upper<.5){
          p.y=.45+position.y*(eyeY+6.5);
        }else{
          p.y=eyeY+position.y*${(DESOLLADOR.vortexOrbitHeight-DESOLLADOR.vortexEyeHeight).toFixed(4)};
        }
        p.y+=windFlow.z+.16*sin(clock*3.1+uv.x*17.0+lane);
        p.xz*=1.0+.018*sin(uv.x*26.0-clock*4.0+lane)*(1.0+combo*.35);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader:`
      uniform float clock; uniform float opacity; uniform float combo;
      varying vec2 flowUv; varying float lane; varying float upper;
      void main(){
        float edge=1.0-smoothstep(.2,1.0,abs(flowUv.y));
        float tip=smoothstep(0.0,.055,flowUv.x)*(1.0-smoothstep(.94,1.0,flowUv.x));
        float travel=fract(flowUv.x*3.0-clock*.58+lane*.19);
        float streak=smoothstep(.03,.17,travel)*(1.0-smoothstep(.66,.92,travel));
        float grain=.82+.18*sin(floor(flowUv.x*180.0)*7.13+lane*11.0);
        float core=pow(max(0.0,1.0-abs(flowUv.y)),6.0);
        float alpha=edge*tip*grain*(.1+streak*.39+core*.16)*opacity;
        alpha*=mix(1.0,.48,upper);
        if(alpha<.025)discard;
        vec3 cyan=mix(vec3(.09,.49,.57),vec3(.52,.95,1.0),core*.7+streak*.2);
        cyan+=vec3(.07,.04,.04)*combo;
        gl_FragColor=vec4(cyan,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh=new T.Mesh(geometry,material);
  mesh.name='desollador-3d-vortex';mesh.visible=false;mesh.frustumCulled=false;
  // Shader positions extend beyond their normalized CPU height. Culling is
  // deliberately disabled for this one mesh rather than rebuilding bounds.
  scene.add(mesh);
  const verticesPerLane=(config.segments+config.orbitSegments)*6;
  let disposed=false,currentLod=null;
  function clear(){mesh.visible=false;uniforms.opacity.value=0;uniforms.combo.value=0;uniforms.clock.value=0;}
  function update(s,quality='medium'){
    if(disposed)return;
    if(!s||s.phase!=='playing'&&s.phase!=='paused'){clear();return;}
    let boss=null;
    for(const e of s.enemies){
      if(e.kind==='desollador'&&e.hp>0&&!(e.shockStunUntil>s.time)&&(e.windSuction||e.vortexTravel)){boss=e;break;}
    }
    if(!boss){clear();return;}
    const tier=typeof quality==='string'?quality:quality?.id;
    const lanes=config.lod[tier]||config.lod.medium;
    if(currentLod!==lanes){geometry.setDrawRange(0,lanes*verticesPerLane);currentLod=lanes;}
    const movement=boss.vortexTravel;
    const destination=movement?.path?.[movement.path.length-1];
    mesh.position.set(destination?.x??boss.x,0,destination?.z??boss.z);
    uniforms.eyeY.value=(destination?.y??boss.y??7)+DESOLLADOR.vortexEyeHeight;
    uniforms.clock.value=s.time;
    uniforms.combo.value=boss.windSuction?.phase==='combo'?1:0;
    // Wind starts reaching the track while the boss moves to the eye. The
    // pause clock is simulation time, so no animation continues behind menus.
    uniforms.opacity.value=movement?Math.min(1,.12+movement.age/Math.max(.1,movement.duration)*.88):Math.min(1,.4+(boss.windSuction.age||0)*2);
    mesh.visible=true;
  }
  return {update,clear,dispose(){if(disposed)return;disposed=true;clear();scene.remove(mesh);geometry.dispose();material.dispose();}};
}
