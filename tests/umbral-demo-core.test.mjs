import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../public/assets/js/umbral-core.mjs';

const { createState, WEAPONS, ENEMY_TYPES, PORTAL_Z, step, fire, selectWeapon, damagePlayer,
  hitEnemy, move, solid, visible, wallDistance, INITIAL_AMMO, ammoForWeapon, activateFlames } = core;

function playing({ entered = false, x = 0, z = 35, yaw = 0 } = {}) {
  const state = createState();
  state.phase = 'playing';
  state.portalUsed = entered;
  state.player = { x, z, y:0, vy:0, height:1.75, yaw, pitch: 0 };
  state.nextWave = 100;
  return state;
}

function enemy(id, x, z, hp = 100) {
  return { ...ENEMY_TYPES.macabro, id, x, z, y:0, vy:0, hp, kind: 'macabro', anim: 'move', animTime: 0,
    attack: 20, stun: 0, deadTime: 0, turn: 1, cast:null, charge:null, attacks:0 };
}

function advance(state, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += .05) {
    step(state, input, Math.min(.05, seconds - elapsed));
  }
}

function near(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

test('a fresh run starts at five health with six weapons and two separate special powers', () => {
  const state = createState();
  assert.equal(state.health, 5);
  assert.equal(state.portalUsed, false);
  assert.equal(state.selected, 1);
  assert.equal(WEAPONS.length, 6);
  assert.deepEqual(state.ammo, INITIAL_AMMO);
  for (const index of [0,1,2,3,4,5]) {
    assert.equal(selectWeapon(state, index), true);
    assert.equal(state.selected, index);
    assert.ok(ammoForWeapon(state,index) > 0);
  }
  assert.equal(selectWeapon(state, -1), false);
  assert.equal(selectWeapon(state, 6), false);
  assert.equal(selectWeapon(state, 1.5), false);
  assert.equal(state.selected, 5);
});

test('the threshold restores exactly 100 health once and begins the wave countdown', () => {
  const state = playing({ z: PORTAL_Z + .1 });
  state.health = 2;
  step(state, { forward: 1 }, .05);
  assert.equal(state.portalUsed, true);
  assert.equal(state.health, 100);
  assert.ok(state.nextWave > 0 && state.nextWave < 2);
  assert.equal(state.events.filter(event => event.type === 'portal').length, 1);
  damagePlayer(state, 37);
  state.player.z = PORTAL_Z + .1;
  step(state, { forward: 1 }, .05);
  assert.equal(state.health, 100);
  assert.equal(state.shield, 63);
  assert.equal(state.events.filter(event => event.type === 'portal').length, 1);
});

test('the entrance remains safe and enemies do not update before crossing', () => {
  const state = playing();
  const target = enemy(1, 0, 34);
  target.attack = 0;
  state.enemies.push(target);
  const before = structuredClone(target);
  damagePlayer(state, 500);
  advance(state, 1);
  assert.equal(state.health, 5);
  assert.equal(state.phase, 'playing');
  assert.equal(state.wave, 0);
  assert.deepEqual(target, before);
  assert.equal(state.projectiles.length, 0);
});

test('ammunition is a direct accumulated reserve without a reload or magazine state', () => {
  const state = playing();
  assert.equal('reload' in core, false);
  assert.equal('reload' in state, false);
  assert.equal('magazine' in state, false);
  assert.ok(WEAPONS.every(weapon => !('magazine' in weapon) && !('reloadTime' in weapon)));
  selectWeapon(state, 1);
  const initial = state.ammo.small;
  for (let i = 0; i < 20; i++) {
    assert.equal(fire(state), true);
    advance(state, Math.max(WEAPONS[1].delay,state.shotgunCycleRemaining) + .01);
  }
  assert.equal(state.ammo.small, initial - 20);
});

test('ammo supplies fill one shared reserve and respect their respawn timer', () => {
  const state = playing({ entered: true, z: 3 });
  const original = {...state.ammo};
  step(state, {}, .01);
  assert.deepEqual(state.ammo,{...original,large:original.large+4});
  const once = {...state.ammo};
  advance(state, 1);
  assert.deepEqual(state.ammo, once);
  const nextType=state.supplies.find(p=>p.x===0&&p.z===3).ammoType;
  advance(state,17.1);
  const amount=state.ammo[nextType]-once[nextType];
  if(nextType==='obsidian')assert.ok(amount>=10&&amount<=18);else assert.equal(amount,nextType==='small'?10:4);
});

test('fire obeys weapon cadence and secondary attacks use the shared reserve', () => {
  const state = playing();
  selectWeapon(state, 5);
  const initial = state.ammo.large;
  assert.equal(fire(state), true);
  assert.equal(fire(state), false);
  assert.equal(state.ammo.large, initial - 1);
  assert.equal(state.shotSerial, 1);
  advance(state, WEAPONS[5].delay + .01);
  assert.equal(fire(state, true), true);
  assert.equal(state.ammo.large, initial - 4);
  assert.equal(state.shotSerial, 2);
  assert.ok(state.cooldown > WEAPONS[5].delay);
});

test('insufficient ammunition causes no shot, damage, or negative reserve', () => {
  const state = playing({ entered: true, z: 8 });
  selectWeapon(state, 5);
  state.ammo.large = 0;
  const target = enemy(1, 0, 4);
  state.enemies.push(target);
  assert.equal(fire(state), false);
  assert.equal(state.ammo.large, 0);
  assert.equal(state.shotSerial, 0);
  assert.equal(target.hp, 100);
  state.cooldown = 0;
  state.ammo.large = 2;
  assert.equal(fire(state, true), false);
  assert.equal(state.ammo.large, 2);
  assert.equal(target.hp, 100);
});

test('melee weapons remain usable without a finite ammo reserve', () => {
  const state = playing();
  for (const index of [0]) {
    selectWeapon(state, index);
    state.cooldown = 0;
    assert.equal(fire(state), true);
    assert.equal(ammoForWeapon(state,index), Infinity);
  }
});

test('WASD directions rotate with view yaw and diagonal speed is normalized', () => {
  for (const [yaw, input, dx, dz] of [
    [0, { forward: 1 }, 0, -1],
    [0, { forward: -1 }, 0, 1],
    [0, { strafe: 1 }, 1, 0],
    [0, { strafe: -1 }, -1, 0],
    [Math.PI / 2, { forward: 1 }, -1, 0],
    [Math.PI / 2, { strafe: 1 }, 0, -1],
  ]) {
    const state = playing({ entered: true, x: 0, z: 0, yaw });
    step(state, input, .05);
    near(state.player.x, dx * 7.4 * .05);
    near(state.player.z, dz * 7.4 * .05);
  }
  const diagonal = playing({ entered: true, z: 0 });
  step(diagonal, { forward: 1, strafe: 1 }, .05);
  near(Math.hypot(diagonal.player.x, diagonal.player.z), 7.4 * .05);
});

test('wall collision prevents tunneling and permits sliding alongside a pillar', () => {
  const body = { x: 7, z: 12 };
  move(body, 0, -15);
  assert.ok(body.z >= 8.9 + .32);
  assert.equal(solid(body.x, body.z), false);
  const beforeX = body.x;
  move(body, 2, -1);
  assert.ok(body.x > beforeX);
  assert.equal(solid(body.x, body.z), false);
  const entrance = { x: 0, z: 35 };
  move(entrance, 20, 0);
  assert.ok(entrance.x < 4);
  assert.equal(solid(entrance.x, entrance.z), false);
});

test('rays and rifle fire stop at arena walls and pillars', () => {
  near(wallDistance(7, 12, 0, -1), 3.1);
  assert.equal(visible({ x: 7, z: 12 }, { x: 7, z: 4 }), false);
  const state = playing({ entered: true, x: 7, z: 12 });
  state.enemies.push(enemy(1, 7, 4));
  selectWeapon(state, 2);
  assert.equal(fire(state), true);
  assert.equal(state.enemies[0].hp, 100);
  const trace = state.events.find(event => event.type === 'trace');
  near(trace.tz, 8.9);
});

test('a normal rifle shot hits only the nearest aligned enemy', () => {
  const state = playing({ entered: true, z: 8 });
  state.enemies.push(enemy(1, 0, 4), enemy(2, 0, 0));
  selectWeapon(state, 2);
  fire(state);
  assert.equal(state.enemies[0].hp, 100 - WEAPONS[2].damage);
  assert.equal(state.enemies[1].hp, 100);
});

test('Gauss penetrates aligned enemies but cannot penetrate a wall', () => {
  const state = playing({ entered: true, z: 18 });
  state.enemies.push(enemy(1, 0, 14), enemy(2, 0, 10), enemy(3, 0, 2), {...enemy(4, 0, -26),y:3});
  selectWeapon(state, 5);
  fire(state);
  assert.equal(state.kills, 3);
  assert.ok(state.enemies.slice(0, 3).every(target => target.hp <= 0));
  assert.equal(state.enemies[3].hp, 100);
});

test('flame and melee attacks require proximity, facing, and line of sight', () => {
  for (const index of [0]) {
    const state = playing({ entered: true, x: 7, z: 10 });
    state.enemies.push(enemy(1, 7, 5), enemy(2, 7, 11.4));
    selectWeapon(state, index);
    fire(state);
    assert.ok(state.enemies.every(target => target.hp === 100));
  }
  const state = playing({ entered: true, z: 5 });
  state.enemies.push(enemy(1, 0, 3), enemy(2, 0, -3));
  activateFlames(state);
  step(state, {}, .05);
  assert.equal(state.enemies[0].hp, 97.75);
  assert.equal(state.enemies[1].hp, 100);
});

test('a kill is counted once even if the corpse is damaged repeatedly', () => {
  const state = playing({ entered: true });
  const target = enemy(1, 0, 0);
  hitEnemy(state, target, 100);
  hitEnemy(state, target, 100);
  assert.equal(state.kills, 1);
  assert.equal(target.anim, 'death');
  assert.equal(state.events.filter(event => event.type === 'kill').length, 1);
});

test('pausing and death freeze simulation and prohibit firing', () => {
  for (const phase of ['paused', 'dead']) {
    const state = playing({ entered: true, z: 0 });
    state.enemies.push(enemy(1, 0, -3));
    state.phase = phase;
    const snapshot = structuredClone(state);
    step(state, { forward: 1, primary: true }, .05);
    assert.equal(fire(state), false);
    assert.deepEqual(state, snapshot);
  }
  const state = playing({ entered: true });
  damagePlayer(state, 500);
  assert.equal(state.health, 0);
  assert.equal(state.phase, 'dead');
  const snapshot = structuredClone(state);
  advance(state, 1, { forward: 1, primary: true });
  assert.deepEqual(state, snapshot);
});

test('new runs do not retain health, ammunition, enemies, or pickup timers from death', () => {
  const old = playing({ entered: true });
  old.ammo.small = 0;
  old.enemies.push(enemy(99, 0, 0));
  old.supplies[0].cooldown = 17;
  old.selected = 4;
  old.kills = 20;
  old.wave = 9;
  damagePlayer(old, 500);
  const fresh = createState();
  assert.equal(fresh.health, 5);
  assert.equal(fresh.phase, 'ready');
  assert.equal(fresh.selected, 1);
  assert.equal(fresh.portalUsed, false);
  assert.equal(fresh.wave, 0);
  assert.equal(fresh.kills, 0);
  assert.equal(fresh.enemies.length, 0);
  assert.equal(fresh.projectiles.length, 0);
  assert.equal(fresh.ammo.small, INITIAL_AMMO.small);
  assert.ok(fresh.supplies.every(supply => supply.cooldown === 0));
  assert.equal(old.ammo.small, 0);
});

test('waves wait for all pending spawns and living enemies before progressing', () => {
  const state = playing({ z: PORTAL_Z + .1 });
  step(state, { forward: 1 }, .05);
  advance(state, 2.1);
  assert.equal(state.wave, 1);
  assert.equal(state.pending, 8);
  state.pending = 1;
  state.nextSpawn = 100;
  advance(state, 1);
  assert.equal(state.wave, 1);
  state.pending = 0;
  state.spawnWarnings.push({id:200,kind:'macabro',x:0,z:-19,y:0,remaining:.5,total:1.25});
  advance(state, .2);
  assert.equal(state.wave, 1);
  assert.equal(state.spawnWarnings.length, 1);
  advance(state, .4);
  assert.equal(state.enemies.length, 1);
  assert.equal(state.spawnWarnings.length, 0);
  const remaining = state.enemies.find(target => target.hp > 0);
  assert.ok(remaining);
  advance(state, 1);
  assert.equal(state.wave, 1);
  hitEnemy(state, remaining, 1000);
  advance(state, 3);
  assert.equal(state.wave, 1);
  advance(state, 1.05);
  assert.equal(state.wave, 2);
  assert.equal(state.pending, 10);
});
