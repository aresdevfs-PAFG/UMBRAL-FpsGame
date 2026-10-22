export const MUSIC_TRACKS=['soundtrack-1.mp3','soundtrack-2.mp3','soundtrack-3.mp3','soundtrack-4.mp3','soundtrack-5.mp3'];
export const DEFAULT_MUSIC_VOLUME=.08;

// Stream one track at a time rather than decoding the full soundtrack into RAM.
export function createUmbralMusic({media=new Audio(),root='./assets/audio/umbral/music/',random=Math.random,
  now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,onError=()=>{}}={}){
  let bag=[],last=null,playing=false,muted=false,disposed=false,timer=null,due=0,gap=null,failures=0,blocked=false,generation=0;
  media.preload='metadata';media.volume=DEFAULT_MUSIC_VOLUME;media.loop=false;
  const active=()=>playing&&!muted&&!disposed&&!blocked;
  function freeze(){
    if(timer!==null){gap=Math.max(0,due-now());cancel(timer);timer=null;}
    media.pause();
  }
  function pick(){
    if(!bag.length){
      bag=[...MUSIC_TRACKS];
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      if(bag.length>1&&bag[0]===last)[bag[0],bag[1]]=[bag[1],bag[0]];
    }
    last=bag.shift();media.src=root+last;generation++;media.load();
  }
  function start(){
    if(!active())return;
    if(gap!==null){
      if(timer!==null)return;
      due=now()+gap;timer=schedule(()=>{timer=null;gap=null;if(active()){pick();start();}},gap);return;
    }
    if(!last)pick();
    const token=generation;
    const result=media.play();
    result?.catch(error=>{
      if(disposed||token!==generation||!active()||error.name==='AbortError')return;
      // Autoplay denial is retried on the next explicit user gesture, never by a timer loop.
      if(error.name==='NotAllowedError'){blocked=true;freeze();onError(error);}
      else failed(error);
    });
  }
  function ended(){if(disposed)return;failures=0;gap=1000;start();}
  function failed(error){
    if(disposed||gap!==null)return;
    failures++;onError(error);
    if(failures>=MUSIC_TRACKS.length){blocked=true;freeze();return;}
    gap=1000;start();
  }
  const errorHandler=()=>failed(media.error||new Error('Soundtrack unavailable'));
  media.addEventListener('ended',ended);media.addEventListener('error',errorHandler);
  return {
    media,
    setPlaying(value){playing=!!value;if(playing){blocked=false;start();}else freeze();},
    setMuted(value){muted=!!value;media.muted=muted;if(muted)freeze();else{blocked=false;start();}},
    setVolume(value){const n=Number(value);if(Number.isFinite(n))media.volume=Math.min(1,Math.max(0,n));return media.volume;},
    reset(){playing=false;generation++;freeze();gap=null;bag=[];last=null;failures=0;blocked=false;media.removeAttribute('src');media.load();},
    dispose(){if(disposed)return;disposed=true;generation++;freeze();media.removeEventListener('ended',ended);media.removeEventListener('error',errorHandler);media.removeAttribute('src');media.load();}
  };
}
