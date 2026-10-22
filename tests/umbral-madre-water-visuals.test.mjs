import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/assets/vendor/three/three.module.min.js';
import {installMotherWaterClip,updateMotherWaterClip,createMotherOmen,drawMotherDrag,MOTHER_WATER_VISUALS as config} from '../public/assets/js/umbral-madre-visuals.mjs';

const asset={enemies:{madre:{states:{move:{file:'madre-move',columns:4,rows:1,frames:4,durations:[180,180,180,180]}}}}};
const images=new Map([['madre-move',{width:1024,height:256}]]);
const state=(extra={})=>({mapId:'rio',phase:'playing',time:1,motherOmen:{x:12,y:5.02,z:7,age:.2,phase:'watching'},...extra});
const shaderFor=material=>{const shader={uniforms:{},vertexShader:T.ShaderLib.sprite.vertexShader,fragmentShader:T.ShaderLib.sprite.fragmentShader};material.onBeforeCompile(shader);return shader;};

test('water clips the real upright billboard at its world height and never recompiles on tides or death',()=>{
  const material=new T.SpriteMaterial(),uniforms=installMotherWaterClip(material),version=material.version,key=material.customProgramCacheKey();
  assert.equal(installMotherWaterClip(material),uniforms);assert.equal(material.version,version);
  const shader=shaderFor(material);
  assert.equal(shader.uniforms.motherWaterLevel,uniforms.motherWaterLevel);
  assert.match(shader.vertexShader,/mvPosition \+= viewMatrix \* vec4\(motherOffset, 0\.0\)/);
  assert.match(shader.vertexShader,/vMotherWorldY = modelMatrix\[3\]\.y \+ rotatedPosition\.y/);
  assert.match(shader.fragmentShader,/vMotherWorldY < motherWaterLevel\) discard/);
  assert.equal(shader.fragmentShader.match(/uniform float motherWaterClip/g).length,1);
  const enemy={hp:12000,waterLevel:5};
  for(let i=0;i<1000;i++){enemy.waterLevel=i/200;updateMotherWaterClip(material,state(),enemy);}
  assert.equal(uniforms.motherWaterClip.value,1);assert.equal(uniforms.motherWaterLevel.value,4.995);
  assert.equal(material.version,version);assert.equal(material.customProgramCacheKey(),key);
  enemy.hp=0;updateMotherWaterClip(material,state(),enemy);assert.equal(uniforms.motherWaterClip.value,0);
  enemy.hp=1;updateMotherWaterClip(material,state({mapId:'corona'}),enemy);assert.equal(uniforms.motherWaterClip.value,0);
  material.dispose();
});

test('one reused omen sprite exposes only the atlas head and sinks completely within 150ms',()=>{
  const scene=new T.Scene(),omen=createMotherOmen(T,scene,images,asset),sprite=scene.children[0],s=state();
  assert.equal(scene.children.length,1);assert.ok(sprite.isSprite);assert.equal(sprite.visible,false);
  omen.update(s);assert.equal(sprite.visible,true);
  assert.deepEqual(sprite.center.toArray(),[.5,.065]);assert.deepEqual(sprite.scale.toArray(),[10,10,1]);
  assert.equal(sprite.material.map.image,images.get('madre-move'));
  assert.equal(sprite.material.map.generateMipmaps,false);assert.equal(sprite.material.map.minFilter,T.NearestFilter);
  assert.equal(sprite.material.map.offset.x,.25);
  assert.ok(Math.abs(sprite.position.y-(5.02-config.submergedDepth))<1e-9);
  const shader=shaderFor(sprite.material);assert.equal(shader.uniforms.motherWaterLevel.value,5);
  // Authored head starts around source row 17. Neck is row 65 in each 256px cell.
  const headTop=sprite.position.y+(1-config.anchorY-17/256)*sprite.scale.y;
  const neck=sprite.position.y+(1-config.anchorY-65/256)*sprite.scale.y;
  assert.ok(headTop>6.4&&headTop<6.5);assert.ok(neck<5,'dress and neck remain submerged');
  s.motherOmen.phase='hiding';s.motherOmen.hidingAge=.075;omen.update(s);
  assert.ok(sprite.position.y<5.02-config.submergedDepth);assert.equal(sprite.material.opacity,.475);
  s.motherOmen.hidingAge=.15;omen.update(s);assert.equal(sprite.visible,false);
  omen.dispose();
});

test('omen animation pauses with simulation and reuses UV, texture and material for all sightings',()=>{
  const scene=new T.Scene(),omen=createMotherOmen(T,scene,images,asset),sprite=scene.children[0];
  const texture=sprite.material.map,offset=texture.offset,repeat=texture.repeat,material=sprite.material,textureVersion=texture.version;
  const s=state();omen.update(s);const x=offset.x,y=sprite.position.y;
  s.phase='paused';for(let i=0;i<100;i++)omen.update(s);
  assert.equal(offset.x,x);assert.equal(sprite.position.y,y);assert.equal(sprite.visible,true);
  s.phase='playing';for(let i=0;i<240;i++){s.motherOmen.age=i/60;omen.update(s);}
  assert.equal(scene.children.length,1);assert.equal(sprite.material,material);assert.equal(sprite.material.map,texture);
  assert.equal(texture.offset,offset);assert.equal(texture.repeat,repeat);assert.equal(texture.version,textureVersion);
  assert.equal(material.isSpriteMaterial,true);assert.equal(sprite.castShadow,false);omen.dispose();
});

test('no cosmetic head survives missing omen, player death, map changes, clear or dispose',()=>{
  const scene=new T.Scene(),omen=createMotherOmen(T,scene,images,asset),sprite=scene.children[0];let materials=0,textures=0;
  sprite.material.addEventListener('dispose',()=>materials++);sprite.material.map.addEventListener('dispose',()=>textures++);
  for(const other of [{motherOmen:null},{phase:'dead'},{phase:'ready'},{mapId:'corona'}]){
    omen.update(state());assert.equal(sprite.visible,true);omen.update(state(other));assert.equal(sprite.visible,false);
  }
  omen.update(state());omen.clear();assert.equal(sprite.visible,false);omen.update(state());assert.equal(sprite.visible,true);
  omen.dispose();omen.dispose();omen.update(state());assert.equal(scene.children.length,0);
  assert.equal(materials,1);assert.equal(textures,1);assert.equal(sprite.visible,false);
});

test('drag cue stays at the screen edges without darkness or weapon replacement',()=>{
  const points=[],ctx={save(){},restore(){},beginPath(){},stroke(){},moveTo(x,y){points.push([x,y]);},bezierCurveTo(...p){for(let i=0;i<p.length;i+=2)points.push([p[i],p[i+1]]);}};
  assert.equal(drawMotherDrag(ctx,1000,600,{time:2,phase:'playing',motherDrag:{age:1}}),true);
  assert.ok(points.length>10);assert.ok(points.every(([x])=>x<=100||x>=900),'center 80% remains untouched');
  assert.equal(drawMotherDrag(ctx,1000,600,{phase:'dead',motherDrag:{age:1}}),false);
  assert.equal(drawMotherDrag(ctx,1000,600,{}),false);
});
