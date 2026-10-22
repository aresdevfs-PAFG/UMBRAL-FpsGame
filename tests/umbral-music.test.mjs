import test from 'node:test';
import assert from 'node:assert/strict';
import {createUmbralMusic,MUSIC_TRACKS} from '../public/assets/js/umbral-music.mjs';

function setup(){
  let time=0,id=0;const timers=new Map(),listeners=new Map(),history=[];
  const media={volume:1,muted:false,paused:true,currentTime:0,src:'',plays:0,
    addEventListener(k,fn){listeners.set(k,fn);},removeEventListener(k){listeners.delete(k);},
    pause(){this.paused=true;},play(){this.paused=false;this.plays++;return Promise.resolve();},
    load(){this.currentTime=0;if(this.src)history.push(this.src);},removeAttribute(){this.src='';}};
  let seed=19;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const music=createUmbralMusic({media,random,now:()=>time,schedule(fn,ms){timers.set(++id,{fn,at:time+ms});return id;},cancel(key){timers.delete(key);}});
  function advance(ms){time+=ms;for(const [key,t] of [...timers])if(t.at<=time){timers.delete(key);t.fn();}}
  function end(){media.paused=true;listeners.get('ended')?.();}
  return {music,media,history,timers,listeners,advance,end};
}
test('starts at 8%, does not autoplay before entry, and shuffles complete cycles without adjacent repeats',()=>{
  const f=setup();assert.equal(f.media.volume,.08);assert.equal(f.history.length,0);assert.equal(f.media.plays,0);
  f.music.setPlaying(true);
  for(let i=0;i<MUSIC_TRACKS.length*3-1;i++){
    const previous=f.history.length;f.end();f.advance(999);assert.equal(f.history.length,previous);f.advance(1);assert.equal(f.history.length,previous+1);
  }
  for(let i=0;i<MUSIC_TRACKS.length*3;i+=MUSIC_TRACKS.length)assert.equal(new Set(f.history.slice(i,i+MUSIC_TRACKS.length)).size,MUSIC_TRACKS.length);
  for(let i=1;i<f.history.length;i++)assert.notEqual(f.history[i],f.history[i-1]);
  f.music.dispose();
});
test('pause and mute preserve the playback position and the remaining one-second gap',()=>{
  const f=setup();f.music.setPlaying(true);f.media.currentTime=42;
  f.music.setPlaying(false);f.advance(5000);assert.equal(f.media.paused,true);assert.equal(f.media.currentTime,42);
  f.music.setPlaying(true);assert.equal(f.media.currentTime,42);assert.equal(f.history.length,1);
  f.end();f.advance(400);f.music.setPlaying(false);f.advance(9000);assert.equal(f.history.length,1);
  f.music.setPlaying(true);f.advance(599);assert.equal(f.history.length,1);f.advance(1);assert.equal(f.history.length,2);
  f.music.setMuted(true);assert.equal(f.media.muted,true);assert.equal(f.media.paused,true);
  f.music.setMuted(false);assert.equal(f.media.paused,false);assert.equal(f.history.length,2);f.music.dispose();
});
test('volume stays independent of mute and restart; disposal cancels scheduled playback',()=>{
  const f=setup();f.music.setVolume(.35);f.music.setPlaying(true);f.music.setMuted(true);assert.equal(f.media.volume,.35);
  f.music.reset();assert.equal(f.media.volume,.35);assert.equal(f.media.src,'');assert.equal(f.media.paused,true);
  f.music.setPlaying(true);assert.equal(f.media.paused,true,'master mute survives reset');
  f.music.setMuted(false);f.end();f.music.dispose();f.advance(2000);assert.equal(f.media.paused,true);assert.equal(f.media.src,'');assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
  f.music.setPlaying(true);assert.equal(f.media.paused,true);
});
test('failed files are skipped with a bounded retry count instead of an endless playlist loop',()=>{
  const f=setup();f.music.setPlaying(true);
  for(let i=0;i<MUSIC_TRACKS.length;i++){f.listeners.get('error')();f.advance(1000);}
  assert.equal(f.history.length,MUSIC_TRACKS.length);assert.equal(f.media.paused,true);assert.equal(f.timers.size,0);f.music.dispose();
});
test('autoplay rejection waits for a new explicit start and never advances the track',async()=>{
  const f=setup();f.media.play=()=>Promise.reject(Object.assign(new Error('gesture required'),{name:'NotAllowedError'}));
  f.music.setPlaying(true);await Promise.resolve();assert.equal(f.media.paused,true);assert.equal(f.timers.size,0);assert.equal(f.history.length,1);
  f.media.play=function(){this.paused=false;return Promise.resolve();};f.music.setPlaying(true);assert.equal(f.media.paused,false);assert.equal(f.history.length,1);f.music.dispose();
});


test('zero volume survives pause and retry, while a new session starts at eight percent',()=>{
  const f=setup();f.music.setPlaying(true);f.music.setVolume(0);
  f.music.setPlaying(false);f.music.setPlaying(true);assert.equal(f.media.volume,0);
  f.music.reset();f.music.setPlaying(true);assert.equal(f.media.volume,0);
  f.music.dispose();const next=setup();assert.equal(next.media.volume,.08);assert.equal(next.media.muted,false);next.music.dispose();
});

test('all five playlist files exist and the manifest agrees with the player default',async()=>{
  const {readFile,stat}=await import('node:fs/promises');
  const base=new URL('../public/assets/audio/umbral/music/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
  assert.equal(MUSIC_TRACKS.length,5);assert.deepEqual(manifest.tracks.map(t=>t.file),MUSIC_TRACKS);assert.equal(manifest.defaultVolume,.08);
  for(const name of MUSIC_TRACKS)assert.ok((await stat(new URL(name,base))).size>1000);
});
