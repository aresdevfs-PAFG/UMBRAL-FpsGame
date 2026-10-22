import {riverTide} from './umbral-maps.mjs';

// The same authored frames drive the GIF previews, water spirits and HUD bites.
const atlasGLSL=`
uniform sampler2D soulAtlas;uniform vec2 grid;uniform float frames;uniform float fps;
vec4 soulFrame(vec2 uv,float phase){
  float frame=mod(floor(time*fps+phase),frames);
  vec2 cell=vec2(mod(frame,grid.x),grid.y-1.-floor(frame/grid.x));
  return texture2D(soulAtlas,(cell+clamp(uv,.002,.998))/grid);
}`;

export function riverSpriteFrame(time,sequence,phase=0){
  return ((Math.floor(time*(sequence.fps||12.5)+phase)%sequence.frames)+sequence.frames)%sequence.frames;
}

export function createRiverVisuals(T,world,arena,sprite=null){
  const time={value:0},haunted={value:0},seq=sprite?.sequence||{frames:8,columns:4,rows:2,fps:12.5};
  const texture=sprite?.image?new T.Texture(sprite.image):new T.DataTexture(new Uint8Array(4),1,1);
  texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  const atlasUniforms={soulAtlas:{value:texture},grid:{value:new T.Vector2(seq.columns,seq.rows)},frames:{value:seq.frames},fps:{value:seq.fps||12.5}};
  const waterMaterial=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{time,haunted,...atlasUniforms},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float time;uniform float haunted;${atlasGLSL}
    void main(){
      vec2 p=floor(vUv*1200.)/1200.;
      float wave=sin(p.y*800.+time*2.5+sin(p.x*210.+time*.3)*2.);
      float foam=smoothstep(.85,1.,wave);
      vec3 calm=mix(vec3(.022,.085,.10),vec3(.10,.26,.27),wave*.22+.3)+foam*vec3(.08,.13,.12);
      vec2 flow=p*vec2(90.,84.)+vec2(sin(p.y*60.+time*.6)*.18,time*.09);
      vec2 cell=floor(flow),q=fract(flow)-.5;
      float seed=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
      vec4 submerged=soulFrame(q+.5,seed*8.);
      float soul=submerged.a*smoothstep(.35,.9,seed)*(.6+.4*sin(time*2.+seed*30.));
      float cracks=pow(.5+.5*sin(p.x*620.+sin(p.y*470.-time*1.5)*3.+time),9.);
      vec3 cursed=vec3(.045,.004,.09)+vec3(.15,.012,.24)*foam+vec3(.26,.04,.45)*cracks+soul*submerged.rgb*vec3(.12,.055,.24);
      gl_FragColor=vec4(mix(calm,cursed,haunted),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const waterGeometry=new T.PlaneGeometry(150,140),water=new T.Mesh(waterGeometry,waterMaterial);
  water.rotation.x=-Math.PI/2;world.add(water);
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{time,...atlasUniforms},
    vertexShader:`attribute float soulPhase;varying vec2 vUv;varying float phase;void main(){vUv=uv;phase=soulPhase;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;varying float phase;uniform float time;${atlasGLSL}
    void main(){
      vec4 texel=soulFrame(vUv,phase);if(texel.a<.025)discard;
      gl_FragColor=vec4(pow(texel.rgb,vec3(2.2)),texel.a*.94);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const geometry=new T.PlaneGeometry(1,1),count=32;
  geometry.setAttribute('soulPhase',new T.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>i*2.37),1));
  const spirits=new T.InstancedMesh(geometry,material,count);
  spirits.instanceMatrix.setUsage(T.DynamicDrawUsage);spirits.frustumCulled=false;world.add(spirits);
  const dummy=new T.Object3D(),positions=Array.from({length:count},(_,i)=>({x:Math.sin(i*2.4)*24,z:Math.cos(i*2.4)*20}));
  let previousTime=null,previousState=null;
  const wet=(x,z,level)=>arena.inBounds(x,z)&&arena.groundHeight(x,z)<level-.08&&!arena.solid(x,z,.1,level+.03,.2);
  function update(clock,state,quality){
    const tide=riverTide(state?.portalUsed?clock-(state.riverStartedAt||0):0,state);
    time.value=clock;haunted.value=tide.haunted?1:0;
    // Millimetre offset prevents coplanar flicker; gameplay uses the exact deck height.
    water.position.y=tide.level-.008;spirits.visible=tide.haunted;
    const reset=state!==previousState||previousTime===null||clock<previousTime;
    const dt=reset?0:Math.min(.1,Math.max(0,clock-previousTime));previousTime=clock;previousState=state;
    if(!spirits.visible||!state?.player)return;
    const p=state.player;spirits.count=quality?.id==='low'?16:count;
    for(let i=0;i<spirits.count;i++){
      const pos=positions[i],angle=i*2.39996+clock*.18;
      // Search concentric rings near the player. All targets and visible souls stay in water.
      let tx=pos.x,tz=pos.z,found=false;
      for(let ring=0;ring<4;ring++){
        const radius=(state.riverImmersed?.6:1.3)+ring*1.45+(i%3)*.22;
        const x=p.x+Math.cos(angle)*radius,z=p.z+Math.sin(angle)*radius;
        if(wet(x,z,tide.level)){tx=x;tz=z;found=true;break;}
      }
      if(reset){pos.x=tx;pos.z=tz;}
      const blend=1-Math.exp(-dt*3.5);pos.x+=(tx-pos.x)*blend;pos.z+=(tz-pos.z)*blend;
      const visible=found&&wet(pos.x,pos.z,tide.level);
      const size=visible?.75+Math.sin(clock*3+i)*.12:0;
      dummy.position.set(pos.x,tide.level+.38+Math.sin(clock*2+i)*.08,pos.z);
      dummy.rotation.set(0,Math.atan2(p.x-pos.x,p.z-pos.z),0);dummy.scale.set(size*(i%2?-1:1)*1.4,size*1.4,size);dummy.updateMatrix();spirits.setMatrixAt(i,dummy.matrix);
    }
    spirits.instanceMatrix.needsUpdate=true;
  }
  return {update,dispose(){world.remove(water,spirits);spirits.dispose();geometry.dispose();material.dispose();waterGeometry.dispose();waterMaterial.dispose();texture.dispose();}};
}

export function drawRiverBites(ctx,width,height,state,sprite=null){
  if(!state.riverImmersed||state.mapId!=='rio')return;
  ctx.save();
  ctx.fillStyle='rgba(92,15,160,.24)';ctx.fillRect(0,0,width,height);
  const glow=ctx.createRadialGradient(width/2,height/2,height*.2,width/2,height/2,width*.65);
  glow.addColorStop(0,'rgba(100,0,170,0)');glow.addColorStop(1,'rgba(65,0,115,.8)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  if(sprite?.image){
    const {image,sequence}=sprite,fw=image.width/sequence.columns,fh=image.height/sequence.rows;
    ctx.imageSmoothingEnabled=false;
    for(let i=0;i<6;i++){
      const frame=riverSpriteFrame(state.time,sequence,i*1.3),pulse=Math.sin(frame/sequence.frames*Math.PI);
      const side=i%2?1:-1,x=width*(side<0?.045:.955)-side*pulse*width*.018;
      const y=height*(.18+Math.floor(i/2)*.25),size=Math.min(width,height)*(.23+pulse*.035);
      ctx.save();ctx.translate(x,y);ctx.scale(side<0?1:-1,1);ctx.globalAlpha=.95;
      ctx.drawImage(image,(frame%sequence.columns)*fw,Math.floor(frame/sequence.columns)*fh,fw,fh,-size/2,-size/2,size,size);
      ctx.restore();
    }
  }
  ctx.restore();
}
