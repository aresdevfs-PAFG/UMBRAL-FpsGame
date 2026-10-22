import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/assets/vendor/three/three.module.min.js';
import {createState,createEnemy,fire} from '../public/assets/js/umbral-core.mjs';
import {lastEnemyTargets,createEnemyFeedback} from '../public/assets/js/umbral-enemy-feedback.mjs';

function state(){return {phase:'playing',time:1,portalUsed:true,wave:1,pending:0,spawnWarnings:[],enemies:[1,2,3].map(id=>({id,hp:10,x:id,y:0,z:-8,height:2}))};}
test('only the last three live enemies after all scheduled spawns are marked',()=>{
  const s=state();assert.equal(lastEnemyTargets(s).length,3);
  s.pending=1;assert.deepEqual(lastEnemyTargets(s),[]);s.pending=0;s.spawnWarnings=[{}];assert.deepEqual(lastEnemyTargets(s),[]);
  s.spawnWarnings=[];s.enemies.push({id:4,hp:1});assert.deepEqual(lastEnemyTargets(s),[]);
  s.enemies[0].hp=0;assert.deepEqual(lastEnemyTargets(s).map(e=>e.id),[2,3,4]);
  s.portalUsed=false;assert.deepEqual(lastEnemyTargets(s),[]);
});
test('knife and shots emit identified impact events only on actual hits',()=>{
  for(const selected of [0,1,2,3,4,5]){
    const s=createState();Object.assign(s,{phase:'playing',portalUsed:true,selected});Object.assign(s.player,{x:0,y:0,z:24,yaw:0,pitch:0});
    fire(s);assert.equal(s.events.filter(e=>e.type==='hit').length,0);
    s.cooldown=0;s.shotgunRecoilRemaining=0;s.shotgunCycleRemaining=0;s.bowRecoveryRemaining=0;
    const enemy=createEnemy(s,'macabro',{x:0,y:0,z:22});enemy.hp=10000;
    fire(s);const events=s.events.filter(e=>e.type==='hit');assert.ok(events.length>0,`weapon ${selected}`);
    assert.ok(events.every(e=>e.id===enemy.id&&!e.dead));
  }
});
test('feedback coalesces pellet hits, pauses, removes dead markers, resets and disposes shared textures',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({beginPath(){},moveTo(){},lineTo(){},stroke(){}})})};
  try{
    const scene=new T.Scene(),classes=new Set(),crosshair={classList:{toggle(k,on){on?classes.add(k):classes.delete(k);},remove(...ks){ks.forEach(k=>classes.delete(k));}}};
    const feedback=createEnemyFeedback(T,scene,crosshair),s=state();feedback.update(s);assert.equal(scene.children.length,3);
    assert.ok(scene.children.every(m=>m.material.depthTest===false&&m.scale.x===.085));
    feedback.hit({id:1,source:'weapon',x:1,y:1,z:-8,dead:false},1);
    feedback.hit({id:1,source:'weapon',x:1,y:1,z:-8,dead:true},1.02);
    feedback.update(s);assert.equal(scene.children.length,4);assert.ok(classes.has('hit')&&classes.has('kill'));
    s.phase='paused';feedback.update(s);assert.ok(scene.children.every(m=>!m.visible));assert.ok(!classes.has('hit'));
    s.phase='playing';s.time=1.3;s.enemies[0].hp=0;feedback.update(s);assert.equal(scene.children.length,2);assert.ok(!classes.has('hit'));
    feedback.hit({id:2,source:'burn',dead:true},s.time);assert.equal(scene.children.length,2);
    const map=scene.children[0].material.map;let disposed=false;map.addEventListener('dispose',()=>{disposed=true;});
    feedback.clear();assert.equal(scene.children.length,0);feedback.dispose();assert.equal(disposed,true);
  }finally{globalThis.document=previous;}
});
