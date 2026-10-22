import test from 'node:test';
import assert from 'node:assert/strict';
import {createComaAudio,monitorSamples} from '../public/assets/js/umbral-coma-audio.mjs';

function fixture(rolls=[0]){
  const sources=[],buffers=[];
  const context={state:'running',sampleRate:48000,destination:{},
    createBuffer(channels,length,rate){
      const b={channels,length,rate,copyToChannel(data){this.data=data;}};
      buffers.push(b);return b;
    },
    createGain:()=>({gain:{value:1},connect(){},disconnect(){this.disconnected=true;}}),
    createBufferSource(){
      const source={connect(output){this.output=output;},disconnect(){this.disconnected=true;},
        start(){this.started=true;},stop(){this.stopped=true;}};
      sources.push(source);return source;
    }};
  let n=0;
  const audio=createComaAudio(context,context.destination,{random:()=>rolls[Math.min(n++,rolls.length-1)]});
  const s={phase:'playing',time:0};
  const tick=(time,enabled=true)=>{s.time=time;audio.sync(s,enabled);};
  return {audio,context,s,sources,buffers,tick};
}

test('the clue follows randomized play time, independently of enemies, pickups and damage',()=>{
  const {audio,s,sources,tick}=fixture([0,.5,1]);
  tick(0);tick(19.9);assert.equal(sources.length,0);
  tick(20);assert.equal(sources.length,1);sources[0].onended();
  s.enemies=Array(100).fill({hp:100});s.health=1;s.events=[{type:'spawnWarning'},{type:'pickup'}];
  tick(30);tick(67.4);assert.equal(sources.length,1);
  tick(67.5);assert.equal(sources.length,2);sources[1].onended();
  tick(127.4);assert.equal(sources.length,2);
  tick(127.5);assert.equal(sources.length,3);
  audio.dispose();
});

test('pause, mute and audio suspension freeze the wait and never replay missed cues in a burst',()=>{
  for(const mode of ['pause','mute','suspend','capture','finisher']){
    const {audio,s,context,sources,tick}=fixture();
    tick(0);tick(12);
    if(mode==='pause')s.phase='paused';
    if(mode==='suspend')context.state='suspended';
    if(mode==='capture')s.motherCapture={id:1};
    if(mode==='finisher')s.bossFinish={phase:'executing'};
    tick(12,mode!=='mute');tick(1000,mode!=='mute');
    assert.equal(sources.length,0);
    s.phase='playing';context.state='running';delete s.motherCapture;delete s.bossFinish;
    tick(1000);tick(1007.9);assert.equal(sources.length,0,mode);
    tick(1008);assert.equal(sources.length,1,mode);
    audio.dispose();
  }
});

test('pause, mute, death and menu transitions stop the entire beep including its echo',()=>{
  for(const phase of ['paused','dead','ready','boss-demo-complete','playing']){
    const {audio,s,sources,tick}=fixture();
    tick(0);tick(20);const voice=sources[0];
    s.phase=phase;tick(20.1,phase!=='playing');
    assert.ok(voice.stopped&&voice.disconnected,phase);
    tick(2000,phase!=='playing');assert.equal(sources.length,1);
    audio.dispose();
  }
});

test('retry resets the wait; late ended callbacks cannot detach a new voice; disposal is final',()=>{
  const {audio,sources,buffers,tick}=fixture();
  tick(0);tick(20);const old=sources[0];
  const retry={phase:'playing',time:0};
  audio.sync(retry);assert.ok(old.stopped);
  retry.time=19;audio.sync(retry);assert.equal(sources.length,1);
  retry.time=20;audio.sync(retry);assert.equal(sources.length,2);
  old.onended();
  audio.stop();assert.ok(sources[1].stopped,'old callback must not lose the new source');
  assert.equal(buffers.length,1,'the waveform is built once for all retries');
  audio.dispose();retry.time=1000;audio.sync(retry);assert.equal(sources.length,2);
});

test('one quiet voice contains a brief steady beep and three diminishing echoes',()=>{
  const {audio,sources,tick}=fixture();
  tick(0);tick(20);
  assert.ok(sources[0].output.gain.value<=.02);
  for(let i=0;i<500;i++)tick(20+i/1000);
  assert.equal(sources.length,1,'frame updates cannot multiply voices');
  const sr=48000,samples=monitorSamples(sr);
  assert.ok(samples.length<sr*1.1&&samples.every(Number.isFinite));
  const peak=(a,b)=>samples.slice(a*sr,b*sr).reduce((m,v)=>Math.max(m,Math.abs(v)),0);
  const peaks=[[0,.16],[.24,.40],[.49,.65],[.79,.95]].map(([a,b])=>peak(a,b));
  assert.ok(peaks[0]>.8&&peaks[0]<1);
  for(let i=1;i<peaks.length;i++)assert.ok(peaks[i]<peaks[i-1]*.4);
  assert.equal(peak(.17,.23),0,'the beep ends cleanly before its echo');
  assert.equal(peak(.96,1.02),0);
  audio.dispose();
});
