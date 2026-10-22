// A distant hospital monitor, heard occasionally through the arena.
// The echo is baked once: one small buffer and at most one voice during play.
export function monitorSamples(sampleRate){
  const samples=new Float32Array(Math.ceil(sampleRate*1.02));
  const taps=[[0,1],[.24,.28],[.49,.10],[.79,.035]];
  for(const [delay,level] of taps){
    const offset=Math.round(delay*sampleRate),length=Math.ceil(.16*sampleRate);
    for(let i=0;i<length;i++){
      const t=i/sampleRate;
      const attack=Math.min(1,t/.012),release=Math.min(1,(.16-t)/.045);
      const envelope=Math.sin(attack*Math.PI/2)**2*Math.sin(release*Math.PI/2)**2;
      const phase=2*Math.PI*880*t;
      // A faint harmonic gives the clean beep some body; echoes lose brightness.
      samples[offset+i]+=level*envelope*(Math.sin(phase)+.055*level*Math.sin(phase*2))/1.055;
    }
  }
  return samples;
}

export function createComaAudio(context,destination=context.destination,{random=Math.random}={}){
  const data=monitorSamples(context.sampleRate);
  const buffer=context.createBuffer(1,data.length,context.sampleRate);
  buffer.copyToChannel(data,0);
  const master=context.createGain();master.gain.value=.018;master.connect(destination);
  let state=null,lastTime=null,remaining=0,voice=null,disposed=false;
  const interval=(min,max)=>min+(max-min)*random();
  function release(source){
    source.disconnect();
    if(voice===source)voice=null;
  }
  function stop(){
    if(voice){
      const source=voice;voice=null;
      try{source.stop();}catch{}
      source.disconnect();
    }
    lastTime=null;
  }
  function sync(s,enabled=true){
    if(disposed)return;
    if(state!==s){stop();state=s;remaining=interval(20,30);}
    // Simulation time pauses with the game. Muting or suspending audio also
    // freezes the wait, avoiding an overdue cue immediately upon returning.
    if(!enabled||s.phase!=='playing'||context.state!=='running'||
      s.bossFinish?.phase==='executing'||s.motherCapture){stop();return;}
    const now=s.time;
    if(lastTime!==null)remaining-=Math.max(0,now-lastTime);
    lastTime=now;
    if(remaining>0)return;
    remaining=interval(35,60);
    if(voice)return;
    const source=context.createBufferSource();
    source.buffer=buffer;source.connect(master);
    source.onended=()=>release(source);
    voice=source;source.start();
  }
  return {sync,stop,dispose(){if(disposed)return;stop();disposed=true;master.disconnect();state=null;}};
}
