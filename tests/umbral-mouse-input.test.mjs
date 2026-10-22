import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createState,selectWeapon,fire,setRifleScope,step,WEAPONS} from '../public/assets/js/umbral-core.mjs';
import {finisherLocked} from '../public/assets/js/umbral-finisher.mjs';
import {motherCaptureLocked} from '../public/assets/js/umbral-madre.mjs';

// Exercise the actual DOM listeners, including their event names. Core-only tests
// cannot catch pointerdown being absent when a second mouse button is pressed.
const source=readFileSync(new URL('../public/assets/js/umbral-demo.js',import.meta.url),'utf8');
const listeners=source.slice(source.indexOf("  on(canvas,'contextmenu'"),source.indexOf("  on(document,'pointermove'"));
function setup(locked){
  const s=createState();s.phase='playing';selectWeapon(s,2);
  const canvas=new EventTarget(),document=new EventTarget(),mouse={primary:false,secondary:false};
  canvas.focus=()=>{};document.pointerLockElement=locked?canvas:null;
  const context={s,canvas,document,mouse,dragging:false,dragPoint:null,capture:()=>{},fire,setRifleScope,finisherLocked,motherCaptureLocked,WEAPONS,
    on:(target,type,fn)=>target.addEventListener(type,fn)};
  vm.runInNewContext(listeners,context);
  const send=(target,type,button,buttons)=>{
    const e=new Event(type,{cancelable:true});Object.assign(e,{button,buttons,clientX:100,clientY:100});target.dispatchEvent(e);
  };
  return {s,canvas,document,mouse,context,send};
}
for(const locked of [true,false])test(`right hold + left click fires sniper with pointer lock ${locked}`,()=>{
  const {s,canvas,document,mouse,context,send}=setup(locked);
  send(canvas,'pointerdown',2,2);send(canvas,'mousedown',2,2);
  assert.equal(s.rifleScoped,true);assert.equal(s.shotSerial,0);
  // Browsers emit no second pointerdown here, only pointermove + mousedown.
  send(canvas,'pointermove',0,3);send(canvas,'mousedown',0,3);
  assert.equal(s.shotSerial,1);assert.equal(s.ammo.obsidian,57);
  assert.ok(s.events.some(e=>e.type==='sniperTrail'));
  assert.ok(s.events.some(e=>e.type==='shot'&&e.scoped));
  send(document,'mouseup',0,2);
  assert.equal(mouse.primary,false);assert.equal(mouse.secondary,true);assert.equal(s.rifleScoped,true);
  if(!locked)assert.equal(context.dragging,true,'keep aiming when left is released');
  for(let i=0;i<45;i++)step(s,mouse,.05);
  assert.equal(s.shotSerial,1,'no stuck firing after releasing left');
  send(canvas,'mousedown',0,3);assert.equal(s.shotSerial,2);assert.equal(s.ammo.obsidian,54);
  send(document,'mouseup',2,1);
  assert.equal(s.rifleScoped,false);assert.equal(mouse.primary,true);assert.equal(mouse.secondary,false);
  send(document,'pointerup',0,0);send(document,'mouseup',0,0);
  assert.equal(mouse.primary,false);assert.equal(context.dragging,false);
});
test('paused game ignores button presses',()=>{
  const {s,canvas,send,mouse}=setup(true);s.phase='paused';send(canvas,'mousedown',0,1);
  assert.equal(s.shotSerial,0);assert.equal(mouse.primary,false);
});

test('Mother embrace ignores scope and fire until the capture ends',()=>{
  const {s,canvas,send,mouse}=setup(true);s.motherCapture={phase:'embrace'};
  send(canvas,'mousedown',2,2);send(canvas,'mousedown',0,3);
  assert.equal(s.rifleScoped,false);assert.equal(s.shotSerial,0);assert.equal(mouse.primary,false);
  s.motherCapture=null;send(canvas,'mousedown',2,2);send(canvas,'mousedown',0,3);
  assert.equal(s.rifleScoped,true);assert.equal(s.shotSerial,1);
});
