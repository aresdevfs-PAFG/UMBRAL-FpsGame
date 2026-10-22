import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {motherFarewellFrame} from '../public/assets/js/umbral-madre-farewell.mjs';
import {MADRE} from '../public/assets/js/umbral-madre.mjs';

test('farewell follows only the dead Mother, pauses with simulation and expires before the next wave',()=>{
  const e={kind:'madre',hp:0,deadTime:.3},s={phase:'playing',enemies:[e]};
  assert.equal(motherFarewellFrame(s),null);
  e.hp=10;e.deadTime=2;assert.equal(motherFarewellFrame(s),null);
  e.hp=0;const first=motherFarewellFrame(s);assert.ok(first.opacity>0&&first.melt>0);
  assert.deepEqual(motherFarewellFrame(s),first,'same simulation time gives the same visual frame');
  s.phase='paused';assert.equal(motherFarewellFrame(s),null);s.phase='playing';assert.deepEqual(motherFarewellFrame(s),first);
  e.deadTime=4;assert.ok(motherFarewellFrame(s).melt>first.melt);
  e.deadTime=MADRE.deathDuration;assert.equal(motherFarewellFrame(s),null);
  e.deadTime=2;e.kind='desollador';assert.equal(motherFarewellFrame(s),null);
  s.enemies=[];assert.equal(motherFarewellFrame(s),null);
});

test('death audio uses the approved wordless scream and discarded spoken exports are absent',()=>{
  const root=new URL('../',import.meta.url),file=p=>new URL(p,root);
  assert.deepEqual(readFileSync(file('public/assets/audio/umbral/enemies/madre-death.mp3')),readFileSync(file('public/assets/audio/umbral/enemies/madre-presence.mp3')));
  for(const name of ['sources/madre-death.mp3','madre-death-gutural-v3.mp3','madre-death-black-metal-v4.mp3','madre-ay-mi-hijooo-v5.mp3','madre-ay-mi-hijooo-furia-v6.mp3'])assert.equal(existsSync(file('design/umbral/madre-ahogo-v1/'+name)),false,name);
});
