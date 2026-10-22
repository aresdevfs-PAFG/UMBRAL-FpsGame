import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/assets/vendor/three/three.module.min.js';
import {createTitanChargeVisuals,TITAN_CHARGE_VISUALS as BUDGET} from '../public/assets/js/umbral-titan-charge.mjs';

const seq={frames:8,columns:4,rows:2,fps:12};
const titan=(id=1)=>({id,boss:true,hp:6250,x:0,y:2,z:0,height:6.21,width:7.02,charge:{remaining:1}});
function fixture(enemies=[titan()]){
  const scene=new T.Scene(),visuals=createTitanChargeVisuals(T,scene,{width:1024,height:512},seq);
  const state={time:0,phase:'playing',enemies};return {scene,visuals,state,e:enemies[0]};
}
const visibleSprites=scene=>scene.children.filter(m=>m.isSprite&&m.visible);
const ribbon=scene=>scene.children.find(m=>m.isMesh&&m.visible);

test('only the charging Titan receives authored purple aura; atlas animates around visible body',()=>{
  const {scene,visuals,state,e}=fixture();delete e.charge;visuals.update(state);assert.equal(visibleSprites(scene).length,0);
  e.charge={remaining:1};visuals.update(state);const sprites=visibleSprites(scene);assert.equal(sprites.length,2);
  assert.equal(sprites[0].position.y,2+e.height*.5);assert.equal(sprites[0].scale.x,e.width*1.14);
  assert.ok(sprites[0].material.opacity<1);assert.equal(sprites[0].material.depthWrite,false);
  assert.equal(sprites[0].material.map.repeat.x,.25);assert.equal(sprites[0].material.map.repeat.y,.5);
  state.time=.5;visuals.update(state);assert.equal(sprites[0].material.map.offset.x,.5);assert.equal(sprites[0].material.map.offset.y,0);
  e.charge=null;state.time=.55;visuals.update(state);assert.equal(visibleSprites(scene).length,0);visuals.dispose();
});

test('one bounded ribbon follows the real travelled path and fades after charge ends',()=>{
  const {scene,visuals,state,e}=fixture();visuals.update(state);
  for(let i=1;i<=20;i++){state.time=i*.06;e.x=i*.7;visuals.update(state);}
  const mesh=ribbon(scene);assert.ok(mesh);assert.ok(mesh.geometry.drawRange.count<=(BUDGET.points-1)*6);
  const p=mesh.geometry.attributes.position;for(let i=0;i<mesh.geometry.drawRange.count;i++){
    assert.ok(p.getX(i)>=e.x-6&&p.getX(i)<=e.x);assert.ok(Math.abs(p.getZ(i))<=.66);assert.ok(Math.abs(p.getY(i)-2.045)<1e-5);
  }
  e.charge=null;state.time+=.05;visuals.update(state);assert.ok(mesh.visible);assert.equal(visibleSprites(scene).length,0);
  state.time+=BUDGET.trailLife;visuals.update(state);assert.equal(mesh.visible,false);visuals.dispose();
});

test('trail buffers update at most 20 Hz while aura and fading use simulation time; pause freezes',()=>{
  const {scene,visuals,state,e}=fixture();visuals.update(state);state.time=.06;e.x=.6;visuals.update(state);
  const mesh=ribbon(scene),geometryVersion=mesh.geometry.attributes.position.version,textureVersion=visibleSprites(scene)[0].material.map.version;
  state.time=.07;e.x=.7;visuals.update(state);assert.equal(mesh.geometry.attributes.position.version,geometryVersion);
  assert.equal(mesh.material.uniforms.clock.value,.07);
  state.phase='paused';const frame=visibleSprites(scene)[0].material.map.offset.clone(),clock=mesh.material.uniforms.clock.value;
  for(let i=0;i<30;i++)visuals.update(state);
  assert.ok(visibleSprites(scene)[0].material.map.offset.equals(frame));assert.equal(mesh.material.uniforms.clock.value,clock);
  assert.equal(mesh.geometry.attributes.position.version,geometryVersion);assert.equal(visibleSprites(scene)[0].material.map.version,textureVersion);visuals.dispose();
});

test('teleport, jumping, death, stun and restart never join unrelated positions with a phantom trail',()=>{
  const {scene,visuals,state,e}=fixture();visuals.update(state);state.time=.06;e.x=.6;visuals.update(state);assert.ok(ribbon(scene));
  state.time=.12;e.x=50;visuals.update(state);assert.equal(ribbon(scene),undefined);assert.equal(visibleSprites(scene).length,2);
  e.bossMotion={phase:'jump'};state.time=.18;visuals.update(state);assert.ok(scene.children.every(m=>!m.visible));e.bossMotion=null;
  e.shockStunUntil=1;visuals.update(state);assert.ok(scene.children.every(m=>!m.visible));e.shockStunUntil=0;
  e.hp=0;visuals.update(state);assert.ok(scene.children.every(m=>!m.visible));e.hp=1;
  visuals.update({...state,time:0,enemies:[titan()]});assert.equal(ribbon(scene),undefined);
  visuals.update({...state,phase:'dead'});assert.ok(scene.children.every(m=>!m.visible));visuals.dispose();
});

test('resource budget stays fixed under heavy charges, clear reuses objects, dispose frees every resource once',()=>{
  const {scene,visuals,state}=fixture(Array.from({length:10},(_,i)=>titan(i+1)));
  const objects=[...scene.children];assert.equal(objects.length,BUDGET.capacity*3);
  const resources=objects.flatMap(m=>m.isSprite?[m.material,m.material.map]:[m.material,m.geometry]);let disposed=0;
  for(const resource of resources)resource.addEventListener('dispose',()=>disposed++);
  for(let i=0;i<90;i++){state.time=i/60;for(const e of state.enemies)e.x+=.1;visuals.update(state);}
  assert.deepEqual(scene.children,objects);assert.equal(visibleSprites(scene).length,BUDGET.capacity*2);
  visuals.clear();assert.ok(objects.every(m=>!m.visible));visuals.update(state);assert.deepEqual(scene.children,objects);
  visuals.dispose();visuals.dispose();assert.equal(disposed,resources.length);assert.equal(scene.children.length,0);
});
