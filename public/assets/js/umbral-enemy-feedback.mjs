// Only the actual end of a wave is marked, including any surviving child enemies.
export function lastEnemyTargets(s){
  if(!s.portalUsed||s.wave<1||s.pending>0||s.spawnWarnings.length)return [];
  const living=s.enemies.filter(e=>e.hp>0);
  return living.length<=3?living:[];
}

export function createEnemyFeedback(T,scene,crosshair){
  function texture(kind){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d');ctx.lineCap='square';ctx.lineJoin='miter';
    const draw=()=>{
      ctx.beginPath();
      if(kind==='chevron'){ctx.moveTo(14,23);ctx.lineTo(32,41);ctx.lineTo(50,23);}
      else for(const [x,y,tx,ty] of [[13,13,24,24],[40,40,51,51],[13,51,24,40],[40,24,51,13]]){ctx.moveTo(x,y);ctx.lineTo(tx,ty);}
      ctx.stroke();
    };
    ctx.strokeStyle='#17100c';ctx.lineWidth=12;draw();ctx.strokeStyle='#ffffff';ctx.lineWidth=6;draw();
    const map=new T.CanvasTexture(canvas);map.magFilter=T.NearestFilter;map.minFilter=T.NearestFilter;return map;
  }
  const hitMap=texture('hit'),arrowMap=texture('chevron'),hits=new Map(),arrows=new Map();let centerUntil=0,centerKill=false;
  function sprite(map,color,throughWalls=false){
    const mesh=new T.Sprite(new T.SpriteMaterial({map,color,transparent:true,depthWrite:false,depthTest:!throughWalls,sizeAttenuation:false}));
    mesh.renderOrder=throughWalls?30:20;scene.add(mesh);return mesh;
  }
  function remove(mesh){scene.remove(mesh);mesh.material.dispose();}
  function hit(event,time){
    if(event.source==='burn'||event.source==='arrowBurn')return;
    const previous=hits.get(event.id);if(previous)remove(previous.mesh);
    if(hits.size>=32&&!previous){const [id,old]=hits.entries().next().value;remove(old.mesh);hits.delete(id);}
    const mesh=sprite(hitMap,event.dead?'#ff7155':'#fff2ce');mesh.position.set(event.x,event.y,event.z);mesh.scale.setScalar(.07);
    hits.set(event.id,{mesh,until:time+.18});centerKill=time<centerUntil?centerKill||event.dead:event.dead;centerUntil=time+.18;
  }
  function update(s){
    const active=s.phase==='playing',targets=lastEnemyTargets(s),ids=new Set(targets.map(e=>e.id));
    for(const [id,v] of hits){if(s.time>=v.until){remove(v.mesh);hits.delete(id);}else{v.mesh.visible=active;v.mesh.material.opacity=Math.min(1,(v.until-s.time)/.08);}}
    for(const [id,mesh] of arrows)if(!ids.has(id)){remove(mesh);arrows.delete(id);}
    for(const e of targets){
      let mesh=arrows.get(e.id);if(!mesh){mesh=sprite(arrowMap,'#ffc66d',true);mesh.scale.setScalar(.085);arrows.set(e.id,mesh);}
      mesh.visible=active;mesh.position.set(e.x,(e.y||0)+e.height+.55+Math.sin(s.time*3+e.id)*.12,e.z);
    }
    crosshair?.classList.toggle('hit',active&&s.time<centerUntil);
    crosshair?.classList.toggle('kill',active&&s.time<centerUntil&&centerKill);
  }
  function clear(){for(const v of hits.values())remove(v.mesh);for(const mesh of arrows.values())remove(mesh);hits.clear();arrows.clear();centerUntil=0;centerKill=false;crosshair?.classList.remove('hit','kill');}
  return {hit,update,clear,dispose(){clear();hitMap.dispose();arrowMap.dispose();}};
}
