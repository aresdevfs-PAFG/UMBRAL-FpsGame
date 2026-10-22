import {getArena} from './umbral-arena.mjs';

export const ENEMY_SAMPLES=Object.freeze([
  ...['macabro','devorador'].flatMap(kind=>['presence','attack','hurt','death'].map(action=>`${kind}-${action}`)),
  ...['arrival','step','leap','landing','hurt','rage','skulls','summon','downed','death'].map(action=>`titan-${action}`),
  ...['presence','windup','attack','hurt','death'].map(action=>`abominacion-${action}`),
  ...['presence','windup','attack','slam','hurt','death'].map(action=>`centinela-${action}`),
  ...['empalador','tejedor','acechador'].flatMap(kind=>['presence','windup','attack','hurt','death'].map(action=>`${kind}-${action}`)),
  'tejedor-channel','acechador-landing',
  ...['presence','arrival','windup','attack','dive','suction','hurt','death'].map(action=>`desollador-${action}`),
  ...['presence','arrival','windup','wave','hands','darkness','screamer','hurt','parry','death'].map(action=>`madre-${action}`),
]);
const LIMIT=8,LOOP_LIMIT=2,MASTER=.6;
const kinds=new Set(['macabro','devorador','titan','abominacion','centinela','empalador','tejedor','acechador','desollador','madre']);
const bossSamples={bossLeap:'leap',bossLanding:'landing',bossRecovery:'leap',bossRage:'rage',bossSkulls:'skulls',bossSummon:'summon'};
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const sourcePoint=e=>({x:e.x,y:(e.y||0)+(e.height||2)*.5,z:e.z});

// Samples are decoded at boot. Combat only allocates bounded Web Audio voices.
export async function loadEnemyAudio(context,root='./assets/audio/umbral/enemies/',destination=context.destination){
  const buffers=new Map(),levels=new Map();
  const results=await Promise.allSettled(ENEMY_SAMPLES.map(async name=>{
    const revision=name==='madre-death'?'?v=7':name==='madre-presence'?'?v=4':'';
    const response=await fetch(root+name+'.mp3'+revision);
    if(!response.ok)throw new Error('Missing enemy audio: '+name);
    const buffer=await context.decodeAudioData(await response.arrayBuffer());
    let peak=0;
    for(let c=0;c<buffer.numberOfChannels;c++)for(const value of buffer.getChannelData(c))peak=Math.max(peak,Math.abs(value));
    buffers.set(name,buffer);levels.set(name,peak>.001?Math.min(3,.8/peak):1);
  }));
  const missing=results.flatMap((r,i)=>r.status==='rejected'?[ENEMY_SAMPLES[i]]:[]);
  if(missing.length)console.warn('UMBRAL: audio de enemigos no disponible',missing);
  const master=context.createGain();master.gain.value=MASTER;master.connect(destination);
  const active=new Set(),hurts=new Map(),presence=new Map(),species=new Map(),seen=new Set(),deaths=new Set(),steps=new Map(),occlusion=new Map(),bossEvents=new Map();
  let disposed=false,state=null,lastSync=-Infinity,lastFinalSync=-Infinity,sequence=0;
  function release(v){if(!v||!active.delete(v))return;v.source.disconnect();v.gain.disconnect();v.panner?.disconnect();}
  function halt(v){if(!v)return;try{v.source.stop();}catch{}release(v);}
  function stop(){for(const v of [...active])halt(v);lastSync=-Infinity;lastFinalSync=-Infinity;steps.clear();}
  function bind(s){
    if(state===s)return;
    stop();state=s;hurts.clear();presence.clear();species.clear();seen.clear();deaths.clear();occlusion.clear();bossEvents.clear();
  }
  function spatial(s,q,range=48){
    const p=s.player,dx=q.x-p.x,dz=q.z-p.z,dy=(q.y||0)-(p.y||0)-1.6,d=Math.hypot(dx,dy,dz);
    return {volume:d>=range?0:(1-d/range)**2/(1+d*d/144),pan:clamp((dx*Math.cos(p.yaw||0)-dz*Math.sin(p.yaw||0))/Math.max(.001,Math.hypot(dx,dz)),-1,1)};
  }
  // Only short event sounds trace walls; moving loops use distance and direction.
  function obstruction(s,q,id){
    if(!s.mapId)return 1;
    const now=s.time||0,key=`${s.mapId}:${id}`,cached=occlusion.get(key);
    if(cached&&now-cached.time<.6)return cached.value;
    let value=1;
    try{
      const a=getArena(s.mapId),p=s.player,dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);
      if(d>.1&&a.wallDistance(p.x,p.z,dx/d,dz/d,d,(p.y||0)+1.6,((q.y||0)-(p.y||0)-1.6)/d)<d-.1)value=.38;
    }catch{}
    occlusion.set(key,{time:now,value});return value;
  }
  function start(name,s,q,{id,priority=2,volume=.7,loop=false,final=false,cinematic=false,range=48,ray=true,follow=true,listener=false}={}){
    const buffer=buffers.get(name);if(disposed||!buffer)return null;
    const position=spatial(s,q,range);
    if(position.volume<.003)return null;
    if(active.size>=LIMIT){
      const victim=[...active].sort((a,b)=>a.priority-b.priority||a.sequence-b.sequence)[0];
      if(victim.priority>priority)return null;
      halt(victim);
    }
    const source=context.createBufferSource(),gain=context.createGain(),panner=context.createStereoPanner?.();
    source.buffer=buffer;source.loop=loop;
    source.playbackRate.value=loop||name==='madre-death'?1:1+(((Number(id)||0)%5)-2)*.012;
    source.connect(gain);if(panner){gain.connect(panner);panner.connect(master);panner.pan.value=position.pan;}else gain.connect(master);
    const base=volume*(ray&&!loop?obstruction(s,q,id):1),value=base*position.volume*levels.get(name);
    gain.gain.value=value;
    const actor=s.enemies?.find(e=>e.id===id);
    const voice={name,id,source,gain,panner,priority,loop,final,cinematic,listener,base,range,sequence:sequence++,
      point:{x:q.x,y:q.y||0,z:q.z},yOffset:actor&&follow?(q.y||0)-(actor.y||0):null};
    active.add(voice);source.onended=()=>release(voice);
    source.start(0,loop?((s.time||0)%Math.max(.001,buffer.duration)):0);
    return voice;
  }
  function updatePositions(s,actors){
    for(const voice of active){
      const actor=actors.get(voice.id);
      // Keep a death tail at its last world position after the corpse disappears.
      if(voice.listener){voice.point.x=s.player.x;voice.point.y=(s.player.y||0)+1.6;voice.point.z=s.player.z;}
      else if(actor&&voice.yOffset!==null){voice.point.x=actor.x;voice.point.y=(actor.y||0)+voice.yOffset;voice.point.z=actor.z;}
      const p=spatial(s,voice.point,voice.range);
      voice.gain.gain.setTargetAtTime(voice.base*p.volume*levels.get(voice.name),context.currentTime,.06);
      voice.panner?.pan.setTargetAtTime(p.pan,context.currentTime,.06);
    }
  }
  function ambient(s,e){
    if(e.kind==='titan'||e.kind==='devorador')return;
    const now=s.time||0;
    if(now<(presence.get(e.id)||0)||now<(species.get(e.kind)||0))return;
    const voice=start(`${e.kind}-presence`,s,sourcePoint(e),{id:e.id,priority:1,volume:.42,range:32});
    if(voice){presence.set(e.id,now+7+(e.id%5));species.set(e.kind,now+1.6);}
  }
  function rememberSpawn(s,e){
    if(seen.has(e.id)||e.trainingDummy||!kinds.has(e.kind))return;
    seen.add(e.id);
    if(e.kind==='titan'&&!e.downed)start('titan-arrival',s,sourcePoint(e),{id:e.id,priority:4,volume:.95,range:75});
    else if(e.kind==='desollador')start('desollador-arrival',s,sourcePoint(e),{id:e.id,priority:4,volume:.95,range:75});
    else if(e.kind==='madre')start('madre-arrival',s,sourcePoint(e),{id:e.id,priority:4,volume:.95,range:90});
    else ambient(s,e);
  }
  function stopChannel(id){for(const voice of [...active])if(voice.id===id&&voice.name==='tejedor-channel')halt(voice);}
  function event(e,s,enabled=true){
    if(disposed)return;bind(s);
    if(!enabled||s.mode==='tutorial'||s.mapId==='tutorial'){stop();return;}
    const final=e.type==='bossFinisherEnd';
    if(s.phase!=='playing'&&!(final&&s.phase==='boss-demo-complete')){stop();return;}
    const enemy=s.enemies?.find(o=>o.id===e.id),kind=e.kind||enemy?.kind||(e.type.startsWith('boss')?'titan':null);
    if(enemy?.trainingDummy||s.mode==='tutorial'||!kinds.has(kind))return;
    const q=Number.isFinite(e.x)&&Number.isFinite(e.z)?e:enemy?sourcePoint(enemy):null;
    if(!q)return;
    if(kind==='madre'){
      if(e.type==='motherCaptureStart'){for(const v of [...active])if(v.id===e.id)halt(v);return;}
      if(e.type==='motherScreamer'){
        const key=`${e.id}:motherScreamer`,now=s.time||0;
        if(now-(bossEvents.get(key)??-Infinity)<.25)return;bossEvents.set(key,now);
        for(const v of [...active])if(v.id===e.id)halt(v);
        start('madre-death',s,{...s.player,y:s.player.y+1.6},{id:e.id,priority:5,volume:.9,cinematic:true,range:120,follow:false,ray:false,listener:true});return;
      }
      if(e.type==='motherDragEnd'||e.type==='kill'){for(const v of [...active])if(v.id===e.id)halt(v);return;}
      if(e.type==='motherDeathCry'){
        if(deaths.has(e.id))return;deaths.add(e.id);
        start('madre-death',s,{...s.player,y:s.player.y+1.6},{id:e.id,priority:5,volume:.85,final:true,range:120,follow:false,ray:false});return;
      }
      const cue=({motherRise:'screamer',motherDragStart:'hands',bossRage:'arrival'})[e.type];
      if(cue){start('madre-'+cue,s,q,{id:e.id,priority:4,volume:.8,range:80,follow:false,ray:false});return;}
      if(e.type==='enemyAttack'){start('madre-'+(e.attack==='hands'?'hands':'wave'),s,q,{id:e.id,priority:3,volume:.8,range:75});return;}
    }
    if(e.type==='bossFinisherStart'){stop();return;}
    if(e.type==='bossStab'){
      const key=`${e.id}:bossStab`;
      if(s.bossFinish?.phase==='executing'&&!bossEvents.has(key)){
        bossEvents.set(key,s.time||0);
        start('titan-hurt',s,q,{id:e.id,priority:4,volume:.75,cinematic:true,range:75});
      }
      return;
    }
    if(final){
      for(const voice of [...active])if(!voice.final)halt(voice);
      if(deaths.has(e.id))return;deaths.add(e.id);
      start('titan-death',s,q,{id:e.id,priority:5,volume:1,final:true,range:75});return;
    }
    if(s.bossFinish?.phase==='executing')return;
    if(e.type==='enemySpawn'){rememberSpawn(s,{...enemy,...e});return;}
    if(e.type==='bossDowned'){for(const v of [...active])if(v.id===e.id)halt(v);return;}
    if(e.type==='enemyLanding'){
      if(kind!=='acechador'||e.attack!=='jump'||!enemy?.grounded||enemy.flight||enemy.hp<=0)return;
      const key=`${e.id}:enemyLanding`,now=s.time||0;
      if(now-(bossEvents.get(key)??-Infinity)<.15)return;bossEvents.set(key,now);
      start('acechador-landing',s,q,{id:e.id,priority:3,volume:.7,range:36});return;
    }
    if(e.type==='bossRage'&&kind==='desollador'){start('desollador-arrival',s,q,{id:e.id,priority:4,volume:.95,range:75});return;}
    if(e.type==='kill'){
      if(kind==='titan'||deaths.has(e.id))return;
      deaths.add(e.id);for(const v of [...active])if(v.id===e.id)halt(v);
      start(`${kind}-death`,s,q,{id:e.id,priority:3,volume:.8,range:kind==='desollador'?75:48});return;
    }
    if(e.type==='hit'){
      if(kind==='tejedor'&&(enemy?.stun>0||enemy?.shockStunUntil>s.time))stopChannel(e.id);
      if(e.dead||enemy?.hp<=0||enemy?.downed||['burn','arrowBurn'].includes(e.source))return;
      const now=s.time||0;if(now<(hurts.get(e.id)??-Infinity)+.25)return;
      if(start(`${kind}-hurt`,s,q,{id:e.id,priority:2,volume:.55,range:36}))hurts.set(e.id,now);return;
    }
    if(e.type==='enemyWindup'&&kind!=='titan'){
      if(kind==='tejedor')stopChannel(e.id);
      start(`${kind}-${['macabro','devorador'].includes(kind)?'attack':'windup'}`,s,q,{id:e.id,priority:3,volume:.72});return;
    }
    if(e.type==='enemyAttack'&&kind==='desollador'){start('desollador-'+(e.attack==='dive'?'dive':'attack'),s,q,{id:e.id,priority:4,volume:.9,range:75});return;}
    if(e.type==='enemyAttack'){
      if(kind==='titan'){
        if(e.attack==='slam')start('titan-landing',s,q,{id:e.id,priority:4,volume:.92,range:65});
        else if(e.attack==='cannon')start('centinela-attack',s,q,{id:e.id,priority:4,volume:.9,range:75});
      }else if(!['macabro','devorador'].includes(kind)||e.attack==='melee')start(`${kind}-${kind==='centinela'&&e.attack==='slam'?'slam':'attack'}`,s,q,{id:e.id,priority:3,volume:.8,follow:!e.fixedPosition});
      return;
    }
    if(kind==='titan'&&bossSamples[e.type]){
      const key=`${e.id}:${e.type}`,now=s.time||0;
      if(now-(bossEvents.get(key)??-Infinity)<.15)return;bossEvents.set(key,now);
      start('titan-'+bossSamples[e.type],s,q,{id:e.id,priority:4,volume:.9,range:75});
    }
  }
  function sync(s,enabled=true){
    if(disposed)return;bind(s);
    if(!enabled||s.mode==='tutorial'||s.mapId==='tutorial'){stop();return;}
    if(s.phase==='boss-demo-complete'){
      for(const v of [...active])if(!v.final)halt(v);
      if(context.currentTime-lastFinalSync>=.1){lastFinalSync=context.currentTime;updatePositions(s,new Map((s.enemies||[]).map(e=>[e.id,e])));}return;
    }
    if(s.phase!=='playing'){stop();return;}
    if(s.bossFinish?.phase==='executing'||s.motherCapture){
      for(const v of [...active])if(!v.final&&!v.cinematic)halt(v);
      const now=s.time||0;
      if(now-lastSync>=.1){lastSync=now;updatePositions(s,new Map((s.enemies||[]).map(e=>[e.id,e])));}return;
    }
    const now=s.time||0;if(now-lastSync<.1)return;lastSync=now;
    const living=(s.enemies||[]).filter(e=>e.hp>0&&!e.trainingDummy&&kinds.has(e.kind)),byId=new Map(living.map(e=>[e.id,e]));
    for(const e of living)rememberSpawn(s,e);
    const linked=new Set((s.shieldLinks||[]).map(link=>link.from));
    const channeling=new Set(living.filter(e=>e.kind==='tejedor'&&linked.has(e.id)&&!e.downed&&!e.cast&&!e.flight&&!(e.stun>0)&&!(e.shockStunUntil>now)).map(e=>e.id));
    // Hovering and channeling share the same ambience budget; closest sources win.
    const sucking=new Set(living.filter(e=>e.kind==='desollador'&&e.windSuction&&!(e.shockStunUntil>now)).map(e=>e.id));
    const floaters=living.filter(e=>(e.kind==='devorador'&&!e.downed)||channeling.has(e.id)||sucking.has(e.id)||s.motherDrag?.id===e.id)
      .map(e=>({e,weight:spatial(s,sourcePoint(e),sucking.has(e.id)?65:32).volume+(s.motherDrag?.id===e.id?2:sucking.has(e.id)?1:0)})).filter(q=>q.weight>.003).sort((a,b)=>b.weight-a.weight).slice(0,LOOP_LIMIT);
    const desired=new Set(floaters.map(q=>q.e.id));
    for(const e of living)if(e.downed&&e.kind==='titan')desired.add(e.id);
    for(const v of [...active])if(v.loop&&(!desired.has(v.id)||!byId.has(v.id)))halt(v);
    for(const e of living){
      if(s.motherDrag?.id===e.id){
        if(![...active].some(v=>v.loop&&v.id===e.id))start('madre-darkness',s,{...s.player,y:s.player.y+1.6},{id:e.id,priority:4,volume:.6,loop:true,range:120,ray:false,follow:false});
        continue;
      }
      if(e.downed&&e.kind==='titan'||desired.has(e.id)&&(e.kind==='devorador'||channeling.has(e.id)||sucking.has(e.id))){
        const name=sucking.has(e.id)?'desollador-suction':e.downed?'titan-downed':e.kind==='tejedor'?'tejedor-channel':'devorador-presence';
        let voice=[...active].find(v=>v.loop&&v.id===e.id);
        if(!voice)voice=start(name,s,sourcePoint(e),{id:e.id,priority:sucking.has(e.id)?4:e.downed?4:1,volume:sucking.has(e.id)?.7:e.downed?.7:.36,loop:true,range:sucking.has(e.id)?65:e.downed?55:32,ray:false});
      }else if(!e.downed&&!channeling.has(e.id))ambient(s,e);
      if(e.kind==='titan'){
        const old=steps.get(e.id),moving=e.grounded&&!e.cast&&!e.bossMotion&&!e.flight&&!e.downed&&!e.stun&&!(e.shockStunUntil>now);
        if(!moving||!old)steps.set(e.id,{x:e.x,z:e.z,distance:0,time:now});
        else{
          old.distance+=Math.min(2,Math.hypot(e.x-old.x,e.z-old.z));old.x=e.x;old.z=e.z;
          if(old.distance>=1.2&&now-old.time>=.35){start('titan-step',s,sourcePoint(e),{id:e.id,priority:2,volume:.62,range:55,ray:false});old.distance=0;old.time=now;}
        }
      }
    }
    updatePositions(s,new Map((s.enemies||[]).map(e=>[e.id,e])));
    const existing=new Set((s.enemies||[]).map(e=>e.id));
    for(const map of [hurts,presence,steps,seen,deaths])for(const id of map.keys())if(!existing.has(id))map.delete(id);
    for(const key of occlusion.keys())if(!existing.has(Number(key.slice(key.lastIndexOf(':')+1))))occlusion.delete(key);
    for(const key of bossEvents.keys())if(!existing.has(Number(key.slice(0,key.indexOf(':')))))bossEvents.delete(key);
  }
  return {event,sync,stop,missing,
    diagnostics:()=>({active:active.size,loops:[...active].filter(v=>v.loop).length,decoded:buffers.size,master:MASTER,voices:[...active].map(v=>({name:v.name,id:v.id,priority:v.priority,loop:v.loop,final:v.final,cinematic:v.cinematic,volume:v.gain.gain.value,pan:v.panner?.pan.value||0}))}),
    dispose(){stop();disposed=true;master.disconnect();buffers.clear();levels.clear();}
  };
}
