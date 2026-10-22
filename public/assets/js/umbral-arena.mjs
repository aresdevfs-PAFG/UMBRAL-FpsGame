import {MAPS} from './umbral-maps.mjs';
export * from './umbral-maps.mjs';
export function createArena(definition){
const {BOUNDS,START,PORTAL_Z,STEP_HEIGHT,SURFACES,WALLS,SPAWNS,SUPPLIES,ELEVATED_PILLARS,PADS,WIND}=definition;
const EPS = 1e-6;
const COLLISION_SOLIDS = [...WALLS,...SURFACES];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const extents = s => ({minX:s.x-s.w/2,maxX:s.x+s.w/2,minZ:s.z-s.d/2,maxZ:s.z+s.d/2});
const contains = (r,x,z,pad=0) => x>=r.minX+pad-EPS&&x<=r.maxX-pad+EPS&&z>=r.minZ+pad-EPS&&z<=r.maxZ-pad+EPS;
function inBounds(x,z,r=0){
  const point=(px,pz)=>contains(BOUNDS,px,pz)||contains(BOUNDS.entrance,px,pz);
  if(!point(x,z))return false;
  if(r<=0)return true;
  // Sample the circular footprint across the union, preserving the south doorway.
  for(let i=0;i<16;i++){const a=i*Math.PI/8;if(!point(x+Math.cos(a)*r,z+Math.sin(a)*r))return false;}
  return true;
}
function surfaceHeight(s,x,z){
  if(!s.ramp)return s.y;
  const axis=s.ramp.axis,span=axis==='x'?s.w:s.d,min=s[axis]-span/2;
  return s.ramp.from+(s.ramp.to-s.ramp.from)*clamp(((axis==='x'?x:z)-min)/span,0,1);
}
function groundHeight(x,z,ceiling=Infinity){
  if(!inBounds(x,z))return -Infinity;
  let height=-Infinity;
  for(const s of SURFACES){if(!contains(extents(s),x,z))continue;const top=surfaceHeight(s,x,z);if(top<=ceiling+EPS)height=Math.max(height,top);}
  return height;
}
function circleRect(x,z,r,s){const b=extents(s),cx=clamp(x,b.minX,b.maxX),cz=clamp(z,b.minZ,b.maxZ);return (x-cx)**2+(z-cz)**2<r*r+EPS?{x:cx,z:cz}:null;}
function solid(x,z,r=.32,y=0,height=1.7){
  if(!inBounds(x,z,r))return true;
  for(const wall of WALLS)if(y+height>wall.y+EPS&&y<wall.y+wall.h-EPS&&circleRect(x,z,r,wall))return true;
  for(const s of SURFACES){
    const touch=circleRect(x,z,r,s);if(!touch)continue;
    const top=surfaceHeight(s,touch.x,touch.z),bottom=s.base??(s.y-(s.thickness??.5));
    // A small foot allowance permits natural slope movement and classic step-ups.
    if(y+STEP_HEIGHT<top-EPS&&y+height>bottom+EPS)return true;
  }
  return false;
}
// Falling off an edge can leave the circular footprint inside its side even
// though the feet's centre is outside the platform. Resolve that overlap before
// testing movement, so small steps away from a wall are never rejected forever.
function separateFromSolids(body,r,height){
  const skin=.0001;
  for(let pass=0;pass<8;pass++){
    let corrected=false;
    for(const s of COLLISION_SOLIDS){
      const touch=circleRect(body.x,body.z,r,s);if(!touch)continue;
      const wall=s.h!==undefined,top=wall?s.y+s.h:surfaceHeight(s,touch.x,touch.z);
      const bottom=wall?s.y:(s.base??s.y-(s.thickness??.5));
      if(body.y+height<=bottom+EPS||body.y+(wall?0:STEP_HEIGHT)>=top-EPS)continue;
      const dx=body.x-touch.x,dz=body.z-touch.z,d=Math.hypot(dx,dz);
      if(d>EPS){const push=(r+skin-d)/d;body.x+=dx*push;body.z+=dz*push;}
      else{
        const b=extents(s),sides=[
          {axis:'x',to:b.minX-r-skin},{axis:'x',to:b.maxX+r+skin},
          {axis:'z',to:b.minZ-r-skin},{axis:'z',to:b.maxZ+r+skin},
        ];
        sides.sort((a,b)=>Math.abs(a.to-body[a.axis])-Math.abs(b.to-body[b.axis]));
        body[sides[0].axis]=sides[0].to;
      }
      corrected=true;
    }
    // Bounds remain solid above the physical boundary walls, too.
    if(!inBounds(body.x,body.z,r)){
      const candidates=[BOUNDS,BOUNDS.entrance].map(b=>({
        x:clamp(body.x,b.minX+r+skin,b.maxX-r-skin),
        z:clamp(body.z,b.minZ+r+skin,b.maxZ-r-skin),
      })).sort((a,b)=>Math.hypot(a.x-body.x,a.z-body.z)-Math.hypot(b.x-body.x,b.z-body.z));
      body.x=candidates[0].x;body.z=candidates[0].z;corrected=true;
    }
    if(!corrected)break;
  }
}
function move(body,dx,dz,r=.32){
  body.y??=0;body.vy??=0;body.collisionRadius=r;
  const height=body.collisionHeight??body.height??1.7;
  separateFromSolids(body,r,height);
  const parts=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.16));
  for(let i=0;i<parts;i++)for(const [axis,amount] of [['x',dx/parts],['z',dz/parts]]){
    if(!amount)continue;const x=body.x+(axis==='x'?amount:0),z=body.z+(axis==='z'?amount:0);
    const support=groundHeight(x,z,body.y+(body.vy>0?0:STEP_HEIGHT)),feet=Math.max(body.y,support);
    if(!solid(x,z,r,feet,body.collisionHeight??body.height??1.7)){body.x=x;body.z=z;if(feet>body.y){body.y=feet;body.vy=0;}}
  }
}
function settle(body,dt){
  body.y??=0;body.vy??=0;dt=clamp(dt,0,.1);
  const r=body.collisionRadius??body.radius??.32,height=body.collisionHeight??body.height??1.7;
  separateFromSolids(body,r,height);
  const support=groundHeight(body.x,body.z,body.y+STEP_HEIGHT);
  if(Number.isFinite(support)&&body.vy<=0&&body.y-support<=STEP_HEIGHT+EPS){body.y=support;body.vy=0;body.grounded=true;separateFromSolids(body,r,height);return;}
  let next=body.y+body.vy*dt-10*dt*dt;body.vy-=20*dt;
  if(next>body.y){
    // Sweep the head into bridge undersides instead of pushing the actor sideways.
    for(const slab of SURFACES){
      const bottom=slab.base??slab.y-(slab.thickness??.5);
      if(body.y+height<=bottom+EPS&&next+height>=bottom&&circleRect(body.x,body.z,r,slab)){
        next=Math.min(next,bottom-height-.001);body.vy=Math.min(0,body.vy);
      }
    }
  }
  if(next<=support){body.y=support;body.vy=0;body.grounded=true;}else{body.y=next;body.grounded=false;}
  separateFromSolids(body,r,height);
}

/** Parametric ray t follows (dx,dy,dz). dx/dz are normally horizontal-unit length. */
function clipRay(planes,x,y,z,dx,dy,dz,max){
  let lo=0,hi=max;
  for(const [nx,ny,nz,k] of planes){const at=nx*x+ny*y+nz*z,rate=nx*dx+ny*dy+nz*dz;
    if(Math.abs(rate)<EPS){if(at>k+EPS)return null;continue;}
    const t=(k-at)/rate;if(rate>0)hi=Math.min(hi,t);else lo=Math.max(lo,t);
    if(hi<lo-EPS)return null;
  }
  return hi>=0&&lo<=max?Math.max(0,lo):null;
}
function boxPlanes(s,bottom,top){const b=extents(s);return [[1,0,0,b.maxX],[-1,0,0,-b.minX],[0,0,1,b.maxZ],[0,0,-1,-b.minZ],[0,-1,0,-bottom],[0,1,0,top]];}
function surfacePlanes(s){
  if(!s.ramp)return boxPlanes(s,s.base??s.y-(s.thickness??.5),s.y);
  const b=extents(s),axis=s.ramp.axis,span=axis==='x'?s.w:s.d,min=axis==='x'?b.minX:b.minZ,slope=(s.ramp.to-s.ramp.from)/span;
  const planes=boxPlanes(s,s.base,Infinity);planes.pop();planes.push([axis==='x'?-slope:0,1,axis==='z'?-slope:0,s.ramp.from-slope*min]);return planes;
}
const raySolids=[...WALLS.map(w=>boxPlanes(w,w.y,w.y+w.h)),...SURFACES.map(surfacePlanes)];
function boundsExit(x,z,dx,dz,max){
  if(!inBounds(x,z))return 0;
  const intervals=[];
  for(const rect of [BOUNDS,BOUNDS.entrance]){let lo=0,hi=max;
    for(const [p,d,min,maximum] of [[x,dx,rect.minX,rect.maxX],[z,dz,rect.minZ,rect.maxZ]]){
      if(Math.abs(d)<EPS){if(p<min||p>maximum){hi=-1;break;}}
      else{const a=(min-p)/d,b=(maximum-p)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}
    }if(hi>=lo)intervals.push([lo,hi]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);let end=0;for(const [lo,hi]of intervals){if(lo>end+EPS)break;end=Math.max(end,hi);}return end;
}
function wallDistance(x,z,dx,dz,max=90,y=1.6,dy=0){
  let nearest=Math.min(max,boundsExit(x,z,dx,dz,max));
  for(const planes of raySolids){const hit=clipRay(planes,x,y,z,dx,dy,dz,nearest);if(hit!==null)nearest=Math.min(nearest,hit);}
  return nearest;
}
function visible(a,b){
  const dx=b.x-a.x,dz=b.z-a.z,horizontal=Math.hypot(dx,dz),from=(a.y??0)+1.3,to=(b.y??0)+1.3;
  if(horizontal<EPS){const rise=to-from;return Math.abs(rise)<EPS||wallDistance(a.x,a.z,0,0,Math.abs(rise),from,Math.sign(rise))>=Math.abs(rise)-.04;}
  return wallDistance(a.x,a.z,dx/horizontal,dz/horizontal,horizontal,from,(to-from)/horizontal)>=horizontal-.04;
}

// A static, multi-layer navigation grid: the same X/Z can contain plaza and bridge nodes.
const GRID=2,NAV_RADIUS=.96,NAV_HEIGHT=4.25;const navigation=new Map();
const navigationHeight=body=>Math.max(NAV_HEIGHT,body.collisionHeight??body.height??NAV_HEIGHT);
function supportedFootprint(x,z,y){
  for(let i=0;i<8;i++){const a=i*Math.PI/4,support=groundHeight(x+Math.cos(a)*NAV_RADIUS,z+Math.sin(a)*NAV_RADIUS,y+STEP_HEIGHT);
    if(!Number.isFinite(support)||Math.abs(support-y)>STEP_HEIGHT+EPS)return false;
  }return true;
}
function walkConnection(a,b,height=NAV_HEIGHT){
  const d=Math.hypot(b.x-a.x,b.z-a.z),parts=Math.max(1,Math.ceil(d/.16));let y=a.y;
  for(let i=1;i<=parts;i++){
    const x=a.x+(b.x-a.x)*i/parts,z=a.z+(b.z-a.z)*i/parts,next=groundHeight(x,z,y+STEP_HEIGHT);
    if(!Number.isFinite(next)||Math.abs(next-y)>STEP_HEIGHT+EPS||solid(x,z,NAV_RADIUS,next,height)||!supportedFootprint(x,z,next))return false;
    y=next;
  }
  return Math.abs(y-b.y)<.15;
}
function grid(height=NAV_HEIGHT){
  if(navigation.has(height))return navigation.get(height);
  const nodes=[],columns=new Map();
  for(let x=Math.ceil((BOUNDS.minX+1)/GRID)*GRID;x<BOUNDS.maxX;x+=GRID)for(let z=Math.ceil((BOUNDS.minZ+1)/GRID)*GRID;z<BOUNDS.entrance.maxZ;z+=GRID){
    if(!inBounds(x,z,NAV_RADIUS))continue;const levels=[];
    for(const s of SURFACES)if(contains(extents(s),x,z)){const y=surfaceHeight(s,x,z);if(!levels.some(v=>Math.abs(v-y)<EPS))levels.push(y);}
    const ids=[];for(const y of levels){if(solid(x,z,NAV_RADIUS,y,height)||!supportedFootprint(x,z,y))continue;const id=nodes.length;nodes.push({id,x,z,y,edges:[]});ids.push(id);}if(ids.length)columns.set(`${x},${z}`,ids);
  }
  for(const a of nodes)for(const [dx,dz] of [[-2,0],[2,0],[0,-2],[0,2],[-2,-2],[-2,2],[2,-2],[2,2]])for(const id of columns.get(`${a.x+dx},${a.z+dz}`)||[]){
    const b=nodes[id];if(Math.abs(a.y-b.y)>.8||!walkConnection(a,b,height))continue;a.edges.push({id,cost:Math.hypot(dx,dz,b.y-a.y)});
  }
  const result={nodes,columns};navigation.set(height,result);return result;
}
function nearestNode(point,height){
  const {nodes}=grid(height);let winner=null,best=Infinity;
  for(const node of nodes){const elevation=Math.abs(node.y-(point.y??0));if(elevation>1.1)continue;const score=(node.x-point.x)**2+(node.z-point.z)**2+elevation*elevation*9;if(score<best){winner=node;best=score;}}
  return winner;
}
class MinHeap{
  constructor(){this.items=[];}
  push(item){const a=this.items;a.push(item);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].score<=item.score)break;a[i]=a[p];i=p;}a[i]=item;}
  pop(){const a=this.items,first=a[0],tail=a.pop();if(a.length){let i=0;while(true){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&a[c+1].score<a[c].score)c++;if(a[c].score>=tail.score)break;a[i]=a[c];i=c;}a[i]=tail;}return first;}
  get length(){return this.items.length;}
}
function navigationPath(start,target){
  const height=navigationHeight(start),first=nearestNode(start,height),last=nearestNode(target,height);if(!first||!last)return [];
  const {nodes}=grid(height),cost=new Map([[first.id,0]]),parent=new Map(),open=new MinHeap(),closed=new Set();
  const heuristic=n=>Math.hypot(n.x-last.x,n.z-last.z,n.y-last.y);
  open.push({id:first.id,score:heuristic(first)});
  while(open.length){const {id}=open.pop();if(closed.has(id))continue;
    if(id===last.id){const path=[];let next=id;while(next!==undefined){const n=nodes[next];path.push({x:n.x,z:n.z,y:n.y});next=parent.get(next);}return path.reverse();}
    closed.add(id);for(const edge of nodes[id].edges){if(closed.has(edge.id))continue;const g=cost.get(id)+edge.cost;if(g<(cost.get(edge.id)??Infinity)){cost.set(edge.id,g);parent.set(edge.id,id);open.push({id:edge.id,score:g+heuristic(nodes[edge.id])});}}
  }
  return [];
}
/** Returns a next waypoint; caller still applies its own speed with move/settle. */
function navigate(enemy,target,dt){
  const height=navigationHeight(enemy);
  let cache=enemy._navigation;if(cache)cache.ttl-=dt;
  if(!cache||cache.ttl<=0||Math.hypot(target.x-cache.tx,target.z-cache.tz)>4||Math.abs((target.y??0)-cache.ty)>1){
    cache={path:navigationPath(enemy,target),ttl:.8,tx:target.x,tz:target.z,ty:target.y??0};
    // The closest grid node may be behind a moving actor. Rejoining it every
    // refresh creates an endless oscillation on diagonal edges. Skip it only
    // when the continuous connection to the following node is fully supported.
    if(cache.path.length>1&&walkConnection(enemy,cache.path[1],height))cache.path.shift();
    enemy._navigation=cache;
  }
  while(cache.path.length>1&&Math.hypot(enemy.x-cache.path[0].x,enemy.z-cache.path[0].z)<.3&&Math.abs((enemy.y??0)-cache.path[0].y)<.3)cache.path.shift();
  if(Math.hypot(enemy.x-target.x,enemy.z-target.z)<3&&walkConnection(enemy,target,height))return {x:target.x,z:target.z,y:target.y??0};
  return cache.path[0]??{x:enemy.x,z:enemy.z,y:enemy.y??0};
}

return {...definition,inBounds,surfaceHeight,groundHeight,solid,move,settle,wallDistance,visible,navigationPath,navigate};
}
const cache=new Map();
export function getArena(id='cuenca'){if(!MAPS[id])throw new Error("Unknown arena: "+id);if(!cache.has(id))cache.set(id,createArena(MAPS[id]));return cache.get(id);}
export const {inBounds,surfaceHeight,groundHeight,solid,move,settle,wallDistance,visible,navigationPath,navigate}=getArena('cuenca');
