import {drawRiverBites} from './umbral-river-visuals.mjs';
import * as T from '../vendor/three/three.module.min.js';
import {createState,step,fire,selectWeapon,setRifleScope,RIFLE_SCOPE,activateFlames,activateMacuahuitl,ammoForWeapon,AMMO_TYPES,FLAMES,MACUAHUITL,OBSIDIAN_SHIELD,shieldRegenRate,WEAPONS,clamp,SHOTGUN_CYCLE_DURATION} from './umbral-core.mjs';
import {createFlameVisuals} from './umbral-flames.js';
import {createFireWaveVisuals} from './umbral-fire-wave.mjs';
import {createTitanChargeVisuals} from './umbral-titan-charge.mjs';
import {installEnemyVariantTint} from './umbral-variant-visuals.mjs';
import {ENEMY_VARIANTS} from './umbral-variants.mjs';
import {createPairedViewmodels} from './umbral-paired-viewmodels.mjs';
import {TITAN,titanPose} from './umbral-titan.mjs';
import {DESOLLADOR,desolladorPose} from './umbral-desollador.mjs';
import {createDesolladorVortex} from './umbral-desollador-vortex.mjs';
import {MADRE,madrePose,motherCaptureLocked} from './umbral-madre.mjs';
import {installMotherWaterClip,updateMotherWaterClip,createMotherOmen,drawMotherDrag,createMotherGuardians,drawMotherCapture,motherCaptureCamera} from './umbral-madre-visuals.mjs';
import {createMotherFarewell} from './umbral-madre-farewell.mjs';
import {createBossDemoState,continueBossDemo,isBossDemo} from './umbral-boss-demo.mjs';
import {finisherLocked,finisherPrompt} from './umbral-finisher.mjs';
import {createFinisherVisuals,titanFinisherPose,titanFinisherContact} from './umbral-finisher-visuals.mjs';
import {createMacuahuitlVisuals} from './umbral-macuahuitl.js';
import {installBowEffects,createBowTrail,createBowTrailPool} from './umbral-bow-effects.js';

import {createQualityController,createPool,atlasSize} from './umbral-performance.mjs';
import {buildWorld} from './umbral-world.js';
import {getArena,chooseMap} from './umbral-arena.mjs';
import {loadShotgunAudio} from './umbral-shotgun-audio.mjs';
import {loadArsenalAudio} from './umbral-arsenal-audio.mjs';
import {loadEnemyAudio} from './umbral-enemy-audio.mjs';
import {createComaAudio} from './umbral-coma-audio.mjs';
import {createUmbralMusic} from './umbral-music.mjs';
import {clampPitch} from './umbral-aim.mjs';
import {createLocalRecords} from './umbral-local-records.mjs';
import {createEnemyFeedback} from './umbral-enemy-feedback.mjs';
import {createTutorialPreferences,onboardingChoice,createTutorialState,updateTutorial,tutorialGuide} from './umbral-tutorial.mjs';

const root=document.getElementById('umbralDemo');
if(root)boot(root).catch(error=>{
  console.error('UMBRAL:',error);const el=root.querySelector('#umbralError');
  el.hidden=false;el.textContent='No se pudo cargar la arena. Comprueba que WebGL esté disponible y vuelve a abrir la demo.';
  root.querySelector('#umbralStart').disabled=true;
});

async function boot(root){
  const requestedBoss=new URLSearchParams(location.search).get('demo');
  const dedicatedBossKind=['titan','desollador','madre'].includes(requestedBoss)?requestedBoss:null;
  const dedicatedBossDemo=!!dedicatedBossKind;
  const demoName=()=>s.demoBoss==='madre'?'Madre del Ahogo':s.demoBoss==='desollador'?'Desollador':'Titán';
  const ranking=createLocalRecords(root);
  let storage=null;try{storage=localStorage;}catch{}
  const tutorialPreferences=createTutorialPreferences({storage});
  const preferencesReady=tutorialPreferences.load();
  const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,root.querySelector('#'+id));return nodes.get(id);};
  let savedQuality='auto';try{savedQuality=localStorage.getItem('umbral-quality')||'auto';}catch{}
  const quality=createQualityController(savedQuality);
  function prepareNavigation(){const a=getArena(s.mapId);a.navigationPath(s.player,s.player);if(!s.training)a.navigationPath({...s.player,height:s.mapId==='rio'?MADRE.height:4.6*TITAN.scale},s.player);}
  const stage=$('umbralStage'),canvas=$('umbralScene'),weaponCanvas=$('umbralWeapon'),wc=weaponCanvas.getContext('2d');
  const motherFarewell=createMotherFarewell(stage);
  const overlay=$('umbralOverlay'),title=$('umbralOverlayTitle'),copy=$('umbralOverlayCopy'),start=$('umbralStart'),restart=$('umbralRestart');
  const weaponIcons=['knife','shotgun','rifle','smg','bow','gauss'];
  const assetRoot=root.dataset.assetRoot||'./assets/img/umbral-demo/';
  start.disabled=true;start.textContent='Preparando arsenal…';
  const response=await fetch(assetRoot+'assets.json',{cache:'no-store'});if(!response.ok)throw new Error('Missing asset manifest');
  const assets=await response.json(),images=new Map(),textures=new Map();
  installBowEffects(assets,images);
  const files=new Map();
  function register(file,columns=1,rows=1,limit=256){if(!file)return;files.set(file,{columns,rows,limit});}
  for(const w of assets.weapons){
    if(w.id==='incensario')continue;
    register(w.ready,w.readyColumns||1,w.readyRows||1,384);
    for(const seq of [w.primary,w.secondary,w.cycle])if(seq)register(seq.file,seq.columns||seq.frames,seq.rows||1,384);
    if(w.dual)register(w.dual.file,w.dual.columns,w.dual.rows,640);
  }
  if(assets.abilities.titanFinisher){const seq=assets.abilities.titanFinisher;register(seq.file,seq.columns,seq.rows,640);}
  register(assets.abilities.macuahuitl.ready,1,1,384);
  register(assets.abilities.flames.file,assets.abilities.flames.columns,assets.abilities.flames.rows,640);
  for(const enemy of Object.values(assets.enemies))for(const seq of Object.values(enemy.states))register(seq.file,seq.columns||seq.frames,seq.rows||1);
  for(const seq of Object.values(assets.effects))register(seq.file,seq.columns||seq.frames,seq.rows||1);
  let atlasBytes=0;
  function loadImage(file,{columns,rows,limit}){
    if(images.has(file))return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const im=new Image();im.onload=()=>{
        const {width,height}=atlasSize(im.width,im.height,columns,rows,limit);
        if(width!==im.width||height!==im.height){
          const scaled=document.createElement('canvas');scaled.width=width;scaled.height=height;
          const ctx=scaled.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(im,0,0,width,height);images.set(file,scaled);
        }else images.set(file,im);
        atlasBytes+=width*height*4;resolve();
      };im.onerror=()=>reject(new Error('Asset unavailable: '+file));im.src=assetRoot+file;
    });
  }
  await Promise.all([...files].map(([file,spec])=>loadImage(file,spec)));
  const riverSprites=Object.fromEntries(['bite','swarm'].map(kind=>{const sequence=assets.effects['river-soul-'+kind];return [kind,{sequence,image:images.get(sequence.file)}];}));
  const renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
  const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
  const graphics=gl.getParameter(debugRenderer?.UNMASKED_RENDERER_WEBGL||gl.RENDERER);
  const scene=new T.Scene();
  const enemyFeedback=createEnemyFeedback(T,scene,$('umbralCrosshair'));
  const flames=createFlameVisuals(T,scene,images.get(assets.effects['ritual-flame'].file),assets.effects['ritual-flame']),dropVisuals=new Map();
  const fireWaves=createFireWaveVisuals(T,scene,images.get(assets.effects['ritual-flame'].file),assets.effects['ritual-flame']);
  const desolladorVortex=createDesolladorVortex(T,scene);
  const titanCharge=createTitanChargeVisuals(T,scene,images.get(assets.effects['titan-charge-aura'].file),assets.effects['titan-charge-aura']);
  const pairedViewmodels=createPairedViewmodels(assets,images);
  const finisherVisuals=createFinisherVisuals(assets,images);
  const macuahuitl=createMacuahuitlVisuals(T,scene,images.get(assets.abilities.macuahuitl.ready));
  const camera=new T.PerspectiveCamera(78,16/9,.06,300);camera.rotation.order='YXZ';
  const preferences=await preferencesReady;
  let onboardingScreen=dedicatedBossDemo||preferences.seen?null:'experience';
  let s=dedicatedBossDemo?createBossDemoState(dedicatedBossKind):preferences.seen?createState(chooseMap()):createTutorialState(),keys=new Set(),mouse={primary:false,secondary:false},sound=new URLSearchParams(location.search).get('sound')!=='0',audio=null,lastTime=0,shot=null,recoil=0,messageUntil=0,fpsTime=0,fpsFrames=0,hudTime=0,disposed=false,dragging=false,dragPoint=null;
  let lastPaint=0,frameSamples=[],workTotal=0,performanceReport='Entra a la arena para medir el rendimiento.';
  let cameraEyeY=(s.player.y||0)+1.6;
  const enemyVisuals=new Map(),bulletVisuals=new Map(),effects=[],supplyVisuals=[],hazardVisuals=new Map(),warningVisuals=new Map();
  const events=new AbortController(),on=(target,name,fn,options={})=>target.addEventListener(name,fn,{...options,signal:events.signal});
  const music=createUmbralMusic({onError:error=>console.warn('UMBRAL: música no disponible',error)});
  music.media.hidden=true;music.media.id='umbralMusic';root.append(music.media);
  for(const slider of root.querySelectorAll('[data-music-volume]'))on(slider,'input',()=>{
    const percent=Math.round(music.setVolume(Number(slider.value)/100)*100);
    root.querySelectorAll('[data-music-volume]').forEach(input=>{input.value=String(percent);});
    root.querySelectorAll('[data-music-level]').forEach(output=>{output.textContent=percent+'%';});
  });
  let shotgunAudio=null,arsenalAudio=null,enemyAudio=null,comaAudio=null,audioMix=null;
  const uiSounds=new Set();
  try{
    audio=new(window.AudioContext||window.webkitAudioContext)();
    audioMix=audio.createDynamicsCompressor();
    audioMix.threshold.value=-8;audioMix.knee.value=8;audioMix.ratio.value=6;audioMix.attack.value=.003;audioMix.release.value=.12;
    audioMix.connect(audio.destination);
    comaAudio=createComaAudio(audio,audioMix);
    const loaded=await Promise.allSettled([loadShotgunAudio(audio,undefined,audioMix),loadArsenalAudio(audio,undefined,audioMix),loadEnemyAudio(audio,undefined,audioMix)]);
    if(loaded[0].status==='fulfilled')shotgunAudio=loaded[0].value;
    if(loaded[1].status==='fulfilled')arsenalAudio=loaded[1].value;
    if(loaded[2].status==='fulfilled')enemyAudio=loaded[2].value;
    for(const result of loaded)if(result.status==='rejected')console.warn('UMBRAL: audio no disponible',result.reason);
  }catch(error){console.warn('UMBRAL: audio no disponible',error);}
  function announce(text,seconds=3){$('umbralMessage').textContent=text;messageUntil=s.time+seconds;}
  let world=buildWorld(T,scene,assetRoot,getArena(s.mapId),riverSprites);
  const motherOmen=createMotherOmen(T,scene,images,assets);
  const motherGuardians=createMotherGuardians(T,scene,images,assets);
  const tracePool=createPool(()=>{
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(6),3).setUsage(T.DynamicDrawUsage));
    const mesh=new T.Line(geometry,new T.LineBasicMaterial({transparent:true,opacity:.7}));mesh.frustumCulled=false;return mesh;
  },mesh=>{mesh.geometry.dispose();mesh.material.dispose();},64);
  const bowPool=createBowTrailPool(T);
  function releaseEffect(effect){
    const mesh=effect.mesh;scene.remove(mesh);
    if(effect.release){effect.release(mesh);return;}
    mesh.material.map?.dispose();if(!mesh.isSprite)mesh.geometry?.dispose();mesh.material.dispose();
  }
  function ammoVisual(type){
    const group=new T.Group();group.userData.ammoType=type;
    if(type==='obsidian'){
      // An asymmetric, sharp flake of black volcanic glass, with flat facets.
      const rim=[[-.26,-.10,-.08],[-.10,-.18,-.22],[.22,-.12,-.14],[.29,-.16,.07],[.06,-.20,.24],[-.20,-.14,.17]];
      const tip=[-.08,.91,-.03],base=[.01,-.24,.01],vertices=[],colors=[];
      const palette=['#282133','#100e17','#372e48','#14121d','#51465e','#211c2c'];
      function face(a,b,c,color){const tint=new T.Color(color);vertices.push(...a,...b,...c);for(let i=0;i<3;i++)colors.push(tint.r,tint.g,tint.b);}
      for(let i=0;i<rim.length;i++){const next=(i+1)%rim.length;face(rim[i],tip,rim[next],palette[i]);face(rim[next],base,rim[i],'#100e17');}
      // A narrow glint follows one cutting edge without turning the rock neon.
      face(rim[4],tip,[.075,-.19,.227],'#a191b4');
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
      group.add(new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide})));
      const halo=new T.Mesh(new T.RingGeometry(.31,.38,16),new T.MeshBasicMaterial({color:AMMO_TYPES[type].color,transparent:true,opacity:.3,side:T.DoubleSide,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=-.22;group.add(halo);
    }else if(type==='thorns'){
      const body=new T.Mesh(new T.CylinderGeometry(.27,.22,.38,6),new T.MeshBasicMaterial({color:'#433525'}));group.add(body);
      for(let i=0;i<5;i++){const thorn=new T.Mesh(new T.ConeGeometry(.055,.72,5),new T.MeshBasicMaterial({color:i%2?'#d8d9a5':'#9adc57'}));thorn.position.set(Math.cos(i*1.256)*.15,.34,Math.sin(i*1.256)*.15);thorn.rotation.z=(i-2)*.08;group.add(thorn);}
    }else{
      const small=type==='small';group.add(new T.Mesh(new T.BoxGeometry(small?.55:.7,.35,.4),new T.MeshBasicMaterial({color:AMMO_TYPES[type].color})));
      for(let i=0;i<(small?3:2);i++){const bullet=new T.Mesh(new T.BoxGeometry(small?.07:.13,.3,.43),new T.MeshBasicMaterial({color:'#fff0cb'}));bullet.position.x=(i-(small?1:.5))*.17;group.add(bullet);}
    }
    return group;
  }
  function bloodVisual(){
    const group=new T.Group();
    // Faceted crimson droplet with a sharp tip, readable from any approach.
    const profile=[[0,-.18],[.14,-.14],[.23,-.02],[.22,.12],[.14,.28],[.05,.44],[0,.6]];
    const geometry=new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),8).toNonIndexed();
    const positions=geometry.getAttribute('position'),colors=[];
    for(let i=0;i<positions.count;i++){
      const tint=new T.Color('#ed3044');tint.multiplyScalar(.68+.32*(positions.getX(i)+.23)/.46);colors.push(tint.r,tint.g,tint.b);
    }
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    group.add(new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true})));
    const glint=new T.Mesh(new T.OctahedronGeometry(.065),new T.MeshBasicMaterial({color:'#ffd5c9'}));
    glint.position.set(-.09,.15,.19);glint.scale.set(.5,1.5,.5);group.add(glint);
    const halo=new T.Mesh(new T.RingGeometry(.27,.34,12),new T.MeshBasicMaterial({color:'#ff5362',transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false}));
    halo.rotation.x=-Math.PI/2;halo.position.y=-.22;group.add(halo);
    return group;
  }
  function rebuildSupplies(){
  supplyVisuals.forEach(removeDrop);supplyVisuals.length=0;
  for(const p of s.supplies){
    const g=p.kind==='ammo'?ammoVisual(p.ammoType):new T.Group();
    if(p.kind==='health'){
      g.add(new T.Mesh(new T.BoxGeometry(.55,.55,.55),new T.MeshBasicMaterial({color:'#dc4943'})));
      for(const size of [[.34,.1,.58],[.1,.34,.58]])g.add(new T.Mesh(new T.BoxGeometry(...size),new T.MeshBasicMaterial({color:'#fff0ca'})));
    }
    g.position.set(p.x,p.y+.55,p.z);scene.add(g);supplyVisuals.push(g);
  }

  }
  rebuildSupplies();
  function atlasTexture(file){if(!textures.has(file)){const tex=new T.Texture(images.get(file));tex.colorSpace=T.SRGBColorSpace;tex.magFilter=T.NearestFilter;tex.minFilter=T.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true;textures.set(file,tex);}return textures.get(file);}
  function enemyVisual(e){const maps={};for(const [state,seq] of Object.entries(assets.enemies[e.kind].states)){maps[state]=atlasTexture(seq.file).clone();maps[state].needsUpdate=true;maps[state].repeat.set(1/seq.frames,1/(seq.rows||1));maps[state].offset.y=1-((seq.row||0)+1)/(seq.rows||1);}
    const material=new T.SpriteMaterial({map:maps.move,alphaTest:.12,transparent:true,depthWrite:true});
    if(e.kind==='madre')installMotherWaterClip(material);
    if(e.variant&&ENEMY_VARIANTS[e.kind])installEnemyVariantTint(T,material,ENEMY_VARIANTS[e.kind].color);
    const sprite=new T.Sprite(material);sprite.center.set(...(assets.enemies[e.kind].anchor||[.5,.065]));sprite.scale.set(e.width||e.height,e.width||e.height,1);scene.add(sprite);const visual={sprite,maps};enemyVisuals.set(e.id,visual);return visual;
  }
  function frameAt(seq,time,loop=true){let ms=time*1000;const durations=seq.durations||[130,130,130,130],total=durations.reduce((a,b)=>a+b,0);ms=loop?ms%total:Math.min(ms,total-1);let n=0;while(n<durations.length-1&&ms>=durations[n]){ms-=durations[n];n++;}return n;}
  function clearDynamic(){motherGuardians.clear();motherOmen.clear();motherFarewell.clear();desolladorVortex.clear();shotgunAudio?.stop();flames.clear();fireWaves.clear();titanCharge.clear();macuahuitl.clear();stopAudio();for(const v of dropVisuals.values())removeDrop(v);dropVisuals.clear();for(const v of enemyVisuals.values()){scene.remove(v.sprite);v.sprite.material.dispose();Object.values(v.maps).forEach(t=>t.dispose());}enemyVisuals.clear();for(const m of bulletVisuals.values())disposeSprite(m);bulletVisuals.clear();for(const v of hazardVisuals.values()){disposeSprite(v.sprite);scene.remove(v.ring);v.ring.geometry.dispose();v.ring.material.dispose();}hazardVisuals.clear();for(const m of warningVisuals.values()){scene.remove(m);m.geometry.dispose();m.material.dispose();}warningVisuals.clear();for(const e of effects)releaseEffect(e);effects.length=0;}
  function stopAudio(){shotgunAudio?.stop();arsenalAudio?.stop();enemyAudio?.stop();comaAudio?.stop();for(const voice of [...uiSounds]){try{voice.stop();}catch{}uiSounds.delete(voice);}}
  function tone(kind){
    if(!sound||!audio)return;
    const now=audio.currentTime,gain=audio.createGain(),osc=audio.createOscillator();
    gain.connect(audioMix||audio.destination);osc.connect(gain);uiSounds.add(osc);
    const frequencies={pain:48,pickup:660,empty:90};
    osc.type='sine';osc.frequency.setValueAtTime(frequencies[kind]||95,now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(22,(frequencies[kind]||95)*.22),now+.17);
    gain.gain.setValueAtTime(.035,now);gain.gain.exponentialRampToValueAtTime(.001,now+.22);
    osc.onended=()=>{uiSounds.delete(osc);osc.disconnect();gain.disconnect();};osc.start(now);osc.stop(now+.23);
  }
  function trace(event){
    if(effects.length>=quality.level.effects)return;
    const mesh=tracePool.take();mesh.geometry.attributes.position.array.set([event.x+.12,event.y,event.z,event.tx,event.ty,event.tz]);mesh.geometry.attributes.position.needsUpdate=true;
    mesh.material.color.set(event.kind==='gauss'?'#ffe58e':event.kind==='nail'?'#b48bff':event.kind==='smg'?'#a9ef61':'#ffbd7b');mesh.material.opacity=.7;
    const duration=event.intercepted?.16:.07;
    scene.add(mesh);effects.push({mesh,life:duration,total:duration,release:tracePool.release});
  }
  function handleEvents(){for(const event of s.events.splice(0)){
      arsenalAudio?.event(event,s,sound);
      if(event.type!=='bossFinisherEnd')enemyAudio?.event(event,s,sound);
      if(event.type==='shot'){shot={index:event.index,mode:event.secondary?'secondary':'primary',time:0};recoil=event.secondary?1:.6;if(event.index===1){if(sound){audio?.resume();shotgunAudio?.shot(event.secondary);}}}
      else if(event.type==='equip'){shot=null;recoil=.2;}
      else if(event.type==='trace')trace(event);
      else if(event.type==='bowTrail'||event.type==='sniperTrail'){
        if(effects.length<=quality.level.effects-3)for(const effect of createBowTrail(T,event,bowPool)){scene.add(effect.mesh);effects.push(effect);}
      }
      else if(event.type==='impact'||event.type==='burst')impact(event);
      else if(event.type==='bowExplosion'){impact({...event,type:'burst',kind:'jaguar-explosion',size:event.radius*1.2});}
      else if(event.type==='portal')announce('VIDA RESTAURADA · 100 / 100',3);
      else if(event.type==='ascension')announce('SELLO DE ASCENSO · SIGUE DISPARANDO',1.4);
      else if(event.type==='fallRecovery')announce('CAÍDA · 15 DE DAÑO · DE VUELTA A TIERRA FIRME',2);
      else if(event.type==='shieldBreak')announce(s.shieldLockedWave?'ESCUDO BLOQUEADO · SUPERA LA HORDA':'OBSIDIANA AGOTADA · BUSCA COBERTURA',3);
      else if(event.type==='shieldUnlocked')announce('HORDA SUPERADA · ESCUDO DESBLOQUEADO',3);
      else if(event.type==='wave')announce(event.wave===3?'HORDA 3 · VARIANTES DE COLOR: RESISTEN LA EJECUCIÓN CON F':'HORDA '+event.wave+' · EN MOVIMIENTO',event.wave===3?4:3);
      else if(event.type==='motherWarning')announce(event.attack==='hands'?'MANOS · SAL DE LA MARCA MORADA':'OLEADA DE ÁNIMAS · ESQUIVA',2);
      else if(event.type==='motherRise')announce('EMERGE DEL RÍO · DISPARA Y ESQUIVA',2.5);
      else if(event.type==='motherSink')announce('SE SUMERGE · BUSCA SU CABEZA',2.5);
      else if(event.type==='motherDragWarning')announce('QUIERE ARRASTRARTE · ALÉJATE Y DISPARA',3);
      else if(event.type==='motherDragEnd'&&['interrupted','water','escaped'].includes(event.reason))announce(event.reason==='interrupted'?'AGARRE ROTO · SIGUE DISPARANDO':event.reason==='water'?'SAL POR LAS RAMPAS · LAS ÁNIMAS TE MUERDEN':'ESCAPASTE DEL ARRASTRE',2);
      else if(event.type==='motherCaptureStart'){shot=null;mouse.primary=mouse.secondary=false;dragging=false;announce('',2);}
      else if(event.type==='motherCaptureEnd'&&event.reason==='released')announce('ABRAZO DEL AHOGO · −60 DE VIDA',2.5);
      else if(event.type==='motherDeathCry')announce('',MADRE.deathDuration-.4);
      else if(event.type==='desolladorWarning')announce(({blades:'CUCHILLAS · ESQUIVA DE LADO',dive:'PICADO · SAL DEL CÍRCULO TURQUESA',suction:'VÓRTICE · DISPARA PARA LIBERARTE',melee:'ESPADAS · ALÉJATE'})[event.attack],2);
      else if(event.type==='desolladorVortexBroken')announce('VÓRTICE ROTO · VUELVES A LA ARENA',2);
      else if(event.type==='desolladorSlash')announce('ESPADAS · 50 DE DAÑO',1.2);
      else if(event.type==='desolladorComboStart')announce('ATRAPADO · RÁFAGA DE TAJOS',DESOLLADOR.vortexCombo);
      else if(event.type==='desolladorComboHit')recoil=Math.max(recoil,.18);
      else if(event.type==='desolladorReturn')announce('REGRESANDO A UNA PLATAFORMA',1.4);
      else if(event.type==='desolladorLanding'){impact({...event,kind:'wind-vortex',size:6});announce('TAJOS BLANCOS · ESQUIVA Y BUSCA COBERTURA',3);}
      else if(event.type==='desolladorCutsEnd')announce('VULNERABLE · CONTRAATACA',2);
      else if(event.type==='bossArrived')announce(event.kind==='madre'?'MADRE DEL AHOGO · BUSCA SU CABEZA EN EL AGUA':event.kind==='desollador'?'DESOLLADOR DEL VENDAVAL · EVITA EL PICADO Y CONTRAATACA':'TITÁN DE OBSIDIANA · ESQUIVA Y ATACA SU NÚCLEO',4);
      else if(event.type==='bossRage')announce(event.kind==='madre'?'LA MADRE ENFURECE · CUIDADO CON LAS MANOS':event.kind==='desollador'?'EL VENDAVAL ENFURECE · MANTENTE EN MOVIMIENTO':'ARMADURA ROTA · EL TITÁN ENFURECE',3);
      else if(event.type==='bossDemoComplete')showOverlay('boss-complete');
      else if(event.type==='bossDefeated')announce(event.kind==='madre'?'':event.kind==='desollador'?'DESOLLADOR DEL VENDAVAL DERROTADO':'TITÁN DE OBSIDIANA DERROTADO',event.kind==='madre'?MADRE.deathDuration:4);
      else if(event.type==='bossDowned')announce('NÚCLEO EXPUESTO · ACÉRCATE Y REMATA CON F',5);
      else if(event.type==='bossFinisherStart'){clearInput();shot=null;shotgunAudio?.stop();stopAudio();}
      else if(event.type==='bossFinisherEnd'){
        if(s.phase==='boss-demo-complete')showOverlay('boss-complete');
        // The ending remains audible after the overlay stops the combat voices.
        enemyAudio?.event(event,s,sound);
      }
      else if(event.type==='bossSkulls')announce('CALAVERAS PERSEGUIDORAS · MUÉVETE Y BUSCA COBERTURA',2);
      else if(event.type==='bossLeap'||event.type==='bossRecovery')announce('EL TITÁN CAERÁ AQUÍ · SAL DEL CÍRCULO MORADO',2.5);
      else if(event.type==='bossSummon')announce('EL TITÁN INVOCA A SUS IMPS',2);
      else if(event.type==='floodWarning')announce('EL RÍO VA A CRECER · SUBE A LOS PUENTES',4);
      else if(event.type==='pickup'){tone('pickup');announce(event.kind==='health'?`+${event.amount} VIDA`:`+${event.amount} ${event.ammoType==='obsidian'?'OBSIDIANA':'MUNICIÓN '+AMMO_TYPES[event.ammoType].label}`,2);}
      else if(event.type==='flames'){shot=null;shotgunAudio?.stop();announce('LLAMAS INCESANTES · QUEMA PARA OBTENER MUNICIÓN',2);}
      else if(event.type==='macuahuitl'){shot=null;shotgunAudio?.stop();}
      else if(event.type==='macuahuitlImpact'){macuahuitl.impact(event,s);recoil=.55;announce(event.boss?'JEFE INTERRUMPIDO':event.resistant?'VARIANTE · 75 DAÑO · '+event.stunned+' ATURDIDOS':'RECOGE LA SANGRE · '+event.stunned+' ATURDIDOS',2);}
      else if(event.type==='macuahuitlMeleeImpact')recoil=event.combo===3?.32:event.combo===2?.24:.18;
      else if(event.type==='macuahuitlMiss')announce(s.macuahuitlCharged?'TAJO AL AIRE · PODER CONSERVADO':'GOLPE AL AIRE · ACÉRCATE AL ENEMIGO',1.2);
      else if(event.type==='burnKill')announce('ENEMIGO QUEMADO · MUNICIÓN CHICA, GRANDE Y OBSIDIANA',2);
      else if(event.type==='pain')tone('pain');
      else if(event.type==='empty'){tone('empty');announce(WEAPONS[s.selected].ammoType==='obsidian'?'SIN OBSIDIANA · BUSCA PIEDRAS EN LA ARENA':'SIN MUNICIÓN · R: LLAMAS / BUSCA SUMINISTROS',2);}
      else if(event.type==='hit')enemyFeedback.hit(event,s.time);
      else if(event.type==='death'){void ranking.finish(s,'dead');showOverlay('dead');}
    }}
  function effectSprite(kind){
    const seq=assets.effects[kind==='wind-cut'?'wind-blade':kind],map=atlasTexture(seq.file).clone();
    map.repeat.set(1/(seq.columns||seq.frames),1/(seq.rows||1));map.needsUpdate=true;
    const sprite=new T.Sprite(new T.SpriteMaterial({map,transparent:true,alphaTest:.08,depthWrite:false}));
    if(kind==='wind-cut'){
      sprite.userData.cut=true;
      // Reuse the four authored sword-cut frames, with a white edge and no
      // additional lights, textures or geometry allocations per animation frame.
      sprite.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat cutLight=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)); diffuseColor.rgb=vec3(mix(.65,1.,cutLight)); diffuseColor.a*=smoothstep(.12,.5,cutLight);');};
      sprite.material.customProgramCacheKey=()=> 'umbral-white-cut-v1';
    }
    const anchor=seq.threeSpriteCenter||[.5,.5];sprite.center.set(anchor[0],anchor[1]);
    sprite.userData.seq=seq;effectFrame(sprite,0);sprite.scale.setScalar(kind==='wind-blade'?2:kind==='titan-plasma'?1.65:kind==='titan-skull'?1.3:kind==='acid-projectile'?1.05:.85);scene.add(sprite);return sprite;
  }
  function effectFrame(sprite,frame){const seq=sprite.userData.seq,cols=seq.columns||seq.frames,rows=seq.rows||1;sprite.material.map.offset.set((frame%cols)/cols,1-(Math.floor(frame/cols)+1)/rows);}
  function disposeSprite(sprite){if(!sprite)return;scene.remove(sprite);sprite.material.map?.dispose();sprite.material.dispose();}
  function removeDrop(group){scene.remove(group);group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
  function renderDrops(){
    const ids=new Set(s.drops.map(d=>d.id));
    for(const [id,mesh] of dropVisuals)if(!ids.has(id)){removeDrop(mesh);dropVisuals.delete(id);}
    for(const d of s.drops){
      let mesh=dropVisuals.get(d.id);
      if(!mesh){
        mesh=d.kind==='health'?bloodVisual():ammoVisual(d.ammoType);
        scene.add(mesh);dropVisuals.set(d.id,mesh);
      }
      mesh.position.set(d.x,d.y+.25+Math.sin(s.time*3+d.id)*.06,d.z);mesh.rotation.y=s.time;
      mesh.visible=d.life>5||Math.sin(s.time*12)>0;
    }
  }
  function ring(x,y,z,color,radius){
    const mesh=new T.Mesh(new T.RingGeometry(.84,1,32),new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y+.035,z);mesh.scale.setScalar(radius);scene.add(mesh);return mesh;
  }
  function impact(event){
    if(effects.length>=quality.level.effects)return;
    const mesh=effectSprite(event.kind),size=event.size??(event.type==='burst'?2:1.05);
    mesh.position.set(event.x,event.y,event.z);
    if(event.kind==='wind-cut')mesh.scale.set(size*2.6,size*.65,1);else mesh.scale.setScalar(size);
    effects.push({mesh,seq:mesh.userData.seq,life:.32,total:.32,size});
  }
  const shieldGeometry=new T.BufferGeometry(),shieldPositions=new Float32Array(14*3*6);
  shieldGeometry.setAttribute('position',new T.BufferAttribute(shieldPositions,3).setUsage(T.DynamicDrawUsage));
  const shieldLines=new T.LineSegments(shieldGeometry,new T.LineBasicMaterial({color:'#d0b5ff',transparent:true,opacity:.8}));
  shieldLines.frustumCulled=false;scene.add(shieldLines);
  function renderShields(){let n=0;
    for(const link of s.shieldLinks){const from=s.enemies.find(e=>e.id===link.from),to=s.enemies.find(e=>e.id===link.to);
      if(!from||!to||from.hp<=0||to.hp<=0)continue;
      shieldPositions.set([from.x,from.y+from.height*.6,from.z,to.x,to.y+to.height*.6,to.z],n*6);n++;
    }
    shieldGeometry.setDrawRange(0,n*2);shieldGeometry.attributes.position.needsUpdate=true;
    shieldLines.material.opacity=.6+Math.sin(s.time*8)*.2;
  }
  function renderAttacks(){
    const ids=new Set(s.projectiles.map(b=>b.id));
    for(const [id,sprite] of bulletVisuals)if(!ids.has(id)){disposeSprite(sprite);bulletVisuals.delete(id);}
    for(const b of s.projectiles){
      let sprite=bulletVisuals.get(b.id);
      if(!sprite){
        sprite=effectSprite(b.kind);if(b.kind==='madre-wave')sprite.scale.set(3,3,1);
        if(b.kind==='wind-cut')sprite.scale.set(2.6,.65,1);bulletVisuals.set(b.id,sprite);
        if(b.tint){
          // Recolor the authored animated plasma texture, including its bright core.
          sprite.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat ashLight=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)); diffuseColor.rgb=mix(vec3(.58,.32,.95)*ashLight,vec3(.94,.85,1.),pow(ashLight,4.));');};
          sprite.material.customProgramCacheKey=()=> 'umbral-ash-projectile-v1';
        }
      }
      const seq=sprite.userData.seq;sprite.position.set(b.x,b.y,b.z);
      sprite.material.color.set(b.tint||'#ffffff');
      effectFrame(sprite,frameAt(seq,b.age,true));
      if(b.kind!=='madre-wave'&&b.kind!=='plasma-projectile'&&b.kind!=='titan-skull'&&b.kind!=='titan-plasma'){
        const yaw=s.player.yaw,pitch=s.player.pitch;
        const vx=b.dx*Math.cos(yaw)-b.dz*Math.sin(yaw);
        const vy=b.dy*Math.cos(pitch)+(b.dx*Math.sin(yaw)+b.dz*Math.cos(yaw))*Math.sin(pitch);
        sprite.material.rotation=Math.hypot(vx,vy)>.2?Math.atan2(vy,vx):0;
        if(b.kind==='wind-cut')sprite.material.rotation+=b.slashMirror?-.4:.4;
      }
    }
    const hazards=new Set(s.hazards.map(h=>h.id));
    for(const [id,v] of hazardVisuals)if(!hazards.has(id)){
      disposeSprite(v.sprite);scene.remove(v.ring);v.ring.geometry.dispose();v.ring.material.dispose();hazardVisuals.delete(id);
    }
    for(const h of s.hazards){
      let v=hazardVisuals.get(h.id);
      if(!v){v={sprite:h.flameWave?null:effectSprite(h.kind),ring:ring(h.x,h.y,h.z,(h.kind==='obsidian-spikes'||h.kind==='madre-hands')?'#b785ee':h.flameWave?'#ff873d':'#f6c578',h.radius||1.4)};hazardVisuals.set(h.id,v);}
      const active=h.age-h.warning,seq=v.sprite?.userData.seq;
      if(v.sprite){v.sprite.visible=active>=0;v.sprite.position.set(h.x,h.y+.035,h.z);}
      v.ring.material.opacity=active<0?.5+Math.sin(s.time*22)*.25:.35;
      if(active<0){v.ring.scale.setScalar(h.kind==='obsidian-spikes'?1.15:1.6);continue;}
      if(h.flameWave){v.ring.visible=false;continue;}
      v.sprite.material.map.offset.x=frameAt(seq,active,false)/seq.frames;
      if(h.kind==='ground-shockwave'){
        v.ring.scale.setScalar(h.radius);v.sprite.scale.set(h.radius*2,h.radius*.62,1);
        v.sprite.material.opacity=Math.max(0,1-active/h.duration)*.8;
      }else{const size=h.kind==='madre-hands'?3.5:2.5;v.sprite.scale.set(size,size,1);v.ring.scale.setScalar(h.radius);}
    }
    const leapWarnings=s.enemies.filter(e=>e.hp>0&&e.kind==='acechador'&&e.cast?.target).map(e=>({...e.cast.target,id:'leap-'+e.id,remaining:e.cast.remaining,total:e.windup,leap:true}));
    const titanWarnings=s.enemies.filter(e=>e.hp>0&&e.kind==='titan'&&(e.bossMotion||e.cast?.attack==='jump')).map(e=>({...((e.bossMotion||e.cast).target),id:'titan-'+e.id,titan:true}));
    const windWarnings=s.enemies.filter(e=>e.hp>0&&e.kind==='desollador'&&(e.bossMotion||e.cast?.attack==='dive')).map(e=>({...((e.bossMotion||e.cast).target),id:'wind-'+e.id,wind:true}));
    const arrivals=[...s.spawnWarnings,...leapWarnings,...titanWarnings,...windWarnings],warnings=new Set(arrivals.map(w=>w.id));
    for(const [id,mesh] of warningVisuals)if(!warnings.has(id)){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();warningVisuals.delete(id);}
    for(const w of arrivals){
      let mesh=warningVisuals.get(w.id);if(!mesh){mesh=ring(w.x,w.y,w.z,w.wind?'#74f6ed':w.titan?'#cb80ff':w.leap?'#ff773b':'#f3a75e',1.6);warningVisuals.set(w.id,mesh);}
      mesh.position.set(w.x,w.y+.035,w.z);
      mesh.scale.setScalar(w.wind?DESOLLADOR.diveRadius:w.titan?TITAN.landingRadius:w.leap?.7+w.remaining/w.total*.6:1.2+(1-w.remaining/w.total)*.8);mesh.material.opacity=.65+Math.sin(s.time*15)*.2;
    }
    desolladorVortex.update(s,quality.level.id);
    fireWaves.update(s);
  }
  function clearInput(){setRifleScope(s,false);keys.clear();mouse.primary=mouse.secondary=false;s.triggerHeld.primary=s.triggerHeld.secondary=false;s.player.jumpHeld=false;s.player.jumpBuffer=0;dragging=false;dragPoint=null;}
  function showOverlay(mode){music.setPlaying(false);clearInput();shotgunAudio?.stop();stopAudio();overlay.hidden=false;start.hidden=mode==='dead';restart.hidden=false;
    $('umbralOnboarding').hidden=true;$('umbralTutorialButton').hidden=!!s.training;
    $('umbralNormalGame').hidden=!isBossDemo(s)&&!dedicatedBossDemo;
    $('umbralDesolladorDemo').hidden=isBossDemo(s)&&s.demoBoss==='desollador';
    $('umbralMadreDemo').hidden=isBossDemo(s)&&s.demoBoss==='madre';
    $('umbralTitanDemo').hidden=isBossDemo(s)&&s.demoBoss==='titan';
    if(isBossDemo(s)){
      if(mode!=='dead'&&mode!=='boss-complete')s.phase='paused';
      if(document.pointerLockElement===canvas)document.exitPointerLock();
      title.textContent=mode==='boss-complete'?`${s.demoBoss==='madre'?'La':'El'} ${demoName()} ha caído.`:mode==='dead'?`${s.demoBoss==='madre'?'La':'El'} ${demoName()} te ha derrotado.`:`Combate contra ${s.demoBoss==='madre'?'la':'el'} ${demoName()}`;
      copy.textContent=mode==='boss-complete'?`Combate completado. Puedes repetir el combate contra ${demoName()} o continuar a la horda 11 en esta arena. Esta demo no registra puntuación.`:mode==='dead'?'Vuelve a intentarlo con vida, escudo y munición completos. Esquiva los ataques y aprovecha su recuperación.':s.demoBoss==='madre'?'Río de las Ánimas · 12,000 de vida. Apunta a su cabeza descubierta: las calaveras interceptan los primeros disparos, una por una. Insiste hasta acertarle para hacerla emerger. Esquiva oleadas y manos. Si caes al agua, su abrazo quita 60 de vida y te devuelve a la orilla si sobrevives. Sin puntuación.':s.demoBoss==='desollador'?'Corona del Viento · 18,000 de vida. Sus espadas hacen 50 de daño: mantén distancia. El tornado te arrastra en espiral: vacía la barra cian antes de llegar al jefe. Si te atrapa, encadena 4 segundos de tajos (70 de daño total) y te devuelve a la pista. Tras el picado lanza tajos blancos durante 5.5 s: 40 de daño; desde 9,000 de vida, 50 y 30% más rápidos. Contraataca al terminar. Sin puntuación.':'Primero rompe sus 6,250 de escudo. Después, sus 6,250 de vida: hace más daño, lanza calaveras e invoca imps. Cuando caiga de rodillas, acércate y pulsa F. Sin puntuación.';
      start.hidden=mode==='dead';start.textContent=mode==='boss-complete'?'Continuar a horda 11':'Continuar';restart.textContent='Repetir combate · '+demoName();
      if(s.wave>10){title.textContent=mode==='dead'?'Has caído en la práctica.':'Hordas de práctica';copy.textContent=`Continúa sin puntuación o vuelve a enfrentar a ${demoName()}. Puedes abrir el juego normal con Jugar hordas.`;}
      (mode==='dead'?restart:start).focus();updateHud();return;
    }
    if(s.training){
      s.phase='paused';title.textContent='¿Listo para ir a la acción?';
      copy.textContent=s.training.completed?'Completaste el tutorial. En las hordas, el escudo morado regenera tras 5 s sin daño, cada vez más lento. Desde la horda 7, si llega a cero, debes superar la horda para recuperarlo. Cuida tu vida roja con F. ¿Empezamos?':'Puedes empezar una partida cuando quieras o quedarte para probar las armas y los poderes. El tutorial no suma al historial.';
      start.hidden=false;start.textContent='Seguir practicando';restart.textContent='Comenzar partida';
      if(document.pointerLockElement===canvas)document.exitPointerLock();start.focus();updateHud();return;
    }
    if(mode!=='dead')void ranking.checkpoint(s);
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    if(mode==='dead'){title.textContent='Has caído.';copy.textContent=`Horda ${s.wave} · ${s.kills} demonios eliminados. Vuelve a entrar cuando quieras.`;restart.textContent='Volver a jugar';}
    else {s.phase='paused';title.textContent='Pausa';copy.textContent=`WASD: moverte · Espacio: saltar · Mouse: apuntar · 1–6: armas. R: quema para obtener munición. F: ejecuta para curarte. Poderes: 8 s. Escudo: ${shieldRegenRate(s.wave)} puntos/s tras 5 s sin daño. Desde la horda 7, agotarlo lo bloquea hasta superar la horda. Si entras al tutorial, esta partida termina y se guarda tu avance.`;start.textContent='Continuar';restart.textContent='Reiniciar partida';}
    (mode==='dead'?restart:start).focus();
  }
  function pause(){if(s.phase==='playing')showOverlay('paused');}
  async function capture(){try{if(canvas.requestPointerLock)await canvas.requestPointerLock();}catch{announce('Cursor libre: mantén clic y arrastra para mirar. ESC pausa.',5);}}
  let starting=false;
  async function play(reset=false,target=null){
    if(starting)return;
    if(target==='game'&&dedicatedBossDemo){location.assign('./');return;}
    starting=true;start.disabled=restart.disabled=true;$('umbralDesolladorDemo').disabled=true;$('umbralMadreDemo').disabled=true;$('umbralTitanDemo').disabled=true;
    const continuingBossDemo=!reset&&!target&&s.phase==='boss-demo-complete';
    const fresh=!!target||reset||s.phase==='ready'||s.phase==='dead';
    $('umbralTutorialButton').disabled=true;$('umbralExperienceYes').disabled=$('umbralExperienceNo').disabled=true;
    // Capture while the click still carries the browser's user activation.
    if(fresh)music.reset();
    music.setPlaying(true);
    capture();
    if(sound)audio?.resume().catch(()=>{});
    try{
      if(fresh){
        await ranking.finish(s,s.phase==='dead'?'dead':'abandoned');enemyFeedback.clear();
        const practice=target==='tutorial'||(!target&&!!s.training);
        const bossKind=['titan','desollador','madre'].includes(target)?target:!target&&isBossDemo(s)?s.demoBoss||'titan':null;
        const bossDemo=!!bossKind;
        const mapId=practice?'tutorial':bossDemo?(bossKind==='madre'?'rio':bossKind==='desollador'?'corona':'titan-demo'):s.phase==='ready'&&!reset&&s.mapId!=='tutorial'?s.mapId:chooseMap();
        clearDynamic();s=practice?createTutorialState():bossDemo?createBossDemoState(bossKind):createState(mapId);shot=null;
        if(world.mapId!==mapId){
          copy.textContent='Preparando '+getArena(mapId).name+'…';world.dispose();world=buildWorld(T,scene,assetRoot,getArena(mapId),riverSprites);
          await world.ready;world.setQuality(quality.level);
        }
        rebuildSupplies();prepareNavigation();
        if(!s.training&&!isBossDemo(s))await ranking.begin(mapId);
        announce(s.training?'PRACTICA A TU RITMO · SIN DAÑO NI PUNTAJE':isBossDemo(s)?(s.demoBoss==='madre'?'MADRE DEL AHOGO · DISPARA A SU CABEZA PARA HACERLA EMERGER':s.demoBoss==='desollador'?'DESOLLADOR · ESQUIVA Y CASTIGA SU RECUPERACIÓN':'TITÁN · ROMPE SU ESCUDO Y REMATA CON F'):getArena(mapId).name.toUpperCase()+' · CRUZA EL UMBRAL',4);
      }
      if(continuingBossDemo)continueBossDemo(s);
      s.phase='playing';overlay.hidden=true;clearInput();quality.reset();fpsTime=fpsFrames=workTotal=0;frameSamples=[];lastTime=performance.now();canvas.focus();camera.position.y=s.player.y+1.6;tone('pickup');updateHud();
    }catch(error){
      music.setPlaying(false);console.error('UMBRAL arena:',error);s.phase='ready';overlay.hidden=false;copy.textContent='No se pudo preparar la arena. Pulsa Entrar para volver a intentarlo.';
      $('umbralError').hidden=false;$('umbralError').textContent='Error al cargar la arena.';
    }finally{starting=false;start.disabled=restart.disabled=false;$('umbralDesolladorDemo').disabled=false;$('umbralMadreDemo').disabled=false;$('umbralTitanDemo').disabled=false;$('umbralTutorialButton').disabled=false;$('umbralExperienceYes').disabled=$('umbralExperienceNo').disabled=false;}
  }
  function showOnboarding(){
    start.hidden=restart.hidden=$('umbralTutorialButton').hidden=true;$('umbralOnboarding').hidden=false;
    const experience=onboardingScreen==='experience';
    title.textContent=experience?'¿Has jugado un shooter anteriormente?':'¿Quieres hacer el tutorial?';
    copy.textContent=experience?'Aprende los controles en un patio de práctica: movimiento, armas y poderes. Sin enemigos que te ataquen.':'Practica unos minutos antes de las hordas, o entra directo a una partida. Puedes abrir el tutorial después desde la pausa.';
    $('umbralExperienceYes').textContent=experience?'Sí, he jugado':'Sí, hacer tutorial';
    $('umbralExperienceNo').textContent=experience?'No, es mi primera vez':'No, ir a la acción';
    $('umbralExperienceYes').focus();
  }
  function answerOnboarding(yes){
    if(starting)return;
    const experienced=onboardingScreen==='offer',next=onboardingChoice(onboardingScreen,yes);
    if(next==='offer'){onboardingScreen=next;showOnboarding();return;}
    void tutorialPreferences.decide(experienced,next);onboardingScreen=null;
    $('umbralOnboarding').hidden=true;start.hidden=false;
    void play(true,next);
  }
  on($('umbralExperienceYes'),'click',()=>answerOnboarding(true));on($('umbralExperienceNo'),'click',()=>answerOnboarding(false));
  on($('umbralTutorialButton'),'click',()=>play(true,'tutorial'));
  on($('umbralTutorialExit'),'click',pause);
  on($('umbralTitanDemo'),'click',()=>{onboardingScreen=null;play(true,'titan');});
  on($('umbralMadreDemo'),'click',()=>{onboardingScreen=null;play(true,'madre');});
  on($('umbralDesolladorDemo'),'click',()=>{onboardingScreen=null;play(true,'desollador');});
  on($('umbralNormalGame'),'click',()=>play(true,'game'));
  on(start,'click',()=>play());on(restart,'click',()=>play(true,s.training?'game':null));on($('umbralPause'),'click',pause);
  function setSound(enabled){
    sound=enabled; // Music has its own volume control, including zero to mute.
    if(!sound)stopAudio();else if(s.phase==='playing')audio?.resume().catch(()=>{});
    $('umbralSound').setAttribute('aria-pressed',String(sound));$('umbralSound').textContent=sound?'Efectos: sí':'Efectos: no';
  }
  setSound(sound);
  on($('umbralSound'),'click',()=>setSound(!sound));
  on($('umbralFullscreen'),'click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch{announce('La pantalla completa no está disponible.',3);}});
  on(document,'keydown',e=>{if(e.target.matches('input,select,textarea'))return;if(e.code==='Escape'){pause();return;}if(s.phase!=='playing'||finisherLocked(s)||motherCaptureLocked(s))return;if(e.code==='KeyR'){e.preventDefault();if(!e.repeat)activateFlames(s);return;}if(e.code==='KeyF'){e.preventDefault();if(!e.repeat)activateMacuahuitl(s);return;}if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft'].includes(e.code))e.preventDefault();keys.add(e.code);if(/^[1-6]$/.test(e.key))selectWeapon(s,Number(e.key)-1);});
  on(document,'keyup',e=>keys.delete(e.code));on(window,'blur',pause);on(document,'visibilitychange',()=>{if(document.hidden)pause();});
  on(document,'pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&s.phase==='playing')pause();});
  on(canvas,'contextmenu',e=>e.preventDefault());
  // Mouse events report each button in a chord; pointerdown/up only report the first/last.
  on(canvas,'mousedown',e=>{if(s.phase!=='playing'||finisherLocked(s)||motherCaptureLocked(s))return;e.preventDefault();canvas.focus();if(document.pointerLockElement!==canvas){dragging=true;dragPoint={x:e.clientX,y:e.clientY};capture();}mouse.primary=!!(e.buttons&1);mouse.secondary=!!(e.buttons&2);if(WEAPONS[s.selected].kind==='nail')setRifleScope(s,mouse.secondary);if(e.button===0||e.button===2)fire(s,e.button===2);});
  on(document,'mouseup',e=>{mouse.primary=!!(e.buttons&1);mouse.secondary=!!(e.buttons&2);if(!mouse.secondary)setRifleScope(s,false);if(!mouse.primary&&!mouse.secondary){dragging=false;dragPoint=null;}});
  on(document,'pointermove',e=>{
    const locked=document.pointerLockElement===canvas;if(s.phase!=='playing'||finisherLocked(s)||motherCaptureLocked(s)||!locked&&!dragging)return;
    const dx=locked?e.movementX:e.clientX-(dragPoint?.x??e.clientX),dy=locked?e.movementY:e.clientY-(dragPoint?.y??e.clientY);
    dragPoint={x:e.clientX,y:e.clientY};const sensitivity=Number($('umbralSensitivity')?.value||1)*.0022*(s.rifleScoped?.45:1);
    s.player.yaw-=dx*sensitivity;s.player.pitch=clampPitch(s.player.pitch-dy*sensitivity);
  });
  // Arrow turning remains useful if pointer capture is blocked by an embedded browser.
  function input(){if(finisherLocked(s)||motherCaptureLocked(s))return {};return {forward:(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),strafe:(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),slow:keys.has('ShiftLeft'),jump:keys.has('Space'),...mouse};}
  function resize(){
    const r=canvas.getBoundingClientRect(),aspect=r.width/r.height||16/9;
    const width=Math.max(320,Math.min(quality.level.width,Math.round(r.width))),height=Math.max(180,Math.round(width/aspect));
    if(canvas.width!==width||canvas.height!==height)renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
    // Keep the HUD and weapon sharp when the world resolution drops.
    const weaponWidth=Math.max(320,Math.min(960,Math.round(r.width))),weaponHeight=Math.max(180,Math.round(weaponWidth/aspect));
    if(weaponCanvas.width!==weaponWidth||weaponCanvas.height!==weaponHeight){weaponCanvas.width=weaponWidth;weaponCanvas.height=weaponHeight;}
    lastPaint=0;
  }
  function applyQuality(){
    root.dataset.quality=quality.level.id;world.setQuality(quality.level);resize();
    $('umbralQuality').value=quality.mode;
    $('umbralQualityLabel').textContent=(quality.mode==='auto'?'AUTO · ':'')+quality.level.label.toUpperCase();
  }
  on($('umbralQuality'),'change',event=>{
    quality.setMode(event.target.value);applyQuality();
    try{localStorage.setItem('umbral-quality',quality.mode);}catch{}
  });
  on($('umbralCopyPerformance'),'click',async()=>{
    const button=$('umbralCopyPerformance'),output=$('umbralPerformanceReport');output.hidden=false;output.value=performanceReport;
    try{await navigator.clipboard.writeText(performanceReport);button.textContent='Reporte copiado';}
    catch{output.focus();output.select();button.textContent='Selecciona y copia el reporte';}
  });
  function reportPerformance(){
    const fps=Math.round(fpsFrames/fpsTime),sorted=frameSamples.slice().sort((a,b)=>a-b),p95=sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]||0;
    const frameMs=fpsTime/fpsFrames*1000,workMs=workTotal/fpsFrames,calls=renderer.info.render.calls;
    const resolution=canvas.width+'×'+canvas.height,mode=(quality.mode==='auto'?'Auto / ':'')+quality.level.label;
    const enemySoundStatus=enemyAudio?.diagnostics();
    $('umbralFps').textContent=String(fps);
    $('umbralPerformanceReadout').textContent=`${fps} FPS · ${mode} · ${resolution} · ${calls} llamadas de dibujo · Audio enemigos: ${enemySoundStatus?.decoded||0} muestras, ${enemySoundStatus?.active||0}/8 voces`;
    performanceReport=`UMBRAL · rendimiento v1
Mapa: ${getArena(s.mapId).name} · Horda: ${s.wave}
Calidad: ${mode} · Resolución: ${resolution}
FPS: ${fps} · Tiempo por cuadro: ${frameMs.toFixed(1)} ms · P95: ${p95.toFixed(1)} ms
CPU (JS + envío de dibujo, no tiempo GPU): ${workMs.toFixed(1)} ms
Llamadas: ${calls} · Triángulos: ${renderer.info.render.triangles} · Texturas: ${renderer.info.memory.textures}
Atlas RGBA base: ${(atlasBytes/1048576).toFixed(1)} MiB (no VRAM total)
Enemigos vivos: ${s.enemies.filter(e=>e.hp>0).length}
Gráficos: ${graphics}
Navegador: ${navigator.userAgent}`;
    fpsTime=fpsFrames=workTotal=0;frameSamples=[];
  }
  const observer=new ResizeObserver(resize);observer.observe(stage);applyQuality();
  const finisherContactPoint=new T.Vector3();
  function drawWeapon(dt){
    wc.clearRect(0,0,weaponCanvas.width,weaponCanvas.height);
    let contact;
    if(finisherLocked(s)){
      const enemy=s.enemies.find(e=>e.id===s.bossFinish.enemyId),sprite=enemyVisuals.get(enemy?.id)?.sprite;
      if(sprite){
        const uv=titanFinisherContact(titanFinisherPose(s,enemy).frame);
        finisherContactPoint.set((uv[0]-sprite.center.x)*sprite.scale.x,(1-uv[1]-sprite.center.y)*sprite.scale.y,0)
          .applyQuaternion(camera.quaternion).add(sprite.position).project(camera);
        contact={x:(finisherContactPoint.x+1)*weaponCanvas.width/2,y:(1-finisherContactPoint.y)*weaponCanvas.height/2};
      }
    }
    if(finisherVisuals.draw(wc,weaponCanvas.width,weaponCanvas.height,s,contact))return;
    if(drawMotherCapture(wc,weaponCanvas.width,weaponCanvas.height,s,images,assets))return;
    const definition=assets.weapons.find(w=>w.id===WEAPONS[s.selected].id);if(!definition)return;let im=images.get(definition.ready),sx=0,sy=0,sw=im.width/(definition.readyColumns||1),sh=im.height/(definition.readyRows||1);
    if(shot&&shot.index===s.selected){if(s.phase==='playing')shot.time+=dt;const seq=definition[shot.mode],duration=seq.durations.reduce((a,b)=>a+b,0)/1000;if(shot.time>duration)shot=null;else{im=images.get(seq.file);sw=im.width/(seq.columns||seq.frames);sh=im.height/(seq.rows||1);const frame=frameAt(seq,shot.time,false);sx=(frame%(seq.columns||seq.frames))*sw;sy=Math.floor(frame/(seq.columns||seq.frames))*sh;}}
    const cycleTime=SHOTGUN_CYCLE_DURATION-s.shotgunCycleRemaining;
    if(definition.cycle&&s.shotgunCycleRemaining>0&&cycleTime>=0){
      const seq=definition.cycle,total=seq.durations.reduce((a,b)=>a+b,0)/1000;
      im=images.get(seq.file);sw=im.width/seq.frames;sh=im.height;
      sx=frameAt(seq,cycleTime/SHOTGUN_CYCLE_DURATION*total,false)*sw;
    }
    const width=weaponCanvas.width,height=weaponCanvas.height;let dw,dh,dx,dy;
    if(definition.layout==='wide'){dw=width;dh=dw*sh/sw;dx=0;dy=height-dh+8;}
    else{dh=height*(definition.viewHeight??.88);dw=dh*sw/sh;dx=(width-dw)/2;dy=height-dh+10;}
    // Lower every weapon and its animation together, keeping the sight line clear.
    dy+=height*.14;
    const moving=s.phase==='playing'&&(keys.has('KeyW')||keys.has('KeyS')||keys.has('KeyA')||keys.has('KeyD')),bob=moving?Math.sin(s.time*13)*2:0;
    wc.imageSmoothingEnabled=false;
    if(s.macuahuitlRemaining>0)macuahuitl.drawSlash(wc,width,height,s);
    else if(s.flameRemaining>0)pairedViewmodels.drawFlames(wc,width,height,s);
    else if(s.selected===3&&s.smgDualRemaining>0){
      pairedViewmodels.drawDual(wc,width,height,s,shot,bob);
    }
    else if(!s.rifleScoped)wc.drawImage(im,sx,sy,sw,sh,dx+recoil*4,dy+recoil*9+bob,dw,dh);
    if(s.rifleScoped){
      const cx=width/2,cy=height/2,r=Math.min(width,height)*.42;
      wc.save();wc.fillStyle='rgba(3,5,7,.94)';wc.beginPath();wc.rect(0,0,width,height);wc.arc(cx,cy,r,0,Math.PI*2,true);wc.fill('evenodd');
      wc.strokeStyle='#80c5af';wc.lineWidth=1;wc.beginPath();wc.arc(cx,cy,r,0,Math.PI*2);wc.stroke();
      wc.strokeStyle='rgba(0,0,0,.9)';wc.lineWidth=2;wc.beginPath();wc.moveTo(cx-r,cy);wc.lineTo(cx-9,cy);wc.moveTo(cx+9,cy);wc.lineTo(cx+r,cy);wc.moveTo(cx,cy-r);wc.lineTo(cx,cy-9);wc.moveTo(cx,cy+9);wc.lineTo(cx,cy+r);wc.stroke();
      wc.fillStyle='#ffd6a2';wc.fillRect(cx-1,cy-1,2,2);wc.font='11px monospace';wc.textAlign='center';wc.fillText(s.rifleSecondaryCooldown>0?'ENFRIAMIENTO '+s.rifleSecondaryCooldown.toFixed(1)+' s':'PRECISIÓN · 3 OBSIDIANA',cx,cy+r*.65);wc.restore();
    }
    recoil=Math.max(0,recoil-dt*5);
    if(s.shieldFlash>0){const glow=wc.createRadialGradient(width/2,height/2,height*.18,width/2,height/2,width*.65);glow.addColorStop(0,'rgba(150,80,255,0)');glow.addColorStop(1,`rgba(163,92,255,${s.shieldFlash*1.4})`);wc.fillStyle=glow;wc.fillRect(0,0,width,height);}
    if(s.damageFlash>0){wc.fillStyle=`rgba(185,12,25,${s.damageFlash*.75})`;wc.fillRect(0,0,width,height);}if(s.portalFlash>0){wc.fillStyle=`rgba(255,214,115,${s.portalFlash*.22})`;wc.fillRect(0,0,width,height);}
    drawRiverBites(wc,width,height,s,riverSprites.bite);
    drawMotherDrag(wc,width,height,s);
  }
  function updateHud(){
    root.dataset.darkness='false';
    const boss=s.enemies.find(e=>e.boss&&e.hp>0),bossHud=$('umbralBoss');
    bossHud.hidden=!boss||s.phase!=='playing';
    root.dataset.bossActive=String(!bossHud.hidden);
    const motherPull=boss?.kind==='madre'?s.motherDrag:null;
    const vortex=motherPull||(boss?.kind==='desollador'&&boss.windSuction?.phase!=='combo'?boss.windSuction:null),vortexHud=$('umbralVortex');
    vortexHud.hidden=!vortex||bossHud.hidden;
    root.dataset.vortexActive=String(!vortexHud.hidden);
    if(vortex){
      $('umbralVortexLabel').textContent=motherPull?'ARRASTRE · DISPARA Y ALÉJATE':'VÓRTICE · DISPARA PARA LIBERARTE';
      vortexHud.setAttribute('aria-label',motherPull?'Resistencia del arrastre. Dispara a la Madre para liberarte.':'Resistencia del vórtice. Dispara al Desollador para liberarte.');
      const maxHp=Math.max(1,vortex.maxHp),hp=Math.ceil(clamp(vortex.hp,0,maxHp));
      $('umbralVortexHealth').textContent=`${hp} / ${maxHp}`;
      $('umbralVortexMeter').style.width=hp/maxHp*100+'%';
      vortexHud.setAttribute('aria-valuenow',String(hp));vortexHud.setAttribute('aria-valuemax',String(maxHp));
      vortexHud.setAttribute('aria-valuetext',`${hp} de ${maxHp}. `+(motherPull?'Dispara a la Madre para romper el arrastre.':'Dispara al Desollador para romper el vórtice.'));
    }
    if(boss){
      const hp=boss.downed?0:Math.ceil(Math.max(0,boss.hp)),shield=Math.ceil(Math.max(0,boss.shield||0));
      const wind=boss.kind==='desollador',total=boss.maxHp+(boss.maxShield||0);
      $('umbralBossName').textContent=boss.kind==='madre'?'LA MADRE DEL AHOGO':wind?'DESOLLADOR DEL VENDAVAL':'TITÁN DE OBSIDIANA';
      $('umbralBossShieldBlock').hidden=!(boss.maxShield>0);
      bossHud.setAttribute('aria-label','Vida de '+$('umbralBossName').textContent);
      $('umbralBossHealth').textContent=(hp+shield).toLocaleString('es-MX')+' / '+total.toLocaleString('es-MX');
      $('umbralBossLife').textContent=hp.toLocaleString('es-MX');$('umbralBossShield').textContent=shield.toLocaleString('es-MX');
      $('umbralBossMeter').style.width=hp/boss.maxHp*100+'%';
      $('umbralBossShieldMeter').style.width=shield/(boss.maxShield||6250)*100+'%';
      bossHud.setAttribute('aria-valuenow',String(hp+shield));bossHud.setAttribute('aria-valuemax',String(total));
      bossHud.setAttribute('aria-valuetext',`${shield} de escudo y ${hp} de vida`);
      bossHud.dataset.enraged=String(boss.enraged);
      bossHud.dataset.kind=boss.kind;
      const action=boss.kind==='madre'?(s.motherCapture?'ABRAZO DEL AHOGO':s.motherDrag?'ARRASTRE · DISPARA Y ALÉJATE':boss.waterState==='submerged'?'CALAVERAS INTERCEPTAN · SIGUE DISPARANDO':boss.waterState==='rising'?'ESTÁ EMERGIENDO · PREPÁRATE':boss.waterState==='sinking'?'SE SUMERGE · BUSCA SU CABEZA':boss.cast?.attack==='hands'?'MANOS · SAL DE LA MARCA':boss.cast?'OLEADA · ESQUIVA':'SOBRE EL AGUA · DISPARA'):wind?(boss.shockStunUntil>s.time?'ATURDIDO':boss.bladeStorm?'TAJOS BLANCOS · '+Math.max(0,DESOLLADOR.cutDuration-boss.bladeStorm.age).toFixed(1)+' s · ESQUIVA':boss.bossMotion?'PICADO · SAL DEL CÍRCULO TURQUESA':boss.windSuction?.phase==='combo'?'TAJOS · '+Math.max(0,DESOLLADOR.vortexCombo-boss.windSuction.comboAge).toFixed(1)+' s':boss.windSuction?'VÓRTICE · DISPARA PARA LIBERARTE':boss.vortexTravel?'PREPARA UN VÓRTICE SOBRE EL VACÍO':boss.exposedUntil>s.time?'VULNERABLE · USA F O R':boss.cast?({blades:'CUCHILLAS · ESQUIVA',dive:'PICADO · ALÉJATE DE LA MARCA',suction:'VÓRTICE · PREPARA TUS ARMAS',melee:'ESPADAS · ALÉJATE'})[boss.cast.attack]:'ESQUIVA Y CONTRAATACA'):boss.downed?'NÚCLEO ABIERTO · REMATE OBLIGATORIO':boss.shockStunUntil>s.time?'ATURDIDO':boss.bossMotion?'IMPACTO · SAL DEL CÍRCULO MORADO':boss.exposedUntil>s.time?'APUNTA AL PECHO':boss.cast?({volley:'CALAVERAS · ESQUIVA Y CÚBRETE',cannon:'PLASMA · ESQUIVA EL CAÑÓN',jump:'SALTO · SAL DEL CÍRCULO',summon:'INVOCANDO IMPS',charge:'EMBESTIDA · ESQUIVA',slam:'LLAMAS · SALTA'})[boss.cast.attack]:boss.enraged?'DAÑO AUMENTADO':'ROMPE SU ESCUDO';
      const phaseLabel=boss.kind==='madre'?(boss.enraged?'FASE 3 · FURIA · ':boss.hp<=boss.maxHp*.6?'FASE 2 · ':'FASE 1 · '):(boss.downed?'':boss.enraged?'FASE 2 · FURIA · ':'FASE 1 · ');
      $('umbralBossState').textContent=phaseLabel+action;
    }
    const prompt=finisherPrompt(s),finisherNode=$('umbralFinisherPrompt');
    finisherNode.hidden=!prompt||s.phase!=='playing';finisherNode.textContent=prompt?.text||'';
    root.dataset.finisher=String(finisherLocked(s)||motherCaptureLocked(s));
    if(isBossDemo(s)){$('umbralRankedStatus').textContent='PRÁCTICA';$('umbralRankedStatus').dataset.state='practice';}
    const tide=$('umbralTide');tide.hidden=s.mapId!=='rio'||!s.portalUsed;
    tide.dataset.danger=String(['rising','high'].includes(s.tidePhase));
    tide.textContent=motherCaptureLocked(s)?'LA MADRE TE ATRAPÓ':s.riverImmersed?'LAS ÁNIMAS TE MUERDEN · SAL DEL AGUA':({calm:'RÍO EN CALMA',warning:'CRECIDA INMINENTE · SUBE',rising:'ÁNIMAS DESPIERTAS · EVITA EL AGUA',high:'AGUA MALDITA · PERMANECE ARRIBA',falling:'EL RÍO DESCIENDE'})[s.tidePhase];
    const readout=value=>Math.ceil(Math.max(0,value-1e-8));
    root.dataset.phase=s.phase;root.dataset.map=s.mapId;
    $('umbralMapName').textContent=getArena(s.mapId).name.toUpperCase();$('umbralMobility').textContent=s.player.windCapture?(s.player.windCapture.phase==='return'?'VOLVIENDO A LA ARENA':s.player.windCapture.phase==='combo'?'ATRAPADO · TAJOS':'VÓRTICE · SIGUE DISPARANDO'):s.player.flight?'SELLO · EN VUELO':s.player.grounded?'ESPACIO · SALTAR':'EN EL AIRE';root.dataset.health=String(s.health);root.dataset.portal=String(s.portalUsed);root.dataset.weapon=WEAPONS[s.selected].id;
    $('umbralHealth').textContent=String(readout(s.health));
    const healthGauge=$('umbralHealthGauge'),shieldGauge=$('umbralShieldGauge'),shield=readout(s.shield),wait=Math.max(0,s.shieldRegenAt-s.time);
    root.dataset.shield=String(shield);
    healthGauge.style.setProperty('--value',`${clamp(s.health,0,100)}%`);healthGauge.setAttribute('aria-valuenow',String(readout(s.health)));
    healthGauge.dataset.critical=String(s.portalUsed&&s.health>0&&s.health<=25);
    shieldGauge.style.setProperty('--value',`${s.shield/OBSIDIAN_SHIELD.max*100}%`);shieldGauge.setAttribute('aria-valuenow',String(shield));
    shieldGauge.dataset.state=s.shieldLockedWave?'locked':s.shield>=OBSIDIAN_SHIELD.max?'full':wait>0?(s.shield===0?'empty':'waiting'):'regenerating';
    $('umbralShield').textContent=String(shield);
    const shieldStatus=s.phase==='dead'?'SIN SEÑAL':s.shieldLockedWave?'SUPERA LA HORDA':s.shield>=OBSIDIAN_SHIELD.max?'CARGADO':wait>0?`RECARGA EN ${wait.toFixed(1)} s`:`REGEN. ${shieldRegenRate(s.wave)}/s`;
    const shieldDescription=s.shieldLockedWave?`Bloqueado hasta superar la horda ${s.shieldLockedWave}`:`${shieldStatus} · ${shieldRegenRate(s.wave)} puntos por segundo tras 5 segundos sin daño`;
    $('umbralShieldStatus').textContent=shieldStatus;shieldGauge.setAttribute('aria-valuetext',`${shield} de 100 · ${shieldDescription}`);shieldGauge.title=shieldDescription;
    $('umbralAmmo').textContent=s.selected===3&&s.smgDualRemaining>0?'∞':Number.isFinite(ammoForWeapon(s))?String(ammoForWeapon(s)):'∞';
    $('umbralAmmoType').textContent=WEAPONS[s.selected].ammoType?'MUNICIÓN '+AMMO_TYPES[WEAPONS[s.selected].ammoType].label:'USO ILIMITADO';
    $('umbralWeaponKey').textContent=String(s.selected+1);
    $('umbralWeaponIcon').setAttribute('href','#u-'+weaponIcons[s.selected]);
    $('umbralAmmo').dataset.empty=String(ammoForWeapon(s)===0&&!(s.selected===3&&s.smgDualRemaining>0));
    const flameButton=$('umbralFlames'),flameLabel=s.flameRemaining>0?'FUEGO':s.flameCooldown>0?Math.ceil(s.flameCooldown)+' s':'LISTAS';
    $('umbralFlameStatus').textContent=flameLabel;
    flameButton.style.setProperty('--charge',String(s.flameRemaining>0?s.flameRemaining/FLAMES.duration*100:(1-s.flameCooldown/FLAMES.cooldown)*100));
    flameButton.dataset.state=s.flameRemaining>0?'active':s.flameCooldown>0?'cooldown':'ready';
    flameButton.setAttribute('aria-label',`R · Poder de llamas · ${flameLabel}`);
    const macuahuitlPowered=s.macuahuitlRemaining>0&&s.macuahuitlCharged;
    const macuahuitlLabel=s.macuahuitlRemaining>0?(macuahuitlPowered?'TAJO':'COMBO '+s.macuahuitlCombo+' · '+s.macuahuitlDamage):s.macuahuitlCooldown>0?Math.ceil(s.macuahuitlCooldown)+' s · F COMBO':'LISTO';
    $('umbralMacuahuitlStatus').textContent=macuahuitlLabel;
    $('umbralMacuahuitl').style.setProperty('--charge',String(macuahuitlPowered?s.macuahuitlRemaining/MACUAHUITL.duration*100:(1-s.macuahuitlCooldown/MACUAHUITL.cooldown)*100));
    $('umbralMacuahuitl').dataset.state=s.macuahuitlRemaining>0?'active':s.macuahuitlCooldown>0?'cooldown':'ready';
    $('umbralMacuahuitl').setAttribute('aria-label',`F · Macuahuitl · ${macuahuitlLabel} · Sin carga, combo de tres golpes: 90, 120 y 180 de daño. Fallar no consume el poder.`);
    $('umbralWeaponName').textContent=WEAPONS[s.selected].name;
    $('umbralWeaponState').textContent=s.selected===1?(s.shotgunCycleRemaining>0?'CICLO · '+s.shotgunCycleRemaining.toFixed(1)+' s':'2 SIMPLES / 1 DOBLE'):s.selected===4?(s.bowRecoveryRemaining>0?'COLOCANDO FLECHA':s.bowSecondaryCooldown>0?'EXPLOSIVA · '+s.bowSecondaryCooldown.toFixed(1)+' s':'FUEGO: 1 · EXPLOSIVA: 3'):s.selected===2?(s.rifleSecondaryCooldown>0?'SNIPER · '+s.rifleSecondaryCooldown.toFixed(1)+' s':s.rifleScoped?'CLIC IZQ. · DISPARO SNIPER':'MANTÉN CLIC DER. · MIRA'):s.selected===3?(s.smgDualRemaining>0?'DOBLE FUEGO · '+s.smgDualRemaining.toFixed(1)+' s':s.smgDualCooldown>0?'DOBLE FUEGO · '+s.smgDualCooldown.toFixed(1)+' s':'CLIC DER. · DOBLE FUEGO 4 s'):'ARSENAL · 1–6';
    $('umbralWaveLabel').textContent=s.training?'TUTORIAL':'HORDA';
    $('umbralWave').textContent=s.training?Math.min(s.training.stage+1,5)+'/5':String(s.wave);$('umbralKills').textContent=String(s.kills);
    const guide=tutorialGuide(s);$('umbralTutorialGuide').hidden=!guide||s.phase!=='playing';$('umbralTutorialExit').hidden=!guide||s.phase!=='playing';
    if(guide){
      const text={umbralTutorialStep:`TUTORIAL · ${guide.step} / 5`,umbralTutorialTitle:guide.title,umbralTutorialCopy:guide.copy,umbralTutorialChecks:guide.checks};
      for(const [id,value] of Object.entries(text))if($(id).textContent!==value)$(id).textContent=value;
    }
    if(s.time>messageUntil)$('umbralMessage').textContent=s.training?'':s.portalUsed?(s.nextWave>0?'SIGUIENTE HORDA EN '+Math.ceil(s.nextWave):''):'VIDA 5 · CRUZA EL UMBRAL';
  }
  function render(time){if(disposed)return;requestAnimationFrame(render);const elapsed=lastTime?Math.max(0,(time-lastTime)/1000):1/60,dt=Math.min(elapsed,.1);lastTime=time;
    // A map switch awaits textures; render only after its state and visuals agree.
    if(starting){quality.reset();return;}
    if(document.hidden){quality.reset();return;}
    if(s.phase!=='playing'&&lastPaint&&time-lastPaint<100)return;
    lastPaint=time;const workStarted=performance.now();
    if(s.phase==='playing'){
      if(!finisherLocked(s)&&!motherCaptureLocked(s)){if(keys.has('ArrowLeft'))s.player.yaw+=dt*1.8;if(keys.has('ArrowRight'))s.player.yaw-=dt*1.8;}
      const ticks=Math.max(1,Math.ceil(dt/.025));for(let i=0;i<ticks&&s.phase==='playing';i++)step(s,input(),dt/ticks);
      const completed=updateTutorial(s,s.events);handleEvents();
      if(completed){s.training.offered=true;void tutorialPreferences.complete();showOverlay('tutorial');}
    }
    const eye=(s.player.y||0)+1.6;
    cameraEyeY+=(eye-cameraEyeY)*(1-Math.exp(-24*dt));
    camera.position.set(s.player.x,cameraEyeY,s.player.z);
    let cameraPitch=s.player.pitch,cameraYaw=s.player.yaw;
    if(s.motherCapture){
      const c=s.motherCapture,dx=c.from.x-s.player.x,dz=c.from.z-s.player.z;
      const targetYaw=Math.atan2(-dx,-dz),targetPitch=Math.atan2(c.from.y-eye,Math.hypot(dx,dz));
      const turn=Math.min(1,c.totalAge/.18),delta=Math.atan2(Math.sin(targetYaw-cameraYaw),Math.cos(targetYaw-cameraYaw));
      cameraYaw+=delta*turn;cameraPitch+=(targetPitch-cameraPitch)*turn;
    }
    const shake=motherCaptureCamera(s);
    camera.position.x+=shake.x;camera.position.y+=shake.y;camera.position.z+=shake.z;
    camera.rotation.set(cameraPitch+shake.pitch,cameraYaw+shake.yaw,shake.roll,'YXZ');
    const fov=s.rifleScoped?RIFLE_SCOPE.fov:78;if(Math.abs(camera.fov-fov)>.01){camera.fov+=(fov-camera.fov)*(1-Math.exp(-22*dt));camera.updateProjectionMatrix();}
    world.update(s.time,dt,s);motherOmen.update(s);motherGuardians.update(s);
    const ids=new Set(s.enemies.map(e=>e.id));for(const [id,v] of enemyVisuals)if(!ids.has(id)){scene.remove(v.sprite);v.sprite.material.dispose();Object.values(v.maps).forEach(t=>t.dispose());enemyVisuals.delete(id);}
    for(const e of s.enemies){
      const v=enemyVisuals.get(e.id)||enemyVisual(e),stunned=e.hp>0&&e.shockStunUntil>s.time;
      const channeling=e.hp>0&&e.kind==='tejedor'&&s.shieldLinks.some(l=>l.from===e.id)&&!stunned;
      const pose=e.kind==='madre'?madrePose(e,s):e.kind==='desollador'?(!stunned?desolladorPose(e):null):titanFinisherPose(s,e)||(e.kind==='titan'&&e.hp>0&&!stunned&&e.anim!=='hurt'?titanPose(e):null);
      const state=pose?.state||(e.kind==='titan'&&e.enraged&&e.anim==='move'?'rage':channeling?'attack':assets.enemies[e.kind].states[e.anim]?e.anim:'attack'),seq=assets.enemies[e.kind].states[state];
      const frameTime=stunned?.1:e.kind==='acechador'&&e.hp>0?(e.cast?.1:e.flight?(e.leapHit?.42:.28):e.animTime):e.animTime;
      v.sprite.position.set(e.x,(e.y||0)+(e.kind==='devorador'&&e.hp>0?.45+(stunned?0:Math.sin(s.time*4+e.id)*.10):.02),e.z);
      const frame=pose?.frame??(e.kind==='titan'&&state==='attack'?(e.bossAttack==='slam'?3:e.bossAttack==='charge'?2:e.cast?0:1):frameAt(seq,frameTime,state==='move'||state==='rage'||state==='suction'||channeling));
      v.sprite.material.map=v.maps[state];
      const columns=seq.columns||seq.frames,rows=seq.rows||1,mirror=!!pose?.mirror;
      v.maps[state].repeat.set((mirror?-1:1)/columns,1/rows);v.maps[state].offset.set(((frame%columns)+(mirror?1:0))/columns,1-((seq.row??Math.floor(frame/columns))+1)/rows);
      const size=(e.width||e.height)*(seq.viewScale||1),spectral=['rise','hover'].includes(e.bossMotion?.phase);
      v.sprite.scale.set(size,e.kind==='desollador'?size*DESOLLADOR.spriteAspect:size,1);v.sprite.material.opacity=spectral?.75:1;
      if(e.kind==='madre'){updateMotherWaterClip(v.sprite.material,s,e);v.sprite.visible=!(s.motherCapture?.id===e.id&&s.motherCapture.phase==='embrace');if(s.motherCapture?.id===e.id){const q=s.motherCapture.position;v.sprite.position.set(q.x,q.y-MADRE.submergedDepth-.8,q.z);}v.sprite.material.opacity=e.hp<=0?Math.min(1,Math.max(0,(MADRE.deathDuration-e.deadTime)/1.8)):.95;}
      v.sprite.material.color.set(stunned?'#b6eadd':e.kind==='desollador'&&e.cast?'#a2fff4':spectral?'#c8a1ff':e.boss&&e.exposedUntil>s.time?'#ffce91':e.cast&&(e.kind==='devorador'||e.kind==='acechador'||e.boss)?'#ffb987':'#ffffff');
    }
    renderAttacks(dt);renderShields();
    for(let i=effects.length-1;i>=0;i--){
      const e=effects[i];if(s.phase==='playing')e.life-=dt;
      const remaining=Math.max(0,e.life/e.total);
      e.mesh.material.opacity=remaining*(e.opacity??.7);
      if(e.trail){const width=.35+.65*remaining;e.mesh.scale.set(width,e.length||1,width);}
      if(e.seq){
        effectFrame(e.mesh,frameAt(e.seq,e.total-e.life,false));
        const size=e.size*(1+(1-remaining)*.5);
        if(e.mesh.userData.cut)e.mesh.scale.set(size*2.6,size*.65,1);else e.mesh.scale.setScalar(size);
      }
      if(e.life<=0){releaseEffect(e);effects.splice(i,1);}
    }
    supplyVisuals.forEach((mesh,i)=>{
      const pickup=s.supplies[i];
      if(pickup.kind==='ammo'&&mesh.userData.ammoType!==pickup.ammoType){removeDrop(mesh);mesh=ammoVisual(pickup.ammoType);supplyVisuals[i]=mesh;scene.add(mesh);}
      mesh.visible=s.portalUsed&&pickup.cooldown<=0;mesh.rotation.y=s.time;mesh.position.set(pickup.x,pickup.y+.55+Math.sin(s.time*2+i)*.08,pickup.z);
    });
    renderDrops();flames.update(s);titanCharge.update(s);macuahuitl.update(s);arsenalAudio?.sync(s,sound);enemyAudio?.sync(s,sound);comaAudio?.sync(s,sound);ranking.observe(s);
    shotgunAudio?.syncCycle(s.shotgunCycleRemaining,s.flameRemaining>0||s.macuahuitlRemaining>0?-1:s.selected,s.phase==='playing',sound,SHOTGUN_CYCLE_DURATION);
    enemyFeedback.update(s);
    renderer.render(scene,camera);drawWeapon(dt);motherFarewell.update(s);hudTime+=dt;if(hudTime>=.1||s.phase!=='playing'){updateHud();hudTime=0;}
    if(s.phase==='playing'&&elapsed>0){
      fpsTime+=elapsed;fpsFrames++;workTotal+=performance.now()-workStarted;frameSamples.push(elapsed*1000);
      if(fpsTime>=1)reportPerformance();
    }
    if(quality.sample(elapsed,s.phase==='playing'))applyQuality();
  }
  await world.ready;
  prepareNavigation();updateHud();start.disabled=false;$('umbralDesolladorDemo').disabled=false;$('umbralMadreDemo').disabled=false;$('umbralTitanDemo').disabled=false;start.textContent=dedicatedBossDemo?(s.demoBoss==='madre'?'Enfrentar a la ':'Enfrentar al ')+demoName():'Entrar al umbral';
  if(dedicatedBossKind==='madre'){title.textContent='La Madre del Ahogo';copy.textContent='Río de las Ánimas · 12,000 de vida. El río queda lleno de agua morada. Su cabeza está descubierta, pero cada disparo atrae una calavera protectora. Insiste hasta acertarle: emergerá para atacar. Resiste el arrastre alejándote y disparando; si caes, te atrapará: 60 de vida directa y regreso a la orilla. Todas las armas. Sin puntuación.';$('umbralNormalGame').hidden=false;$('umbralMadreDemo').hidden=true;}
  else if(dedicatedBossKind==='desollador'){title.textContent='Desollador del Vendaval';copy.textContent='Corona del Viento · 18,000 de vida. Mantén distancia: cada tajo quita 50. Rompe la barra cian mientras giras en el tornado. Si llegas al jefe, recibirás 4 segundos de tajos (70 de daño total) antes de volver a la pista. Tras el picado: 5.5 s de tajos blancos, 40 de daño; desde 9,000 de vida, 50 y 30% más rápidos. Todas las armas, vida y escudo completos. Sin puntuación.';$('umbralNormalGame').hidden=false;$('umbralDesolladorDemo').hidden=true;}
  else if(dedicatedBossDemo){title.textContent='Titán de Obsidiana';copy.textContent='Un combate directo: 6,250 de escudo y 6,250 de vida. Esquiva su plasma de 50 de daño y salta las olas de fuego. Al romper el escudo, aumenta su daño y desbloquea calaveras perseguidoras e imps. Acércate para rematar con F. Todas las armas disponibles; sin puntuación.';$('umbralNormalGame').hidden=false;}
  if(onboardingScreen)showOnboarding();else $('umbralTutorialButton').hidden=false;
  requestAnimationFrame(render);
  on(canvas,'webglcontextlost',e=>{e.preventDefault();pause();$('umbralError').hidden=false;$('umbralError').textContent='Se perdió el contexto gráfico. Actualiza la página para volver a jugar.';});
  on(window,'pagehide',event=>{if(event.persisted){pause();return;}ranking.unload(s);motherGuardians.dispose();motherOmen.dispose();motherFarewell.dispose();ranking.dispose();music.dispose();disposed=true;observer.disconnect();events.abort();clearDynamic();tracePool.dispose();bowPool.dispose();enemyFeedback.dispose();supplyVisuals.forEach(removeDrop);flames.dispose();fireWaves.dispose();desolladorVortex.dispose();titanCharge.dispose();macuahuitl.dispose();textures.forEach(t=>t.dispose());world.dispose();shieldGeometry.dispose();shieldLines.material.dispose();renderer.dispose();shotgunAudio?.dispose();arsenalAudio?.dispose();enemyAudio?.dispose();comaAudio?.dispose();audioMix?.disconnect();audio?.close();});
}
