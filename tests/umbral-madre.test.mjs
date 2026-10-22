import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createState,createEnemy,hitEnemy,step,activateMacuahuitl,activateFlames,activateDual,fire,selectWeapon,setRifleScope,damagePlayer} from '../public/assets/js/umbral-core.mjs';
import {MADRE,motherHitBounds,madreAllowsDamage,onMotherHit,beginMotherDrag,updateMotherDrag,clearMotherEncounter,updateMadre,madrePose} from '../public/assets/js/umbral-madre.mjs';
import {createBossDemoState,continueBossDemo} from '../public/assets/js/umbral-boss-demo.mjs';
import {bossForMap} from '../public/assets/js/umbral-desollador.mjs';
import {getArena,riverTide} from '../public/assets/js/umbral-arena.mjs';
import {updateMotherGuardians,interceptMotherShot} from '../public/assets/js/umbral-madre-guardians.mjs';
const tick=(s,n,hz=60,input={})=>{for(let i=0;i<Math.ceil(n*hz);i++)step(s,input,1/hz);};
function setup(){const s=createBossDemoState('madre');s.phase='playing';s.enemies[0].attack=100;return s;}
function fly(s){const e=s.enemies[0];hitEnemy(s,e,1,'weapon',e.waterLevel+.8);updateMadre(s,e,MADRE.riseDuration);e.attack=100;e.dragAt=Infinity;return e;}
function aim(s,e,y){const p=s.player,dx=e.x-p.x,dz=e.z-p.z;p.yaw=Math.atan2(-dx,-dz);p.pitch=Math.atan2(y-p.y-1.6,Math.hypot(dx,dz));}

test('river boss starts submerged with a shootable head and keeps the purple flood high',()=>{
 const s=setup(),e=s.enemies[0],a=getArena(s.mapId),b=motherHitBounds(s,e);
 assert.equal(bossForMap('rio'),'madre');assert.equal(bossForMap('cuenca'),'titan');assert.equal(bossForMap('corona'),'desollador');
 assert.equal(s.mapId,'rio');assert.equal(s.wave,10);assert.equal(s.enemies.length,1);assert.equal(s.pending,0);
 assert.equal(e.hp,12000);assert.equal(e.height,9);assert.equal(e.shield,0);assert.equal(s.health,100);
 assert.equal(e.waterState,'submerged');assert.ok(e.y<e.waterLevel);assert.ok(a.groundHeight(e.x,e.z)<5);
 assert.ok(b.low>5&&b.high<7);assert.equal(b.radius,MADRE.headRadius);
 assert.equal(a.groundHeight(s.player.x,s.player.z),s.player.y);assert.ok(Object.values(s.ammo).every(n=>n>=180));
 for(const time of [0,20,28,35,72]){const tide=riverTide(time,s);assert.equal(tide.level,5);assert.equal(tide.haunted,true);}
});
test('only an aimed ranged head hit wakes the submerged boss; knife, F, burn and splash cannot',()=>{
 const s=setup(),e=s.enemies[0],hp=e.hp;
 for(const source of ['knife','macuahuitl','macuahuitlMelee','burn','arrowBurn','bowSplash']){
  hitEnemy(s,e,100,source,e.waterLevel+.8);assert.equal(e.hp,hp);assert.equal(e.waterState,'submerged');
 }
 for(const y of [e.waterLevel-2,e.waterLevel,e.waterLevel+3]){hitEnemy(s,e,100,'weapon',y);assert.equal(e.hp,hp);}
 hitEnemy(s,e,120,'weapon',e.waterLevel+.8);assert.equal(e.hp,hp-120);assert.equal(e.waterState,'rising');
 assert.equal(s.events.filter(e=>e.type==='motherRise').length,1);
});
test('wave 10 materializes the Mother at the warned water location; legacy dry locations relocate safely',()=>{
 const s=createState('rio');Object.assign(s,{phase:'playing',portalUsed:true,health:100,wave:9,clearedWave:9,nextWave:.01,pending:0});Object.assign(s.player,{x:0,y:5,z:27});
 let warning;
 for(let i=0;i<300&&!s.enemies.length;i++){
  step(s,{},.02);if(s.spawnWarnings[0])warning={x:s.spawnWarnings[0].x,z:s.spawnWarnings[0].z};
 }
 assert.ok(warning);const e=s.enemies[0];assert.equal(e.kind,'madre');assert.deepEqual({x:e.x,z:e.z},warning);
 assert.equal(e.waterState,'submerged');assert.equal(s.enemies.length,1);
 const legacy=createState('rio'),a=getArena('rio'),dry=a.BOSS_SPAWNS[0];
 const moved=createEnemy(legacy,'madre',dry);assert.ok(a.groundHeight(moved.x,moved.z)<5);assert.notDeepEqual({x:moved.x,z:moved.z},{x:dry.x,z:dry.z});
});
test('head-hit feedback is located at the actual visible impact instead of the submerged body',()=>{
 const s=setup(),e=s.enemies[0],impactY=e.waterLevel+.8;
 hitEnemy(s,e,10,'weapon',impactY);const hit=s.events.findLast(e=>e.type==='hit');
 assert.equal(hit.y,impactY);assert.ok(hit.y>e.waterLevel);
});
test('rifle, bow and solar cannon rays hit the visible head; underwater body rays pass without waking her',()=>{
 const clearGuardians=(s,e)=>{
  updateMotherGuardians(s,e,0);
  const origin={x:s.player.x,y:s.player.y+1.6,z:s.player.z},direction={x:e.x-origin.x,y:e.waterLevel+.8-origin.y,z:e.z-origin.z};
  const distance=Math.hypot(direction.x,direction.y,direction.z);
  for(let i=0;i<8;i++)assert.ok(interceptMotherShot(s,e,origin,direction,distance,'bounds-fixture-'+i));
  assert.equal(e.motherGuardianReserve,0);
 };
 for(const selected of [2,4,5]){
  const s=setup(),e=s.enemies[0];clearGuardians(s,e);s.selected=selected;aim(s,e,e.waterLevel+.8);
  assert.equal(fire(s),true);assert.ok(e.hp<e.maxHp);assert.equal(e.waterState,'rising');
 }
 const s=setup(),e=s.enemies[0];clearGuardians(s,e);s.selected=2;aim(s,e,e.waterLevel-2);fire(s);assert.equal(e.hp,e.maxHp);assert.equal(e.waterState,'submerged');
});
test('head strike rises vertically, attacks above the same water, then sinks and chooses another water point',()=>{
 for(const hz of [20,60,120]){
  const s=setup(),e=s.enemies[0],a=getArena('rio'),origin={x:e.x,z:e.z},base=e.y;
  hitEnemy(s,e,1,'weapon',e.waterLevel+.8);tick(s,.4,hz);assert.ok(e.y>base&&e.y<e.waterLevel+.6);
  tick(s,.45,hz);assert.equal(e.waterState,'airborne');assert.equal(e.x,origin.x);assert.equal(e.z,origin.z);
  e.attack=100;e.dragAt=Infinity;tick(s,10,hz);assert.equal(e.waterState,'sinking');tick(s,.85,hz);
  assert.equal(e.waterState,'submerged');assert.ok(a.groundHeight(e.x,e.z)<5);assert.notDeepEqual({x:e.x,z:e.z},origin);
  assert.ok(e.y<e.waterLevel);assert.ok(!s.motherDarkness);
 }
});
test('airborne wave and hands retain telegraphs and phase-three pressure',()=>{
 const s=setup(),e=fly(s);e.attack=0;updateMadre(s,e,.01);
 assert.equal(e.cast.attack,'wave');assert.equal(s.projectiles.length,0);updateMadre(s,e,1.2);
 assert.equal(s.projectiles.length,3);assert.ok(s.projectiles.every(p=>p.kind==='madre-wave'&&p.damage===25&&p.speed===14));
 e.attack=0;updateMadre(s,e,.01);assert.equal(e.cast.attack,'hands');
 assert.equal(s.hazards.length,1);assert.equal(s.hazards[0].warning,1.15);assert.equal(s.hazards[0].hit,false);
 e.cast=null;e.attack=0;e.hp=2900;e.attacks=0;updateMadre(s,e,.01);updateMadre(s,e,1.2);
 assert.equal(e.enraged,true);assert.equal(s.projectiles.length,6);assert.equal(s.events.filter(e=>e.type==='bossRage').length,1);
});
test('hands damage only their warned ground disk; walking or jumping avoids the eruption',()=>{
 for(const evade of ['stay','walk','jump']){
  const s=setup(),e=fly(s);e.attacks=1;e.attack=0;step(s,{},.01);
  assert.equal(s.hazards.length,1);tick(s,.8);assert.equal(s.shield,100);
  if(evade==='walk')s.player.x+=4;
  if(evade==='jump'){s.player.y+=2;s.player.vy=5;s.player.grounded=false;}
  tick(s,.4);assert.equal(s.shield,evade==='stay'?72:100);
 }
});
test('drag telegraph leaves aim, scope, weapons and powers available and never changes their state',()=>{
 const s=setup(),e=fly(s);s.selected=2;s.rifleScoped=true;s.flameRemaining=.5;s.smgDualRemaining=2;
 const p={...s.player};assert.equal(beginMotherDrag(s,e),true);updateMotherDrag(s,.8);
 assert.equal(s.motherDrag.phase,'warning');assert.deepEqual(s.player,p);assert.equal(s.rifleScoped,true);
 assert.equal(s.flameRemaining,.5);assert.equal(s.smgDualRemaining,2);assert.ok(!s.motherDarkness);
 s.flameRemaining=0;s.smgDualRemaining=0;assert.ok(selectWeapon(s,2));assert.ok(setRifleScope(s,true));assert.ok(fire(s));
 assert.ok(activateFlames(s));s.flameRemaining=0;assert.ok(activateMacuahuitl(s));s.macuahuitlRemaining=0;s.selected=3;assert.ok(activateDual(s));
});
test('drag is a bounded horizontal pull and movement away remains stronger than suction',()=>{
 for(const hz of [20,60,120])for(const resist of [false,true]){
  const s=setup(),e=fly(s);Object.assign(s.player,{x:0,y:5,z:26,yaw:0,pitch:.2,padCooldown:10});Object.assign(e,{x:0,z:18});
  const initial=s.player.z;beginMotherDrag(s,e);tick(s,MADRE.dragWarning+.7,hz,resist?{forward:-1}:{});
  assert.ok(resist?s.player.z>initial:s.player.z<initial);assert.equal(s.player.yaw,0);assert.equal(s.player.pitch,.2);
  assert.ok(!getArena('rio').solid(s.player.x,s.player.z,.32,s.player.y,1.7));assert.ok(!s.player.flight);
 }
});
test('pull resolves against arena walls instead of dragging through a statue or teleporting',()=>{
 const s=setup(),e=fly(s),a=getArena('rio');Object.assign(s.player,{x:31,y:5,z:7,padCooldown:10});Object.assign(e,{x:31,z:-8});
 beginMotherDrag(s,e);let previous={...s.player};
 for(let i=0;i<260;i++){
  updateMotherDrag(s,1/60);
  assert.ok(Math.hypot(s.player.x-previous.x,s.player.z-previous.z)<.1);
  assert.ok(!a.solid(s.player.x,s.player.z,.32,s.player.y,1.7));previous={...s.player};
 }
 assert.ok(s.player.z>=5.31);assert.equal(s.motherDrag,null);assert.equal(s.health,100);assert.equal(s.shield,100);
});
test('700 ranged damage interrupts the drag while F and damage-over-time cannot cancel it',()=>{
 const s=setup(),e=fly(s);beginMotherDrag(s,e);
 for(const source of ['macuahuitl','macuahuitlMelee','knife'])hitEnemy(s,e,999,source,e.y+3);
 assert.equal(s.motherDrag.hp,MADRE.dragHealth);
 hitEnemy(s,e,50,'burn');assert.equal(s.motherDrag.hp,MADRE.dragHealth);
 hitEnemy(s,e,120,'weapon',e.y+3);assert.equal(s.motherDrag.hp,580);
 hitEnemy(s,e,580,'bow',e.y+3);assert.equal(s.motherDrag,null);
 assert.equal(s.events.findLast(x=>x.type==='motherDragEnd').reason,'interrupted');
});
test('a successful pull into the water hands control to the capture without ordinary bite damage',()=>{
 const s=setup(),e=fly(s);Object.assign(s.player,{x:0,y:5,z:22.5,padCooldown:10});Object.assign(e,{x:0,z:18});beginMotherDrag(s,e);
 tick(s,2);assert.equal(s.motherDrag,null);assert.equal(s.events.findLast(x=>x.type==='motherDragEnd').reason,'water');
 assert.ok(s.riverImmersed);assert.ok(s.motherCapture);assert.equal(s.health,100);assert.equal(s.shield,100);
 tick(s,2);assert.equal(s.motherCapture,null);assert.equal(s.health,40);assert.equal(s.shield,100);assert.equal(s.riverImmersed,false);
});
test('without the Mother, ordinary river falls still allow escape up either southern ramp',()=>{
 for(const hz of [20,60,120])for(const side of [-1,1]){
  const s=createState('rio'),a=getArena('rio');
  Object.assign(s,{phase:'playing',portalUsed:true,health:100,wave:3,pending:1,nextSpawn:Infinity,riverStartedAt:-26});
  Object.assign(s.player,{x:0,y:5,z:27,yaw:0});
  for(let i=0;i<hz*6&&!s.riverImmersed;i++)step(s,{forward:1},1/hz);
  assert.ok(s.riverImmersed);assert.ok(!s.motherCapture);assert.ok(!s.enemies.some(e=>e.kind==='madre'));
  const started=s.time;
  // The bank is a five-metre wall. Reach a ramp's low foot through the open
  // channel, then climb it using normal movement; no jump or recovery teleport.
  for(const target of [{x:0,z:9.4},{x:side*14,z:9.4},{x:side*14,z:23}]){
   let frames=0;
   while(Math.hypot(target.x-s.player.x,target.z-s.player.z)>.2&&s.phase==='playing'&&frames++<hz*5){
    const before={x:s.player.x,z:s.player.z};
    s.player.yaw=Math.atan2(-(target.x-s.player.x),-(target.z-s.player.z));
    step(s,{forward:1},1/hz);
    assert.ok(Math.hypot(s.player.x-before.x,s.player.z-before.z)<=7.4/hz+.001);
    assert.ok(!a.solid(s.player.x,s.player.z,.32,s.player.y,1.75));
   }
   assert.ok(frames<hz*5,'ordinary movement reaches each ramp waypoint');
  }
  assert.equal(s.phase,'playing');assert.equal(s.player.y,5);assert.equal(s.riverImmersed,false);
  assert.ok(s.time-started<5.5);assert.ok(s.health>=57.9);assert.equal(s.shield,100);
  assert.ok(!s.events.some(e=>e.type==='fallRecovery'||e.type==='ascension'));
  const health=s.health;tick(s,.3,hz);assert.equal(s.health,health);
 }
});
test('drag pauses and clears on timeout, jump-pad flight, boss death and player death',()=>{
 for(const reason of ['paused','timeout','flight','boss','player']){
  const s=setup(),e=fly(s);beginMotherDrag(s,e);
  if(reason==='paused'){s.phase='paused';const before=JSON.stringify(s.motherDrag);updateMotherDrag(s,10);assert.equal(JSON.stringify(s.motherDrag),before);continue;}
  if(reason==='timeout'){for(let i=0;i<260;i++)updateMotherDrag(s,1/60);}
  if(reason==='flight'){s.player.flight={remaining:1};updateMotherDrag(s,.1);}
  if(reason==='boss')hitEnemy(s,e,20000);
  if(reason==='player')damagePlayer(s,500);
  assert.equal(s.motherDrag,null);assert.ok(!s.motherDarkness);
 }
});
test('submerged death emerges for one wordless scream, ascends, then permits wave 11',()=>{
 for(const demo of [true,false]){
  const s=setup(),e=s.enemies[0];if(!demo)s.mode='arena';const y=e.y;hitEnemy(s,e,20000);
  tick(s,.2);assert.ok(e.y>y&&e.y<e.waterLevel+.6);tick(s,1.1);assert.ok(e.y>e.waterLevel+.6);assert.equal(s.wave,10);assert.equal(s.phase,'playing');assert.equal(madrePose(e,s).state,'death');
  damagePlayer(s,500);assert.equal(s.health,100);assert.equal(s.phase,'playing');
  tick(s,MADRE.deathDuration-1.8);assert.equal(s.phase,'playing');assert.equal(s.wave,10);assert.equal(s.events.filter(x=>x.type==='motherDeathCry').length,1);
  tick(s,.6);assert.equal(s.kills,1);
  if(demo){assert.equal(s.phase,'boss-demo-complete');assert.ok(continueBossDemo(s));tick(s,.1);}
  else tick(s,4.1);
  assert.equal(s.wave,11);assert.ok(!s.enemies.some(e=>e.kind==='titan'));
 }
});
test('authored sprite animations and wordless farewell remain packaged',()=>{
 const root=new URL('../public/assets/img/umbral-demo/',import.meta.url),a=JSON.parse(readFileSync(new URL('assets.json',root)));
 const report=JSON.parse(readFileSync(new URL('../design/umbral/madre-ahogo-v1/audio-report.json',import.meta.url)));
 assert.ok(report['madre-death'].encoded.duration+.4<MADRE.deathDuration);
 assert.equal(a.enemies.madre.states.death.durations.reduce((a,b)=>a+b,0),MADRE.deathDuration*1000);
 for(const name of ['move','wave','hands','rush','hurt','death']){const seq=a.enemies.madre.states[name];assert.equal(seq.frames,4);assert.deepEqual(seq.frameSize,[256,256]);assert.ok(existsSync(new URL(seq.file,root)));}
 for(const name of ['madre-wave','madre-hands'])assert.ok(existsSync(new URL(a.effects[name].file,root)));
 for(const name of ['arrival','presence','windup','wave','hands','hurt','death'])assert.ok(existsSync(new URL('../public/assets/audio/umbral/enemies/madre-'+name+'.mp3',import.meta.url)));
});
