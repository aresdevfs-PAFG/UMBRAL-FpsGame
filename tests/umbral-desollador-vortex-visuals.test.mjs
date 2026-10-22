import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/assets/vendor/three/three.module.min.js';
import {createDesolladorVortex,DESOLLADOR_VORTEX_VISUALS as config} from '../public/assets/js/umbral-desollador-vortex.mjs';
import {DESOLLADOR} from '../public/assets/js/umbral-desollador.mjs';

const boss=(extra={})=>({id:10,kind:'desollador',hp:10000,x:0,y:7,z:0,height:DESOLLADOR.height,windSuction:{age:1,phase:'pull'},...extra});
const state=(enemy,time=3,phase='playing')=>({time,phase,enemies:enemy?[enemy]:[]});

test('3D wind spans the floor, arena track and airborne orbit in one narrow-ribbon mesh',()=>{
  const scene=new T.Scene(),wind=createDesolladorVortex(T,scene);
  wind.update(state(boss()),'high');assert.equal(scene.children.length,1);
  const mesh=scene.children[0],p=mesh.geometry.attributes.position,flow=mesh.geometry.attributes.windFlow;
  assert.ok(mesh.isMesh&&!mesh.isSprite);assert.ok(mesh.visible);assert.equal(mesh.material.depthWrite,false);
  assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.blending,T.AdditiveBlending);
  assert.equal(mesh.material.lights,false);assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);
  let floorRadius=0,orbitRadius=0,mainMin=Infinity,mainMax=-Infinity;
  for(let i=0;i<p.count;i++){
    assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
    const r=Math.hypot(p.getX(i),p.getZ(i));
    if(flow.getX(i)===0){floorRadius=Math.max(floorRadius,r);mainMin=Math.min(mainMin,p.getY(i));mainMax=Math.max(mainMax,p.getY(i));}
    else orbitRadius=Math.max(orbitRadius,r);
    assert.ok(Math.abs(flow.getZ(i))<.7,'each ribbon stays thin for visibility and fill-rate');
  }
  assert.ok(floorRadius>=37.99&&floorRadius<=38.01);assert.ok(orbitRadius>=27.99&&orbitRadius<=28.01);
  assert.equal(mainMin,0);assert.equal(mainMax,1);assert.equal(mesh.material.uniforms.eyeY.value,7+DESOLLADOR.vortexEyeHeight);
  assert.ok(p.count<7000);assert.equal(mesh.geometry.groups.length,0);wind.dispose();
});

test('quality selects complete wind lanes without allocating or uploading new geometry',()=>{
  const scene=new T.Scene(),wind=createDesolladorVortex(T,scene),e=boss();
  const mesh=scene.children[0],geometry=mesh.geometry,material=mesh.material,position=geometry.attributes.position;
  const data=position.array,version=position.version,perLane=(config.segments+config.orbitSegments)*6;
  for(const [quality,lanes] of [['high',7],['medium',5],['low',3]]){
    wind.update(state(e),{id:quality});assert.equal(geometry.drawRange.count,lanes*perLane);
    for(let i=0;i<240;i++)wind.update(state(e,3+i/60),quality);
    assert.equal(scene.children.length,1);assert.equal(scene.children[0],mesh);
    assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(position.array,data);assert.equal(position.version,version);
  }
  assert.equal(Object.values(material.uniforms).some(u=>u.value?.isTexture),false);wind.dispose();
});

test('wind starts over the void during boss travel, freezes with the simulation and supports every attack phase',()=>{
  const scene=new T.Scene(),wind=createDesolladorVortex(T,scene),mesh=scene.children[0];
  const travelling=boss({x:20,y:14,z:21,windSuction:null,vortexTravel:{age:.1,duration:1.6,path:[{x:20,y:14,z:21},{x:0,y:7,z:0}]}});
  wind.update(state(travelling));assert.deepEqual(mesh.position.toArray(),[0,0,0]);assert.equal(mesh.material.uniforms.eyeY.value,7+DESOLLADOR.vortexEyeHeight);
  const opacity=mesh.material.uniforms.opacity.value;assert.ok(opacity>.1&&opacity<.3);
  for(const phase of ['lift','pull','strike','combo']){
    wind.update(state(boss({windSuction:{age:2,phase}}),8));assert.ok(mesh.visible);
    assert.equal(mesh.material.uniforms.combo.value,phase==='combo'?1:0);
    wind.update(state(boss({windSuction:{age:2,phase}}),8,'paused'));
    assert.equal(mesh.material.uniforms.clock.value,8);assert.ok(mesh.visible);
  }
  wind.dispose();
});

test('interrupt, death, restart and disposal cannot leave a tornado behind',()=>{
  const scene=new T.Scene(),wind=createDesolladorVortex(T,scene),mesh=scene.children[0];
  let geometries=0,materials=0;
  mesh.geometry.addEventListener('dispose',()=>geometries++);mesh.material.addEventListener('dispose',()=>materials++);
  for(const e of [boss({windSuction:null}),boss({hp:0}),boss({shockStunUntil:20}),null]){
    wind.update(state(boss()));assert.ok(mesh.visible);wind.update(state(e));assert.equal(mesh.visible,false);
  }
  wind.update(state(boss()));wind.update(state(boss(),4,'dead'));assert.equal(mesh.visible,false);
  wind.update(state(boss(),.1));assert.ok(mesh.visible);assert.equal(mesh.material.uniforms.clock.value,.1);
  wind.clear();assert.equal(mesh.visible,false);wind.update(state(boss()));assert.ok(mesh.visible);
  wind.dispose();wind.dispose();wind.update(state(boss()));assert.equal(scene.children.length,0);
  assert.equal(geometries,1);assert.equal(materials,1);assert.equal(mesh.visible,false);
});
