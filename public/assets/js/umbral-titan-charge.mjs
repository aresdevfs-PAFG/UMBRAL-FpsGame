// The authored aura atlas animates without uploading new textures. The light
// trail follows the actual charge path, using one reusable ribbon per Titan.
export const TITAN_CHARGE_VISUALS=Object.freeze({capacity:2,sampleInterval:.05,trailLife:.4,points:16,teleportDistance:3});

export function createTitanChargeVisuals(T,scene,atlas,sequence){
  const base=new T.Texture(atlas),columns=sequence.columns||sequence.frames,rows=sequence.rows||1;
  base.colorSpace=T.SRGBColorSpace;base.magFilter=T.NearestFilter;base.minFilter=T.NearestFilter;
  base.generateMipmaps=false;base.needsUpdate=true;
  const slots=Array.from({length:TITAN_CHARGE_VISUALS.capacity},()=>{
    const flames=Array.from({length:2},(_,index)=>{
      const map=base.clone();map.repeat.set(1/columns,1/rows);map.needsUpdate=true;
      const material=new T.SpriteMaterial({map,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:index?.3:.7});
      const sprite=new T.Sprite(material);sprite.center.set(.5,.5);sprite.visible=false;scene.add(sprite);return sprite;
    });
    const positions=new Float32Array((TITAN_CHARGE_VISUALS.points-1)*18),times=new Float32Array((TITAN_CHARGE_VISUALS.points-1)*6);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute('birthTime',new T.BufferAttribute(times,1).setUsage(T.DynamicDrawUsage));geometry.setDrawRange(0,0);
    const material=new T.ShaderMaterial({
      transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
      uniforms:{clock:{value:0},life:{value:TITAN_CHARGE_VISUALS.trailLife}},
      vertexShader:`attribute float birthTime; varying float born;
        void main(){born=birthTime;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform float clock;uniform float life;varying float born;
        void main(){float strength=clamp(1.0-(clock-born)/life,0.0,1.0);
          if(strength<=.01)discard;gl_FragColor=vec4(.58,.10,1.0,strength*.65);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const ribbon=new T.Mesh(geometry,material);ribbon.visible=false;ribbon.frustumCulled=false;scene.add(ribbon);
    return {id:null,enemy:null,flames,ribbon,positions,times,points:new Float32Array(TITAN_CHARGE_VISUALS.points*4),count:0,nextSample:0,lastX:0,lastY:0,lastZ:0,charging:false};
  });
  let boundState=null,lastTime=0,disposed=false;
  function reset(slot){slot.id=null;slot.enemy=null;slot.count=0;slot.nextSample=0;slot.charging=false;slot.ribbon.visible=false;slot.ribbon.geometry.setDrawRange(0,0);for(const flame of slot.flames)flame.visible=false;}
  function clear(){for(const slot of slots)reset(slot);boundState=null;lastTime=0;}
  function append(slot,e,time){
    const q=slot.points,max=TITAN_CHARGE_VISUALS.points;
    if(slot.count===max){q.copyWithin(0,4);slot.count--;}
    const offset=slot.count++*4;q[offset]=e.x;q[offset+1]=(e.y||0)+.045;q[offset+2]=e.z;q[offset+3]=time;
  }
  function rebuild(slot,time){
    const q=slot.points,p=slot.positions,t=slot.times;
    let vertices=0;
    for(let i=1;i<slot.count;i++){
      const a=(i-1)*4,b=i*4;if(time-q[b+3]>=TITAN_CHARGE_VISUALS.trailLife)continue;
      const dx=q[b]-q[a],dz=q[b+2]-q[a+2],distance=Math.hypot(dx,dz);if(distance<.025)continue;
      const nx=-dz/distance,nz=dx/distance,wa=.65,wb=.65;
      const leftAx=q[a]+nx*wa,rightAx=q[a]-nx*wa,leftAz=q[a+2]+nz*wa,rightAz=q[a+2]-nz*wa;
      const leftBx=q[b]+nx*wb,rightBx=q[b]-nx*wb,leftBz=q[b+2]+nz*wb,rightBz=q[b+2]-nz*wb;
      let n=vertices*3;
      p[n++]=leftAx;p[n++]=q[a+1];p[n++]=leftAz;p[n++]=rightAx;p[n++]=q[a+1];p[n++]=rightAz;p[n++]=leftBx;p[n++]=q[b+1];p[n++]=leftBz;
      p[n++]=rightAx;p[n++]=q[a+1];p[n++]=rightAz;p[n++]=rightBx;p[n++]=q[b+1];p[n++]=rightBz;p[n++]=leftBx;p[n++]=q[b+1];p[n++]=leftBz;
      t[vertices]=q[a+3];t[vertices+1]=q[a+3];t[vertices+2]=q[b+3];t[vertices+3]=q[a+3];t[vertices+4]=q[b+3];t[vertices+5]=q[b+3];vertices+=6;
    }
    slot.ribbon.geometry.setDrawRange(0,vertices);slot.ribbon.geometry.attributes.position.needsUpdate=true;slot.ribbon.geometry.attributes.birthTime.needsUpdate=true;
    slot.ribbon.visible=vertices>0;
  }
  function update(s){
    if(disposed)return;
    if(s!==boundState||s.time<lastTime){clear();boundState=s;}
    lastTime=s.time;
    if(s.phase!=='playing'&&s.phase!=='paused'){for(const slot of slots)reset(slot);return;}
    for(const slot of slots){
      if(slot.id===null)continue;
      let e=null;for(const enemy of s.enemies)if(enemy.id===slot.id){e=enemy;break;}
      if(!e||e.hp<=0||e.downed||e.bossMotion||e.shockStunUntil>s.time){reset(slot);continue;}
      const displacement=Math.hypot(e.x-slot.lastX,e.z-slot.lastZ),vertical=Math.abs((e.y||0)-slot.lastY);
      if(displacement>TITAN_CHARGE_VISUALS.teleportDistance||vertical>.9){reset(slot);continue;}
      slot.enemy=e;
    }
    for(const e of s.enemies){
      if(!e.boss||e.hp<=0||!e.charge||e.downed||e.bossMotion||e.shockStunUntil>s.time)continue;
      let slot=null;for(const candidate of slots)if(candidate.id===e.id){slot=candidate;break;}
      if(!slot){for(const candidate of slots)if(candidate.id===null){slot=candidate;break;}if(!slot)continue;slot.id=e.id;slot.enemy=e;slot.nextSample=s.time;slot.lastX=e.x;slot.lastY=e.y||0;slot.lastZ=e.z;}
    }
    for(const slot of slots){
      const e=slot.enemy;if(!e)continue;
      const charging=!!e.charge,justStarted=charging&&!slot.charging;
      if(justStarted){slot.count=0;slot.nextSample=s.time;append(slot,e,s.time);}
      const sample=s.time>=slot.nextSample;
      if(sample){
        // Sampling uses simulation time, so pausing never grows the trail.
        if(charging&&!justStarted)append(slot,e,s.time);
        slot.nextSample=s.time+TITAN_CHARGE_VISUALS.sampleInterval;rebuild(slot,s.time);
      }
      if(!charging&&slot.count&&s.time-slot.points[(slot.count-1)*4+3]>=TITAN_CHARGE_VISUALS.trailLife){reset(slot);continue;}
      const frame=Math.floor(s.time*(sequence.fps||12))%sequence.frames;
      for(let i=0;i<slot.flames.length;i++){
        const flame=slot.flames[i],f=(frame+i*2)%sequence.frames,map=flame.material.map;
        map.offset.set((f%columns)/columns,1-(Math.floor(f/columns)+1)/rows);
        flame.visible=charging;flame.position.set(e.x,(e.y||0)+e.height*(i?.2:.5),e.z);
        flame.scale.set((e.width||e.height)*(i?.7:1.14),e.height*(i?.6:1.2),1);
      }
      slot.ribbon.material.uniforms.clock.value=s.time;slot.charging=charging;
      slot.lastX=e.x;slot.lastY=e.y||0;slot.lastZ=e.z;
    }
  }
  return {update,clear,dispose(){if(disposed)return;disposed=true;clear();for(const slot of slots){for(const flame of slot.flames){scene.remove(flame);flame.material.map.dispose();flame.material.dispose();}scene.remove(slot.ribbon);slot.ribbon.geometry.dispose();slot.ribbon.material.dispose();}base.dispose();}};
}
