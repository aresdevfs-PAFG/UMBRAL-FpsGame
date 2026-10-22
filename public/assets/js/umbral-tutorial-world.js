import {traversalVisuals} from './umbral-traversal-visuals.js';

/** A small, fully enclosed courtyard. Visual solids use the collision map's extents. */
export function buildTutorialWorld(T,scene,assetsRoot,arena){
  const group=new T.Group(),textures=new Set(),materials=new Set(),geometries=new Set();scene.add(group);
  scene.background=new T.Color('#39232b');scene.fog=null;
  function texture(canvas){const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;t.magFilter=T.NearestFilter;textures.add(t);return t;}
  function stone(){
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
    ctx.fillStyle='#28272d';ctx.fillRect(0,0,128,128);
    for(let y=0;y<128;y+=32)for(let x=-32;x<128;x+=64){
      const offset=(y/32%2)*32;ctx.fillStyle=['#645b51','#726657','#827562'][(x/64+y/32+5|0)%3];
      ctx.fillRect(x+offset+2,y+2,60,28);ctx.fillStyle='#b4a083';ctx.fillRect(x+offset+3,y+3,57,1);
    }
    const t=texture(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;
  }
  function mat(options){const m=new T.MeshBasicMaterial(options);materials.add(m);return m;}
  const stoneMap=stone(),floorMat=mat({map:stoneMap,color:'#bfac95'}),wallMat=mat({map:stoneMap,color:'#7c777c'}),gold=mat({color:'#c79a57'}),dark=mat({color:'#272331'});
  function box(x,y,z,w,h,d,material,slope){
    const g=new T.BoxGeometry(w,h,d);
    if(slope){const p=g.attributes.position;for(let i=0;i<p.count;i++)if(p.getY(i)>0){const axis=slope.axis,at=axis==='x'?p.getX(i):p.getZ(i),span=axis==='x'?w:d;p.setY(i,slope.from+(slope.to-slope.from)*(at/span+.5)-y);}g.computeVertexNormals();}
    const uv=g.attributes.uv;
    for(let i=0;i<uv.count;i++){
      const face=Math.floor(i/4),u=face<2?d:w,v=face===2||face===3?d:h;
      uv.setXY(i,uv.getX(i)*u/4,uv.getY(i)*v/4);
    }
    geometries.add(g);const m=new T.Mesh(g,material);m.position.set(x,y,z);group.add(m);return m;
  }
  for(const s of arena.SURFACES){const top=s.ramp?Math.max(s.ramp.from,s.ramp.to):s.y,base=s.base;box(s.x,(top+base)/2,s.z,s.w,top-base,s.d,floorMat,s.ramp);}
  for(const w of arena.WALLS){box(w.x,w.y+w.h/2,w.z,w.w,w.h,w.d,wallMat);box(w.x,w.h-.35,w.z,w.w,.16,w.d+.06,gold);}
  for(const x of [-12,-8,-4,0,4,8,12]){box(x,3,-15.3,.24,4.5,.22,dark);box(x,3.5,-15.13,.3,.4,.08,gold);}
  // Target circles and lane stripes are painted flush to the ground, not obstacles.
  for(const point of arena.SPAWNS){
    const g=new T.RingGeometry(.8,1,32);geometries.add(g);
    const ring=new T.Mesh(g,mat({color:'#eec376',side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(point.x,.018,point.z);group.add(ring);
    box(point.x,.01,point.z+4,.055,.018,5,gold);
  }
  function sign(text,x,y,z,width){
    const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');
    ctx.fillStyle='#1b1d23';ctx.fillRect(0,0,1024,128);ctx.strokeStyle='#a98148';ctx.lineWidth=6;ctx.strokeRect(3,3,1018,122);
    ctx.font='bold 48px monospace';ctx.fillStyle='#ecd2a1';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,66,980);
    const g=new T.PlaneGeometry(width,width/8);geometries.add(g);const m=new T.Mesh(g,mat({map:texture(c)}));m.position.set(x,y,z);group.add(m);
  }
  sign('PATIO DEL UMBRAL',0,4,-15.42,12);sign('BLANCOS · REAPARECEN',-3,2.6,-15.4,10);
  sign('SALTO',10,3.5,-12.9,4);
  const traversal=traversalVisuals(T,group,arena);let disposed=false,detail=true;
  const ready=new Promise(resolve=>new T.TextureLoader().load(assetsRoot+arena.panorama,t=>{
    if(disposed){t.dispose();resolve();return;}t.colorSpace=T.SRGBColorSpace;t.magFilter=T.NearestFilter;textures.add(t);
    const g=new T.SphereGeometry(110,24,12);geometries.add(g);const sky=new T.Mesh(g,mat({map:t,side:T.BackSide,depthWrite:false}));sky.rotation.y=Math.PI;group.add(sky);resolve();
  },undefined,()=>resolve()));
  return {mapId:arena.id,ready,update(time){traversal.update(time,detail);},setQuality(level){detail=level.id!=='low';},dispose(){disposed=true;traversal.dispose();scene.remove(group);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
