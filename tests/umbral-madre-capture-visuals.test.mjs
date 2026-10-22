import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/assets/vendor/three/three.module.min.js';
import {drawMotherCapture,motherCaptureCamera,createMotherGuardians,MOTHER_CAPTURE_VISUALS as config} from '../public/assets/js/umbral-madre-visuals.mjs';

const effects={
  'madre-screamer':{file:'screamer',frames:4,columns:4,rows:1},
  'madre-hands':{file:'hands',frames:4,columns:4,rows:1},
  'river-soul-swarm':{file:'souls',frames:8,columns:4,rows:2,fps:12.5},
};
const assets={effects},images=new Map([['screamer',{width:1024,height:256}],['hands',{width:1024,height:256}],['souls',{width:1024,height:512}]]);
const state=(extra={})=>({phase:'playing',time:3,motherCapture:{phase:'embrace',age:.4},...extra});

test('screamer shows the authored open-mouth face and two closing hands only during embrace',()=>{
  const draws=[],rotations=[],ctx={save(){},restore(){},fillRect(){},translate(){},rotate(r){rotations.push(r);},drawImage(...args){draws.push(args);}};
  assert.equal(drawMotherCapture(ctx,1200,700,state(),images,assets),true);
  assert.equal(draws.length,3);assert.equal(draws[0][0],images.get('screamer'));
  assert.equal(draws[0][1],512,'frame 2 is the open-mouth scream');
  assert.ok(draws[0][7]>700,'face exceeds view height');
  assert.equal(draws[1][0],images.get('hands'));assert.equal(draws[2][0],images.get('hands'));
  assert.equal(rotations.length,2);assert.equal(rotations[0],-rotations[1]);assert.equal(ctx.imageSmoothingEnabled,false);
  assert.equal(drawMotherCapture(ctx,1200,700,state({motherCapture:{phase:'rush',age:.2}}),images,assets),false);
  assert.equal(drawMotherCapture(ctx,1200,700,state({motherCapture:null}),images,assets),false);
  assert.equal(drawMotherCapture(ctx,1200,700,state({phase:'dead'}),images,assets),false);
  assert.equal(draws.length,3,'no extra overlay outside the embrace');
});

test('capture shake is bounded, freezes while paused, returns a reused object and vanishes on release',()=>{
  const s=state(),offset=motherCaptureCamera(s);
  for(let i=0;i<=1000;i++){
    s.motherCapture.age=i/1000;
    assert.equal(motherCaptureCamera(s),offset);
    assert.ok(Math.abs(offset.x)<=config.shakePosition);assert.ok(Math.abs(offset.y)<=config.shakePosition);
    assert.ok(Math.abs(offset.z)<=config.shakePosition);assert.ok(Math.abs(offset.roll)<=config.shakeRoll);
    assert.ok(Math.abs(offset.yaw)<=config.shakeYaw);assert.ok(Math.abs(offset.pitch)<=config.shakePitch);
    assert.ok(Object.values(offset).every(Number.isFinite));
  }
  s.motherCapture.age=.37;motherCaptureCamera(s);const values={...offset};
  s.phase='paused';assert.deepEqual(motherCaptureCamera(s),values);
  s.motherCapture.phase='rush';assert.deepEqual(motherCaptureCamera(s),{x:0,y:0,z:0,roll:0,yaw:0,pitch:0});
  s.motherCapture=null;assert.deepEqual(motherCaptureCamera(s),{x:0,y:0,z:0,roll:0,yaw:0,pitch:0});
});

function guardian(index=0,age=0){return {index,x:10,y:6,z:20,from:{x:13,y:5.1,z:21},target:{x:10,y:6,z:20},radius:.32,hp:0,phase:age<.09?'intercept':'shatter',age};}
function boss(guardians=[]){return {kind:'madre',hp:12000,waterState:'submerged',motherGuardians:guardians};}
const shaderFor=material=>{const shader={uniforms:{},vertexShader:T.ShaderLib.sprite.vertexShader,fragmentShader:T.ShaderLib.sprite.fragmentShader};material.onBeforeCompile(shader);return shader;};

test('head remains completely unobstructed at idle and exactly one skull arrives for one blocked shot',()=>{
  const scene=new T.Scene(),renderer=createMotherGuardians(T,scene,images,assets),e=boss(),s=state({motherCapture:null,enemies:[e]});
  assert.equal(scene.children.length,8);renderer.update(s);assert.ok(scene.children.every(sprite=>!sprite.visible));
  const g=guardian();e.motherGuardians.push(g);renderer.update(s);
  const sprite=scene.children[0];assert.equal(scene.children.filter(sprite=>sprite.visible).length,1);
  assert.deepEqual(sprite.position.toArray(),[13,5.1,21]);assert.equal(g.hp,0,'logical hit consumes skull before its visual playback');
  g.age=.045;renderer.update(s);assert.ok(sprite.position.x>10&&sprite.position.x<13);assert.ok(sprite.position.y>5.1&&sprite.position.y<6.2);
  g.age=.09;g.phase='shatter';renderer.update(s);assert.deepEqual(sprite.position.toArray(),[10,6,20]);
  assert.equal(sprite.scale.x*config.guardianSkullFraction,g.radius*2);
  assert.equal(sprite.material.map.image,images.get('souls'));assert.deepEqual(sprite.center.toArray(),[.53,.35]);
  g.age=.19;renderer.update(s);assert.ok(sprite.material.opacity>.49&&sprite.material.opacity<.51);assert.ok(sprite.scale.x*.54>.64);
  const shader=shaderFor(sprite.material);assert.ok(shader.uniforms.guardianBreak.value>.49&&shader.uniforms.guardianBreak.value<.51);
  assert.match(shader.fragmentShader,/diffuseColor.a \*= step\(guardianBreak, guardianDust\)/);
  g.age=.29;renderer.update(s);assert.equal(sprite.visible,false);e.motherGuardians.length=0;renderer.update(s);assert.ok(scene.children.every(sprite=>!sprite.visible));
  renderer.dispose();
});

test('rapid fire shows only active brief interceptions and reuses atlas, materials and shader uniforms',()=>{
  const scene=new T.Scene(),renderer=createMotherGuardians(T,scene,images,assets);
  const e=boss([guardian(0,.25),guardian(1,.15),guardian(2,.05)]),s=state({motherCapture:null,enemies:[e]});
  const maps=scene.children.map(sprite=>sprite.material.map),versions=maps.map(map=>map.version),materials=scene.children.map(sprite=>sprite.material),materialVersions=materials.map(material=>material.version);
  renderer.update(s);assert.equal(scene.children.filter(sprite=>sprite.visible).length,3);
  const sprite=scene.children[1],shader=shaderFor(sprite.material),uniform=shader.uniforms.guardianBreak;
  const x=sprite.position.x,frame=maps[1].offset.x,opacity=sprite.material.opacity;
  s.phase='paused';for(let i=0;i<100;i++)renderer.update(s);
  assert.equal(sprite.position.x,x);assert.equal(maps[1].offset.x,frame);assert.equal(sprite.material.opacity,opacity);
  s.phase='playing';for(let i=0;i<240;i++){
    e.motherGuardians[1].age=(i%29)/100;e.motherGuardians[1].phase=i%29<9?'intercept':'shatter';renderer.update(s);
  }
  assert.equal(shader.uniforms.guardianBreak,uniform);assert.equal(scene.children.length,8);
  scene.children.forEach((sprite,i)=>{
    assert.equal(sprite.material,materials[i]);assert.equal(sprite.material.version,materialVersions[i]);
    assert.equal(sprite.material.map,maps[i]);assert.equal(maps[i].version,versions[i]);
    assert.equal(maps[i].source,maps[0].source);assert.equal(maps[i].minFilter,T.NearestFilter);assert.equal(maps[i].generateMipmaps,false);
  });
  renderer.dispose();
});

test('no interception remains during capture, emergence, boss death, idle or teardown',()=>{
  const scene=new T.Scene(),renderer=createMotherGuardians(T,scene,images,assets),e=boss([guardian()]),s=state({motherCapture:null,enemies:[e]});
  let materials=0,maps=0;
  scene.children.forEach(sprite=>{sprite.material.addEventListener('dispose',()=>materials++);sprite.material.map.addEventListener('dispose',()=>maps++);});
  renderer.update(s);assert.equal(scene.children[0].visible,true);
  s.motherCapture={phase:'rush',age:0};renderer.update(s);assert.ok(scene.children.every(sprite=>!sprite.visible));
  s.motherCapture=null;e.waterState='rising';renderer.update(s);assert.ok(scene.children.every(sprite=>!sprite.visible));
  e.waterState='submerged';e.hp=0;renderer.update(s);assert.ok(scene.children.every(sprite=>!sprite.visible));
  e.hp=100;renderer.update(s);assert.equal(scene.children.filter(sprite=>sprite.visible).length,1);
  renderer.clear();assert.ok(scene.children.every(sprite=>!sprite.visible));
  renderer.dispose();renderer.dispose();renderer.update(s);
  assert.equal(scene.children.length,0);assert.equal(materials,8);assert.equal(maps,8);
});
