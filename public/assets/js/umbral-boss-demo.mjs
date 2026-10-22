import {createState,createEnemy} from './umbral-core.mjs';
import {getArena} from './umbral-arena.mjs';

export const isBossDemo=s=>s?.mode==='boss-demo'||s?.mapId==='titan-demo';
export function createBossDemoState(kind='titan'){
  kind=['madre','desollador'].includes(kind)?kind:'titan';
  const s=createState(kind==='madre'?'rio':kind==='desollador'?'corona':'titan-demo');
  Object.assign(s,{mode:'boss-demo',demoBoss:kind,bossDemoWon:false,portalUsed:true,health:100,shield:100,wave:10,clearedWave:9,bossSpawned:true,bossPending:false,pending:0});
  s.ammo={small:240,large:180,obsidian:480,thorns:600};
  if(kind==='desollador')Object.assign(s.player,{x:5,y:0,z:27,yaw:0,pitch:.08});
  if(kind==='madre')Object.assign(s.player,{x:0,y:5,z:27,yaw:0,pitch:0});
  const boss=createEnemy(s,kind,kind==='desollador'?{x:5,y:1.2,z:8}:getArena(s.mapId).BOSS_SPAWNS[0]);
  if(kind==='madre'){
    const dx=boss.x-s.player.x,dz=boss.z-s.player.z;
    s.player.yaw=Math.atan2(-dx,-dz);
    s.player.pitch=Math.atan2(boss.waterLevel+.8-(s.player.y+1.6),Math.hypot(dx,dz));
  }
  boss.attack=2.5;
  return s;
}
export function continueBossDemo(s){
  if(!isBossDemo(s)||s.phase!=='boss-demo-complete')return false;
  s.phase='playing';s.bossDemoWon=true;s.nextWave=.05;
  return true;
}
