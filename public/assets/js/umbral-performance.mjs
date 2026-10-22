export const QUALITY_LEVELS=Object.freeze([
  {id:'low',label:'Baja',width:640,decorationHz:15,effects:24},
  {id:'medium',label:'Media',width:800,decorationHz:24,effects:40},
  {id:'high',label:'Alta',width:960,decorationHz:30,effects:64},
]);

// Only visual quality changes. Combat timers, damage and navigation stay identical.
export function createQualityController(mode='auto'){
  let index=1,seconds=0,frames=0,slow=0,fast=0,hold=0;
  function reset(){seconds=frames=slow=fast=0;hold=3;}
  function setMode(value){mode=['auto','low','medium','high'].includes(value)?value:'auto';index=mode==='auto'?1:QUALITY_LEVELS.findIndex(q=>q.id===mode);reset();}
  setMode(mode);
  return {
    get mode(){return mode;},get level(){return QUALITY_LEVELS[index];},reset,setMode,
    sample(dt,active=true){
      if(!active||dt<=0||dt>2){reset();return false;}
      if(mode!=='auto')return false;
      seconds+=dt;frames++;if(seconds<1)return false;
      const fps=frames/seconds,period=seconds;seconds=frames=0;
      if(hold>0){hold-=period;return false;}
      slow=fps<48?slow+period:0;fast=fps>58?fast+period:0;
      if(index>0&&(fps<28||slow>=2)){index--;reset();hold=8;return true;}
      if(index<2&&fast>=15){index++;reset();hold=12;return true;}
      return false;
    },
  };
}

// Bound allocation churn during rapid fire; objects are disposed on overflow/unload.
export function createPool(create,dispose,limit=24){
  const free=[];return {
    take(){return free.pop()||create();},
    release(value){if(free.length<limit)free.push(value);else dispose(value);},
    dispose(){for(const value of free)dispose(value);free.length=0;},
    get size(){return free.length;},
  };
}

export function atlasSize(width,height,columns=1,rows=1,frameLimit=256){
  const scale=Math.min(1,frameLimit/Math.max(width/columns,height/rows));
  return {width:Math.max(columns,Math.floor(width*scale/columns)*columns),height:Math.max(rows,Math.floor(height*scale/rows)*rows)};
}
