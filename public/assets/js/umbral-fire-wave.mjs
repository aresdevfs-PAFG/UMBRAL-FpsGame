// Four shared-atlas ribbons form upright, expanding walls of flame. A whole
// wave is one draw call; geometry, texture and GPU programs survive reuse.
export const FIRE_WAVE={capacity:4,segments:64,height:1.1};

export function createFireWaveVisuals(T,scene,atlas,sequence){
  const texture=new T.Texture(atlas);
  texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.NearestFilter;
  texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  const vertices=[],uvs=[],phases=[];
  // The atlas has transparent margins. Overlap three angular intervals per
  // panel so the authored flames join into a continuous crest, not candles.
  for(let i=0;i<FIRE_WAVE.segments;i++){
    const a=(i-1)/FIRE_WAVE.segments*Math.PI*2,b=(i+2)/FIRE_WAVE.segments*Math.PI*2;
    for(const [angle,y,u] of [[a,0,0],[b,0,1],[a,1,0],[b,0,1],[b,1,1],[a,1,0]]){
      vertices.push(Math.cos(angle),y,Math.sin(angle));uvs.push(u,y);phases.push(i%sequence.frames);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('flamePhase',new T.Float32BufferAttribute(phases,1));
  const material=new T.ShaderMaterial({
    transparent:true,side:T.DoubleSide,depthWrite:false,
    uniforms:{map:{value:texture},atlasGrid:{value:new T.Vector2(sequence.columns||sequence.frames,sequence.rows||1)},atlasInset:{value:new T.Vector2((sequence.columns||sequence.frames)/atlas.width*.5,(sequence.rows||1)/atlas.height*.5)},frame:{value:0},frameCount:{value:sequence.frames},opacity:{value:.85},clock:{value:0}},
    vertexShader:`attribute float flamePhase;
      varying vec2 flameUv; varying float flameOffset;
      uniform float clock;
      void main(){
        flameUv=uv; flameOffset=flamePhase;
        vec3 p=position;
        p.y*=.93+.07*sin(clock*9.0+flamePhase*2.3);
        p.xz*=1.0+.015*position.y*sin(clock*7.0+flamePhase);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader:`uniform sampler2D map;
      uniform vec2 atlasGrid; uniform vec2 atlasInset; uniform float frame; uniform float frameCount; uniform float opacity;
      varying vec2 flameUv; varying float flameOffset;
      void main(){
        float f=mod(frame+flameOffset,frameCount);
        vec2 cell=vec2(mod(f,atlasGrid.x),atlasGrid.y-1.0-floor(f/atlasGrid.x));
        vec4 fire=texture2D(map,(cell+clamp(flameUv,atlasInset,vec2(1.0)-atlasInset))/atlasGrid);
        if(fire.a<.08)discard;
        gl_FragColor=vec4(fire.rgb,fire.a*opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const slots=Array.from({length:FIRE_WAVE.capacity},()=>{
    const instance=material.clone();instance.uniforms.map.value=texture;
    const mesh=new T.Mesh(geometry,instance);mesh.visible=false;
    mesh.frustumCulled=false;scene.add(mesh);return {mesh,id:null};
  });
  const activeIds=new Set();let disposed=false;
  function clear(){activeIds.clear();for(const slot of slots){slot.id=null;slot.mesh.visible=false;}}
  function update(s){
    if(disposed)return;
    activeIds.clear();
    for(const h of s.hazards)if(h.flameWave&&h.kind==='ground-shockwave'&&h.age>=h.warning&&h.age<h.warning+h.duration)activeIds.add(h.id);
    for(const slot of slots)if(!activeIds.has(slot.id)){slot.id=null;slot.mesh.visible=false;}
    for(const h of s.hazards){
      if(!activeIds.has(h.id))continue;
      const slot=slots.find(v=>v.id===h.id)||slots.find(v=>v.id===null);if(!slot)continue;
      slot.id=h.id;const active=h.age-h.warning,progress=Math.min(1,active/h.duration);
      slot.mesh.visible=true;slot.mesh.position.set(h.x,h.y+.02,h.z);
      slot.mesh.scale.set(Math.max(.3,h.radius),FIRE_WAVE.height*(.65+.35*Math.min(1,active*9)),Math.max(.3,h.radius));
      const uniforms=slot.mesh.material.uniforms;
      uniforms.frame.value=Math.floor(s.time*12);uniforms.clock.value=s.time;
      uniforms.opacity.value=.88*Math.min(1,(1-progress)*5);
    }
  }
  return {update,clear,dispose(){if(disposed)return;disposed=true;clear();for(const slot of slots){scene.remove(slot.mesh);slot.mesh.material.dispose();}material.dispose();geometry.dispose();texture.dispose();}};
}
