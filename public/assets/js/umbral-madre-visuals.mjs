import {MADRE} from './umbral-madre.mjs';

const clips=new WeakMap();
export const MOTHER_WATER_VISUALS=Object.freeze({size:10,anchorY:.065,submergedDepth:7.25,hideDuration:.15,hideDepth:2,maxDrawCalls:1});

// Keep her billboard upright when looking down from a bridge, so the authored
// head and its world-space hitbox stay aligned. Clip water in world space.
export function installMotherWaterClip(material){
  if(clips.has(material))return clips.get(material);
  const uniforms={motherWaterLevel:{value:0},motherWaterClip:{value:0}};
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey.call(material);
  material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying float vMotherWorldY;\n'+shader.vertexShader.replace('mvPosition.xy += rotatedPosition;',
      'vec3 motherRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));\n vec3 motherOffset = motherRight * rotatedPosition.x + vec3(0.0, rotatedPosition.y, 0.0);\n mvPosition += viewMatrix * vec4(motherOffset, 0.0);\n vMotherWorldY = modelMatrix[3].y + rotatedPosition.y;');
    shader.fragmentShader='varying float vMotherWorldY;\nuniform float motherWaterLevel;\nuniform float motherWaterClip;\n'+shader.fragmentShader.replace('void main() {',
      'void main() {\n if (motherWaterClip > .5 && vMotherWorldY < motherWaterLevel) discard;');
  };
  material.customProgramCacheKey=()=>previousKey+'|umbral-mother-water-v1';
  material.needsUpdate=true;clips.set(material,uniforms);return uniforms;
}

export function updateMotherWaterClip(material,state,enemy){
  const uniforms=clips.get(material)||installMotherWaterClip(material);
  const active=state.mapId==='rio'&&enemy?.hp>0&&enemy.waterState!=='capturing'&&Number.isFinite(enemy.waterLevel);
  uniforms.motherWaterClip.value=active?1:0;
  if(active)uniforms.motherWaterLevel.value=enemy.waterLevel;
}

// A single atlas sprite is reused for every cosmetic sighting. It never enters
// the combat enemy list and owns only its own material/UV state, not the image.
export function createMotherOmen(T,scene,images,assets){
  const sequence=assets.enemies.madre.states.move,image=images.get(sequence.file);
  const texture=new T.Texture(image);
  texture.colorSpace=T.SRGBColorSpace;texture.minFilter=texture.magFilter=T.NearestFilter;
  texture.generateMipmaps=false;texture.needsUpdate=true;
  const columns=sequence.columns||sequence.frames,rows=sequence.rows||1;
  texture.repeat.set(1/columns,1/rows);
  const material=new T.SpriteMaterial({map:texture,transparent:true,alphaTest:.12,depthWrite:true});
  installMotherWaterClip(material);
  const sprite=new T.Sprite(material),size=MADRE.width||MOTHER_WATER_VISUALS.size;
  sprite.center.set(.5,MOTHER_WATER_VISUALS.anchorY);sprite.scale.set(size,size,1);
  sprite.visible=false;scene.add(sprite);
  const proxy={hp:1,waterLevel:0};let disposed=false;
  function update(state){
    if(disposed)return;
    const omen=state.motherOmen;
    sprite.visible=!!omen&&state.mapId==='rio'&&(state.phase==='playing'||state.phase==='paused');
    if(!sprite.visible)return;
    const hidden=omen.phase==='hiding'?Math.min(1,Math.max(0,(omen.hidingAge||0)/MOTHER_WATER_VISUALS.hideDuration)):0;
    sprite.visible=hidden<1;
    sprite.position.set(omen.x,omen.y-(MADRE.submergedDepth||MOTHER_WATER_VISUALS.submergedDepth)-hidden*MOTHER_WATER_VISUALS.hideDepth,omen.z);
    material.opacity=.95*(1-hidden);
    proxy.waterLevel=omen.y-.02;updateMotherWaterClip(material,state,proxy);
    const durations=sequence.durations;let frame=0;
    if(durations){
      let total=0;for(let i=0;i<durations.length;i++)total+=durations[i];
      let elapsed=((omen.age||0)*1000)%total;
      while(frame<durations.length-1&&elapsed>=durations[frame]){elapsed-=durations[frame];frame++;}
    }else frame=Math.floor((omen.age||0)*(sequence.fps||5.5556))%sequence.frames;
    texture.offset.set((frame%columns)/columns,1-(Math.floor(frame/columns)+1)/rows);
  }
  function clear(){sprite.visible=false;material.opacity=.95;proxy.waterLevel=0;clips.get(material).motherWaterClip.value=0;}
  function dispose(){if(disposed)return;disposed=true;clear();scene.remove(sprite);material.dispose();texture.dispose();}
  return {update,clear,dispose};
}

// The drag cue stays at the edges: the player keeps a clear view of the head,
// crosshair and equipped weapon while shooting to escape the water pull.
export function drawMotherDrag(ctx,width,height,state){
  const drag=state.motherDrag;if(!drag||state.phase==='dead')return false;
  ctx.save();ctx.strokeStyle='#bc78ff';ctx.lineWidth=Math.max(2,height*.004);
  ctx.globalAlpha=.35+.15*Math.sin((state.time||0)*4);
  for(let side=-1;side<=1;side+=2){
    const edge=side<0?0:width,sign=-side;
    for(let i=0;i<3;i++){
      const y=height*(.24+i*.17),wave=Math.sin((state.time||0)*3+i)*height*.025;
      ctx.beginPath();ctx.moveTo(edge,y-height*.09);
      ctx.bezierCurveTo(edge+sign*width*.07,y-height*.08+wave,edge+sign*width*.035,y+height*.05,edge+sign*width*.1,y+wave);
      ctx.stroke();
    }
  }
  ctx.restore();return true;
}

// Retained while older cached callers switch to the aquatic encounter.
export function drawMotherDarkness(){return false;}

export const MOTHER_CAPTURE_VISUALS=Object.freeze({
  embraceDuration:1,guardianCount:8,guardianSkullFraction:.54,
  shakePosition:.075,shakeRoll:.055,shakeYaw:.035,shakePitch:.045,
});
const captureCamera={x:0,y:0,z:0,roll:0,yaw:0,pitch:0};

// The same output is reused every frame; capture age is simulation time, so a
// paused embrace freezes exactly and never jitters from wall-clock timers.
export function motherCaptureCamera(state){
  const capture=state.motherCapture;
  if(!capture||capture.phase!=='embrace'||state.phase==='dead'){
    captureCamera.x=captureCamera.y=captureCamera.z=captureCamera.roll=captureCamera.yaw=captureCamera.pitch=0;
    return captureCamera;
  }
  const t=Math.max(0,Math.min(1,capture.age||0));
  const strength=Math.min(1,t*24)*Math.min(1,(1-t)*8),c=MOTHER_CAPTURE_VISUALS;
  captureCamera.x=Math.sin(t*91)*c.shakePosition*strength;
  captureCamera.y=Math.sin(t*113+.6)*c.shakePosition*.7*strength;
  captureCamera.z=Math.sin(t*73)*c.shakePosition*.4*strength;
  captureCamera.roll=Math.sin(t*87)*c.shakeRoll*strength;
  captureCamera.yaw=Math.sin(t*109)*c.shakeYaw*strength;
  captureCamera.pitch=Math.sin(t*97+.3)*c.shakePitch*strength;
  return captureCamera;
}

function drawCaptureFrame(ctx,image,sequence,frame,x,y,width,height){
  const columns=sequence.columns||sequence.frames,rows=sequence.rows||1;
  const sw=image.width/columns,sh=image.height/rows;
  ctx.drawImage(image,(frame%columns)*sw,Math.floor(frame/columns)*sh,sw,sh,x,y,width,height);
}

// The close-up and grasp use the authored animated face and skeletal hands.
// No generated stand-in geometry, dark-screen search or forced melee prompt.
export function drawMotherCapture(ctx,width,height,state,images,assets){
  const capture=state.motherCapture;
  if(!capture||capture.phase!=='embrace'||state.phase==='dead')return false;
  const faceSequence=assets.effects['madre-screamer'],handsSequence=assets.effects['madre-hands'];
  const face=images.get(faceSequence.file),hands=images.get(handsSequence.file);
  if(!face)return false;
  const t=Math.max(0,Math.min(1,capture.age||0)),entry=Math.min(1,t/.085);
  const size=height*(1.1+entry*.16),jolt=Math.sin(t*91)*height*.013;
  // Snap to the screaming frames instead of lingering on the neutral portrait.
  const frame=t<.08?1:t<.7?2:3;
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.globalAlpha=.92;ctx.fillStyle='#1d0326';ctx.fillRect(0,0,width,height);
  ctx.globalAlpha=1;
  drawCaptureFrame(ctx,face,faceSequence,frame,width*.5-size*.5+jolt,height*.48-size*.5,size,size);
  if(hands){
    const grip=Math.min(1,t/.22),handSize=height*(.68+grip*.10),handFrame=t<.15?0:t<.68?1:2;
    for(let side=-1;side<=1;side+=2){
      ctx.save();ctx.translate(width*(.5+side*(.39-grip*.085)),height*.68);
      ctx.rotate(-side*Math.PI*.41);
      drawCaptureFrame(ctx,hands,handsSequence,handFrame,-handSize*.5,-handSize*.5,handSize,handSize);
      ctx.restore();
    }
  }
  ctx.restore();return true;
}

export function createMotherGuardians(T,scene,images,assets){
  const sequence=assets.effects['river-soul-swarm'],image=images.get(sequence.file);
  const base=new T.Texture(image);
  base.colorSpace=T.SRGBColorSpace;base.minFilter=base.magFilter=T.NearestFilter;
  base.generateMipmaps=false;base.needsUpdate=true;
  const columns=sequence.columns||sequence.frames,rows=sequence.rows||1;
  const pool=[],arrivalDuration=.09,breakDuration=.2,duration=.29;
  for(let i=0;i<MOTHER_CAPTURE_VISUALS.guardianCount;i++){
    const map=base.clone();map.needsUpdate=true;map.repeat.set(1/columns,1/rows);
    const material=new T.SpriteMaterial({map,alphaTest:.12,transparent:true,depthWrite:true});
    // Dissolve the authored skull into small pixels without particles, extra
    // geometry or a new texture upload for each intercepted shot.
    const shatter={value:0};
    material.onBeforeCompile=shader=>{
      shader.uniforms.guardianBreak=shatter;
      shader.vertexShader='varying vec2 vGuardianUv;\n'+shader.vertexShader.replace('#include <uv_vertex>',
        '#include <uv_vertex>\n vGuardianUv = uv;');
      shader.fragmentShader='varying vec2 vGuardianUv;\nuniform float guardianBreak;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>',
        'vec2 guardianPixel = floor(vGuardianUv * 24.0);\n float guardianDust = fract(sin(dot(guardianPixel, vec2(12.9898, 78.233))) * 43758.5453);\n diffuseColor.a *= step(guardianBreak, guardianDust);\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.72, .31, 1.0), min(guardianBreak * 4.0, .6));\n #include <alphatest_fragment>');
    };
    material.customProgramCacheKey=()=>'umbral-mother-interceptor-v1';
    const sprite=new T.Sprite(material);
    // The skull occupies the lower half of the authored flame atlas. Center its
    // bone, not its taller fire plume, on the physical collision sphere.
    sprite.center.set(.53,.35);sprite.visible=false;scene.add(sprite);pool.push({sprite,shatter});
  }
  let disposed=false;
  function clear(){for(let i=0;i<pool.length;i++){pool[i].sprite.visible=false;pool[i].shatter.value=0;}}
  function update(state){
    if(disposed)return;
    let boss=null;
    if(!state.motherCapture&&(state.phase==='playing'||state.phase==='paused')){
      for(let i=0;i<(state.enemies?.length||0);i++){
        const e=state.enemies[i];if(e.kind==='madre'&&e.hp>0&&e.waterState==='submerged'){boss=e;break;}
      }
    }
    const guardians=boss?.motherGuardians;
    for(let i=0;i<pool.length;i++){
      const visual=pool[i],sprite=visual.sprite,guardian=guardians?.[i];
      // hp is already zero: the logical hit has consumed this guard. Only its
      // brief arrival and breakup remain visible; idle protection has no model.
      sprite.visible=!!guardian&&(guardian.phase==='intercept'||guardian.phase==='shatter')&&guardian.age>=0&&guardian.age<duration;
      if(!sprite.visible)continue;
      const age=guardian.age,progress=Math.min(1,age/arrivalDuration),arrival=progress*(2-progress);
      const shatter=Math.max(0,Math.min(1,(age-arrivalDuration)/breakDuration));
      const from=guardian.from,target=guardian.target||guardian;
      const fromX=from?.x??guardian.fromX??target.x,fromY=from?.y??guardian.fromY??target.y,fromZ=from?.z??guardian.fromZ??target.z;
      sprite.position.set(fromX+(target.x-fromX)*arrival,fromY+(target.y-fromY)*arrival+Math.sin(progress*Math.PI)*.12+shatter*.18,fromZ+(target.z-fromZ)*arrival);
      sprite.scale.setScalar(guardian.radius*2/MOTHER_CAPTURE_VISUALS.guardianSkullFraction*(.75+progress*.25+shatter*.22));
      sprite.material.opacity=1-shatter;visual.shatter.value=shatter;
      const frame=Math.floor(age*(sequence.fps||12.5)+(guardian.index||0)*1.37)%sequence.frames;
      sprite.material.map.offset.set((frame%columns)/columns,1-(Math.floor(frame/columns)+1)/rows);
    }
  }
  function dispose(){
    if(disposed)return;disposed=true;clear();
    for(let i=0;i<pool.length;i++){const sprite=pool[i].sprite;scene.remove(sprite);sprite.material.map.dispose();sprite.material.dispose();}
    base.dispose();
  }
  return {update,clear,dispose};
}
