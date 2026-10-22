import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createEnemy,selectWeapon,fire,step,setRifleScope,RIFLE_SCOPE,activateFlames,activateMacuahuitl,INITIAL_AMMO} from '../public/assets/js/umbral-core.mjs';
function run(){const s=createState();Object.assign(s,{phase:'playing',portalUsed:true,nextWave:999,nextAmmoSpawn:999,supplies:[]});Object.assign(s.player,{x:0,y:0,z:24,yaw:0,pitch:0});return s;}
function tick(s,seconds,input={}){while(seconds>1e-8){const dt=Math.min(seconds,.05);step(s,input,dt);seconds-=dt;}}
test('holding right aims without firing, left fires a powerful purple sniper ray',()=>{
 const s=run();selectWeapon(s,2);const enemy=createEnemy(s,'centinela',{x:0,y:0,z:17});enemy.speed=0;enemy.attack=999;
 const ammo=s.ammo.obsidian;assert.equal(fire(s,true),true);tick(s,3,{secondary:true});
 assert.equal(s.rifleScoped,true);assert.equal(s.shotSerial,0);assert.equal(s.ammo.obsidian,ammo);assert.equal(enemy.hp,620);
 tick(s,.01,{secondary:true,primary:true});assert.equal(s.shotSerial,1);assert.equal(enemy.hp,620-RIFLE_SCOPE.damage);assert.equal(s.ammo.obsidian,ammo-3);
 const ray=s.events.find(e=>e.type==='sniperTrail');assert.ok(ray);assert.equal(ray.secondary,true);assert.ok(ray.tz<ray.z);
 tick(s,.69,{secondary:true,primary:true});assert.equal(s.shotSerial,1);
 tick(s,.01,{secondary:true,primary:true});assert.equal(s.shotSerial,2);
});
test('sniper keeps its .7 second rhythm and 120 damage at 20, 60 and 120 simulation steps per second',()=>{
 assert.equal(RIFLE_SCOPE.cooldown,.7);assert.equal(RIFLE_SCOPE.damage,120);
 for(const hz of [20,60,120]){
  const s=run();selectWeapon(s,2);s.ammo.obsidian=200;
  const enemy=createEnemy(s,'centinela',{x:0,y:0,z:17});enemy.hp=enemy.maxHp=10000;enemy.speed=0;enemy.attack=999;
  step(s,{secondary:true},1/hz);assert.equal(s.shotSerial,0,'aiming never fires');
  const shots=[];
  for(let i=0;i<hz*2.15;i++){const before=s.shotSerial;step(s,{secondary:true,primary:true},1/hz);if(s.shotSerial>before)shots.push(s.time);}
  assert.equal(shots.length,4);assert.equal(enemy.hp,10000-shots.length*120);assert.equal(s.ammo.obsidian,200-shots.length*3);
  for(let i=1;i<shots.length;i++)assert.ok(Math.abs(shots[i]-shots[i-1]-.7)<1/hz+1e-8);
 }
});
test('scope release, powers and selection cancel aiming; scoped cooldown freezes on pause and resets on restart',()=>{
  const s=run();selectWeapon(s,2);setRifleScope(s,true);fire(s);const remaining=s.rifleSecondaryCooldown;
  s.phase='paused';tick(s,5);assert.equal(s.rifleSecondaryCooldown,remaining);s.phase='playing';
  step(s,{},.05);assert.equal(s.rifleScoped,false);tick(s,.2);assert.equal(fire(s),true,'normal automatic fire remains available');
  setRifleScope(s,true);activateFlames(s);assert.equal(s.rifleScoped,false);s.flameRemaining=0;
  setRifleScope(s,true);activateMacuahuitl(s);assert.equal(s.rifleScoped,false);s.macuahuitlRemaining=0;
  setRifleScope(s,true);selectWeapon(s,3);assert.equal(s.rifleScoped,false);
  assert.equal(createState().rifleSecondaryCooldown,0);assert.equal(createState().rifleScoped,false);
});
test('insufficient scoped ammo cannot fire or start its cooldown',()=>{
  const s=run();selectWeapon(s,2);s.ammo.obsidian=2;fire(s,true);assert.equal(fire(s),false);assert.equal(s.rifleSecondaryCooldown,0);assert.equal(s.ammo.obsidian,2);
});
test('submachine gun sustains fast fire from an independent finite reserve without reload',()=>{
  const s=run();selectWeapon(s,3);const before={...s.ammo};tick(s,1,{primary:true});
  assert.ok(s.shotSerial>=10);assert.equal(s.ammo.thorns,before.thorns-s.shotSerial);
  for(const type of ['small','large','obsidian'])assert.equal(s.ammo[type],before[type]);
  s.ammo.thorns=0;s.cooldown=0;assert.equal(fire(s),false);assert.equal(s.ammo.thorns,0);
  assert.equal(createState().ammo.thorns,INITIAL_AMMO.thorns);
});
test('thorn ammo spawns in both arenas and physical pickups grant only 20–30 thorns',()=>{
  for(const map of ['cuenca','corona']){
    const initial=createState(map);assert.ok(initial.supplies.some(p=>p.kind==='ammo'&&p.ammoType==='thorns'));
    const found=new Set();
    for(let seed=1;seed<=300;seed++){
      const s=run();s.mapId=map;s.seed=seed;s.nextAmmoSpawn=0;step(s,{},.01);
      const drop=s.drops.find(d=>d.ammoType==='thorns');if(!drop)continue;
      assert.ok(drop.amount>=20&&drop.amount<=30);found.add(drop.amount);
      drop.age=1;const before={...s.ammo};Object.assign(s.player,{x:drop.x,y:drop.y,z:drop.z});step(s,{},.01);
      assert.equal(s.ammo.thorns,before.thorns+drop.amount);assert.equal(s.ammo.obsidian,before.obsidian);
    }
    assert.equal(found.size,11);
  }
});

test('release right returns to normal automatic fire without sniper trail',()=>{
 const s=run();selectWeapon(s,2);tick(s,.05,{secondary:true});tick(s,.05,{primary:true});
 assert.equal(s.rifleScoped,false);assert.equal(s.shotSerial,1);assert.equal(s.ammo.obsidian,59);assert.ok(!s.events.some(e=>e.type==='sniperTrail'));
});
