import test from 'node:test';
import assert from 'node:assert/strict';
import {MOTHER_GUARDIANS,updateMotherGuardians,interceptMotherShot} from '../public/assets/js/umbral-madre-guardians.mjs';

function state(){
  const e={kind:'madre',id:9,hp:12000,x:0,y:-2.23,z:18,waterLevel:5.02,waterState:'submerged'};
  return {phase:'playing',player:{x:0,y:5,z:26},enemies:[e],events:[],seed:19,nextId:24,kills:7,pickups:[]};
}
const eye=s=>({x:s.player.x,y:s.player.y+1.6,z:s.player.z});
const aim=(s,e)=>{const o=eye(s),x=e.x-o.x,y=e.waterLevel+.8-o.y,z=e.z-o.z;return {origin:o,direction:{x,y,z},distance:Math.hypot(x,y,z)};};
const shot=(s,e,id)=>{const a=aim(s,e);return interceptMotherShot(s,e,a.origin,a.direction,a.distance,id);};

test('submerged idle has an invisible finite reserve, no orbiting skulls and no RNG or ID side effects',()=>{
  const s=state(),e=s.enemies[0];updateMotherGuardians(s,e,0);
  assert.equal(e.motherGuardianReserve,8);assert.equal(e.motherGuardians.length,0);
  for(let i=0;i<100;i++)updateMotherGuardians(s,e,.1);
  assert.equal(e.motherGuardianReserve,8);assert.equal(e.motherGuardians.length,0);assert.equal(s.events.length,0);
  assert.equal(s.seed,19);assert.equal(s.nextId,24);assert.equal(s.enemies.length,1);assert.equal(s.kills,7);
});

test('a validated shot summons exactly one skull before the head, consumed instantly with arrival and break visuals',()=>{
  const s=state(),e=s.enemies[0],a=aim(s,e),hit=shot(s,e,'shot-1'),g=hit.guardian;
  assert.equal(e.motherGuardianReserve,7);assert.equal(e.motherGuardians.length,1);assert.equal(hit.e,e);
  assert.ok(hit.t<a.distance);assert.ok(Math.abs(hit.t-(a.distance-.55))<1e-10);
  assert.equal(g.hp,0);assert.equal(g.radius,.32);assert.equal(g.phase,'intercept');assert.equal(g.age,0);
  assert.deepEqual(g.target,{x:g.x,y:g.y,z:g.z});assert.equal(g.from.y,e.waterLevel+.08);
  assert.ok(Math.hypot(g.from.x-e.x,g.from.z-e.z)<=1.30001);assert.equal(s.events.length,1);
  assert.equal(s.events[0].type,'motherGuardianIntercept');assert.equal(s.events[0].guardian,g);
  assert.equal(e.hp,12000);assert.equal(s.kills,7);assert.equal(s.pickups.length,0);
});

test('sixteen shotgun pellets consume one reserve; each trajectory gets its own distance without moving the first effect',()=>{
  const s=state(),e=s.enemies[0],a=aim(s,e),first=shot(s,e,42),g=first.guardian;
  const visual=JSON.stringify(g);
  for(let i=1;i<16;i++){
    const distance=a.distance+i*.013,direction={...a.direction,x:i*.02};
    const hit=interceptMotherShot(s,e,a.origin,direction,distance,42);
    assert.equal(hit.guardian,g);assert.equal(hit.t,distance-MOTHER_GUARDIANS.impactLead);
  }
  assert.equal(e.motherGuardianReserve,7);assert.equal(e.motherGuardians.length,1);assert.equal(s.events.length,1);
  assert.equal(JSON.stringify(g),visual);
});

test('eight distinct shots exhaust protection, the ninth passes, and the final shot remains blocked for all its pellets',()=>{
  const s=state(),e=s.enemies[0];
  for(let i=0;i<8;i++){assert.ok(shot(s,e,i));assert.equal(e.motherGuardianReserve,7-i);}
  assert.equal(shot(s,e,8),null);assert.equal(e.motherGuardians.length,8);assert.equal(s.events.length,8);
  for(let i=0;i<16;i++)assert.ok(shot(s,e,7),'same last trigger stays intercepted even at zero reserve');
  updateMotherGuardians(s,e,20);assert.equal(e.motherGuardians.length,0);assert.equal(e.motherGuardianReserve,0);
  assert.equal(shot(s,e,9),null);assert.ok(shot(s,e,7),'already consumed shot ID never falls through after its visual expires');
  assert.equal(e._motherGuardianShots.size,8,'bounded cache contains only the eight intercepted triggers');
});

test('visual reaches shatter at 90ms and disappears at 290ms, independent of frame rate',()=>{
  for(const hz of [20,60,120]){
    const s=state(),e=s.enemies[0],g=shot(s,e,1).guardian,pool=e.motherGuardians;
    let elapsed=0;
    while(elapsed<.084){updateMotherGuardians(s,e,.005);elapsed+=.005;}
    assert.equal(g.phase,'intercept');updateMotherGuardians(s,e,.006);elapsed+=.006;assert.equal(g.phase,'shatter');
    while(elapsed<MOTHER_GUARDIANS.duration){const dt=Math.min(1/hz,MOTHER_GUARDIANS.duration-elapsed);updateMotherGuardians(s,e,dt);elapsed+=dt;}
    assert.equal(e.motherGuardians,pool);assert.equal(e.motherGuardians.length,0);assert.equal(e.motherGuardianReserve,7);
  }
});

test('pause freezes effects and reserve; emergence resets protection only for the next submerged cycle',()=>{
  const s=state(),e=s.enemies[0];shot(s,e,1);s.phase='paused';const before=JSON.stringify(e),eventCount=s.events.length;
  updateMotherGuardians(s,e,10);assert.equal(shot(s,e,2),null);assert.equal(JSON.stringify(e),before);assert.equal(s.events.length,eventCount);
  s.phase='playing';e.waterState='rising';updateMotherGuardians(s,e,.1);
  assert.equal(e.motherGuardians.length,0);assert.equal(e.motherGuardianReserve,0);assert.equal(shot(s,e,3),null);
  e.waterState='submerged';updateMotherGuardians(s,e,0);assert.equal(e.motherGuardianReserve,8);assert.equal(e.motherGuardianCycle,2);assert.equal(e.motherGuardians.length,0);
  assert.ok(shot(s,e,1),'new cycle accepts a previously used ID after clearing its old cache');
});

test('capture, boss death, player death and other enemies cannot intercept; return from capture starts a fresh reserve',()=>{
  for(const condition of ['capture','boss-death','player-death','other-kind']){
    const s=state(),e=s.enemies[0];shot(s,e,1);
    if(condition==='capture'){s.motherCapture={id:e.id};e.waterState='capturing';}
    if(condition==='boss-death')e.hp=0;
    if(condition==='player-death')s.phase='dead';
    if(condition==='other-kind')e.kind='macabro';
    updateMotherGuardians(s,e,.1);assert.equal(e.motherGuardians.length,0);assert.equal(shot(s,e,2),null);
    if(condition==='capture'){
      s.motherCapture=null;e.waterState='submerged';updateMotherGuardians(s,e,0);
      assert.equal(e.motherGuardianReserve,8);assert.equal(e.motherGuardians.length,0);assert.ok(shot(s,e,2));
    }
  }
});

test('invalid requests never spend protection; omens never receive guardians',()=>{
  const s=state(),e=s.enemies[0],a=aim(s,e);updateMotherGuardians(s,e,0);s.motherOmen={x:5,y:5.02,z:15};
  for(const distance of [NaN,Infinity,0,-1])assert.equal(interceptMotherShot(s,e,a.origin,a.direction,distance,1),null);
  assert.equal(interceptMotherShot(s,e,a.origin,{x:0,y:0,z:0},10,1),null);
  assert.equal(interceptMotherShot(s,e,{x:NaN,y:6,z:26},a.direction,10,1),null);
  assert.equal(interceptMotherShot(s,e,a.origin,a.direction,10,undefined),null);
  assert.equal(e.motherGuardianReserve,8);assert.equal(e.motherGuardians.length,0);assert.equal(s.events.length,0);
  assert.equal(s.motherOmen.motherGuardians,undefined);
});
