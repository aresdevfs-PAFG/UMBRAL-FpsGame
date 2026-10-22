import test from 'node:test';
import {createFlameVisuals} from '../public/assets/js/umbral-flames.js';
import assert from 'node:assert/strict';
import * as T from '../public/assets/vendor/three/three.module.min.js';
import {createQualityController,createPool,atlasSize} from '../public/assets/js/umbral-performance.mjs';
import {buildStaticBatches} from '../public/assets/js/umbral-static-batches.mjs';
import {createBowTrail,createBowTrailPool} from '../public/assets/js/umbral-bow-effects.js';
import {buildWorld} from '../public/assets/js/umbral-world.js';
import {getArena} from '../public/assets/js/umbral-arena.mjs';

function sample(controller,fps,seconds){let changes=0;for(let i=0;i<fps*seconds;i++)changes+=Number(controller.sample(1/fps));return changes;}
test('auto starts medium, lowers at sustained 20 FPS and recovers with hysteresis',()=>{
  const c=createQualityController();assert.equal(c.level.id,'medium');
  assert.equal(sample(c,20,6),1);assert.equal(c.level.id,'low');
  assert.equal(sample(c,60,6),0);assert.equal(c.level.id,'low');
  assert.equal(sample(c,60,25),1);assert.equal(c.level.id,'medium');
  assert.equal(sample(c,60,35),1);assert.equal(c.level.id,'high');
});
test('manual quality ignores FPS and invalid settings return to auto',()=>{
  const c=createQualityController('high');assert.equal(sample(c,20,20),0);assert.equal(c.level.id,'high');
  c.setMode('invalid');assert.equal(c.mode,'auto');assert.equal(c.level.id,'medium');
});
test('very slow but active rendering still triggers the lowest tier',()=>{
  const c=createQualityController();sample(c,3,8);assert.equal(c.level.id,'low');
});
test('pause and background gaps cannot lower quality',()=>{
  const c=createQualityController();for(let i=0;i<100;i++)c.sample(.1,false);
  c.sample(12);assert.equal(c.level.id,'medium');assert.equal(sample(c,20,2),0);
});
test('atlas reduction preserves grid boundaries and does not upscale art',()=>{
  assert.deepEqual(atlasSize(1254,1254,3,3,256),{width:768,height:768});
  assert.deepEqual(atlasSize(1536,384,4,1,384),{width:1536,height:384});
  assert.deepEqual(atlasSize(256,64,4,1,256),{width:256,height:64});
  const result=atlasSize(1536,768,4,2,256);assert.equal(result.width%4,0);assert.equal(result.height%2,0);
});
test('pool reuses resources, bounds memory and disposes overflow/free resources once',()=>{
  let created=0;const disposed=[];const pool=createPool(()=>({id:++created}),v=>disposed.push(v.id),2);
  const a=pool.take(),b=pool.take(),c=pool.take();pool.release(a);assert.equal(pool.take(),a);
  pool.release(a);pool.release(b);pool.release(c);assert.deepEqual(disposed,[3]);assert.equal(pool.size,2);
  pool.dispose();pool.dispose();assert.deepEqual(disposed,[3,1,2]);
});
test('baked batches preserve transformed vertices, UVs, normals and spatial bounds',()=>{
  const geo=new T.BoxGeometry(2,4,6),material=new T.MeshBasicMaterial();
  const matrix=new T.Matrix4().compose(new T.Vector3(5,7,9),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.7),new T.Vector3(1,2,3));
  const [mesh]=buildStaticBatches(T,new Map([['a',{geo,material,matrices:[matrix,matrix]}]]),g=>g);
  const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,uv=mesh.geometry.attributes.uv,normalMatrix=new T.Matrix3().getNormalMatrix(matrix);
  assert.equal(p.count,geo.index.count*2);
  for(let i=0;i<geo.index.count;i++){
    const index=geo.index.getX(i),expected=new T.Vector3().fromBufferAttribute(geo.attributes.position,index).applyMatrix4(matrix);
    assert.ok(expected.distanceTo(new T.Vector3().fromBufferAttribute(p,i))<1e-5);
    const expectedNormal=new T.Vector3().fromBufferAttribute(geo.attributes.normal,index).applyNormalMatrix(normalMatrix);
    assert.ok(expectedNormal.distanceTo(new T.Vector3().fromBufferAttribute(n,i))<1e-5);
    assert.equal(uv.getX(i),geo.attributes.uv.getX(index));assert.equal(uv.getY(i),geo.attributes.uv.getY(index));
    assert.ok(mesh.geometry.boundingBox.containsPoint(new T.Vector3().fromBufferAttribute(p,i)));
  }
  geo.dispose();mesh.geometry.dispose();material.dispose();
});
test('transparent surfaces keep their instanced shader contract',()=>{
  const geo=new T.PlaneGeometry(2,4),material=new T.MeshBasicMaterial({transparent:true});
  const [mesh]=buildStaticBatches(T,new Map([['a',{geo,material,matrices:[new T.Matrix4()]}]]),g=>g);
  assert.equal(mesh.isInstancedMesh,true);assert.equal(mesh.geometry,geo);
  mesh.dispose();geo.dispose();material.dispose();
});
test('reused bow/sniper trails keep endpoints, palette and new length',()=>{
  const pool=createBowTrailPool(T),event={x:0,y:2,z:0,tx:0,ty:2,tz:-20};
  const first=createBowTrail(T,event,pool);first.forEach(e=>e.release(e.mesh));
  const second=createBowTrail(T,{...event,tx:18,ty:12,tz:-45,secondary:true},pool);
  second.forEach((e,i)=>{
    assert.equal(e.mesh,first[i].mesh);assert.equal(e.mesh.scale.y,e.length);assert.ok(e.life>0);
    const end=new T.Vector3(0,.5,0);e.mesh.updateMatrix();end.applyMatrix4(e.mesh.matrix);
    assert.ok(end.distanceTo(new T.Vector3(18,12,-45))<1e-5);e.release(e.mesh);
  });
  assert.equal(second[1].mesh.material.color.getHexString(),'b04bff');pool.dispose();
});
test('all arenas build, animate at every quality and fully detach on disposal',async()=>{
  const ctx=new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const previous=globalThis.document;globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>ctx})};
  const runtime={...T,TextureLoader:class{async loadAsync(){return new T.Texture();}}};
  try{
    for(const id of ['cuenca','corona','rio']){
      const scene=new T.Scene(),world=buildWorld(runtime,scene,'',getArena(id));await world.ready;
      for(const [id,hz] of [['low',15],['medium',24],['high',30]]){world.setQuality({id,decorationHz:hz});world.update(1,1/60,{player:{x:0,y:0,z:0},portalUsed:true});}
      let count=0;scene.traverse(o=>{if(o.isMesh||o.isPoints)count++;});assert.ok(count<80,`arena ${id}: ${count} render objects`);
      world.dispose();assert.equal(scene.children.length,0);
    }
  }finally{globalThis.document=previous;}
});

test('authored fire reuses a bounded atlas and releases jets and burning enemies',()=>{
  const scene=new T.Scene(),flames=createFlameVisuals(T,scene,{width:512,height:512},{columns:2,rows:2,frames:4});
  const s={mapId:'cuenca',time:1,player:{x:0,y:0,z:14,yaw:0,pitch:0},flameRemaining:1,enemies:[{id:1,x:0,y:0,z:10,radius:.5,height:2,hp:100,burnRemaining:2}]};
  flames.update(s);assert.equal(scene.children.length,14);
  const resources=scene.children.map(o=>[o,o.material.map.version]);
  for(let i=0;i<60;i++){s.time+=1/60;flames.update(s);}
  resources.forEach(([sprite,version])=>{
    assert.ok(scene.children.includes(sprite));assert.equal(sprite.material.map.version,version);
    const uv=sprite.material.map.offset;assert.ok([0,.5].includes(uv.x)&&[0,.5].includes(uv.y));
  });
  s.flameRemaining=0;s.enemies=[];flames.update(s);assert.equal(scene.children.length,12);
  assert.ok(scene.children.every(o=>!o.visible));flames.dispose();assert.equal(scene.children.length,0);
});
