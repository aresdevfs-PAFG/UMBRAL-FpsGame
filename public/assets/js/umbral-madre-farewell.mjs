import {MADRE} from './umbral-madre.mjs';

const WORD='DESPIERTA',WIDTH=1120,HEIGHT=320,FACE_HEIGHT=198,CUT=126;
const clamp=x=>Math.max(0,Math.min(1,x));
export function motherFarewellFrame(s){
  if(s.phase!=='playing')return null;
  const e=s.enemies.find(e=>e.kind==='madre'&&e.hp<=0&&e.deadTime>=.4&&e.deadTime<MADRE.deathDuration);
  if(!e)return null;
  const age=e.deadTime-.4,duration=MADRE.deathDuration-.4;
  return {age,opacity:clamp(age/.18)*clamp((duration-age)/.8),melt:clamp((age-.3)/(duration-1.1))};
}

// The distressed lettering is painted once. Animation stretches narrow strips
// of its lower edge: no full-screen shader, animated texture upload or timer.
function paintLettering(document){
  const face=document.createElement('canvas');face.width=WIDTH;face.height=FACE_HEIGHT;
  const c=face.getContext('2d');
  c.font='900 190px Georgia, "Times New Roman", serif';
  const spacing=12,total=[...WORD].reduce((n,ch)=>n+c.measureText(ch).width,0)+spacing*(WORD.length-1);
  c.save();c.translate(32,0);c.scale((WIDTH-64)/total,1);
  const ink=c.createLinearGradient(0,25,0,177);ink.addColorStop(0,'#b8b0a3');ink.addColorStop(.42,'#e8e0ce');ink.addColorStop(1,'#9e9282');
  c.fillStyle=ink;c.strokeStyle='#342e29';c.lineWidth=1.6;
  let x=0;
  for(const ch of WORD){c.strokeText(ch,x,169);c.fillText(ch,x,169);x+=c.measureText(ch).width+spacing;}
  c.restore();
  let seed=20261016;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  c.save();c.globalCompositeOperation='source-atop';
  for(let i=0;i<2000;i++){
    c.fillStyle=i%3?'rgba(39,32,26,.25)':'rgba(255,244,219,.34)';
    c.fillRect(Math.floor(random()*WIDTH),25+Math.floor(random()*150),1+Math.floor(random()*5),1+Math.floor(random()*4));
  }
  c.globalCompositeOperation='destination-out';c.fillStyle='#000';
  for(let i=0;i<210;i++)c.fillRect(Math.floor(random()*WIDTH),29+Math.floor(random()*145),1+Math.floor(random()*4),1+Math.floor(random()*7));
  // Thin angular fissures make the serif caps feel like chipped bone/stone.
  c.strokeStyle='#000';c.lineWidth=1.8;
  for(let i=0;i<19;i++){
    const px=35+random()*(WIDTH-70),py=28+random()*110;
    c.beginPath();c.moveTo(px,py);c.lineTo(px-4,py+9);c.lineTo(px+2,py+14);c.lineTo(px-2,py+25);c.stroke();
  }
  c.restore();
  const pixels=c.getImageData(0,0,WIDTH,FACE_HEIGHT).data,drips=[];
  for(let px=45;px<WIDTH-45;px+=19){
    let bottom=0;for(let y=FACE_HEIGHT-1;y>CUT;y--)if(pixels[(y*WIDTH+px)*4+3]>180){bottom=y;break;}
    if(bottom)drips.push({x:px,y:bottom,width:2+Math.floor(random()*3),length:18+random()*67,delay:random()*.38,phase:random()});
  }
  return {face,drips};
}

export function createMotherFarewell(stage){
  const doc=stage.ownerDocument,container=doc.createElement('div'),canvas=doc.createElement('canvas'),label=doc.createElement('span');
  container.className='umbral-mother-farewell';container.hidden=true;container.setAttribute('role','status');container.setAttribute('aria-live','polite');
  label.className='umbral-mother-farewell-label';label.textContent=WORD;
  canvas.width=WIDTH;canvas.height=HEIGHT;canvas.setAttribute('aria-hidden','true');
  container.append(canvas,label);stage.append(container);
  const ctx=canvas.getContext('2d'),{face,drips}=paintLettering(doc);
  const reduced=stage.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
  let previousAge=-1;
  function clear(){container.hidden=true;previousAge=-1;}
  function update(s){
    const frame=motherFarewellFrame(s);
    if(!frame){clear();return;}
    container.hidden=false;
    if(frame.age===previousAge)return;previousAge=frame.age;
    ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.globalAlpha=frame.opacity;ctx.imageSmoothingEnabled=false;
    const melt=reduced?.matches ? 0 : frame.melt;
    ctx.drawImage(face,0,0,WIDTH,CUT,0,0,WIDTH,CUT);
    for(let x=0;x<WIDTH;x+=4){
      const flow=(Math.sin(x*.09)*.5+.5)*(Math.sin(x*.023+1)*.5+.5);
      ctx.drawImage(face,x,CUT,4,FACE_HEIGHT-CUT,x,CUT,4,FACE_HEIGHT-CUT+melt*(7+flow*38));
    }
    ctx.fillStyle='#c7bba7';
    for(const drip of drips){
      const growth=clamp((melt-drip.delay)/(1-drip.delay)),length=growth*drip.length;
      if(length<1)continue;
      // Root stays attached while a tapered stem and one pixel drop descend.
      const flow=(Math.sin(drip.x*.09)*.5+.5)*(Math.sin(drip.x*.023+1)*.5+.5);
      const y=drip.y+(drip.y-CUT)/(FACE_HEIGHT-CUT)*melt*(7+flow*38);
      ctx.beginPath();ctx.moveTo(drip.x-drip.width,y-3);ctx.lineTo(drip.x+drip.width,y-3);ctx.lineTo(drip.x+1,y+length);ctx.lineTo(drip.x-1,y+length-3);ctx.closePath();ctx.fill();
      if(growth>.65){const fall=((frame.age*.6+drip.phase)%1)*27;ctx.fillRect(drip.x-1,y+length+5+fall,3,4);}
    }
    ctx.globalAlpha=1;
  }
  return {update,clear,dispose(){container.remove();face.width=face.height=canvas.width=canvas.height=0;}};
}
