import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEnemyAudio,ENEMY_SAMPLES} from '../public/assets/js/umbral-enemy-audio.mjs';

async function fixture(fn,missing){
  const previous=globalThis.fetch,sources=[],decoded=[],requests=[];
  globalThis.fetch=async url=>{requests.push(url);return {ok:!url.includes(missing||'NO_MISSING'),arrayBuffer:async()=>new TextEncoder().encode(url).buffer};};
  const param=value=>({value,setTargetAtTime(value){this.value=value;}});
  const context={destination:{},currentTime:0,createGain:()=>({gain:param(1),connect(output){this.output=output;},disconnect(){}}),
    createStereoPanner:()=>({pan:param(0),connect(output){this.output=output;},disconnect(){}}),
    decodeAudioData:async data=>{const buffer={name:new TextDecoder().decode(data),duration:2,length:100,sampleRate:50,numberOfChannels:1,getChannelData:()=>new Float32Array(100).fill(.5)};decoded.push(buffer);return buffer;},
    createBufferSource(){const voice={playbackRate:{value:1},connect(output){this.output=output;},disconnect(){},start(...args){this.args=args;},stop(){this.stopped=true;this.onended?.();}};sources.push(voice);return voice;}};
  const audio=await loadEnemyAudio(context);
  try{await fn(audio,sources,{decoded,requests,context});}finally{audio.dispose();globalThis.fetch=previous;}
}
const enemy=(id=1,kind='macabro',values={})=>({id,kind,x:0,y:0,z:-4,height:2,hp:100,grounded:true,...values});
const state=(enemies=[])=>({phase:'playing',time:0,player:{x:0,y:0,z:0,yaw:0},enemies});
const cue=(type,e,data={})=>({type,id:e.id,kind:e.kind,x:e.x,y:e.y,z:e.z,...data});
const names=sources=>sources.map(v=>v.buffer.name.split('?')[0].split('/').pop().replace('.mp3',''));

test('Desollador uses its own cues and suction loop stops on interrupt, death and mute',()=>fixture((audio,sources)=>{
  const e=enemy(77,'desollador',{height:8}),s=state([e]);
  audio.event(cue('enemySpawn',e),s);audio.event(cue('enemySpawn',e),s);
  audio.event(cue('enemyWindup',e,{attack:'blades'}),s);audio.event(cue('enemyAttack',e,{attack:'blades'}),s);
  audio.event(cue('enemyAttack',e,{attack:'dive'}),s);audio.event(cue('bossRage',e),s);
  assert.deepEqual(names(sources),['desollador-arrival','desollador-windup','desollador-attack','desollador-dive','desollador-arrival']);
  e.windSuction={age:0,duration:3};audio.sync(s);assert.ok(audio.diagnostics().voices.some(v=>v.name==='desollador-suction'&&v.loop));
  e.shockStunUntil=2;s.time=.2;audio.sync(s);assert.equal(audio.diagnostics().loops,0);
  e.shockStunUntil=0;s.time=.4;audio.sync(s);assert.equal(audio.diagnostics().loops,1);
  audio.sync(s,false);assert.equal(audio.diagnostics().active,0);
  s.time=.6;audio.sync(s);e.hp=0;audio.event(cue('kill',e),s);assert.equal(audio.diagnostics().loops,0);
  assert.equal(names(sources).at(-1),'desollador-death');assert.ok(!names(sources).some(n=>n.startsWith('titan-')));
}));

test('Mother cues are distinct, water drag stays within the loop budget, and wordless death scream plays once',()=>fixture((audio,sources)=>{
  const e=enemy(78,'madre',{height:9}),s=state([e,enemy(79,'devorador'),enemy(80,'devorador')]);
  audio.event(cue('enemySpawn',e),s);audio.event(cue('enemyWindup',e,{attack:'wave'}),s);audio.event(cue('enemyAttack',e,{attack:'wave'}),s);
  audio.event(cue('enemyAttack',e,{attack:'hands'}),s);audio.event(cue('motherRise',e),s);
  assert.deepEqual(names(sources),['madre-arrival','madre-windup','madre-wave','madre-hands','madre-screamer']);
  s.motherDrag={id:e.id};audio.sync(s);assert.equal(audio.diagnostics().loops,2);assert.ok(audio.diagnostics().voices.some(v=>v.name==='madre-darkness'));
  s.phase='paused';audio.sync(s);assert.equal(audio.diagnostics().active,0);s.phase='playing';s.time=.2;audio.sync(s);assert.equal(audio.diagnostics().loops,2);
  s.motherDrag=null;audio.event(cue('motherDragEnd',e),s);assert.ok(!audio.diagnostics().voices.some(v=>v.name==='madre-darkness'));
  e.hp=0;audio.event(cue('kill',e),s);assert.ok(!names(sources).includes('madre-death'));
  audio.event(cue('motherDeathCry',e),s);audio.event(cue('motherDeathCry',e),s);assert.equal(names(sources).filter(n=>n==='madre-death').length,1);
  assert.equal(sources.at(-1).playbackRate.value,1,'approved scream keeps its authored timing');
  assert.ok(sources.at(-1).buffer.name.endsWith('madre-death.mp3?v=7'),'refresh the removed spoken phrase');
  audio.sync(s,false);assert.equal(audio.diagnostics().active,0);
}));

test('water capture reuses the approved wordless scream once, follows the listener and does not consume the death cue',()=>fixture((audio,sources)=>{
  const e=enemy(78,'madre',{height:9}),s=state([e]);
  s.motherCapture={id:e.id,phase:'embrace'};
  audio.event(cue('motherScreamer',e),s);audio.event(cue('motherScreamer',e),s);
  assert.deepEqual(names(sources),['madre-death']);
  assert.ok(sources[0].buffer.name.endsWith('madre-death.mp3?v=7'));
  assert.equal(sources[0].playbackRate.value,1);
  s.player.x=30;s.time=.2;audio.sync(s);
  assert.ok(sources[0].output.gain.value>1,'the close scream stays audible after return');
  s.motherCapture=null;s.time=2;e.hp=0;audio.event(cue('motherDeathCry',e),s);
  assert.equal(names(sources).filter(n=>n==='madre-death').length,2);
  audio.sync(s,false);assert.equal(audio.diagnostics().active,0);
}));

test('64 original samples decode once and one missing clip leaves all other species working',()=>fixture((audio,sources,{decoded,requests})=>{
  assert.equal(ENEMY_SAMPLES.length,64);assert.equal(decoded.length,63);assert.deepEqual(audio.missing,['centinela-windup']);
  const e=enemy(1,'centinela'),s=state([e]);audio.event(cue('enemyWindup',e),s);assert.equal(sources.length,0);
  audio.event(cue('enemyAttack',e,{attack:'slam'}),s);assert.deepEqual(names(sources),['centinela-slam']);
  for(let i=0;i<30;i++){s.time+=.1;audio.sync(s);}assert.equal(requests.length,64);assert.equal(audio.diagnostics().master,.6);
},'centinela-windup'));

test('Macabro and Devorador warn at windup without repeating the compound sound at release',()=>fixture((audio,sources)=>{
  const m=enemy(1),d=enemy(2,'devorador'),a=enemy(3,'abominacion'),c=enemy(4,'centinela'),s=state([m,d,a,c]);
  for(const e of [m,d]){audio.event(cue('enemyWindup',e),s);audio.event(cue('enemyAttack',e,{attack:e===m?'projectile':'charge'}),s);}
  assert.deepEqual(names(sources),['macabro-attack','devorador-attack']);
  audio.event(cue('enemyWindup',a),s);audio.event(cue('enemyAttack',a,{attack:'acid-volley'}),s);
  audio.event(cue('enemyWindup',c),s);audio.event(cue('enemyAttack',c,{attack:'plasma'}),s);
  audio.event(cue('enemyAttack',c,{attack:'slam'}),s);
  assert.deepEqual(names(sources).slice(2),['abominacion-windup','abominacion-attack','centinela-windup','centinela-attack','centinela-slam']);
}));

test('shotgun pellets share one pain cue per enemy per quarter second; burns and dead hits stay silent',()=>fixture((audio,sources)=>{
  const e=enemy(),s=state([e]);for(let i=0;i<20;i++)audio.event(cue('hit',e,{source:'weapon'}),s);
  assert.deepEqual(names(sources),['macabro-hurt']);
  s.time=.24;audio.event(cue('hit',e,{source:'knife'}),s);assert.equal(sources.length,1);
  s.time=.25;audio.event(cue('hit',e,{source:'knife'}),s);assert.equal(sources.length,2);
  s.time=1;for(const source of ['burn','arrowBurn'])audio.event(cue('hit',e,{source}),s);
  audio.event(cue('hit',e,{source:'weapon',dead:true}),s);e.hp=0;audio.event(cue('hit',e,{source:'weapon'}),s);
  assert.equal(sources.length,2);audio.event(cue('kill',e),s);audio.event(cue('kill',e),s);
  assert.equal(names(sources).filter(n=>n==='macabro-death').length,1);
}));

test('presence is spaced across a species and each demon rather than filling the mix every frame',()=>fixture((audio,sources)=>{
  const s=state([enemy(1),enemy(2),enemy(3),enemy(4,'abominacion')]);
  audio.sync(s);assert.equal(names(sources).filter(n=>n==='macabro-presence').length,1);
  for(let i=1;i<=15;i++){s.time=i*.1;audio.sync(s);}assert.equal(names(sources).filter(n=>n==='macabro-presence').length,1);
  s.time=1.7;audio.sync(s);assert.equal(names(sources).filter(n=>n==='macabro-presence').length,2);
  const initial=sources.length;for(let i=0;i<600;i++)audio.sync(s);assert.equal(sources.length,initial,'no frame-rate audio allocation');
  s.time=8.1;audio.sync(s);assert.equal(names(sources).filter(n=>n==='macabro-presence').length,3);
}));

test('eight voices maximum preserve attack warnings over ambient sounds and never allow more than two floating loops',()=>fixture((audio,sources)=>{
  const s=state(Array.from({length:12},(_,i)=>enemy(i+1,'devorador',{x:i*.2})));
  audio.sync(s);assert.equal(audio.diagnostics().loops,2);
  for(let i=0;i<20;i++)audio.event(cue('enemyWindup',s.enemies[i%s.enemies.length]),s);
  assert.equal(audio.diagnostics().active,8);assert.ok(audio.diagnostics().voices.every(v=>v.priority===3));
  s.time=.2;audio.sync(s);assert.equal(audio.diagnostics().active,8);assert.equal(audio.diagnostics().loops,0,'quiet loops cannot replace an attack');
  const t=enemy(99,'titan');s.enemies.push(t);audio.event(cue('bossRage',t),s);
  assert.equal(audio.diagnostics().active,8);assert.ok(audio.diagnostics().voices.some(v=>v.name==='titan-rage'));
  assert.ok(sources.some(v=>v.stopped));
}));

test('stereo follows yaw and attenuation includes vertical distance; loops move without new samples',()=>fixture((audio,sources)=>{
  const e=enemy(1,'devorador',{x:-4,z:0}),s=state([e]);audio.sync(s);
  const near=audio.diagnostics().voices[0].volume;assert.ok(audio.diagnostics().voices[0].pan<-.99);
  e.x=4;s.time=.2;audio.sync(s);assert.ok(audio.diagnostics().voices[0].pan>.99);
  s.player.yaw=Math.PI;s.time=.4;audio.sync(s);assert.ok(audio.diagnostics().voices[0].pan<-.99);
  e.y=20;s.time=.6;audio.sync(s);assert.ok(audio.diagnostics().voices[0].volume<near*.12);
  assert.equal(sources.length,1);e.y=0;e.x=33;s.time=.8;audio.sync(s);assert.equal(audio.diagnostics().active,0);
}));

test('Titan announces arrival once and takes grounded moving steps without any sound during jumps or stationary casts',()=>fixture((audio,sources)=>{
  const e=enemy(42,'titan',{height:6.21}),s=state([e]);audio.sync(s);audio.sync(s);
  assert.equal(names(sources).filter(n=>n==='titan-arrival').length,1);
  e.x=1.3;s.time=.4;audio.sync(s);assert.equal(names(sources).filter(n=>n==='titan-step').length,1);
  e.grounded=false;e.x=3;s.time=.8;audio.sync(s);e.x=6;s.time=1.2;audio.sync(s);
  e.grounded=true;e.cast={remaining:1};e.x=8;s.time=1.6;audio.sync(s);
  assert.equal(names(sources).filter(n=>n==='titan-step').length,1);
  e.cast=null;s.time=2;audio.sync(s);e.x=9.3;s.time=2.4;audio.sync(s);assert.equal(names(sources).filter(n=>n==='titan-step').length,2);
  for(const type of ['bossLeap','bossSkulls','bossSummon','bossLanding','bossRage'])audio.event(cue(type,e),s);
  assert.ok(names(sources).includes('titan-leap'));assert.ok(names(sources).includes('titan-skulls'));assert.ok(names(sources).includes('titan-summon'));
  const steps=names(sources).filter(n=>n==='titan-step').length;e.shockStunUntil=4;e.x=14;s.time=3;audio.sync(s);
  assert.equal(names(sources).filter(n=>n==='titan-step').length,steps,'shockwave stun has no footsteps');
}));

test('Titan cannon release reuses plasma audio once at release, wins over ambient voices and tracks its moving muzzle',()=>fixture((audio,sources,{requests})=>{
  const t=enemy(42,'titan',{height:6.21,x:-4,z:0,grounded:false}),s=state([t]);
  audio.event(cue('enemyWindup',t,{attack:'cannon'}),s);
  assert.equal(sources.length,0,'the cannon warning never fires the release sound');
  for(let id=1;id<=8;id++)audio.event(cue('enemyWindup',enemy(id)),s);
  audio.event(cue('enemyAttack',t,{attack:'cannon',y:t.y+t.height*.7}),s);
  const source=sources.at(-1),panner=source.output.output,voice=audio.diagnostics().voices.find(v=>v.id===t.id);
  assert.ok(source.buffer.name.endsWith('/centinela-attack.mp3'),'reuse the already decoded plasma effect');
  assert.equal(voice.priority,4);assert.equal(audio.diagnostics().active,8);
  assert.ok(panner.pan.value<-.99);assert.ok(sources.some(v=>v.stopped),'an attack displaces lower priority warnings');
  audio.sync(s);const initial=source.output.gain.value,count=sources.length;
  s.player.yaw=Math.PI;s.time=.2;audio.sync(s);assert.ok(panner.pan.value>.99);
  t.x=-28;s.time=.4;audio.sync(s);assert.ok(source.output.gain.value<initial*.1);
  t.x=-4;t.y=30;s.time=.6;audio.sync(s);assert.ok(source.output.gain.value<initial*.06);
  assert.equal(sources.length,count,'spatial updates reuse the active cannon voice');
  assert.equal(requests.length,64,'the cannon adds no asset fetch');
  s.phase='paused';audio.sync(s);assert.ok(source.stopped);
  audio.event(cue('enemyAttack',t,{attack:'cannon'}),s);assert.equal(sources.length,count,'a paused release stays silent');
}));

test('one-shot roars track the listener and moving or dead actors without allocating more sources',()=>fixture((audio,sources,{context})=>{
  const e=enemy(1,'titan',{x:4,z:0,grounded:false}),s=state([e]);audio.event(cue('bossRage',e),s);audio.sync(s);
  const source=sources.find(v=>v.buffer.name.endsWith('titan-rage.mp3')),initial=source.output.gain.value;
  const panner=source.output.output,count=sources.length;assert.ok(panner.pan.value>.99);
  s.player.yaw=Math.PI;s.time=.2;context.currentTime=.2;audio.sync(s);assert.ok(panner.pan.value<-.99);
  e.x=24;s.time=.4;audio.sync(s);assert.ok(source.output.gain.value<initial*.12);
  assert.equal(sources.length,count,'repositioning keeps the existing source, gain and panner');
  e.hp=0;audio.event(cue('bossFinisherEnd',e),s);const final=sources.at(-1);e.x=-4;s.time=.6;audio.sync(s);
  assert.ok(final.output.output.pan.value>.99,'death continues to follow a corpse during its fade');
  s.enemies=[];s.time=.8;audio.sync(s);assert.ok(final.output.output.pan.value>.99,'removed corpse leaves its sound at the last position');
  assert.equal(final.stopped,undefined,'death tail finishes naturally');
}));

test('pause, mute, death, restart, removed demons and disposal stop voices; resumed loops use simulation time',()=>fixture((audio,sources)=>{
  const e=enemy(1,'devorador'),s=state([e]);s.time=2.7;audio.sync(s);assert.ok(Math.abs(sources[0].args[1]-.7)<1e-6);
  s.phase='paused';audio.sync(s);assert.equal(audio.diagnostics().active,0);
  s.phase='playing';audio.sync(s);assert.ok(Math.abs(sources.at(-1).args[1]-.7)<1e-6);
  audio.sync(s,false);assert.equal(audio.diagnostics().active,0);audio.sync(s);assert.equal(audio.diagnostics().active,1);
  s.phase='dead';audio.sync(s);assert.equal(audio.diagnostics().active,0);s.phase='playing';audio.sync(s);
  s.enemies=[];s.time=3;audio.sync(s);assert.equal(audio.diagnostics().active,0);
  const fresh=state([enemy(1,'titan')]);audio.sync(fresh);assert.ok(names(sources).includes('titan-arrival'));
  const other=state([enemy(1,'titan')]);audio.sync(other);assert.equal(names(sources).filter(n=>n==='titan-arrival').length,2,'reused IDs in a new match announce again');
  audio.stop();assert.equal(audio.diagnostics().active,0);audio.dispose();audio.sync(other);assert.equal(audio.diagnostics().active,0);
}));

test('training dummies and tutorial remain silent',()=>fixture((audio,sources)=>{
  const e=enemy(1,'macabro',{trainingDummy:true}),s=state([e]);audio.sync(s);
  for(const type of ['enemySpawn','enemyWindup','enemyAttack','hit','kill'])audio.event(cue(type,e,{source:'weapon'}),s);
  assert.equal(sources.length,0);
  e.trainingDummy=false;s.mode='tutorial';audio.sync(s);audio.event(cue('enemySpawn',e),s);assert.equal(sources.length,0);
}));

test('Empalador, Tejedor and Acechador separate warnings, actual releases, pain and deaths',()=>fixture((audio,sources)=>{
  const enemies=['empalador','tejedor','acechador'].map((kind,i)=>enemy(i+1,kind)),s=state(enemies);
  for(const e of enemies){
    const attack=e.kind==='empalador'?'spikes':e.kind==='tejedor'?'plasma':'jump';
    audio.event(cue('enemyWindup',e,{attack}),s);
    assert.equal(names(sources).at(-1),`${e.kind}-windup`,'warning is distinct from the released effect');
    audio.event(cue('enemyAttack',e,{attack}),s);
    audio.event(cue('hit',e,{source:'weapon'}),s);
    audio.event(cue('kill',e),s);audio.event(cue('kill',e),s);
    assert.deepEqual(names(sources).slice(-4),['windup','attack','hurt','death'].map(action=>`${e.kind}-${action}`));
  }
  assert.equal(names(sources).filter(n=>n.endsWith('-death')).length,3);
}));

test('Tejedor channels and Devorador hums share two nearest ambience slots without per-frame allocations',()=>fixture((audio,sources)=>{
  const t=enemy(1,'tejedor',{z:-3}),d=enemy(2,'devorador',{z:-5}),far=enemy(3,'tejedor',{z:-12}),s=state([t,d,far]);
  s.shieldLinks=[{from:t.id,to:d.id},{from:far.id,to:d.id}];audio.sync(s);
  const loops=()=>audio.diagnostics().voices.filter(v=>v.loop);
  assert.equal(loops().length,2);assert.deepEqual(loops().map(v=>v.id).sort(),[1,2]);
  assert.ok(loops().some(v=>v.name==='tejedor-channel'));assert.ok(loops().every(v=>v.priority===1));
  const count=sources.length;for(let i=0;i<300;i++)audio.sync(s);assert.equal(sources.length,count);
  far.z=-2;s.time=.2;audio.sync(s);assert.deepEqual(loops().map(v=>v.id).sort(),[1,3]);
  assert.equal(loops().length,2,'the closer channel replaces the distant hover');
  s.shieldLinks=[];s.time=.4;audio.sync(s);
  assert.deepEqual(loops().map(v=>v.name),['devorador-presence'],'both channels cease when shield links end');
}));

test('Tejedor loop stops on windup, cast, airborne, shock stun, hurt, kill and pause',()=>fixture((audio,sources)=>{
  const t=enemy(1,'tejedor'),s=state([t]);s.shieldLinks=[{from:1,to:2}];
  const channel=()=>audio.diagnostics().voices.some(v=>v.name==='tejedor-channel');
  const tick=()=>{s.time+=.2;audio.sync(s);};tick();assert.ok(channel());
  audio.event(cue('enemyWindup',t,{attack:'plasma'}),s);assert.equal(channel(),false,'warning immediately interrupts the channel');
  for(const [property,value] of [['cast',{remaining:.5}],['flight',{duration:.8}],['stun',.15],['shockStunUntil',20]]){
    t[property]=value;tick();assert.equal(channel(),false,property+' blocks a stale link');
    t[property]=null;tick();assert.ok(channel(),'channel resumes only when eligible');
  }
  t.stun=.15;audio.event(cue('hit',t,{source:'weapon'}),s);assert.equal(channel(),false);
  t.stun=0;tick();assert.ok(channel());s.phase='paused';audio.sync(s);assert.equal(channel(),false);
  s.phase='playing';audio.sync(s);assert.ok(channel());t.hp=0;audio.event(cue('kill',t),s);assert.equal(channel(),false);
  tick();assert.equal(channel(),false);assert.equal(names(sources).filter(n=>n==='tejedor-death').length,1);
}));

test('Acechador impact sounds only for a live grounded jump landing and ignores duplicate, airborne and corpse events',()=>fixture((audio,sources)=>{
  const e=enemy(1,'acechador',{grounded:false,flight:{duration:.8}}),s=state([e]);
  audio.event(cue('enemyLanding',e,{attack:'jump'}),s);assert.equal(sources.length,0);
  e.flight=null;e.grounded=true;audio.event(cue('enemyLanding',e,{attack:'jump'}),s);
  audio.event(cue('enemyLanding',e,{attack:'jump'}),s);assert.deepEqual(names(sources),['acechador-landing']);
  s.time=1;audio.event(cue('enemyLanding',e,{attack:'melee'}),s);e.hp=0;audio.event(cue('enemyLanding',e,{attack:'jump'}),s);
  assert.equal(sources.length,1,'neither a melee event nor death produces a landing sound');
}));

test('Empalador spike eruption stays at its ground hazard instead of following the moving caster',()=>fixture((audio,sources)=>{
  const e=enemy(1,'empalador',{x:14,z:0}),s=state([e]);
  audio.event(cue('enemyAttack',e,{attack:'spikes',fixedPosition:true,x:-3,y:0,z:0}),s);
  const source=sources[0],initial=source.output.gain.value;assert.ok(source.output.output.pan.value<-.99);
  audio.sync(s);e.x=3;s.time=.2;audio.sync(s);
  assert.ok(source.output.output.pan.value<-.99);assert.equal(source.output.gain.value,initial,'caster movement does not pull the eruption across the arena');
  s.player.yaw=Math.PI;s.time=.4;audio.sync(s);assert.ok(source.output.output.pan.value>.99,'listener rotation still affects a fixed world source');
}));

test('vulnerable Titan breathes until the finisher; death sounds once after the demo overlay and ends naturally',()=>fixture((audio,sources)=>{
  const e=enemy(1,'titan',{downed:true,height:4}),s=state([e]);audio.sync(s);
  assert.deepEqual(names(sources),['titan-downed']);assert.equal(audio.diagnostics().loops,1);
  s.bossFinish={phase:'executing'};audio.event(cue('bossFinisherStart',e),s);audio.sync(s);assert.equal(audio.diagnostics().active,0);
  s.time=.85;audio.event(cue('bossStab',e),s);audio.event(cue('bossStab',e),s);audio.sync(s);
  assert.equal(audio.diagnostics().active,1);assert.equal(audio.diagnostics().voices[0].name,'titan-hurt');
  assert.equal(audio.diagnostics().voices[0].cinematic,true);assert.equal(sources.length,2,'stab only produces one monster reaction');
  s.phase='paused';audio.sync(s);assert.equal(audio.diagnostics().active,0,'pause stops the cinematic reaction');
  s.phase='playing';audio.sync(s);audio.event(cue('bossStab',e),s);assert.equal(sources.length,2,'resume cannot replay the stab');
  e.hp=0;audio.event(cue('bossDefeated',e),s);audio.event(cue('kill',e),s);assert.equal(sources.length,2);
  audio.stop();s.bossFinish=null;s.phase='boss-demo-complete';audio.event(cue('bossFinisherEnd',e),s);audio.sync(s);
  assert.equal(audio.diagnostics().active,1);assert.equal(audio.diagnostics().voices[0].name,'titan-death');
  assert.equal(audio.diagnostics().voices[0].final,true);audio.event(cue('bossFinisherEnd',e),s);assert.equal(sources.length,3);
  sources.at(-1).onended();audio.sync(s);assert.equal(audio.diagnostics().active,0);
  s.phase='paused';audio.sync(s);assert.equal(audio.diagnostics().active,0);
}));
