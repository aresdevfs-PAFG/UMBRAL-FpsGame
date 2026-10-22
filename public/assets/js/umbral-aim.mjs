export const MAX_PITCH=Math.PI/2;
export const clampPitch=pitch=>Math.max(-MAX_PITCH,Math.min(MAX_PITCH,pitch));

// Unit-length rays remain finite at the two vertical camera limits.
export function aimDirection(yaw,pitch){
  const horizontal=Math.cos(pitch);
  return {x:-Math.sin(yaw)*horizontal,y:Math.sin(pitch),z:-Math.cos(yaw)*horizontal};
}

/** Distance along a unit ray to an upright enemy cylinder, including its caps. */
export function rayCylinder(origin,direction,enemy,low,high,max){
  const x=origin.x-enemy.x,z=origin.z-enemy.z,r=enemy.radius+.1;
  const a=direction.x**2+direction.z**2,b=x*direction.x+z*direction.z,c=x*x+z*z-r*r;
  let near=0,far=max;
  if(a<1e-12){if(c>0)return null;}
  else{
    const disc=b*b-a*c;if(disc<0)return null;
    const root=Math.sqrt(disc);near=Math.max(near,(-b-root)/a);far=Math.min(far,(-b+root)/a);
  }
  if(Math.abs(direction.y)<1e-12){if(origin.y<low||origin.y>high)return null;}
  else{const bottom=(low-origin.y)/direction.y,top=(high-origin.y)/direction.y;near=Math.max(near,Math.min(bottom,top));far=Math.min(far,Math.max(bottom,top));}
  return near<far&&near<max?near:null;
}
