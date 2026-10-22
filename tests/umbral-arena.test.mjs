import test from 'node:test';
import assert from 'node:assert/strict';
import {BOUNDS,START,PORTAL_Z,SURFACES,SPAWNS,SUPPLIES,groundHeight,surfaceHeight,solid,move,settle,wallDistance,visible,navigationPath,navigate} from '../public/assets/js/umbral-arena.mjs';
const near=(a,b,t=.001)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const walk=(body,dx,dz)=>{for(let i=0;i<100;i++){move(body,dx/100,dz/100);settle(body,.02);}return body;};

test('an actor overlapping a terrace or ramp can retreat and strafe in small steps',()=>{
  for(const start of [{x:-22.85,z:0,y:0,dx:.05,dz:0},{x:-16,z:11.85,y:0,dx:0,dz:-.05}]){
    const body={...start,height:1.75};assert.equal(solid(body.x,body.z,.32,body.y,body.height),true);
    move(body,start.dx,start.dz);settle(body,1/60);
    assert.equal(solid(body.x,body.z,.32,body.y,body.height),false);
    const before={...body};move(body,start.dx,start.dz);
    assert.ok(Math.hypot(body.x-before.x,body.z-before.z)>.049,'retreat must work immediately');
  }
});

test('falling beside terraces, ramps, pillars and bridge edges never embeds the body',()=>{
  const starts=[
    {x:-22.85,z:0,y:3,dx:1,dz:0},{x:22.85,z:0,y:3,dx:-1,dz:0},
    {x:-16,z:11.85,y:1.5,dx:0,dz:-1},{x:16,z:18.15,y:1.5,dx:0,dz:1},
    {x:4.95,z:7,y:6.4,dx:-1,dz:0},{x:0,z:-4.85,y:6,dx:0,dz:1},
  ];
  for(const dt of [1/120,1/60,.05])for(const start of starts){
    const body={...start,height:1.75};
    for(let t=0;t<2;t+=dt){settle(body,dt);assert.equal(solid(body.x,body.z,.32,body.y,body.height),false,JSON.stringify(body));}
    near(body.y,0);const before={...body};
    for(let i=0;i<20;i++){move(body,start.dx*.08,start.dz*.08);settle(body,dt);}
    assert.ok(Math.hypot(body.x-before.x,body.z-before.z)>1.5,'must remain free after landing');
  }
});

test('holding movement into a wall still allows sliding along it during a fall and on the floor',()=>{
  const body={x:-22.5,z:0,y:2.5,height:1.75};
  for(let i=0;i<100;i++){
    move(body,-.1,.06);settle(body,1/60);
    assert.equal(solid(body.x,body.z,.32,body.y,body.height),false);
  }
  near(body.y,0);assert.ok(body.z>5.9);assert.ok(body.x>=-23+.32);
  const before=body.x;move(body,.05,0);assert.ok(body.x>before+.049);
});

test('arena and entrance dimensions, portal, and spawn support are shared data',()=>{
  assert.deepEqual(START,{x:0,z:35,y:0});assert.equal(PORTAL_Z,29);assert.equal(BOUNDS.maxX-BOUNDS.minX,70);
  assert.equal(solid(START.x,START.z,.32,START.y),false);
  assert.equal(solid(8,35),true);assert.equal(solid(0,40),true);
  for(const p of [...SPAWNS,...SUPPLIES]){
    near(groundHeight(p.x,p.z,p.y+.01),p.y);assert.equal(solid(p.x,p.z,.55,p.y),false,JSON.stringify(p));
  }
});

test('all four lower ramps ascend and descend without jumping',()=>{
  for(const ramp of SURFACES.filter(s=>s.kind==='ramp'&&s.base===0)){
    const west=ramp.x<0,body={x:west?-8:8,z:ramp.z,y:0};
    walk(body,west?-16:16,0);near(body.y,3);near(body.x,west?-24:24,.2);
    walk(body,west?16:-16,0);near(body.y,0);near(body.x,west?-8:8,.2);
  }
});

test('terrace walls stop a ground actor instead of teleporting it three metres up',()=>{
  const body={x:20,z:4,y:0};walk(body,10,0);
  assert.ok(body.x<23);near(body.y,0);assert.equal(solid(body.x,body.z,.32,body.y),false);
});

test('both upper ramps reach the bridge and plaza remains traversable below',()=>{
  for(const x of [-28,28]){
    const body={x,z:-26,y:3};walk(body,0,19);near(body.y,6);near(body.z,-7,.2);
    walk(body,0,-19);near(body.y,3);
  }
  const under={x:0,z:-12,y:0};walk(under,0,10);near(under.z,-2);near(under.y,0);
  near(groundHeight(0,-7.5),6);near(groundHeight(0,-7.5,1),0);
  assert.equal(solid(0,-7.5,.32,0),false);assert.equal(solid(0,-7.5,.32,4.5),true);assert.equal(solid(0,-7.5,.32,6),false);
});

test('walking off a bridge begins a fall and settles onto the plaza',()=>{
  const body={x:0,z:-5.1,y:6};move(body,0,.5);near(body.y,6);
  settle(body,.05);assert.ok(body.y<6&&body.y>5);assert.equal(body.grounded,false);
  for(let i=0;i<40;i++)settle(body,.05);near(body.y,0);assert.equal(body.grounded,true);
});

test('rays block on covers, ramps, terrace masses and arena bounds',()=>{
  near(wallDistance(7,12,0,-1,30,1.6),3.1);
  near(wallDistance(20,4,1,0,30,1.6),3);
  assert.ok(wallDistance(8,15,1,0,30,1.6)<15);
  near(wallDistance(0,35,1,0,90,1.6),4);
  near(wallDistance(0,35,0,-1,90,15),65);
});

test('the bridge slab blocks vertical rays while its lower passage remains open',()=>{
  near(wallDistance(0,-7.5,0,0,20,1.6,1),3.7);
  near(wallDistance(0,-7.5,0,0,20,7.6,-1),1.6);
  assert.ok(wallDistance(0,-12,0,1,10,1.6)>9.9);
  assert.equal(visible({x:0,z:-7.5,y:0},{x:0,z:-7.5,y:6}),false);
  assert.equal(visible({x:0,z:-12,y:0},{x:0,z:0,y:0}),true);
  assert.equal(visible({x:-10,z:-7.5,y:6},{x:10,z:-7.5,y:6}),true);
});

test('ramp height is linear and oblique rays hit the actual wedge, not a bounding box',()=>{
  const ramp=SURFACES.find(s=>s.id==='east-south-ramp');near(surfaceHeight(ramp,16,15),1.5);
  near(wallDistance(8,15,1,0,30,1.6),1+1.6*14/3);
  assert.ok(wallDistance(8,15,1,0,20,4.5)>=19.99);
});

test('navigation reaches all three elevations from every spawn through real ramps',()=>{
  const targets=[{x:0,z:20,y:0},{x:0,z:-26,y:3},{x:0,z:-8,y:6}];
  for(const from of [START,...SPAWNS.filter(p=>!p.elevated)])for(const to of targets){
    const path=navigationPath(from,to);assert.ok(path.length>0,`No path ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    for(let i=0;i<path.length;i++){
      const p=path[i];assert.equal(solid(p.x,p.z,.55,p.y),false);
      if(i)assert.ok(Math.abs(p.y-path[i-1].y)<.8);
    }
    near(path.at(-1).y,to.y,.1);
  }
});

test('waypoint navigation can move a ground enemy onto the bridge without teleporting',()=>{
  const body={x:0,z:20,y:0,height:4.2},target={x:0,z:-8,y:6};let reached=false;
  for(let i=0;i<4000;i++){
    const waypoint=navigate(body,target,.05),dx=waypoint.x-body.x,dz=waypoint.z-body.z,d=Math.hypot(dx,dz),previous=body.y;
    if(d>.01)move(body,dx/d*Math.min(.2,d),dz/d*Math.min(.2,d),.95);settle(body,.05);
    assert.ok(body.y-previous<=.401,'enemy teleported upward');
    if(Math.hypot(body.x-target.x,body.z-target.z)<1&&Math.abs(body.y-target.y)<.2){reached=true;break;}
  }
  assert.equal(reached,true);
});

test('giants continuously reach every elevation from every spawn without refresh oscillation',()=>{
  for(const from of SPAWNS.filter(p=>!p.elevated))for(const target of [{x:0,z:20,y:0},{x:0,z:-26,y:3},{x:0,z:-8,y:6}]){
    const body={...from,height:4.2};let reached=false;
    for(let i=0;i<2600;i++){
      const waypoint=navigate(body,target,.05),dx=waypoint.x-body.x,dz=waypoint.z-body.z,d=Math.hypot(dx,dz);
      if(d>.01)move(body,dx/d*Math.min(.15,d),dz/d*Math.min(.15,d),.95);settle(body,.05);
      if(Math.hypot(body.x-target.x,body.z-target.z)<1&&Math.abs(body.y-target.y)<.2){reached=true;break;}
    }
    assert.equal(reached,true,`${JSON.stringify(from)} -> ${JSON.stringify(target)}`);
  }
});
