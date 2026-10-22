import {getArena,windPhase} from './umbral-arena.mjs';
export const JUMP=Object.freeze({velocity:7,coyote:.1,buffer:.12,gravity:20});

export function launch(body,to,duration){
  body.flight={vx:(to.x-body.x)/duration,vz:(to.z-body.z)/duration,remaining:duration+.3};
  body.vy=(to.y-body.y+10*duration*duration)/duration;body.grounded=false;
}
export function flightStep(arena,body,dt,radius=.32){
  const f=body.flight;if(!f)return false;
  const before={x:body.x,z:body.z};
  arena.move(body,f.vx*dt,f.vz*dt,radius);arena.settle(body,dt);f.remaining-=dt;
  if(body.grounded||f.remaining<=0||Math.hypot(body.x-before.x,body.z-before.z)<dt*.1){body.flight=null;}
  return true;
}
export function updateTraversal(s,input,dt){
  const a=getArena(s.mapId),p=s.player;
  const supported=Number.isFinite(a.groundHeight(p.x,p.z,p.y+.04))&&Math.abs(p.y-a.groundHeight(p.x,p.z,p.y+.04))<.04&&p.vy<=0;
  p.coyote=supported?JUMP.coyote:Math.max(0,(p.coyote||0)-dt);
  p.jumpBuffer=input.jump&&!p.jumpHeld?JUMP.buffer:Math.max(0,(p.jumpBuffer||0)-dt);p.jumpHeld=!!input.jump;
  p.padCooldown=Math.max(0,(p.padCooldown||0)-dt);
  if(!p.flight&&p.jumpBuffer>0&&p.coyote>0){
    p.vy=JUMP.velocity;p.grounded=false;p.coyote=0;p.jumpBuffer=0;s.events.push({type:'jump'});
  }
  const pad=!p.flight&&p.padCooldown<=0&&a.PADS.find(q=>Math.hypot(q.x-p.x,q.z-p.z)<q.radius&&Math.abs(q.y-p.y)<.25&&p.vy<=0);
  if(pad){launch(p,pad.to,pad.duration);p.padCooldown=pad.duration+.8;p.coyote=0;s.events.push({type:'ascension',id:pad.id});}
  const forward=input.forward||0,strafe=input.strafe||0,mag=Math.hypot(forward,strafe)||1,speed=input.slow?3.8:7.4;
  if(p.flight){
    // Limited steering preserves a safe landing while aim, weapons and powers remain free.
    const f=p.flight,oldX=f.steerX||0,oldZ=f.steerZ||0;
    f.steerX=Math.max(-.5,Math.min(.5,oldX+(-Math.sin(p.yaw)*forward+Math.cos(p.yaw)*strafe)/mag*dt));
    f.steerZ=Math.max(-.5,Math.min(.5,oldZ+(-Math.cos(p.yaw)*forward-Math.sin(p.yaw)*strafe)/mag*dt));
    a.move(p,f.steerX-oldX,f.steerZ-oldZ);
  }
  if(!flightStep(a,p,dt)){
    a.move(p,(-Math.sin(p.yaw)*forward+Math.cos(p.yaw)*strafe)/mag*speed*dt,(-Math.cos(p.yaw)*forward-Math.sin(p.yaw)*strafe)/mag*speed*dt);
    for(const w of a.WIND)if(windPhase(s.time,w)==='active'&&Math.abs(p.x-w.x)<w.w/2&&Math.abs(p.z-w.z)<w.d/2&&p.y<w.y+2)a.move(p,w.dx*dt,w.dz*dt);
    a.settle(p,dt);
  }
  // A full footprint and no launch seal are required for a safe recovery point.
  if(p.grounded&&!pad&&!p.flight&&[-.55,.55].every(x=>[-.55,.55].every(z=>Math.abs(a.groundHeight(p.x+x,p.z+z,p.y+.05)-p.y)<.05)))p.safe={x:p.x,y:p.y,z:p.z};
  if(p.y<-12){
    const safe=p.safe||a.START;Object.assign(p,safe,{vy:0,flight:null,grounded:true,jumpBuffer:0,padCooldown:1});
    s.events.push({type:'fallRecovery'});return true;
  }
  return false;
}
