// A single shader program recolors any species without replacing its animation
// atlas. Recolor the sampled texel first so stun/cast material colors still work.
export function installEnemyVariantTint(T,material,color){
  const tint={value:new T.Color(color)};
  material.onBeforeCompile=shader=>{
    shader.uniforms.umbralVariantTint=tint;
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 umbralVariantTint;');
    const chunk=T.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;',`
      float variantLight=dot(sampledDiffuseColor.rgb,vec3(.299,.587,.114));
      sampledDiffuseColor.rgb=mix(umbralVariantTint*variantLight*1.75,vec3(1.0),pow(variantLight,5.0)*.35);
      diffuseColor *= sampledDiffuseColor;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',chunk);
  };
  material.customProgramCacheKey=()=> 'umbral-enemy-variant-v1';
  material.needsUpdate=true;
}
