// Recorded-style samples; the mechanical cycle follows simulation time, including pause.
export async function loadShotgunAudio(context, root='./assets/audio/umbral/',destination=context.destination) {
  const buffers=Object.fromEntries(await Promise.all(['single','double','cycle'].map(async name=>{
    const response=await fetch(root+'shotgun-'+name+'.mp3');
    if(!response.ok)throw new Error('Missing shotgun audio: '+name);
    return [name,await context.decodeAudioData(await response.arrayBuffer())];
  })));
  const master=context.createGain();master.gain.value=.7;master.connect(destination);
  const active=new Set();let cycle=null,lastRemaining=0,cycleFinished=false;
  function stopSource(source){if(!source)return;try{source.stop();}catch{}source.disconnect();active.delete(source);}
  function stop(){for(const source of [...active])stopSource(source);cycle=null;lastRemaining=0;cycleFinished=false;}
  function start(name,offset=0,rate=1){
    const source=context.createBufferSource();source.buffer=buffers[name];source.playbackRate.value=rate;
    const gain=context.createGain();gain.gain.value=name==='cycle'?.62:name==='double'?.95:.8;
    source.connect(gain);gain.connect(master);active.add(source);
    source.onended=()=>{active.delete(source);source.disconnect();gain.disconnect();if(cycle===source){cycle=null;cycleFinished=true;}};
    source.start(0,Math.min(offset,source.buffer.duration-.001));return source;
  }
  return {
    shot(secondary){if(active.size>12){const oldest=[...active].find(source=>source!==cycle);stopSource(oldest);}start(secondary?'double':'single');},
    syncCycle(remaining,selected,playing,enabled,duration=1.15){
      if(!playing||!enabled){stop();return;}
      const elapsed=duration-remaining;
      if(selected!==1||remaining<=0||elapsed<0||remaining>lastRemaining+.05){stopSource(cycle);cycle=null;cycleFinished=false;}
      if(selected===1&&remaining>0&&elapsed>=0&&!cycle&&!cycleFinished){
        const rate=buffers.cycle.duration/duration;
        cycle=start('cycle',elapsed*rate,rate);
      }
      lastRemaining=remaining;
    },
    stop,
    dispose(){stop();master.disconnect();}
  };
}
