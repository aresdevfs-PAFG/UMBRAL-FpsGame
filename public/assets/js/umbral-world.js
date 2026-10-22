import {buildStaticBatches} from './umbral-static-batches.mjs';
import {buildTutorialWorld} from './umbral-tutorial-world.js';
import {getArena} from './umbral-arena.mjs';
import {createRiverVisuals} from './umbral-river-visuals.mjs';
import {traversalVisuals} from './umbral-traversal-visuals.js';

/** Visual architecture for the shared arena topology. All playable solids come from umbral-arena. */
export function buildWorld(T, scene, assetsRoot, arena=getArena(),riverSprites=null) {
  if(arena.id==='tutorial')return buildTutorialWorld(T,scene,assetsRoot,arena);
  const {SURFACES,WALLS,PORTAL_Z,ELEVATED_PILLARS}=arena,corona=arena.id==='corona',rio=arena.id==='rio',bossDemo=arena.id==='titan-demo',entryY=arena.START.y;
  const world = new T.Group(); world.name = arena.name; scene.add(world);
  const geometries = new Set(), materials = new Set(), textures = new Set(), batches = new Map();
  const boxCache = new Map(), flamePositions = [];
  const dummy = new T.Object3D(); let seed = 41831, disposed = false;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const keepGeometry = g => (geometries.add(g), g);
  const keepMaterial = m => (materials.add(m), m);
  function map(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const palettes = {
      masonry: ['#68605a', '#4b4848', '#77706a', '#575453', '#8d8171'],
      paving: ['#938977', '#8b806d', '#7e776a', '#a0957d', '#716d65'],
      plaster: ['#783d2b', '#8b4b30', '#a35c36', '#62382d', '#7a4730'],
      obsidian: ['#1e2028', '#10121b', '#303039', '#3c3840', '#181b26'],
      gold: ['#8d734b', '#9c8254', '#6b593e', '#b89760', '#7a6648'],
      fluid: ['#231516', '#381719', '#4b211d', '#52241c', '#29191c'],
    };
    const palette = palettes[kind]; ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, 256, 256);
    if (kind === 'masonry' || kind === 'paving') {
      const step = kind === 'paving' ? 64 : 48;
      for (let y = -step; y < 256; y += step) for (let x = -128; x < 256; x += 96) {
        const xx = x + ((Math.floor(y / step) & 1) ? 48 : 0), w = 96, h = step;
        ctx.fillStyle = palette[Math.floor(random() * palette.length)]; ctx.fillRect(xx + 2, y + 2, w - 3, h - 3);
        ctx.fillStyle = '#c1ae862b'; ctx.fillRect(xx + 3, y + 3, w - 6, 3);
        ctx.fillStyle = '#171a20'; ctx.fillRect(xx, y, w, 2); ctx.fillRect(xx, y, 2, h);
        ctx.fillStyle = '#191a202c'; ctx.fillRect(xx + 3, y + h - 5, w - 6, 3);
      }
    }
    for (let i = 0; i < 4100; i++) {
      ctx.fillStyle = palette[Math.floor(random() * palette.length)];
      ctx.globalAlpha = .12 + random() * .24;
      ctx.fillRect(Math.floor(random() * 128) * 2, Math.floor(random() * 128) * 2, 2 + Math.floor(random() * 3) * 2, 2 + Math.floor(random() * 2) * 2);
    }
    ctx.globalAlpha = 1;
    if (kind === 'plaster') {
      for (let i = 0; i < 44; i++) {
        const x = random() * 256, y = random() * 256;
        ctx.fillStyle = ['#716b60', '#99907a', '#585957'][i % 3];
        ctx.fillRect(x, y, 5 + random() * 25, 5 + random() * 35);
        ctx.fillStyle = '#2c292747'; ctx.fillRect(x, y, 2, 10 + random() * 30);
      }
    }
    if (kind === 'masonry' || kind === 'paving') {
      ctx.strokeStyle = '#35363888'; ctx.lineWidth = 2;
      for (let i = 0; i < 28; i++) {
        const x = random() * 256, y = random() * 256;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 7, y + 9); ctx.lineTo(x + 4, y + 20); ctx.lineTo(x + 14, y + 27); ctx.stroke();
      }
    }
    if (kind === 'paving') {
      // Occasional incised stepped motif keeps broad ground readable without a new object per tile.
      ctx.strokeStyle = '#5b584c'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(156, 205); ctx.lineTo(156, 168); ctx.lineTo(193, 168); ctx.lineTo(193, 196); ctx.lineTo(170, 196); ctx.lineTo(170, 181); ctx.lineTo(181, 181); ctx.stroke();
    }
    if (kind === 'obsidian') {
      ctx.strokeStyle = '#93868f60'; ctx.lineWidth = 2;
      for (let i = 0; i < 24; i++) { const x = random() * 256; ctx.beginPath(); ctx.moveTo(x, random() * 50); ctx.lineTo(x - 25, 160); ctx.lineTo(x + 8, 256); ctx.stroke(); }
    }
    if (kind === 'fluid') {
      ctx.fillStyle = '#bb542b'; for (let i = 0; i < 35; i++) ctx.fillRect(random() * 256, random() * 256, random() * 15 + 2, 2);
    }
    const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace;
    texture.magFilter = T.NearestFilter; texture.minFilter = T.NearestMipmapNearestFilter;
    texture.wrapS = texture.wrapT = T.RepeatWrapping; textures.add(texture); return texture;
  }
  const stoneTex = map('masonry'), pavingTex = map('paving'), plasterTex = map('plaster');
  const obsidianTex = map('obsidian'), goldTex = map('gold'), fluidTex = map('fluid');
  const mat = {
    stone: keepMaterial(new T.MeshLambertMaterial({map: stoneTex, color: '#a3998b'})),
    pale: keepMaterial(new T.MeshLambertMaterial({map: stoneTex, color: '#c8bfa5'})),
    floor: keepMaterial(new T.MeshLambertMaterial({map: pavingTex, color: '#bbb09a'})),
    dark: keepMaterial(new T.MeshLambertMaterial({map: stoneTex, color: '#625e64'})),
    plaster: keepMaterial(new T.MeshLambertMaterial({map: plasterTex, color: '#b88d73'})),
    gold: keepMaterial(new T.MeshLambertMaterial({map: goldTex, color: '#c5aa72'})),
    black: keepMaterial(new T.MeshLambertMaterial({color: '#100f16'})),
    obsidian: keepMaterial(new T.MeshLambertMaterial({map: obsidianTex, color: '#8d8b9e', flatShading: true})),
    distant: keepMaterial(new T.MeshLambertMaterial({color: '#39323e', flatShading: true})),
    fluid: keepMaterial(new T.MeshLambertMaterial({map: fluidTex, color: '#ad6050', emissive: '#30100a', emissiveIntensity: .25})),
    ember: keepMaterial(new T.MeshBasicMaterial({color: '#ec9b3d'})),
  };
  if(corona){mat.stone.color.set('#86849d');mat.floor.color.set('#b0a7c3');mat.pale.color.set('#d5c6cc');mat.plaster.color.set('#806798');mat.ember.color.set('#b892ef');}
  if(rio){mat.stone.color.set('#6f9994');mat.floor.color.set('#96b4ad');mat.pale.color.set('#b7cdc1');mat.plaster.color.set('#4b9a99');mat.dark.color.set('#394f58');}
  function instance(geo, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const key = geo.uuid + ':' + material.uuid;
    if (!batches.has(key)) batches.set(key, {geo, material, matrices: []});
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rx, ry, rz); dummy.updateMatrix();
    batches.get(key).matrices.push(dummy.matrix.clone());
  }
  function boxGeometry(w, h, d) {
    const key = [w, h, d].map(n => n.toFixed(3)).join(':');
    if (boxCache.has(key)) return boxCache.get(key);
    const g = keepGeometry(new T.BoxGeometry(w, h, d)), uv = g.attributes.uv;
    // World-scale texture density: broad walls never stretch a single masonry tile.
    for (let face = 0; face < 6; face++) {
      const u = face < 2 ? d : w, v = face === 2 || face === 3 ? d : h;
      for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * u / 3, uv.getY(i) * v / 3);
    }
    boxCache.set(key, g); return g;
  }
  const box = (x, y, z, w, h, d, material = mat.stone, ry = 0) => instance(boxGeometry(w, h, d), material, x, y, z, 1, 1, 1, 0, ry);
  function plane(x, y, z, w, d, material = mat.floor) {
    const g = keepGeometry(new T.PlaneGeometry(w, d));
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 3, uv.getY(i) * d / 3);
    instance(g, material, x, y, z, 1, 1, 1, -Math.PI / 2);
  }

  const emptyMap = new T.DataTexture(new Uint8Array([32,14,20,255]),1,1);emptyMap.needsUpdate=true;textures.add(emptyMap);
  const bloodTime = {value:0};
  let quality={id:'medium',decorationHz:24};let decorationAt=-Infinity;
  const panoramaUniforms = {detail:{value:1},panorama:{value:emptyMap},time:bloodTime,corona:{value:corona?1:0},rio:{value:rio?1:0}};
  // Cylindrical projection keeps the painted temples rigid. Two 180-degree panels
  // preserve the 2:1 artwork's proportions instead of pulling every tower wide.
  const skyMat = keepMaterial(new T.ShaderMaterial({side:T.BackSide,depthWrite:false,depthTest:true,
    uniforms:panoramaUniforms,
    vertexShader:'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      varying vec3 vDirection; uniform sampler2D panorama; uniform float time; uniform float corona; uniform float rio; uniform float detail;
      float noise2(vec2 p){return sin(p.x*1.7+sin(p.y*.8))*sin(p.y*1.3+cos(p.x*.6))*.5+.5;}
      void main(){
        vec3 n=normalize(vDirection);
        float u=fract(atan(n.z,n.x)/3.14159265+.75);
        float vertical=n.y/max(length(n.xz),.025)*.69+.36;
        vec2 uv=vec2(u,clamp(vertical,.001,.999));
        vec3 base=texture2D(panorama,uv).rgb;
        float waterfall=rio*smoothstep(.1,.35,base.g)*(1.-smoothstep(.45,.65,uv.y));
        base*=1.+waterfall*sin(uv.y*360.+time*4.)*.10;
        if(detail<1.5){
          vec3 color=base*(1.+detail*.025*sin(time*2.));
          color=mix(color,vec3(.023,.008,.018),smoothstep(.90,1.15,vertical));
          color=mix(color,vec3(.014,.009,.013),1.-smoothstep(-.10,.04,vertical));
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }
        // A narrow seam blend joins the two painted ends without distorting architecture.
        float seam=smoothstep(.97,1.,u);
        base=mix(base,texture2D(panorama,vec2(u-.97,uv.y)).rgb,seam*.5);
        float red=smoothstep(.025,.17,base.r-max(base.g,base.b)*1.45);
        float sky=mix(red,smoothstep(.045,.15,base.b-base.g),corona)*smoothstep(.64,.86,uv.y);
        float cloud=noise2(vec2(u*32.-time*.021,uv.y*17.+time*.007));
        vec3 color=base*(1.-sky*cloud*.14);
        float ash=step(.9993,fract(sin(floor(u*820.)*127.1+floor(uv.y*420.-time*2.)*311.7)*43758.5453));
        color+=corona*ash*vec3(.08,.07,.11)*(1.-smoothstep(.16,.4,dot(base,vec3(.333))));
        float river=red*(1.-smoothstep(.43,.59,uv.y));
        float flow=sin(uv.y*440.+time*3.1+sin(u*110.)*3.);
        color*=1.+river*flow*.115;
        float torch=smoothstep(.08,.24,base.r)*smoothstep(.025,.11,base.g)*(1.-smoothstep(.06,.18,base.b));
        color*=1.+torch*(sin(time*4.2+u*94.)+sin(time*7.1+uv.y*53.))*.035;
        color=mix(color,vec3(.023,.008,.018),smoothstep(.90,1.15,vertical));
        color=mix(color,vec3(.014,.009,.013),1.-smoothstep(-.10,.04,vertical));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  const sky = new T.Mesh(keepGeometry(new T.SphereGeometry(180,64,24)),skyMat);sky.renderOrder=1000;sky.frustumCulled=false;world.add(sky);
  scene.background=new T.Color(rio?'#152b30':'#27191e');scene.fog=new T.Fog(rio?'#36595f':corona?'#514163':'#59454d',100,220);
  const hemi=new T.HemisphereLight('#bcb2a8','#38313b',1.28);world.add(hemi);
  const sun=new T.DirectionalLight(corona?'#d0bfea':'#e3c19b',1.72);sun.position.set(-40,70,35);world.add(sun);
  const fill=new T.DirectionalLight('#84879c',.55);fill.position.set(20,15,-25);world.add(fill);

  const animatedVertex=`varying vec2 vUv;varying vec3 vLocal;void main(){vUv=uv;vLocal=position;vec4 p=vec4(position,1.);
    #ifdef USE_INSTANCING
    p=instanceMatrix*p;
    #endif
    gl_Position=projectionMatrix*modelViewMatrix*p;}`;
  const bloodUniforms={bloodMap:{value:emptyMap},time:bloodTime};
  const bloodMaterial=keepMaterial(new T.ShaderMaterial({uniforms:bloodUniforms,transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
    vertexShader:animatedVertex,
    fragmentShader:`varying vec2 vUv;uniform sampler2D bloodMap;uniform float time;
      void main(){
        vec2 uv=vec2(vUv.x,fract(vUv.y*1.8+time*.22));vec4 sampleColor=texture2D(bloodMap,uv);
        float red=smoothstep(.002,.07,sampleColor.r-max(sampleColor.g,sampleColor.b));
        float edge=smoothstep(0.,.06,vUv.x)*(1.-smoothstep(.94,1.,vUv.x));
        float top=1.-smoothstep(.95,1.,vUv.y);
        float alpha=sampleColor.a*red*edge*top*.93;
        if(alpha<.025)discard;
        vec3 color=sampleColor.rgb*(.69+.09*sin(vUv.y*140.+time*5.));
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  const poolMaterial=keepMaterial(new T.ShaderMaterial({uniforms:{time:bloodTime},transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
    vertexShader:animatedVertex,
    fragmentShader:`varying vec2 vUv;uniform float time;
      void main(){vec2 p=vUv-.5;float a=atan(p.y,p.x);float radius=length(p);
        float edge=.43+sin(a*5.)*.025+sin(a*9.+1.7)*.035;
        float alpha=(1.-smoothstep(edge-.035,edge,radius))*.85;if(alpha<.02)discard;
        float ripple=sin(radius*115.-time*5.)*.5+.5;
        vec3 color=mix(vec3(.032,.0015,.005),vec3(.17,.012,.018),ripple*.28+.16);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  const loader=new T.TextureLoader();
  const ready=Promise.all([
    [arena.panorama,panoramaUniforms.panorama],
    ['environment/bloodfall.png',bloodUniforms.bloodMap]
  ].map(([file,uniform])=>loader.loadAsync(assetsRoot+file).then(texture=>{
    if(disposed){texture.dispose();return;}
    texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.NearestFilter;texture.minFilter=T.LinearMipmapLinearFilter;
    texture.wrapS=T.RepeatWrapping;texture.wrapT=file.includes('bloodfall')?T.RepeatWrapping:T.ClampToEdgeWrapping;
    textures.add(texture);uniform.value=texture;
  })));

  plane(0, corona||bossDemo?-35:-.85, 0, 150, 140, mat.dark);
  const river=rio?createRiverVisuals(T,world,arena,riverSprites?.swarm):null;

  function ramp(surface) {
    const {x, z, w, d, base = 0, ramp: r} = surface;
    const y00 = r.from, y11 = r.to;
    const vertices = r.axis === 'x'
      ? [x-w/2,y00,z-d/2, x+w/2,y11,z-d/2, x+w/2,y11,z+d/2, x-w/2,y00,z+d/2]
      : [x-w/2,y00,z-d/2, x+w/2,y00,z-d/2, x+w/2,y11,z+d/2, x-w/2,y11,z+d/2];
    const indexed = new T.BufferGeometry();
    indexed.setAttribute('position', new T.Float32BufferAttribute([...vertices, x-w/2,base,z-d/2, x+w/2,base,z-d/2, x+w/2,base,z+d/2, x-w/2,base,z+d/2],3));
    indexed.setIndex([0,2,1,0,3,2,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
    const g=keepGeometry(indexed.toNonIndexed());indexed.dispose();g.computeVertexNormals();
    const pos=g.attributes.position,norm=g.attributes.normal,uv=[];
    for(let i=0;i<pos.count;i++){
      if(Math.abs(norm.getY(i))>.5)uv.push(pos.getX(i)/3,pos.getZ(i)/3);
      else uv.push((Math.abs(norm.getX(i))>.5?pos.getZ(i):pos.getX(i))/3,pos.getY(i)/3);
    }
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.addGroup(0,6,0);g.addGroup(6,pos.count-6,1);
    world.add(new T.Mesh(g,[mat.floor,mat.stone]));
    // Fine stone tread marks follow the collision slope, with no physical step obstacles.
    const along = r.axis === 'x' ? w : d, count = Math.ceil(along / .55);
    const angle = Math.atan2(r.to-r.from, along), length = Math.sqrt(along*along+(r.to-r.from)**2);
    for (let i = 1; i < count; i++) {
      const t = i / count, yy = r.from + (r.to-r.from)*t + .018;
      if (r.axis === 'x') box(x-w/2+w*t, yy, z, .055, .026, d-.08, mat.dark);
      else box(x, yy, z-d/2+d*t, w-.08, .026, .055, mat.dark);
    }
    // Low edge strips are part of the ramp silhouette rather than collision-bearing rails.
    if (r.axis === 'x') {
      instance(boxGeometry(length,.10,.13),mat.pale,x,(r.from+r.to)/2+.04,z-d/2+.07,1,1,1,0,0,angle);
      instance(boxGeometry(length,.10,.13),mat.pale,x,(r.from+r.to)/2+.04,z+d/2-.07,1,1,1,0,0,angle);
    } else {
      instance(boxGeometry(.13,.10,length),mat.pale,x-w/2+.07,(r.from+r.to)/2+.04,z,1,1,1,-angle);
      instance(boxGeometry(.13,.10,length),mat.pale,x+w/2-.07,(r.from+r.to)/2+.04,z,1,1,1,-angle);
    }
  }
  for (const surface of SURFACES) {
    if (surface.kind === 'ramp') { ramp(surface); continue; }
    const thickness = surface.thickness ?? surface.y;
    const bottom = surface.base ?? (surface.y - thickness);
    if(!surface.elevated)box(surface.x, (surface.y + bottom)/2, surface.z, surface.w, surface.y-bottom, surface.d, surface.kind === 'bridge' ? mat.dark : mat.stone);
    plane(surface.x, surface.y+.008, surface.z, surface.w, surface.d);
    // Capstones lie inside the shared surface extent so the silhouette matches its collision.
    if (surface.kind === 'bridge') {
      box(surface.x, surface.y-.2, surface.z-surface.d/2+.07, surface.w,.38,.14,mat.pale);
      box(surface.x, surface.y-.2, surface.z+surface.d/2-.07, surface.w,.38,.14,mat.pale);
    }
  }

  // One carved skull geometry is shared by the portal sculpture and every small frieze relief.
  const skullShape = new T.Shape();
  skullShape.moveTo(-.7,-.3);skullShape.lineTo(-1.05,.05);skullShape.lineTo(-1.2,.75);skullShape.lineTo(-1.06,1.48);
  skullShape.lineTo(-.6,1.87);skullShape.lineTo(0,2.03);skullShape.lineTo(.6,1.87);skullShape.lineTo(1.06,1.48);
  skullShape.lineTo(1.2,.75);skullShape.lineTo(1.05,.05);skullShape.lineTo(.7,-.3);skullShape.lineTo(.62,-.85);
  skullShape.lineTo(-.62,-.85);skullShape.closePath();
  for (const dir of [-1,1]) {
    const hole = new T.Path(), x=dir*.53;
    hole.moveTo(x-.35,.91);hole.lineTo(x-.28,.43);hole.lineTo(x+.05,.28);hole.lineTo(x+.32,.48);hole.lineTo(x+.32,.99);hole.closePath();skullShape.holes.push(hole);
  }
  const nose = new T.Path();nose.moveTo(0,.45);nose.lineTo(-.2,-.02);nose.lineTo(.17,-.05);nose.closePath();skullShape.holes.push(nose);
  const skullGeo = keepGeometry(new T.ExtrudeGeometry(skullShape,{depth:.36,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.06,bevelThickness:.07,curveSegments:1}));
  function skull(x,y,z,scale=1,ry=0) {
    instance(skullGeo,mat.pale,x,y,z,scale,scale,scale,0,ry);
    const c=Math.cos(ry),s=Math.sin(ry);
    box(x-s*.03,y+scale*.75,z-c*.03,scale*1.75,scale*1.55,.035,mat.black,ry);
    for(let i=-2;i<=2;i++) {
      const xx=i*.235*scale;
      box(x+c*xx+s*.42*scale,y-.63*scale,z-s*xx+c*.42*scale,.034*scale,.51*scale,.055*scale,mat.dark,ry);
    }
  }
  function frieze(x,y,z,length,ry=0,spacing=.95) {
    box(x,y+.19,z,length,.77,.28,mat.dark,ry);
    box(x,y+.64,z,length+.06,.13,.42,mat.pale,ry);
    box(x,y-.28,z,length+.06,.12,.42,mat.pale,ry);
    const n=Math.max(1,Math.floor(length/spacing));
    for(let i=0;i<n;i++) {const t=(i-(n-1)/2)*spacing;skull(x+Math.cos(ry)*t,y-.02,z-Math.sin(ry)*t,.22,ry);}
  }
  for (const w of WALLS) {
    const y=w.y??0,h=w.h??4;
    box(w.x,y+h/2,w.z,w.w,h,w.d,mat.stone);
    // Tops and plinths stay within solid extents: no invisible extra collision edges.
    box(w.x,y+.16,w.z,w.w,.32,w.d,mat.dark);
    box(w.x,y+h-.13,w.z,w.w,.26,w.d,mat.pale);
    const small=w.w<5&&w.d<5;
    if(small&&h>1.5&&!w.elevated){
      for(const side of [-1,1]) {skull(w.x,y+h*.61,w.z+side*(w.d/2+.015),Math.min(.31,w.w*.21),side===1?0:Math.PI);}
      box(w.x,y+h*.25,w.z,w.w+.015,.15,w.d+.015,mat.gold);
      box(w.x,y+h*.82,w.z,w.w+.015,.12,w.d+.015,mat.dark);
    }
    if(w.w>8&&h>2.5){
      const face=w.z<0?1:-1;
      for(let x=w.x-w.w/2+2;x<w.x+w.w/2-1;x+=4){
        box(x,y+h*.47,w.z+face*(w.d/2+.014),2.8,h*.62,.04,mat.plaster);
        box(x-1.58,y+h/2,w.z+face*(w.d/2+.035),.35,h-.36,.14,mat.dark);
      }
    }
    if(w.kind==='boundary'&&w.d>30&&h>5){
      const face=w.x<0?1:-1;
      for(let z=w.z-w.d/2+3;z<w.z+w.d/2-1;z+=5){
        box(w.x+face*(w.w/2+.012),4.65,z,.04,2.6,3.8,mat.plaster);
        box(w.x+face*(w.w/2+.025),4.65,z-2.18,.12,2.85,.28,mat.pale);
      }
      for(const z of [-24,-10,4,18])frieze(w.x+face*(w.w/2+.01),h-.76,z,9,face>0?Math.PI/2:-Math.PI/2);
    }
  }
  const bloodFace=keepGeometry(new T.PlaneGeometry(2.45,6.03));
  const bloodPool=keepGeometry(new T.PlaneGeometry(3.7,3.2));
  const dropletPositions=[];
  for(const p of ELEVATED_PILLARS){
    // Every crown remains a clear flat 3.8m square for the actual elevated spawns.
    // The channels and skull mouths lie on its vertical faces, below collision height.
    for(const sx of [-1,1])for(const sz of [-1,1]){
      box(p.x+sx*(p.w/2-.23),p.h/2,p.z+sz*(p.d/2-.23),.46,p.h,.46,mat.dark);
      box(p.x+sx*(p.w/2-.25),.24,p.z+sz*(p.d/2-.25),.5,.48,.5,mat.pale);
    }
    box(p.x,p.h-.16,p.z,p.w,.32,p.d,mat.pale);
    for(let side=0;side<4;side++){
      const angle=side*Math.PI/2,dx=Math.sin(angle),dz=Math.cos(angle);
      const x=p.x+dx*(p.w/2+.027),z=p.z+dz*(p.d/2+.027);
      frieze(x,p.h-.84,z,3.3,angle,.86);
      instance(bloodFace,bloodMaterial,x+dx*.015,3.035,z+dz*.015,1,1,1,0,angle);
      instance(bloodPool,poolMaterial,p.x+dx*1.77,.022,p.z+dz*1.77,1,1,1,-Math.PI/2,0,angle);
      for(let i=0;i<3;i++)dropletPositions.push({x:x-dz*(i-1)*.37,z:z+dx*(i-1)*.37,phase:(i+side*.63+p.x)*1.74,height:p.h-.36});
    }
    instance(bloodPool,poolMaterial,p.x,p.h+.018,p.z,.73,.73,.73,-Math.PI/2);
  }
  if(rio){
    const deck=arena.START.y,soffit=deck-.7;
    // Reliefs stay beneath the decks, leaving every bridge fully traversable.
    for(const x of [-27,27]){frieze(x,deck-.85,13.03,13,0,1.25);frieze(x,deck-.85,-5.03,13,Math.PI,1.25);}
    frieze(0,deck-.9,8.03,15,0,1.2);frieze(0,deck-.9,-8.03,15,Math.PI,1.2);
    for(const x of [-27,27])for(const z of [-17,18])box(x,soffit/2,z,2,soffit,2,mat.dark);
    for(let i=0;i<5;i++){
      box(0,deck+1+i*3,-39-i,34-i*5,3,16-i*2,mat.stone);
      box(0,deck+2.6+i*3,-39-i,35-i*5,.3,17-i*2,mat.pale);
    }
    box(0,deck+4,-29.96,8,8,.05,mat.black);skull(0,deck+9,-29.65,1.9);
    frieze(0,deck+.5,-29.9,28,0,1.5);
    for(const x of [-31,31])skull(x,deck+4.2,5.05,.7);
  }else if(bossDemo){
    // Decoration follows the demo's actual surfaces; open ledges expose the abyss.
    for(const surface of SURFACES)if(!surface.ramp){
      for(const sign of [-1,1])box(surface.x,surface.y-.18,surface.z+sign*(surface.d/2-.08),surface.w,.25,.16,mat.pale);
    }
    for(const x of [-16,16])frieze(x,2.25,8.015,7.5,0,1.1);
    frieze(0,3.15,-17.015,11.7,0,1.2);
    for(let i=0;i<5;i++){
      box(0,9+i*3,-36-i,30-i*5,3,14-i*2,mat.stone);
      box(0,10.6+i*3,-36-i,31-i*5,.28,15-i*2,mat.pale);
    }
    skull(0,7.7,-26.45,1.4);frieze(0,5.9,-26.44,18,0,1.3);
    for(const x of [-19,19])for(const z of [-15,15])box(x,-6,z,1.6,12,1.6,mat.obsidian);
  }else if(!corona){
  // Friezes line terrace retaining walls and the high crossing, not a blocking handrail.
  for (const x of [-22.97,22.97]) {
    const ry=x<0?Math.PI/2:-Math.PI/2;
    for(const z of [-25,-3,25]){frieze(x,2.32,z,6,ry);box(x,1.15,z,.045,1.9,5.8,mat.plaster);}
  }
  frieze(0,5.3,-4.975,44,0,1.05);
  frieze(0,5.3,-10.025,44,Math.PI,1.05);
  frieze(0,2.3,-21.97,40,0,1.1);

  // Basalt sanctuary sits outside the north boundary: its silhouette is the navigation landmark.
  box(0,1.5,-40,40,3,18,mat.dark);
  box(0,4,-39,35,2,17,mat.stone);
  box(0,7,-39,30,4,15,mat.plaster);
  box(0,9.35,-39,31,.7,16,mat.pale);
  box(0,11.5,-40,24,4,13,mat.stone);
  box(0,13.8,-40,25,.6,14,mat.dark);
  box(0,16,-42,18,4,10,mat.plaster);
  box(0,18.2,-42,19,.5,11,mat.pale);
  box(0,19.5,-43,12,2.1,8,mat.dark);
  // Deep lintelled door, shoulders and stepped cheek ornaments frame the sculpted face.
  box(0,6.25,-29.965,8,6.5,.06,mat.black);
  for(const x of [-4.65,4.65]){
    box(x,6.4,-29.9,1.35,6.8,.4,mat.pale);
    for(let y=4.1;y<9;y+=1.5)skull(x,y,-29.67,.32);
  }
  box(0,9.8,-29.9,10.6,.9,.6,mat.pale);
  box(0,13.2,-30.3,11,5.7,.7,mat.dark);
  skull(0,12.5,-29.78,1.65);
  for(const dir of [-1,1])for(let j=0;j<5;j++) {
    box(dir*(4.7+j*.44),10.5+j*.81,-29.8,1.9,.42,.38,mat.pale);
    box(dir*(5.45+j*.44),10.87+j*.81,-29.75,.4,.65,.23,mat.gold);
  }
  for(const x of [-10,10]) {
    box(x,8,-29.95,4.2,10,.06,mat.plaster);
    box(x,13.1,-30.15,4.5,.42,1.2,mat.pale);
    for(let y=5;y<=12;y+=1.4)box(x,y,-29.85,2.1,.1,.06,mat.gold);
  }
  frieze(0,3.4,-29.84,8.5);
  // Secondary monuments above each lateral terrace retain clear sightlines through the arena.
  for(const x of [-28,28]) {
    box(x,4.5,-34,11,3,8,mat.dark);box(x,7.2,-34,9.4,2.4,7,mat.plaster);
    box(x,8.6,-34,10,.4,7.5,mat.pale);box(x,10,-35,7,2.3,5,mat.stone);
    box(x,5.8,-29.95,3.8,4.6,.07,mat.black);
    for(const side of [-1,1])box(x+side*2.45,5.7,-29.86,.9,5.3,.28,mat.pale);
    box(x,8.55,-29.86,6,.6,.35,mat.pale);frieze(x,9.25,-29.8,7.1,0,.85);
  }

  }else{
    // The hollow ring exposes the abyss; trim is below the walkable platform tops.
    for(const surface of SURFACES)if(!surface.ramp&&surface.id!=='entrada'){
      for(const sign of [-1,1])box(surface.x,surface.y-.15,surface.z+sign*(surface.d/2-.08),surface.w,.25,.16,mat.pale);
    }
    for(const x of [-24,24]){
      frieze(x,2.2,8,18,0,1.2);frieze(x,2.2,-8,18,Math.PI,1.2);
      // Obsidian roots hang below, never across a playable lane.
      for(let i=-2;i<=2;i++)box(x+i*3,-6-Math.abs(i),0,1.6,10,1.6,mat.obsidian);
    }
    frieze(0,5.15,-17.97,22,0,1.2);
    for(let i=0;i<5;i++){
      box(0,9+i*3,-39-i,32-i*5,3,16-i*2,mat.stone);
      box(0,10.6+i*3,-39-i,33-i*5,.28,17-i*2,mat.pale);
    }
    box(0,10,-29.95,8,8,.06,mat.black);
    skull(0,15,-29.5,1.8);
    for(const x of [-12,12])for(let i=0;i<4;i++)box(x,8+i*2,-30,2,.3,1.1,mat.gold);
  }

  const cupGeo=keepGeometry(new T.CylinderGeometry(.54,.3,.48,6)), flameGeo=keepGeometry(new T.OctahedronGeometry(1,0));
  function brazier(x,y,z,scale=1) {
    box(x,y+.18*scale,z,.95*scale,.36*scale,.95*scale,mat.dark);
    box(x,y+.68*scale,z,.53*scale,.68*scale,.53*scale,mat.stone);
    instance(cupGeo,mat.gold,x,y+1.11*scale,z,scale,scale,scale);
    flamePositions.push({x,y:y+1.53*scale,z,scale});
  }
  // All posts are mounted on solid perimeter or outside navigable edges.
  for(const wall of WALLS)if(wall.kind==='boundary'&&wall.d>30)for(const z of [-25,-15,0,15,26])brazier(wall.x,wall.y+wall.h,z,.86);
  for(const x of [-4.7,4.7])brazier(x,bossDemo?8:rio?entryY+9:12,bossDemo?-27:-30.5,.95);
  if(!bossDemo)for(const x of [-4.7,4.7])brazier(x,entryY,31.5,1);

  // Start threshold: wide clear aperture matches the eight-metre entrance in the shared bounds.
  if(!bossDemo)for(const x of [-4.65,4.65]) {
    box(x,entryY+3.1,PORTAL_Z,1.1,6.2,1.7,mat.dark);box(x,entryY+3.1,PORTAL_Z+.86,.65,5.7,.13,mat.gold);
    for(let i=0;i<5;i++)box(x,entryY+.5+i*1.18,PORTAL_Z+.95,.98,.12,.2,mat.pale);
  }
  if(!bossDemo){box(0,entryY+6.3,PORTAL_Z,10.4,.9,1.8,mat.pale);frieze(0,entryY+6.88,PORTAL_Z+.88,9.6,0,.9);}
  const portalMat=keepMaterial(new T.MeshBasicMaterial({color:'#efb75f',transparent:true,opacity:.13,side:T.DoubleSide,depthWrite:false}));
  const portal=new T.Mesh(keepGeometry(new T.PlaneGeometry(8.15,5.85)),portalMat);portal.position.set(0,entryY+2.91,PORTAL_Z);world.add(portal);
  const lineGeo=keepGeometry(new T.PlaneGeometry(.018,5.75));
  const linesMat=keepMaterial(new T.MeshBasicMaterial({color:'#ffe1a1',transparent:true,opacity:.3,side:T.DoubleSide,depthWrite:false}));
  const lines=new T.InstancedMesh(lineGeo,linesMat,20);
  for(let i=0;i<20;i++){dummy.position.set(-3.8+i*.4,entryY+2.88,PORTAL_Z+.025);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();lines.setMatrixAt(i,dummy.matrix);}
  lines.computeBoundingSphere();lines.matrixAutoUpdate=false;world.add(lines);


  // A few small obsidian outcrops anchor the painted distance. Giant low-poly
  // canyon meshes and far-away box shrines are replaced by the animated panorama.
  const spikeGeo=keepGeometry(new T.ConeGeometry(1,1,5,1));
  function spire(x,z,height,width=1.7,base=-.3) {instance(spikeGeo,mat.obsidian,x,base+height/2,z,width,height,width*.66,random()*.13-.065,random()*Math.PI,random()*.18-.09);}
  for(let i=0;i<24;i++) {
    const angle=i/24*Math.PI*2, rx=39+random()*5,rz=35+random()*5;
    const x=Math.sin(angle)*rx,z=Math.cos(angle)*rz;
    if(z>29&&Math.abs(x)<9)continue;
    const h=3+random()*6;spire(x,z,h,.8+random()*1.2);
    if(i%3===0)spire(x+1.4,z-1,h*.58,.65);
  }
  // A dark volcanic channel outside the plaza; no unadvertised damage zones inside paths.
  if(!corona&&!rio)for(const x of [-38,38])plane(x,-.3,1,3.4,66,mat.fluid);

  for(const mesh of buildStaticBatches(T,batches,keepGeometry))world.add(mesh);
  batches.clear();
  const fireOuter=keepMaterial(new T.MeshBasicMaterial({color:'#e9782f'})),fireInner=keepMaterial(new T.MeshBasicMaterial({color:'#ffe0a3'}));
  const fireMeshes=[new T.InstancedMesh(flameGeo,fireOuter,flamePositions.length),new T.InstancedMesh(flameGeo,fireInner,flamePositions.length)];
  fireMeshes.forEach(mesh=>{mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;world.add(mesh);});
  const drops=new T.InstancedMesh(keepGeometry(new T.OctahedronGeometry(1,0)),keepMaterial(new T.MeshBasicMaterial({color:'#9c1921'})),dropletPositions.length);
  drops.instanceMatrix.setUsage(T.DynamicDrawUsage);drops.frustumCulled=false;world.add(drops);
  const traversal=traversalVisuals(T,world,arena);
  function update(time,dt,state){
    river?.update(time,state,quality);
    if(state?.player)sky.position.set(state.player.x,(state.player.y??0)+1.6,state.player.z);
    portal.visible=lines.visible=!state?.portalUsed;
    if(time>=decorationAt&&time-decorationAt<1/quality.decorationHz)return;
    decorationAt=time;traversal.update(time,quality.id!=='low');bloodTime.value=time;
    const visible=!state?.portalUsed;portal.visible=visible;portalMat.opacity=.1+Math.sin(time*2.8)*.055;
    linesMat.opacity=.2+Math.sin(time*2.2)*.13;
    for(let layer=0;layer<2;layer++){
      flamePositions.forEach((p,i)=>{const f=1+Math.sin(time*9+i*2)*.17+Math.sin(time*14+i)*.07,k=layer?.59:1;
        dummy.position.set(p.x+Math.sin(time*5+i)*.04,p.y+(layer?-.06:.05),p.z);dummy.rotation.set(.08*Math.sin(time*3+i),time*.7+i,.1*Math.sin(time*4+i));
        dummy.scale.set(.26*p.scale*k,.54*p.scale*f*k,.26*p.scale*k);dummy.updateMatrix();fireMeshes[layer].setMatrixAt(i,dummy.matrix);
      });fireMeshes[layer].instanceMatrix.needsUpdate=true;
    }
    dropletPositions.forEach((p,i)=>{const cycle=((time*.37+p.phase)%1+1)%1;dummy.position.set(p.x,.06+(1-cycle*cycle)*p.height,p.z);dummy.rotation.set(0,p.phase,0);dummy.scale.set(.018,.075+cycle*.05,.018);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);});
    drops.instanceMatrix.needsUpdate=true;
    fluidTex.offset.x=time*.003;
  }
  update(0,0,null);
  return {mapId:arena.id,ready,update,setQuality(value){quality=value;panoramaUniforms.detail.value=value.id==='high'?2:value.id==='medium'?1:0;decorationAt=-Infinity;},dispose(){disposed=true;river?.dispose();traversal.dispose();scene.remove(world);world.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
