import test from 'node:test';
import assert from 'node:assert/strict';
import {loadArsenalAudio,ARSENAL_SAMPLES} from '../public/assets/js/umbral-arsenal-audio.mjs';

async function fixture(fn,missing){
  const previous=globalThis.fetch,sources=[],buffers=[];
  globalThis.fetch=async url=>({ok:!url.includes(missing||'NO_MISSING'),arrayBuffer:async()=>new TextEncoder().encode(url).buffer});
  const param=value=>({value,setTargetAtTime(value){this.value=value;}});
  const context={destination:{},currentTime:0,createGain:()=>({gain:param(1),connect(output){this.output=output;},disconnect(){}}),
    createStereoPanner:()=>({pan:param(0),connect(){},disconnect(){}}),
    decodeAudioData:async data=>{const b={name:new TextDecoder().decode(data),duration:1,length:100,sampleRate:100,numberOfChannels:1,getChannelData:()=>new Float32Array(100).fill(.5)};buffers.push(b);return b;},
    createBufferSource(){const voice={playbackRate:{value:1},connect(output){this.output=output;},disconnect(){},start(...args){this.args=args;},stop(){this.stopped=true;this.onended?.();}};sources.push(voice);return voice;}};
  try{const audio=await loadArsenalAudio(context);await fn(audio,sources,buffers);}finally{globalThis.fetch=previous;}
}
const state=()=>({phase:'playing',time:1,flameRemaining:0,player:{x:0,z:0}});

test('SMG has one shot per trigger and two quieter staggered voices for dual fire, all cancel on pause',()=>fixture((audio,sources)=>{
 const s=state();audio.event({type:'shot',index:3},s);assert.equal(sources.length,1);
 const single=sources[0];assert.ok(single.buffer.name.endsWith('espinario.mp3?v=2'));
 audio.event({type:'shot',index:3,dual:true},s);assert.equal(sources.length,3);
 const [left,right]=sources.slice(1);
 assert.equal(left.args[0],0);assert.equal(right.args[0],.032);
 assert.ok(left.output.gain.value<single.output.gain.value);
 assert.ok(right.output.gain.value<single.output.gain.value);
 assert.equal(left.output.output.pan.value,-.24);assert.equal(right.output.output.pan.value,.24);
 s.phase='paused';audio.sync(s);assert.ok(sources.every(v=>v.stopped),'even scheduled right-hand fire must stop');
 audio.dispose();
}));
test('weapon samples distinguish charged melee explosions from normal melee tears; knife stays silent',()=>fixture((audio,sources,buffers)=>{
  const s=state();assert.equal(buffers.length,ARSENAL_SAMPLES.length);
  for(const index of [0,5,2,4,3])audio.event({type:'shot',index},s);
  assert.deepEqual(sources.map(x=>x.buffer.name.split('/').pop()),['gauss.mp3','rifle.mp3','bow-fire.mp3','espinario.mp3?v=2']);
  audio.event({type:'shot',index:4,secondary:true},s);assert.ok(sources.at(-1).buffer.name.endsWith('bow-void.mp3'));
  audio.event({type:'shot',index:5,secondary:true},s);assert.equal(sources.at(-1).playbackRate.value,.86);
  const before=sources.length;
  for(const e of [{type:'shot',index:1},{type:'macuahuitlMiss'},{type:'hit',source:'burn'},{type:'hit',source:'weapon'}])audio.event(e,s);
  assert.equal(sources.length,before);
  audio.event({type:'hit',source:'knife'},s);audio.event({type:'hit',source:'knife'},s);
  assert.equal(sources.length,before,'knife impact stays silent');
  audio.event({type:'macuahuitl'},s);assert.ok(sources.at(-1).buffer.name.endsWith('macuahuitl-swing.mp3'));
  audio.event({type:'macuahuitlImpact'},s);assert.ok(sources.at(-1).buffer.name.endsWith('explosion.mp3'));
  const explosion=sources.at(-1).buffer;audio.event({type:'bowExplosion',x:0,z:0},s);assert.equal(sources.at(-1).buffer,explosion);
  audio.event({type:'bossHammer'},s);assert.equal(sources.at(-1).buffer,explosion);
  const meleeStart=sources.length;
  audio.event({type:'macuahuitlMeleeImpact'},s);assert.equal(sources.length,meleeStart+1);
  assert.ok(sources.at(-1).buffer.name.endsWith('macuahuitl-melee-hit.mp3'));
  assert.notEqual(sources.at(-1).buffer,explosion);
  audio.event({type:'macuahuitlMiss'},s);audio.event({type:'hit',source:'macuahuitlMelee'},s);
  assert.equal(sources.length,meleeStart+1,'only a confirmed melee impact plays the tearing sample once');
  audio.event({type:'macuahuitlMeleeImpact'},s,false);s.phase='paused';audio.event({type:'macuahuitlMeleeImpact'},s);
  assert.equal(sources.length,meleeStart+1,'mute and pause also suppress normal melee audio');
  audio.dispose();
}));
test('bounded polyphony, mute, pause, restart and disposal stop all playing samples',()=>fixture((audio,sources)=>{
  const s=state();for(let i=0;i<50;i++)audio.event({type:'shot',index:2},s);
  assert.equal(sources.filter(v=>!v.stopped).length,16);
  audio.sync(s,false);assert.ok(sources.every(v=>v.stopped));
  const count=sources.length;audio.event({type:'shot',index:2},s,false);s.phase='paused';audio.event({type:'shot',index:2},s);assert.equal(sources.length,count);
  s.phase='playing';audio.event({type:'shot',index:2},s);audio.sync({...s,phase:'dead'});assert.ok(sources.every(v=>v.stopped));
  audio.event({type:'shot',index:5},s);audio.stop();assert.ok(sources.every(v=>v.stopped));audio.dispose();audio.event({type:'shot',index:2},s);assert.ok(sources.every(v=>v.stopped));
}));
test('flames follow the one-second simulation burst and resume at their offset without retriggering ignition',()=>fixture((audio,sources)=>{
  const s=state();s.flameRemaining=1;audio.sync(s);audio.sync(s);assert.equal(sources.length,1);
  s.flameRemaining=.7;audio.sync(s);assert.equal(sources.length,1);
  s.phase='paused';audio.sync(s);assert.ok(sources[0].stopped);
  s.phase='playing';audio.sync(s);assert.ok(Math.abs(sources[1].args[1]-.3)<1e-7);
  sources[1].onended();s.flameRemaining=.001;audio.sync(s);assert.equal(sources.length,2);
  s.flameRemaining=0;audio.sync(s);s.flameRemaining=1;audio.sync(s);assert.equal(sources.length,3);
  audio.sync(s,false);assert.ok(sources.at(-1).stopped);audio.dispose();
}));
test('one failed sample does not prevent the other weapons from playing',()=>fixture((audio,sources)=>{
  assert.deepEqual(audio.missing,['gauss']);audio.event({type:'shot',index:5},state());assert.equal(sources.length,0);
  audio.event({type:'shot',index:2},state());assert.equal(sources.length,1);audio.dispose();
},'gauss.mp3'));

test('scoped rifle plays its dedicated sniper sample, normal rifle keeps its own sound',()=>fixture((audio,sources)=>{
 const s=state();audio.event({type:'shot',index:2,scoped:true,secondary:true},s);
 assert.ok(sources.at(-1).buffer.name.endsWith('/sniper.mp3'));
 audio.event({type:'shot',index:2,scoped:false},s);assert.ok(sources.at(-1).buffer.name.endsWith('/rifle.mp3'));
}));

const burningEnemy=(values={})=>({id:1,x:0,y:0,z:-3,height:2,hp:100,burnRemaining:3,arrowBurnRemaining:0,deadTime:0,...values});
test('burning continues after the hand jet ends, with one loop for the entire horde and protected audio voices',()=>fixture((audio,sources)=>{
  const s=state();s.flameRemaining=1;s.enemies=Array.from({length:20},(_,id)=>burningEnemy({id}));
  audio.sync(s);assert.equal(sources.length,2);
  const [jet,fire]=sources;assert.ok(jet.buffer.name.includes('flames.mp3'));assert.equal(jet.playbackRate.value,1);
  assert.ok(fire.buffer.name.endsWith('enemy-burning.mp3'));assert.equal(fire.loop,true);
  for(let i=0;i<600;i++)audio.sync(s);
  assert.equal(sources.length,2,'frame updates must reuse the decoded loop, not spawn voices');
  assert.ok(fire.output.gain.value<=.85*1.6,'a crowded horde cannot multiply fire volume without a limit');
  for(let i=0;i<40;i++)audio.event({type:'shot',index:3},s);
  assert.equal(sources.filter(v=>!v.stopped).length,16);assert.ok(!jet.stopped&&!fire.stopped);
  s.flameRemaining=0;audio.sync(s);assert.ok(jet.stopped);assert.ok(!fire.stopped);
  s.enemies=[];audio.sync(s);assert.ok(fire.stopped);audio.dispose();
}));

test('fire follows distance, elevation and camera direction and falls silent beyond hearing range',()=>fixture((audio,sources)=>{
  const s=state(),e=burningEnemy({x:-3,z:0});s.enemies=[e];audio.sync(s);
  const fire=sources[0],near=fire.output.gain.value,panner=fire.output.output;
  assert.ok(panner.pan.value<-.9);e.x=3;audio.sync(s);assert.ok(panner.pan.value>.9);
  s.player.yaw=Math.PI;audio.sync(s);assert.ok(panner.pan.value<-.9);
  e.x=20;audio.sync(s);assert.ok(fire.output.gain.value<near*.2);
  e.x=3;e.y=20;audio.sync(s);assert.ok(fire.output.gain.value<near*.2);
  e.x=33;audio.sync(s);assert.ok(fire.stopped);
  e.x=3;e.y=0;audio.sync(s);assert.equal(sources.length,2);audio.dispose();
}));

test('audible burning matches visible fire, including fire arrows and the short corpse fade, never old flame marks',()=>fixture((audio,sources)=>{
  const s=state(),e=burningEnemy({burnRemaining:0,flameMarked:true});s.enemies=[e];audio.sync(s);
  assert.equal(sources.length,0,'ammo eligibility alone is not an active fire');
  e.arrowBurnRemaining=2;audio.sync(s);const fire=sources[0],alive=fire.output.gain.value;
  assert.equal(fire.loop,true);e.hp=0;e.deadTime=.4;audio.sync(s);assert.ok(fire.output.gain.value<alive*.5);
  e.deadTime=.65;audio.sync(s);assert.ok(fire.stopped);
  e.hp=100;e.arrowBurnRemaining=0;e.burnRemaining=1;audio.sync(s);assert.equal(sources.length,2);
  e.burnRemaining=0;audio.sync(s);assert.ok(sources[1].stopped);audio.dispose();
}));

test('burn loops respect pause, mute, death, retry and disposal, resuming at the simulation offset',()=>fixture((audio,sources)=>{
  const s=state();s.enemies=[burningEnemy()];s.time=2.3;audio.sync(s);
  const first=sources[0];s.phase='paused';audio.sync(s);assert.ok(first.stopped);
  s.phase='playing';audio.sync(s);assert.ok(Math.abs(sources.at(-1).args[1]-.3)<1e-7);
  audio.sync(s,false);assert.ok(sources.every(v=>v.stopped));audio.sync(s);assert.ok(!sources.at(-1).stopped);
  s.phase='dead';audio.sync(s);assert.ok(sources.every(v=>v.stopped));s.phase='playing';audio.sync(s);
  audio.stop();assert.ok(sources.every(v=>v.stopped));s.enemies=[];const count=sources.length;audio.sync(s);assert.equal(sources.length,count);
  s.enemies=[burningEnemy()];audio.sync(s);audio.dispose();audio.sync(s);assert.ok(sources.every(v=>v.stopped));
}));

test('a missing burn loop cannot silence the jet or other weapons',()=>fixture((audio,sources)=>{
  const s=state();s.enemies=[burningEnemy()];s.flameRemaining=1;audio.sync(s);audio.event({type:'shot',index:2},s);
  assert.deepEqual(audio.missing,['enemy-burning']);assert.equal(sources.length,2);audio.dispose();
},'enemy-burning.mp3'));

const groundFireWave=(values={})=>({id:2,owner:10,kind:'ground-shockwave',flameWave:true,x:3,y:0,z:0,age:.95,warning:.85,duration:2,radius:1.2,...values});
test('ground fire waves stay silent during warning and share the burning loop after eruption',()=>fixture((audio,sources)=>{
  const s=state(),h=groundFireWave({age:.5});s.hazards=[h];audio.sync(s);
  audio.event({type:'groundFireWave',id:h.id},s);assert.equal(sources.length,0,'a warning cannot ignite fire audio');
  h.age=.95;audio.event({type:'groundFireWave',id:h.id},s);assert.equal(sources.length,1);
  const fire=sources[0];assert.ok(fire.buffer.name.endsWith('enemy-burning.mp3'));assert.equal(fire.loop,true);
  s.enemies=Array.from({length:20},(_,id)=>burningEnemy({id}));s.hazards.push(groundFireWave({id:3,x:-4}));
  for(let i=0;i<600;i++){audio.sync(s);audio.event({type:'groundFireWave',id:h.id},s);}
  assert.equal(sources.length,1,'burns, concurrent waves and repeated events reuse one sound bed');
  assert.ok(fire.output.gain.value<=.85*1.6,'combined fires retain the volume cap');
  h.age=h.warning+h.duration;s.hazards[1].age=3;audio.sync(s);assert.ok(!fire.stopped,'burning enemies still supply fire');
  s.enemies=[];audio.sync(s);assert.ok(fire.stopped);audio.dispose();
}));

test('ground fire is spatialized at its expanding edge, including camera yaw and height',()=>fixture((audio,sources)=>{
  const s=state(),h=groundFireWave({x:40,radius:1});s.hazards=[h];audio.sync(s);
  assert.equal(sources.length,0,'an origin and edge outside hearing range are silent');
  h.radius=37;audio.sync(s);const fire=sources[0],near=fire.output.gain.value,panner=fire.output.output;
  assert.ok(panner.pan.value>.9,'the approaching edge is to the right');
  s.player.yaw=Math.PI;audio.sync(s);assert.ok(panner.pan.value<-.9,'panning follows a turned camera');
  h.radius=43;audio.sync(s);assert.ok(panner.pan.value>.9,'the wave moves through and past the player');
  h.y=20;audio.sync(s);assert.ok(fire.output.gain.value<near*.2,'flames far above the player are quieter');
  h.y=0;h.x=0;h.radius=40;audio.sync(s);assert.ok(fire.stopped,'the edge is distant even when its origin is under the player');
  audio.dispose();
}));

test('ground fire expires without replay and obeys pause, mute, death, retry and disposal',()=>fixture((audio,sources)=>{
  const s=state(),h=groundFireWave();s.hazards=[h];s.time=2.3;audio.sync(s);
  const first=sources[0];s.phase='paused';audio.sync(s);assert.ok(first.stopped);
  s.phase='playing';audio.sync(s);assert.ok(Math.abs(sources.at(-1).args[1]-.3)<1e-7);
  audio.sync(s,false);assert.ok(sources.every(v=>v.stopped));audio.sync(s);assert.ok(!sources.at(-1).stopped);
  s.phase='dead';audio.sync(s);assert.ok(sources.every(v=>v.stopped));
  s.phase='playing';audio.sync(s);const last=sources.at(-1);h.age=h.warning+h.duration;audio.sync(s);assert.ok(last.stopped);
  const count=sources.length;audio.event({type:'groundFireWave',id:h.id},s);audio.sync(s);assert.equal(sources.length,count,'expired waves never restart');
  h.age=.95;audio.sync(s);const retried=state();audio.sync(retried);assert.ok(sources.every(v=>v.stopped),'a new state stops the previous arena fire');
  retried.hazards=[groundFireWave()];audio.sync(retried);audio.dispose();audio.sync(retried);assert.ok(sources.every(v=>v.stopped));
}));

test('shockwaves without visible flames and interrupted warnings do not supply fire audio',()=>fixture((audio,sources)=>{
  const s=state();s.hazards=[groundFireWave({flameWave:false}),groundFireWave({kind:'obsidian-spikes'})];audio.sync(s);
  assert.equal(sources.length,0);
  s.hazards=[groundFireWave({age:.4})];audio.sync(s);s.hazards=[];audio.sync(s);assert.equal(sources.length,0,'interrupted warnings never ignite');
  audio.dispose();
}));

const chargingTitan=(values={})=>({id:10,kind:'titan',boss:true,x:-3,y:0,z:0,height:6.21,hp:6250,burnRemaining:0,arrowBurnRemaining:0,
  downed:false,stun:0,shockStunUntil:0,cast:null,charge:{remaining:1},...values});
test('Titan charge aura supplies the shared fire bed only during the live rush, never during its warning or after interruption',()=>fixture((audio,sources)=>{
  const s=state(),e=chargingTitan({charge:null,cast:{attack:'charge',remaining:.5}});s.enemies=[e];audio.sync(s);
  assert.equal(sources.length,0,'telegraphing a rush does not yet ignite its aura');
  e.cast=null;e.charge={remaining:1};audio.sync(s);
  const fire=sources[0];assert.ok(fire.buffer.name.endsWith('enemy-burning.mp3'));assert.equal(fire.loop,true);
  s.enemies.push(...Array.from({length:20},(_,id)=>burningEnemy({id})));s.hazards=[groundFireWave()];
  for(let i=0;i<200;i++)audio.sync(s);
  assert.equal(sources.length,1,'the rush, burns and ground waves share one bounded voice');
  assert.ok(fire.output.gain.value<=.85*1.6,'concurrent aura fire respects the existing volume cap');
  s.enemies=[e];s.hazards=[];e.charge.remaining=0;audio.sync(s);assert.ok(fire.stopped,'expired rush has no lingering flame audio');
  e.charge={remaining:.5};audio.sync(s);assert.equal(sources.length,2);
  e.charge=null;e.shockStunUntil=s.time+2;audio.sync(s);assert.ok(sources.at(-1).stopped,'F interruption stops the aura immediately');
  e.charge={remaining:.5};audio.sync(s);assert.equal(sources.length,2,'stale charge state under shock stun cannot restart fire');
  e.shockStunUntil=0;e.stun=.2;audio.sync(s);assert.equal(sources.length,2);
  e.stun=0;e.downed=true;audio.sync(s);assert.equal(sources.length,2);
  e.downed=false;e.hp=0;audio.sync(s);assert.equal(sources.length,2,'a dying Titan cannot retain a rush aura');
  e.hp=100;e.kind='devorador';e.boss=false;audio.sync(s);assert.equal(sources.length,2,'a non-Titan charge has no fire aura');
  audio.dispose();
}));

test('Titan charge fire follows its position, height, yaw and the existing pause, mute, retry lifecycle',()=>fixture((audio,sources)=>{
  const s=state(),e=chargingTitan();s.enemies=[e];s.time=2.3;audio.sync(s);
  const fire=sources[0],near=fire.output.gain.value,panner=fire.output.output;assert.ok(panner.pan.value<-.99);
  e.x=3;audio.sync(s);assert.ok(panner.pan.value>.99);
  s.player.yaw=Math.PI;audio.sync(s);assert.ok(panner.pan.value<-.99);
  e.y=20;audio.sync(s);assert.ok(fire.output.gain.value<near*.08,'airborne fire attenuation includes the aura height');
  e.y=0;s.phase='paused';audio.sync(s);assert.ok(fire.stopped);
  s.phase='playing';audio.sync(s);assert.equal(sources.length,2);assert.ok(Math.abs(sources.at(-1).args[1]-.3)<1e-7);
  audio.sync(s,false);assert.ok(sources.at(-1).stopped);audio.sync(s);assert.equal(sources.length,3);
  const retried=state();audio.sync(retried);assert.ok(sources.every(v=>v.stopped),'a new match stops the old charge aura');
  retried.enemies=[chargingTitan()];audio.sync(retried);audio.dispose();audio.sync(retried);assert.ok(sources.every(v=>v.stopped));
}));
