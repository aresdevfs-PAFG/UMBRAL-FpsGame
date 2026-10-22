const clamp01=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp01(x);return x*x*(3-2*x);};

// Shared with the cinematic's camera target: the lowered chest is 2.2 m up.
export const FINISHER_VISUAL={heartHeight:2.2,stabAt:.85,hammerAt:1.7,duration:3};
// The chest rises during the reaction. Follow the authored heart/pommel rather
// than assuming it stays at the screen centre in every pose.
const bodyContacts=[[.49,.54],[.52,.54],[.53,.55],[.607,.411],[.611,.375],[.607,.336],[.60,.69],[.5,.83]];
export const titanFinisherContact=frame=>bodyContacts[frame]||bodyContacts[1];

export function titanFinisherPose(state,enemy){
  if(enemy.kind!=='titan')return null;
  if(enemy.finished)return {state:'finisher',frame:7};
  const finish=state.bossFinish;
  if(!finish||finish.enemyId!==enemy.id)return null;
  if(finish.phase==='settling')return {state:'finisher',frame:0};
  if(finish.phase==='ready')return {state:'finisher',frame:1+Math.floor((state.time||0)*3)%2};
  if(finish.phase!=='executing')return null;
  const age=finish.age||0;
  return {state:'finisher',frame:age<.85?1:age<1.2?3:age<1.7?4:age<2.15?5:age<2.55?6:7};
}

export function finisherHandsPose(age){
  const frame=age<.35?0:age<.7?1:age<.85?2:age<1.2?3:age<1.7?4:age<1.9?5:age<2.5?6:7;
  // These anchors mark the authored tip/pommel in each cell, not separate
  // overlaid weapon images. The two hands move as a single drawn composition.
  const contacts=[[.5,.46],[.5,.46],[.49,.385],[.514,.474],[.512,.474],[.538,.497],[.5,.46],[.5,.46]];
  let retreat=0;
  if(age<.35)retreat=(1-ease(age/.35))*.3;
  else if(age<.7)retreat=.09*(1-ease((age-.35)/.35));
  else if(age<.85)retreat=.06*(1-ease((age-.7)/.15));
  else if(age>2.5)retreat=ease((age-2.5)/.5)*.65;
  return {frame,contact:contacts[frame],retreat};
}

export function createFinisherVisuals(assets,images){
  const seq=assets.abilities.titanFinisher;
  return {
    draw(ctx,width,height,state,target={x:width/2,y:height/2}){
      const finish=state.bossFinish;
      if(finish?.phase!=='executing')return false;
      // The normal equipped weapon must stay hidden throughout the locked beat,
      // including the camera approach and final withdrawal.
      const atlas=images.get(seq.file);
      if(!atlas)return true;
      const age=finish.age||0,{frame,contact,retreat}=finisherHandsPose(age);
      const sw=atlas.width/seq.columns,sh=atlas.height/seq.rows;
      // Keep forearms entering from below even when the chest recoils upward.
      const dh=Math.max(Math.min(height*seq.viewHeight,width*sh/sw),(height*1.04-target.y)/(1-contact[1])),dw=dh*sw/sh;
      const stab=Math.max(0,1-Math.abs(age-.85)/.065),hammer=Math.max(0,1-Math.abs(age-1.7)/.1);
      const shake=hammer*Math.sin(age*119)*height*.008;
      const x=target.x-contact[0]*dw+shake;
      const y=target.y-contact[1]*dh+retreat*dh+hammer*height*.008;
      ctx.save();
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(atlas,(frame%seq.columns)*sw,Math.floor(frame/seq.columns)*sh,sw,sh,x,y,dw,dh);
      if(stab||hammer){
        ctx.fillStyle=`rgba(255,135,38,${stab*.04+hammer*.1})`;
        ctx.fillRect(0,0,width,height);
      }
      ctx.restore();
      return true;
    },
  };
}
