// Keep dense repeated reliefs instanced; bake differently sized architecture into
// one mesh per material/quadrant. UV density and collision surfaces are unchanged.
export function buildStaticBatches(T,batches,keepGeometry){
  const meshes=[],groups=new Map();
  for(const {geo,material,matrices} of batches.values()){
    if(material.transparent||matrices.length>=24){
      const mesh=new T.InstancedMesh(geo,material,matrices.length);
      matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();mesh.matrixAutoUpdate=false;meshes.push(mesh);continue;
    }
    for(const matrix of matrices){
      const key=material.uuid+':'+Math.floor(matrix.elements[12]/64)+':'+Math.floor(matrix.elements[14]/64);
      if(!groups.has(key))groups.set(key,{material,parts:[],count:0});
      const group=groups.get(key);group.parts.push({geo,matrix});group.count+=geo.index?.count??geo.attributes.position.count;
    }
  }
  const p=new T.Vector3(),n=new T.Vector3(),normalMatrix=new T.Matrix3();
  for(const {material,parts,count} of groups.values()){
    const positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2);let at=0;
    for(const {geo,matrix} of parts){
      const pos=geo.attributes.position,normal=geo.attributes.normal,uv=geo.attributes.uv;
      normalMatrix.getNormalMatrix(matrix);
      for(let j=0;j<(geo.index?.count??pos.count);j++,at++){
        const i=geo.index?geo.index.getX(j):j;
        p.fromBufferAttribute(pos,i).applyMatrix4(matrix);p.toArray(positions,at*3);
        if(normal)n.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix);else n.set(0,1,0);
        n.toArray(normals,at*3);if(uv){uvs[at*2]=uv.getX(i);uvs[at*2+1]=uv.getY(i);}
      }
    }
    const geometry=keepGeometry(new T.BufferGeometry());
    geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('normal',new T.BufferAttribute(normals,3));geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));
    geometry.computeBoundingSphere();geometry.computeBoundingBox();
    const mesh=new T.Mesh(geometry,material);mesh.matrixAutoUpdate=false;meshes.push(mesh);
  }
  return meshes;
}
