import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/assets/vendor/three/three.module.min.js';
import {createFireWaveVisuals,FIRE_WAVE} from '../public/assets/js/umbral-fire-wave.mjs';
import {installEnemyVariantTint} from '../public/assets/js/umbral-variant-visuals.mjs';

const seq={columns:2,rows:2,frames:4};
const hazard=(id,overrides={})=>({id,kind:'ground-shockwave',flameWave:true,x:3,y:2,z:-5,age:1,warning:.5,duration:2,radius:4.8,...overrides});
const state=(hazards,time=1)=>({hazards,time});

test('fire waves rise above the floor at the actual hazard radius and do not show during warning',()=>{
  const scene=new T.Scene(),waves=createFireWaveVisuals(T,scene,{width:512,height:512},seq);
  waves.update(state([hazard(1,{age:.2})]));assert.equal(scene.children.filter(m=>m.visible).length,0);
  waves.update(state([hazard(1)]));const mesh=scene.children.find(m=>m.visible);
  assert.ok(mesh.isMesh&&!mesh.isSprite);assert.equal(mesh.position.x,3);assert.equal(mesh.position.y,2.02);assert.equal(mesh.position.z,-5);
  assert.equal(mesh.scale.x,4.8);assert.equal(mesh.scale.z,4.8);assert.equal(mesh.scale.y,FIRE_WAVE.height);
  const vertices=mesh.geometry.attributes.position;
  let top=0,bottom=Infinity;
  for(let i=0;i<vertices.count;i++){
    const y=vertices.getY(i);top=Math.max(top,y);bottom=Math.min(bottom,y);
    assert.ok(Math.abs(Math.hypot(vertices.getX(i),vertices.getZ(i))-1)<1e-6);
  }
  assert.equal(bottom,0);assert.equal(top,1);waves.dispose();
});

test('neighboring flame panels overlap enough to cover transparent atlas margins',()=>{
  const scene=new T.Scene(),waves=createFireWaveVisuals(T,scene,{width:512,height:512},seq);
  const positions=scene.children[0].geometry.attributes.position;
  const angle=i=>Math.atan2(positions.getZ(i),positions.getX(i));
  const span=angle(1)-angle(0),spacing=angle(6)-angle(0);
  assert.ok(span>spacing*2.9&&span<spacing*3.1);
  assert.ok(FIRE_WAVE.height>=1&&FIRE_WAVE.height<=1.1);
  waves.dispose();
});

test('heavy combat keeps one mesh per wave, a fixed budget, shared resources and no texture uploads',()=>{
  const scene=new T.Scene(),waves=createFireWaveVisuals(T,scene,{width:512,height:512},seq);
  const hazards=Array.from({length:12},(_,i)=>hazard(i));waves.update(state(hazards));
  assert.equal(scene.children.length,FIRE_WAVE.capacity);assert.equal(scene.children.filter(m=>m.visible).length,FIRE_WAVE.capacity);
  const objects=[...scene.children],geometry=objects[0].geometry,texture=objects[0].material.uniforms.map.value,version=texture.version;
  assert.ok(objects.every(m=>m.geometry===geometry&&m.material.uniforms.map.value===texture));
  for(let i=0;i<120;i++){
    waves.update(state(hazards,1+i/60));
    assert.deepEqual(scene.children,objects);assert.equal(texture.version,version);
  }
  assert.equal(objects[0].material.uniforms.frame.value,Math.floor((1+119/60)*12));
  waves.update(state([]));assert.ok(objects.every(m=>!m.visible));
  waves.update(state([hazard(99)]));assert.equal(scene.children.find(m=>m.visible),objects[0]);
  waves.clear();assert.ok(objects.every(m=>!m.visible));waves.dispose();assert.equal(scene.children.length,0);
});

test('wave ending fades naturally, pause holds the same frame and disposal releases each resource once',()=>{
  const scene=new T.Scene(),waves=createFireWaveVisuals(T,scene,{width:512,height:512},seq);
  const resources=[...scene.children],geometry=resources[0].geometry,texture=resources[0].material.uniforms.map.value;
  let geometries=0,textures=0,materials=0;geometry.addEventListener('dispose',()=>geometries++);texture.addEventListener('dispose',()=>textures++);
  resources.forEach(m=>m.material.addEventListener('dispose',()=>materials++));
  const h=hazard(1,{age:2.45});waves.update(state([h],3));const mesh=resources.find(m=>m.visible);
  const before=mesh.material.uniforms.opacity.value;assert.ok(before>0&&before<.2);
  const frame=mesh.material.uniforms.frame.value;for(let i=0;i<10;i++)waves.update(state([h],3));assert.equal(mesh.material.uniforms.frame.value,frame);
  waves.update(state([hazard(1,{age:2.5})],3));assert.ok(resources.every(m=>!m.visible));
  waves.dispose();waves.dispose();assert.equal(geometries,1);assert.equal(textures,1);assert.equal(materials,FIRE_WAVE.capacity);
});

test('variant colors share one shader program without replacing the atlas, alpha or state tint',()=>{
  const map=new T.Texture(),a=new T.SpriteMaterial({map,color:'#b6eadd',opacity:.7,alphaTest:.12}),b=new T.SpriteMaterial({map});
  const stateColor=a.color.clone();installEnemyVariantTint(T,a,'#9fcf5a');installEnemyVariantTint(T,b,'#bb79e8');
  assert.equal(a.map,map);assert.ok(a.color.equals(stateColor));assert.equal(a.opacity,.7);assert.equal(a.alphaTest,.12);
  assert.equal(a.customProgramCacheKey(),b.customProgramCacheKey());
  const shader=()=>({uniforms:{},fragmentShader:'#include <common>\n#include <map_fragment>'}),as=shader(),bs=shader();
  a.onBeforeCompile(as);b.onBeforeCompile(bs);
  assert.equal(as.fragmentShader,bs.fragmentShader);assert.notEqual(as.uniforms.umbralVariantTint.value.getHexString(),bs.uniforms.umbralVariantTint.value.getHexString());
  assert.ok(as.fragmentShader.includes('diffuseColor *= sampledDiffuseColor;'));
  assert.ok(!as.fragmentShader.includes('sampledDiffuseColor.a='));
  a.dispose();b.dispose();map.dispose();
});
