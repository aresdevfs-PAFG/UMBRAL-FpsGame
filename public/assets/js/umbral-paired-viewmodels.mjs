import {FLAMES,SMG_DUAL} from './umbral-core.mjs';

const clamp01=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp01(x);return x*x*(3-2*x);};

// A frame contains the complete pair, authored from one first-person camera.
// Render it once: never mirror a single weapon (which includes its support hand).
export function drawPairedFrame(ctx,image,seq,frame,width,height,{lift=1,bob=0}={}){
  if(!image||!seq)return;
  const sw=image.width/seq.columns,sh=image.height/seq.rows;
  const dh=Math.min(height*(seq.viewHeight??.76),width*sh/sw),dw=dh*sw/sh;
  const x=(width-dw)/2,y=height-dh+(1-lift)*dh*.7+bob;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(image,(frame%seq.columns)*sw,Math.floor(frame/seq.columns)*sh,sw,sh,x,y,dw,dh);
}

export function dualPose(state,shot){
  const elapsed=SMG_DUAL.duration-state.smgDualRemaining;
  // Only flash on a confirmed shot; cooldown/empty clicks cannot animate firing.
  const age=shot?.index===3?shot.time:Infinity;
  const frame=age<.032?1:age<.06?2:age<.09?3:0;
  return {frame,lift:ease(elapsed/.18)*ease(state.smgDualRemaining/.12)};
}

export function flamePose(state){
  const elapsed=FLAMES.duration-state.flameRemaining;
  const frame=elapsed<.12?0:state.flameRemaining<.14?3:1+Math.floor((elapsed-.12)*14)%2;
  return {frame,lift:ease(elapsed/.1)*ease(state.flameRemaining/.12)};
}

export function createPairedViewmodels(assets,images){
  const dual=assets.weapons.find(w=>w.id==='espinario').dual;
  const flames=assets.abilities.flames;
  return {
    drawDual(ctx,width,height,state,shot,bob=0){
      if(state.smgDualRemaining<=0)return;
      const pose=dualPose(state,shot);
      drawPairedFrame(ctx,images.get(dual.file),dual,pose.frame,width,height,{...pose,bob});
    },
    drawFlames(ctx,width,height,state){
      if(state.flameRemaining<=0)return;
      const pose=flamePose(state);
      drawPairedFrame(ctx,images.get(flames.file),flames,pose.frame,width,height,pose);
    },
  };
}
