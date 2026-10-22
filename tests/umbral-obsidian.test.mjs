import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,step,fire,selectWeapon,WEAPONS,INITIAL_AMMO,solid} from '../public/assets/js/umbral-core.mjs';
function run(){const s=createState();s.phase='playing';s.portalUsed=true;s.health=100;s.nextWave=999;s.nextAmmoSpawn=999;Object.assign(s.player,{x:0,z:12,y:0});return s;}

test('assault rifle uses obsidian for both attacks',()=>{
  assert.deepEqual(WEAPONS.filter(w=>w.ammoType==='obsidian').map(w=>w.id),['clavadora']);
  for(const index of [2])for(const secondary of [false,true]){
    const s=run(),before={...s.ammo};selectWeapon(s,index);if(secondary)fire(s,true);assert.equal(fire(s,false),true);
    assert.ok(s.ammo.obsidian<before.obsidian);assert.equal(s.ammo.small,before.small);assert.equal(s.ammo.large,before.large);
    s.cooldown=0;s.rifleSecondaryCooldown=0;s.ammo.obsidian=0;assert.equal(fire(s,false),false);assert.equal(s.ammo.obsidian,0);
  }
});

test('random arena spawns include sharp-stone ammo in the inclusive 10â€“18 range',()=>{
  const amounts=new Set(),types=new Set();
  for(let seed=1;seed<=300;seed++){
    const s=run();s.seed=seed;s.supplies=[];s.nextAmmoSpawn=0;step(s,{},.01);
    assert.equal(s.drops.length,1);const d=s.drops[0];types.add(d.ammoType);
    assert.equal(solid(d.x,d.z,.18,d.y,.3),false);
    if(d.ammoType!=='obsidian')continue;
    amounts.add(d.amount);assert.ok(Number.isInteger(d.amount)&&d.amount>=10&&d.amount<=18);
  }
  assert.deepEqual([...types].sort(),['large','obsidian','small','thorns']);
  assert.equal(amounts.size,9);assert.ok(amounts.has(10)&&amounts.has(18));
});

test('obsidian pickup replenishes only its reserve once, and new runs restore it',()=>{
  const s=run();s.supplies=[];s.ammo.obsidian=0;
  s.drops.push({id:999,x:0,z:12,y:0,vy:0,collisionHeight:.3,collisionRadius:.18,ammoType:'obsidian',amount:18,source:'arena',age:1,life:45});
  const before={...s.ammo};step(s,{},.01);
  assert.deepEqual(s.ammo,{...before,obsidian:18});assert.equal(s.drops.length,0);
  assert.ok(s.events.some(e=>e.type==='pickup'&&e.ammoType==='obsidian'&&e.amount===18));
  step(s,{},.05);assert.equal(s.ammo.obsidian,18);assert.deepEqual(createState().ammo,INITIAL_AMMO);
});

test('obsidian supplies give 10â€“18 units and randomize their next type after the respawn timer',()=>{
  const amounts=new Set(),types=new Set();
  for(let seed=1;seed<=300;seed++){
    const s=run();s.seed=seed*99991;const pickup=s.supplies.find(p=>p.kind==='ammo'&&p.ammoType==='obsidian');
    Object.assign(s.player,{x:pickup.x,y:pickup.y,z:pickup.z});const before={...s.ammo};
    step(s,{},.01);const amount=s.ammo.obsidian-before.obsidian;amounts.add(amount);types.add(pickup.ammoType);
    assert.ok(amount>=10&&amount<=18);assert.equal(s.ammo.small,before.small);assert.equal(s.ammo.large,before.large);
    assert.equal(pickup.cooldown,18);step(s,{},.05);assert.equal(s.ammo.obsidian,before.obsidian+amount);
  }
  assert.equal(amounts.size,9);assert.equal(types.size,4);
});
