// Short decoded samples: no network requests or sample generation during combat.
export const ARSENAL_SAMPLES=['gauss','rifle','sniper','espinario','bow-fire','bow-void','explosion','macuahuitl-swing','macuahuitl-melee-hit','flames','enemy-burning'];

export async function loadArsenalAudio(context,root='./assets/audio/umbral/',destination=context.destination){
  const buffers=new Map(),levels=new Map(),offsets=new Map();
  const results=await Promise.allSettled(ARSENAL_SAMPLES.map(async name=>{
    const response=await fetch(root+name+'.mp3'+(['flames','espinario'].includes(name)?'?v=2':''));
    if(!response.ok)throw new Error('Missing arsenal audio: '+name);
    const buffer=await context.decodeAudioData(await response.arrayBuffer());
    let peak=0,first=buffer.length;
    for(let c=0;c<buffer.numberOfChannels;c++){
      const data=buffer.getChannelData(c);
      for(let i=0;i<data.length;i++)peak=Math.max(peak,Math.abs(data[i]));
    }
    for(let c=0;c<buffer.numberOfChannels;c++){
      const data=buffer.getChannelData(c);
      for(let i=0;i<first;i++)if(Math.abs(data[i])>peak*.025){first=i;break;}
    }
    buffers.set(name,buffer);levels.set(name,peak>.001?Math.min(64,.8/peak):1);
    offsets.set(name,name==='flames'?0:Math.max(0,first/buffer.sampleRate-.004));
  }));
  const missing=results.flatMap((r,i)=>r.status==='rejected'?[ARSENAL_SAMPLES[i]]:[]);
  if(missing.length)console.warn('UMBRAL: muestras de audio no disponibles',missing);
  const master=context.createGain();master.gain.value=.7;master.connect(destination);
  const active=new Set();let flame=null,burning=null,flameFinished=false,lastFlame=0,disposed=false,boundState=null;
  function release(voice){
    if(!voice||!active.delete(voice))return;
    voice.source.disconnect();voice.gain.disconnect();voice.panner?.disconnect();
    if(flame===voice){flame=null;flameFinished=true;}
    if(burning===voice)burning=null;
  }
  function halt(voice){if(!voice)return;try{voice.source.stop();}catch{}release(voice);}
  function start(name,{volume=.65,rate=1,offset,flameVoice=false,loop=false,pan=0,delay=0}={}){
    const buffer=buffers.get(name);if(disposed||!buffer)return null;
    if(active.size>=16)halt([...active].find(v=>v!==flame&&v!==burning)||active.values().next().value);
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;source.playbackRate.value=rate;source.loop=loop;
    const panner=(loop||pan!==0)&&context.createStereoPanner?context.createStereoPanner():null;
    if(panner){panner.pan.value=pan;gain.connect(panner);panner.connect(master);}else gain.connect(master);
    gain.gain.value=volume*levels.get(name);source.connect(gain);
    const voice={source,gain,panner};active.add(voice);source.onended=()=>release(voice);
    if(flameVoice)flame=voice;
    source.start(delay>0?context.currentTime+delay:0,Math.min(offset??offsets.get(name),Math.max(0,buffer.duration-.001)));
    return voice;
  }
  function stop(){for(const voice of [...active])halt(voice);flame=null;burning=null;flameFinished=false;lastFlame=0;}
  function bind(s){if(boundState&&boundState!==s)stop();boundState=s;}
  function event(e,s,enabled=true){
    if(!enabled||s.phase!=='playing'||disposed)return;
    bind(s);
    const variation=()=>.98+Math.random()*.04;
    if(e.type==='shot'){
      if(e.index===5)start('gauss',{volume:e.secondary?.85:.68,rate:e.secondary?.86:variation()});
      if(e.index===2)start(e.scoped?'sniper':'rifle',{volume:e.scoped?.85:.44,rate:e.scoped?1:variation()});
      if(e.index===4)start(e.secondary?'bow-void':'bow-fire',{volume:.65,rate:variation()});
      if(e.index===3){
        if(e.dual){
          // Two quieter, slightly offset shots keep the pair wide and powerful
          // without doubling peaks or building a metallic ringing tail.
          start('espinario',{volume:.29,rate:.98+Math.random()*.02,pan:-.24});
          start('espinario',{volume:.29,rate:1+Math.random()*.02,pan:.24,delay:.032});
        }else start('espinario',{volume:.44,rate:variation()});
      }
    }else if(e.type==='macuahuitl')start('macuahuitl-swing',{volume:.65});
    else if(e.type==='macuahuitlImpact'||e.type==='bossHammer')start('explosion',{volume:.85});
    else if(e.type==='macuahuitlMeleeImpact')start('macuahuitl-melee-hit',{volume:.72,rate:variation()});
    else if(e.type==='bowExplosion'){
      const distance=Math.hypot(e.x-s.player.x,e.z-s.player.z);
      start('explosion',{volume:.85/(1+distance/24)});
    }else if(e.type==='groundFireWave')syncBurning(s);
  }
  function syncBurning(s){
    // One shared fire bed for burns, the Titan's live charge aura and erupting
    // ground waves. Cast warnings and historical flame marks make no sound.
    let energy=0,panTotal=0,weightTotal=0;
    const p=s.player,yaw=p.yaw||0,rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);
    function mix(dx,dy,dz,strength=1){
      const distance=Math.hypot(dx,dy,dz);
      if(distance>=32||strength<=0)return;
      const weight=strength*(1-distance/32)**2/(1+distance*distance/100);
      const pan=(dx*rightX+dz*rightZ)/Math.max(.001,Math.hypot(dx,dz));
      energy+=weight*weight;panTotal+=pan*weight;weightTotal+=weight;
    }
    for(const e of s.enemies||[]){
      const aura=e.boss&&e.kind==='titan'&&e.hp>0&&!e.downed&&e.charge?.remaining>0&&!(e.stun>0)&&!(e.shockStunUntil>s.time);
      const burn=e.burnRemaining>0||e.arrowBurnRemaining>0;
      if(!burn&&!aura)continue;
      const fade=aura||e.hp>0?1:Math.max(0,1-(e.deadTime??Infinity)/.65);
      if(!fade)continue;
      const dx=e.x-p.x,dz=e.z-p.z,dy=(e.y||0)+(e.height||2)*.45-(p.y||0)-1.6;
      mix(dx,dy,dz,fade);
    }
    for(const h of s.hazards||[]){
      if(h.kind!=='ground-shockwave'||!h.flameWave)continue;
      const elapsed=h.age-(h.warning||0),duration=h.duration||0;
      if(elapsed<0||elapsed>=duration)continue;
      const dx=h.x-p.x,dz=h.z-p.z,horizontal=Math.hypot(dx,dz),radius=Math.max(0,h.radius||0);
      // Hear the closest part of the growing flame front rather than its
      // distant origin. Its pan changes as it passes across the player.
      const factor=horizontal>.001?1-radius/horizontal:0;
      const frontX=horizontal>.001?dx*factor:-Math.sin(yaw)*radius;
      const frontZ=horizontal>.001?dz*factor:-Math.cos(yaw)*radius;
      const fade=Math.min(1,elapsed/.06,(duration-elapsed)/.2);
      mix(frontX,(h.y||0)+.55-(p.y||0)-1.6,frontZ,fade);
    }
    if(!weightTotal){halt(burning);return;}
    const volume=Math.min(.85,.72*Math.sqrt(energy)),pan=Math.max(-1,Math.min(1,panTotal/weightTotal));
    const buffer=buffers.get('enemy-burning');
    if(!burning&&buffer)burning=start('enemy-burning',{volume,loop:true,pan,offset:s.time%buffer.duration});
    if(burning){
      burning.gain.gain.setTargetAtTime(volume*levels.get('enemy-burning'),context.currentTime,.06);
      burning.panner?.pan.setTargetAtTime(pan,context.currentTime,.06);
    }
  }
  function sync(s,enabled=true){
    if(disposed)return;
    bind(s);
    if(!enabled||s.phase!=='playing'){stop();return;}
    const remaining=s.flameRemaining;
    if(remaining<=0){halt(flame);flameFinished=false;lastFlame=0;}
    else{
      if(remaining>lastFlame+.05){halt(flame);flameFinished=false;}
      if(!flame&&!flameFinished)start('flames',{volume:.9,offset:Math.max(0,1-remaining),flameVoice:true});
      lastFlame=remaining;
    }
    syncBurning(s);
  }
  return {event,sync,stop,missing,dispose(){stop();disposed=true;master.disconnect();buffers.clear();}};
}
