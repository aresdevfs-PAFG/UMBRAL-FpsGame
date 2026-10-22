import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadShotgunAudio} from '../public/assets/js/umbral-shotgun-audio.mjs';

test('sample playback, cycle offset, weapon changes, pause and mute',async()=>{
  const oldFetch=globalThis.fetch, sources=[];
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});
  const ctx={destination:{},decodeAudioData:async()=>({duration:1.15}),
    createGain:()=>({gain:{value:1},connect(){},disconnect(){}}),
    createBufferSource(){const s={playbackRate:{value:1},connect(){},disconnect(){},start(...args){this.started=args;},stop(){this.stopped=true;this.onended?.();}};sources.push(s);return s;}};
  try{
    const audio=await loadShotgunAudio(ctx);
    audio.shot(false);audio.shot(true);assert.equal(sources.length,2);
    audio.syncCycle(1.3,1,true,true);assert.equal(sources.length,2,'recoil precedes mechanical sound');
    audio.syncCycle(1,1,true,true);assert.equal(sources.length,3);assert.ok(Math.abs(sources[2].started[1]-.15)<1e-6);
    audio.syncCycle(.9,1,true,true);assert.equal(sources.length,3,'no overlapping cycle every frame');
    audio.syncCycle(.8,2,true,true);assert.equal(sources[2].stopped,true);
    audio.syncCycle(.6,1,true,true);assert.ok(Math.abs(sources.at(-1).started[1]-.55)<1e-6);
    audio.syncCycle(.6,1,false,true);assert.ok(sources.every(s=>s.stopped));
    audio.syncCycle(.5,1,true,true);assert.ok(Math.abs(sources.at(-1).started[1]-.65)<1e-6);
    audio.syncCycle(.4,1,true,false);assert.ok(sources.every(s=>s.stopped));
    audio.syncCycle(.2,1,true,true);
    sources.at(-1).onended();
    const endedCount=sources.length;
    audio.syncCycle(.01,1,true,true);assert.equal(sources.length,endedCount,'finished audio tail does not replay while simulation catches up');
    audio.dispose();
  }finally{globalThis.fetch=oldFetch;}
});
