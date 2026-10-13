(()=>{
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const TAU=Math.PI*2,PI=Math.PI;
const angDiff=(a,b)=>{let d=(b-a)%TAU;if(d>PI)d-=TAU;if(d<-PI)d+=TAU;return d;};
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
let RND=mulberry(20261010);
const R=()=>RND(),RR=(a,b)=>a+(b-a)*RND();
function hash2(ix,iz){let h=Math.imul(ix,374761393)+Math.imul(iz,668265263)|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;}
function vnoise(x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);const a=hash2(ix,iz),b=hash2(ix+1,iz),c=hash2(ix,iz+1),d=hash2(ix+1,iz+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function fbm(x,z,o=4){let s=0,a=.5,f=1;for(let i=0;i<o;i++){s+=a*vnoise(x*f,z*f);f*=2;a*=.5;}return s/(1-Math.pow(.5,o));}

/* ================= renderer ================= */
const glc=$('gl'),hudc=$('hud2'),hx=hudc.getContext('2d');
let W=innerWidth,H=innerHeight;
const touchDev=('ontouchstart' in window)||navigator.maxTouchPoints>0;
let renderer,scene,camera;
const QS={1:{pix:1,shadow:0,grass:0,sm:1024},2:{pix:1.25,shadow:1,grass:5200,sm:1024},3:{pix:1.75,shadow:1,grass:10000,sm:2048}};
let Q=store.get('ef-q',touchDev?1:2);
try{renderer=new THREE.WebGLRenderer({canvas:glc,antialias:true,powerPreference:'high-performance'});}catch(e){document.body.insertAdjacentHTML('beforeend','<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:20px sans-serif;z-index:99;background:#111;text-align:center;padding:20px">WebGL is not available in this browser, so Emberfall cannot start.</div>');throw e;}
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.NoToneMapping;
scene=new THREE.Scene();
/* ---- Storybook Anime look: stepped toon shading + inked outlines ---- */
const TG=(()=>{const d=new Uint8Array([95,95,95,255,150,150,150,255,205,205,205,255,255,255,255,255]);const t=new THREE.DataTexture(d,4,1,THREE.RGBAFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;})();
const TOON=(o={})=>{const p=Object.assign({},o);delete p.roughness;delete p.metalness;delete p.shininess;delete p.specular;delete p.flatShading;p.gradientMap=TG;return new THREE.MeshToonMaterial(p);};
const WIND={x:.6,z:.3,s:.6,t:{value:0},v:{value:new THREE.Vector3(.6,0,.3)}};
function updateWind(time){const ang=.7+.9*Math.sin(time*.04)+.4*Math.sin(time*.11),g=1.15+.55*Math.sin(time*.23)+.3*Math.sin(time*.87+1.3)+.2*Math.sin(time*2.3);WIND.s=Math.max(.1,g);WIND.x=Math.cos(ang)*WIND.s;WIND.z=Math.sin(ang)*WIND.s;WIND.t.value=time;WIND.v.value.set(WIND.x,0,WIND.z);}
function addSway(mat,amp){
  mat.onBeforeCompile=sh=>{sh.uniforms.uT=WIND.t;sh.uniforms.uW=WIND.v;
    sh.vertexShader='uniform float uT;uniform vec3 uW;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
#ifdef USE_INSTANCING
float swPh=instanceMatrix[3].x*.31+instanceMatrix[3].z*.27;
#else
float swPh=0.;
#endif
float swH=max(transformed.y,0.);
float swS=.65+.35*sin(uT*1.7+swPh)+.2*sin(uT*3.3+swPh*2.);
transformed.x+=uW.x*swS*swH*swH*${amp};
transformed.z+=uW.z*swS*swH*swH*${amp};`);};
  mat.customProgramCacheKey=()=>'sway'+amp;
}
const OUTL=new THREE.ShaderMaterial({side:THREE.BackSide,uniforms:{w:{value:.011}},vertexShader:'uniform float w;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*w,1.);}',fragmentShader:'void main(){gl_FragColor=vec4(.24,.15,.12,1.);}'});
camera=new THREE.PerspectiveCamera(62,1,.2,1400);
function resize(){W=innerWidth;H=innerHeight;const pr=Math.min(devicePixelRatio||1,QS[Q].pix);renderer.setPixelRatio(pr);renderer.setSize(W,H,false);hudc.width=W*Math.min(devicePixelRatio||1,2);hudc.height=H*Math.min(devicePixelRatio||1,2);camera.aspect=W/H;camera.updateProjectionMatrix();}
addEventListener('resize',resize);

/* ================= terrain model ================= */
const ISL=200;
const PLAT=[{x:0,z:72,r:36,h:4.4},{x:-105,z:18,r:26,h:5.4},{x:-30,z:-100,r:20,h:24},{x:122,z:-8,r:20,h:7.4},{x:0,z:-22,r:32,h:6.4}];
const MTN={x:-42,z:-124,a:34,s:50},CRT={x:122,z:-8};
function baseH(x,z){
  const r=Math.hypot(x,z)/ISL,mask=sstep(1.0,.46,r);
  const n=fbm(x*.011+10,z*.011+10,5);
  let h=lerp(-10,2.6+n*15,mask);
  const dm=Math.hypot(x-MTN.x,z-MTN.z);h+=MTN.a*Math.exp(-dm*dm/(2*MTN.s*MTN.s))*sstep(.3,.8,mask);
  const dc=Math.hypot(x-CRT.x,z-CRT.z);h+=11*Math.exp(-((dc-30)*(dc-30))/80)*mask;h-=4*Math.exp(-dc*dc/(2*16*16));
  h+=(fbm(x*.07,z*.07,3)-.5)*1.6*mask;
  return h;
}
PLAT[2].h=baseH(PLAT[2].x,PLAT[2].z)-2;
function terrainH(x,z){
  let h=baseH(x,z);
  for(const p of PLAT){const d=Math.hypot(x-p.x,z-p.z);const w=1-sstep(p.r*.62,p.r,d);if(w>0)h=lerp(h,p.h,w);}
  return h;
}
const PATHS=[[[0,58],[-30,48],[-62,42],[-84,28],[-105,18]],[[0,58],[-8,20],[-20,-40],[-34,-72],[-30,-100]],[[0,58],[30,46],[60,40],[96,24],[122,-8]],[[0,58],[0,30],[0,-6]],[[-62,42],[-80,-10]],[[60,40],[100,90]],[[0,100],[20,125]]];
function pathDist(x,z){let best=1e9;for(const P of PATHS)for(let i=0;i<P.length-1;i++){const ax=P[i][0],az=P[i][1],bx=P[i+1][0],bz=P[i+1][1],dx=bx-ax,dz=bz-az;let t=((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz);t=clamp(t,0,1);const d=Math.hypot(x-(ax+dx*t),z-(az+dz*t));if(d<best)best=d;}return best;}
const gh=terrainH;
function slopeAt(x,z){const e=1.2;return Math.hypot(terrainH(x+e,z)-terrainH(x-e,z),terrainH(x,z+e)-terrainH(x,z-e))/(2*e);}
function forestW(x,z){return sstep(-28,-64,x)*(1-sstep(70,104,z))*(1-sstep(-10,-60,z)*.0);}

const C=(h)=>new THREE.Color(h);
const col={sand:C('#ecd290'),g1:C('#8fe04a'),g2:C('#45bf55'),forest:C('#1f9a58'),rock:C('#a79fb4'),snow:C('#e6eeff'),ash:C('#3d3633'),dirt:C('#8a6a45'),path:C('#d9b676'),wet:C('#c9b27a')};
const tmpc=new THREE.Color();
function terrainColor(x,z,h,sl,out){
  const nn=fbm(x*.05,z*.05,3);
  out.copy(col.g1).lerp(col.g2,nn);
  const fw=forestW(x,z);out.lerp(col.forest,fw*.75);
  const dc=Math.hypot(x-CRT.x,z-CRT.z);
  out.lerp(col.sand,1-sstep(1.2,2.4,h));
  out.lerp(col.rock,Math.max(sstep(.5,.95,sl),sstep(17,23,h+nn*3)));
  out.lerp(col.snow,sstep(25.5,29,h+nn*2.5-sl*3));
  out.lerp(col.ash,(1-sstep(34,62,dc))*.96);
  const pd=pathDist(x,z);out.lerp(col.path,(1-sstep(1.1,2.8,pd))*.85*(h>1.5?1:0));
  const vd=Math.hypot(x,z-72);out.lerp(col.path,(1-sstep(11,15,vd))*.9);
  const dv=(hash2(Math.floor(x*2),Math.floor(z*2))-.5)*.05;out.r+=dv;out.g+=dv;out.b+=dv;
}

/* ================= build the world ================= */
const world={colliders:[],boxes:[],grid:new Map(),interact:[],breakables:[],chests:[],npcs:[],lamps:[],windows:null,camps:[],fires:[],animated:[],roofs:[],shardSpots:{}};
function addCircle(x,z,r,tag){const c={x,z,r,tag};world.colliders.push(c);const k=Math.floor(x/8)+','+Math.floor(z/8);let a=world.grid.get(k);if(!a){a=[];world.grid.set(k,a);}a.push(c);return c;}
function addBox(x,z,hw,hd,rot,eave,rise){const b={x,z,hw,hd,rot,c:Math.cos(rot),s:Math.sin(rot),eave:eave==null?null:eave,rise:rise||0};world.boxes.push(b);return b;}
function boxSurf(b,px,pz){const dx=px-b.x,dz=pz-b.z;const lx=dx*b.c-dz*b.s,lz=dx*b.s+dz*b.c;if(Math.abs(lx)>b.hw||Math.abs(lz)>b.hd)return -1e9;return b.eave+(b.rise?b.rise*Math.max(0,1-Math.abs(lz)/(b.hd+.5)):0);}
function surfaceAt(x,z,py){let h=gh(x,z);for(const b of world.boxes){if(b.eave==null)continue;if(Math.abs(x-b.x)>b.hw+b.hd+1||Math.abs(z-b.z)>b.hw+b.hd+1)continue;const t=boxSurf(b,x,z);if(t>-1e8&&py>=b.eave-.7&&t>h)h=t;}return h;}
function insideSolid(x,y,z){for(const b of world.boxes){if(b.eave==null)continue;if(Math.abs(x-b.x)>b.hw+b.hd+1||Math.abs(z-b.z)>b.hw+b.hd+1)continue;const t=boxSurf(b,x,z);if(t>-1e8&&y<t+.25&&y>b.eave-40&&y>gh(x,z)-.5)return true;}return false;}
function collideXZ(p,r){
  p._wall=null;
  const cx=Math.floor(p.x/8),cz=Math.floor(p.z/8);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const a=world.grid.get((cx+i)+','+(cz+j));if(!a)continue;for(const c of a){const dx=p.x-c.x,dz=p.z-c.z,rr=r+c.r,d2=dx*dx+dz*dz;if(d2<rr*rr&&d2>1e-6){const d=Math.sqrt(d2),k=(rr-d)/d;p.x+=dx*k;p.z+=dz*k;}}}
  for(const b of world.boxes){const dx=p.x-b.x,dz=p.z-b.z;if(Math.abs(dx)>b.hw+b.hd+r+2||Math.abs(dz)>b.hw+b.hd+r+2)continue;if(b.eave!=null&&p.y>=b.eave-.45)continue;
    const lx=dx*b.c-dz*b.s,lz=dx*b.s+dz*b.c;const nx=clamp(lx,-b.hw,b.hw),nz=clamp(lz,-b.hd,b.hd);let ex=lx-nx,ez=lz-nz,d=Math.hypot(ex,ez);
    if(d<r){let px,pz;if(d<1e-5){const ox=b.hw-Math.abs(lx),oz=b.hd-Math.abs(lz);if(ox<oz){px=Math.sign(lx||1)*(ox+r);pz=0;}else{px=0;pz=Math.sign(lz||1)*(oz+r);}}else{px=ex/d*(r-d);pz=ez/d*(r-d);}
      const wx=px*b.c+pz*b.s,wz=-px*b.s+pz*b.c;p.x+=wx;p.z+=wz;if(b.eave!=null){const wl=Math.hypot(wx,wz)||1;p._wall=b;p._wx=wx/wl;p._wz=wz/wl;}}}
}

const mats={};
const M=(c,o={})=>TOON(Object.assign({color:c},o));
const MF=(c,o={})=>TOON(Object.assign({color:c,side:THREE.DoubleSide},o));
const MS=(c,o={})=>TOON(Object.assign({color:c},o));
let sun,hemi,moonL,fireLight,lavaLight,sky,skyU,stars,waterMesh,waterU,terrain,cloudGroup,heightTex;
const light={dayAmt:1,sunElev:1,night:0};

function buildSkyAndLights(){
  hemi=new THREE.HemisphereLight(0xbfe0ff,0x5a6b3a,.9);scene.add(hemi);
  sun=new THREE.DirectionalLight(0xfff0d0,1.25);sun.castShadow=true;
  sun.shadow.mapSize.set(QS[Q].sm,QS[Q].sm);const sc=sun.shadow.camera;sc.left=-56;sc.right=56;sc.top=56;sc.bottom=-56;sc.near=10;sc.far=330;sun.shadow.bias=-.0006;sun.shadow.normalBias=.5;
  scene.add(sun);scene.add(sun.target);
  fireLight=new THREE.PointLight(0xff9a4a,0,26,2);scene.add(fireLight);
  lavaLight=new THREE.PointLight(0xff5a1a,0,60,2);lavaLight.position.set(CRT.x+16,gh(CRT.x+16,CRT.z)+4,CRT.z);scene.add(lavaLight);
  scene.fog=new THREE.FogExp2(0xbfdcff,.0042);
  skyU={top:{value:new THREE.Color()},mid:{value:new THREE.Color()},bot:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:new THREE.Color()},night:{value:0}};
  sky=new THREE.Mesh(new THREE.SphereGeometry(900,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:skyU,
    vertexShader:'varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 top,mid,bot,sunDir,sunCol;uniform float night;varying vec3 vD;void main(){float y=vD.y;vec3 c=mix(bot,mid,smoothstep(-.05,.18,y));c=mix(c,top,smoothstep(.15,.8,y));float s=max(dot(vD,normalize(sunDir)),0.);c+=sunCol*(pow(s,600.)*3.+pow(s,18.)*.35+pow(s,4.)*.12);float m=max(dot(vD,-normalize(sunDir)),0.);c+=vec3(.75,.82,1.)*pow(m,900.)*2.5*night;gl_FragColor=vec4(c,1.);}'}));
  sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
  const sg=new THREE.BufferGeometry(),n=900,pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){const u=R()*TAU,v=Math.acos(R()*.95+.05),r=820;pos[i*3]=r*Math.sin(v)*Math.cos(u);pos[i*3+1]=r*Math.cos(v);pos[i*3+2]=r*Math.sin(v)*Math.sin(u);}
  sg.setAttribute('position',new THREE.BufferAttribute(pos,3));
  stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:1.8,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false}));scene.add(stars);
  cloudGroup=new THREE.Group();const cm=TOON({color:0xffffff,emissive:0x333344,transparent:true,opacity:.92,fog:true});mats.cloud=cm;
  for(let i=0;i<22;i++){const g=new THREE.Group(),k=3+Math.floor(R()*4);for(let j=0;j<k;j++){const s=new THREE.Mesh(new THREE.IcosahedronGeometry(RR(9,17),1),cm);s.position.set(j*12-k*6+RR(-4,4),RR(-2,3),RR(-6,6));s.scale.y=.5;g.add(s);}
    g.position.set(RR(-420,420),RR(95,150),RR(-420,420));g.userData.sp=RR(1.2,3);cloudGroup.add(g);}
  scene.add(cloudGroup);
}
const SKYK={night:{top:C('#050a1c'),mid:C('#0d1a38'),bot:C('#1a2548')},day:{top:C('#2a6cff'),mid:C('#58b4ff'),bot:C('#c6ecff')},dusk:{top:C('#3a4a8a'),mid:C('#e8845a'),bot:C('#ffc27a')}};
const _a=new THREE.Color(),_b=new THREE.Color();
function updateSky(T,camPos,player){
  const ph=T*TAU,se=Math.sin(ph),sd=new THREE.Vector3(Math.cos(ph)*.8,se,Math.cos(ph)*.45+.2).normalize();
  const dayA=sstep(-.12,.28,se),dusk=Math.exp(-Math.pow(se/.2,2));
  light.dayAmt=dayA;light.sunElev=se;light.night=1-sstep(-.25,.05,se);
  const lerp3=(k)=>{skyU[k].value.copy(SKYK.night[k]).lerp(SKYK.day[k],dayA);_a.copy(SKYK.dusk[k]);skyU[k].value.lerp(_a,dusk*.75);};
  lerp3('top');lerp3('mid');lerp3('bot');
  skyU.sunDir.value.copy(sd);skyU.night.value=light.night;skyU.sunCol.value.setRGB(1,.82-dusk*.25,.55-dusk*.2).multiplyScalar(dayA>.02?1:0);
  scene.fog.color.copy(skyU.bot.value).lerp(skyU.mid.value,.2);scene.fog.density=.0034+.0016*dusk+.0014*light.night;
  hemi.intensity=.2+.3*dayA;hemi.color.setRGB(.45+.55*dayA,.5+.5*dayA,.7+.3*dayA);hemi.groundColor.setRGB(.25+.2*dayA,.3+.2*dayA,.2+.1*dayA);
  const up=se>0;const ld=up?sd:sd.clone().multiplyScalar(-1);
  sun.position.set(player.x+ld.x*140,Math.max(player.y,0)+ld.y*140+20,player.z+ld.z*140);sun.target.position.set(player.x,player.y,player.z);
  sun.intensity=up?(.12+.62*sstep(0,.35,se)):.3*light.night;
  sun.color.setRGB(1,.86-dusk*.3,.66-dusk*.35);if(!up)sun.color.setRGB(.55,.65,1);
  stars.material.opacity=light.night*.95;stars.position.copy(camPos);sky.position.copy(camPos);
  if(mats.windowMat)mats.windowMat.emissiveIntensity=.1+light.night*2.2;
  if(mats.lampMat)mats.lampMat.emissiveIntensity=.2+light.night*2.4;
  mats.cloud.emissive.setRGB(.2*dayA+.03,.2*dayA+.03,.25*dayA+.05);mats.cloud.color.setRGB(.35+.65*dayA,.35+.65*dayA,.45+.55*dayA+dusk*-.1);
  return sd;
}

function buildTerrain(){
  const SEG=176,S=440,geo=new THREE.PlaneGeometry(S,S,SEG,SEG);geo.rotateX(-PI/2);
  const pos=geo.attributes.position,cols=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=terrainH(x,z);pos.setY(i,h);}
  geo.computeVertexNormals();
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=pos.getY(i),ny=geo.attributes.normal.getY(i);terrainColor(x,z,h,Math.sqrt(Math.max(0,1-ny*ny))/Math.max(.2,ny),tmpc);cols[i*3]=tmpc.r;cols[i*3+1]=tmpc.g;cols[i*3+2]=tmpc.b;}
  geo.setAttribute('color',new THREE.BufferAttribute(cols,3));
  terrain=new THREE.Mesh(geo,TOON({vertexColors:true}));terrain.receiveShadow=true;scene.add(terrain);
  // sea floor skirt so edges never show
  const f=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),new THREE.MeshBasicMaterial({color:0x12365a}));f.rotation.x=-PI/2;f.position.y=-14;scene.add(f);
  // height texture for water shader + minimap
  const N=256,data=new Uint8Array(N*N*4),mm=document.createElement('canvas');mm.width=mm.height=N;const mc=mm.getContext('2d'),img=mc.createImageData(N,N);
  const HW=220;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const x=(i/(N-1)*2-1)*HW,z=(j/(N-1)*2-1)*HW,h=terrainH(x,z);const v=clamp((h+4)/8,0,1)*255;const k=(j*N+i)*4;data[k]=v;data[k+1]=v;data[k+2]=v;data[k+3]=255;
    terrainColor(x,z,h,slopeAt(x,z),tmpc);let r=tmpc.r,g=tmpc.g,b=tmpc.b;if(h<.2){const d=clamp((.2-h)/5,0,1);r=lerp(.45,.12,d);g=lerp(.72,.32,d);b=lerp(.85,.55,d);}
    img.data[k]=r*255;img.data[k+1]=g*255;img.data[k+2]=b*255;img.data[k+3]=255;}
  mc.putImageData(img,0,0);world.mapCanvas=mm;world.mapHW=HW;
  heightTex=new THREE.DataTexture(data,N,N,THREE.RGBAFormat);heightTex.magFilter=heightTex.minFilter=THREE.LinearFilter;heightTex.needsUpdate=true;
  // water
  waterU={time:{value:0},sunDir:skyU.sunDir,deep:{value:C('#0b4f86')},shallow:{value:C('#3fd0d0')},fogC:{value:scene.fog.color},fogD:scene.fog,hm:{value:heightTex},hw:{value:HW},night:{value:0},skyC:skyU.mid};
  const wg=new THREE.PlaneGeometry(1400,1400,180,180);wg.rotateX(-PI/2);
  waterMesh=new THREE.Mesh(wg,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:waterU.time,sunDir:waterU.sunDir,deep:waterU.deep,shallow:waterU.shallow,fogC:waterU.fogC,hm:waterU.hm,hw:waterU.hw,night:waterU.night,skyC:waterU.skyC,fogDen:{value:.004},dayA:{value:1}},
    vertexShader:'uniform float time;varying vec3 vW;varying float vH;void main(){vec4 w=modelMatrix*vec4(position,1.);float h=sin(w.x*.18+time*1.2)*.12+sin(w.z*.23+time*1.5)*.1+sin((w.x+w.z)*.41+time*2.1)*.05+sin(w.x*.7-time*2.6)*cos(w.z*.6+time*2.2)*.035;w.y+=h;vH=h;vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:`uniform float time,hw,night,fogDen,dayA;uniform vec3 sunDir,deep,shallow,fogC,skyC;uniform sampler2D hm;varying vec3 vW;varying float vH;float hh(vec2 p){return sin(p.x*.9+time*1.7)*cos(p.y*1.1-time*1.3)+sin((p.x-p.y)*1.7+time*2.3)*.5;}void main(){vec2 uv=vW.xz/(hw*2.)+.5;float t=texture2D(hm,uv).r*8.-4.;float depth=clamp(-t,0.,4.);float inside=step(.001,uv.x)*step(uv.x,.999)*step(.001,uv.y)*step(uv.y,.999);depth=mix(4.,depth,inside);
 vec3 N=normalize(vec3(-.35*cos(vW.x*.9+time*1.7)*cos(vW.z*1.1-time*1.3)-.2*cos((vW.x-vW.z)*1.7+time*2.3),1.,.25*sin(vW.x*.9+time*1.7)*sin(vW.z*1.1-time*1.3)+.2*cos((vW.x-vW.z)*1.7+time*2.3)));
 vec3 V=normalize(cameraPosition-vW);N=normalize(N+vec3(.1*cos(vW.x*2.7+time*3.3+vW.z*.5),0.,.1*sin(vW.z*2.3-time*2.9+vW.x*.4)));float fr=pow(1.-max(dot(V,N),0.),3.);vec3 base=mix(shallow,deep,smoothstep(0.,3.2,depth));base*=.35+.65*dayA;
 float cau=sin(vW.x*3.1+time*1.3)+sin(vW.z*2.7-time*1.1)+sin((vW.x+vW.z)*2.3+time*.9);base+=vec3(.5,.8,.7)*smoothstep(1.5,2.9,cau)*smoothstep(1.7,.2,depth)*.26*dayA;
 vec3 c=mix(base,skyC*(.4+.6*dayA),fr*.75);vec3 L=normalize(sunDir);vec3 Hh=normalize(L+V);float dd=length(cameraPosition-vW);c+=vec3(1.,.9,.7)*pow(max(dot(N,Hh),0.),90.)*.9*dayA*(1.-smoothstep(40.,260.,dd));c+=vec3(1.)*pow(max(dot(N,Hh),0.),420.)*1.8*dayA*(1.-smoothstep(30.,170.,dd));
 float lace=sin(vW.x*5.+sin(vW.z*3.+time)*2.+time*2.)*sin(vW.z*4.7+sin(vW.x*2.9-time)*2.-time*1.7);float foam=smoothstep(.55+.25*sin(time*.9+vW.x*.15),.0,depth)*(.5+.5*smoothstep(-.25,.6,lace));foam+=smoothstep(.15,.0,abs(depth-.9+sin(time*.8+vW.x*.2)*.25))*.18;c=mix(c,vec3(.95,.98,1.)*(.35+.65*dayA),clamp(foam,0.,1.)*.85);
 float a=mix(.55,.97,smoothstep(0.,1.4,depth));a=max(a,foam*.9);float d=length(cameraPosition-vW);float f=1.-exp(-fogDen*fogDen*d*d);c=mix(c,fogC,clamp(f,0.,1.));gl_FragColor=vec4(c,a);}`}));
  waterMesh.renderOrder=2;scene.add(waterMesh);
}


/* ================= camps & content layout ================= */
const CAMPS=[
 {id:'c1',x:-62,z:42,e:['goblin','goblin','goblin'],chest:1},
 {id:'c2',x:-84,z:-14,e:['goblin','goblin','archer']},
 {id:'c4',x:-70,z:-62,e:['wolf','wolf','wolf']},
 {id:'c5',x:-28,z:-58,e:['goblin','goblin','archer'],chest:1},
 {id:'c7',x:60,z:40,e:['goblin','goblin','goblin'],chest:1},
 {id:'c8',x:96,z:28,e:['archer','archer','goblin']},
 {id:'c10',x:80,z:-48,e:['wolf','wolf','goblin']},
 {id:'c11',x:32,z:-62,e:['goblin','goblin','goblin','archer'],chest:1},
 {id:'c13',x:22,z:128,e:['goblin','goblin']},
 {id:'c14',x:-90,z:92,e:['wolf','wolf']},
 {id:'c15',x:98,z:92,e:['goblin','goblin','archer']}
];
const ARENAS={troll:{x:-105,z:18},frost:{x:-30,z:-100},magma:{x:122,z:-8},hollow:{x:0,z:-22}};
const VILLAGE={x:0,z:72};
function nearAny(x,z){
  for(const c of CAMPS)if(Math.hypot(x-c.x,z-c.z)<9)return true;
  for(const k in ARENAS){const a=ARENAS[k];if(Math.hypot(x-a.x,z-a.z)<(k==='hollow'?30:24))return true;}
  if(Math.hypot(x-VILLAGE.x,z-VILLAGE.z)<38)return true;
  for(const r of RUINS)if(Math.hypot(x-r.x,z-r.z)<12)return true;
  return false;
}
function okSpot(x,z,minH=2,maxSl=.5){const h=gh(x,z);if(h<minH)return false;if(slopeAt(x,z)>maxSl)return false;if(pathDist(x,z)<3.4)return false;return !nearAny(x,z);}

const _tm=new THREE.Matrix4(),_q=new THREE.Quaternion(),_v=new THREE.Vector3(),_s=new THREE.Vector3(),_e=new THREE.Euler(),_c=new THREE.Color();
function instMesh(geo,mat,n,cast){const m=new THREE.InstancedMesh(geo,mat,n);m.castShadow=!!cast;m.frustumCulled=false;scene.add(m);return m;}
function setInst(meshes,i,x,y,z,sx,sy,sz,ry,color){_e.set(0,ry,0);_q.setFromEuler(_e);_v.set(x,y,z);_s.set(sx,sy,sz);_tm.compose(_v,_q,_s);for(const m of meshes){m.setMatrixAt(i,_tm);if(color)m.setColorAt(i,color);}}
function tr(g,x,y,z){g.translate(x,y,z);return g;}

function tuftGeo(){
  const NB=9,P=[],C=[],I=[];let vo=0;
  for(let b=0;b<NB;b++){const a=b/NB*TAU+_hash(b,1,2)*.6,r=.04+_hash(b,3,4)*.16,h=.35+_hash(b,5,6)*.5,bend=.25+_hash(b,7,8)*.55,wd=.05+_hash(b,9,1)*.025;
    const ca=Math.cos(a),sa=Math.sin(a),rows=[[0,1],[.4,.78],[.75,.45],[1,0]];
    rows.forEach(([t,w],k)=>{const y=t*h,fw=wd*w,zb=bend*t*t*h*.9;
      const push=(lx)=>{const x=lx,z=zb;const wx=x*(-sa)+z*ca*0+0,wz=0;P.push(ca*r+(-sa)*lx+ca*zb*0,y,sa*r+ca*lx+sa*zb*0);};
      // blade lies in the plane facing outward, bending toward its facing direction
      if(w>0){for(const s of[-1,1]){P.push(ca*r+(-sa)*fw*s+ca*zb,y,sa*r+ca*fw*s+sa*zb);const v=.5+.7*t;C.push(v*.9,v,v*.8);}}else{P.push(ca*r+ca*zb,y,sa*r+sa*zb);C.push(1.2*.9,1.2,1.2*.8);}});
    // indices
    for(let k=0;k<3;k++){const a0=vo+k*2;if(k<2){I.push(a0,a0+1,a0+2,a0+1,a0+3,a0+2);}else I.push(a0,a0+1,a0+4);}
    vo+=7;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(P),3));g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(C),3));g.setIndex(I);g.computeVertexNormals();return g;
}
function bushGeo(){const L=[],bl=[[0,.5,0,.7],[.55,.4,.2,.5],[-.5,.42,-.1,.52],[.05,.85,.05,.42]];
  for(const [x,y,z,r] of bl){const g=new THREE.IcosahedronGeometry(r,1);g.translate(x,y,z);L.push(organic(g,r*.35,.55,1.12,y-r,y+r));}
  return mergeGeo(L);}

function _hash(x,y,z){const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return s-Math.floor(s);}
function organic(g,amp,lo,hi,y0,y1){g=g.index?g:g;const pos=g.attributes.position,n=pos.count,col=new Float32Array(n*3);
  const q=new Map();
  for(let i=0;i<n;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),k=x.toFixed(3)+','+y.toFixed(3)+','+z.toFixed(3);let d=q.get(k);if(!d){d=[_hash(x,y,z)-.5,_hash(y,z,x)-.5,_hash(z,x,y)-.5];q.set(k,d);}
    pos.setXYZ(i,x+d[0]*amp,y+d[1]*amp,z+d[2]*amp);
    const t=Math.max(0,Math.min(1,(y-y0)/(y1-y0))),b=lo+(hi-lo)*t,v=b*(.94+_hash(x,y,z)*.12);col[i*3]=col[i*3+1]=col[i*3+2]=v;}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();return g;}
function mergeGeo(list){list=list.map(g=>{if(!g.index){const n=g.attributes.position.count,a=new Uint32Array(n);for(let i=0;i<n;i++)a[i]=i;g.setIndex(new THREE.BufferAttribute(a,1));}return g;});let vn=0,inn=0;for(const g of list){vn+=g.attributes.position.count;inn+=g.index.count;}
  const P=new Float32Array(vn*3),C=new Float32Array(vn*3),I=new Uint32Array(inn);let vo=0,io=0;
  for(const g of list){P.set(g.attributes.position.array,vo*3);C.set(g.attributes.color.array,vo*3);for(let i=0;i<g.index.count;i++)I[io+i]=g.index.array[i]+vo;vo+=g.attributes.position.count;io+=g.index.count;}
  const m=new THREE.BufferGeometry();m.setAttribute('position',new THREE.BufferAttribute(P,3));m.setAttribute('color',new THREE.BufferAttribute(C,3));m.setIndex(new THREE.BufferAttribute(I,1));m.computeVertexNormals();return m;}
function pineFoliage(){const L=[];const tiers=[[1.75,2.2,2.2],[1.5,2.0,3.2],[1.25,1.9,4.2],[1.0,1.7,5.1],[.72,1.5,5.95],[.42,1.3,6.7]];
  tiers.forEach(([r,h,y],i)=>{const cg=new THREE.ConeGeometry(r,h,8,1,true).rotateY(i*.7);cg.translate(0,y,0);
    L.push(organic(cg,r*.22,.55,1.15,y-h/2,y+h/2));});
  return mergeGeo(L);}
function roundCanopy(){const L=[];const bl=[[0,3.5,0,1.9],[.95,4.5,.4,1.35],[-1.1,4.0,-.5,1.3],[.3,4.9,-.4,1.1],[0,5.4,0,.85]];
  for(const [x,y,z,r] of bl){const g=new THREE.IcosahedronGeometry(r,1);g.translate(x,y,z);L.push(organic(g,r*.3,.6,1.1,y-r,y+r));}
  return mergeGeo(L);}
function trunkGeo(rt,rb,h,y){const a=new THREE.CylinderGeometry(rt,rb,h,6,2,true);a.translate(0,y+h/2,0);organic(a,rb*.2,.7,1,y,y+h);
  const f=new THREE.ConeGeometry(rb*2.2,.7,6,1,true);f.translate(0,y+.3,0);organic(f,rb*.3,.6,.9,y,y+.7);return mergeGeo([a,f]);}

function flowerStemGeo(){const g=new THREE.CylinderGeometry(.012,.02,.5,3,2,true);g.translate(0,.25,0);const pos=g.attributes.position,col=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){const t=pos.getY(i)/.5;pos.setX(i,pos.getX(i)+Math.sin(t*2.2)*.03*t);col[i*3]=.25+.1*t;col[i*3+1]=.55+.15*t;col[i*3+2]=.2;}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  // two leaves
  const L=[g];for(let k=0;k<2;k++){const lf=new THREE.ConeGeometry(.045,.2,4);lf.scale(1,1,.3);lf.translate(0,.1,0);lf.rotateZ((k?1:-1)*1.1);lf.translate(0,.1+k*.06,0);lf.rotateY(k*2.4);const lp=lf.attributes.position,lc=new Float32Array(lp.count*3);for(let i=0;i<lp.count;i++){lc[i*3]=.22;lc[i*3+1]=.6;lc[i*3+2]=.22;}lf.setAttribute('color',new THREE.BufferAttribute(lc,3));L.push(lf);}
  return mergeGeo(L);}
function flowerHeadGeo(){const L=[],n=6;
  for(let i=0;i<n;i++){const a=i/n*TAU;const pg=new THREE.SphereGeometry(.07,4,2);pg.scale(1,.28,.55);pg.translate(.085,0,0);pg.rotateZ(.35);pg.rotateY(a);pg.translate(0,.5,0);
    const pp=pg.attributes.position,pc=new Float32Array(pp.count*3);for(let k=0;k<pp.count;k++){pc[k*3]=pc[k*3+1]=pc[k*3+2]=1;}pg.setAttribute('color',new THREE.BufferAttribute(pc,3));L.push(pg);}
  const cg=new THREE.SphereGeometry(.05,5,3);cg.scale(1,.7,1);cg.translate(0,.52,0);const cp=cg.attributes.position,cc=new Float32Array(cp.count*3);for(let k=0;k<cp.count;k++){cc[k*3]=.95;cc[k*3+1]=.75;cc[k*3+2]=.25;}cg.setAttribute('color',new THREE.BufferAttribute(cc,3));L.push(cg);
  return mergeGeo(L);}
function rockGeo(){const g=new THREE.IcosahedronGeometry(1,1);const pos=g.attributes.position,n=pos.count,q=new Map();
  for(let i=0;i<n;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),k=x.toFixed(3)+','+y.toFixed(3)+','+z.toFixed(3);let d=q.get(k);if(!d){d=1+(_hash(x,y,z)-.5)*.55;q.set(k,d);}
    let ny=y*d;if(ny<-.45)ny=-.45+(ny+.45)*.15;pos.setXYZ(i,x*d*(1+.12*Math.sin(y*4)),ny,z*d);}
  g.computeVertexNormals();const nor=g.attributes.normal,col=new Float32Array(n*3);
  for(let i=0;i<n;i++){const ny=nor.getY(i),h=(pos.getY(i)+.5);let v=.72+.28*Math.min(1,Math.max(0,h));const r=v,gg=v,b=v;
    if(ny>.55){const m=Math.min(1,(ny-.55)*2.2);col[i*3]=r*(1-m*.35);col[i*3+1]=gg*(1+m*.0);col[i*3+2]=b*(1-m*.4);}else{col[i*3]=r;col[i*3+1]=gg;col[i*3+2]=b;}}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));return g;}
function buildVegetation(){
  const white=TOON({color:0xffffff});addSway(white,.0085);const whiteV=TOON({color:0xffffff,vertexColors:true});addSway(whiteV,.0085);
  // pines
  const NP=1300,pines=[instMesh(trunkGeo(.14,.3,2.2,0),whiteV,NP,true),instMesh(pineFoliage(),whiteV,NP,true)];
  const NR=620,rounds=[instMesh(trunkGeo(.2,.38,3.4,0),whiteV,NR,true),instMesh(roundCanopy(),whiteV,NR,true)];
  const ND=140,deads=[instMesh(tr(new THREE.CylinderGeometry(.12,.3,3.4,5),0,1.7,0),white,ND,true),instMesh(tr(new THREE.CylinderGeometry(.06,.12,1.6,4).rotateZ(.8),.7,3.1,0),white,ND,true)];
  const NPALM=90,palms=[instMesh(tr(new THREE.CylinderGeometry(.18,.3,5,6).rotateZ(.12),.3,2.5,0),white,NPALM,true),instMesh(tr(new THREE.SphereGeometry(2.1,7,5).scale(1,.38,1),.55,5.1,0),white,NPALM,true)];
  const NRK=560,rocks=[instMesh(rockGeo(),whiteV,NRK,true)];
  let np=0,nr=0,nd=0,nl=0,nk=0;const c=new THREE.Color();
  for(let a=0;a<26000&&(np<NP||nr<NR);a++){
    const ang=R()*TAU,rad=Math.sqrt(R())*182,x=Math.cos(ang)*rad,z=Math.sin(ang)*rad,h=gh(x,z);
    const fw=forestW(x,z),dc=Math.hypot(x-CRT.x,z-CRT.z);
    if(h<1.9){ // beach palms
      if(h>.5&&h<2.1&&nl<NPALM&&R()<.05&&slopeAt(x,z)<.35&&!nearAny(x,z)){const s=RR(.8,1.25),ry=R()*TAU;setInst(palms,nl,x,h-.1,z,s,s,s,ry,null);c.setHSL(.27+R()*.05,.5,.3+R()*.1);palms[1].setColorAt(nl,c);_c.set('#7a5a38');palms[0].setColorAt(nl,_c);nl++;addCircle(x+.3*s,z,.4*s,'palm');}
      continue;}
    if(!okSpot(x,z,2,.55))continue;
    if(dc<40){ // ash dead trees
      if(nd<ND&&R()<.08){const s=RR(.8,1.5),ry=R()*TAU;setInst(deads,nd,x,h-.1,z,s,s,s,ry,null);_c.set('#40362f');deads[0].setColorAt(nd,_c);deads[1].setColorAt(nd,_c);nd++;addCircle(x,z,.35*s,'dead');}
      continue;}
    const pineP=h>16?(h>24?0:.8):(.15+fw*.9),dens=fbm(x*.04+3,z*.04+3,2);
    if(R()>(.25+dens*.9)*(fw>.3?1.15:.6))continue;
    if(R()<pineP&&np<NP){const s=RR(.85,1.8)*(h>16?.8:1),ry=R()*TAU;const sy2=s*RR(.9,1.2);setInst(pines,np,x,h-.1,z,s,sy2,s,ry,null);
      c.setHSL(.33+R()*.04,.5+R()*.15,.16+R()*.1+(h>14?.06:0));pines[1].setColorAt(np,c);_c.set('#7a5a3c');pines[0].setColorAt(np,_c);if(h>18){c.setRGB(.85,.9,.95);pines[1].setColorAt(np,c);}
      TREES.push({ms:pines,i:np,x,z,y:h-.1,sx:s,sy:sy2,ry,c:addCircle(x,z,.5*s,'pine'),hp:4});np++;}
    else if(nr<NR&&h<17){const s=RR(.8,1.5),ry=R()*TAU;setInst(rounds,nr,x,h-.1,z,s,s,s,ry,null);
      const k=R(); if(k<.08)c.setHSL(.03+R()*.05,.7,.5);else if(k<.14)c.setHSL(.92,.55,.75);else if(k<.2)c.setHSL(.12,.75,.5);else c.setHSL(.25+R()*.08,.55,.28+R()*.14);
      rounds[1].setColorAt(nr,c);_c.set('#8a6240');rounds[0].setColorAt(nr,_c);TREES.push({ms:rounds,i:nr,x,z,y:h-.1,sx:s,sy:s,ry,c:addCircle(x,z,.5*s,'tree'),hp:3});nr++;}
  }
  for(let a=0;a<4000&&nk<NRK;a++){
    const ang=R()*TAU,rad=Math.sqrt(R())*180,x=Math.cos(ang)*rad,z=Math.sin(ang)*rad,h=gh(x,z);
    if(h<.8||nearAny(x,z)||pathDist(x,z)<3)continue;
    const big=h>12||R()<.1,s=big?RR(1.6,3.8):RR(.5,1.4),sl=slopeAt(x,z);if(sl<.3&&R()<.75&&!big)continue;
    setInst(rocks,nk,x,h+s*.3,z,s*RR(.9,1.4),s*RR(.6,1),s*RR(.9,1.4),R()*TAU,null);c.setHSL(.09+R()*.05,.05+R()*.07,.4+R()*.2);if(h>26)c.setHSL(.6,.05,.8);rocks[0].setColorAt(nk,c);addCircle(x,z,s*.95,'rock');nk++;
    const np2=R()<.6?1+Math.floor(R()*4):0;for(let q=0;q<np2&&nk<NRK;q++){const a2=R()*TAU,r2=s*RR(1.1,1.9),px=x+Math.cos(a2)*r2,pz=z+Math.sin(a2)*r2,s2=s*RR(.12,.32),ph=gh(px,pz);if(ph<.8)continue;setInst(rocks,nk,px,ph+s2*.3,pz,s2*RR(.9,1.3),s2*RR(.6,1),s2*RR(.9,1.3),R()*TAU,null);c.setHSL(.09+R()*.05,.05+R()*.06,.38+R()*.2);rocks[0].setColorAt(nk,c);nk++;}}
  [[pines,np],[rounds,nr],[deads,nd],[palms,nl],[rocks,nk]].forEach(([ms,n])=>ms.forEach(m=>{m.count=n;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}));
  // grass tufts + flowers
  const NG=7000,grassM=TOON({color:0xffffff,vertexColors:true,side:THREE.DoubleSide}),grass=instMesh(tuftGeo(),(addSway(grassM,.1),grassM),NG,false);let ng=0;
  for(let a=0;a<60000&&ng<NG;a++){const ang=R()*TAU,rad=Math.sqrt(R())*170,x=Math.cos(ang)*rad,z=Math.sin(ang)*rad,h=gh(x,z);
    if(h<2||h>16||pathDist(x,z)<1.6||Math.hypot(x,z-72)<13||Math.hypot(x-CRT.x,z-CRT.z)<46||slopeAt(x,z)>.6)continue;
    if(fbm(x*.09,z*.09,2)<.42)continue;const s=RR(.9,1.8);setInst([grass],ng,x,h-.05,z,s,s*RR(.8,1.5),s,R()*TAU,null);c.setHSL(.25+R()*.08,.55,.32+R()*.14);grass.setColorAt(ng,c);ng++;}
  grass.count=ng;grass.userData.full=ng;grass.instanceMatrix.needsUpdate=true;grass.instanceColor.needsUpdate=true;world.grass=grass;
  const NF=2000,stemM=TOON({color:0xffffff,vertexColors:true,side:THREE.DoubleSide});addSway(stemM,.09);const headM=TOON({color:0xffffff,vertexColors:true,emissive:0x1a1208});addSway(headM,.09);
  const flS=instMesh(flowerStemGeo(),stemM,NF,false),fl=instMesh(flowerHeadGeo(),headM,NF,false);let nf=0;
  for(let a=0;a<40000&&nf<NF;a++){const ang=R()*TAU,rad=Math.sqrt(R())*170,x0=Math.cos(ang)*rad,z0=Math.sin(ang)*rad,h0=gh(x0,z0);
    if(h0<2.4||h0>15||pathDist(x0,z0)<1.4||nearAny(x0,z0)&&Math.hypot(x0,z0-72)>38||slopeAt(x0,z0)>.5||fbm(x0*.12+9,z0*.12,2)<.52)continue;
    const hue=[.0,.12,.14,.58,.8,.95,.08][Math.floor(R()*7)],cnt=1+Math.floor(R()*3);
    for(let q=0;q<cnt&&nf<NF;q++){const x=x0+RR(-.7,.7),z=z0+RR(-.7,.7),h=gh(x,z),s=RR(.8,1.5),ry=R()*TAU;
      setInst([flS,fl],nf,x,h-.02,z,s,s*RR(.9,1.4),s,ry,null);c.setHSL(hue+RR(-.02,.02),.85,.62);fl.setColorAt(nf,c);_c.setRGB(1,1,1);flS.setColorAt(nf,_c);nf++;}}
  fl.count=nf;flS.count=nf;fl.instanceMatrix.needsUpdate=flS.instanceMatrix.needsUpdate=true;fl.instanceColor.needsUpdate=flS.instanceColor.needsUpdate=true;
  const NBU=520,bushM=instMesh(bushGeo(),whiteV,NBU,true);let nbu=0;
  for(let a=0;a<30000&&nbu<NBU;a++){const ang=R()*TAU,rad=Math.sqrt(R())*172,x=Math.cos(ang)*rad,z=Math.sin(ang)*rad,h=gh(x,z);
    if(h<2.2||h>17||pathDist(x,z)<2||nearAny(x,z)||Math.hypot(x,z-72)<14||Math.hypot(x-CRT.x,z-CRT.z)<44||slopeAt(x,z)>.55)continue;
    if(forestW(x,z)<.25&&R()<.7)continue;
    const s=RR(.7,1.5);setInst([bushM],nbu,x,h-.05,z,s*RR(.9,1.3),s*RR(.8,1.2),s*RR(.9,1.3),R()*TAU,null);
    const k=R();if(k<.12)c.setHSL(.95,.5,.5);else if(k<.2)c.setHSL(.08,.7,.5);else c.setHSL(.24+R()*.1,.5,.26+R()*.12);bushM.setColorAt(nbu,c);nbu++;}
  bushM.count=nbu;bushM.instanceMatrix.needsUpdate=true;bushM.instanceColor.needsUpdate=true;
}

/* ---------- structures ---------- */
function gableRoof(w,d,rh,over,mat){
  const x=w/2+over,z=d/2+over,g=new THREE.BufferGeometry();
  const v=[-x,0,-z, x,0,-z, x,0,z, -x,0,z, -x,0,0, x,0,0].map(()=>0);
  const P=[[-x,0,z],[x,0,z],[x,rh,0],[-x,rh,0],[x,0,-z],[-x,0,-z],[-x,0,z],[-x,rh,0],[x,0,z],[x,0,-z]];
  const tri=[0,1,2, 0,2,3, 4,5,3, 4,3,2, 5,0,3, 1,4,2];
  const pos=[];const pts=[[-x,0,z],[x,0,z],[x,rh,0],[-x,rh,0],[x,0,-z],[-x,0,-z]];
  for(const i of tri)pos.push(...pts[i]);
  // thickness underside: simple dark cap
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;return m;
}
function box(w,h,d,mat,x,y,z,cast=true){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;return m;}
function cyl(rt,rb,h,mat,x,y,z,seg=8){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
const smokes=[];
const FLM=[];
function house(x,z,w,d,h,roofCol,opts={}){
  const g=new THREE.Group(),gy=gh(x,z);g.position.set(x,gy,z);
  const dx=VILLAGE.x-x,dz=VILLAGE.z-z,rot=opts.rot!=null?opts.rot:Math.atan2(dx,dz);g.rotation.y=rot;
  g.add(box(w+.4,.6,d+.4,mats.stone,0,.3,0));
  g.add(box(w,h,d,opts.wall||mats.wall,0,.6+h/2,0));
  for(const sx of[-1,1])for(const sz of[-1,1])g.add(box(.28,h,.28,mats.timber,sx*w/2,.6+h/2,sz*d/2));
  g.add(box(w+.05,.2,d+.05,mats.timber,0,.6+h*.55,0));
  const roof=gableRoof(w,d,Math.max(2,h*.55),.8,roofCol);roof.position.y=.6+h;g.add(roof);const PT={roof,sh:[],fb:[],ln:[],ch:null,sm:null};
  g.add(box(1.3,2.2,.2,mats.door,0,.6+1.1,d/2+.06));g.add(box(1.5,.15,.35,mats.timber,0,.6+2.3,d/2+.08));
  for(const sx of[-1,1]){const wn=new THREE.Mesh(new THREE.PlaneGeometry(.9,.9),mats.windowMat);wn.position.set(sx*(w/2-1.5),.6+h*.55+.2,d/2+.04);g.add(wn);g.add(box(1.1,.12,.12,mats.timber,sx*(w/2-1.5),.6+h*.55+.7,d/2+.08));g.add(box(1.1,.12,.12,mats.timber,sx*(w/2-1.5),.6+h*.55-.3,d/2+.08));}
  const sw=new THREE.Mesh(new THREE.PlaneGeometry(.9,.9),mats.windowMat);sw.position.set(w/2+.04,.6+h*.55+.2,0);sw.rotation.y=PI/2;g.add(sw);
  if(opts.chimney!==false){PT.ch=box(.9,h*.4+2,.9,mats.stone,w/2-1,.6+h+1.6,-d/4);g.add(PT.ch);smokes.push({x:x+Math.cos(rot)*(w/2-1)+Math.sin(rot)*(-d/4)*-1,y:gy+.6+h+h*.4+3.4,z:z-Math.sin(rot)*(w/2-1)+Math.cos(rot)*(-d/4)});PT.sm=smokes[smokes.length-1];}
  { // phase 5 detail: shutters, flower boxes, ridge beam, step, lantern, wall bracing
    const wy=.6+h*.55+.2,rh=Math.max(2,h*.55);
    if(!FLM.length)for(const c of['#e8506a','#ffd24a','#f4f0e8','#b060e0'])FLM.push(M(c));
    const leaf=FLM.leaf||(FLM.leaf=M('#3f7a34'));
    for(const sx of[-1,1]){const wx=sx*(w/2-1.5);
      for(const s2 of[-1,1]){const sg=new THREE.Group(),sh=box(.4,.95,.06,mats.door,wx+s2*.68,wy,d/2+.08);sg.add(sh);for(let k=0;k<4;k++)sg.add(box(.34,.025,.02,mats.timber,wx+s2*.68,wy-.34+k*.23,d/2+.115));g.add(sg);PT.sh.push([sg,wx+s2*.68,wy,d/2+.1]);}
      const fbG=new THREE.Group();g.add(fbG);PT.fb.push([fbG,wx,wy-.5,d/2+.22]);
      fbG.add(box(1.15,.2,.3,mats.plank,wx,wy-.64,d/2+.22));fbG.add(box(1.05,.1,.2,leaf,wx,wy-.5,d/2+.22));
      for(let k=0;k<5;k++){const f=new THREE.Mesh(new THREE.SphereGeometry(.075,5,4),FLM[(k+(sx>0?1:0))%4]);f.position.set(wx-.4+k*.2,wy-.43,d/2+.24);fbG.add(f);}}
    const rg=box(w+1.9,.2,.2,mats.timber,0,.6+h+rh+.03,0);g.add(rg);
    g.add(box(1.9,.22,.9,mats.stone,0,.11,d/2+.45));
    const br=box(.08,.08,.35,mats.timber,1.05,.6+2.45,d/2+.25);g.add(br);PT.ln.push(br);const ln=new THREE.Mesh(new THREE.BoxGeometry(.16,.22,.16),new THREE.MeshBasicMaterial({color:0xffc060,fog:false}));ln.position.set(1.05,.6+2.3,d/2+.4);g.add(ln);PT.ln.push(ln);
    for(const sx of[-1,1]){const dg=box(.12,h*.62,.06,mats.timber,sx*(w/2-1.1),.6+h*.5,d/2+.04);dg.rotation.z=sx*.75;g.add(dg);}
  }
  scene.add(g);const bx=addBox(x,z,w/2+.2,d/2+.2,rot,gy+.6+h,Math.max(2,h*.55));const rf={x,z,y:gy+.6+h+Math.max(2,h*.55),rot};world.roofs.push(rf);
  regHouse({g,x,z,hw:w/2+.2,hd:d/2+.2,rot,h:.6+h,y0:gy,box:bx,roofRef:rf,PT,wallMat:opts.wall||mats.wall,roofMat:roofCol,w,d,name:'House'});return g;
}
function lampPost(x,z){const gy=gh(x,z),g=new THREE.Group();g.position.set(x,gy,z);g.add(cyl(.09,.12,3.2,mats.timber,0,1.6,0,6));const b=new THREE.Mesh(new THREE.SphereGeometry(.26,8,6),mats.lampMat);b.position.y=3.35;g.add(b);g.add(box(.5,.08,.5,mats.timber,0,3.12,0,false));scene.add(g);regProp({kind:'lamp',name:'Lamp post',g,x,z,y0:gy,r:.3,hp:5,c:addCircle(x,z,.2,'lamp'),globe:b,deb:[[mats.timber,.1,.5,.1,4],[mats.lampMat,.18,.18,.18,3]],loot:0});world.lamps.push({x,y:gy+3.35,z});}
function signpost(x,z,rot,n){const gy=gh(x,z),g=new THREE.Group();g.position.set(x,gy,z);g.rotation.y=rot;g.add(cyl(.1,.12,2.4,mats.timber,0,1.2,0,6));for(let i=0;i<n;i++){const p=box(1.5,.4,.08,mats.plank,.5,2.1-i*.5,0);p.rotation.z=(i%2?-.06:.06);g.add(p);}scene.add(g);regProp({kind:'sign',name:'Signpost',g,x,z,y0:gy,r:.35,hp:3,c:addCircle(x,z,.25,'sign'),deb:[[mats.plank,.7,.2,.07,4],[mats.timber,.1,.45,.1,3]],loot:1});}
function barrel(x,z){const gy=gh(x,z),g=new THREE.Group();g.position.set(x,gy,z);g.add(cyl(.42,.42,.9,mats.plank,0,.45,0,10));for(const yy of[.2,.7])g.add(cyl(.44,.44,.07,mats.iron,0,yy,0,10));scene.add(g);regProp({kind:'barrel',name:'Barrel',g,x,z,y0:gy,r:.45,hp:3,c:addCircle(x,z,.45,'barrel'),deb:[[mats.plank,.1,.55,.07,9],[mats.iron,.5,.05,.05,2]],loot:2});}
function crate(x,z,s=.9){const gy=gh(x,z);const g=new THREE.Group();g.position.set(x,gy,z);g.rotation.y=R()*TAU;g.add(box(s,s,s,mats.crate,0,s/2,0));scene.add(g);regProp({kind:'crate',name:'Crate',g,x,z,y0:gy,r:s*.6,hp:2,c:addCircle(x,z,s*.6,'crate'),deb:[[mats.crate,.5,.09,.14,8],[mats.timber,.12,.12,.12,3]],loot:2});}
function addBreakable(x,z,kind='pot'){
  const gy=gh(x,z);let m;
  if(kind==='pot'){m=new THREE.Group();const b=new THREE.Mesh(new THREE.SphereGeometry(.38,9,7).scale(1,1.1,1),mats.pot);b.position.y=.4;b.castShadow=true;const nk=cyl(.2,.28,.22,mats.pot,0,.85,0,9);m.add(b,nk);}
  else{m=box(.8,.8,.8,mats.crate,0,.4,0);}
  m.position.set(x,gy,z);scene.add(m);const c=addCircle(x,z,.4,'break');world.breakables.push({m,x,z,y:gy,hp:1,c,kind});
}
function campfire(x,z,big){const gy=gh(x,z),g=new THREE.Group();g.position.set(x,gy,z);
  for(let i=0;i<5;i++){const l=cyl(.09,.09,1.1,mats.timber,0,.2,0,6);l.rotation.z=PI/2-.35;l.rotation.y=i*TAU/5;l.position.set(Math.cos(i*TAU/5)*.25,.18,Math.sin(i*TAU/5)*.25);g.add(l);}
  for(let i=0;i<8;i++){const s=new THREE.Mesh(new THREE.DodecahedronGeometry(.18,0),mats.stone);s.position.set(Math.cos(i*.78)*.75,.1,Math.sin(i*.78)*.75);g.add(s);}
  const fm=new THREE.MeshBasicMaterial({color:0xff9a3a,transparent:true,opacity:.92,fog:false}),f1=new THREE.Mesh(new THREE.ConeGeometry(.35,1,7),fm);f1.position.y=.7;g.add(f1);
  const f2=new THREE.Mesh(new THREE.ConeGeometry(.2,.7,6),new THREE.MeshBasicMaterial({color:0xffe27a,transparent:true,opacity:.95,fog:false}));f2.position.y=.6;g.add(f2);
  f1.visible=false;f2.visible=false;addFlameFX(g,0,.12,0,big?1.6:1,null);
  scene.add(g);addCircle(x,z,.8,'fire');world.fires.push({x,y:gy+1,z,f1,f2,ph:R()*10});}
function tent(x,z,rot,col){const gy=gh(x,z),g=new THREE.Group();g.position.set(x,gy,z);g.rotation.y=rot;const t=new THREE.Mesh(new THREE.ConeGeometry(2.1,2.6,5),MF(col));t.position.y=1.3;t.castShadow=true;g.add(t);g.add(box(.7,1.4,.05,mats.door,0,.6,1.55));scene.add(g);addCircle(x,z,1.6,'tent');}
function chest(x,z,rot=0,loot){const gy=gh(x,z),g=new THREE.Group();g.position.set(x,gy,z);g.rotation.y=rot;
  g.add(box(1.2,.7,.8,mats.chestW,0,.35,0));g.add(box(1.24,.1,.84,mats.gold,0,.7,0,false));g.add(box(.16,.5,.86,mats.gold,0,.35,0,false));
  const lid=new THREE.Group();lid.position.set(0,.72,-.4);const lm=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,1.2,10,1,false,0,PI),mats.chestW);lm.rotation.z=PI/2;lm.rotation.y=0;lm.position.set(0,0,.4);lm.rotation.set(0,0,PI/2);lm.rotation.x=0;
  const lid2=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,1.22,10,1,false,0,PI),mats.chestW);lid2.rotation.z=PI/2;lid2.rotation.y=-PI/2;lid2.position.set(0,0,.4);lid2.castShadow=true;lid.add(lid2);g.add(lid);
  scene.add(g);addCircle(x,z,.8,'chest');const o={kind:'chest',x,z,lid,open:0,opened:false,loot:loot||'coins',id:'ch'+world.chests.length,prompt:'Open chest'};world.chests.push(o);world.interact.push(o);}

function buildMaterials(){
  mats.stone=MS('#9a978f',{roughness:.95});mats.wall=M('#eadbb4');mats.timber=M('#6a4328');mats.plank=M('#8a5a34');mats.door=M('#4b2f1b');
  mats.roofR=MF('#b9452f');mats.roofB=MF('#4f6f8a');mats.roofG=MF('#6e7f3a');mats.roofO=MF('#c78535');
  mats.windowMat=new THREE.MeshStandardMaterial({color:0x3a2f1a,emissive:0xffc860,emissiveIntensity:.1,roughness:.5});
  mats.lampMat=new THREE.MeshStandardMaterial({color:0x3a2f1a,emissive:0xffb347,emissiveIntensity:.2});
  mats.pot=M('#c4683a');mats.crate=M('#a9753f');mats.iron=MS('#40454c',{metalness:.7,roughness:.4});mats.chestW=M('#8a4f26');mats.gold=MS('#e0b040',{metalness:.8,roughness:.3,emissive:0x332200});
  mats.hay=M('#d8b856');
}
function buildVillage(){
  const V=VILLAGE;
  // plaza brazier (the village flame)
  const gy=gh(V.x,V.z),bz=new THREE.Group();bz.position.set(V.x,gy,V.z);bz.add(cyl(1.4,1.8,.5,mats.stone,0,.25,0,10));bz.add(cyl(.5,.8,1.8,mats.stone,0,1.4,0,8));bz.add(cyl(1.3,.7,.5,mats.stone,0,2.5,0,10));
  const bf=new THREE.Mesh(new THREE.ConeGeometry(.5,1.2,7),new THREE.MeshBasicMaterial({color:0xff9a3a,transparent:true,opacity:.0,fog:false}));bf.position.y=3.1;bz.add(bf);
  const bf2=new THREE.Mesh(new THREE.ConeGeometry(.28,.8,6),new THREE.MeshBasicMaterial({color:0xffe9a0,transparent:true,opacity:0,fog:false}));bf2.position.y=2.9;bz.add(bf2);
  bf.visible=false;bf2.visible=false;addFlameFX(bz,0,2.7,0,1.7,()=>world.brazier&&world.brazier.lit);
  scene.add(bz);addCircle(V.x,V.z,1.7,'brazier');world.brazier={f:bf,f2:bf2,x:V.x,y:gy+3,z:V.z,lit:false};
  // houses
  const H=[[0,50,13,8,4.4,mats.roofR,{wall:M('#f0e2bd')}],[-22,62,8,7,3.4,mats.roofB],[23,60,8,7,3.4,mats.roofO],[-20,86,9,7,3.6,mats.roofG],[22,86,8,7,3.4,mats.roofB],[-4,100,8,7,3.4,mats.roofR],[36,76,7,6,3,mats.roofG],[-35,74,7,6,3,mats.roofO]];
  H.forEach(h=>house(h[0],h[1],h[2],h[3],h[4],h[5],h[6]||{}));
  // windmill
  const wx=-30,wz=96,wy=gh(wx,wz),wm=new THREE.Group();wm.position.set(wx,wy,wz);
  wm.add(cyl(2.3,3.4,11,mats.wall,0,5.5,0,10));wm.add(cyl(0,0,0,mats.wall,0,0,0));const wr=new THREE.Mesh(new THREE.ConeGeometry(3.2,3.6,10),mats.roofR);wr.position.y=12.7;wr.castShadow=true;wm.add(wr);
  wm.add(box(1.2,2.2,.3,mats.door,0,1.1,3.35));for(let i=0;i<3;i++)wm.add(box(.9,.9,.12,mats.windowMat,0,4+i*2.6,2.6-i*.1));
  const bl=new THREE.Group();bl.position.set(0,9.5,3.6);for(let i=0;i<4;i++){const arm=new THREE.Group();arm.rotation.z=i*PI/2;arm.add(box(.35,9.5,.25,mats.timber,0,4.75,0));arm.add(box(1.8,6.5,.08,mats.hay,1.05,5.6,.05));bl.add(arm);}
  bl.add(cyl(.5,.5,.6,mats.iron,0,0,0,8).rotateX(PI/2));wm.add(bl);scene.add(wm);addCircle(wx,wz,3.6,'mill');world.animated.push(dt=>{bl.rotation.z+=dt*.55;});regProp({kind:'mill',name:'Windmill',g:wm,x:wx,z:wz,y0:wy,r:3.6,hp:40,c:null,bl,deb:[[mats.timber,.35,2.4,.25,5],[mats.hay,.9,1.6,.08,4]],loot:0,circ:true});
  // well
  const wlx=-10,wlz=62,wly=gh(wlx,wlz),wl=new THREE.Group();wl.position.set(wlx,wly,wlz);wl.add(cyl(1.3,1.4,1,mats.stone,0,.5,0,12));const wat=new THREE.Mesh(new THREE.CircleGeometry(1.05,12),new THREE.MeshBasicMaterial({color:0x2a6fa8}));wat.rotation.x=-PI/2;wat.position.y=.85;wl.add(wat);
  wl.add(box(.2,2.4,.2,mats.timber,-1.15,1.8,0));wl.add(box(.2,2.4,.2,mats.timber,1.15,1.8,0));const wr2=gableRoof(3,2,1.2,.3,mats.roofR);wr2.position.y=3;wr2.rotation.y=0;wl.add(wr2);scene.add(wl);addCircle(wlx,wlz,1.5,'well');
  // lamps around plaza
  for(let i=0;i<8;i++){const a=i*TAU/8+.2;lampPost(V.x+Math.cos(a)*11,V.z+Math.sin(a)*11);}
  lampPost(0,66);lampPost(-9,44);lampPost(9,44);
  // market stall
  const sx=16,sz=76,sy=gh(sx,sz),st=new THREE.Group();st.position.set(sx,sy,sz);st.rotation.y=Math.atan2(V.x-sx,V.z-sz);
  for(const a of[-1,1])for(const b of[-1,1])st.add(cyl(.1,.1,3,mats.timber,a*2,1.5,b*1.3,6));
  for(let i=0;i<8;i++)st.add(box(.6,.12,3.2,TOON({color:i%2?0xe9e2d0:0xc23b2c}),-2.1+i*.6,3.1+(i%2)*.0,0,true));
  st.add(box(4,.8,1,mats.plank,0,.5,.6));for(let i=0;i<5;i++){const a=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),TOON({color:[0xd23a2a,0x6ac24a,0xe8b43a,0xd23a2a,0x6ac24a][i]}));a.position.set(-1.4+i*.7,1.1,.6);st.add(a);}
  scene.add(st);{const bx=addBox(sx,sz,2.4,.7,st.rotation.y);regHouse({g:st,x:sx,z:sz,hw:2.4,hd:.7,rot:st.rotation.y,h:3.2,y0:sy,box:bx,roofRef:null,PT:null,wallMat:mats.plank,roofMat:mats.plank,w:4,d:1,name:'Market stall',hp:12,inset:0,fruit:true});}
  // forge
  const fx=-26,fz=76,fy=gh(fx,fz),fg=new THREE.Group();fg.position.set(fx,fy,fz);fg.rotation.y=Math.atan2(V.x-fx,V.z-fz);
  fg.add(box(2.4,1.6,1.8,mats.stone,0,.8,0));const glow=new THREE.Mesh(new THREE.PlaneGeometry(1.4,.6),new THREE.MeshBasicMaterial({color:0xff7a2a,fog:false}));glow.position.set(0,1.1,.92);fg.add(glow);
  fg.add(box(.7,.7,.5,mats.iron,2.3,.7,0));fg.add(box(1,.15,.5,mats.iron,2.3,1.1,0));fg.add(box(.9,2.6,.9,mats.stone,-.6,2.6,-.5));
  scene.add(fg);addBox(fx,fz,1.9,1.1,fg.rotation.y);smokes.push({x:fx,y:fy+4.2,z:fz});world.forge={x:fx,y:fy+1.2,z:fz};
  // fences + hay + barrels + crates + pots
  [[-12,52],[12,52],[-30,66],[30,68],[-16,92],[16,94],[4,94],[-8,96]].forEach(p=>{if(R()<.5)barrel(p[0]+RR(-1,1),p[1]+RR(-1,1));else crate(p[0]+RR(-1,1),p[1]+RR(-1,1));});
  [[-6,56],[6,58],[-16,70],[14,66],[18,70],[-12,80],[10,88],[-2,90],[26,70],[-26,68]].forEach(p=>addBreakable(p[0]+RR(-.6,.6),p[1]+RR(-.6,.6),R()<.65?'pot':'crate'));
  // village trees & hay bales
  for(let i=0;i<16;i++){const a=R()*TAU,r=RR(22,31),x=V.x+Math.cos(a)*r,z=V.z+Math.sin(a)*r;if(houseNear(x,z))continue;const t=new THREE.Group(),gy2=gh(x,z);t.position.set(x,gy2,z);t.add(cyl(.22,.34,2.4,mats.timber,0,1.2,0,6));const cr=new THREE.Mesh(new THREE.IcosahedronGeometry(2,1),MF(i%3===0?0xf0a8c0:0x5aa845));cr.position.y=3.6;cr.castShadow=true;t.add(cr);scene.add(t);addCircle(x,z,.5,'tree');}
  signpost(0,58,0,3);signpost(0,100,PI,1);
}
function houseNear(x,z){for(const b of world.boxes)if(Math.hypot(x-b.x,z-b.z)<b.hw+b.hd+3)return true;return Math.hypot(x,z-72)<14||Math.hypot(x+10,z-62)<4;}

function buildCamps(){
  CAMPS.forEach((c,i)=>{
    const r=gh(c.x,c.z);c.y=r;
    campfire(c.x,c.z,false);tent(c.x+5,c.z+2,.6,0x6a4a2a);tent(c.x-4,c.z+4,-.5,0x5a3a2a);
    for(let k=0;k<3;k++)addBreakable(c.x+RR(-6,6),c.z+RR(-6,6),R()<.5?'pot':'crate');
    for(let k=0;k<3;k++){const a=R()*TAU,x=c.x+Math.cos(a)*7,z=c.z+Math.sin(a)*7;const s=cyl(.07,.1,2.2,mats.timber,x,gh(x,z)+1.1,z,5);scene.add(s);const sk=new THREE.Mesh(new THREE.SphereGeometry(.18,7,6),M('#e8e0cc'));sk.position.set(x,gh(x,z)+2.3,z);scene.add(sk);}
    if(c.chest){const a=R()*TAU;chest(c.x+Math.cos(a)*5.5,c.z+Math.sin(a)*5.5,a+PI,'camp');}
  });
  // a few hidden chests
  [[-135,60],[60,-110],[150,40],[-20,150],[-60,-130],[10,-85]].forEach((p,i)=>{if(gh(p[0],p[1])>1.8)chest(p[0],p[1],R()*TAU,i%2?'coins':'potion');else{let x=p[0],z=p[1];for(let k=0;k<40&&gh(x,z)<1.8;k++){x*=.97;z*=.97;}chest(x,z,R()*TAU,'coins');}});
}


/* ---------- boss arenas ---------- */
let lavaU=null;
function buildArenas(){
  // === Moss Troll palisade (west) ===
  {const A=ARENAS.troll,gy=gh(A.x,A.z);campfire(A.x-6,A.z,true);
   for(let i=0;i<26;i++){const a=i*TAU/26;if(Math.abs(angDiff(a,0))<.32)continue;const x=A.x+Math.cos(a)*19,z=A.z+Math.sin(a)*19,y=gh(x,z),h=RR(4.5,6.5);
     const l=cyl(.42,.5,h,mats.plank,x,y+h/2-.3,z,7);scene.add(l);const tip=new THREE.Mesh(new THREE.ConeGeometry(.42,1.1,7),mats.plank);tip.position.set(x,y+h-.2,z);tip.castShadow=true;scene.add(tip);addCircle(x,z,.6,'palisade');}
   for(let i=0;i<4;i++){const a=PI*.5+i*.55+.35,x=A.x+Math.cos(a)*13,z=A.z+Math.sin(a)*13,y=gh(x,z);const p=cyl(.25,.35,5.5,mats.timber,x,y+2.7,z,6);scene.add(p);const sk=new THREE.Mesh(new THREE.SphereGeometry(.55,8,7),M('#e8e0cc'));sk.position.set(x,y+5.8,z);scene.add(sk);const hn=new THREE.Mesh(new THREE.ConeGeometry(.12,.8,5),M('#e8e0cc'));hn.position.set(x-.5,y+6.3,z);hn.rotation.z=.6;scene.add(hn);addCircle(x,z,.5,'totem');}
   tent(A.x-14,A.z-4,.2,0x5a4a2a);tent(A.x-13,A.z+7,-.3,0x4a5a2a);
   for(let i=0;i<5;i++)addBreakable(A.x+RR(-10,10),A.z+RR(-10,10),R()<.5?'pot':'crate');
   chest(A.x-9,A.z-9,.8,'potion');}
  // === Frost shrine ===
  {const A=ARENAS.frost,gy=gh(A.x,A.z);
   const base=cyl(11,12,.6,mats.stone,A.x,gy+.1,A.z,28);scene.add(base);base.receiveShadow=true;
   const ring=new THREE.Mesh(new THREE.TorusGeometry(8,.12,6,48),new THREE.MeshBasicMaterial({color:0x7fe0ff,fog:false}));ring.rotation.x=-PI/2;ring.position.set(A.x,gy+.45,A.z);scene.add(ring);world.animated.push(dt=>{ring.material.color.setHSL(.54,.9,.6+Math.sin(performance.now()*.003)*.12);});
   const ic=new THREE.MeshStandardMaterial({color:0x9fe8ff,emissive:0x2a9fd0,emissiveIntensity:.8,roughness:.1,metalness:.2,transparent:true,opacity:.88,flatShading:true});mats.ice=ic;
   for(let i=0;i<16;i++){const a=i*TAU/16+RR(-.1,.1),r=RR(13,19),x=A.x+Math.cos(a)*r,z=A.z+Math.sin(a)*r,h=RR(3,8);const m=new THREE.Mesh(new THREE.ConeGeometry(RR(.7,1.4),h,5),ic);m.position.set(x,gh(x,z)+h/2-.3,z);m.rotation.set(RR(-.2,.2),R()*TAU,RR(-.2,.2));m.castShadow=true;scene.add(m);addCircle(x,z,.9,'ice');}
   for(let i=0;i<4;i++){const a=i*PI/2+PI/4,x=A.x+Math.cos(a)*9.5,z=A.z+Math.sin(a)*9.5,y=gh(x,z);scene.add(cyl(.9,1.1,6,mats.stone,x,y+3,z,8));const g=new THREE.Mesh(new THREE.OctahedronGeometry(.6,0),new THREE.MeshBasicMaterial({color:0x8fe8ff,fog:false}));g.position.set(x,y+6.8,z);scene.add(g);world.animated.push(dt=>{g.rotation.y+=dt;g.position.y=y+6.8+Math.sin(performance.now()*.002+i)*.2;});addCircle(x,z,1.1,'pillar');}
   chest(A.x+4,A.z+12,PI,'coins');}
  // === Ember crater ===
  {const A=ARENAS.magma;lavaU={t:{value:0}};
   const lm=new THREE.ShaderMaterial({uniforms:lavaU,vertexShader:'varying vec2 vU;void main(){vU=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
     fragmentShader:'uniform float t;varying vec2 vU;void main(){float a=sin(vU.x*1.7+t*.7)+sin(vU.y*2.1-t*.9)+sin((vU.x+vU.y)*1.3+t*.5)+sin(length(vU)*3.1-t*1.2);a=a*.25+.5;vec3 c=mix(vec3(.55,.05,0.),vec3(1.,.55,.05),smoothstep(.2,.8,a));c=mix(c,vec3(1.,.9,.35),smoothstep(.75,1.,a));gl_FragColor=vec4(c,1.);}'});
   [[ -15,13,4.6],[17,10,5.2],[3,-20,5],[-8,-17,3.6],[22,-8,4]].forEach(p=>{const x=A.x+p[0],z=A.z+p[1],y=gh(x,z);const d=new THREE.Mesh(new THREE.CircleGeometry(p[2],20),lm);d.rotation.x=-PI/2;d.position.set(x,Math.max(y,5.5)+.12,z);scene.add(d);addCircle(x,z,p[2]*.82,'lava');world.lava=world.lava||[];world.lava.push({x,z,r:p[2]});});
   const ob=new THREE.MeshStandardMaterial({color:0x1c1618,roughness:.25,metalness:.55,emissive:0x2a0600,flatShading:true});
   for(let i=0;i<20;i++){const a=i*TAU/20+RR(-.1,.1),r=RR(22,27),x=A.x+Math.cos(a)*r,z=A.z+Math.sin(a)*r,h=RR(4,10);const m=new THREE.Mesh(new THREE.ConeGeometry(RR(.8,1.6),h,5),ob);m.position.set(x,gh(x,z)+h/2-.4,z);m.rotation.set(RR(-.2,.2),R()*TAU,RR(-.2,.2));m.castShadow=true;scene.add(m);addCircle(x,z,1,'spike');}
   for(let i=0;i<6;i++){const a=R()*TAU,r=RR(6,14),x=A.x+Math.cos(a)*r,z=A.z+Math.sin(a)*r;addBreakable(x,z,'pot');}
   chest(A.x-10,A.z-16,0,'potion');}
  // === Hollow (final) ===
  {const A=ARENAS.hollow,gy=gh(A.x,A.z);
   const plat=cyl(14,15,.5,mats.stone,A.x,gy+.1,A.z,36);plat.receiveShadow=true;scene.add(plat);
   const rn=new THREE.MeshBasicMaterial({color:0x7fd8ff,fog:false});
   for(let i=0;i<10;i++){const a=PI/2+i*TAU/10+.3,x=A.x+Math.cos(a)*18,z=A.z+Math.sin(a)*18;if(Math.abs(angDiff(a,PI/2))<.3)continue;const y=gh(x,z),h=RR(7,11);
     scene.add(cyl(1.5,1.9,h,mats.stone,x,y+h/2,z,9));const cap=box(3.6,.7,3.6,mats.stone,x,y+h+.2,z);scene.add(cap);const r1=new THREE.Mesh(new THREE.PlaneGeometry(.5,3),rn);r1.position.set(x-Math.cos(a)*1.55,y+h*.55,z-Math.sin(a)*1.55);r1.lookAt(A.x,y+h*.55,A.z);r1.rotation.y+=PI;scene.add(r1);addCircle(x,z,2,'pillar');}
   // altar with 3 shard sockets
   scene.add(cyl(3.2,3.6,1,mats.stone,A.x,gy+.5,A.z,10));scene.add(cyl(1.2,1.6,2.4,mats.stone,A.x,gy+1.8,A.z,8));addCircle(A.x,A.z,2.6,'altar');
   world.sockets=[];['#6fe06a','#7fdcff','#ff7a3a'].forEach((cl,i)=>{const a=i*TAU/3+PI/2,x=A.x+Math.cos(a)*1.25,z=A.z+Math.sin(a)*1.25;const m=new THREE.Mesh(new THREE.OctahedronGeometry(.34,0),new THREE.MeshBasicMaterial({color:0x2a2a2a,fog:false}));m.scale.y=1.5;m.position.set(x,gy+3.4,z);scene.add(m);world.sockets.push({m,col:cl,lit:false,y:gy+3.4});});
   // gate
   const gx=A.x,gz=A.z+17,gy2=gh(gx,gz);const gate=new THREE.Group();gate.position.set(gx,gy2,gz);
   const gm=new THREE.MeshStandardMaterial({color:0x7a7770,roughness:.9,flatShading:true});
   const gd=new THREE.Mesh(new THREE.BoxGeometry(8.6,8,1.4),gm);gd.position.y=4;gd.castShadow=true;gate.add(gd);
   const sym=new THREE.Mesh(new THREE.CircleGeometry(1.5,24),new THREE.MeshBasicMaterial({color:0x7fd8ff,fog:false,transparent:true,opacity:.85}));sym.position.set(0,4.5,.72);gate.add(sym);
   scene.add(gate);world.gate={g:gate,box:{x:gx,z:gz,hw:4.4,hd:.9,rot:0},open:0,y0:gy2};addBox(gx,gz,4.4,.9,0);world.gateBoxRef=world.boxes[world.boxes.length-1];
   world.gate.sym=sym;
   for(let i=0;i<6;i++){const a=R()*TAU,r=RR(20,28),x=A.x+Math.cos(a)*r,z=A.z+Math.sin(a)*r;if(gh(x,z)>1.5){const rb=new THREE.Mesh(new THREE.DodecahedronGeometry(RR(.6,1.4),0),mats.stone);rb.position.set(x,gh(x,z)+.3,z);rb.castShadow=true;scene.add(rb);}}
   signpost(0,-2,PI,1);}
  // Pier on southern coast
  {let pz=140;for(;pz<190&&gh(20,pz)>.2;pz+=1);const px=20;for(let i=0;i<14;i++){const z=pz-6+i*1.6;scene.add(box(2.4,.18,1.7,mats.plank,px,.9,z,false));if(i%3===0){scene.add(cyl(.14,.14,2.4,mats.timber,px-1.1,.1,z,6));scene.add(cyl(.14,.14,2.4,mats.timber,px+1.1,.1,z,6));}}
   const boat=new THREE.Group();boat.position.set(px+4,.1,pz+8);const hull=new THREE.Mesh(new THREE.BoxGeometry(2,.8,5),mats.plank);hull.castShadow=true;boat.add(hull);boat.add(box(.1,3.4,.1,mats.timber,0,2,.5));boat.add(box(1.7,2.4,.05,M('#eadfc4'),.0,2.3,.5));scene.add(boat);world.animated.push(dt=>{boat.position.y=.15+Math.sin(performance.now()*.0016)*.12;boat.rotation.z=Math.sin(performance.now()*.0011)*.05;});}
}

/* ================= open world: towers, horses, sprites, fast travel ================= */
const OW={towers:[],horses:[],sprites:[],way:[],nSprites:0};
function owSpotOK(x,z,lo,hi){
  const h=gh(x,z);if(h<lo||h>hi)return false;
  let mn=1e9,mx=-1e9;for(const [a,b] of [[-3,-3],[3,-3],[-3,3],[3,3],[0,0]]){const q=gh(x+a,z+b);mn=Math.min(mn,q);mx=Math.max(mx,q);}
  if(mx-mn>2.6)return false;if(houseNear(x,z))return false;
  for(const c of CAMPS)if(Math.hypot(x-c.x,z-c.z)<14)return false;
  if(Math.hypot(x-CRT.x,z-CRT.z)<30)return false;
  return true;
}
function owFind(x,z,lo,hi){for(let r=0;r<80;r+=3){for(let k=0;k<12;k++){const a=k*TAU/12+r,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;if(Math.hypot(px,pz)<178&&owSpotOK(px,pz,lo,hi))return[px,pz];}}return[x,z];}
function buildTower(def){
  const [x,z]=owFind(def.x,def.z,3,22);
  let mn=1e9,mx=-1e9;for(const [a,b] of [[-2.4,-2.4],[2.4,-2.4],[-2.4,2.4],[2.4,2.4]]){const q=gh(x+a,z+b);mn=Math.min(mn,q);mx=Math.max(mx,q);}
  const top=mx+15,g=new THREE.Group();g.position.set(x,0,z);
  const stone=M('#9c8f86'),dark=M('#6e6458'),wood=M('#8a5a36');
  const sh=top-(mn-2);g.add(box(4.4,sh,4.4,stone,0,mn-2+sh/2,0));
  for(let i=0;i<5;i++)g.add(box(4.7,.35,4.7,dark,0,mn+2+i*3.1,0));
  g.add(box(5,.5,5,dark,0,top-.25,0));
  for(const sx of[-1,1])for(const sz of[-1,1])g.add(box(.3,1.6,.3,wood,sx*2.3,top+.8,sz*2.3));
  for(const sz of[-1,1]){g.add(box(4.9,.18,.18,wood,0,top+1.4,sz*2.3));g.add(box(.18,.18,4.9,wood,sz*2.3,top+1.4,0));}
  // ladder look (grip rungs)
  const lz=2.25;for(let y=mn+.5;y<top-.5;y+=.9)g.add(box(1.2,.12,.18,wood,0,y,lz+.05));
  for(const sx of[-.6,.6])g.add(box(.12,top-mn,.16,wood,sx,(top+mn)/2,lz+.04));
  const orb=new THREE.Mesh(new THREE.SphereGeometry(.4,10,8),new THREE.MeshBasicMaterial({color:0x7fd8ff}));orb.position.set(1.4,top+3.7,1.4);g.add(orb);
  const pole=cyl(.07,.07,3.2,wood,0,top+1.6,0,5);pole.position.set(1.4,top+1.8,1.4);g.add(pole);
  const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.5,.9),new THREE.MeshBasicMaterial({color:0xff6a2a,side:THREE.DoubleSide}));flag.position.set(2.2,top+3.1,1.4);g.add(flag);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,.9,70,10,1,true),new THREE.MeshBasicMaterial({color:0x7fd8ff,transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));beam.position.set(1.4,top+35,1.4);g.add(beam);
  scene.add(g);
  const b=addBox(x,z,2.3,2.3,0,top);
  const tw={id:'tw'+OW.towers.length,name:def.n,x,z,top,on:false,orb,beam,g,flag,box:b};
  world.interact.push({kind:'tower',x,z,y:top,prompt:'Light the watchtower beacon',tw});
  OW.towers.push(tw);
  const a=Math.atan2(VILLAGE.x-x,VILLAGE.z-z);tw.sx=x+Math.sin(a)*4.8;tw.sz=z+Math.cos(a)*4.8;
  return tw;
}
function buildHorse(def){
  const [x,z]=owFind(def.x,def.z,2,14);
  const g=new THREE.Group(),coat=M(def.c||'#8a5a36'),dk=M('#3a2418'),sad=M('#b02a2a'),leather=M('#5a3a22'),light=M('#e8dcc8'),gold=M('#d8b050');
  const part=(geo,mat,x,y,z,rx=0,ry=0,rz=0,par=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;par.add(m);return m;};
  // barrel body, chest and rump
  part(new THREE.CylinderGeometry(.5,.5,1.7,10),coat,0,1.6,0,PI/2,0,0).scale.set(1,1,1.05);
  part(new THREE.SphereGeometry(.56,10,8),coat,0,1.62,.85).scale.set(.95,1.05,1);
  part(new THREE.SphereGeometry(.55,10,8),coat,0,1.65,-.85).scale.set(.95,1.05,1.1);
  part(new THREE.CylinderGeometry(.42,.46,.5,8),coat,0,1.3,0,PI/2,0,0).scale.set(.9,1,.7); // belly
  // neck & head
  part(new THREE.CylinderGeometry(.24,.4,1.05,8),coat,0,2.35,1.18,.64,0,0);
  part(new THREE.CylinderGeometry(.13,.2,.74,8),coat,0,2.62,1.82,2.0,0,0);
  part(new THREE.SphereGeometry(.14,8,6),dk,0,2.43,2.18).scale.set(1,.85,1.1);
  part(new THREE.SphereGeometry(.07,6,5),dk,.1,2.6,2.0); part(new THREE.SphereGeometry(.07,6,5),dk,-.1,2.6,2.0);
  for(const sx of[-1,1]){part(new THREE.ConeGeometry(.055,.2,5),coat,sx*.1,2.98,1.5,-.25,0,-sx*.12);part(new THREE.SphereGeometry(.035,5,4),new THREE.MeshBasicMaterial({color:0x140c08}),sx*.135,2.78,1.78);}
  part(new THREE.BoxGeometry(.07,.38,.1),light,0,2.62,1.9,2.0,0,0); // blaze
  // bridle
  part(new THREE.TorusGeometry(.14,.012,4,12),leather,0,2.55,2.0,0,PI/2,0).scale.set(1,1,1);
  part(new THREE.BoxGeometry(.03,.5,.03),leather,0,2.62,1.62,2.0,0,0);
  part(new THREE.SphereGeometry(.03,5,4),gold,.14,2.52,2.02); part(new THREE.SphereGeometry(.03,5,4),gold,-.14,2.52,2.02);
  // saddle: blanket, seat, pommel, stirrups
  part(new THREE.BoxGeometry(1.08,.06,.95),sad,0,2.1,-.05);
  part(new THREE.BoxGeometry(.52,.14,.7),leather,0,2.2,-.05);
  part(new THREE.SphereGeometry(.14,7,5),leather,0,2.28,.3).scale.set(1,.7,.8); part(new THREE.SphereGeometry(.14,7,5),leather,0,2.3,-.38).scale.set(1.2,.8,.7);
  for(const sx of[-1,1]){part(new THREE.BoxGeometry(.03,.55,.03),leather,sx*.55,1.85,-.05);part(new THREE.TorusGeometry(.07,.014,4,8),gold,sx*.55,1.55,-.05,0,PI/2,0);}
  // legs: thigh, cannon, fetlock, hoof
  const legs=[];for(const [sx,sz] of[[-.32,.85],[.32,.85],[-.32,-.85],[.32,-.85]]){const p=new THREE.Group();p.position.set(sx,1.2,sz);
    part(new THREE.CylinderGeometry(.14,.1,.62,7),coat,0,-.28,0,0,0,0,p);part(new THREE.SphereGeometry(.1,6,5),coat,0,-.58,0,0,0,0,p);
    part(new THREE.CylinderGeometry(.065,.06,.45,6),coat,0,-.78,0,0,0,0,p);part(new THREE.CylinderGeometry(.075,.075,.08,6),light,0,-1.0,0,0,0,0,p);
    part(new THREE.CylinderGeometry(.09,.11,.14,7),dk,0,-1.1,0,0,0,0,p);g.add(p);legs.push(p);}
  // cloth: mane + tail (soft simulated)
  const mm=TOON({color:new THREE.Color(0x2a1810),side:THREE.DoubleSide});mm.gradientMap=TGS;
  const mg=new THREE.Group();mg.position.set(0,2.62,1.05);mg.rotation.x=.64;g.add(mg);
  const mane=makeWaver(1.0,.34,5,3,mm,.05,3,1.3);mane.mesh.rotation.y=PI/2;mane.mesh.position.set(.0,-.17,0);mane.wind=.9;mane.lift=.4;mg.add(mane.mesh);
  const tg=new THREE.Group();tg.position.set(0,1.95,-1.25);tg.rotation.x=.25;g.add(tg);
  const tail=makeWaver(.34,1.25,3,7,mm,.1,2.4,.4);tail.mesh.rotation.y=PI/2;tail.mesh.position.set(0,-.62,0);tail.wind=.8;tail.lift=.5;tg.add(tail.mesh);
  const cl={root:g,wavers:[mane,tail],anim:[],lift:0};
  const y=gh(x,z);g.position.set(x,y,z);g.rotation.y=Math.atan2(VILLAGE.x-x,VILLAGE.z-z)+RR(-1,1);scene.add(g);
  const h={x,z,y,yaw:g.rotation.y,g,legs,ph:0,mounted:false,cl};OW.horses.push(h);
  {const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3));h.rein=new THREE.LineSegments(rg,new THREE.LineBasicMaterial({color:0x5a2e18}));h.rein.frustumCulled=false;h.rein.visible=false;scene.add(h.rein);}
  world.interact.push({kind:'horse',x,z,prompt:'Mount horse',h,get x(){return h.x},get z(){return h.z}});
}
function buildSprites(){
  const geo=new THREE.IcosahedronGeometry(.34,0),hg=new THREE.SphereGeometry(.75,8,6);
  const mCore=new THREE.MeshBasicMaterial({color:0xffe27a}),mHalo=new THREE.MeshBasicMaterial({color:0xffa83a,transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const mC2=new THREE.MeshBasicMaterial({color:0xaef0ff}),mH2=new THREE.MeshBasicMaterial({color:0x5ac8ff,transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const spots=[];
  world.roofs.slice(0,9).forEach(r=>spots.push([r.x,r.z,r.y+1.3,1]));
  OW.towers.forEach(t=>spots.push([t.x,t.z,t.top+2.6,2]));
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  let tries=0;
  while(spots.length<36&&tries<4000){tries++;
    const a=rnd()*TAU,r=20+rnd()*155,x=Math.cos(a)*r,z=Math.sin(a)*r,h=gh(x,z);
    if(h<2.4||h>40||houseNear(x,z))continue;if(Math.hypot(x-CRT.x,z-CRT.z)<18)continue;
    const high=spots.length%2===0;if(high&&h<12&&tries<2500)continue;
    let ok=true;for(const s of spots)if(Math.hypot(s[0]-x,s[1]-z)<22){ok=false;break;}
    if(ok)spots.push([x,z,h+1.5,0]);
  }
  spots.forEach((s,i)=>{
    const m=new THREE.Group(),c=new THREE.Mesh(geo,s[3]===2?mC2:mCore),hl=new THREE.Mesh(hg,s[3]===2?mH2:mHalo);m.add(c,hl);m.position.set(s[0],s[2],s[1]);scene.add(m);
    OW.sprites.push({id:i,x:s[0],y:s[2],z:s[1],m,c,got:false});
  });
  OW.nSprites=OW.sprites.length;
}
function buildOpenWorld(){
  [{n:'Mosswood Watch',x:-95,z:28},{n:'Frostpeak Watch',x:-5,z:-82},{n:'Hollow Watch',x:48,z:-48},{n:'Coast Watch',x:128,z:58},{n:'Southern Watch',x:-25,z:140},{n:'Highland Watch',x:-130,z:-40}].forEach(buildTower);
  [{x:16,z:68,c:'#8a5a36'},{x:-60,z:34,c:'#d8d0c0'},{x:70,z:-30,c:'#3a2a22'},{x:-20,z:118,c:'#a8743a'},{x:100,z:70,c:'#6a6a70'},{x:-110,z:-10,c:'#8a5a36'}].forEach(buildHorse);
  buildSprites();
  world.animated.push(updateOpenWorld);
}
function owApply(s){
  const ss=new Set(s&&s.sprites||[]),tt=new Set(s&&s.towers||[]);
  for(const p of OW.sprites){p.got=ss.has(p.id);p.m.visible=!p.got;}
  for(const t of OW.towers){t.on=tt.has(t.id);owPaintTower(t);}
  OW.count=OW.sprites.filter(p=>p.got).length;
  game.sprBonus=Math.floor(OW.count/6);
  if(game.player)game.player.mount=null;for(const h of OW.horses)h.mounted=false;
  const e=$('sprites');if(e)e.textContent=OW.count+'/'+OW.nSprites;
}
function owPaintTower(t){t.orb.material.color.setHex(t.on?0xffc23a:0x7fd8ff);t.beam.material.color.setHex(t.on?0xffa83a:0x7fd8ff);t.beam.material.opacity=t.on?.3:.14;t.flag.visible=true;}
function activateTower(o){
  const t=o.tw;if(t.on)return;t.on=true;owPaintTower(t);netSend({t:'tower',id:t.id});sfx('bell');cam.shake=Math.max(cam.shake,.3);
  burst(t.x,t.top+1.5,t.z,0xffc23a,40,6,1,.2,1);toast('Watchtower lit: '+t.name+' (fast travel with M, then number keys)',3.4);
  game.pops.push({x:t.x,y:t.top+2,z:t.z,txt:'+60 XP',col:'#ffd24a',t:0,big:true});addXP(60);saveGame();
}
function owWaypoints(){const w=[{n:'Emberfall Village',x:0,z:80,v:true}];for(const t of OW.towers)if(t.on)w.push({n:t.name,x:t.sx,z:t.sz,t});return w;}
function fastTravel(i){
  const w=owWaypoints()[i],P=game.player;if(!w||P.dead)return;
  if(game.boss&&game.boss.state!=='dead'&&game.boss.awake&&Math.hypot(game.boss.x-P.x,game.boss.z-P.z)<45){toast('Cannot travel during a boss fight',2);return;}
  P.mount&&dismount();
  cam.mapOpen=false;P.x=w.x;P.z=w.z;P.y=gh(w.x,w.z);P.vx=P.vz=0;P.vy=0;P.state='free';P.iT=1;cam.init=false;game.lock=null;
  const a=Math.atan2(VILLAGE.x-w.x,VILLAGE.z-w.z);if(w.t)cam.yaw=Math.atan2(w.t.x-w.x,w.t.z-w.z)+PI;
  fadeIn();toast('Arrived: '+w.n,2);sfx('bell');
}
function mount(h){const P=game.player;if(P.mount||P.dead||P.swim)return;
  const drv=remoteRider(h,0);
  if(drv){if(remoteRider(h,1)){toast('No room on this horse',1.6);return;}P.mount=h;P.seat=1;sfx('land');toast('Riding behind '+drv.name+'. '+(touchDev?'TALK':'E')+' to hop off',2.4);return;}
  P.mount=h;P.seat=0;h.mounted=true;sfx('land');toast('Mounted: gallop with '+(touchDev?'the stick pushed to the edge':'Shift')+'. '+(touchDev?'TALK':'E')+' to dismount',2.4);}
function dismount(){const P=game.player,h=P.mount;if(!h)return;
  if(P.seat===1){P.mount=null;P.seat=0;P.x+=Math.cos(P.yaw)*1.5;P.z-=Math.sin(P.yaw)*1.5;P.y=gh(P.x,P.z);collideXZ(P,.45);return;}
  h.mounted=false;h.x=P.x+Math.cos(P.yaw)*1.6;h.z=P.z-Math.sin(P.yaw)*1.6;h.y=gh(h.x,h.z);h.yaw=P.yaw;P.mount=null;}
function updateOpenWorld(dt){
  const P=game.player;if(!P)return;
  if(P.mount&&(P.swim||P.dead))dismount();
  for(const h of OW.horses){
    const rd=h.mounted?null:remoteRider(h,0);h.rspd=0;
    if(h.mounted){h.x=P.x;h.z=P.z;h.y=P.y;h.yaw=P.yaw;h.ph+=dt*(4+Math.hypot(P.vx,P.vz)*1.1);}
    else if(rd&&rd.d){h.x=rd.d.x;h.z=rd.d.z;h.y=rd.d.y;h.yaw=rd.d.yaw;h.rspd=Math.hypot(rd.vx||0,rd.vz||0);h.ph+=dt*(4+h.rspd*1.1);}
    else{h.y=gh(h.x,h.z);h.ph+=dt*.0;}
    const near=Math.abs(h.x-P.x)<95&&Math.abs(h.z-P.z)<95;h.g.visible=near;
    if(!near)continue;
    h.g.position.set(h.x,h.y+(h.mounted?0:0),h.z);h.g.rotation.y=h.yaw;
    const sp=h.mounted?clamp(Math.hypot(P.vx,P.vz)/12,0,1.4):clamp(h.rspd/12,0,1.4);
    h.legs.forEach((l,i)=>{l.rotation.x=Math.sin(h.ph+(i%2?0:PI)+(i>1?PI*.5:0))*.85*sp;});
    if(h.cl)updateWavers(h.cl,game.time,sp);
    h.g.position.y+=Math.sin(game.time*1.6+h.x)*.01+(h.mounted||h.rspd?Math.abs(Math.sin(h.ph))*.12*sp:0);
  }
  for(const t of OW.towers){
    const near=Math.abs(t.x-P.x)<150&&Math.abs(t.z-P.z)<150;t.beam.visible=near&&Math.hypot(t.x-P.x,t.z-P.z)>9;
    if(near){t.orb.scale.setScalar(1+Math.sin(game.time*3+t.x)*.12);t.flag.rotation.y=Math.sin(game.time*2)*.35;t.beam.material.opacity=(t.on?.28:.13)*(.85+Math.sin(game.time*2)*.15);}
  }
  let cnt=0;
  for(const p of OW.sprites){
    if(p.got){cnt++;continue;}
    const dx=p.x-P.x,dz=p.z-P.z;
    if(Math.abs(dx)>85||Math.abs(dz)>85){p.m.visible=false;continue;}
    p.m.visible=true;p.c.rotation.y+=dt*2;p.m.position.y=p.y+Math.sin(game.time*2.2+p.id)*.22;
    const d=Math.hypot(dx,dz);
    if(d<1.9&&Math.abs(p.y-(P.y+1))<2.6&&!P.dead){p.got=true;p.m.visible=false;cnt++;sfx('heal');burst(p.x,p.y,p.z,0xffe27a,26,4,.9,.16,1);
      OW.count=cnt;const e=$('sprites');if(e)e.textContent=cnt+'/'+OW.nSprites;
      if(cnt%6===0||cnt===OW.nSprites){P.maxhp+=10;P.hp=P.maxhp;P.maxst+=6;P.st=P.maxst;game.sprBonus=Math.floor(cnt/6);toast('Ember Sprite blessing! Max health and stamina rise ('+cnt+'/'+OW.nSprites+')',3.4);sfx('bell');}
      else toast('Ember Sprite '+cnt+'/'+OW.nSprites,1.4);
      dmgNum(p.x,p.y+.6,p.z,'+1 Sprite','#ffe27a',false);addXP(8);saveGame();
    }
  }
}

/* ================= ancient ruins (carved-stone temple style) ================= */
function glyphTex(kind){
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
  if(kind==='stone'||kind==='tile'){
    x.fillStyle=kind==='tile'?'#9a8e78':'#948a7c';x.fillRect(0,0,128,128);
    for(let i=0;i<260;i++){x.fillStyle='rgba('+(R()<.5?'60,52,40':'200,190,165')+','+(.05+R()*.08)+')';x.fillRect(R()*128,R()*128,2+R()*6,2+R()*6);}
    x.strokeStyle='rgba(50,42,32,.75)';x.lineWidth=5;x.lineCap='round';
    if(kind==='tile'){x.strokeRect(4,4,120,120);x.beginPath();x.moveTo(64,4);x.lineTo(64,124);x.moveTo(4,64);x.lineTo(124,64);x.stroke();x.beginPath();for(let a=0;a<12;a+=.2){const r=2+a*4.6;x.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r);}x.stroke();}
    else{x.beginPath();for(let a=0;a<11;a+=.2){const r=3+a*4.8;x.lineTo(64+Math.cos(a)*r,44+Math.sin(a)*r*.9);}x.stroke();x.strokeRect(14,92,100,22);x.beginPath();x.moveTo(14,103);x.lineTo(114,103);x.stroke();}
    x.strokeStyle='rgba(235,225,200,.35)';x.lineWidth=2;x.strokeRect(1,1,126,126);
  }else{ // glowing glyph (transparent)
    x.clearRect(0,0,128,128);x.strokeStyle='#8ff0ff';x.lineWidth=7;x.lineCap='round';x.shadowColor='#3ad0ff';x.shadowBlur=14;
    x.beginPath();for(let a=0;a<12;a+=.2){const r=3+a*4.7;x.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r);}x.stroke();
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
const RUINS=[];
function buildRuins(){
  const stoneT=glyphTex('stone'),tileT=glyphTex('tile'),glowT=glyphTex('glow');
  const stone=M('#a89c88'),dark=M('#6c6258'),moss=M('#5fa04a'),mossD=M('#3f7a3a'),warm=new THREE.MeshBasicMaterial({color:0xffc060,fog:false});
  const halo=new THREE.MeshBasicMaterial({color:0xff9a3a,transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const pilM=TOON({color:0xffffff,map:stoneT}),tileM=TOON({color:0xffffff,map:tileT});
  const glowM=new THREE.MeshBasicMaterial({map:glowT,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,side:THREE.DoubleSide});
  const shaftM=new THREE.MeshBasicMaterial({color:0xffe2a0,transparent:true,opacity:.1,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.DoubleSide});
  const mm=TOON({vertexColors:true});
  const sites=[[-32,38],[-104,44],[16,-28],[84,84],[-44,120],[-70,-52],[40,-98]];
  sites.forEach((s,idx)=>{
    const [x,z]=owFind(s[0],s[1],2.5,18);
    let mn=1e9,mx=-1e9;for(const [a,b] of[[-6,-6],[6,-6],[-6,6],[6,6],[0,0]]){const q=gh(x+a,z+b);mn=Math.min(mn,q);mx=Math.max(mx,q);}
    const base=mx,rot=Math.atan2(VILLAGE.x-x,VILLAGE.z-z)+(idx%2?.4:-.3),g=new THREE.Group();g.position.set(x,base,z);g.rotation.y=rot;
    const S=(w,h,d,mat,px,py,pz)=>{const m=box(w,h,d,mat,px,py,pz);g.add(m);return m;};
    const wp=(lx,lz)=>[x+lx*Math.cos(rot)+lz*Math.sin(rot),z-lx*Math.sin(rot)+lz*Math.cos(rot)];
    // foundation + steps
    S(12.4,base-mn+2,12.4,dark,0,-(base-mn+2)/2+.02,0);
    S(12,.4,12,stone,0,.2,0);S(8.6,.4,8.6,stone,0,.6,0);
    const pl=new THREE.Mesh(new THREE.PlaneGeometry(8.4,8.4),tileM);pl.rotation.x=-PI/2;pl.position.y=.81;pl.receiveShadow=true;g.add(pl);
    addBox(x,z,6,6,rot,base+.4);addBox(x,z,4.3,4.3,rot,base+.8);
    // pillars
    const broken=idx%3===1;
    [[-3.5,-3.5],[3.5,-3.5],[-3.5,3.5],[3.5,3.5]].forEach(([lx,lz],i)=>{
      const h=(broken&&i%2)?2.6:4.8,p=S(1.1,h,1.1,pilM,lx,.8+h/2,lz);p.material=pilM;
      S(1.4,.35,1.4,stone,lx,.8+h+.15,lz);S(1.4,.35,1.4,stone,lx,1.0,lz);
      const mo=S(1.2,.25,1.2,moss,lx+.1,.8+h+.4,lz-.1);mo.scale.y=.8;
      if(!(broken&&i%2)){S(.22,.22,.22,warm,lx,.8+h-.5,lz+(lz>0?.7:-.7));const hl=new THREE.Mesh(new THREE.SphereGeometry(.65,8,6),halo);hl.position.set(lx,.8+h-.5,lz+(lz>0?.7:-.7));g.add(hl);}
      const w=wp(lx,lz);addCircle(w[0],w[1],.85,'pillar');
    });
    if(!broken){S(8.2,.8,1.3,stone,0,.8+4.8+.65,-3.5);S(8.2,.8,1.3,stone,0,.8+4.8+.65,3.5);}
    // monolith
    const mo=new THREE.Mesh(new THREE.IcosahedronGeometry(1.5,1),pilM);mo.scale.set(.85,1.45,.7);mo.position.set(0,2.5,-.6);mo.castShadow=true;mo.receiveShadow=true;g.add(mo);
    const gl=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.5),glowM);gl.position.set(0,2.8,.2);g.add(gl);
    const mw=wp(0,-.6);addCircle(mw[0],mw[1],1.4,'monolith');
    // moss + rubble
    for(let i=0;i<7;i++){const m=S(.5+R()*.8,.18,.5+R()*.8,R()<.5?moss:mossD,RR(-5.5,5.5),.84+(R()<.3?.0:0),RR(-5.5,5.5));m.scale.y=1;m.position.y=.88;}
    for(let i=0;i<8;i++){const a=R()*TAU,r=6.4+R()*1.8,m=S(.4+R()*.5,.35+R()*.3,.4+R()*.5,R()<.6?stone:dark,Math.cos(a)*r,.2,Math.sin(a)*r);m.rotation.set(R(),R()*TAU,R());m.position.y=gh(...wp(Math.cos(a)*r,Math.sin(a)*r))-base+.15;}
    mergeBucket(g,mm);
    // light shafts
    const sh=[];for(let i=0;i<3;i++){const p=new THREE.Mesh(new THREE.PlaneGeometry(1.6+i*.5,16),shaftM);p.position.set(-2+i*2.2,8,-2+i);p.rotation.set(0,i*.9,.38);g.add(p);sh.push(p);}
    scene.add(g);
    // reward chest in front
    RUINS.push({x,z,base,g,sh,gl,cp:wp(0,8.3),rot});
  });
  // carved boulders
  let seed=11;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const bm=M('#9d9384'),rockMoss=M('#58a048');let n=0,tries=0;
  while(n<22&&tries<800){tries++;const a=rnd()*TAU,r=15+rnd()*160,x=Math.cos(a)*r,z=Math.sin(a)*r,h=gh(x,z);
    if(h<2||h>30||houseNear(x,z)||Math.hypot(x-CRT.x,z-CRT.z)<26)continue;
    const s=1.4+rnd()*1.8,gr=new THREE.Group();gr.position.set(x,h,z);gr.rotation.y=rnd()*TAU;
    const b=new THREE.Mesh(new THREE.IcosahedronGeometry(s,1),rnd()<.6?pilM:bm);b.scale.set(1,.8,.9);b.position.y=s*.4;b.castShadow=true;b.receiveShadow=true;gr.add(b);
    const m=new THREE.Mesh(new THREE.SphereGeometry(s*.8,7,5),rockMoss);m.scale.set(1,.28,.9);m.position.y=s*1.0;gr.add(m);
    if(rnd()<.4){const gl=new THREE.Mesh(new THREE.PlaneGeometry(s,s),glowM);gl.position.set(0,s*.5,s*.88);gr.add(gl);}
    scene.add(gr);addCircle(x,z,s*.95,'boulder');n++;}
  world.animated.push(updateRuins);
}
function buildRuinChests(){for(const r of RUINS)chest(r.cp[0],r.cp[1],r.rot,'camp');}
function updateRuins(dt){
  const P=game.player;if(!P)return;
  const day=clamp(1-light.night*1.2,0,1);
  for(const r of RUINS){
    const near=Math.abs(r.x-P.x)<110&&Math.abs(r.z-P.z)<110;
    for(let i=0;i<r.sh.length;i++){const s=r.sh[i];s.visible=near&&day>.05;if(near)s.material.opacity=.1*day;}
    if(near)r.gl.material.opacity=.7+Math.sin(game.time*2)*.25;
  }
}

/* ================= living world: chop, forage, fish, cook, rest, emote, weather ================= */
const TREES=[],FALL=[],FORAGE=[],WX={rain:0,target:0,next:140,drops:null};
const EMOTES={KeyZ:'wave',KeyC:'dance',KeyB:'cheer',KeyX:'sit'};
function invDefault(){return {wood:0,fish:0,cooked:0,berry:0,mush:0};}
function invHud(){const i=game.inv||invDefault();for(const k of['wood','fish','cooked','berry','mush']){const e=$('i_'+k);if(e)e.textContent=i[k]||0;}}
function addInv(k,n){game.inv=game.inv||invDefault();game.inv[k]=(game.inv[k]||0)+n;invHud();}
/* ---- chopping (sword swings fell trees) ---- */
function owChop(){
  const P=game.player;if(P.mount)return;let best=null,bd=2.7;
  for(const t of TREES){if(t.dead)continue;const dx=t.x-P.x,dz=t.z-P.z,d=Math.hypot(dx,dz);if(d>bd)continue;
    const ang=Math.abs(angDiff(P.yaw,Math.atan2(dx,dz)));if(ang>1.1)continue;bd=d;best=t;}
  if(!best)return;const t=best;t.hp--;cam.shake=Math.max(cam.shake,.12);sfx('smash');
  burst(t.x,P.y+1.2,t.z,0xc8a070,8,3,.5,.1);burst(t.x,P.y+2.4,t.z,0x5a9a3a,6,2.5,.8,.14);
  const k=t.sx;t.shake=.25;
  if(t.hp<=0){t.dead=true;t.c.x=1e6;t.c.z=1e6;const a=Math.atan2(t.x-P.x,t.z-P.z);FALL.push({t,a,age:0});netSend({t:'tree',i:TREES.indexOf(t),a:r2(a)});
    const n=t.ms===undefined?2:3+(R()<.5?1:0);addInv('wood',n);dmgNum(t.x,P.y+2.5,t.z,'+'+n+' wood','#e8c080',false);sfx('chest');}
}
function updateFall(dt){
  for(let i=FALL.length-1;i>=0;i--){const f=FALL[i];f.age+=dt;const t=f.t,k=Math.min(1,f.age/.9);const ang=k*k*1.55;
    _e.set(0,t.ry,0);_q.setFromEuler(_e);const q2=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(f.a),0,-Math.sin(f.a)),ang);q2.multiply(_q);
    const sc=k>.85?Math.max(0,1-(k-.85)/.15):1;_v.set(t.x,t.y,t.z);_s.set(t.sx*sc,t.sy*sc,t.sx*sc);_tm.compose(_v,q2,_s);
    for(const m of t.ms){m.setMatrixAt(t.i,_tm);m.instanceMatrix.needsUpdate=true;}
    if(f.age>=.9){burst(t.x,t.y+.5,t.z,0x8a6a40,14,3,.7,.14);treeImpact(t,f.a,f.remote);FALL.splice(i,1);}}
}
/* ---- foraging ---- */
function buildForage(){
  const bushG=new THREE.IcosahedronGeometry(.55,0).scale(1,.7,1),berG=new THREE.SphereGeometry(.09,5,4);
  const N=110,bush=instMesh(bushG,TOON({color:0xffffff}),N,false),bers=instMesh(berG,new THREE.MeshBasicMaterial({color:0xff3a5a}),N*4,false);
  const NM=60,cap=instMesh(new THREE.ConeGeometry(.2,.16,7),TOON({color:0xffffff}),NM,false),stem=instMesh(new THREE.CylinderGeometry(.05,.07,.18,5),TOON({color:0xf0ead8}),NM,false);
  const c=new THREE.Color();let nb=0,nm=0,tries=0;
  while((nb<N||nm<NM)&&tries<9000){tries++;const a=R()*TAU,r=12+Math.sqrt(R())*168,x=Math.cos(a)*r,z=Math.sin(a)*r,h=gh(x,z);
    if(h<2.3||h>20||slopeAt(x,z)>.5||houseNear(x,z)||pathDist(x,z)<2||Math.hypot(x-CRT.x,z-CRT.z)<40)continue;
    const fw=forestW(x,z);
    if(nb<N&&(fw>.25||R()<.3)){setInst([bush],nb,x,h+.25,z,1,1,1,R()*TAU,null);c.setHSL(.3,.5,.3);bush.setColorAt(nb,c);
      for(let k=0;k<4;k++){const b2=new THREE.Matrix4().compose(new THREE.Vector3(x+RR(-.35,.35),h+.45+RR(0,.2),z+RR(-.35,.35)),new THREE.Quaternion(),new THREE.Vector3(1,1,1));bers.setMatrixAt(nb*4+k,b2);}
      FORAGE.push({kind:'berry',x,z,y:h,i:nb,t:0});nb++;}
    else if(nm<NM&&fw>.3){setInst([stem],nm,x,h+.1,z,1,1,1,0,null);setInst([cap],nm,x,h+.26,z,1,1,1,0,null);c.setHSL(R()<.5?.0:.08,.75,.45);cap.setColorAt(nm,c);stem.setColorAt(nm,new THREE.Color(0xf0ead8));FORAGE.push({kind:'mush',x,z,y:h,i:nm,t:0});nm++;}
  }
  bush.count=nb;bers.count=nb*4;cap.count=nm;stem.count=nm;
  for(const m of[bush,bers,cap,stem]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
  OW.forage={bush,bers,cap,stem};
}
function foragePaint(f){const F=OW.forage,zero=new THREE.Matrix4().makeScale(0,0,0);
  if(f.kind==='berry'){for(let k=0;k<4;k++){if(f.t>0)F.bers.setMatrixAt(f.i*4+k,zero);else{F.bers.setMatrixAt(f.i*4+k,new THREE.Matrix4().compose(new THREE.Vector3(f.x+RR(-.35,.35),f.y+.45+RR(0,.2),f.z+RR(-.35,.35)),new THREE.Quaternion(),new THREE.Vector3(1,1,1)));}}F.bers.instanceMatrix.needsUpdate=true;}
  else{const m=f.t>0?zero:null;if(m){F.cap.setMatrixAt(f.i,zero);F.stem.setMatrixAt(f.i,zero);}else{setInst([F.stem],f.i,f.x,f.y+.1,f.z,1,1,1,0,null);setInst([F.cap],f.i,f.x,f.y+.26,f.z,1,1,1,0,null);}F.cap.instanceMatrix.needsUpdate=true;F.stem.instanceMatrix.needsUpdate=true;}}
function nearForage(){const P=game.player;let b=null,bd=2;for(const f of FORAGE){if(f.t>0)continue;const d=Math.hypot(f.x-P.x,f.z-P.z);if(d<bd&&Math.abs(P.y-f.y)<2.5){bd=d;b=f;}}return b;}
/* ---- fishing ---- */
const FISH={st:'idle',t:0,bite:0,bob:null,x:0,z:0};
function shorePoint(){const P=game.player;if(P.swim||P.mount||!P.grounded)return null;
  for(let d=3;d<=7;d+=1){const x=P.x+Math.sin(P.yaw)*d,z=P.z+Math.cos(P.yaw)*d;if(gh(x,z)<-.8)return [x,z];}return null;}
function castLine(){const sp=shorePoint();if(!sp){toast('Face the water to fish',1.6);return;}
  if(!FISH.bob){FISH.bob=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),new THREE.MeshBasicMaterial({color:0xff4a3a}));scene.add(FISH.bob);}
  FISH.st='wait';FISH.t=RR(2.2,5.5);netSend({t:'ev',k:'cast',x:r2(sp[0]),z:r2(sp[1])});FISH.x=sp[0];FISH.z=sp[1];FISH.bob.visible=true;sfx('swing',0);burst(sp[0],0,sp[1],0xbfeaff,10,2.5,.5,.1);}
function stopFish(){FISH.st='idle';if(FISH.bob)FISH.bob.visible=false;}
function reel(){
  if(FISH.st==='bite'){const r=R(),kind=r<.06?'golden carp':r<.4?'trout':'minnow';addInv('fish',kind==='golden carp'?2:1);addXP(kind==='golden carp'?30:8);toast('Caught a '+kind+'!',2);sfx('chest');burst(FISH.x,0,FISH.z,0xbfeaff,20,4,.7,.12);stopFish();}
  else if(FISH.st==='wait'){toast('Too early. The fish got away',1.6);stopFish();}
}
/* ---- fire, cook, rest ---- */
function nearFire(){const P=game.player;for(const f of world.fires)if(Math.hypot(f.x-P.x,f.z-P.z)<4)return f;return null;}
function ctxAction(){
  const P=game.player;if(!P||P.dead||game.dialog||P.mount)return null;const inv=game.inv||invDefault();
  if(FISH.st==='bite')return{text:'Reel in!',fn:reel};
  if(FISH.st==='wait')return{text:'Waiting for a bite… (G cancels)',fn:reel};
  if(P.rest)return{text:'Stand up',fn:()=>{P.rest=false;P.emote=null;}};
  const f=nearForage();if(f)return{text:f.kind==='berry'?'Pick berries':'Pick mushroom',fn:()=>{f.t=f.kind==='berry'?150:200;foragePaint(f);netSend({t:'forage',i:FORAGE.indexOf(f),ft:f.t});addInv(f.kind,f.kind==='berry'?3:1);sfx('pick');dmgNum(f.x,f.y+1,f.z,f.kind==='berry'?'+3 berries':'+1 mushroom','#ff8aa0',false);burst(f.x,f.y+.6,f.z,f.kind==='berry'?0xff3a5a:0xff7a4a,8,2.5,.5,.1);}};
  const fire=nearFire();
  if(fire){
    if(inv.fish>0)return{text:'Cook a fish',fn:()=>{inv.fish--;addInv('cooked',1);sfx('fire');toast('Cooked! Press H to eat',1.8);burst(fire.x,fire.y+.5,fire.z,0xffb04a,12,2.5,.6,.12);invHud();}};
    if(inv.berry>=3&&inv.mush>=1)return{text:'Brew a potion (3 berries, 1 mushroom)',fn:()=>{inv.berry-=3;inv.mush--;game.pots++;sfx('heal');toast('Brewed a healing potion',1.8);invHud();}};
    return{text:'Sit by the fire and rest',fn:startRest};
  }
  if(shorePoint())return{text:'Cast fishing line',fn:castLine};
  if(inv.wood>=3&&P.grounded&&!P.swim)return{text:'Build a campfire (3 wood)',fn:()=>{inv.wood-=3;const x=P.x+Math.sin(P.yaw)*1.8,z=P.z+Math.cos(P.yaw)*1.8;campfire(x,z,false);NET.fires.push([r2(x),r2(z)]);netSend({t:'fire',x:r2(x),z:r2(z)});sfx('fire');toast('Campfire built. Cook, brew and rest here',2.2);invHud();}};
  return null;
}
function doCtx(){const a=ctxAction();if(a&&a.fn)a.fn();}
function startRest(){const P=game.player;if(music.combat){toast('You cannot rest while enemies are near',1.8);return;}P.rest=true;P.emote={kind:'sit',t:0};toast('Resting… time passes. Move to stand up',2);}
function eatFood(){const P=game.player,inv=game.inv||invDefault();if(P.hp>=P.maxhp){toast('Already at full health',1.4);return;}
  if(inv.cooked>0){inv.cooked--;P.hp=Math.min(P.maxhp,P.hp+P.maxhp*.4);dmgNum(P.x,P.y+2.4,P.z,'+'+Math.round(P.maxhp*.4),'#7dff7d');sfx('heal');}
  else if(inv.berry>0){inv.berry--;P.hp=Math.min(P.maxhp,P.hp+P.maxhp*.08);dmgNum(P.x,P.y+2.4,P.z,'+'+Math.round(P.maxhp*.08),'#7dff7d');sfx('pick');}
  else if(inv.fish>0){toast('Cook the fish at a campfire first',1.8);return;}
  else toast('Nothing to eat',1.4);invHud();}
function doEmote(code){const P=game.player;if(P.dead||P.mount||game.dialog||P.state!=='free')return;const k=EMOTES[code];
  if(k==='sit'){if(P.rest||(P.emote&&P.emote.kind==='sit')){P.rest=false;P.emote=null;}else if(nearFire())startRest();else P.emote={kind:'sit',t:0};return;}
  P.rest=false;P.emote=P.emote&&P.emote.kind===k?null:{kind:k,t:0};}
function applyEmote(P,c,t){
  if(P.emote&&(Math.hypot(input.mx,input.my)>.1||P.state!=='free'||P.hurtT>0||input.jump>0||P.mount||P.swim||!P.grounded)){P.emote=null;P.rest=false;}
  if(!P.emote)return;const e=P.emote;e.t+=1/60;const k=e.kind;
  if(k==='wave'){c.arms[1].rotation.x=0;c.arms[1].rotation.z=2.55+Math.sin(game.time*11)*.25;}
  else if(k==='cheer'){c.arms[0].rotation.x=0;c.arms[1].rotation.x=0;c.arms[0].rotation.z=-2.7;c.arms[1].rotation.z=2.7;c.body.position.y=-.9+Math.abs(Math.sin(game.time*8))*.12;}
  else if(k==='dance'){const s=game.time*7;c.body.position.y=-.9+Math.abs(Math.sin(s))*.1;c.body.rotation.y=Math.sin(s*.5)*.6;c.arms[0].rotation.x=0;c.arms[1].rotation.x=0;c.arms[0].rotation.z=-1.6-Math.sin(s)*.8;c.arms[1].rotation.z=1.6+Math.sin(s+PI)*.8;c.legs[0].rotation.x=Math.sin(s)*.6;c.legs[1].rotation.x=-Math.sin(s)*.6;}
  else if(k==='sit'){c.body.position.y=-.9-.46;c.legs[0].rotation.x=-1.45;c.legs[1].rotation.x=-1.45;c.arms[0].rotation.x=-.7;c.arms[1].rotation.x=-.7;c.body.rotation.x=.08;}
}
/* ---- weather ---- */
function buildWeather(){
  const N=900,g=new THREE.BufferGeometry(),pos=new Float32Array(N*6);for(let i=0;i<N;i++){const x=RR(-22,22),y=RR(0,20),z=RR(-22,22);pos.set([x,y,z,x,y-.7,z],i*6);}
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const m=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xbfd8ff,transparent:true,opacity:.55,fog:false,depthWrite:false}));m.frustumCulled=false;m.visible=false;scene.add(m);WX.drops=m;WX.N=N;
}
function updateWeather(dt){
  const P=game.player;if(!P)return;
  if(game.time>WX.next){WX.target=WX.target>0?0:1;WX.next=game.time+(WX.target?RR(60,110):RR(160,340));if(WX.target)toast('Rain rolls in…',2.2);}
  WX.rain+=(WX.target-WX.rain)*Math.min(1,dt*.35);
  const m=WX.drops;m.visible=WX.rain>.03;if(!m.visible)return;m.material.opacity=.55*WX.rain;
  const a=m.geometry.attributes.position.array,cx=camera.position.x,cy=camera.position.y,cz=camera.position.z;
  m.position.set(cx,cy-8,cz);
  for(let i=0;i<WX.N;i++){const o=i*6;let y=a[o+1]-dt*26;if(y<-4){y+=22;a[o]=RR(-22,22);a[o+2]=RR(-22,22);}a[o+1]=y;a[o+4]=y-.7;a[o]=a[o+3]=a[o];a[o+5]=a[o+2];}
  m.geometry.attributes.position.needsUpdate=true;
}
function weatherLook(){const r=WX.rain;if(r<.02)return;sun.intensity*=1-.32*r;hemi.intensity*=1-.1*r;scene.fog.density+=.0045*r;scene.fog.color.lerp(_c.set('#8b97a6'),.55*r);}
function buildLiving(){buildForage();buildWeather();world.animated.push(updateLiving);invHud();}
function updateLiving(dt){
  const P=game.player;if(!P)return;
  updateFall(dt);updateWeather(dt);
  for(const t of TREES){if(t.shake>0&&!t.dead){t.shake-=dt;const s=Math.sin(t.shake*60)*.04*Math.min(1,t.shake*6);_e.set(s,t.ry,s);_q.setFromEuler(_e);_v.set(t.x,t.y,t.z);_s.set(t.sx,t.sy,t.sx);_tm.compose(_v,_q,_s);for(const m of t.ms){m.setMatrixAt(t.i,_tm);m.instanceMatrix.needsUpdate=true;}}}
  for(const f of FORAGE)if(f.t>0){f.t-=dt;if(f.t<=0){f.t=0;foragePaint(f);}}
  // fishing
  if(FISH.st!=='idle'){
    if(P.swim||Math.hypot(input.mx,input.my)>.1||P.state!=='free'||P.mount||P.hurtT>0)stopFish();
    else{FISH.t-=dt;const bob=FISH.bob;bob.position.set(FISH.x,-.42+Math.sin(game.time*3)*.04-(FISH.st==='bite'?.18+Math.abs(Math.sin(game.time*22))*.1:0),FISH.z);
      P.yaw+=angDiff(P.yaw,Math.atan2(FISH.x-P.x,FISH.z-P.z))*Math.min(1,dt*8);
      if(FISH.st==='wait'&&FISH.t<=0){FISH.st='bite';FISH.t=1.3;sfx('alert');toast('A bite! Press G',1.2);burst(FISH.x,-.3,FISH.z,0xbfeaff,8,2,.4,.1);}
      else if(FISH.st==='bite'&&FISH.t<=0){toast('It got away',1.4);stopFish();}}
  }
  // resting passes time
  if(P.rest){game.T=(game.T+dt*22/540)%1;P.hp=Math.min(P.maxhp,P.hp+dt*P.maxhp*.06);P.st=P.maxst;}
}

/* ================= fire & effects (phase 4) ================= */
const FLAMES=[];let _glowTex=null;
function glowTex(){if(_glowTex)return _glowTex;const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);_glowTex=new THREE.CanvasTexture(c);return _glowTex;}
function flameTongueGeo(){const g=new THREE.ConeGeometry(.17,1,6,4);g.translate(0,.5,0);const p=g.attributes.position,col=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){const t=p.getY(i);p.setX(i,p.getX(i)+t*t*.12);const a=Math.min(1,t*1.6);col[i*3]=1;col[i*3+1]=.22+.7*Math.pow(t,.8);col[i*3+2]=.02+.5*Math.pow(t,2.2);}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));return g;}
function addFlameFX(parent,x,y,z,sc,act){
  const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(sc);parent.add(g);
  const gm=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.72,fog:false,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  const geo=flameTongueGeo(),T=[];
  for(let i=0;i<8;i++){const m=new THREE.Mesh(geo,gm);const a=i/8*TAU;const r=i?.2+R()*.08:0;m.position.set(Math.cos(a)*r,0,Math.sin(a)*r);m.userData={ph:R()*10,h:i?.55+R()*.4:1.15,sp:8+R()*7};m.frustumCulled=false;g.add(m);T.push(m);}
  const mkPts=(n,size,color,op)=>{const geoP=new THREE.BufferGeometry(),pos=new Float32Array(n*3);geoP.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const m=new THREE.PointsMaterial({color,size,map:glowTex(),transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true,fog:false});const pt=new THREE.Points(geoP,m);pt.frustumCulled=false;g.add(pt);return {pt,pos,n,seed:Array.from({length:n},()=>R())};};
  const em=mkPts(26,.14,0xffa040,1),sm=mkPts(10,1.5,0x2a2a30,.5),hz=mkPts(1,3.2,0xff7a20,.35);
  const gl=new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshBasicMaterial({map:glowTex(),color:0xff8a30,transparent:true,opacity:.45,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));gl.rotation.x=-PI/2;gl.position.y=.06;g.add(gl);
  const f={g,T,em,sm,hz,gl,act,ph:R()*10,sc};FLAMES.push(f);return f;
}
function updateFlameFX(){
  const t=game.time,cp=camera.position,v=_v;
  for(const f of FLAMES){
    if(f.act&&!f.act()){f.g.visible=false;continue;}
    f.g.getWorldPosition(v);const d=Math.hypot(v.x-cp.x,v.z-cp.z);if(d>95){f.g.visible=false;continue;}f.g.visible=true;
    const wx=WIND.x*.05,wz=WIND.z*.05;
    f.T.forEach((m,i)=>{const u=m.userData,k=1+.28*Math.sin(t*u.sp+u.ph)+.15*Math.sin(t*u.sp*1.9+u.ph*2);m.scale.set(1+.2*Math.sin(t*u.sp*.7+u.ph),u.h*k,1+.2*Math.cos(t*u.sp*.8+u.ph));m.rotation.z=-wx*(i?1.6:.8)+Math.sin(t*5+u.ph)*.13;m.rotation.x=wz*(i?1.6:.8)+Math.cos(t*4.3+u.ph)*.13;});
    // embers rise, drift with wind and wink out
    {const e=f.em;for(let i=0;i<e.n;i++){const s=e.seed[i],k=(t*(.28+s*.3)+s*7)%1;const o=i*3;e.pos[o]=Math.sin(t*1.7+s*30)*.25*k+WIND.x*.5*k*k;e.pos[o+1]=.3+k*(2.2+s);e.pos[o+2]=Math.cos(t*1.3+s*20)*.25*k+WIND.z*.5*k*k;}e.pt.geometry.attributes.position.needsUpdate=true;e.pt.material.opacity=.9;}
    {const e=f.sm;for(let i=0;i<e.n;i++){const s=e.seed[i],k=(t*(.12+s*.06)+s*5)%1;const o=i*3;e.pos[o]=Math.sin(t*.6+s*12)*.35*k+WIND.x*1.1*k*k;e.pos[o+1]=1.2+k*3.2;e.pos[o+2]=Math.cos(t*.5+s*9)*.35*k+WIND.z*1.1*k*k;}e.pt.geometry.attributes.position.needsUpdate=true;e.pt.material.opacity=.16+.07*light.dayAmt;}
    {const e=f.hz;e.pos[0]=0;e.pos[1]=.9;e.pos[2]=0;e.pt.geometry.attributes.position.needsUpdate=true;e.pt.material.opacity=.22+.2*light.night+.06*Math.sin(t*13+f.ph);}
    f.gl.material.opacity=(.28+.3*light.night)*(1+.15*Math.sin(t*11+f.ph));f.gl.scale.setScalar(1+.06*Math.sin(t*9+f.ph));
  }
}
/* ambient life: drifting pollen by day, fireflies by night (follow the player) */
let AMB=null;
function buildAmbient(){
  const mk=(n,size,color)=>{const geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3);geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const m=new THREE.PointsMaterial({color,size,map:glowTex(),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true,fog:false});
    const pts=new THREE.Points(geo,m);pts.frustumCulled=false;scene.add(pts);return {pts,pos,n,seed:Array.from({length:n},()=>[R(),R(),R(),R()])};};
  AMB={pollen:mk(150,.1,0xfff0b8),fly:mk(80,.2,0xd4ff6a)};
}
function updateAmbient(){
  if(!AMB)buildAmbient();const P=game.player,t=game.time,S=56,wrap=v=>((v%S)+S)%S-S/2;
  const day=light.dayAmt,ng=light.night;
  {const a=AMB.pollen;for(let i=0;i<a.n;i++){const s=a.seed[i],o=i*3;a.pos[o]=P.x+wrap(s[0]*S+t*(.35+s[3]*.3)*WIND.x*.8+Math.sin(t*.5+s[1]*20)*1.2);a.pos[o+1]=P.y+.4+s[1]*7+Math.sin(t*.8+s[2]*30)*.4;a.pos[o+2]=P.z+wrap(s[2]*S+t*(.35+s[3]*.3)*WIND.z*.8+Math.cos(t*.45+s[0]*20)*1.2);}
    a.pts.geometry.attributes.position.needsUpdate=true;a.pts.material.opacity=.55*day*(1-ng);}
  {const a=AMB.fly;for(let i=0;i<a.n;i++){const s=a.seed[i],o=i*3;a.pos[o]=P.x+wrap(s[0]*S+Math.sin(t*.3+s[1]*40)*3);a.pos[o+1]=Math.max(P.y-.5,0)+.5+s[1]*3.2+Math.sin(t*.9+s[2]*30)*.5;a.pos[o+2]=P.z+wrap(s[2]*S+Math.cos(t*.27+s[3]*40)*3);}
    a.pts.geometry.attributes.position.needsUpdate=true;a.pts.material.opacity=ng*(.75+.25*Math.sin(t*2.3))*(P.y<3?.35:1);}
}

/* ================= real object damage: houses, stall, windmill, props, falling trees ================= */
const DMG=[],DEB=[],DST={hpT:0,stumps:[]};
const _dgeo=new THREE.BoxGeometry(1,1,1);
let _crackTex=null,_markMat=null;
function crackMat(){
  if(_markMat)return _markMat;
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.translate(64,64);
  const g=x.createRadialGradient(0,0,2,0,0,36);g.addColorStop(0,'rgba(34,20,10,.9)');g.addColorStop(.5,'rgba(34,20,10,.45)');g.addColorStop(1,'rgba(34,20,10,0)');
  x.fillStyle=g;x.beginPath();x.arc(0,0,36,0,7);x.fill();x.strokeStyle='rgba(22,12,6,.95)';x.lineCap='round';x.lineJoin='round';
  for(let i=0;i<9;i++){let a=i/9*6.283+Math.random()*.5,px=0,py=0;const len=26+Math.random()*34;x.lineWidth=2.6-Math.random();x.beginPath();x.moveTo(0,0);
    for(let s=0;s<5;s++){a+=(Math.random()-.5)*.9;px+=Math.cos(a)*len/5;py+=Math.sin(a)*len/5;x.lineTo(px,py);}x.stroke();}
  _crackTex=new THREE.CanvasTexture(c);
  _markMat=new THREE.MeshBasicMaterial({map:_crackTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
  return _markMat;
}
const _dwv=new THREE.Vector3();
function dust(x,y,z,n,sp,col=0xcbbd9f){burst(x,y,z,col,n,sp,1.15,.36,1.3);}
function debris(x,y,z,mat,sx,sy,sz,vx,vy,vz,perm){
  if(DEB.length>=190){let k=DEB.findIndex(d=>!d.perm);if(k<0)k=0;scene.remove(DEB[k].m);DEB.splice(k,1);}
  const m=new THREE.Mesh(_dgeo,mat);m.scale.set(sx,sy,sz);m.position.set(x,y,z);m.rotation.set(R()*6,R()*6,R()*6);m.castShadow=false;scene.add(m);
  DEB.push({m,vx,vy,vz,rx:RR(-9,9),ry:RR(-9,9),rz:RR(-9,9),t:0,life:perm?1e9:RR(7,11),rest:false,perm:!!perm,h:Math.min(sx,sy,sz)*.5+.02,s0:[sx,sy,sz]});
}
function updateDebris(dt){
  for(let i=DEB.length-1;i>=0;i--){const d=DEB[i],m=d.m;d.t+=dt;
    if(!d.rest){d.vy-=17*dt;m.position.x+=d.vx*dt;m.position.y+=d.vy*dt;m.position.z+=d.vz*dt;m.rotation.x+=d.rx*dt;m.rotation.y+=d.ry*dt;m.rotation.z+=d.rz*dt;
      const gy=gh(m.position.x,m.position.z)+d.h;
      if(m.position.y<gy){m.position.y=gy;if(d.vy<-2.5){d.vy*=-.3;d.vx*=.55;d.vz*=.55;d.rx*=.5;d.ry*=.5;d.rz*=.5;}else{d.rest=true;m.rotation.x=RR(-.2,.2);m.rotation.z=RR(-.2,.2);}}}
    if(!d.perm&&d.t>d.life){const k=1-(d.t-d.life)/.7;if(k<=0){scene.remove(m);DEB.splice(i,1);continue;}m.scale.set(d.s0[0]*k,d.s0[1]*k,d.s0[2]*k);}
  }
}
function clearDebris(){for(const d of DEB)scene.remove(d.m);DEB.length=0;}
function spray(x,y,z,mat,n,sp,size,perm){for(let i=0;i<n;i++){const a=R()*TAU,s=sp*(.4+R()*.7);debris(x+RR(-.3,.3),y+RR(0,.4),z+RR(-.3,.3),mat,size*RR(.5,1.5),size*RR(.25,.7),size*RR(.4,1.2),Math.cos(a)*s,RR(2,sp*1.2),Math.sin(a)*s,perm);}}
function wpos(o,lx,ly,lz){o.g.updateMatrixWorld(true);return _dwv.set(lx,ly,lz).applyMatrix4(o.g.matrixWorld).clone();}

function regHouse(o){
  o.hp=o.hp||(o.name==='House'?30:12);o.max=o.hp;o.st=0;o.shake=0;o.marks=[];o.dead=false;o.col=-1;o.cd=0;o.dir=1;o.lean=0;o.drip=0;o.inset=o.inset==null?.2:o.inset;o.struct=true;
  o.p0={py:o.g.position.y,ry:o.g.rotation.y,rx:0,rz:0};o.kids=o.g.children.slice();o.k0y=o.kids[0]?o.kids[0].position.y:0;o.rp=o.PT&&o.PT.roof?{y:o.PT.roof.position.y,rz:0}:null;
  DMG.push(o);return o;
}
function regProp(o){
  o.max=o.hp;o.shake=0;o.dead=false;o.cd=0;o.prop=true;o.c0r=o.c?o.c.r:0;o.hw=o.hd=o.r;o.rot=0;o.h=o.kind==='lamp'?3.4:o.kind==='mill'?12:1;o.fall=-1;
  DMG.push(o);return o;
}
/* nearest point on an object's footprint to a world point */
function objNear(o,px,pz){
  if(o.circ||o.prop){const dx=o.x-px,dz=o.z-pz,dd=Math.hypot(dx,dz)||1,r=o.r;return {d:Math.max(0,dd-r),nx:o.x-dx/dd*r,nz:o.z-dz/dd*r,cx:0,cz:0,inside:dd<r};}
  const c=Math.cos(o.rot),s=Math.sin(o.rot),dx=px-o.x,dz=pz-o.z,lx=dx*c-dz*s,lz=dx*s+dz*c,cx=clamp(lx,-o.hw,o.hw),cz=clamp(lz,-o.hd,o.hd);
  return {d:Math.hypot(lx-cx,lz-cz),nx:o.x+cx*c+cz*s,nz:o.z-cx*s+cz*c,cx,cz,inside:Math.abs(lx)<o.hw&&Math.abs(lz)<o.hd};
}
function ensureHpBar(){
  if(DST.bar)return;const e=document.createElement('div');e.style.cssText='position:fixed;top:15%;left:50%;transform:translateX(-50%);min-width:170px;padding:4px 12px 7px;background:rgba(24,16,10,.78);border:1px solid #c8a060;border-radius:8px;color:#f4e2b8;font:600 12px system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .25s;pointer-events:none;z-index:6;letter-spacing:.04em';
  e.innerHTML='<div></div><div style="height:6px;background:#3a2a1c;border-radius:3px;margin-top:4px;overflow:hidden"><div style="height:100%;background:#e8a040;width:100%;transition:width .12s"></div></div>';
  document.body.appendChild(e);DST.bar=e;DST.barN=e.children[0];DST.barF=e.children[1].children[0];
}
function showObjHp(o){ensureHpBar();const f=clamp(o.hp/o.max,0,1);DST.barN.textContent=o.name+(o.hp<=0?' — destroyed':'');DST.barF.style.width=(f*100)+'%';DST.barF.style.background=f>.5?'#e8a040':f>.25?'#d86a30':'#c02a20';DST.bar.style.opacity=1;DST.hpT=2.2;}

function addMark(o,hy,cx,cz){
  if(o.inset==null)return;const hwF=o.hw-o.inset,hdF=o.hd-o.inset;
  const nx=Math.abs(cx)/hwF>Math.abs(cz)/hdF?Math.sign(cx)||1:0,nz=nx?0:(Math.sign(cz)||1);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),crackMat());const sc=RR(.8,1.5);m.scale.set(sc,sc,1);
  let px=nx?nx*(hwF+.09):clamp(cx+RR(-1.4,1.4),-hwF+.5,hwF-.5),pz=nz?nz*(hdF+.09):clamp(cz+RR(-1.4,1.4),-hdF+.5,hdF-.5);
  if(o.PT&&nz>0&&Math.abs(px)<1.1)px=(px<0?-1:1)*RR(1.2,Math.max(1.3,hwF-.5));
  m.position.set(px,clamp(hy-o.y0+RR(-.3,.6),1.0,Math.max(1.3,o.h-.6)),pz);m.rotation.y=Math.atan2(nx,nz);m.rotateZ(R()*TAU);o.g.add(m);o.marks.push(m);
  if(o.marks.length>16){const old=o.marks.shift();o.g.remove(old);old.geometry.dispose();}
}
function hitObjects(range,arc,mul){
  const P=game.player;if(P.mount)return;const reach=range>8?2.6:Math.min(range,6.4)*.55+.6,fx=Math.sin(P.yaw),fz=Math.cos(P.yaw);
  const fac=clamp(playerDmg()/14,.75,2);
  for(const o of DMG){if(o.dead||o.cd>0)continue;
    const n=objNear(o,P.x,P.z);if(n.d>reach||P.y>o.y0+o.h+1.5)continue;
    if(arc<3){const dx=n.nx-P.x,dz=n.nz-P.z,L=Math.hypot(dx,dz)||1;if((dx*fx+dz*fz)/L<Math.cos(arc)&&n.d>.5)continue;}
    damageObj(o,mul*fac*(o.kind==='mill'?.8:1),n,P);
  }
}
function damageObj(o,amt,n,P,quiet){
  if(!NET.rx)netSend({t:'obj',i:DMG.indexOf(o),amt:Math.round(amt*100)/100,nx:r2(n.nx),nz:r2(n.nz),cx:r2(n.cx||0),cz:r2(n.cz||0),px:P?r2(P.x):null,py:P?r2(P.y):null,pz:P?r2(P.z):null});
  o.hp-=amt;o.cd=.2;o.shake=.4;DST.last=o;showObjHp(o);
  const hy=(P?P.y:o.y0)+RR(.9,1.8),hx=n.nx,hz=n.nz;
  cam.shake=Math.max(cam.shake,o.struct?.14:.08);sfx('smash');
  if(o.struct){addMark(o,hy,n.cx,n.cz);burst(hx,hy,hz,0xb8905a,6,3,.55,.12);dust(hx,hy,hz,4,1.8);
    if(R()<.7)debris(hx,hy,hz,o.PT?mats.timber:mats.plank,.07,.5,.06,RR(-2,2),RR(2,4),RR(-2,2));}
  else{burst(o.x,o.y0+.6,o.z,o.kind==='lamp'?0xffd890:0xa9753f,7,3.4,.55,.11);if(o.kind==='mill'){dust(hx,o.y0+RR(1,5),hz,4,2);}}
  if(o.kind==='crate'||o.kind==='barrel'||o.kind==='sign'){const dx=o.x-(P?P.x:o.x),dz=o.z-(P?P.z:o.z),L=Math.hypot(dx,dz)||1;o.pushX=dx/L;o.pushZ=dz/L;}
  if(o.hp<=0){destroyObj(o,P);return;}
  if(o.struct)houseStages(o);
}
function houseStages(o){
  const f=o.hp/o.max,PT=o.PT,g=o.g;
  if(f<.75&&o.st<1){o.st=1;
    if(PT){for(const m of PT.ln){m.visible=false;}const lp=wpos(o,1.05,2.9,o.d/2+.4);debris(lp.x,lp.y,lp.z,new THREE.MeshBasicMaterial({color:0xffc060}),.18,.24,.18,0,1,0);
      for(const [fg,fx,fy,fz] of PT.fb){fg.visible=false;const p=wpos(o,fx,fy,fz);const cols=[0xe8506a,0xffd24a,0xf4f0e8,0xb060e0];
        for(let i=0;i<7;i++)debris(p.x+RR(-.5,.5),p.y,p.z+RR(-.1,.1),new THREE.MeshBasicMaterial({color:cols[i%4]}),.12,.12,.12,RR(-1.5,1.5),RR(1,3),RR(0,2.5));
        debris(p.x,p.y,p.z,mats.plank,1.1,.18,.3,0,1.5,1.8);}
      const sg=PT.sh[0];if(sg){sg[0].visible=false;const p=wpos(o,sg[1],sg[2],sg[3]);debris(p.x,p.y,p.z,mats.door,.4,.95,.06,RR(-1,1),1,2.2);}}
    else{spray(o.x,o.y0+o.h,o.z,mats.plank,5,3,.3);}
    toast(o.name==='House'?'The house creaks...':'The stall shudders...',1.6);}
  if(f<.5&&o.st<2){o.st=2;
    if(PT){if(PT.ch){const p=wpos(o,PT.ch.position.x,PT.ch.position.y+1,PT.ch.position.z);PT.ch.visible=false;dust(p.x,p.y,p.z,22,4);spray(p.x,p.y,p.z,mats.stone,10,4,.4);
        if(PT.sm){const k=smokes.indexOf(PT.sm);if(k>=0)smokes.splice(k,1);o.smk=PT.sm;}}
      if(PT.roof){PT.roof.position.y=o.rp.y-.12;PT.roof.rotation.z=.05*o.dir;}
      for(let i=1;i<PT.sh.length;i++){PT.sh[i][0].visible=false;const p=wpos(o,PT.sh[i][1],PT.sh[i][2],PT.sh[i][3]);debris(p.x,p.y,p.z,mats.door,.4,.95,.06,RR(-1,1),1,2.2);}
      for(let i=0;i<10;i++){const p=wpos(o,RR(-o.hw,o.hw),o.h+RR(.5,1.8),RR(-o.hd,o.hd));debris(p.x,p.y,p.z,o.roofMat,.55,.07,.4,RR(-2.5,2.5),RR(1,4),RR(-2.5,2.5));}}
    else spray(o.x,o.y0+o.h,o.z,mats.plank,8,4,.3);
    o.lean=.035*o.dir;toast(o.name==='House'?'The walls are cracking!':'Planks are falling!',1.6);}
  if(f<.25&&o.st<3){o.st=3;o.lean=.07*o.dir;cam.shake=Math.max(cam.shake,.3);}
}
function destroyObj(o,P){
  o.cd=9;
  if(o.struct){
    o.col=0;o.dir=Math.sign(o.lean)||(R()<.5?-1:1);cam.shake=Math.max(cam.shake,.7);sfx('smash');DST.colSfx=0;
    const wood=o.name==='House'?7+Math.floor(R()*3):4;if(!NET.rx){addInv('wood',wood);dmgNum(o.x,o.y0+o.h+1,o.z,'+'+wood+' wood','#e8c080',false);}if(0)dmgNum(o.x,o.y0+o.h+1,o.z,'+'+wood+' wood','#e8c080',false);
    toast(o.name==='House'?'The house collapses!':'The stall collapses!',2.4);
    if(o.fruit){for(let i=0;i<9;i++)debris(o.x+RR(-1.5,1.5),o.y0+1.2,o.z+RR(-.3,.3),new THREE.MeshBasicMaterial({color:[0xd23a2a,0x6ac24a,0xe8b43a][i%3]}),.3,.3,.3,RR(-3,3),RR(2,5),RR(-3,3));}
    return;}
  breakProp(o,P);
}
function breakProp(o,P){
  o.dead=true;if(o.kind==='lamp'){o.fall=0;const dx=o.x-(P?P.x:o.x-1),dz=o.z-(P?P.z:o.z),L=Math.hypot(dx,dz)||1;o.fdx=dx/L;o.fdz=dz/L;if(o.c)o.c.r=0;burst(o.x,o.y0+3.3,o.z,0xffd890,18,5,.5,.14,4);return;}
  if(o.kind==='mill'){const bl=o.bl;bl.visible=false;o.bladesOff=true;const bp=bl.getWorldPosition(new THREE.Vector3());dust(bp.x,bp.y,bp.z,30,6);cam.shake=Math.max(cam.shake,.8);
    for(let i=0;i<4;i++){const a=i*PI/2+bl.rotation.z;debris(bp.x+Math.cos(a)*2,bp.y+Math.sin(a)*2,bp.z+1,mats.timber,.35,5,.25,Math.cos(a)*3,RR(2,6),RR(1,4));}
    for(let i=0;i<16;i++)debris(bp.x+RR(-3,3),bp.y+RR(-3,3),bp.z+RR(0,2),i%2?mats.hay:mats.timber,.9,.1,.4,RR(-3,3),RR(1,6),RR(-1,4));
    if(!NET.rx){addInv('wood',6);dmgNum(o.x,o.y0+10,o.z,'+6 wood','#e8c080',false);}toast('The windmill blades snap off!',2.2);return;}
  o.g.visible=false;if(o.c)o.c.r=0;const cx=o.x,cz=o.z,cy=o.y0+.5;
  for(const [mat,sx,sy,sz,n] of o.deb)for(let i=0;i<n;i++){const a=R()*TAU,s=RR(2,5);debris(cx+RR(-.2,.2),cy+RR(0,.5),cz+RR(-.2,.2),mat,sx*RR(.8,1.2),sy*RR(.8,1.2),sz*RR(.8,1.2),Math.cos(a)*s,RR(3,6),Math.sin(a)*s);}
  dust(cx,cy,cz,12,3);sfx('smash');if(NET.rx)return;
  const n=o.loot?Math.round(RR(1,o.loot+1)):0;for(let i=0;i<n;i++)dropPickup('coin',cx,cz,cy+.3);if(o.kind!=='lamp'&&R()<.08)dropPickup('potion',cx,cz,cy+.3);
  if(o.kind==='crate'||o.kind==='barrel'){addInv('wood',1);dmgNum(cx,cy+1,cz,'+1 wood','#e8c080',false);}
}
function finishCollapse(o){
  const g=o.g;o.dead=true;g.scale.set(1,1,1);g.rotation.set(0,o.p0.ry,0);g.position.y=o.p0.py;
  for(const k of o.kids)k.visible=false;if(o.PT&&o.kids[0]){o.kids[0].visible=true;o.kids[0].scale.y=.45;o.kids[0].position.y*=.45;}       // keep a broken stone foundation
  for(const m of o.marks){g.remove(m);}o.marks.length=0;
  const bi=world.boxes.indexOf(o.box);if(bi>=0)world.boxes.splice(bi,1);if(o.roofRef){const ri=world.roofs.indexOf(o.roofRef);if(ri>=0)world.roofs.splice(ri,1);}
  const c=Math.cos(o.rot),s=Math.sin(o.rot),mats_=[o.wallMat,o.roofMat,mats.timber,mats.plank,o.roofMat];
  const N=o.name==='House'?30:14;
  for(let i=0;i<N;i++){const lx=RR(-o.hw,o.hw)*.95,lz=RR(-o.hd,o.hd)*.95,wx=o.x+lx*c+lz*s,wz=o.z-lx*s+lz*c;
    const big=R()<.3,sx=big?RR(.9,1.6):RR(.3,.8),sz=big?RR(.5,.9):RR(.15,.4),sy=RR(.08,.22);
    debris(wx,gh(wx,wz)+.28+sy,wz,mats_[i%5],sx,sy,sz,0,0,0,true);const d=DEB[DEB.length-1];d.rest=true;d.m.rotation.set(RR(-.3,.3),R()*TAU,RR(-.3,.3));if(R()<.4)d.m.position.y+=RR(.1,.5);}
  for(let i=0;i<4;i++){const lx=(i%2?1:-1)*(o.hw-.3),lz=(i<2?1:-1)*(o.hd-.3),wx=o.x+lx*c+lz*s,wz=o.z-lx*s+lz*c,hh=RR(.5,1.5);
    debris(wx,gh(wx,wz)+.25+hh/2,wz,mats.timber,.28,hh,.28,0,0,0,true);const d=DEB[DEB.length-1];d.rest=true;d.m.rotation.set(RR(-.12,.12),R()*TAU,RR(-.12,.12));}
  dust(o.x,o.y0+1,o.z,40,6);
}
function treeImpact(t,a,remote){
  const sx=Math.sin(a),sz=Math.cos(a),reach=Math.max(3.4,3.9*t.sy),P=game.player;
  const tx=t.x+sx*reach,tz=t.z+sz*reach,ty=gh(tx,tz);
  burst(tx,ty+.5,tz,0x5a9a3a,16,5,.9,.16);dust(tx,ty+.3,tz,10,3);
  if(Math.hypot(tx-P.x,tz-P.z)<30)cam.shake=Math.max(cam.shake,.28);sfx('smash');
  const hits=[];
  if(!remote)for(const o of DMG){if(o.dead||o.cd>0&&!o.struct)continue;let best=null;
    for(const f of[.45,.7,1]){const n=objNear(o,t.x+sx*reach*f,t.z+sz*reach*f);if(n.d<1.4&&(!best||n.d<best.d))best=n;}
    if(best)hits.push([o,best]);}
  for(const [o,n] of hits){const hp0=o.hp;damageObj(o,o.struct?o.max*.22:o.max,n,null);const _y=o.y0+1.6;burst(n.nx,_y,n.nz,0x5a9a3a,12,4,.8,.16);}
  if(!remote)for(const e of game.enemies){if(e.state==='dead')continue;if(Math.hypot(e.x-tx,e.z-tz)<2.8+e.r){damageEnemy(e,26,t.x,t.z,9,false);dmgNum(e.x,e.y+2,e.z,'TIMBER!','#ffd27a',true);}}
  // stump + wood chips left behind
  if(!DST.stumpG){DST.stumpG=new THREE.CylinderGeometry(.75,1,1,8);DST.stumpM=new THREE.MeshLambertMaterial({color:0x7a5a38});}
  const st=new THREE.Mesh(DST.stumpG,DST.stumpM),h=.35+.12*t.sy;st.scale.set(.3*t.sx,h,.3*t.sx);st.position.set(t.x,t.y+h/2-.05,t.z);st.castShadow=true;scene.add(st);DST.stumps.push(st);
  const cap=new THREE.Mesh(new THREE.CircleGeometry(.23*t.sx,8),new THREE.MeshLambertMaterial({color:0xd8b080}));cap.rotation.x=-PI/2;cap.position.set(t.x,t.y+h-.04,t.z);scene.add(cap);DST.stumps.push(cap);
  spray(t.x,t.y+.6,t.z,mats.plank,5,3,.22);
}
function updateDamage(dt){
  updateDebris(dt);
  if(DST.hpT>0){DST.hpT-=dt;if(DST.hpT<=0&&DST.bar)DST.bar.style.opacity=0;}
  const T=game.time;
  for(const o of DMG){
    if(o.cd>0&&o.cd<5)o.cd-=dt;
    if(o.struct){
      const g=o.g;
      if(o.col>=0&&!o.dead){
        o.col+=dt;const Tc=1.7,k=Math.min(1,o.col/Tc),e=k*k;
        g.scale.y=1-.8*e;g.position.y=o.p0.py-.3*e;g.rotation.z=o.lean*(1-e)+o.dir*(.09*e)+Math.sin(o.col*45)*.025*(1-k);g.rotation.x=Math.sin(o.col*37)*.02*(1-k);
        if(o.PT&&o.PT.roof&&o.rp){o.PT.roof.rotation.z=.05*o.dir+o.dir*.45*e;o.PT.roof.position.y=o.rp.y-.12-1.4*e;}
        if(k>.45&&k<1){const bi=world.boxes.indexOf(o.box);if(bi>=0)world.boxes.splice(bi,1);if(o.roofRef){const ri=world.roofs.indexOf(o.roofRef);if(ri>=0)world.roofs.splice(ri,1);}}
        o.puff=(o.puff||0)-dt;if(o.puff<=0&&k<.85){o.puff=.1;const p=wpos(o,RR(-o.hw,o.hw),RR(.3,o.h),RR(-o.hd,o.hd));dust(p.x,p.y,p.z,6,3.5);
          if(R()<.8)debris(p.x,p.y,p.z,R()<.5?o.wallMat:o.roofMat,RR(.2,.6),.08,RR(.2,.5),RR(-4,4),RR(1,5),RR(-4,4));}
        DST.colSfx=(DST.colSfx||0)+dt;if(DST.colSfx>.35&&k<.8){DST.colSfx=0;sfx('smash');cam.shake=Math.max(cam.shake,.35*(1-k));}
        if(k>=1)finishCollapse(o);
      }else if(!o.dead){
        if(o.shake>0){o.shake-=dt;const a=Math.sin(T*70)*.012*Math.min(1,o.shake/.3);g.rotation.z=o.lean+a;g.rotation.x=Math.cos(T*60)*.007*Math.min(1,o.shake/.3);}
        else if(o.st>=3||o.lean){g.rotation.z=o.lean;g.rotation.x=0;}
        if(o.st>=3){o.drip-=dt;if(o.drip<=0){o.drip=RR(.5,1.2);const p=wpos(o,RR(-o.hw,o.hw),RR(1,o.h),RR(-o.hd,o.hd));dust(p.x,p.y,p.z,3,1.2);if(R()<.5)debris(p.x,p.y,p.z,mats.plank,.25,.06,.12,RR(-.5,.5),0,RR(-.5,.5));}}
      }
    }else if(o.prop){
      const g=o.g;
      if(o.kind==='lamp'&&o.fall>=0){o.fall+=dt*1.6;const k=Math.min(1,o.fall),th=(k<1?k*k:1)*1.5+(k>=1?Math.max(0,Math.sin((o.fall-1)*10))*.05*Math.max(0,1-(o.fall-1)*2):0);
        g.quaternion.setFromAxisAngle(_dwv.set(o.fdz,0,-o.fdx),th);
        if(k>=1&&!o.landed){o.landed=true;if(o.globe)o.globe.material=new THREE.MeshStandardMaterial({color:0x2a2218});burst(o.x+o.fdx*3,o.y0+.3,o.z+o.fdz*3,0xffd890,16,4,.6,.14);dust(o.x+o.fdx*3,o.y0+.3,o.z+o.fdz*3,6,2);sfx('smash');}}
      else if(o.shake>0&&!o.dead){o.shake-=dt;const a=Math.sin(T*65)*.05*Math.min(1,o.shake/.3);
        if(o.kind==='barrel'||o.kind==='crate'||o.kind==='sign'){g.rotation.z=(o.pushX||0)*a*1.2;g.rotation.x=-(o.pushZ||0)*a*1.2;}
        else if(o.kind==='mill'){g.rotation.z=a*.1;}
        else{g.rotation.z=a*.6;}
      }else if(!o.dead&&o.kind!=='mill'){g.rotation.z*=.8;g.rotation.x*=.8;}
    }
  }
}
function resetDamage(){
  clearDebris();
  for(const o of DMG){o.hp=o.max;o.dead=false;o.cd=0;o.shake=0;o.fall=-1;o.landed=false;o.g.visible=true;o.g.quaternion.identity();
    if(o.struct){o.g.rotation.set(0,o.p0.ry,0);o.g.scale.set(1,1,1);o.g.position.y=o.p0.py;for(const k of o.kids)k.visible=true;if(o.PT&&o.kids[0]){o.kids[0].scale.y=1;o.kids[0].position.y=o.k0y;}for(const m of o.marks)o.g.remove(m);o.marks.length=0;
      if(o.PT&&o.PT.roof&&o.rp){o.PT.roof.position.y=o.rp.y;o.PT.roof.rotation.z=0;}
      if(world.boxes.indexOf(o.box)<0)world.boxes.push(o.box);if(o.roofRef&&world.roofs.indexOf(o.roofRef)<0)world.roofs.push(o.roofRef);
      if(o.smk&&smokes.indexOf(o.smk)<0)smokes.push(o.smk);o.st=0;o.col=-1;o.lean=0;o.drip=0;o.puff=0;}
    else{if(o.c)o.c.r=o.c0r;if(o.bl)o.bl.visible=true;if(o.globe&&o.kind==='lamp')o.globe.material=mats.lampMat;}}
}


/* ================= characters ================= */
const matCache={};
const TGS=(()=>{const n=24,d=new Uint8Array(n*4);for(let i=0;i<n;i++){const v=Math.round(140+115*Math.pow(i/(n-1),.8));d[i*4]=d[i*4+1]=d[i*4+2]=v;d[i*4+3]=255;}const t=new THREE.DataTexture(d,n,1,THREE.RGBAFormat);t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;})();
function LM(c,o={}){const m=TOON(Object.assign({color:c},o));if(o.side===THREE.DoubleSide)m.gradientMap=TGS;return m;}
function mergeBucket(group,mat){
  const meshes=group.children.filter(m=>m.isMesh&&m.material.isMeshToonMaterial&&!m.material.map);
  if(!meshes.length)return;
  const parts=[];let n=0;
  for(const m of meshes){m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrix);parts.push([g,m.material.color]);n+=g.attributes.position.count;}
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3),col=new Float32Array(n*3);let o=0;
  for(const [g,c] of parts){const k=g.attributes.position.count;pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);for(let i=0;i<k;i++){col[(o+i)*3]=c.r;col[(o+i)*3+1]=c.g;col[(o+i)*3+2]=c.b;}o+=k;g.dispose();}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;
  if(Q>1){const ol=new THREE.Mesh(geo,OUTL);ol.castShadow=false;mesh.add(ol);}
  for(const m of meshes){group.remove(m);m.geometry.dispose();}
  group.add(mesh);
}
function makeWaver(w,h,sx,sy,mat,amp,spd,ph){
  const geo=new THREE.PlaneGeometry(w,h,sx,sy),mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.frustumCulled=false;
  return {mesh,geo,base:geo.attributes.position.array.slice(),sx,sy,amp,spd,ph:ph||0,h,w,sim:null,pin:'top'};
}
function makeHumanoid(o){
  const root=new THREE.Group(),pivot=new THREE.Group(),body=new THREE.Group();pivot.position.y=.9;body.position.y=-.9;root.add(pivot);pivot.add(body);root.scale.setScalar(o.scale||1);
  const bulk=o.bulk||1;
  const skin=LM(o.skin||'#f0c8a0'),cloth=LM(o.cloth||'#3a6ea8'),trim=LM(o.trim||'#caa24a'),dark=LM(o.dark||'#3b2a1e');
  const pantsM=LM(o.pants||o.dark||'#3b2a1e'),bootM=LM(o.boots||o.dark||'#3b2a1e'),sleeveM=LM(o.sleeve||o.cloth||'#3a6ea8');
  const metalM=LM(o.metal||'#aeb6c4'),whiteM=LM('#f2ecd8');
  const mm=TOON({vertexColors:true});
  const flash=[mm];
  const add=(g,x,y,z,mat,parent=body)=>{const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
  const cyl=(rt,rb,h,s=8)=>new THREE.CylinderGeometry(rt,rb,h,s);
  const aim=(m,x,y,z)=>{m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(x,y,z).normalize());return m;};
  const glowM=col=>new THREE.MeshBasicMaterial({color:col,fog:false});
  const wavers=[],anim=[],c0={lift:0};
  // legs
  const legs=[];for(const sx of[-1,1]){const l=new THREE.Group();l.position.set(sx*.14*bulk,.92,0);body.add(l);
    add(cyl(.12*bulk,.1*bulk,.46),0,-.23,0,pantsM,l);add(cyl(.09*bulk,.105*bulk,.4),0,-.6,0,pantsM,l);
    if(o.armor||o.kneepads)add(new THREE.SphereGeometry(.105,7,6),0,-.45,.07,metalM,l);
    if(o.armor){add(cyl(.112*bulk,.098*bulk,.32),0,-.62,.012,metalM,l);add(new THREE.BoxGeometry(.05,.3,.02),0,-.6,.11,trim,l);}
    add(cyl(.115*bulk,.125*bulk,.24),0,-.74,0,bootM,l);add(cyl(.135*bulk,.135*bulk,.05),0,-.63,0,trim,l);add(new THREE.BoxGeometry(.2*bulk,.1,.34),0,-.85,.06,bootM,l);
    if(o.talons){const tm=LM(o.talons);for(let k=-1;k<=1;k++){aim(add(new THREE.ConeGeometry(.035,.2,4),k*.065,-.88,.27,tm,l),k*.25,-.35,1);}aim(add(new THREE.ConeGeometry(.04,.16,4),0,-.86,-.1,tm,l),0,-.3,-1);
      for(let k=0;k<7;k++){const a=k/7*TAU;aim(add(new THREE.ConeGeometry(.045,.16,4),Math.cos(a)*.13,-.64,Math.sin(a)*.13,LM(o.featherRuff||'#2e2a4a'),l),Math.cos(a)*.7,-1,Math.sin(a)*.7);}}
    if(o.furTrim){const fm=LM(o.furTrim);for(let k=0;k<8;k++){const a=k/8*TAU;add(new THREE.SphereGeometry(.05*bulk,6,5),Math.cos(a)*.12*bulk,-.63,Math.sin(a)*.12*bulk,fm,l);}
      for(let k=0;k<5;k++){const a=(k-2)*.45;aim(add(new THREE.ConeGeometry(.04,.14,4),Math.sin(a)*.1,-.9,.22+Math.cos(a)*.03,fm,l),Math.sin(a)*.4,-.3,1);}}
    mergeBucket(l,mm);legs.push(l);}
  // torso & body
  const torso=add(cyl(.3*bulk,.23*bulk,.62,8),0,1.3,0,cloth);torso.scale.z=.64;
  add(new THREE.BoxGeometry(.5*bulk,.22,.3),0,.93,0,pantsM);
  const belt=add(cyl(.245*bulk,.245*bulk,.09,8),0,.99,0,dark);belt.scale.z=.7;add(new THREE.BoxGeometry(.1,.08,.04),0,.99,.19,trim);
  add(new THREE.BoxGeometry(.12,.14,.08),.2*bulk,.93,.12,dark);
  add(cyl(.075,.085,.12),0,1.66,0,skin);
  if(o.armor){const cp=add(cyl(.315*bulk,.26*bulk,.34,8),0,1.43,0,metalM);cp.scale.z=.68;add(new THREE.BoxGeometry(.05,.3,.02),0,1.43,.215,trim);const col=add(new THREE.TorusGeometry(.16,.045,5,10),0,1.65,0,trim);col.rotation.x=PI/2;}
  if(o.armor){for(const sx of[-1,1]){for(let i=0;i<3;i++){const t=add(new THREE.BoxGeometry(.15*bulk,.2,.05),sx*(.17+i*.045)*bulk,.82-i*.02,.1+i*.02,metalM);t.rotation.z=-sx*(.12+i*.1);}add(new THREE.BoxGeometry(.14,.2,.05),sx*.14,.8,-.12,metalM);}
    add(new THREE.BoxGeometry(.18,.14,.05),0,.97,.22,trim);add(new THREE.BoxGeometry(.28,.05,.03),0,1.58,.2,trim);}
  else{const col=add(new THREE.TorusGeometry(.14,.04,5,10),0,1.64,0,trim);col.rotation.x=PI/2;const hem=add(cyl(.265*bulk,.255*bulk,.05,8),0,.88,0,trim);hem.scale.z=.7;}
  if(o.tabard){add(new THREE.BoxGeometry(.3,.52,.03),0,1.15,.2,LM(o.tabard));add(new THREE.BoxGeometry(.3,.52,.03),0,1.15,-.19,LM(o.tabard));add(new THREE.BoxGeometry(.1,.1,.04),0,1.28,.215,trim);}
  if(o.robe){const r=add(cyl(.27*bulk,.44*bulk,.95,10),0,.55,0,cloth);r.scale.z=.9;add(cyl(.45*bulk,.45*bulk,.05,10),0,.1,0,trim).scale.z=.9;}
  if(o.apron){add(new THREE.BoxGeometry(.4,.8,.04),0,1.0,.21,LM(o.apron));add(new THREE.BoxGeometry(.4,.04,.1),0,1.38,.2,LM(o.apron));}
  if(o.loin){add(new THREE.BoxGeometry(.3,.4,.03),0,.8,.17,LM(o.loin));add(new THREE.BoxGeometry(.3,.4,.03),0,.8,-.17,LM(o.loin));}
  if(o.backpack){add(new THREE.BoxGeometry(.5,.55,.26),0,1.3,-.3,LM(o.backpack));add(new THREE.BoxGeometry(.52,.16,.28),0,1.6,-.3,LM(o.backpack2||o.backpack));add(new THREE.CylinderGeometry(.13,.13,.5,8),0,1.0,-.34,LM('#c8b890')).rotation.z=PI/2;}
  if(o.quiver){const q=add(cyl(.09,.075,.5,7),.12,1.35,-.25,LM('#5a3d28'));q.rotation.z=-.3;for(let i=0;i<3;i++){const f=add(new THREE.ConeGeometry(.035,.12,4),.2+i*.02-.03,1.62,-.25+(i-1)*.05,whiteM);f.rotation.z=-.3;}}
  if(o.spikes){for(let i=0;i<5;i++){const s=add(new THREE.ConeGeometry(.07,.28,5),0,1.0+i*.14,-.2-(i>2?.0:0),LM(o.spikeCol||'#e8e0cc'));s.rotation.x=-1.2;s.position.x=(i%2?.1:-.1);}}
  if(o.moss){for(const [x,y,z,r] of[[-.28,1.65,-.05,.2],[.3,1.6,.05,.17],[0,1.5,-.2,.26],[-.15,1.0,.15,.12]]){const m=add(new THREE.SphereGeometry(r,7,5),x*bulk,y,z,LM(o.moss));m.scale.y=.55;}}
  if(o.potion){const g=add(cyl(.045,.045,.13,8),-.24*bulk,.93,.12,new THREE.MeshToonMaterial({color:o.potion,transparent:true,opacity:.85,gradientMap:TGS}));add(cyl(.022,.022,.05,6),-.24*bulk,1.01,.12,LM('#8a5a30'));add(new THREE.TorusGeometry(.04,.008,4,8),-.24*bulk,.99,.12,trim).rotation.x=PI/2;}
  if(o.dorsal){const dm=LM(o.dorsal);for(let i=0;i<6;i++){const s2=1-i*.1;aim(add(new THREE.ConeGeometry(.06*s2,.3*s2,5),0,1.62-i*.13,-.2-(i<3?.0:.05),dm),0,.8,-1);}
    const ds=add(new THREE.BoxGeometry(.03,.55,.05),0,1.35,-.19,dm);}
  if(o.robeGlyph){const gm=glowM(o.robeGlyph);const g1=new THREE.Mesh(new THREE.OctahedronGeometry(.07),gm);g1.scale.set(.7,1.2,.25);g1.position.set(0,.62,.325);body.add(g1);const g2=new THREE.Mesh(new THREE.OctahedronGeometry(.035),gm);g2.scale.set(1,1,.25);g2.position.set(0,.45,.345);body.add(g2);
    for(const y of[.34,.2]){const rr=(.27+.17*((1.025-y)/.95))*bulk+.012;const b=add(cyl(rr,rr,.03,10),0,y,0,trim);b.scale.z=.9;}
    anim.push(t=>{const k=1+Math.sin(t*3)*.15;g1.scale.set(.7*k,1.2*k,.25);});}
  if(o.sigil){const gm=glowM(o.sigil);const sg=new THREE.Mesh(new THREE.OctahedronGeometry(.075),gm);sg.scale.set(.75,1.25,.2);sg.position.set(0,1.38,.235);body.add(sg);
    const rg=new THREE.Mesh(new THREE.TorusGeometry(.115,.014,4,16),LM('#e0b84e'));rg.position.set(0,1.38,.225);body.add(rg);
    for(const [dx,dy] of[[0,.17],[0,-.17],[.17,0],[-.17,0]]){const pt=new THREE.Mesh(new THREE.ConeGeometry(.02,.07,4),gm);pt.position.set(dx*.9,1.38+dy*.9,.225);aim(pt,dx,dy,0);body.add(pt);}
    anim.push(t=>{const k=1+Math.sin(t*3.2)*.14;sg.scale.set(.75*k,1.25*k,.2);});}
  if(o.featherRuff){const fm=LM(o.featherRuff),tm=glowM(o.ruffTip||'#9fe8ff');for(let r=0;r<2;r++)for(let k=0;k<11;k++){const a=k/11*TAU+r*.28,R2=.19+r*.05;const f=add(new THREE.ConeGeometry(.06,.26-r*.04,4),Math.cos(a)*R2,1.66-r*.07,Math.sin(a)*R2,fm);aim(f,Math.cos(a)*.9,-.55-r*.2,Math.sin(a)*.9);f.scale.z=.45;}
    for(let k=0;k<7;k++){const a=k/7*TAU+.2;const t2=new THREE.Mesh(new THREE.ConeGeometry(.018,.07,4),tm);t2.position.set(Math.cos(a)*.31,1.5,Math.sin(a)*.31);aim(t2,Math.cos(a)*.9,-.9,Math.sin(a)*.9);body.add(t2);}}
  if(o.backFur){const fm=LM(o.backFur);for(let k=0;k<9;k++){const a=(k-4)*.32;aim(add(new THREE.ConeGeometry(.07,.22,4),Math.sin(a)*.3*bulk,1.5-Math.abs(a)*.12,-.2-Math.cos(a)*.08,fm),Math.sin(a)*.8,.35,-1);}}
  mergeBucket(body,mm);
  if(o.robe){const rm=LM(o.cloth,{side:THREE.DoubleSide});flash.push(rm);for(let i=0;i<4;i++){const a=i*PI/2+.4,sw=makeWaver(.5*bulk,.75,2,4,rm,.06,3.2,i*1.7);sw.wind=0;sw.lift=.6;sw.mesh.position.set(Math.cos(a)*.44*bulk,.4,Math.sin(a)*.44*bulk*.9);sw.mesh.rotation.y=PI/2-a;body.add(sw.mesh);wavers.push(sw);}}
  // head
  const head=new THREE.Group();head.position.set(0,1.82,0);body.add(head);
  const sk=add(new THREE.SphereGeometry(.225,14,12),0,0,0,skin,head);sk.scale.set(1,1.04,1);
  add(new THREE.SphereGeometry(.033,7,6),0,-.02,.222,skin,head);
  const eyeM=new THREE.MeshBasicMaterial({color:o.eye||'#1a1008'});
  for(const sx of[-1,1]){const w=add(new THREE.BoxGeometry(.07,.07,.02),sx*.085,.03,.19,whiteM,head);const b=add(new THREE.BoxGeometry(.09,.025,.03),sx*.085,.1,.19,dark,head);b.rotation.z=sx*(o.angry?.35:.12);}
  const eyes=[];for(const sx of[-1,1]){const e=new THREE.Mesh(new THREE.BoxGeometry(.04,.055,.02),eyeM);e.position.set(sx*.085,.03,.205);head.add(e);eyes.push(e);}
  for(const sx of[-1,1]){const hl=new THREE.Mesh(new THREE.BoxGeometry(.016,.016,.01),new THREE.MeshBasicMaterial({color:0xffffff}));hl.position.set(sx*.085+.012,.045,.217);head.add(hl);}
  if(o.angry||o.snout||o.beak)add(new THREE.BoxGeometry(.1,.015,.03),0,-.1,.2,dark,head);
  else{const sm=add(new THREE.TorusGeometry(.045,.009,4,9,PI),0,-.075,.208,dark,head);sm.rotation.z=PI;for(const sx of[-1,1])add(new THREE.SphereGeometry(.028,6,5),sx*.13,-.045,.17,LM(o.blush||'#e89a8a'),head).scale.set(1,.7,.4);}
  if(!o.snout&&!o.beak&&!o.ears&&!o.hood){for(const sx of[-1,1]){const er=add(new THREE.SphereGeometry(.05,7,6),sx*.225,0,-.01,skin,head);er.scale.set(.5,1,.8);}}
  if(o.hair){const hm=LM(o.hair);const cap=add(new THREE.SphereGeometry(.24,12,9,0,TAU,0,PI*.56),0,.02,-.015,hm,head);cap.scale.y=1.05;
    add(new THREE.BoxGeometry(.26,.045,.06),0,.17,.17,hm,head).rotation.x=.45;
    for(let i=0;i<5;i++){const s=add(new THREE.ConeGeometry(.07,.28,5),(i-2)*.09,.1+(i%2)*.04,-.2,hm,head);s.rotation.x=-1.0-(i%2)*.2;s.rotation.z=(i-2)*.12;}
    for(let i=0;i<5;i++){const fr=add(new THREE.ConeGeometry(.045,.16,4),(i-2)*.075,.15,.195,hm,head);fr.rotation.x=PI*.92;fr.rotation.z=(i-2)*.15;}
    for(const sx of[-1,1])add(new THREE.BoxGeometry(.05,.2,.1),sx*.215,-.04,.02,hm,head);
    add(new THREE.SphereGeometry(.23,10,8),0,-.04,-.1,hm,head).scale.set(1,1.05,.85);
    if(o.hairStyle==='long'){add(new THREE.BoxGeometry(.34,.5,.1),0,-.2,-.2,hm,head);}
    if(o.pigtails){for(const sx of[-1,1]){add(new THREE.SphereGeometry(.09,7,6),sx*.27,-.02,-.05,hm,head);add(new THREE.ConeGeometry(.07,.3,6),sx*.29,-.2,-.05,hm,head).rotation.x=PI;}}}
  if(o.headband){const hb=add(new THREE.TorusGeometry(.225,.025,5,14),0,.1,0,LM(o.headband),head);hb.rotation.x=PI/2;hb.scale.set(1,1,1.05);hb.position.y=.12;}
  if(o.helmet){const hm=LM(o.helmet);add(new THREE.SphereGeometry(.255,12,9,0,TAU,0,PI*.6),0,.03,0,hm,head);add(new THREE.BoxGeometry(.05,.15,.3),0,.2,0,hm,head);add(new THREE.BoxGeometry(.04,.16,.04),0,-.02,.24,hm,head);
    for(const sx of[-1,1])add(new THREE.BoxGeometry(.04,.2,.14),sx*.23,-.08,.04,hm,head);}
  if(o.plume){const pl=add(new THREE.ConeGeometry(.08,.5,6),0,.35,-.12,LM(o.plume),head);pl.rotation.x=-.9;}
  if(o.hood){const hd=LM(o.hood);add(new THREE.SphereGeometry(.28,12,9,0,TAU,0,PI*.66),0,.02,-.03,hd,head);add(new THREE.ConeGeometry(.2,.5,6),0,.05,-.3,hd,head).rotation.x=-1.9;}
  if(o.ears){const em=skin;for(const sx of[-1,1]){const e=add(new THREE.ConeGeometry(.09,o.bigEars?.55:.38,4),sx*.28,.04,-.02,em,head);e.rotation.z=-sx*1.3;e.rotation.y=sx*.3;}}
  if(o.bignose){add(new THREE.SphereGeometry(.075,7,6),0,-.03,.24,skin,head);}
  if(o.fangs){for(const sx of[-1,1]){add(new THREE.ConeGeometry(.025,.1,4),sx*.05,-.1,.2,whiteM,head).rotation.x=PI;}}
  if(o.tusks){for(const sx of[-1,1]){const t=add(new THREE.ConeGeometry(.045,.28,5),sx*.1,-.1,.17,whiteM,head);t.rotation.set(-.4,0,sx*.15);}}
  if(o.beard){add(new THREE.ConeGeometry(.17,.38,7),0,-.26,.1,LM(o.beard),head).rotation.x=PI+.2;add(new THREE.BoxGeometry(.22,.08,.1),0,-.08,.19,LM(o.beard),head);}
  if(o.horns){for(const sx of[-1,1]){const e=add(new THREE.ConeGeometry(.08,.55,6),sx*.16,.25,0,whiteM,head);e.rotation.z=-sx*.55;const e2=add(new THREE.ConeGeometry(.05,.3,5),sx*.38,.46,0,whiteM,head);e2.rotation.z=-sx*.2;}}
  if(o.crown){const cm=LM(o.crownCol||o.trim||'#e8c860');const gm=new THREE.MeshBasicMaterial({color:o.crownGlow||'#9fe8ff',fog:false});
    for(let i=0;i<7;i++){const a=i/7*TAU,sp=add(new THREE.ConeGeometry(.045,.28+(i%2)*.14,5),Math.cos(a)*.2,.28,Math.sin(a)*.2,cm,head);sp.rotation.x=Math.sin(a)*.25;sp.rotation.z=-Math.cos(a)*.25;}
    const g=new THREE.Mesh(new THREE.OctahedronGeometry(.07),gm);g.position.set(0,.34,.17);head.add(g);}
  if(o.roundEars){for(const sx of[-1,1]){add(new THREE.SphereGeometry(.105,8,6),sx*.17,.2,-.03,skin,head);add(new THREE.SphereGeometry(.06,7,5),sx*.17,.2,.03,LM(o.earIn||'#e8a8a0'),head);}}
  if(o.snout){const L=o.snoutLen||.2;add(new THREE.BoxGeometry(.2*(o.snoutW||1),.15,L),0,-.07,.2+L/2,LM(o.snoutCol||o.skin||'#f0c8a0'),head);add(new THREE.SphereGeometry(.05,7,6),0,-.02,.2+L,LM(o.nose||'#18121a'),head);}
  if(o.beak){const bm=LM(o.beak);const b1=add(new THREE.ConeGeometry(.09,.36,5),0,-.02,.3,bm,head);b1.rotation.x=PI/2;const b2=add(new THREE.ConeGeometry(.065,.22,5),0,-.1,.27,bm,head);b2.rotation.x=PI/2;}
  if(o.crest){const cm=LM(o.crest);for(let i=0;i<5;i++){const f=add(new THREE.ConeGeometry(.045,.2+(i%2)*.08,4),0,.2-i*.03,-.02-i*.06,cm,head);f.rotation.x=-1.0-i*.08;}}
  if(o.headScale)head.scale.setScalar(o.headScale);
  if(o.flameHair){const fm=new THREE.MeshBasicMaterial({color:o.flameHair,fog:false});const fl=[];for(let i=0;i<6;i++){const f=new THREE.Mesh(new THREE.ConeGeometry(.07,.4,5),fm);f.position.set((i-2.5)*.07,.28,-.05-(i%2)*.06);head.add(f);fl.push(f);}anim.push(t=>{fl.forEach((f,i)=>{f.scale.y=1+Math.sin(t*12+i*1.7)*.35;f.rotation.z=Math.sin(t*7+i)*.2;});});}
  if(o.scar){const sc2=add(new THREE.BoxGeometry(.014,.14,.012),-.1,-.005,.206,LM(o.scar),head);sc2.rotation.z=.45;add(new THREE.BoxGeometry(.05,.012,.012),-.095,-.03,.207,LM(o.scar),head).rotation.z=-.3;}
  if(o.slit){for(const sx of[-1,1])add(new THREE.BoxGeometry(.012,.065,.012),sx*.085,.03,.217,dark,head);}
  if(o.spots){const spm=LM(o.spots);const pts=[[.14,.1,.16],[-.15,.08,.15],[.04,.19,.12],[-.08,.17,.14],[.2,-.02,.08],[-.2,-.03,.09],[.12,.12,-.18],[-.1,.14,-.17],[0,.2,-.05],[.19,.07,-.06],[-.19,.06,-.07]];for(const [x,y,z] of pts){const L=Math.hypot(x,y,z),p=add(new THREE.SphereGeometry(.026,6,5),x/L*.226,y/L*.226*1.04,z/L*.226,spm,head);aim(p,x,y,z);p.scale.set(1,.35,1);}}
  if(o.frill){const fm=LM(o.frill),fg=glowM(o.frillGlow||o.frill);for(const sx of[-1,1])for(let i=0;i<4;i++){const f=add(new THREE.ConeGeometry(.045-i*.004,.36-i*.04,4),sx*.2,.11-i*.075,-.04,fm,head);aim(f,sx*1,.28-i*.14,-.1);f.scale.z=.35;}
    for(let i=0;i<3;i++){const f=add(new THREE.ConeGeometry(.04,.2+(i===1?.1:0),4),0,.2,-.02-i*.07,fm,head);aim(f,0,1,-.5-i*.35);f.scale.z=.4;}}
  if(o.beakHook){const bm=LM(o.beak||'#e0b84e');aim(add(new THREE.ConeGeometry(.032,.12,4),0,-.055,.455,bm,head),0,-1,.25);for(const sx of[-1,1])add(new THREE.SphereGeometry(.012,5,4),sx*.028,.03,.28,dark,head);add(new THREE.BoxGeometry(.07,.02,.2),0,-.075,.35,bm,head);}
  if(o.hoodTrim){const hc=LM(o.hood||'#3a2c62');
    const vd=add(new THREE.SphereGeometry(.15,12,9),0,.02,.13,LM('#0b0912'),head);vd.scale.set(1.05,1.12,1);
    const tr2=add(new THREE.TorusGeometry(.118,.014,4,22),0,.02,.226,LM(o.hoodTrim),head);tr2.scale.set(1.0,1.1,1);
    const eg=glowM(o.eye||'#ffe27a');for(const sx of[-1,1]){const e2=new THREE.Mesh(new THREE.BoxGeometry(.05,.022,.02),eg);e2.position.set(sx*.062,.075,.262);e2.rotation.z=sx*.3;head.add(e2);}
    for(const sx of[-1,1])aim(add(new THREE.ConeGeometry(.04,.22,4),sx*.13,.27,-.04,hc,head),sx*.5,1,-.4);
    aim(add(new THREE.ConeGeometry(.05,.3,4),0,.3,-.06,hc,head),0,1,-.55);}
  if(o.iceCrown){const im=glowM(o.iceCrown);for(let i=0;i<5;i++){const a=(i-2)*.4;const c3=new THREE.Mesh(new THREE.OctahedronGeometry(.055),im);c3.scale.set(.7,2.1+(i%2===0?.8:0),.7);c3.position.set(Math.sin(a)*.17,.34+Math.cos(a)*.03-(i%2?.02:0)+.02,-.02);c3.rotation.z=-a*.5;head.add(c3);}
    const br=add(new THREE.BoxGeometry(.3,.045,.05),0,.145,.2,LM(o.crownBase||'#5c6c86'),head);br.rotation.x=.2;}
  if(o.brow){const bm=LM(o.brow);for(const sx of[-1,1]){const b=add(new THREE.BoxGeometry(.11,.035,.05),sx*.085,.105,.2,bm,head);b.rotation.z=sx*.28;}add(new THREE.BoxGeometry(.03,.07,.035),0,.1,.205,bm,head);}
  if(o.cheekFur){const fm=LM(o.cheekFur);for(const sx of[-1,1])for(let i=0;i<3;i++)aim(add(new THREE.ConeGeometry(.04,.14,4),sx*.2,-.08-i*.04,.09-i*.04,fm,head),sx*1,-.2-i*.15,.2);}
  mergeBucket(head,mm);
  if(o.hair){const hmw=LM(o.hair,{side:THREE.DoubleSide});flash.push(hmw);const long=o.hairStyle==='long',hw=makeWaver(long?.3:.16,long?.7:.42,2,6,hmw,.07,4.5,(o.seed||0)+.7);hw.wind=.7;hw.lift=.5;hw.mesh.position.set(0,long?-.2:-.12,-.24);head.add(hw.mesh);wavers.push(hw);}
  // arms
  const arms=[];for(const sx of[-1,1]){const a=new THREE.Group();a.position.set(sx*.37*bulk,1.55,0);body.add(a);
    add(cyl(.09*bulk,.075*bulk,.32),0,-.17,0,sleeveM,a);add(new THREE.SphereGeometry(.08*bulk,7,6),0,-.34,0,sleeveM,a);add(cyl(.07*bulk,.06*bulk,.3),0,-.48,0,o.bare?skin:sleeveM,a);
    if(o.armor||o.bracers){add(cyl(.085*bulk,.08*bulk,.19),0,-.5,0,metalM,a);}
    {const hm=o.gloves?LM(o.gloves):skin;add(new THREE.BoxGeometry(.105,.1,.06),0,-.665,0,hm,a);add(new THREE.BoxGeometry(.04,.075,.04),sx*-.075,-.66,.02,hm,a).rotation.z=sx*.5;
      for(let f=0;f<4;f++)add(new THREE.BoxGeometry(.022,.085,.03),-.039+f*.026,-.74,.018,hm,a);
      add(new THREE.CylinderGeometry(.075*bulk,.075*bulk,.045,8),0,-.6,0,o.cuff?LM(o.cuff):trim,a);}
    if(o.armor||o.pauldrons){const p=add(new THREE.SphereGeometry(.15*bulk,9,7),sx*.03,.07,0,metalM,a);p.scale.set(1.05,.7,1.05);add(new THREE.TorusGeometry(.125*bulk,.025,5,10),sx*.03,.03,0,trim,a).rotation.x=PI/2;for(let L=1;L<=2;L++){const q=add(new THREE.SphereGeometry((.15-L*.012)*bulk,9,6),sx*.03,.07-L*.07,0,metalM,a);q.scale.set(1.08,.34,1.08);}}
    if(o.claws){const cm=LM(o.claws);for(let f=0;f<4;f++)aim(add(new THREE.ConeGeometry(.016,.075,4),-.039+f*.026,-.8,.026,cm,a),0,-1,.35);}
    if(o.furTrim){const fm=LM(o.furTrim);for(let k=0;k<8;k++){const q=k/8*TAU;add(new THREE.SphereGeometry(.05*bulk,6,5),Math.cos(q)*.085*bulk,-.585,Math.sin(q)*.085*bulk,fm,a);}
      for(let k=0;k<7;k++){const q=k/7*TAU;aim(add(new THREE.ConeGeometry(.055,.17,4),sx*.03+Math.cos(q)*.17*bulk,.1,Math.sin(q)*.17*bulk,fm,a),Math.cos(q),.5,Math.sin(q));}}
    if(o.iceShards){const im=new THREE.MeshToonMaterial({color:o.iceShards,gradientMap:TGS,emissive:0x2a8aa8});for(let i=0;i<3;i++){const sh2=add(new THREE.ConeGeometry(.05+(i===1?.02:0),.26+(i===1?.12:0),5),sx*(.07+(i-1)*.1)+sx*.04,.26,(i-1)*.08,im,a);aim(sh2,sx*(.15+Math.abs(i-1)*.25)+(i-1)*.0,1,(i-1)*.3);}}
    arms.push(a);}
  if(o.tail){let par=body;const N=5,tc=LM(o.tailCol||o.skin||'#f0c8a0'),segs=[];
    for(let i=0;i<N;i++){const g=new THREE.Group();g.position.set(0,i?0:.95,i?-.3:-.18);par.add(g);const r=(o.tailW||.1)*(1-i*.15);const m=add(new THREE.SphereGeometry(r,7,6),0,0,-.12,tc,g);m.scale.z=1.7;mergeBucket(g,mm);segs.push(g);par=g;}
    if(o.tailFlame){const fm=new THREE.MeshBasicMaterial({color:o.tailFlame,fog:false}),fl=new THREE.Mesh(new THREE.ConeGeometry(.12,.45,6),fm);fl.rotation.x=-PI/2;fl.position.set(0,0,-.4);segs[N-1].add(fl);anim.push(t=>{fl.scale.set(1+Math.sin(t*14)*.2,1+Math.sin(t*11)*.3,1);});}
    if(o.tailFeathers){const fm=LM(o.tailFeathers),tg=glowM(o.tailTip||'#9fe8ff');for(let i=0;i<7;i++){const sp=(i-3)*.2;const f=add(new THREE.ConeGeometry(.07,.62-Math.abs(i-3)*.06,4),Math.sin(sp)*.12,0,-.32,fm,segs[N-1]);aim(f,Math.sin(sp),-.12+Math.abs(i-3)*.02,-Math.cos(sp));f.scale.z=.35;
        const tp=new THREE.Mesh(new THREE.ConeGeometry(.02,.07,4),tg);tp.position.set(Math.sin(sp)*.36,-.1,-.62+Math.abs(i-3)*.05);aim(tp,Math.sin(sp),-.1,-Math.cos(sp));segs[N-1].add(tp);}}
    anim.push(t=>{segs.forEach((g,i)=>{g.rotation.y=Math.sin(t*2.4-i*.7)*.28;g.rotation.x=.18+Math.sin(t*1.7-i*.5)*.06;});});}
  if(o.wings){const wm=LM(o.wings,{side:THREE.DoubleSide}),bm2=LM(o.wingBone||'#1c1a30'),fm=LM(o.wingFeather||'#262244');flash.push(wm,bm2,fm);const pvs=[];
    // wings hang from the shoulder blades behind the back: leading bone along the top, membrane + feathers fall below it
    for(const sx of[-1,1]){const pv=new THREE.Group();pv.position.set(sx*.2,1.46,-.2);pv.rotation.set(0,sx*.55,sx*.3);body.add(pv);pvs.push([pv,sx]);
      const w=makeWaver(1.05,.8,5,4,wm,.09,6,sx*1.3);w.wind=.3;w.mesh.position.set(sx*.55,-.4,0);pv.add(w.mesh);wavers.push(w);
      add(new THREE.SphereGeometry(.085,7,6),0,0,0,bm2,pv);
      const bone=add(cyl(.045,.03,1.05,5),sx*.52,0,0,bm2,pv);bone.rotation.z=PI/2;
      for(let q=0;q<6;q++){const f=add(new THREE.ConeGeometry(.075,.34+q*.02,4),sx*(.12+q*.17),-.82-(q%2)*.07,0,fm,pv);f.rotation.z=PI;f.scale.z=.35;}
      if(o.wingTips){const tg=glowM(o.wingTips);for(let q=0;q<6;q++){const tp=new THREE.Mesh(new THREE.ConeGeometry(.026,.09,4),tg);tp.position.set(sx*(.12+q*.17),-1.16-(q%2)*.07,0);tp.rotation.z=PI;pv.add(tp);}
        for(let q=0;q<5;q++){const cv=add(new THREE.ConeGeometry(.07,.3,4),sx*(.2+q*.17),-.45-(q%2)*.04,.01,fm,pv);cv.rotation.z=PI;cv.scale.z=.35;}}}
    anim.push(t=>{for(const [pv,sx] of pvs){const L=((c0.ref&&c0.ref.lift)||0);pv.rotation.z=sx*(.3+.07*Math.sin(t*1.6)+(L>0?.5*L:0));}});}
  if(o.ruff){const rf=add(new THREE.TorusGeometry(.21*bulk,.085,6,12),0,1.66,.0,LM(o.ruff));rf.rotation.x=PI/2;}
  // cape + scarf
  let cape=null,capeW=null;
  if(o.cape){cape=new THREE.Group();cape.position.set(0,1.62,-.18);body.add(cape);const cm=LM(o.cape,{side:THREE.DoubleSide});capeW=makeWaver(.62,1.1,4,7,cm,.09,3.2,o.seed||0);capeW.mesh.position.y=-.55;cape.add(capeW.mesh);flash.push(cm);wavers.push(capeW);
    if(o.capeTrim){const tm=new THREE.Mesh(new THREE.PlaneGeometry(.62,.06),LM(o.capeTrim,{side:THREE.DoubleSide}));tm.position.set(0,-1.08,.002);cape.add(tm);capeW.after=()=>{const a=capeW.geo.attributes.position.array,k=(capeW.sy*(capeW.sx+1)+capeW.sx/2)*3;tm.position.set(a[k],a[k+1]-.55,a[k+2]+.004);const k2=(capeW.sy*(capeW.sx+1)+capeW.sx)*3,k0=capeW.sy*(capeW.sx+1)*3;tm.rotation.z=Math.atan2(a[k2+1]-a[k0+1],a[k2]-a[k0]);};}
    add(new THREE.SphereGeometry(.05,6,5),.22,0,.02,trim,cape);add(new THREE.SphereGeometry(.05,6,5),-.22,0,.02,trim,cape);}
  if(o.scarf){const sm=LM(o.scarf,{side:THREE.DoubleSide});const sc=new THREE.Group();sc.position.set(0,1.66,-.05);body.add(sc);const w=makeWaver(.16,.65,1,5,sm,.07,5,1.3);w.mesh.position.set(.12,-.32,-.12);sc.add(w.mesh);wavers.push(w);flash.push(sm);
    const r=add(new THREE.TorusGeometry(.14,.05,6,12),0,1.66,0,sm.clone?LM(o.scarf):LM(o.scarf));r.rotation.x=PI/2;}
  // weapon
  const weapon=new THREE.Group();weapon.position.set(0,-.64,0);arms[1].add(weapon);weapon.rotation.x=PI*.42;
  const tip=new THREE.Object3D();weapon.add(tip);
  const kind=o.weapon||'sword';
  if(kind==='sword'){
    const bm=new THREE.MeshStandardMaterial({color:0xdde4ee,metalness:.9,roughness:.2,emissive:o.bladeEmit||0x201408});
    add(new THREE.BoxGeometry(.09,1.0,.022),0,.64,0,bm,weapon);add(new THREE.ConeGeometry(.0635,.2,4),0,1.24,0,bm,weapon).rotation.y=PI/4;
    const gm=new THREE.MeshBasicMaterial({color:o.bladeGlow||'#ffc060',fog:false});const gl=add(new THREE.BoxGeometry(.014,1.15,.034),0,.7,0,gm,weapon);
    add(new THREE.BoxGeometry(.36,.06,.08),0,.13,0,LM('#d8b050'),weapon);for(const sx of[-1,1]){const w=add(new THREE.ConeGeometry(.04,.14,4),sx*.2,.16,0,LM('#d8b050'),weapon);w.rotation.z=-sx*1.2;}
    add(new THREE.CylinderGeometry(.03,.03,.22,6),0,0,0,dark,weapon);add(new THREE.SphereGeometry(.055,7,6),0,-.13,0,LM('#d8b050'),weapon);add(new THREE.OctahedronGeometry(.04),0,.13,.05,gm,weapon);if(o.hiltGem){add(new THREE.OctahedronGeometry(.032),0,-.13,.05,glowM(o.hiltGem),weapon);for(let k=0;k<5;k++)add(new THREE.TorusGeometry(.032,.006,4,8),0,-.04-k*.0,0,LM('#d8b050'),weapon).position.y=-.06+k*.026;}
    tip.position.set(0,1.3,0);
    const sh=new THREE.Group();sh.position.set(-.1,-.3,0);arms[0].add(sh);const sm2=add(cyl(.3,.3,.06,16),-.1,0,0,LM(o.shield||'#8a3b2c'),sh);sm2.rotation.z=PI/2;const rim=add(new THREE.TorusGeometry(.3,.035,5,18),-.13,0,0,LM('#d8b050'),sh);rim.rotation.y=PI/2;add(cyl(.09,.09,.1,8),-.15,0,0,LM('#e0b040'),sh).rotation.z=PI/2;
    for(const [y,z] of[[.18,0],[-.18,0],[0,.18],[0,-.18]]){add(new THREE.BoxGeometry(.03,.08,.04),-.14,y,z,LM('#d8b050'),sh);}
    if(o.shieldEmblem){const eg=glowM(o.shieldEmblem);const fl=new THREE.Mesh(new THREE.ConeGeometry(.085,.26,5),eg);fl.position.set(-.185,-.02,0);aim(fl,-1,.0,0);fl.rotation.set(0,0,PI/2);fl.rotation.y=0;sh.add(fl);
      const fl3=new THREE.Mesh(new THREE.ConeGeometry(.05,.17,5),eg);fl3.position.set(-.185,-.1,.08);fl3.rotation.z=PI/2;sh.add(fl3);
      const rg=new THREE.Mesh(new THREE.TorusGeometry(.2,.014,4,20),LM('#d8b050'));rg.position.set(-.16,0,0);rg.rotation.y=PI/2;sh.add(rg);}
    mergeBucket(sh,mm);}
  else if(kind==='club'){add(cyl(.085,.14,1.1,7),0,.55,0,LM(o.wood||'#6a4328'),weapon);add(new THREE.SphereGeometry(.2,8,6),0,1.1,0,LM(o.wood||'#6a4328'),weapon);for(let i=0;i<6;i++){const a=i/6*TAU;add(new THREE.ConeGeometry(.03,.12,4),Math.cos(a)*.19,1.1+Math.sin(i*2)*.08,Math.sin(a)*.19,whiteM,weapon).rotation.set(Math.sin(a)*1.4,0,-Math.cos(a)*1.4);}tip.position.set(0,1.15,0);}
  else if(kind==='bow'){const b=add(new THREE.TorusGeometry(.5,.028,5,14,PI),0,.2,0,LM('#6a4328'),weapon);b.rotation.set(0,PI/2,PI/2);add(new THREE.BoxGeometry(.012,.012,1.0),0,.2,-.01,whiteM,weapon);tip.position.set(0,.2,0);weapon.rotation.x=0;weapon.position.set(0,-.64,.1);}
  else if(kind==='tree'){add(cyl(.18,.3,2.4,7),0,1.2,0,LM('#5a3d28'),weapon);for(const [x,y,z,r] of[[0,2.4,0,.55],[.3,2.0,.1,.32],[-.25,2.7,.1,.3]])add(new THREE.IcosahedronGeometry(r,0),x,y,z,LM('#4a7a3a'),weapon);for(let i=0;i<4;i++){const a=i*1.7;add(new THREE.ConeGeometry(.05,.5,4),Math.cos(a)*.28,1.3+i*.25,Math.sin(a)*.28,LM('#3b2a1e'),weapon).rotation.z=Math.cos(a)*1.2;}tip.position.set(0,2.4,0);}
  else if(kind==='spear'){add(cyl(.04,.04,2.2,5),0,1.0,0,LM('#cfe9ff'),weapon);const im=new THREE.MeshStandardMaterial({color:0x9fe8ff,emissive:0x2a9fd0,metalness:.3,roughness:.2});add(new THREE.ConeGeometry(.12,.55,5),0,2.35,0,im,weapon);for(const sx of[-1,1]){add(new THREE.ConeGeometry(.05,.3,4),sx*.1,2.05,0,im,weapon).rotation.z=-sx*.5;}tip.position.set(0,2.55,0);}
  else if(kind==='hammer'){add(cyl(.08,.1,1.5,6),0,.75,0,dark,weapon);add(new THREE.BoxGeometry(.7,.55,.55),0,1.55,0,LM(o.hammer||'#2a2326'),weapon);for(const sx of[-1,1])add(new THREE.BoxGeometry(.12,.62,.62),sx*.38,1.55,0,LM(o.trim||'#caa24a'),weapon);if(o.glow)add(new THREE.BoxGeometry(.5,.1,.58),0,1.55,0,new THREE.MeshBasicMaterial({color:o.glow,fog:false}),weapon);tip.position.set(0,1.55,0);}
  else if(kind==='staff'){add(cyl(.04,.05,2.0,6),0,.9,0,LM('#6a4328'),weapon);const orb=add(new THREE.IcosahedronGeometry(.13,1),0,2.0,0,new THREE.MeshBasicMaterial({color:o.orb||'#9fe8ff',fog:false}),weapon);add(new THREE.TorusGeometry(.14,.025,5,10),0,1.9,0,LM('#d8b050'),weapon).rotation.x=PI/2;anim.push(t=>{orb.scale.setScalar(1+Math.sin(t*3)*.12);});
    if(o.orbFlames){const gm=LM('#d8b050');for(let i=0;i<4;i++){const a=i*PI/2+.4;aim(add(new THREE.ConeGeometry(.028,.3,4),Math.cos(a)*.17,2.0,Math.sin(a)*.17,gm,weapon),-Math.cos(a)*.35,1,-Math.sin(a)*.35);}
      add(cyl(.065,.05,.1,6),0,1.78,0,gm,weapon);const fm=glowM(o.orbFlames),fl2=[];for(let i=0;i<5;i++){const f=new THREE.Mesh(new THREE.ConeGeometry(.05,.24,5),fm);f.position.set(Math.cos(i*1.26)*.1,2.18,Math.sin(i*1.26)*.1);weapon.add(f);fl2.push(f);}
      anim.push(t=>{fl2.forEach((f,i)=>{f.scale.y=1+Math.sin(t*10+i*1.9)*.4;f.position.y=2.18+Math.sin(t*10+i*1.9)*.03;});});}
    tip.position.set(0,2.0,0);weapon.rotation.x=.1;}
  else if(kind==='none'){weapon.visible=false;}
  mergeBucket(weapon,mm);
  if(o.shoulders){for(const sx of[-1,1]){const r=add(new THREE.DodecahedronGeometry(.3,0),sx*.52*bulk,1.66,0,LM(o.shoulders));for(let i=0;i<3;i++)add(new THREE.ConeGeometry(.07,.3,5),sx*(.52+(i-1)*.12)*bulk,1.9+(i===1?.05:0),(i-1)*.12,LM(o.spikeCol||'#e8e0cc')).rotation.z=-sx*(i-1)*.4;}}
  if(o.glow){const core=new THREE.Mesh(new THREE.OctahedronGeometry(.14),new THREE.MeshBasicMaterial({color:o.glow,fog:false}));core.position.set(0,1.34,.2);body.add(core);anim.push(t=>{core.scale.setScalar(1+Math.sin(t*4)*.15);core.rotation.y=t*2;});}
  if(o.runes){for(let i=0;i<7;i++){const r=new THREE.Mesh(new THREE.PlaneGeometry(.05,.16+RR(0,.1)),new THREE.MeshBasicMaterial({color:o.runes,fog:false}));r.position.set(RR(-.22,.22),1.0+RR(0,.55),.2);r.rotation.z=RR(-.6,.6);body.add(r);}}
  if(o.orbit){const shards=[];const om=new THREE.MeshBasicMaterial({color:o.orbit,fog:false});for(let i=0;i<4;i++){const s=new THREE.Mesh(new THREE.OctahedronGeometry(.18),om);root.add(s);shards.push(s);}anim.push(t=>{shards.forEach((s,i)=>{const a=t*1.2+i*PI/2;s.position.set(Math.cos(a)*.95,1.5+Math.sin(t*2+i)*.2,Math.sin(a)*.95);s.rotation.set(t,t*1.3,0);});});}
  if(o.halo){const h=new THREE.Mesh(new THREE.TorusGeometry(.45,.03,6,24),new THREE.MeshBasicMaterial({color:o.halo,fog:false}));h.position.set(0,2.3,-.1);h.rotation.x=PI/2-.3;root.add(h);anim.push(t=>{h.rotation.z=t*1.5;});}
  if(o.motes){const mg=glowM(o.motes),ms=[];const mr=o.moteR||.5;for(let i=0;i<8;i++){const m=new THREE.Mesh(i%2?new THREE.OctahedronGeometry(.035):new THREE.SphereGeometry(.028,5,4),mg);root.add(m);ms.push(m);}
    anim.push(t=>{ms.forEach((m,i)=>{const k=((t*(.28+(i%3)*.06)+i/8)%1),a=t*.7+i*.785;m.position.set(Math.cos(a)*(mr+.12*Math.sin(t+i)),.1+k*2.2,Math.sin(a)*(mr+.12*Math.sin(t+i)));m.scale.setScalar(Math.sin(k*PI));m.rotation.set(t*2+i,t*1.5,0);});});}
  root.userData.flash=flash;
  const ret={root,pivot,body,legs,arms,head,torso,cape,capeW,weapon,tip,flash,eyeM,eyes,hipY:.92,wavers,anim};c0.ref=ret;return ret;
}
/* tissue-soft cloth: verlet particles pinned to the garment's attachment edge, weak bending, floaty damping,
   inertia from the wearer's motion, wind as an air force, and a slow spring back to the resting drape */
const _wm=new THREE.Matrix4(),_wi=new THREE.Matrix4(),_wv=new THREE.Vector3();
function clothInit(w){
  const n=(w.sx+1)*(w.sy+1),a=w.base;w.sim={P:new Float32Array(n*3),O:new Float32Array(n*3),T:new Float32Array(n*3),cons:[],pinned:new Uint8Array(n),init:false};
  const S=w.sim,W1=w.sx+1;
  for(let r=0;r<=w.sy;r++)for(let q=0;q<=w.sx;q++){const i=r*W1+q;S.pinned[i]=(w.pin==='left'?q===0:r===0)?1:0;}
  const add=(p,q,k)=>S.cons.push([p,q,k,0]);
  for(let r=0;r<=w.sy;r++)for(let q=0;q<=w.sx;q++){const p=r*W1+q;
    if(q<w.sx)add(p,p+1,1);if(r<w.sy)add(p,p+W1,1);
    if(q<w.sx&&r<w.sy){add(p,p+W1+1,.5);add(p+1,p+W1,.5);}
    if(q<w.sx-1)add(p,p+2,.1);if(r<w.sy-1)add(p,p+2*W1,.1);}
  w.mesh.updateWorldMatrix(true,false);_wm.copy(w.mesh.matrixWorld);
  const pos=[];for(let i=0;i<n;i++){_wv.set(a[i*3],a[i*3+1],a[i*3+2]).applyMatrix4(_wm);pos.push(_wv.x,_wv.y,_wv.z);}
  for(const c of S.cons){const p=c[0]*3,q=c[1]*3;c[3]=Math.hypot(pos[p]-pos[q],pos[p+1]-pos[q+1],pos[p+2]-pos[q+2]);}
  for(let i=0;i<n*3;i++){S.P[i]=S.O[i]=S.T[i]=pos[i];}S.init=true;
}
function updateWavers(c,t,sp){
  if(c.root.visible===false)return;
  {const dx=c.root.position.x-camera.position.x,dz=c.root.position.z-camera.position.z,d2=dx*dx+dz*dz;if(d2>3600)return;if(d2>900&&((c._fc=(c._fc||0)+1)&1))return;}
  let dt=t-(c._lt==null?t-1/60:c._lt);c._lt=t;if(!(dt>0)||dt>.1)dt=1/60;dt=Math.min(dt,.05);
  const f=dt*60,lift=c.lift||0;
  c.root.updateMatrixWorld(true);
  const gT=1+.45*Math.sin(t*.8)+.3*Math.sin(t*2.1+1.3);
  for(const w of c.wavers){
    if(!w.sim)clothInit(w);const S=w.sim,P=S.P,O=S.O,T=S.T,W1=w.sx+1,n=W1*(w.sy+1),a=w.base;
    const wk=(w.wind==null?.4:w.wind),lk=w.lift==null?.3:w.lift;
    w.mesh.updateWorldMatrix(true,false);_wm.copy(w.mesh.matrixWorld);_wi.copy(_wm).invert();
    // rest pose in world (includes arm/cape/body animation) and wind
    const sc=c.root.scale.x||1,fl=.045*sc;
    for(let i=0;i<n;i++){_wv.set(a[i*3],a[i*3+1],a[i*3+2]).applyMatrix4(_wm);T[i*3]=_wv.x;T[i*3+1]=_wv.y;T[i*3+2]=_wv.z;}
    for(let i=0;i<n;i++){
      const r=(i/W1)|0,q=i%W1,k=w.pin==='left'?q/w.sx:r/w.sy,o=i*3;
      if(S.pinned[i]){P[o]=O[o]=T[o];P[o+1]=O[o+1]=T[o+1];P[o+2]=O[o+2]=T[o+2];continue;}
      if(!S.init){}
      const damp=Math.pow(.93,f);
      const vx=(P[o]-O[o])*damp,vy=(P[o+1]-O[o+1])*damp,vz=(P[o+2]-O[o+2])*damp;O[o]=P[o];O[o+1]=P[o+1];O[o+2]=P[o+2];
      const gust=1+.5*Math.sin(t*2.2+k*3+w.ph);
      const wf=wk*k*gust*gT*.0042*f*f*sc;                           // wind push (more at the free end)
      const flut=Math.sin(t*w.spd+k*5+w.ph)*fl*(.4+k)*f*.12;      // gentle air flutter so it never looks stiff
      const rx=T[o]+0,ry=T[o+1]+lift*lk*k*w.h*.55,rz=T[o+2];
      const spring=Math.min(1,(.05+.03*(1-k))*f);                   // slow pull back to the resting drape
      P[o]+=vx+WIND.x*wf+(rx-P[o])*spring;
      P[o+1]+=vy-.0009*f*f*sc*k+(ry-P[o+1])*spring;
      P[o+2]+=vz+WIND.z*wf+flut+(rz-P[o+2])*spring;
    }
    for(let it=0;it<3;it++){
      for(const cn of S.cons){const p=cn[0]*3,q=cn[1]*3,dx=P[q]-P[p],dy=P[q+1]-P[p+1],dz=P[q+2]-P[p+2],d=Math.hypot(dx,dy,dz)||1e-6;
        const rest=cn[3]*sc/sc,diff=(d-rest)/d*.5*cn[2]*(cn[2]<1&&d<rest?.35:1);
        const pa=S.pinned[cn[0]],pb=S.pinned[cn[1]];const wa=pa?0:(pb?2:1),wb=pb?0:(pa?2:1);
        P[p]+=dx*diff*wa;P[p+1]+=dy*diff*wa;P[p+2]+=dz*diff*wa;P[q]-=dx*diff*wb;P[q+1]-=dy*diff*wb;P[q+2]-=dz*diff*wb;}
    }
    // keep it near the body so it can't wander off or explode
    const maxD=w.h*.7*sc,pa=w.geo.attributes.position,arr=pa.array;
    for(let i=0;i<n;i++){const o=i*3;let dx=P[o]-T[o],dy=P[o+1]-T[o+1],dz=P[o+2]-T[o+2];const d=Math.hypot(dx,dy,dz);
      if(!(d===d)){P[o]=O[o]=T[o];P[o+1]=O[o+1]=T[o+1];P[o+2]=O[o+2]=T[o+2];dx=dy=dz=0;}
      else if(d>maxD){const s=maxD/d;P[o]=T[o]+dx*s;P[o+1]=T[o+1]+dy*s;P[o+2]=T[o+2]+dz*s;}
      _wv.set(P[o],P[o+1],P[o+2]).applyMatrix4(_wi);arr[o]=_wv.x;arr[o+1]=_wv.y;arr[o+2]=_wv.z;}
    pa.needsUpdate=true;w.geo.computeVertexNormals();
    if(w.after)w.after();
  }
  for(const f2 of c.anim)f2(t);
}
function setFlash(c,k){for(const m of c.flash)if(m&&m.emissive)m.emissive.setRGB(k,k*.7,k*.5);}
/* ================= REDESIGNED HEROES: Cinder Newt + Gale Raven (dedicated builders, same rig contract as makeHumanoid) ================= */
function _rig(o){
  const root=new THREE.Group(),pivot=new THREE.Group(),body=new THREE.Group();pivot.position.y=.9;body.position.y=-.9;root.add(pivot);pivot.add(body);root.scale.setScalar(o.scale||1);
  const mm=TOON({vertexColors:true});
  const add=(g,x,y,z,mat,parent=body)=>{const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
  const aim=(m,x,y,z)=>{m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(x,y,z).normalize());return m;};
  const glow=c=>new THREE.MeshBasicMaterial({color:c,fog:false});
  const cyl=(rt,rb,h,s=8)=>new THREE.CylinderGeometry(rt,rb,h,s);
  const cone=(r,h,s=4)=>new THREE.ConeGeometry(r,h,s);
  const spike=(r,len,x,y,z,dx,dy,dz,mat,parent=body)=>{const d=new THREE.Vector3(dx,dy,dz).normalize();const m=add(cone(r,len),x+d.x*len/2,y+d.y*len/2,z+d.z*len/2,mat,parent);aim(m,dx,dy,dz);return m;};
  const motes=(anim,color,rad,leaf)=>{const mg=glow(color),ms=[];for(let i=0;i<9;i++){const m=new THREE.Mesh(leaf?new THREE.OctahedronGeometry(.045):new THREE.SphereGeometry(.03,5,4),mg);if(leaf)m.scale.set(.45,1.7,.3);root.add(m);ms.push(m);}
    anim.push(t=>{ms.forEach((m,i)=>{const k=((t*(.26+(i%3)*.06)+i/9)%1),a=t*.7+i*.7,r=rad+.12*Math.sin(t+i);m.position.set(Math.cos(a)*r,.1+k*2.3,Math.sin(a)*r);m.scale.setScalar(Math.sin(k*PI)*(leaf?1:1));if(leaf)m.scale.set(.45*Math.sin(k*PI),1.7*Math.sin(k*PI),.3*Math.sin(k*PI));m.rotation.set(t*2+i,t*1.4,i);});});};
  return {root,pivot,body,mm,add,aim,glow,cyl,cone,spike,motes};
}

function makeNewt(o){
  const {root,pivot,body,mm,add,aim,glow,cyl,cone,spike,motes}=_rig(o);
  const skin=LM('#ee5a24'),skinD=LM('#c4411a'),belly=LM('#ffd9a6'),bellyD=LM('#e8b27a'),spot=LM('#7c2410'),cloth=LM('#3d1a38'),clothL=LM('#6a2d52'),gold=LM('#ffc23a'),ember=LM('#ff8a2a'),dark=LM('#1c0e18'),white=LM('#f6efe0');
  const flash=[mm],wavers=[],anim=[],c0={lift:0};
  const sph=(r,a=8,b=6)=>new THREE.SphereGeometry(r,a,b),box=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
  // ---- legs: cloth pantaloons, bare lizard shins, three-toed clawed feet
  const legs=[];for(const sx of[-1,1]){const l=new THREE.Group();l.position.set(sx*.12,.92,0);body.add(l);
    add(cyl(.105,.09,.42,7),0,-.21,0,cloth,l);add(cyl(.118,.118,.045,7),0,-.4,0,gold,l);
    add(cyl(.062,.048,.4,6),0,-.62,0,skin,l);add(sph(.062),0,-.82,0,skin,l);add(box(.13,.05,.16),0,-.865,.06,skin,l);
    for(let k=-1;k<=1;k++){spike(.03,.15,k*.045,-.865,.12,k*.3,-.08,1,skin,l);spike(.016,.07,k*.045+k*.3*.14,-.88,.26,k*.35,-.4,1,dark,l);}
    add(sph(.03),0,-.64,-.05,spot,l).scale.set(1,1.4,.5);
    mergeBucket(l,mm);legs.push(l);}
  // ---- torso: orange back, cream belly plates, bandolier, belt, pouches, potion
  const torso=add(cyl(.22,.19,.56,8),0,1.3,0,skin);torso.scale.z=.75;
  add(box(.2,.5,.04),0,1.28,.158,belly);for(let i=0;i<5;i++)add(box(.2,.012,.012),0,1.07+i*.1,.18,bellyD);
  add(box(.4,.2,.26),0,.95,0,cloth);
  const belt=add(cyl(.235,.235,.07,8),0,1.03,0,dark);belt.scale.z=.78;add(box(.09,.075,.03),0,1.03,.19,gold);
  for(const sx of[-1,1])add(box(.1,.12,.07),sx*.2,.97,.12,clothL);
  add(cyl(.032,.032,.1,6),.2,.9,.18,new THREE.MeshToonMaterial({color:'#ff5a2a',gradientMap:TGS}));add(cyl(.018,.018,.04,6),.2,.96,.18,LM('#8a5a30'));
  add(box(.06,.56,.02),0,1.3,.18,dark).rotation.z=.4;add(sph(.035),.05,1.33,.19,gold);
  add(cyl(.08,.1,.14,7),0,1.64,0,skin);
  // shoulder mantle + upturned collar
  const mantle=add(cyl(.33,.27,.13,8),0,1.58,0,clothL);mantle.scale.z=.8;const mt=add(new THREE.TorusGeometry(.3,.02,4,12),0,1.52,0,gold);mt.rotation.x=PI/2;mt.scale.set(1,.8,1);
  for(const sx of[-1,1])spike(.06,.34,sx*.17,1.62,-.14,sx*.35,1,-.5,clothL);spike(.07,.42,0,1.64,-.2,0,1,-.6,clothL);
  // dorsal fins down the spine
  for(let i=0;i<6;i++){const f=spike(.06*(1-i*.08),.27*(1-i*.07),0,1.46-i*.1,-.15,0,.7,-1,i%2?ember:gold);f.scale.x=.35;}
  mergeBucket(body,mm);
  // cloth skirt (4 panels) + hip sash
  const rm=LM('#3d1a38',{side:THREE.DoubleSide});flash.push(rm);
  for(let i=0;i<4;i++){const a=i*PI/2+.4,sw=makeWaver(.46,.8,2,4,rm,.06,3.2,i*1.7);sw.wind=0;sw.lift=.6;sw.mesh.position.set(Math.cos(a)*.3,.52,Math.sin(a)*.3*.9);sw.mesh.rotation.y=PI/2-a;body.add(sw.mesh);wavers.push(sw);}
  {const gm=LM('#ffc23a',{side:THREE.DoubleSide});flash.push(gm);const sw=makeWaver(.13,.7,1,5,gm,.07,4.6,2.2);sw.wind=.9;sw.lift=.5;sw.mesh.position.set(-.2,.62,.2);body.add(sw.mesh);wavers.push(sw);}
  // rune ring floating behind the back
  {const ring=new THREE.Group();ring.position.set(0,1.45,-.5);body.add(ring);const gm=glow('#ffb02a');
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(.42,.014,5,36),gm));ring.add(new THREE.Mesh(new THREE.TorusGeometry(.3,.008,4,30),glow('#ff7a22')));
    for(let i=0;i<10;i++){const a=i/10*TAU,tk=new THREE.Mesh(new THREE.BoxGeometry(.028,i%2?.06:.1,.012),gm);tk.position.set(Math.cos(a)*.42,Math.sin(a)*.42,0);tk.rotation.z=a+PI/2;ring.add(tk);}
    for(let i=0;i<4;i++){const a=i*PI/2+PI/4,d=new THREE.Mesh(new THREE.OctahedronGeometry(.045),gm);d.scale.set(.6,1,.3);d.position.set(Math.cos(a)*.3,Math.sin(a)*.3,0);d.rotation.z=a;ring.add(d);}
    anim.push(t=>{ring.rotation.z=t*.55;ring.position.y=1.45+Math.sin(t*1.6)*.03;});}
  // ---- head: broad salamander skull, cream chin, bulging slit eyes, fire gills
  const head=new THREE.Group();head.position.set(0,1.82,0);body.add(head);
  const horn=LM('#f4e2b8'),SKz=(x,y)=>{const q=1-(x/.204)**2-((y-.02)/.18)**2;return q>0?-.02+.224*Math.sqrt(q):0;};
  const X3=new THREE.Vector3(1,0,0),line=(pts,mat,w=.011)=>{for(let i=0;i<pts.length-1;i++){const p=pts[i],q=pts[i+1],d=q.clone().sub(p),m=add(box(d.length()+.004,w,w),(p.x+q.x)/2,(p.y+q.y)/2,(p.z+q.z)/2,mat,head);m.quaternion.setFromUnitVectors(X3,d.clone().normalize());}};
  // ---- dragon-lizard head: narrow skull, long tapered muzzle, forward-set eyes, brow plates, swept horns
  add(sph(.2,14,11),0,.02,-.02,skin,head).scale.set(1.02,.9,1.12);
  add(sph(.16,10,8),0,-.06,.02,skin,head).scale.set(1.05,.7,1.1);
  add(sph(.14,12,9),0,-.035,.19,skin,head).scale.set(.8,.58,1.5);
  add(sph(.06,8,6),0,-.012,.335,skinD,head).scale.set(1.1,.7,1);
  add(sph(.12,10,8),0,-.105,.14,belly,head).scale.set(.85,.38,1.5);
  // nostrils with a faint ember glow
  for(const sx of[-1,1]){add(sph(.014,5,4),sx*.035,.0,.384,dark,head).scale.set(1,1.6,.6);}
  // closed mouth line along both sides + fangs
  for(const sx of[-1,1]){const P=[[.073,-.075,.08],[.088,-.085,.15],[.088,-.087,.22],[.07,-.087,.29],[.045,-.087,.33],[.016,-.087,.35]].map(([x,y,z])=>new THREE.Vector3(sx*(x+.004),y,z));line(P,dark);
    spike(.014,.075,sx*.088,-.085,.27,0,-1,.1,white,head);spike(.01,.04,sx*.09,-.083,.2,0,-1,0,white,head);spike(.01,.04,sx*.1,-.083,.14,0,-1,0,white,head);
    spike(.01,.04,sx*.045,-.1,.325,0,1,.1,white,head);}
  // eyes: golden sclera, amber iris, vertical slit, highlights (each side blinks / looks around)
  const eyeM=new THREE.MeshBasicMaterial({color:o.eye||'#ffe27a'}),eyes=[],eyeG=[],lookG=[];
  for(const sx of[-1,1]){const g=new THREE.Group();g.position.set(sx*.115,.07,.14);g.rotation.y=sx*.35;head.add(g);eyeG.push(g);
    const e=new THREE.Mesh(sph(.052,12,9),eyeM);g.add(e);eyes.push(e);
    const lk=new THREE.Group();g.add(lk);lookG.push(lk);
    const ir=new THREE.Mesh(sph(.037,10,8),glow('#ff7a1a'));ir.position.z=.036;ir.scale.set(1,1,.3);lk.add(ir);
    const pu=new THREE.Mesh(sph(.022,8,6),glow('#150909'));pu.position.z=.046;pu.scale.set(.3,1.35,.3);lk.add(pu);
    const h1=new THREE.Mesh(sph(.01,6,5),glow('#ffffff'));h1.position.set(.011,.02,.058);lk.add(h1);
    const br=add(box(.15,.045,.085),sx*.105,.125,.135,skinD,head);br.rotation.set(-.2,0,sx*.32);
    spike(.026,.11,sx*.16,.125,.1,sx*.8,.25,-.6,horn,head);}
  // swept-back horns (three tapering segments each) with ember tips
  for(const sx of[-1,1]){let p=new THREE.Vector3(sx*.1,.15,.02);const segs=[[sx*.4,.8,-.35,.17,.05],[sx*.3,.35,-.9,.16,.036],[sx*.1,-.15,-1,.13,.022]];
    for(const [dx,dy,dz,len,r] of segs){const d=new THREE.Vector3(dx,dy,dz).normalize();spike(r,len,p.x,p.y,p.z,dx,dy,dz,horn,head);add(sph(r*.95,6,5),p.x,p.y,p.z,horn,head);p=p.clone().add(d.multiplyScalar(len));}
    const tp=new THREE.Mesh(sph(.017,6,5),glow('#ffb02a'));tp.position.copy(p);head.add(tp);}
  // cheek / jaw spikes and chin spurs
  for(const sx of[-1,1]){for(let i=0;i<3;i++){spike(.024-i*.003,.1-i*.015,sx*.165,-.03-i*.035,.02-i*.04,sx*.8,-.2-i*.1,-.5,horn,head);}
    const sc=[[.17,-.04],[.165,0],[.15,-.07],[.16,.035]];for(const [x,y] of sc){const z=SKz(x,y)+.002,m=add(sph(.024,6,5),sx*x,y,z,skinD,head);aim(m,sx*x/.0416,(y-.02)/.0324,(z+.02)/.0502);m.scale.y=.3;}}
  for(let i=0;i<2;i++)spike(.02,.07,0,-.148,.2-i*.07,0,-1,-.5,ember,head);
  // brow-centre ember mark + nose-bridge ridge
  const mk=new THREE.Mesh(new THREE.OctahedronGeometry(.04),glow('#ffcf4a'));mk.scale.set(.7,1.35,.3);mk.position.set(0,.145,SKz(0,.145)+.008);head.add(mk);
  for(const sx of[-1,1]){const m2=new THREE.Mesh(new THREE.OctahedronGeometry(.02),glow('#ff8a2a'));m2.scale.set(.7,1.3,.3);m2.position.set(sx*.07,.13,SKz(sx*.07,.13)+.006);m2.rotation.z=sx*-.4;head.add(m2);}
  for(let i=0;i<4;i++){const f=spike(.02,.06,0,.04-i*.0,.2+i*.05,0,1,.2,ember,head);f.scale.x=.5;}
  // spots on the crown, mane crest
  for(const [dx,dy,dz] of[[.5,.8,.1],[-.5,.85,-.1],[.1,.95,-.2],[-.3,.8,-.5],[.6,.6,-.5],[-.6,.55,-.55],[0,.7,-.7]]){const L=Math.hypot(dx,dy,dz),p=add(sph(.024,6,5),dx/L*.204,.02+dy/L*.18,-.02+dz/L*.224,spot,head);aim(p,dx,dy,dz);p.scale.set(1,.35,1);}
  for(let i=0;i<5;i++){const f=spike(.04,.19-i*.017,0,.2-i*.01,.0-i*.08,0,.6,-1,i%2?ember:gold,head);f.scale.x=.4;}
  mergeBucket(head,mm);
  // ember wisps puffing from the nostrils
  const wisps=[];for(let i=0;i<4;i++){const w=new THREE.Mesh(sph(.02,5,4),glow(i%2?'#ffb02a':'#ff7a22'));head.add(w);wisps.push(w);}
  anim.push(t=>{const ph=t%3.6,b=ph>3.42?Math.sin((ph-3.42)/.18*PI):0;eyeG.forEach(g=>{g.scale.y=Math.max(.08,1-.92*b);});lookG.forEach(l=>{l.position.x=Math.sin(t*.6)*.008;l.position.y=Math.sin(t*.43)*.005;});
    const k=1+Math.sin(t*3)*.15;mk.scale.set(.7*k,1.35*k,.3);
    wisps.forEach((w,i)=>{const sx=i%2?1:-1,u=((t*.55+i*.27)%1);w.position.set(sx*(.035+u*.03),.02+u*.18,.39+u*.07);w.scale.setScalar(Math.max(.01,(1-u)*(.8+.4*Math.sin(t*9+i))));});});
  const gills=[];for(const sx of[-1,1]){const g=new THREE.Group();g.position.set(sx*.17,.05,-.05);head.add(g);gills.push([g,sx]);
    const gm=LM('#ff7a3a'),tm=glow('#ffd23a'),fm=glow('#ff5a1a');
    [[.9,.55,-.35,.34],[1,.12,-.5,.38],[.9,-.3,-.45,.32]].forEach(([dx,dy,dz,len],i)=>{const d=new THREE.Vector3(sx*dx,dy,dz).normalize();
      const st=add(cyl(.009,.016,len,5),d.x*len/2,d.y*len/2,d.z*len/2,gm,g);aim(st,d.x,d.y,d.z);
      for(let b=0;b<3;b++){const q=.35+b*.2,side=new THREE.Vector3(-d.z,0,d.x).multiplyScalar(b%2?1:-1).add(d).normalize();const br=spike(.008,.12,d.x*len*q,d.y*len*q,d.z*len*q,side.x,side.y,side.z,gm,g);}
      const tip=new THREE.Mesh(new THREE.SphereGeometry(.032,6,5),tm);tip.position.copy(d).multiplyScalar(len);g.add(tip);
      const fl=new THREE.Mesh(cone(.028,.1,5),fm);fl.position.copy(d).multiplyScalar(len+.05);aim(fl,d.x,d.y+.6,d.z);g.add(fl);});}
  anim.push(t=>{gills.forEach(([g,sx],i)=>{g.rotation.z=sx*(Math.sin(t*3.1+i)*.09);g.rotation.y=Math.sin(t*2.3+i*2)*.08;});});
  // ---- arms: bare upper arm, flared mage sleeve, three-clawed hands
  const arms=[];for(const sx of[-1,1]){const a=new THREE.Group();a.position.set(sx*.34,1.52,0);body.add(a);
    add(cyl(.065,.055,.3,6),0,-.17,0,skin,a);const sp=add(sph(.12,8,6),sx*.02,.03,0,clothL,a);sp.scale.set(1,.7,1);const rg=add(new THREE.TorusGeometry(.115,.014,4,10),sx*.02,-.02,0,gold,a);rg.rotation.x=PI/2;
    add(cyl(.07,.125,.3,8),0,-.45,0,cloth,a);add(cyl(.128,.128,.03,8),0,-.6,0,gold,a);
    add(box(.09,.08,.05),0,-.665,0,skin,a);
    for(let f=-1;f<=1;f++){spike(.02,.1,f*.03,-.7,.01,f*.1,-1,.15,skin,a);spike(.011,.05,f*.03+f*.1*.1,-.8,.02,f*.1,-1,.3,dark,a);}
    spike(.018,.07,sx*-.05,-.65,.02,sx*-.7,-.5,.2,skin,a);
    mergeBucket(a,mm);arms.push(a);}
  // ---- tail: thick tapering lizard tail with fin ridge, belly stripe, flame tip
  let par=body;const N=6,segs=[];
  for(let i=0;i<N;i++){const g=new THREE.Group();g.position.set(0,i?0:.95,i?-.3:-.18);par.add(g);const r=.13*(1-i*.13);
    add(sph(r,8,6),0,0,-.12,skin,g).scale.z=1.7;add(sph(r*.75,6,5),0,-r*.4,-.12,belly,g).scale.set(.8,.5,1.5);
    const f=spike(r*.55,r*1.7,0,r*.85,-.12,0,1,-.4,i%2?gold:ember,g);f.scale.x=.35;if(i%2===0)add(sph(r*.38,6,5),0,r*.88,-.12,spot,g).scale.set(1.2,.4,1.5);
    mergeBucket(g,mm);segs.push(g);par=g;}
  {const fg=new THREE.Group();fg.position.set(0,0,-.42);segs[N-1].add(fg);const cols=['#ff5a1a','#ff9a2a','#ffe27a'];cols.forEach((c,i)=>{const f=new THREE.Mesh(cone(.12-i*.03,.55-i*.12,6),glow(c));f.rotation.x=-PI/2;f.position.z=-i*.02;fg.add(f);});
    anim.push(t=>{fg.scale.set(1+Math.sin(t*14)*.18,1+Math.sin(t*11)*.22,1+Math.sin(t*9)*.25);});}
  anim.push(t=>{segs.forEach((g,i)=>{g.rotation.y=Math.sin(t*2.4-i*.7)*.3;g.rotation.x=.16+Math.sin(t*1.7-i*.5)*.07;});});
  // ---- staff: twisted wood, gold wraps, prong cradle holding a fire crystal
  const weapon=new THREE.Group();weapon.position.set(0,-.64,0);arms[1].add(weapon);weapon.rotation.x=PI*.42;const tip=new THREE.Object3D();weapon.add(tip);
  add(cyl(.032,.045,2.0,7),0,.9,0,LM('#4a2a1c'),weapon);for(const y of[.2,.32,1.6,1.72])add(cyl(.05,.05,.04,7),0,y,0,gold,weapon);
  for(let i=0;i<8;i++){const a=i*.8;add(sph(.035,5,4),Math.cos(a)*.04,.35+i*.15,Math.sin(a)*.04,LM('#6a3a22'),weapon);}
  add(cyl(.075,.05,.1,7),0,1.78,0,gold,weapon);
  for(let i=0;i<4;i++){const a=i*PI/2+.4;spike(.03,.32,Math.cos(a)*.07,1.82,Math.sin(a)*.07,Math.cos(a)*.5,1,Math.sin(a)*.5,gold,weapon);}
  const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.15),glow(o.orb||'#ffb02a'));crystal.scale.y=1.45;crystal.position.y=2.02;weapon.add(crystal);
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(.08),glow('#fff2b0'));core.scale.y=1.45;core.position.y=2.02;weapon.add(core);
  const orbR=new THREE.Mesh(new THREE.TorusGeometry(.23,.012,4,24),glow('#ff7a22'));orbR.position.y=2.02;weapon.add(orbR);
  const fl2=[];for(let i=0;i<5;i++){const f=new THREE.Mesh(cone(.05,.24,5),glow(i%2?'#ff7a22':'#ffd23a'));f.position.set(Math.cos(i*1.26)*.1,2.25,Math.sin(i*1.26)*.1);weapon.add(f);fl2.push(f);}
  anim.push(t=>{crystal.rotation.y=t*2.2;crystal.scale.y=1.45+Math.sin(t*3)*.12;core.rotation.y=-t*3;orbR.rotation.set(PI/2+Math.sin(t*1.3)*.4,t*1.5,0);fl2.forEach((f,i)=>{f.scale.y=1+Math.sin(t*10+i*1.9)*.4;f.position.y=2.25+Math.sin(t*10+i*1.9)*.03;});});
  tip.position.set(0,2.05,0);weapon.rotation.x=.1;
  mergeBucket(weapon,mm);
  motes(anim,'#ff9a3a',.55,false);
  root.userData.flash=flash;
  const ret={root,pivot,body,legs,arms,head,torso,cape:null,capeW:null,weapon,tip,flash,eyeM,eyes,hipY:.92,wavers,anim};c0.ref=ret;return ret;
}

function makeRaven(o){
  const {root,pivot,body,mm,add,aim,glow,cyl,cone,spike,motes}=_rig(o);
  const fA=LM('#1b1b2e'),fB=LM('#2c2850'),fC=LM('#3f3578'),fD=LM('#12121c'),legM=LM('#4a4250'),gold=LM('#e0b84e'),beakM=LM('#d8ae44'),beakD=LM('#a8832e'),steel=LM('#9aa4ba'),leather=LM('#3a2a24'),cloth=LM('#22203e'),dark=LM('#0e0d16'),bone=LM('#2a2438');
  const CY='#9fe8ff';
  const flash=[mm],wavers=[],anim=[],c0={lift:0};
  const sph=(r,a=8,b=6)=>new THREE.SphereGeometry(r,a,b),box=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
  const FM=[fA,fB,fC];
  // ---- legs: fluffy feathered thighs, thin digitigrade shins, gold-clawed talons
  const legs=[];for(const sx of[-1,1]){const l=new THREE.Group();l.position.set(sx*.11,.92,0);body.add(l);
    add(sph(.125,8,6),0,-.17,0,fB,l).scale.set(1,1.35,1.05);
    for(let k=0;k<7;k++){const a=k/7*TAU;spike(.05,.2,Math.cos(a)*.1,-.3,Math.sin(a)*.1,Math.cos(a)*.3,-1,Math.sin(a)*.3,FM[k%3],l);}
    add(cyl(.038,.03,.4,5),0,-.55,0,legM,l);add(sph(.045,6,5),0,-.36,-.03,legM,l);add(cyl(.05,.05,.03,6),0,-.74,0,gold,l);
    for(let k=-1;k<=1;k++){spike(.03,.24,k*.07,-.86,.02,k*.3,-.1,1,legM,l);spike(.016,.09,k*.07+k*.3*.22,-.89,.25,k*.3,-.45,1,gold,l);}
    spike(.028,.16,0,-.86,-.02,0,-.1,-1,legM,l);spike(.015,.07,0,-.88,-.17,0,-.4,-1,gold,l);
    mergeBucket(l,mm);legs.push(l);}
  // ---- torso: dark plumage with layered chest scales, belt, pouch
  const torso=add(cyl(.24,.19,.58,8),0,1.3,0,fA);torso.scale.z=.72;
  add(box(.44,.2,.28),0,.95,0,cloth);
  for(let r=0;r<3;r++)for(let k=0;k<7;k++){const a=(k-3)/3*1.0+(r%2?.15:0);spike(.07,.17,Math.sin(a)*.2,1.55-r*.15,Math.cos(a)*.165,Math.sin(a)*.5,-1,.7,FM[(k+r)%3],body).scale.z=.4;}
  const belt=add(cyl(.215,.215,.065,8),0,1.03,0,leather);belt.scale.z=.76;add(box(.085,.075,.03),0,1.03,.18,gold);add(box(.11,.13,.07),.2,.97,.1,leather);add(box(.08,.12,.07),-.2,.97,.1,leather);
  add(cyl(.075,.09,.16,7),0,1.64,0,fD);
  // layered feather mantle (3 tiers) + shaggy neck ruff
  for(let t=0;t<3;t++){const n=10+t*2,R=.25+t*.07;for(let k=0;k<n;k++){const a=k/n*TAU+t*.3;const f=spike(.065,.26+t*.05,Math.cos(a)*R,1.66-t*.1,Math.sin(a)*R,Math.cos(a)*.9,-.7-t*.15,Math.sin(a)*.9,FM[(k+t)%3]);f.scale.z=.5;}}
  for(let k=0;k<12;k++){const a=k/12*TAU+.1;spike(.045,.2,Math.cos(a)*.14,1.72,Math.sin(a)*.14,Math.cos(a)*.9,.15,Math.sin(a)*.9,FM[k%3]);}
  mergeBucket(body,mm);
  for(let k=0;k<7;k++){const a=k/7*TAU+.2,tp=new THREE.Mesh(cone(.016,.07,4),glow(CY));tp.position.set(Math.cos(a)*.37,1.46,Math.sin(a)*.37);aim(tp,Math.cos(a)*.9,-.9,Math.sin(a)*.9);body.add(tp);}
  // coat tails
  const cm=LM('#22203e',{side:THREE.DoubleSide});flash.push(cm);
  for(const sx of[-1,1]){const sw=makeWaver(.24,.85,2,5,cm,.07,3.4,sx*1.1);sw.wind=.7;sw.lift=.5;sw.mesh.position.set(sx*.11,.5,-.18);body.add(sw.mesh);wavers.push(sw);}
  // ---- head: glossy raven skull, hooked beak, amber eyes, swept crest, circlet
  const head=new THREE.Group();head.position.set(0,1.82,0);body.add(head);
  add(sph(.205,14,11),0,0,0,fA,head).scale.set(.95,1,1.12);
  spike(.085,.4,0,0,.17,0,-.1,1,beakM,head).scale.x=.85;spike(.045,.15,0,-.03,.5,0,-1,.55,beakM,head);
  spike(.06,.3,0,-.075,.17,0,-.03,1,beakD,head).scale.x=.8;
  for(const sx of[-1,1]){add(sph(.011,5,4),sx*.03,.025,.26,dark,head);
    spike(.035,.17,sx*.12,.12,.12,sx*.55,.3,-1,fD,head);
    spike(.04,.2,sx*.19,-.02,.05,sx*.7,-.15,-1,FM[1],head);spike(.04,.18,sx*.18,-.08,.08,sx*.6,-.4,-1,fA,head);}
  for(let i=0;i<6;i++){const f=spike(.05,.28+(i%2)*.08,(i-2.5)*.035,.19,.02-i*.04,(i-2.5)*.1,.6,-1,FM[i%3],head);f.scale.x=.5;}
  const cr=add(new THREE.TorusGeometry(.2,.012,4,18),0,.1,.0,gold,head);cr.rotation.x=PI/2;
  for(const sx of[-1,1]){spike(.03,.22,sx*.21,.02,-.02,sx*.2,-1,-.15,beakM,head);spike(.02,.14,sx*.21,-.17,-.03,sx*.2,-1,-.1,LM(CY),head);}
  mergeBucket(head,mm);
  {const g=new THREE.Mesh(new THREE.OctahedronGeometry(.045),glow(CY));g.scale.set(.7,1.2,.4);g.position.set(0,.1,.215);head.add(g);anim.push(t=>{const k=1+Math.sin(t*3)*.15;g.scale.set(.7*k,1.2*k,.4);});}
  const eyeM=new THREE.MeshBasicMaterial({color:o.eye||'#ffd24a'}),eyes=[];
  for(const sx of[-1,1]){const e=new THREE.Mesh(sph(.045,8,6),eyeM);e.position.set(sx*.125,.06,.115);head.add(e);eyes.push(e);const p=new THREE.Mesh(sph(.022,6,5),new THREE.MeshBasicMaterial({color:'#0a0810'}));p.position.set(sx*.14,.06,.15);head.add(p);}
  // ---- arms: plumed forearms, steel bracers, taloned gloves
  const arms=[];for(const sx of[-1,1]){const a=new THREE.Group();a.position.set(sx*.34,1.52,0);body.add(a);
    add(cyl(.07,.06,.3,6),0,-.17,0,fA,a);add(sph(.095,8,6),sx*.02,.02,0,fB,a).scale.set(1,.8,1);
    add(cyl(.065,.055,.3,6),0,-.46,0,fA,a);add(cyl(.082,.075,.2,7),0,-.5,0,steel,a);
    for(let i=0;i<4;i++){const f=spike(.04,.22+i*.025,0,-.26-i*.09,-.07,0,-1,-.45,FM[i%3],a);f.scale.z=.4;}
    {const bm=add(new THREE.TorusGeometry(.083,.008,4,12),0,-.42,0,glow(CY),a);bm.rotation.x=PI/2;}
    add(box(.1,.1,.06),0,-.665,0,leather,a);add(box(.04,.075,.04),sx*-.075,-.66,.02,leather,a).rotation.z=sx*.5;
    for(let f=0;f<4;f++){add(box(.022,.085,.03),-.039+f*.026,-.74,.018,leather,a);spike(.012,.06,-.039+f*.026,-.78,.03,0,-1,.3,gold,a);}
    mergeBucket(a,mm);arms.push(a);}
  // ---- wings: bone arm with covert / secondary / primary rows, glowing tips; they spread on glide, cheer and jumps
  const wingRig=[];
  for(const sx of[-1,1]){const pv=new THREE.Group();pv.position.set(sx*.2,1.5,-.2);body.add(pv);const wg=new THREE.Group();pv.add(wg);
    const S=new THREE.Vector3(0,0,0),W=new THREE.Vector3(sx*.48,.28,0),T=new THREE.Vector3(sx*.98,-.04,0);
    const bn=(p,q,r)=>{const d=q.clone().sub(p),L=d.length(),m=add(cyl(r,r*.75,L,5),(p.x+q.x)/2,(p.y+q.y)/2,(p.z+q.z)/2,bone,wg);aim(m,d.x,d.y,d.z);};
    bn(S,W,.045);bn(W,T,.035);add(sph(.065,7,6),W.x,W.y,W.z,gold,wg);add(sph(.075,7,6),0,0,0,fB,wg);
    const tips=[];const row=(p,q,n,len0,len1,dx0,dx1,cols)=>{for(let i=0;i<n;i++){const t=(i+.5)/n,P=p.clone().lerp(q,t),len=len0+(len1-len0)*t,d=new THREE.Vector3(sx*(dx0+(dx1-dx0)*t),-1,-.25-t*.1);
      const f=spike(.062,len,P.x,P.y,P.z,d.x,d.y,d.z,cols[i%cols.length],wg);f.scale.z=.3;if(cols===FM&&false){}
      if(len>.6){const e=P.clone().add(d.clone().normalize().multiplyScalar(len)),tp=new THREE.Mesh(cone(.022,.08,4),glow(CY));tp.position.copy(e);aim(tp,d.x,d.y,d.z);tips.push([tp,e]);}}};
    row(S,W,6,.3,.34,.1,.15,[fB,fC]);          // coverts
    row(S,W,6,.55,.7,.08,.18,[fA,fB]);         // secondaries
    row(W,T,7,.72,1.05,.3,.75,[fA,fC,fB]);     // primaries
    mergeBucket(wg,mm);for(const [tp] of tips)wg.add(tp);
    pv.rotation.set(0,sx*.55,sx*.3);wingRig.push([pv,sx]);}
  anim.push(t=>{const L=Math.max((c0.ref&&c0.ref.lift)||0,0),az=c0.ref?Math.abs(c0.ref.arms[0].rotation.z):0,sp=clamp(az-.4,0,1);
    for(const [pv,sx] of wingRig){pv.rotation.z=sx*(.28+.05*Math.sin(t*1.6)+.5*L+.85*sp);pv.rotation.y=sx*(.55-.3*sp);}});
  // ---- tail fan
  {const tg=new THREE.Group();tg.position.set(0,.95,-.2);body.add(tg);
    for(let i=0;i<7;i++){const sp=(i-3)*.2,len=.8-Math.abs(i-3)*.07;const f=spike(.07,len,0,0,-.05,Math.sin(sp),-.28+Math.abs(i-3)*.03,-Math.cos(sp),FM[i%3],tg);f.scale.x=.3;
      const e=new THREE.Vector3(Math.sin(sp),-.28+Math.abs(i-3)*.03,-Math.cos(sp)).normalize().multiplyScalar(len);const tp=new THREE.Mesh(cone(.02,.08,4),glow(CY));tp.position.set(e.x,e.y,e.z-.05);aim(tp,e.x,e.y,e.z);tg.add(tp);}
    mergeBucket(tg,mm);anim.push(t=>{tg.rotation.x=.12+Math.sin(t*1.7)*.05;tg.rotation.y=Math.sin(t*1.1)*.08;});}
  // ---- scarf of wind
  {const sm=LM(CY,{side:THREE.DoubleSide});flash.push(sm);const sc=new THREE.Group();sc.position.set(0,1.62,-.05);body.add(sc);const w=makeWaver(.18,.8,1,6,sm,.08,5,1.3);w.mesh.position.set(.14,-.4,-.12);sc.add(w.mesh);wavers.push(w);}
  // ---- spear of gale: silver shaft, leather grip, feather tassels, glowing leaf blade
  const weapon=new THREE.Group();weapon.position.set(0,-.64,0);arms[1].add(weapon);weapon.rotation.x=PI*.42;const tip=new THREE.Object3D();weapon.add(tip);
  add(cyl(.032,.032,2.2,6),0,1.0,0,LM('#c9d2e4'),weapon);add(cyl(.045,.045,.5,6),0,.1,0,leather,weapon);for(const y of[-.1,.1,.3])add(cyl(.05,.05,.025,6),y+.1,y*0+y+.0,0,gold,weapon).position.y=y;
  add(sph(.06,6,5),0,-.15,0,gold,weapon);
  add(cyl(.05,.05,.1,6),0,2.08,0,gold,weapon);
  for(let i=0;i<4;i++){const a=i*PI/2+.5,f=spike(.04,.3,Math.cos(a)*.05,2.04,Math.sin(a)*.05,Math.cos(a)*.35,-1,Math.sin(a)*.35,FM[i%3],weapon);f.scale.z=.4;}
  const bm=new THREE.MeshStandardMaterial({color:0x9fe8ff,emissive:0x2a9fd0,metalness:.3,roughness:.2});
  add(cone(.1,.58,4),0,2.4,0,bm,weapon).scale.z=.3;
  for(const sx of[-1,1]){const w2=spike(.045,.26,sx*.06,2.12,0,sx*.8,1,0,bm,weapon);w2.scale.z=.3;}
  const ringT=new THREE.Mesh(new THREE.TorusGeometry(.09,.01,4,16),glow(CY));ringT.position.y=2.15;ringT.rotation.x=PI/2;weapon.add(ringT);anim.push(t=>{ringT.rotation.z=t*3;});
  tip.position.set(0,2.65,0);mergeBucket(weapon,mm);
  // ---- gale ring at the feet + drifting feathers
  {const gr=new THREE.Group();gr.position.y=.06;root.add(gr);const gm=new THREE.MeshBasicMaterial({color:CY,transparent:true,opacity:.55,fog:false});
    const t1=new THREE.Mesh(new THREE.TorusGeometry(.72,.009,4,40),gm);t1.rotation.x=PI/2;gr.add(t1);
    for(let i=0;i<4;i++){const a=i*PI/2,s2=new THREE.Mesh(cone(.035,.18,4),gm);s2.position.set(Math.cos(a)*.72,0,Math.sin(a)*.72);aim(s2,-Math.sin(a),0,Math.cos(a));gr.add(s2);}
    anim.push(t=>{gr.rotation.y=-t*1.1;});}
  motes(anim,CY,.65,true);
  root.userData.flash=flash;
  const ret={root,pivot,body,legs,arms,head,torso,cape:null,capeW:null,weapon,tip,flash,eyeM,eyes,hipY:.92,wavers,anim};c0.ref=ret;return ret;
}


function makeWolf(o){
  const root=new THREE.Group(),pivot=new THREE.Group(),body=new THREE.Group();pivot.position.y=.6;body.position.y=-.6;root.add(pivot);pivot.add(body);root.scale.setScalar(o.scale||1);
  const fur=LM(o.fur||'#7a7a82'),belly=LM('#c9c9cf'),dark=LM('#2a2a30'),flash=[];
  const add=(g,x,y,z,mat,p=body)=>{const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);m.castShadow=true;p.add(m);return m;};
  add(new THREE.BoxGeometry(.5,.5,1.05),0,.78,0,fur);add(new THREE.BoxGeometry(.46,.2,.9),0,.55,.0,belly);
  const head=new THREE.Group();head.position.set(0,.92,.62);body.add(head);add(new THREE.BoxGeometry(.38,.34,.4),0,0,.12,fur,head);add(new THREE.BoxGeometry(.2,.17,.3),0,-.06,.4,dark,head);
  for(const sx of[-1,1]){add(new THREE.ConeGeometry(.08,.22,4),sx*.13,.24,.02,fur,head);const e=new THREE.Mesh(new THREE.BoxGeometry(.05,.04,.02),new THREE.MeshBasicMaterial({color:'#ff4a2a',fog:false}));e.position.set(sx*.1,.06,.3);head.add(e);}
  const legs=[];for(const [x,z] of[[-.18,.4],[.18,.4],[-.18,-.4],[.18,-.4]]){const l=new THREE.Group();l.position.set(x,.58,z);body.add(l);add(new THREE.BoxGeometry(.14,.6,.14),0,-.3,0,fur,l);legs.push(l);}
  const tail=new THREE.Group();tail.position.set(0,.9,-.52);body.add(tail);add(new THREE.BoxGeometry(.12,.12,.55),0,0,-.26,fur,tail);tail.rotation.x=-.5;
  const mm=TOON({vertexColors:true});[body,head,tail,...legs].forEach(g=>mergeBucket(g,mm));flash.push(mm);
  return {root,pivot,body,legs,head,tail,flash,isWolf:true,tip:null,arms:[],weapon:null};
}
function poseHumanoid(c,s,t){
  const sp=s.sp,sw=Math.sin(s.phase)*sp*.95;
  c.legs[0].rotation.x=sw;c.legs[1].rotation.x=-sw;
  const idle=Math.sin(t*2+(s.seed||0))*.03;
  c.arms[0].rotation.x=-sw*.8+idle;c.arms[0].rotation.z=.08;
  let ax=sw*.8+idle*-1,az=-.08,twist=0,lean=sp*.14,bodyY=Math.abs(Math.sin(s.phase))*.06*sp+idle*.3;
  const wk=s.windup>0&&s.windup<=1?s.windup:-1;
  if(s.atk>=0){const a=s.atk,k=s.atkIdx||0;
    if(k===0){const w=a<.38?sstep(0,.38,a):1-sstep(.38,.62,a)*1.0;const wd=a<.38?-.4-w*2.6:-3.0+sstep(.38,.62,a)*2.7+sstep(.62,1,a)*.2;ax=wd;az=-.15;twist=a<.38?.5*sstep(0,.38,a):.5-sstep(.38,.62,a)*1.3;lean=a<.38?-.1:.35*sstep(.38,.6,a);}
    else if(k===1){ax=-1.55;az=-.1;const tw=a<.3?sstep(0,.3,a):1;twist=a<.3?1.15*tw:1.15-sstep(.3,.6,a)*2.5;lean=.1;c.arms[1].rotation.y=0;}
    else{const w=a<.45?sstep(0,.45,a):1;ax=a<.45?-.5-w*2.7:-3.2+sstep(.45,.66,a)*3.0;az=-.05;twist=0;lean=a<.45?-.25*w:.55*sstep(.45,.66,a);}
    c.arms[0].rotation.x=-1.0;
  }else if(s.spin>=0){ax=-1.5;az=-.1;twist=s.spin*TAU*2;lean=.1;c.arms[0].rotation.x=-1.4;c.arms[0].rotation.z=.9;}
  else if(wk>=0){const w=sstep(0,1,wk);ax=-.3-w*(s.bossy?2.9:2.6);az=-.1;lean=-.2*w;c.arms[0].rotation.x=-w*1.2;}
  else if(s.bow>=0){ax=-1.55;az=-.1;c.arms[0].rotation.x=-1.5-s.bow*0;}
  else if(s.recover>0){ax=-.2;lean=.3*s.recover;}
  c.arms[1].rotation.x=ax;c.arms[1].rotation.z=az;
  c.body.rotation.y=twist;c.body.rotation.x=lean;c.pivot.rotation.x=0;c.body.position.y=-.9+bodyY;
  c.head.rotation.x=-lean*.5;
  if(s.roll>=0){c.pivot.rotation.x=s.roll*TAU;c.body.rotation.x=0;c.arms[0].rotation.x=-1.6;c.arms[1].rotation.x=-1.6;c.legs[0].rotation.x=-1;c.legs[1].rotation.x=-1.1;c.pivot.position.y=.62+.1*Math.sin(s.roll*PI);}
  else c.pivot.position.y=.9;
  if(s.hit>0){c.body.rotation.x-=.45*s.hit;}
  if(s.glide){c.arms[0].rotation.set(-.3,0,.2);c.arms[1].rotation.set(-.3,0,-.2);c.arms[0].rotation.z=1.25;c.arms[1].rotation.z=-1.25;c.legs[0].rotation.x=.3;c.legs[1].rotation.x=-.1;c.body.rotation.x=.25;if(c.cape)c.cape.rotation.x=.9;}
  if(s.dead>0){c.pivot.rotation.x=-s.dead*PI*.5;c.pivot.position.y=.9-s.dead*.55;c.legs[0].rotation.x=0;c.legs[1].rotation.x=0;}
  if(s.swim){c.body.rotation.x=1.1;c.pivot.position.y=.3;c.arms[0].rotation.x=Math.sin(s.phase)*1.5;c.arms[1].rotation.x=-Math.sin(s.phase)*1.5;}
  if(c.cape){c.cape.rotation.x=.12+sp*.5+(s.roll>=0?.6:0);}
  if(c.wavers.length||c.anim.length)updateWavers(c,t,sp);
}
function poseWolf(c,s,t){
  const sw=Math.sin(s.phase)*s.sp*.9;
  c.legs[0].rotation.x=sw;c.legs[1].rotation.x=-sw;c.legs[2].rotation.x=-sw;c.legs[3].rotation.x=sw;
  c.body.position.y=-.6+Math.abs(Math.sin(s.phase))*.09*s.sp;c.tail.rotation.x=-.5+Math.sin(t*6)*.15;c.tail.rotation.z=Math.sin(t*4)*.3*(1-s.sp);
  c.head.rotation.x=0;c.body.rotation.x=0;
  if(s.windup>0){c.pivot.rotation.x=-.35*s.windup;c.head.rotation.x=.2;}else c.pivot.rotation.x=0;
  if(s.atk>=0){c.pivot.rotation.x=.45*Math.sin(s.atk*PI);c.head.rotation.x=.4*Math.sin(s.atk*PI);}
  if(s.hit>0)c.body.rotation.x=-.3*s.hit;
  if(s.dead>0){c.pivot.rotation.z=s.dead*PI*.5;c.pivot.position.y=.6-s.dead*.25;}else c.pivot.position.y=.6;
}

/* ================= particles / decals / projectiles ================= */
const PART={max:900,n:0,arr:[],mesh:null};
function buildParticles(){
  const g=new THREE.BoxGeometry(1,1,1),m=new THREE.MeshBasicMaterial({color:0xffffff,fog:true});
  PART.mesh=new THREE.InstancedMesh(g,m,PART.max);PART.mesh.frustumCulled=false;PART.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c=new THREE.Color(1,1,1);for(let i=0;i<PART.max;i++)PART.mesh.setColorAt(i,c);PART.mesh.count=0;scene.add(PART.mesh);
}
function spark(x,y,z,vx,vy,vz,col,life,size,grav=9,glow=false){if(PART.arr.length>=PART.max)PART.arr.shift();PART.arr.push({x,y,z,vx,vy,vz,col:new THREE.Color(col),l:0,m:life,s:size,g:grav});}
function burst(x,y,z,col,n,sp=4,life=.6,size=.14,grav=9){for(let i=0;i<n;i++){const a=R()*TAU,e=R()*PI-PI/2,s=sp*(.35+R()*.65);spark(x,y,z,Math.cos(a)*Math.cos(e)*s,Math.sin(e)*s+sp*.4,Math.sin(a)*Math.cos(e)*s,col,life*(.6+R()*.6),size*(.6+R()*.8),grav);}}
const _pm=new THREE.Matrix4(),_pq=new THREE.Quaternion(),_ps=new THREE.Vector3(),_pp=new THREE.Vector3();
function updateParticles(dt){
  let w=0;for(let i=0;i<PART.arr.length;i++){const p=PART.arr[i];p.l+=dt;if(p.l>=p.m)continue;p.vy-=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    const gy=gh(p.x,p.z);if(p.y<gy&&p.g>0){p.y=gy;p.vy*=-.3;p.vx*=.6;p.vz*=.6;}
    const k=1-p.l/p.m,s=p.s*(.3+k*.7);_pp.set(p.x,p.y,p.z);_ps.set(s,s,s);_pm.compose(_pp,_pq,_ps);PART.mesh.setMatrixAt(w,_pm);PART.mesh.setColorAt(w,p.col);PART.arr[w]=p;w++;}
  PART.arr.length=w;PART.mesh.count=w;PART.mesh.instanceMatrix.needsUpdate=true;if(PART.mesh.instanceColor)PART.mesh.instanceColor.needsUpdate=true;
}
const decals=[];
function makeDecal(){const g=new THREE.Group(),a=new THREE.Mesh(new THREE.RingGeometry(.94,1,48),new THREE.MeshBasicMaterial({color:0xff3a2a,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide,fog:false}));const b=new THREE.Mesh(new THREE.CircleGeometry(1,40),new THREE.MeshBasicMaterial({color:0xff3a2a,transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide,fog:false}));a.rotation.x=b.rotation.x=-PI/2;g.add(a,b);g.visible=false;g.userData={a,b};scene.add(g);return g;}
function getDecal(){for(const d of decals)if(!d.visible)return d;if(decals.length<40){const d=makeDecal();decals.push(d);return d;}return null;}
const projs=[];
function fireProj(o){
  if(NET.on&&!NET.guest)netSend({t:'proj',o:{kind:o.kind,x:r2(o.x),y:r2(o.y),z:r2(o.z),vx:r2(o.vx),vy:r2(o.vy),vz:r2(o.vz),dmg:o.dmg,col:o.col,r:o.r,life:o.life}});
  const col=o.col||0xffd070,g=o.kind==='arrow'?new THREE.CylinderGeometry(.03,.03,.9,5):new THREE.SphereGeometry(o.r||.35,8,6);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:col,fog:false}));if(o.kind==='arrow')m.rotation.order='YXZ';scene.add(m);
  const p=Object.assign({m,life:5,r:.7},o);projs.push(p);return p;
}
function updateProjs(dt,game){
  for(let i=projs.length-1;i>=0;i--){const p=projs[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.grav)p.vy-=p.grav*dt;
    p.m.position.set(p.x,p.y,p.z);if(p.kind==='arrow'){p.m.rotation.set(Math.atan2(Math.hypot(p.vx,p.vz),p.vy),Math.atan2(p.vx,p.vz),0);p.m.rotation.x=PI/2-Math.atan2(p.vy,Math.hypot(p.vx,p.vz));p.m.rotation.y=Math.atan2(p.vx,p.vz);}
    if(R()<.6)spark(p.x,p.y,p.z,RR(-.5,.5),RR(-.5,.5),RR(-.5,.5),p.col||0xffc060,.35,.12,0);
    const P=game.player;let dead=false;
    if(!P.dead&&P.iT<=0){const dx=P.x-p.x,dy=(P.y+1)-p.y,dz=P.z-p.z;if(dx*dx+dy*dy+dz*dz<(p.r+.5)**2){game.hurtPlayer(p.dmg,p.x,p.z,'proj');dead=true;}}
    if(p.y<gh(p.x,p.z)+.05||p.life<=0)dead=true;
    for(const c of world.colliders)if(c.tag!=='break'&&c.tag!=='lava'&&Math.abs(c.x-p.x)<3&&Math.abs(c.z-p.z)<3&&Math.hypot(c.x-p.x,c.z-p.z)<c.r&&p.y<gh(c.x,c.z)+4){dead=true;break;}
    if(dead){burst(p.x,p.y,p.z,p.col||0xffc060,8,3,.4,.12);scene.remove(p.m);p.m.geometry.dispose();p.m.material.dispose();projs.splice(i,1);}
  }
}




/* ================= game state ================= */
const game={st:'load',player:null,enemies:[],npcs:[],pickups:[],pops:[],hitstop:0,slow:0,T:.3,time:0,stage:0,shards:[false,false,false],coins:0,pots:2,dmgUp:0,hpUp:0,lvl:1,xp:0,killed:new Set(),mode:'third',lock:null,boss:null,dialog:null,saveT:0,deaths:0,kills:0,won:false,toastT:0,regionName:'',hurtV:0,inputLocked:false};
const input={mx:0,my:0,sprint:false,jump:0,attack:0,dodge:0,special:0,potion:0,interact:0,lock:0,view:0,map:0,camDX:0,camDY:0};
const cam={yaw:0,pitch:.38,dist:7.5,shake:0,pos:new THREE.Vector3(),look:new THREE.Vector3(),fov:62,mapOpen:false,orbit:0};
const BOSSDEF={
 troll:{name:'Moss Troll',hp:420,dmg:20,scale:2.1,spd:3.6,xp:140,pats:['sweep','slam','charge'],col:0x6fe06a,idx:0,model:{skin:'#6f8a4a',cloth:'#5a4a30',trim:'#3b2a1e',weapon:'tree',shoulders:'#4a6a3a',ears:true,tusks:true,angry:true,bulk:1.3,moss:'#4f8a3a',loin:'#4a3a28',eye:'#ffe27a',pants:'#4a3a28',bare:true,hair:'#2f4a22',spikeCol:'#cdbf9a'}},
 warden:{name:'Frost Warden',hp:560,dmg:22,scale:2.2,spd:3.8,xp:200,pats:['sweep','rain','volley','slam'],col:0x7fdcff,idx:1,ele:'ice',model:{skin:'#bfe4ff',cloth:'#4a7aa8',trim:'#e8f6ff',weapon:'spear',shoulders:'#9fd8f0',glow:'#8fe8ff',helmet:'#cfeaff',crown:true,crownCol:'#bfe8ff',crownGlow:'#8fe8ff',armor:true,metal:'#9fc8e8',cape:'#3a6a98',capeTrim:'#e8f6ff',spikeCol:'#bfeaff',eye:'#aef',angry:true,pants:'#365a80',boots:'#2a4a6a',halo:'#8fe8ff'}},
 magma:{name:'Magma Brute',hp:720,dmg:26,scale:2.4,spd:3.8,xp:260,pats:['slam','charge','rain','volley'],col:0xff7a3a,idx:2,ele:'fire',model:{skin:'#3a2c2c',cloth:'#2a2122',trim:'#e0561c',weapon:'hammer',shoulders:'#2a2326',glow:'#ff6a1a',runes:'#ff8a2a',horns:true,flameHair:'#ff7a22',tusks:true,bulk:1.2,angry:true,eye:'#ffcf3a',hammer:'#1c1618',pants:'#1c1618',boots:'#1c1618',bare:true,spikeCol:'#e0561c',loin:'#5a1c10'}},
 colossus:{name:'Cinder Colossus',hp:1500,dmg:30,scale:2.8,spd:3.9,xp:600,pats:['sweep','slam','charge','rain','volley'],col:0xffffff,idx:-1,ele:'fire',final:true,model:{skin:'#9a9890',cloth:'#6a6862',trim:'#e8c860',weapon:'hammer',shoulders:'#7a7870',glow:'#9fe8ff',runes:'#7fd8ff',helmet:'#8a8880',crown:true,crownCol:'#e8c860',crownGlow:'#9fe8ff',armor:true,metal:'#8a8880',cape:'#26262c',capeTrim:'#e8c860',orbit:'#9fe8ff',halo:'#e8c860',bulk:1.15,angry:true,eye:'#9fe8ff',hammer:'#4a4944',pants:'#4a4944',boots:'#3a3a38',spikeCol:'#bdb8a8'}}
};
const ETYPES={
 goblin:{hp:42,dmg:9,spd:4.4,aggro:16,range:2.2,wind:.62,rec:.9,xp:14,scale:.86,coins:[2,5],model:{skin:'#6aa84f',cloth:'#7a4a2a',trim:'#c8b890',ears:true,bigEars:true,bignose:true,fangs:true,angry:true,loin:'#8a3a2a',pauldrons:true,metal:'#6a5a48',weapon:'club',eye:'#ffe27a',pants:'#4a3a2a',boots:'#3a2a1a',bare:true,hair:'#2a2a1a',hairStyle:'spiky'}},
 archer:{hp:30,dmg:8,spd:3.8,aggro:24,range:12,wind:.75,rec:.5,xp:16,scale:.84,coins:[3,6],bow:true,model:{skin:'#7ab85f',cloth:'#3a5a3a',trim:'#c8b890',ears:true,bigEars:true,fangs:true,hood:'#2f4a2f',quiver:true,weapon:'bow',eye:'#ffe27a',pants:'#3a3a2a',boots:'#2a2418'}},
 wolf:{hp:36,dmg:9,spd:7.4,aggro:22,range:2.0,wind:.38,rec:.8,xp:13,scale:1,coins:[1,3],wolf:true}
};
let nextEid=1;
const HEROES={
  knight:{name:'Ember Knight',desc:'Balanced · shield and counter strikes',hpAdd:0,spd:1,dmg:1,kit:'blade',o:{skin:'#f0c8a0',cloth:'#2c5f9e',sleeve:'#24508a',trim:'#e0b84e',pants:'#3a3140',boots:'#4a3020',hair:'#7a3a18',cape:'#c2392b',capeTrim:'#e0b84e',scarf:'#e8643a',tabard:'#c8382a',armor:true,gloves:'#3a2a1e',headband:'#e0b84e',weapon:'sword',eye:'#1a1008',metal:'#b9c4d4',bladeGlow:'#ffbe5a',seed:0,sigil:'#ffbe5a',shieldEmblem:'#ffbe5a',hiltGem:'#ff5a3a',scar:'#a8604a',potion:'#e0403a',brow:'#4a2410',motes:'#ffb25a',bladeEmit:0x5a2a0a}},
  bear:{name:'Frost Warden',desc:'Tank · +70 health, heavy quake slams, takes less damage',hpAdd:70,spd:.86,dmg:1.25,kit:'quake',o:{skin:'#eeeae2',snoutCol:'#e6e0d4',cloth:'#4a5870',sleeve:'#5c6c86',trim:'#6fd8e8',pants:'#3a4256',boots:'#2c3242',armor:true,metal:'#7f8ea4',gloves:'#eeeae2',bulk:1.28,scale:1.12,headScale:1.18,roundEars:true,earIn:'#c8c0b4',snout:true,snoutLen:.2,snoutW:1.2,nose:'#14121a',ruff:'#f6f4ee',pauldrons:true,cape:'#46618a',capeTrim:'#6fd8e8',weapon:'hammer',hammer:'#5a6a82',glow:'#6fd8e8',eye:'#14202a',tail:true,tailCol:'#eeeae2',tailW:.14,seed:3}},
  newt:{name:'Cinder Newt',desc:'Area mage · every swing bursts into a fire nova',hpAdd:-15,spd:1,dmg:.85,kit:'nova',build:makeNewt,o:{scale:.97,seed:5}},
  raven:{name:'Gale Raven',desc:'Ranged · long-range bolts, fast but fragile (-30 health)',hpAdd:-30,spd:1.18,dmg:.9,kit:'ranged',build:makeRaven,o:{scale:1.02,seed:7}}
};
function makeHero(id){const h=HEROES[id]||HEROES.knight,o=Object.assign({},h.o);return h.build?h.build(o):makeHumanoid(o);}
function makePlayer(){
  const c=makeHero('knight');
  scene.add(c.root);
  const hp=100;
  return {x:0,y:4.4,z:78,vx:0,vz:0,vy:0,yaw:Math.PI,moveYaw:Math.PI,hp,maxhp:hp,st:100,maxst:100,mp:0,state:'free',atkT:0,atkIdx:0,combo:0,hitDone:false,rollT:0,rdx:0,rdz:1,iT:0,hurtT:0,grounded:true,swim:false,c,phase:0,sp:0,spinT:0,spinHit:0,potCd:0,dead:false,deadT:0,lungeX:0,lungeZ:0,flash:0,stDelay:0,kbx:0,kbz:0,trail:makeTrail(),step:0,jumpT:0};
}
function makeTrail(){
  const N=14,geo=new THREE.BufferGeometry(),pos=new Float32Array(N*2*3),col=new Float32Array(N*2*3),idx=[];
  for(let i=0;i<N-1;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setIndex(idx);
  const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));m.frustumCulled=false;scene.add(m);
  return {m,N,pts:[],geo};
}
const _tp=new THREE.Vector3(),_hp=new THREE.Vector3();
function updateTrail(tr,c,active,dt,tint){
  if(active){c.tip.getWorldPosition(_tp);c.weapon.getWorldPosition(_hp);tr.pts.unshift({t:_tp.clone(),h:_hp.clone(),a:1});}
  for(const p of tr.pts)p.a-=dt*7;
  while(tr.pts.length&&tr.pts[tr.pts.length-1].a<=0)tr.pts.pop();
  if(tr.pts.length>tr.N)tr.pts.length=tr.N;
  const pos=tr.geo.attributes.position.array,col=tr.geo.attributes.color.array,n=tr.pts.length;
  for(let i=0;i<tr.N;i++){const p=tr.pts[Math.min(i,n-1)];const a=p?Math.max(0,p.a):0;
    if(!p){pos.fill(0,i*6,i*6+6);col.fill(0,i*6,i*6+6);continue;}
    const hl=p.h.clone().lerp(p.t,.35);pos[i*6]=p.t.x;pos[i*6+1]=p.t.y;pos[i*6+2]=p.t.z;pos[i*6+3]=hl.x;pos[i*6+4]=hl.y;pos[i*6+5]=hl.z;
    const k=a*(i<n?1:0);col[i*6]=tint[0]*k;col[i*6+1]=tint[1]*k;col[i*6+2]=tint[2]*k;col[i*6+3]=tint[0]*k*.2;col[i*6+4]=tint[1]*k*.2;col[i*6+5]=tint[2]*k*.2;}
  tr.geo.attributes.position.needsUpdate=true;tr.geo.attributes.color.needsUpdate=true;tr.m.visible=n>1;
}

function toast(txt,dur=2.6){const t=$('toast');t.textContent=txt;t.style.opacity=1;game.toastT=dur;}
function dmgNum(x,y,z,txt,col,big){game.pops.push({x,y,z,txt,col,t:0,big});}
const playerDmg=()=>(14+game.dmgUp*3+(game.lvl-1)*2)*((HEROES[game.hero]||{}).dmg||1);

/* ---------- enemies ---------- */
function spawnEnemy(kind,x,z,id,home){
  const isBoss=!!BOSSDEF[kind],def=isBoss?BOSSDEF[kind]:ETYPES[kind];
  if(game.killed.has(id))return null;
  const c=(def.wolf||(!isBoss&&def.wolf))?makeWolf({scale:def.scale||1,fur:kind==='wolf'?(RND()>.5?'#7a7a82':'#5a4a40'):'#7a7a82'}):makeHumanoid(Object.assign({scale:def.scale},def.model));
  scene.add(c.root);
  const e={id:id||('e'+nextEid),kind,boss:isBoss,def,x,z,y:gh(x,z),yaw:R()*TAU,hp:def.hp,maxhp:def.hp,dmg:def.dmg,spd:def.spd,state:'idle',t:0,cd:RR(.5,1.5),homeX:home?home[0]:x,homeZ:home?home[1]:z,c,phase:R()*6,sp:0,kx:0,kz:0,flash:0,hit:0,windup:-1,atk:-1,recover:0,deadT:0,wanderT:0,wx:x,wz:z,seed:R()*10,r:(def.scale||1)*.5,aggroT:0,pi:0,pat:null,trail:null,phase2:false,awake:false,lastPat:'',bow:-1,dir:0};
  nextEid++;if(isBoss){e.r=def.scale*.55;e.trail=makeTrail();}
  if(NET.scale>1){e.maxhp=Math.round(def.hp*NET.scale);e.hp=e.maxhp;}
  c.root.position.set(x,e.y,z);game.enemies.push(e);return e;
}
function enemyStep(e,mx,mz,dt){
  const nx=e.x+mx*dt,nz=e.z+mz*dt;
  if(gh(nx,nz)>-.2&&Math.hypot(nx,nz)<188){e.x=nx;e.z=nz;}
  else if(gh(nx,e.z)>-.2){e.x=nx;}else if(gh(e.x,nz)>-.2){e.z=nz;}
  collideXZ(e,e.r);
}
function damageEnemy(e,amt,sx,sz,kb=4,crit=false,silent=false){
  if(e.state==='dead')return;
  if(NET.guest&&!NET.rx){ // the host decides; show the hit at once
    e.flash=.18;e.hit=1;e.aggroT=6;dmgNum(e.x,e.y+(e.def.scale||1)*1.9,e.z,Math.round(amt),crit?'#ffd24a':'#fff',crit);burst(e.x,e.y+1.2*(e.def.scale||1),e.z,crit?0xffe27a:0xffffff,crit?14:8,4,.5,.14);sfx(crit?'crit':'hit');
    netSend({t:'hit',id:e.id,amt:Math.round(amt),sx:r2(sx),sz:r2(sz),kb,cr:crit?1:0});return;}
  if(!NET.rx)e.killer=NET.me;
  e.hp-=amt;e.flash=.18;e.hit=1;e.aggroT=6;
  if(e.state==='idle'||e.state==='wander')e.state='chase';
  dmgNum(e.x,e.y+(e.def.scale||1)*1.9,e.z,Math.round(amt),crit?'#ffd24a':'#fff',crit);
  const dx=e.x-sx,dz=e.z-sz,d=Math.hypot(dx,dz)||1;
  if(!e.boss){e.kx=dx/d*kb*2;e.kz=dz/d*kb*2;if(e.state==='windup'||e.state==='chase'||e.state==='recover'||e.state==='attack'){e.state='stagger';e.t=0;e.windup=-1;e.atk=-1;}}
  else{e.kx=dx/d*kb*.3;e.kz=dz/d*kb*.3;if(e.state==='recover'||e.state==='stun')amt*=1;}
  burst(e.x,e.y+1.2*(e.def.scale||1),e.z,crit?0xffe27a:0xffffff,crit?14:8,4,.5,.14);
  sfx(crit?'crit':'hit');
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  const mine=!e.killer||e.killer===NET.me;
  if(NET.on&&!NET.guest)netSend({t:'kill',id:e.id,kind:e.kind,by:e.killer||NET.me,x:r2(e.x),z:r2(e.z)});
  e.state='dead';e.deadT=0;e.hp=0;if(mine)game.kills++;game.killed.add(e.id);
  for(const d of decals)if(d.userData.owner===e)d.visible=false;
  const def=e.def;burst(e.x,e.y+1,e.z,0xffd070,e.boss?60:18,e.boss?9:5,.9,.2);
  if(mine){addXP(def.xp);
  const n=def.coins?Math.round(RR(def.coins[0],def.coins[1])):Math.round(RR(40,70));
  for(let i=0;i<n;i++)dropPickup('coin',e.x+RR(-.8,.8),e.z+RR(-.8,.8),e.y+1);
  if(!e.boss&&R()<.16)dropPickup('potion',e.x,e.z,e.y+1);}
  if(game.lock===e)game.lock=null;
  if(e.boss){
    game.hitstop=.45;game.slow=1.4;cam.shake=1;sfx('bossdie');toast(def.name+' defeated!',3.4);
    if(def.final){game.stage=4;setQuestText();setTimeout(()=>victory(),3200);}
    else if(!game.shards[def.idx]){const sp=dropPickup('shard',e.x,e.z,e.y+1.5);sp.idx=def.idx;sp.col=def.col;sp.m.material.color.setHex(def.col);if(sp.beam)sp.beam.material.color.setHex(def.col);}
    if(game.boss===e)game.boss=null;$('boss').hidden=true;
    saveGame();
  }else{game.hitstop=.05;}
}
function addXP(n){game.xp+=n;let need=50+(game.lvl-1)*45;while(game.xp>=need){game.xp-=need;game.lvl++;const P=game.player;P.maxhp+=12;P.maxst+=4;P.hp=P.maxhp;P.st=P.maxst;toast('LEVEL '+game.lvl+'  ·  max health up, damage up',3);sfx('level');burst(P.x,P.y+1,P.z,0xffd24a,40,6,1,.2,2);need=50+(game.lvl-1)*45;}}
const xpNeed=()=>50+(game.lvl-1)*45;

/* ---------- pickups ---------- */
const coinGeo=new THREE.CylinderGeometry(.22,.22,.06,12).rotateX(PI/2),coinMat=new THREE.MeshStandardMaterial({color:0xffd24a,emissive:0x6a4a00,metalness:.8,roughness:.3});
function dropPickup(kind,x,z,y){
  let m;
  if(kind==='coin')m=new THREE.Mesh(coinGeo,coinMat);
  else if(kind==='potion'){m=new THREE.Group();const b=new THREE.Mesh(new THREE.SphereGeometry(.2,8,7),new THREE.MeshStandardMaterial({color:0xe5483f,emissive:0x601010,roughness:.3}));const n=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,.18,6),TOON({color:0xcfe0e8}));n.position.y=.24;m.add(b,n);}
  else{m=new THREE.Mesh(new THREE.OctahedronGeometry(.45,0),new THREE.MeshBasicMaterial({color:0xffffff,fog:false}));m.scale.y=1.6;}
  m.position.set(x,y,z);scene.add(m);
  const p={kind,m,x,z,y,vy:kind==='shard'?0:RR(4,7),vx:RR(-2,2),vz:RR(-2,2),t:0,idx:0};
  if(kind==='shard'){const beam=new THREE.Mesh(new THREE.CylinderGeometry(.25,.5,60,10,1,true),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,side:THREE.DoubleSide}));beam.position.set(x,y+30,z);scene.add(beam);p.beam=beam;}
  game.pickups.push(p);return p;
}
function updatePickups(dt){
  const P=game.player;
  for(let i=game.pickups.length-1;i>=0;i--){const p=game.pickups[i];p.t+=dt;
    if(p.kind==='shard'){p.m.rotation.y+=dt*2;p.m.position.y=p.y+Math.sin(p.t*2.5)*.25;if(R()<.4)spark(p.x+RR(-.4,.4),p.y+RR(-.3,.5),p.z+RR(-.4,.4),0,RR(.5,2),0,p.col||0xffffff,.8,.12,-1);}
    else{p.vy-=22*dt;p.y+=p.vy*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;const g=gh(p.x,p.z)+.35;if(p.y<g){p.y=g;p.vy*=-.35;p.vx*=.6;p.vz*=.6;if(Math.abs(p.vy)<.8)p.vy=0;}
      if(p.kind==='coin')p.m.rotation.y+=dt*6;p.m.position.set(p.x,p.y+(p.vy===0?Math.sin(p.t*3)*.05:0),p.z);}
    if(P.dead)continue;
    const dx=P.x-p.x,dz=P.z-p.z,dy=(P.y+.9)-p.y,d=Math.hypot(dx,dz,dy);
    if(p.t>.5&&p.kind!=='shard'&&d<5){const k=Math.min(1,dt*(14-d*1.5));p.x+=dx*k;p.z+=dz*k;p.y+=dy*k;p.vy=0;}
    const reach=p.kind==='shard'?2.2:1.2;
    if(d<reach){
      if(p.kind==='coin'){game.coins++;sfx('coin');}
      else if(p.kind==='potion'){game.pots++;sfx('pick');toast('Potion +1',1.6);}
      else{game.shards[p.idx]=true;toast('Ember Shard recovered!',3.2);sfx('shard');burst(P.x,P.y+1.5,P.z,p.col,40,7,1,.2,2);const n=game.shards.filter(Boolean).length;if(n===3&&game.stage===1){game.stage=2;}setQuestText();saveGame();netProg();}
      scene.remove(p.m);if(p.beam)scene.remove(p.beam);game.pickups.splice(i,1);}
  }
}

/* ---------- player combat ---------- */
function hurtPlayer(dmg,fx,fz,kind){
  const P=game.player;if(P.dead||!(game.st==='play'||NET.on&&game.st==='pause'))return false;
  if(P.iT>0){if(P.state==='roll'&&!P.pd&&kind!=='lava'){P.pd=true;P.counter=2.2;P.mp=Math.min(100,P.mp+40);P.iT=Math.max(P.iT,.6);game.slow=.9;cam.shake=Math.max(cam.shake,.3);dmgNum(P.x,P.y+2.6,P.z,'PERFECT DODGE!','#ffe27a',true);toast('Counter ready — strike!',1.6);burst(P.x,P.y+1,P.z,0xffe27a,26,5,.7,.14);sfx('spin',1);}return false;}
  if((HEROES[game.hero]||{}).kit==='quake')dmg*=.8;
  P.hp-=dmg;P.iT=.55;P.hurtT=.25;netSend({t:'ev',k:'hurt'});P.flash=.3;game.hurtV=1;cam.shake=Math.max(cam.shake,.35);
  const dx=P.x-fx,dz=P.z-fz,d=Math.hypot(dx,dz)||1;P.kbx=dx/d*7;P.kbz=dz/d*7;
  if(P.state==='attack'||P.state==='spin'){P.state='free';}
  dmgNum(P.x,P.y+2.2,P.z,Math.round(dmg),'#ff6a5a');burst(P.x,P.y+1.2,P.z,0xff5a4a,10,4,.5,.14);sfx('hurt');game.hitstop=.06;
  if(P.hp<=0){P.hp=0;P.dead=true;P.deadT=0;P.state='dead';game.deaths++;sfx('die');setTimeout(()=>{if(game.st==='play'){$('dead').hidden=false;document.exitPointerLock&&document.exitPointerLock();}},1400);}
  return true;
}
function ringFx(P,col,r){for(let i=0;i<24;i++){const a=i/24*TAU;spark(P.x+Math.sin(a)*r*.7,P.y+.3,P.z+Math.cos(a)*r*.7,Math.sin(a)*6,.8,Math.cos(a)*6,col,.5,.15,0);}}
function heroSwing(P,k){
  const kit=(HEROES[game.hero]||HEROES.knight).kit;
  if(kit==='ranged'){playerHit(15,.3,[.95,1,1.7][k],[3,3,7][k]);const fx=Math.sin(P.yaw),fz=Math.cos(P.yaw);for(let i=1;i<=14;i++)spark(P.x+fx*i*1.1,P.y+1.2,P.z+fz*i*1.1,0,0,0,i%2?0x9fe8ff:0xffffff,.35,.16,0,true);return;}
  playerHit(k===2?3.5:3.0,k===1?2.0:1.15,[1,1.05,1.9][k],[4,4,9][k]);
  if(kit==='nova'){playerHit(5.4,PI+1,.55,5);ringFx(P,0xff8a2a,5.4);ringFx(P,0xffd27a,3.2);}
  else if(kit==='quake'){playerHit(4.3,PI+1,.5,10);ringFx(P,0xd8f0ff,4.3);cam.shake=Math.max(cam.shake,.22);}
}
function applyHeroStats(){const P=game.player,h=HEROES[game.hero]||HEROES.knight;P.maxhp=Math.max(40,P.maxhp+h.hpAdd);P.hp=P.maxhp;}
function playerHit(range,arc,mul,kb){
  const P=game.player,dmgBase=playerDmg();let hits=0;
  const fx=Math.sin(P.yaw),fz=Math.cos(P.yaw);
  for(const e of game.enemies){if(e.state==='dead')continue;
    const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz),rr=range+e.r;if(d>rr||Math.abs(e.y-P.y)>3+e.r*2)continue;
    if(arc<3){const dot=(dx*fx+dz*fz)/(d||1);if(dot<Math.cos(arc)&&d>e.r+.4)continue;}
    const cm=P.counter>0?2.2:1,crit=R()<.12||cm>1,amt=Math.round(dmgBase*mul*cm*(crit?1.8:1)*RR(.9,1.1));
    damageEnemy(e,amt,P.x,P.z,kb,crit);hits++;P.mp=Math.min(100,P.mp+(e.boss?5:9));}
  for(const b of world.breakables){if(b.hp<=0)continue;const dx=b.x-P.x,dz=b.z-P.z,d=Math.hypot(dx,dz);if(d>range+.5)continue;if(arc<3&&(dx*fx+dz*fz)/(d||1)<Math.cos(arc))continue;breakBreakable(b);}
  hitObjects(range,arc,mul);
  if(hits&&P.counter>0){P.counter=0;burst(P.x,P.y+1.2,P.z,0xffd27a,30,7,.6,.16);dmgNum(P.x,P.y+2.4,P.z,'COUNTER!','#ffd27a',true);}
  if(hits){game.hitstop=Math.max(game.hitstop,.055+(mul>1.5?.04:0));cam.shake=Math.max(cam.shake,.12+mul*.08);}
  return hits;
}
function breakBreakable(b){
  const rx=NET.rx;if(!rx)netSend({t:'brk',i:world.breakables.indexOf(b)});
  b.hp=0;b.m.visible=false;b.c.r=0;const idx=world.colliders.indexOf(b.c);burst(b.x,b.y+.5,b.z,b.kind==='pot'?0xc4683a:0xa9753f,16,4,.7,.16);sfx('smash');
  if(rx)return;const n=Math.round(RR(1,4));for(let i=0;i<n;i++)dropPickup('coin',b.x,b.z,b.y+.6);if(R()<.1)dropPickup('potion',b.x,b.z,b.y+.6);
}
function nearestEnemy(maxD,fwdOnly){
  const P=game.player;let best=null,bd=maxD;const fx=Math.sin(P.yaw),fz=Math.cos(P.yaw);
  for(const e of game.enemies){if(e.state==='dead')continue;const dx=e.x-P.x,dz=e.z-P.z,d=Math.hypot(dx,dz);if(d>bd)continue;if(fwdOnly&&(dx*fx+dz*fz)/d<Math.cos(1.3))continue;bd=d;best=e;}
  return best;
}
function startAttack(P){
  const idx=P.combo>0?(P.atkIdx+1)%3:0;P.atkIdx=idx;P.atkN=(P.atkN||0)+1;P.atkT=0;P.hitDone=false;P.state='attack';P.st-=9;P.stDelay=.7;
  let t=game.lock&&game.lock.state!=='dead'?game.lock:nearestEnemy(5,true);
  if(t){const d=Math.hypot(t.x-P.x,t.z-P.z);P.yaw=Math.atan2(t.x-P.x,t.z-P.z);P.lungeX=Math.sin(P.yaw)*Math.min(d-1,3.4)*3;P.lungeZ=Math.cos(P.yaw)*Math.min(d-1,3.4)*3;}
  else{P.yaw=game.mode==='first'?cam.yaw:(Math.hypot(input.mx,input.my)>.1?P.moveYaw:P.yaw);P.lungeX=Math.sin(P.yaw)*3;P.lungeZ=Math.cos(P.yaw)*3;}
  sfx('swing',idx);
}
function updatePlayer(dt){
  const P=game.player,c=P.c;
  P.iT-=dt;P.counter=Math.max(0,(P.counter||0)-dt);P.hurtT-=dt;P.potCd-=dt;P.flash=Math.max(0,P.flash-dt);P.combo=Math.max(0,P.combo-dt);P.stDelay-=dt;
  if(P.dead){P.deadT+=dt;poseHumanoid(c,{sp:0,phase:0,dead:Math.min(1,P.deadT*2.2)},game.time);c.root.position.set(P.x,P.y,P.z);c.root.rotation.y=P.yaw;setFlash(c,0);return;}
  const ground=gh(P.x,P.z);
  P.swim=ground<-.7&&P.y<=ground+.2||ground<-1.2;
  // camera-relative move
  const f=[Math.sin(cam.yaw),Math.cos(cam.yaw)],r=[-Math.cos(cam.yaw),Math.sin(cam.yaw)];
  let mx=input.mx,my=input.my;if(game.inputLocked||game.dialog){mx=0;my=0;}
  let dirx=f[0]*my+r[0]*mx,dirz=f[1]*my+r[1]*mx;const L0=Math.hypot(dirx,dirz),mag=Math.min(1,L0);if(L0>.01){dirx/=L0;dirz/=L0;}
  const moving=mag>.1;if(moving)P.moveYaw=Math.atan2(dirx,dirz);
  const locked=!game.dialog&&!game.inputLocked;
  // state machine
  if(P.state==='free'){
    const hsp=(HEROES[game.hero]||{}).spd||1;let spd=5.4*hsp,sprint=false;
    if(P.swim)spd=3.3;else if(P.mount){spd=input.sprint?19:12.5;sprint=input.sprint;}else if(input.sprint&&moving&&P.st>2&&!game.dialog){spd=8.6*hsp;sprint=true;P.st-=17*dt;P.stDelay=.5;}
    const tx=dirx*spd*mag,tz=dirz*spd*mag,ac=Math.min(1,dt*(P.grounded?14:5));
    P.vx+=(tx-P.vx)*ac;P.vz+=(tz-P.vz)*ac;
    if(moving){let ty=P.moveYaw;if(game.mode==='first')ty=cam.yaw;else if(game.lock&&game.lock.state!=='dead'&&!sprint)ty=Math.atan2(game.lock.x-P.x,game.lock.z-P.z);P.yaw+=angDiff(P.yaw,ty)*Math.min(1,dt*(game.mode==='first'?30:14));}
    else if(game.mode==='first')P.yaw=cam.yaw;
    else if(game.lock&&game.lock.state!=='dead'){P.yaw+=angDiff(P.yaw,Math.atan2(game.lock.x-P.x,game.lock.z-P.z))*Math.min(1,dt*10);}
    if(input.jump>0&&P.grounded&&!P.swim&&locked&&P.st>6){P.vy=P.mount?11:8.6;P.grounded=false;P.st-=(P.mount?0:6);input.jump=0;sfx('jump');burst(P.x,P.y,P.z,0xd8c8a0,6,2,.4,.12);}
    if(input.attack>0&&locked&&!P.swim&&P.st>=6){input.attack=0;startAttack(P);}
    else if(input.dodge>0&&locked&&P.st>=16&&!P.swim&&!P.mount){input.dodge=0;P.st-=16;P.stDelay=.6;P.state='roll';P.rollT=0;P.pd=false;let rx=moving?dirx:Math.sin(P.yaw),rz=moving?dirz:Math.cos(P.yaw);P.rdx=rx;P.rdz=rz;P.yaw=Math.atan2(rx,rz);P.iT=Math.max(P.iT,.42);sfx('roll');}
    else if(input.special>0&&locked&&P.mp>=100&&!P.swim){input.special=0;P.mp=0;P.state='spin';P.spinT=0;P.spinHit=0;P.iT=Math.max(P.iT,.7);sfx('spin');netSend({t:'ev',k:'spin'});}
    if(input.potion>0&&locked){input.potion=0;if(game.pots>0&&P.hp<P.maxhp&&P.potCd<=0){game.pots--;P.hp=Math.min(P.maxhp,P.hp+P.maxhp*.5);P.potCd=1;sfx('heal');netSend({t:'ev',k:'heal'});burst(P.x,P.y+1,P.z,0x7dff7d,20,3,.9,.14,-1);dmgNum(P.x,P.y+2.4,P.z,'+'+Math.round(P.maxhp*.5),'#7dff7d');}}
    P.sp=clamp(Math.hypot(P.vx,P.vz)/(P.mount?19:8.6),0,1);if(P.mount)P.sp=0;P.phase+=dt*(6+Math.hypot(P.vx,P.vz)*1.35);
  }
  else if(P.state==='attack'){
    const dur=[.44,.44,.66][P.atkIdx];P.atkT+=dt/dur;
    const lf=Math.max(0,1-P.atkT*2.2);P.vx=P.lungeX*lf;P.vz=P.lungeZ*lf;
    if(!P.hitDone&&P.atkT>=.42){P.hitDone=true;owChop();const k=P.atkIdx;heroSwing(P,k);netSend({t:'ev',k:'sw',i:k,kit:(HEROES[game.hero]||HEROES.knight).kit});spark3(P);if(k===2){playerHit(6.2,PI+1,.7,12);cam.shake=Math.max(cam.shake,.35);for(let i=0;i<28;i++){const a=i/28*TAU;spark(P.x+Math.sin(a)*1.2,P.y+.3,P.z+Math.cos(a)*1.2,Math.sin(a)*9,.8,Math.cos(a)*9,0xffc060,.5,.16,0);}burst(P.x,P.y+.2,P.z,0xd8c8a0,14,4,.5,.16);sfx('smash');}}
    if(P.atkT>.55&&input.attack>0&&P.st>=6){input.attack=0;P.combo=.1;startAttack(P);}
    else if(P.atkT>=1){P.state='free';P.combo=.5;}
    if(input.dodge>0&&P.atkT>.5&&P.st>=16){P.state='free';}
    P.sp=.2;
  }
  else if(P.state==='roll'){
    P.rollT+=dt/.52;const k=1-P.rollT*.5;P.vx=P.rdx*12.5*k;P.vz=P.rdz*12.5*k;P.sp=.5;if(P.rollT>=1){P.state='free';}
    if(R()<.4)spark(P.x,P.y+.1,P.z,RR(-1,1),RR(0,1.5),RR(-1,1),0xd8c8a0,.4,.12);
  }
  else if(P.state==='spin'){
    P.spinT+=dt/.78;P.vx*=.9;P.vz*=.9;
    for(const th of[.28,.5,.72])if(P.spinT>=th&&P.spinHit<th){P.spinHit=th;playerHit(4.6,PI+1,1.35,8);sfx('swing',1);cam.shake=.2;}
    if(P.spinT>=1)P.state='free';
  }
  // hurt knockback
  if(P.hurtT>0){P.vx+=P.kbx*dt*10;P.vz+=P.kbz*dt*10;P.kbx*=.9;P.kbz*=.9;}
  // integrate
  P.x+=P.vx*dt;P.z+=P.vz*dt;
  const rr=Math.hypot(P.x,P.z);if(rr>186){P.x*=186/rr;P.z*=186/rr;}
  collideXZ(P,.45);
  // vertical
  const g2=surfaceAt(P.x,P.z,P.y);
  // wall climb
  P.climbing=false;
  if(P.state==='free'&&!P.swim&&P._wall&&P._wall.eave!=null&&(keys.Space||input.jump>0)&&P.st>1&&(locked||touchDev)&&!P.mount&&P.y<P._wall.eave+.2){
    const wb=P._wall,fwd=Math.sin(P.yaw)*-P._wx+Math.cos(P.yaw)*-P._wz;
    if(moving||fwd>.3){P.climbing=true;P.vy=3.6;P.grounded=false;P.st-=13*dt;P.stDelay=.6;P.yaw=Math.atan2(-P._wx,-P._wz);P.vx=P.vz=0;P.y+=P.vy*dt;
      if(P.y>=wb.eave-.1){P.x-=P._wx*1.0;P.z-=P._wz*1.0;P.y=wb.eave+.05;P.vy=0;P.climbing=false;P.grounded=true;sfx('land');burst(P.x,P.y,P.z,0xd8c8a0,8,3,.4,.12);}
      if(R()<.15)spark(P.x-P._wx*.5,P.y+1,P.z-P._wz*.5,0,.5,0,0xd8c8a0,.4,.1,0);}
  }
  if(P.climbing){}
  else if(P.swim){P.vy=0;P.y=lerp(P.y,-.45+Math.sin(game.time*2)*.06,Math.min(1,dt*8));P.grounded=true;if(R()<.1)burst(P.x,0,P.z,0xaee8ff,2,1.5,.4,.1);}
  else{P.vy-=24*dt;P.gliding=false;if(!P.grounded&&P.state==='free'&&P.vy<-2&&keys.Space&&P.y>g2+1.2&&!game.dialog){P.vy=Math.max(P.vy,-2.4);P.gliding=true;const gs=Math.hypot(P.vx,P.vz);if(gs<6.5&&moving){P.vx+=dirx*18*dt;P.vz+=dirz*18*dt;}if(R()<.3)spark(P.x+RR(-.4,.4),P.y+1.4,P.z+RR(-.4,.4),0,-.5,0,0xffd8a0,.5,.08,0);}P.y+=P.vy*dt;if(P.y<=g2){if(!P.grounded&&P.vy<-6){burst(P.x,g2,P.z,0xd8c8a0,8,3,.4,.12);sfx('land');}P.y=g2;P.vy=0;P.grounded=true;}else if(P.y>g2+.15)P.grounded=false;else if(P.vy<=0){P.y=g2;P.grounded=true;}}
  if(P.mount&&P.seat===1){const h=P.mount;
    if(!remoteRider(h,0)){P.seat=0;h.mounted=true;toast('You have the reins',1.8);}
    else{P.x=h.x-Math.sin(h.yaw)*.8;P.z=h.z-Math.cos(h.yaw)*.8;P.y=h.y;P.vy=0;P.vx=P.vz=0;P.grounded=true;if(P.state==='free')P.yaw=h.yaw;}}
  // lava
  if(world.lava)for(const l of world.lava)if(Math.hypot(P.x-l.x,P.z-l.z)<l.r*.85&&P.y<gh(l.x,l.z)+1){P.lavaT=(P.lavaT||0)+dt;if(P.lavaT>.25){P.lavaT=0;hurtPlayer(12,l.x,l.z,'lava');}}
  // stamina/regen
  if(P.stDelay<=0)P.st=Math.min(P.maxst,P.st+(P.state==='free'?30:12)*dt);
  P.st=Math.max(0,P.st);
  // footsteps
  if(P.grounded&&P.state==='free'&&P.sp>.15){P.step+=dt*(P.sp*9+2);if(P.step>PI){P.step-=PI;sfx(P.swim?'splashstep':'step',gh(P.x,P.z)>1.4?(gh(P.x,P.z)>20?2:0):1);}}
  // pose
  const st={sp:P.sp,phase:P.phase,seed:0,swim:P.swim,hit:P.hurtT>0?P.hurtT/.25:0,atk:P.state==='attack'?P.atkT:-1,atkIdx:P.atkIdx,roll:P.state==='roll'?P.rollT:-1,spin:P.state==='spin'?P.spinT:-1};
  c.lift=P.grounded?0:clamp(-P.vy/10,-1,1);
  st.glide=P.gliding||P.climbing;poseHumanoid(c,st,game.time);applyEmote(P,c,game.time);
  let rideY=0;
  if(P.mount){const hs=clamp(Math.hypot(P.vx,P.vz)/12,0,1.4);rideY=1.2+Math.abs(Math.sin(P.mount.ph))*.12*hs;
    c.legs[0].rotation.set(-.95,0,-.62);c.legs[1].rotation.set(-.95,0,.62);
    if(P.state==='free'){c.arms[0].rotation.set(-1.25,0,.12);c.arms[1].rotation.set(-1.25,0,-.12);c.pivot.rotation.x=.28+hs*.12;}}
  c.root.position.set(P.x,P.y+(P.swim?-.1:0)+rideY,P.z);
  if(P.mount&&P.seat!==1&&P.mount.rein){const h=P.mount,pa=h.rein.geometry.attributes.position,bit=new THREE.Vector3(0,2.5,2.1);h.g.updateMatrixWorld(true);c.root.updateMatrixWorld(true);
    for(let i=0;i<2;i++){const hp=c.arms[i].localToWorld(new THREE.Vector3(0,-.62,0));const b=bit.clone();b.x=(i?1:-1)*.2;h.g.localToWorld(b);pa.setXYZ(i*2,hp.x,hp.y,hp.z);pa.setXYZ(i*2+1,b.x,b.y,b.z);}
    pa.needsUpdate=true;h.rein.visible=true;}
  for(const h of OW.horses)if(h.rein&&h!==P.mount)h.rein.visible=false;c.root.rotation.y=P.yaw;setFlash(c,P.flash>0?P.flash*2.5:(P.iT>0&&P.state==='roll'?.15:0));
  c.root.visible=!(game.mode==='first'&&game.st==='play'&&false);
  updateTrail(P.trail,c,P.state==='attack'&&P.atkT>.25&&P.atkT<.75||P.state==='spin',dt,P.state==='spin'?[.5,.8,1]:(P.atkIdx===2?[1,.7,.3]:[.9,.95,1]));
  if(P.state==='roll'&&R()<.3)sfx('rollstep');
}
function spark3(P){const k=P.atkIdx,f=[Math.sin(P.yaw),Math.cos(P.yaw)];burst(P.x+f[0]*1.8,P.y+1.1,P.z+f[1]*1.8,0xffffff,4,3,.3,.1,0);}

/* ---------- enemy AI ---------- */
function telegraph(e,x,z,r,col){const d=getDecal();if(!d)return null;d.visible=true;d.userData.owner=e;d.position.set(x,gh(x,z)+.12,z);d.scale.set(r,1,r);d.userData.a.material.color.setHex(col||0xff3a2a);d.userData.b.material.color.setHex(col||0xff3a2a);d.userData.b.scale.set(.01,.01,.01);d.userData.r=r;return d;}
function decalFill(d,k){if(!d)return;d.userData.b.scale.set(Math.max(.01,k),Math.max(.01,k),1);d.userData.b.material.opacity=.15+.3*k;}
function endDecal(d){if(d){d.visible=false;d.userData.owner=null;}}
function updateEnemy(e,dt){
  if(NET.guest)return puppetEnemy(e,dt);
  const P=nearestTarget(e),c=e.c;
  e.flash=Math.max(0,e.flash-dt);e.hit=Math.max(0,e.hit-dt*5);e.cd-=dt;e.aggroT-=dt;
  const dx=P.x-e.x,dz=P.z-e.z,d=Math.hypot(dx,dz);
  c.root.visible=d<150;
  if(e.state==='dead'){e.deadT+=dt/.9;poseAny(e,{sp:0,phase:e.phase,dead:Math.min(1,e.deadT),seed:e.seed});if(e.deadT>=2.4){scene.remove(c.root);if(e.trail)scene.remove(e.trail.m);game.enemies.splice(game.enemies.indexOf(e),1);}else if(e.deadT>1.4)c.root.position.y-=dt*.6;return;}
  const act=d<80||e.state!=='idle';if(!act){return;}
  e.kx*=Math.max(0,1-dt*6);e.kz*=Math.max(0,1-dt*6);if(Math.abs(e.kx)+Math.abs(e.kz)>.1)enemyStep(e,e.kx,e.kz,dt);
  if(e.boss)return updateBoss(e,dt,d,dx,dz);
  const def=e.def,fx=Math.sin(e.yaw),fz=Math.cos(e.yaw);
  const face=(ty,rate=10)=>{e.yaw+=angDiff(e.yaw,ty)*Math.min(1,dt*rate);};
  let moveSp=0;e.windup=-1;e.atk=-1;e.bow=-1;
  switch(e.state){
    case'idle':{
      if(d<def.aggro&&!P.dead&&playing()&&(d<def.aggro*.6||R()<dt*3)){e.state='chase';dmgNum(e.x,e.y+(def.scale||1)*2.1,e.z,'!','#ffd24a',true);sfx('alert');break;}
      e.wanderT-=dt;if(e.wanderT<=0){e.wanderT=RR(2,5);const a=R()*TAU,r=RR(0,4);e.wx=e.homeX+Math.cos(a)*r;e.wz=e.homeZ+Math.sin(a)*r;if(R()<.4){e.wx=e.x;e.wz=e.z;}}
      const wd=Math.hypot(e.wx-e.x,e.wz-e.z);if(wd>.6){face(Math.atan2(e.wx-e.x,e.wz-e.z),5);moveSp=1.2;enemyStep(e,Math.sin(e.yaw)*1.2,Math.cos(e.yaw)*1.2,dt);}
      break;}
    case'chase':{
      if(P.dead){e.state='idle';break;}
      const hd=Math.hypot(e.homeX-e.x,e.homeZ-e.z);
      if(hd>46||(d>def.aggro*2.2&&e.aggroT<=0)){e.state='return';break;}
      face(Math.atan2(dx,dz),10);
      if(def.bow){
        const want=d<8?-1:d>13?1:0;
        if(want!==0){moveSp=def.spd;enemyStep(e,Math.sin(e.yaw)*def.spd*want*.9,Math.cos(e.yaw)*def.spd*want*.9,dt);}
        else{const sg=Math.sin(game.time*.7+e.seed)>0?1:-1;moveSp=def.spd*.5;enemyStep(e,-fz*sg*def.spd*.5,fx*sg*def.spd*.5,dt);}
        if(e.cd<=0&&d<20){e.state='windup';e.t=0;}
      }else{
        moveSp=def.spd;enemyStep(e,Math.sin(e.yaw)*def.spd,Math.cos(e.yaw)*def.spd,dt);
        for(const o of game.enemies){if(o===e||o.state==='dead')continue;const ox=e.x-o.x,oz=e.z-o.z,od=Math.hypot(ox,oz);if(od<1.3&&od>.01)enemyStep(e,ox/od*3,oz/od*3,dt);}
        if(d<def.range&&e.cd<=0){e.state='windup';e.t=0;}
      }
      break;}
    case'return':{face(Math.atan2(e.homeX-e.x,e.homeZ-e.z),8);moveSp=def.spd*.8;enemyStep(e,Math.sin(e.yaw)*def.spd*.8,Math.cos(e.yaw)*def.spd*.8,dt);e.hp=Math.min(e.maxhp,e.hp+e.maxhp*.1*dt);if(Math.hypot(e.homeX-e.x,e.homeZ-e.z)<2){e.state='idle';}else if(d<def.aggro*.5&&!P.dead)e.state='chase';break;}
    case'windup':{
      e.t+=dt;e.windup=Math.min(1,e.t/def.wind);if(e.t<def.wind*.7)face(Math.atan2(dx,dz),def.bow?14:8);
      if(def.bow)e.bow=0;
      if(e.t>=def.wind){
        if(def.bow){const a=Math.atan2(dx,dz);const sp=22,dist=Math.max(d,1),vy=((P.y+1.1)-(e.y+1.4))/(dist/sp);fireProj({kind:'arrow',x:e.x+Math.sin(a)*.8,y:e.y+1.3,z:e.z+Math.cos(a)*.8,vx:Math.sin(a)*sp,vz:Math.cos(a)*sp,vy:vy,dmg:def.dmg,col:0xe8d8a8,r:.5});sfx('arrow');e.state='recover';e.t=0;e.cd=RR(1.4,2.4);}
        else if(def.wolf){e.state='attack';e.t=0;e.hitDone=false;e.lx=Math.sin(e.yaw);e.lz=Math.cos(e.yaw);sfx('growl');}
        else{e.state='attack';e.t=0;e.hitDone=false;sfx('swing',3);}
      }
      break;}
    case'attack':{
      e.t+=dt;
      if(def.wolf){e.atk=e.t/.32;enemyStep(e,e.lx*12,e.lz*12,dt);if(!e.hitDone&&d<1.7){e.hitDone=true;hurtTarget(P,def.dmg,e.x,e.z,'melee');}if(e.t>=.32){e.state='recover';e.t=0;e.cd=RR(.8,1.5);}}
      else{e.atk=-1;if(!e.hitDone){e.hitDone=true;const dot=(dx*Math.sin(e.yaw)+dz*Math.cos(e.yaw))/(d||1);if(d<def.range+.8&&dot>.2)hurtTarget(P,def.dmg,e.x,e.z,'melee');burst(e.x+Math.sin(e.yaw)*1.5,e.y+.4,e.z+Math.cos(e.yaw)*1.5,0xd8c8a0,6,3,.3,.12);}
        e.recover=1;if(e.t>=.12){e.state='recover';e.t=0;e.cd=RR(.5,1.1);}}
      break;}
    case'recover':{e.t+=dt;e.recover=1-e.t/(def.rec||.8);if(e.t>=(def.rec||.8)){e.state='chase';}break;}
    case'stagger':{e.t+=dt;e.recover=0;if(e.t>=.4){e.state='chase';}break;}
  }
  e.sp=lerp(e.sp,moveSp/(def.spd||5),Math.min(1,dt*8));e.phase+=dt*(5+moveSp*1.8);
  e.y=gh(e.x,e.z);
  poseAny(e,{sp:e.sp,phase:e.phase,windup:e.windup,atk:e.atk,bow:e.bow,recover:e.recover,hit:e.hit,seed:e.seed});
  c.root.position.set(e.x,e.y,e.z);c.root.rotation.y=e.yaw;setFlash(c,e.flash>0?e.flash*3.5:(e.state==='windup'?.25+.2*Math.sin(game.time*30):0));
}
function poseAny(e,s){e.ps=s;if(e.c.isWolf)poseWolf(e.c,s,game.time);else poseHumanoid(e.c,Object.assign({bossy:e.boss},s),game.time);}

/* ---------- bosses ---------- */
function updateBoss(e,dt,d,dx,dz){
  const P=nearestTarget(e),def=e.def,c=e.c;
  const face=(ty,rate=6)=>{e.yaw+=angDiff(e.yaw,ty)*Math.min(1,dt*rate);};
  if(!e.awake){
    if(d<(def.final?30:24)&&!P.dead){e.awake=true;e.state='chase';game.boss=e;$('boss').hidden=false;$('bname').textContent=def.name;sfx('roar');cam.shake=.6;toast(def.name,2.4);if(game.music)game.music.boss=true;}
    else{poseAny(e,{sp:0,phase:e.phase,seed:e.seed,bossy:true});e.y=gh(e.x,e.z);c.root.position.set(e.x,e.y,e.z);c.root.rotation.y=e.yaw;return;}
  }
  if(P.dead||d>(def.final?70:55)){if(game.boss===e){e.awake=false;e.state='idle';e.hp=Math.min(e.maxhp,e.hp+e.maxhp*.5);game.boss=null;$('boss').hidden=true;if(game.music)game.music.boss=false;}return;}
  game.boss=e;
  if(!e.phase2&&e.hp<e.maxhp*.5){e.phase2=true;e.spd*=1.2;sfx('roar');cam.shake=.8;toast(def.name+' is enraged!',2.4);burst(e.x,e.y+3,e.z,0xff5a3a,50,8,1,.25);if(def.final)for(let i=0;i<2;i++){const a=i*PI+R(),g=spawnEnemy('goblin',e.x+Math.cos(a)*6,e.z+Math.sin(a)*6,'sum'+nextEid,[e.x,e.z]);if(g){g.state='chase';g.aggroT=30;game.killed.delete(g.id);}}}
  e.windup=-1;e.atk=-1;e.recover=0;let moveSp=0;
  const S=def.scale;
  switch(e.state){
    case'chase':{
      face(Math.atan2(dx,dz),4);
      const want=e.pat==='x'?0:(d>5.5?1:0);
      if(want){moveSp=e.spd;enemyStep(e,Math.sin(e.yaw)*e.spd,Math.cos(e.yaw)*e.spd,dt);}
      if(e.cd<=0){
        const pool=def.pats.filter(p=>p!==e.lastPat),pick=pool[Math.floor(R()*pool.length)];
        e.pat=pick;e.lastPat=pick;e.state='windup';e.t=0;e.hitDone=false;
        e.wtime={slam:1.0,sweep:.8,charge:.95,volley:.8,rain:.7}[pick]*(e.phase2?.8:1);
        if(pick==='slam'){e.dec=telegraph(e,e.x,e.z,S*3.1,0xff3a2a);}
        else if(pick==='sweep'){e.dec=telegraph(e,e.x+Math.sin(e.yaw)*S*1.6,e.z+Math.cos(e.yaw)*S*1.6,S*2.0,0xff3a2a);}
        else if(pick==='charge'){e.tx=P.x;e.tz=P.z;e.dec=telegraph(e,e.tx,e.tz,2.2,0xffb02a);}
        else if(pick==='rain'){e.dec=null;e.strikes=[];const n=e.phase2?9:6;for(let i=0;i<n;i++){const a=R()*TAU,r=i<3?RR(0,2):RR(3,10);const sx=P.x+Math.cos(a)*r,sz=P.z+Math.sin(a)*r;e.strikes.push({x:sx,z:sz,t:-(.3+i*.16),dec:telegraph(e,sx,sz,2.8,def.ele==='ice'?0x6fd0ff:0xff6a1a)});}}
        else if(pick==='volley'){e.dec=null;}
        sfx('windup');
      }
      break;}
    case'windup':{
      e.t+=dt;const k=Math.min(1,e.t/e.wtime);e.windup=k;
      if(e.pat!=='charge')face(Math.atan2(dx,dz),e.pat==='slam'?2:5);else face(Math.atan2(e.tx-e.x,e.tz-e.z),8);
      if(e.dec&&e.pat==='sweep'){e.dec.position.set(e.x+Math.sin(e.yaw)*S*1.6,e.dec.position.y,e.z+Math.cos(e.yaw)*S*1.6);}
      if(e.dec)decalFill(e.dec,k);
      if(e.strikes)for(const s of e.strikes){s.t+=dt;if(s.dec)decalFill(s.dec,clamp((s.t+.2)/1.0,0,1));}
      if(Math.random()<.5)spark(e.x+RR(-1,1)*S,e.y+S*1.5,e.z+RR(-1,1)*S,0,2,0,def.col||0xffffff,.5,.15,-2);
      if(k>=1){
        if(e.pat==='slam'){const R2=S*3.1;burst(e.x,e.y+.3,e.z,0xd8c8a0,30,R2*1.4,.7,.25);for(let i=0;i<24;i++){const a=i*TAU/24;spark(e.x+Math.cos(a)*2,e.y+.3,e.z+Math.sin(a)*2,Math.cos(a)*R2*2.2,2,Math.sin(a)*R2*2.2,def.ele==='fire'?0xff7a2a:def.ele==='ice'?0x9fe8ff:0xd8c8a0,.5,.2,6);}cam.shake=.9;sfx('slam');
          hurtAll(Q=>Math.hypot(Q.x-e.x,Q.z-e.z)<R2+.4&&Q.y<gh(Q.x,Q.z)+1.0,e.dmg,e.x,e.z,'slam');endDecal(e.dec);e.state='recover';e.t=0;e.rec=1.0;e.cd=e.phase2?.9:1.5;}
        else if(e.pat==='sweep'){const cx=e.x+Math.sin(e.yaw)*S*1.6,cz=e.z+Math.cos(e.yaw)*S*1.6;burst(cx,e.y+1,cz,0xffffff,24,6,.4,.2);cam.shake=.5;sfx('swing',3);hurtAll(Q=>Math.hypot(Q.x-cx,Q.z-cz)<S*2.0+.4,e.dmg,e.x,e.z,'sweep');endDecal(e.dec);e.state='recover';e.t=0;e.rec=.8;e.cd=e.phase2?.7:1.2;}
        else if(e.pat==='charge'){e.state='charge';e.t=0;e.hitDone=false;sfx('roar');}
        else if(e.pat==='volley'){const n=e.phase2?7:4,a0=Math.atan2(dx,dz);for(let i=0;i<n;i++){const a=a0+(i-(n-1)/2)*.28,sp=15;fireProj({kind:'orb',x:e.x+Math.sin(a)*S,y:e.y+S*1.4,z:e.z+Math.cos(a)*S,vx:Math.sin(a)*sp,vz:Math.cos(a)*sp,vy:(P.y+1-(e.y+S*1.4))/(Math.max(d,2)/sp),dmg:Math.round(e.dmg*.7),col:def.ele==='ice'?0x8fe8ff:0xff7a2a,r:.5,life:4});}sfx('fire');e.state='recover';e.t=0;e.rec=.9;e.cd=e.phase2?.8:1.4;}
        else if(e.pat==='rain'){e.state='rain';e.t=0;}
      }
      break;}
    case'charge':{
      e.t+=dt;const a=Math.atan2(e.tx-e.x,e.tz-e.z),dd=Math.hypot(e.tx-e.x,e.tz-e.z);e.yaw=a;moveSp=e.spd*4;enemyStep(e,Math.sin(a)*20,Math.cos(a)*20,dt);
      if(Math.random()<.7)spark(e.x,e.y+.3,e.z,RR(-2,2),RR(1,3),RR(-2,2),0xd8c8a0,.5,.2);
      if(!e.hitDone){const hit=targets().filter(Q=>!Q.dead&&Math.hypot(Q.x-e.x,Q.z-e.z)<S*.9+.8);if(hit.length){e.hitDone=true;for(const Q of hit)hurtTarget(Q,e.dmg,e.x,e.z,'charge');}}
      if(dd<2.2||e.t>1.2){endDecal(e.dec);e.state='recover';e.t=0;e.rec=1.5;e.cd=1.0;cam.shake=.5;burst(e.x,e.y+.3,e.z,0xd8c8a0,20,5,.5,.2);e.vuln=1.5;}
      break;}
    case'rain':{
      e.t+=dt;let alive=0;
      for(const s of e.strikes){s.t+=dt;if(s.done)continue;alive++;if(s.dec)decalFill(s.dec,clamp((s.t+.2)/1.0,0,1));
        if(s.t>=.8){s.done=true;endDecal(s.dec);burst(s.x,gh(s.x,s.z)+.5,s.z,def.ele==='ice'?0x9fe8ff:0xff7a2a,22,5,.6,.22);for(let i=0;i<8;i++)spark(s.x+RR(-.5,.5),gh(s.x,s.z)+RR(2,8),s.z+RR(-.5,.5),0,-14,0,def.ele==='ice'?0xcfeaff:0xffb04a,.35,.25,0);sfx('boom');cam.shake=Math.max(cam.shake,.25);hurtAll(Q=>Math.hypot(Q.x-s.x,Q.z-s.z)<2.8&&Q.y<gh(Q.x,Q.z)+1.6,Math.round(e.dmg*.8),s.x,s.z,'rain');}}
      if(e.t>2.6||alive===0&&e.t>.6){e.state='recover';e.t=0;e.rec=.8;e.cd=e.phase2?.8:1.3;e.strikes=null;}
      break;}
    case'recover':{e.t+=dt;e.recover=1-e.t/e.rec;if(e.vuln)e.vuln-=dt;if(e.t>=e.rec){e.state='chase';e.vuln=0;}break;}
  }
  e.sp=lerp(e.sp,moveSp/(e.spd*4),Math.min(1,dt*8));e.phase+=dt*(4+moveSp*1.2);
  e.y=gh(e.x,e.z);
  poseAny(e,{sp:Math.min(1,e.sp*3),phase:e.phase,windup:e.state==='windup'&&e.pat!=='rain'?e.windup:(e.state==='windup'?e.windup*.6:-1),recover:e.recover,hit:e.hit,seed:e.seed,bossy:true,atk:(e.state==='recover'&&e.t<.25)?(e.t/.25):-1,atkIdx:2});
  c.root.position.set(e.x,e.y,e.z);c.root.rotation.y=e.yaw;setFlash(c,e.flash>0?e.flash*3:(e.state==='windup'?.2+.15*Math.sin(game.time*28):0));
  updateTrail(e.trail,c,e.state==='recover'&&e.t<.35||e.state==='charge',dt,def.ele==='ice'?[.5,.9,1]:[1,.6,.2]);
  $('bfill').style.transform='scaleX('+clamp(e.hp/e.maxhp,0,1)+')';
}



/* ================= audio ================= */
let AC=null,mg=null,noiseBuf=null,muted=store.get('ef-mute',false);
const music={boss:false,step:0,timer:null,combat:0};
function initAudio(){
  if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();mg=AC.createGain();mg.gain.value=muted?0:.55;mg.connect(AC.destination);
    noiseBuf=AC.createBuffer(1,AC.sampleRate*1,AC.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;startAmbient();startMusic();}catch(e){}}
  if(AC&&AC.state==='suspended')AC.resume();
}
function tone(f,d,type='sine',v=.2,sl=0,at=0,dest){if(!AC)return;const t=AC.currentTime+at,o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(sl)o.frequency.exponentialRampToValueAtTime(Math.max(25,f+sl),t+d);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+Math.min(.02,d*.2));g.gain.exponentialRampToValueAtTime(.0008,t+d);o.connect(g);g.connect(dest||mg);o.start(t);o.stop(t+d+.05);}
function noise(d,v,f0,f1,type='bandpass',q=1,at=0){if(!AC)return;const t=AC.currentTime+at,s=AC.createBufferSource();s.buffer=noiseBuf;const fl=AC.createBiquadFilter();fl.type=type;fl.Q.value=q;fl.frequency.setValueAtTime(f0,t);fl.frequency.exponentialRampToValueAtTime(Math.max(40,f1),t+d);const g=AC.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(fl);fl.connect(g);g.connect(mg);s.start(t,Math.random()*.5);s.stop(t+d+.05);}
let lastSfx={};
function sfx(n,v=0){
  if(!AC||muted)return;const now=performance.now();if(lastSfx[n]&&now-lastSfx[n]<(n==='coin'?35:n==='hit'||n==='crit'?40:25))return;lastSfx[n]=now;
  switch(n){
  case'swing':noise(.2,.22,[1800,2400,1500,900][v]||1800,[400,500,350,250][v]||400,'bandpass',1.2);break;
  case'hit':noise(.1,.4,900,200,'lowpass',1);tone(140,.12,'square',.18,-60);break;
  case'crit':noise(.14,.5,1400,200,'lowpass',1);tone(180,.2,'sawtooth',.2,-90);tone(900,.18,'triangle',.16,300);break;
  case'roll':noise(.3,.18,700,200,'bandpass',.8);break;
  case'rollstep':break;
  case'step':{const k=[.9,1,.7][v]||1;noise(.07,.1*k,v===1?1200:500,200,'lowpass',1);break;}
  case'splashstep':noise(.16,.14,1800,500,'bandpass',.7);break;
  case'jump':tone(300,.15,'triangle',.12,300);break;
  case'land':noise(.1,.18,400,100,'lowpass');break;
  case'hurt':tone(220,.25,'sawtooth',.25,-120);noise(.15,.3,1500,300,'bandpass');break;
  case'die':tone(300,.9,'sawtooth',.25,-250);noise(.6,.3,800,80,'lowpass');break;
  case'coin':tone(1300+Math.random()*200,.12,'square',.07);tone(1900,.1,'triangle',.08,0,.05);break;
  case'pick':tone(660,.1,'triangle',.18,300);break;
  case'shard':[523,659,784,988,1319].forEach((f,i)=>tone(f,.5,'triangle',.2,0,i*.09));break;
  case'heal':[392,523,659].forEach((f,i)=>tone(f,.3,'sine',.2,0,i*.08));break;
  case'level':[392,494,587,784,988].forEach((f,i)=>tone(f,.4,'triangle',.2,0,i*.07));break;
  case'alert':tone(520,.1,'square',.1);tone(700,.12,'square',.1,0,.08);break;
  case'growl':tone(90,.4,'sawtooth',.2,-30);noise(.3,.15,500,150,'bandpass');break;
  case'roar':tone(70,1.1,'sawtooth',.35,-30);tone(105,1,'square',.18,-40);noise(.9,.3,700,100,'bandpass');break;
  case'windup':tone(180,.6,'sine',.12,260);break;
  case'slam':tone(60,.6,'sine',.5,-30);noise(.5,.5,500,60,'lowpass');break;
  case'boom':tone(80,.4,'sine',.35,-40);noise(.35,.4,900,100,'lowpass');break;
  case'fire':noise(.4,.28,2500,400,'bandpass');tone(300,.3,'sawtooth',.12,-150);break;
  case'arrow':noise(.15,.18,3000,1200,'bandpass');tone(500,.1,'triangle',.08,-200);break;
  case'smash':noise(.2,.3,2000,300,'bandpass');tone(220,.12,'square',.1,-100);break;
  case'bossdie':tone(60,2,'sawtooth',.4,-30);noise(1.5,.4,900,60,'lowpass');[392,523,659,784].forEach((f,i)=>tone(f,.8,'triangle',.18,0,.8+i*.15));break;
  case'spin':noise(.7,.3,1200,500,'bandpass',.7);tone(220,.6,'sawtooth',.1,300);break;
  case'chest':tone(180,.3,'square',.15,100);[784,988,1175].forEach((f,i)=>tone(f,.3,'triangle',.15,0,.15+i*.08));break;
  case'ui':tone(700,.06,'triangle',.12);break;
  case'talk':tone(300+Math.random()*120,.05,'square',.05);break;
  case'gate':tone(50,2,'sawtooth',.3,-10);noise(2,.3,300,60,'lowpass');break;
  case'bell':[523,784,1047].forEach((f,i)=>tone(f,1.2,'sine',.14,0,i*.15));break;
  }
}
let windN=null,windG=null,seaG=null,seaFl=null;
function startAmbient(){
  const mk=(f,q)=>{const s=AC.createBufferSource();s.buffer=noiseBuf;s.loop=true;const fl=AC.createBiquadFilter();fl.type='bandpass';fl.frequency.value=f;fl.Q.value=q;const g=AC.createGain();g.gain.value=0;s.connect(fl);fl.connect(g);g.connect(mg);s.start();return{g,fl};};
  const w=mk(500,.5);windG=w.g;const s=mk(300,.4);seaG=s.g;seaFl=s.fl;
}
function updateAmbient(dt){
  if(!AC)return;const P=game.player,h=gh(P.x,P.z),r=Math.hypot(P.x,P.z);
  windG.gain.value=lerp(windG.gain.value,(.02+clamp((P.y-6)/30,0,1)*.1)*(muted?0:1),.05);
  const sea=clamp(1-(r<150?(150-r)/50:0),0,1)*.1+(h<2?.05:0);seaG.gain.value=lerp(seaG.gain.value,sea,.05);seaFl.frequency.value=260+Math.sin(game.time*.5)*120;
  game.birdT=(game.birdT||0)-dt;if(game.birdT<=0){game.birdT=RR(2,6);if(light.dayAmt>.5&&h>2&&h<20){const f=2200+Math.random()*1500;tone(f,.07,'sine',.05,600);tone(f*1.2,.08,'sine',.05,500,.1);tone(f*.9,.07,'sine',.04,400,.2);}else if(light.night>.6&&h>2){for(let i=0;i<3;i++)tone(3800,.05,'square',.012,0,i*.09);}}
}
const CH=[[0,3,7],[-4,0,3],[3,7,10],[-2,2,5]],MEL=[0,2,3,5,7,10,12];
function startMusic(){
  if(music.timer)return;
  music.timer=setInterval(()=>{
    if(!AC||muted||game.st==='load'||game.st==='pause')return;
    const st=music.step++,beat=st%8,bar=Math.floor(st/8)%4,ch=CH[bar],base=146.8,combat=game.boss||music.combat>0.5;
    const vol=game.st==='title'?1.2:1;
    if(beat===0){ch.forEach((n,i)=>tone(base*Math.pow(2,n/12)*(i===0?1:1),combat?1.2:3.8,'triangle',(combat?.07:.05)*vol,0,0));tone(base/2*Math.pow(2,ch[0]/12),combat?1.4:3.6,'sine',.12*vol);}
    if(beat%2===0&&Math.random()<(combat?.9:.45)){const n=MEL[Math.floor(Math.random()*MEL.length)]+ch[0];tone(base*2*Math.pow(2,n/12),.5,'triangle',.07*vol,0,0);}
    if(combat){if(beat%4===0)tone(90,.2,'sine',.3,-50);if(beat%4===2)noise(.08,.18,6000,2000,'highpass');if(beat%2===1)noise(.04,.08,8000,6000,'highpass');}
    else if(light.night>.5&&beat===4)tone(base*4*Math.pow(2,MEL[Math.floor(Math.random()*7)]/12),.9,'sine',.05);
  },combat0());
}
function combat0(){return 330;}
function setMuted(m){muted=m;store.set('ef-mute',m);if(mg)mg.gain.value=m?0:.55;$('bMute').textContent='Sound: '+(m?'Off':'On');}

/* ================= NPCs & dialogue ================= */
const NPCDEF=[
 {id:'elder',name:'Elder Maren',x:0,z:61,model:{skin:'#e8c4a0',cloth:'#6a3f86',sleeve:'#6a3f86',trim:'#e0b040',hair:'#efefef',hairStyle:'long',beard:'#efefef',robe:true,headband:'#e0b040',weapon:'staff',orb:'#ffb860',gloves:'#e8c4a0',scarf:'#e0b040'}},
 {id:'smith',name:'Torv the Smith',x:-21,z:77,model:{skin:'#d8a880',cloth:'#6a4a3a',sleeve:'#6a4a3a',trim:'#2a2a2a',hair:'#3a2418',beard:'#3a2418',apron:'#2a2a2a',bulk:1.2,bare:true,gloves:'#2a2a2a',weapon:'none',pants:'#3a2a20',boots:'#2a1a10',scale:1.08}},
 {id:'merchant',name:'Pip the Merchant',x:14,z:77,model:{skin:'#f0c8a0',cloth:'#2a8a6a',sleeve:'#2a8a6a',trim:'#e8c840',hair:'#9a4a1a',backpack:'#8a5a2a',backpack2:'#6a3a1a',hairStyle:'long',scarf:'#e8c840',weapon:'none',pants:'#4a3a2a',boots:'#4a2a1a',scale:.94}},
 {id:'bree',name:'Bree',x:9,z:67,model:{skin:'#e8b890',cloth:'#c06a8a',sleeve:'#c06a8a',trim:'#fff',hair:'#2a1a10',pigtails:true,robe:true,weapon:'none',pants:'#6a4a5a',boots:'#3a2a20',scale:.85}},
 {id:'cob',name:'Old Cob',x:-8,z:66,model:{skin:'#d8b090',cloth:'#6a7a4a',sleeve:'#6a7a4a',trim:'#8a6a3a',hair:'#d8d8d8',beard:'#d8d8d8',headband:'#8a6a3a',apron:'#8a6a3a',weapon:'none',pants:'#4a4a3a',boots:'#3a2a1a',scale:.95}}
];
function createNPCs(){
  for(const d of NPCDEF){const c=makeHumanoid(d.model);scene.add(c.root);const y=gh(d.x,d.z);c.root.position.set(d.x,y,d.z);const n={def:d,id:d.id,name:d.name,x:d.x,z:d.z,y,c,yaw:Math.atan2(VILLAGE.x-d.x,VILLAGE.z-d.z),seed:Math.random()*10,talk:0};game.npcs.push(n);addCircle(d.x,d.z,.55,'npc');world.interact.push({kind:'npc',npc:n,x:d.x,z:d.z,prompt:'Talk to '+d.name});}
}
const BARKS={elder:['The flame needs you, traveller.','Mind the old paths at night.','Come speak with me when you are ready.'],smith:['Sharp steel, sharp mind!','That blade could use a whetstone.','Hmph. Hammer never lies.'],merchant:['Fresh potions, fair prices!','Psst, a good deal for a hero.','Coins make the world spin!'],bree:['Oh! Hello there!','Have you seen the sprites glowing?','Careful out there!'],cob:['Back in my day, no wolves.','Fine weather, if you ignore the goblins.','Hm? Oh, hello.']};
game.barkCd=0;game.bark=null;game.barkSeen={};
function updateBarks(dt){
  const P=game.player;game.barkCd-=dt;
  if(game.bark){game.bark.t+=dt;if(game.bark.t>3.4||game.dialog)game.bark=null;}
  if(game.bark||game.dialog||game.barkCd>0||P.dead||music.combat)return;
  for(const n of game.npcs){const d=Math.hypot(P.x-n.x,P.z-n.z);if(d>5.5||(n.barkAt||-999)>game.time-150)continue;
    const L=BARKS[n.id];if(!L)continue;const i=(game.barkSeen[n.id]||0);game.barkSeen[n.id]=i+1;
    game.bark={n,txt:L[i%L.length],t:0};n.barkAt=game.time;game.barkCd=28;break;}
}
function updateNPCs(dt){
  const P=game.player;updateBarks(dt);
  for(const n of game.npcs){const d=Math.hypot(P.x-n.x,P.z-n.z);if(d<9||game.dialog&&game.dialog.npc===n){n.yaw+=angDiff(n.yaw,Math.atan2(P.x-n.x,P.z-n.z))*Math.min(1,dt*4);}
    poseHumanoid(n.c,{sp:0,phase:0,seed:n.seed,atk:-1,windup:-1},game.time);n.c.arms[1].rotation.x=Math.sin(game.time*1.3+n.seed)*.05;
    if(n.id==='elder'&&game.dialog&&game.dialog.npc===n){n.c.arms[1].rotation.x=-.8+Math.sin(game.time*6)*.15;}
    n.c.root.position.set(n.x,n.y,n.z);n.c.root.rotation.y=n.yaw;}
}
function lines(npc){
  const n=game.shards.filter(Boolean).length,S=game.stage;
  if(npc.id==='elder'){
    if(S===0)return{l:['Traveler... you arrive at a dark hour. The Flame of Emberfall, the heart of our isle, has gone out.','Its light shattered into three Ember Shards, each taken by a guardian: the Moss Troll in the western woods, the Frost Warden on the northern peak, and the Magma Brute in the eastern crater.','Bring the shards to me and I will open the Hollow Gate. Take care out there. The wilds are not kind. Follow the paths, they lead to every lair.'],end:()=>{game.stage=Math.max(1,game.stage);game.pots+=1;toast('Quest begun: The Ember Shards',3);setQuestText();saveGame();sfx('bell');netProg();}};
    if(S===1)return{l:[n?`You carry ${n} of the three shards. Good.`:'The shards are still out there, traveler.','Moss Troll in the west woods. Frost Warden on the peak to the north. Magma Brute in the eastern crater. Keep to the paths and mind your stamina.']};
    if(S===2)return{l:['The shards... all three. They remember the flame.','Stand back. I will wake the Hollow Gate.'],end:()=>{if(game.stage>=3)return;game.stage=3;litBrazier();openGate();setQuestText();ensureColossus();saveGame();netProg();}};
    if(S===3)return{l:['The Hollow Gate stands open, north of the village past the old pillars.','End the Cinder Colossus, and the flame will burn again.']};
    return{l:['The flame burns again, thanks to you. Emberfall is safe, and you are always welcome here.']};
  }
  if(npc.id==='smith'){
    const cost=60+30*game.dmgUp;
    return{l:[game.dmgUp>=6?'I can sharpen no more. That blade is a masterpiece.':'A good blade is half the fight. I can sharpen yours.'],opts:game.dmgUp>=6?[]:[{label:`Sharpen blade +3 damage  (${cost} coins)`,fn:()=>{if(game.coins>=cost){game.coins-=cost;game.dmgUp++;sfx('chest');toast('Blade sharpened',1.8);return 'There. Hear that ring? Fresh edge.';}return 'Come back when your purse is heavier.';}}]};
  }
  if(npc.id==='merchant'){
    const vc=120+60*Math.max(0,game.hpUp);
    return{l:['Potions! Fresh potions! Best prices on the isle, and the only prices on the isle.'],opts:[{label:'Healing potion  (25 coins)',fn:()=>{if(game.coins>=25){game.coins-=25;game.pots++;sfx('pick');return 'Pleasure doing business!';}return 'Not enough coins, friend.';}},game.hpUp<3?{label:`Vitality tonic +15 max health  (${vc} coins)`,fn:()=>{if(game.coins>=vc){game.coins-=vc;game.hpUp++;game.player.maxhp+=15;game.player.hp+=15;sfx('level');return 'Strong as an ox. A very small ox.';}return 'Not enough coins, friend.';}}:null].filter(Boolean)};
  }
  if(npc.id==='bree')return{l:[S<3?'Are you going out there? I hear the goblins are camped along the paths. Watch the archers!':'Is it true? Did you really beat the Colossus? Tell me everything!','Hint: jump over the shockwave when a big one slams the ground!']};
  if(npc.id==='cob')return{l:['Back in my day we fought wolves with spoons.','Press R when your blue bar is full. Spin attack. Very dramatic. Very effective.','And the roll has invincibility frames, young one. Use it.']};
  return{l:['...']};
}
function openDialog(npc){
  const d=lines(npc);game.dialog={npc,l:d.l,i:0,opts:d.opts||[],end:d.end,typed:0,reply:null};renderDialog();sfx('ui');
  if(document.exitPointerLock&&document.pointerLockElement)document.exitPointerLock();
}
function renderDialog(){
  const D=game.dialog,box=$('dlg');if(!D){box.hidden=true;return;}
  box.hidden=false;const last=D.i>=D.l.length-1,txt=D.reply||D.l[D.i];
  box.innerHTML=`<h5>${D.npc.name.toUpperCase()}</h5><p id="dtxt"></p><div class="opts"></div><small>${(D.reply||(last&&D.opts.length))?'':(touchDev?'tap to continue':'[E] / click to continue')}</small>`;
  D.full=txt;D.typed=0;
  const oc=box.querySelector('.opts');
  if((last||D.reply)&&D.opts.length){D.opts.forEach((o,i)=>{const b=document.createElement('button');b.textContent=(i+1)+'. '+o.label;b.onclick=(ev)=>{ev.stopPropagation();chooseOpt(i);};oc.appendChild(b);});}
  if(D.reply||(last&&D.opts.length)){const b=document.createElement('button');b.textContent='Leave';b.onclick=(ev)=>{ev.stopPropagation();closeDialog();};oc.appendChild(b);}
}
function chooseOpt(i){const D=game.dialog;if(!D)return;const o=D.opts[i];if(!o)return;const rep=o.fn();D.reply=rep;renderDialog();sfx('ui');}
function advanceDialog(){
  const D=game.dialog;if(!D)return;
  if(D.typed<D.full.length){D.typed=D.full.length;$('dtxt').textContent=D.full;return;}
  if(D.reply||(D.i>=D.l.length-1&&D.opts.length))return;
  if(D.i<D.l.length-1){D.i++;renderDialog();sfx('ui');}else closeDialog();
}
function closeDialog(){const D=game.dialog;if(!D)return;game.dialog=null;$('dlg').hidden=true;if(D.end)D.end();}
function updateDialog(dt){const D=game.dialog;if(!D)return;if(D.typed<D.full.length){D.typed=Math.min(D.full.length,D.typed+dt*60);$('dtxt').textContent=D.full.slice(0,Math.floor(D.typed));if(Math.floor(D.typed)%3===0)sfx('talk');}}

/* ================= quest, interaction ================= */
function setQuestText(){
  const n=game.shards.filter(Boolean).length,S=game.stage;
  const t=['Speak with Elder Maren in the village.',`Recover the Ember Shards (${n}/3). Moss Troll in the west woods, Frost Warden on the north peak, Magma Brute in the east crater.`,'Return to Elder Maren with the shards.','Enter the Sunken Hollow north of the village and defeat the Cinder Colossus.','The flame burns again. Explore freely, or hunt what remains.'][S];
  $('qtext').textContent=t;[...$('qsh').children].forEach((s,i)=>s.classList.toggle('on',!!game.shards[i]||S>=3));
  if(world.sockets)world.sockets.forEach((so,i)=>{const lit=S>=3;so.m.material.color.set(lit?so.col:'#2a2a2a');});
}
function objective(){
  const S=game.stage;if(S===0||S===2)return{x:0,z:61};
  if(S===3)return{x:0,z:-22};if(S===4)return null;
  const defs=[[ARENAS.troll,0],[ARENAS.frost,1],[ARENAS.magma,2]];let best=null,bd=1e9;const P=game.player;
  for(const [a,i] of defs){if(game.shards[i])continue;const d=Math.hypot(a.x-P.x,a.z-P.z);if(d<bd){bd=d;best={x:a.x,z:a.z};}}
  for(const p of game.pickups)if(p.kind==='shard'){return{x:p.x,z:p.z};}
  return best;
}
function litBrazier(){const b=world.brazier;b.lit=true;toast('The village flame is rekindled',3.2);sfx('bell');}
function openGate(){world.gate.opening=true;sfx('gate');}
function ensureColossus(){if(game.stage>=3&&!game.enemies.some(e=>e.kind==='colossus')&&!game.killed.has('boss-colossus'))spawnEnemy('colossus',0,-29,'boss-colossus',[0,-22]);}
function nearestInteract(){
  const P=game.player;let best=null,bd=3.6;
  for(const o of world.interact){if(o.kind==='chest'&&o.opened)continue;if(P.mount)continue;
    if(o.kind==='horse'){const dr=remoteRider(o.h,0);if(dr&&remoteRider(o.h,1))continue;o.prompt=dr?'Ride behind '+dr.name:'Mount horse';}if(o.kind==='tower'&&(o.tw.on||P.y<o.y-2.2))continue;const d=Math.hypot(o.x-P.x,o.z-P.z);if(d<bd){bd=d;best=o;}}
  return best;
}
function interact(){
  if(game.dialog){advanceDialog();return;}
  if(game.player.mount){dismount();return;}
  const o=nearestInteract();if(!o||game.player.dead)return;
  if(o.kind==='npc')openDialog(o.npc);
  else if(o.kind==='chest')openChest(o);
  else if(o.kind==='tower')activateTower(o);
  else if(o.kind==='horse')mount(o.h);
}
function openChest(o){
  if(o.opened)return;o.opened=true;sfx('chest');netSend({t:'chest',id:o.id});
  const x=o.x,z=o.z,y=gh(x,z)+1;
  if(o.loot==='potion'){dropPickup('potion',x,z,y);const n=Math.round(RR(8,18));for(let i=0;i<n;i++)dropPickup('coin',x,z,y);}
  else{const n=Math.round(o.loot==='camp'?RR(14,26):RR(24,40));for(let i=0;i<n;i++)dropPickup('coin',x,z,y);if(o.loot==='camp'&&R()<.5)dropPickup('potion',x,z,y);}
  burst(x,y,z,0xffd24a,24,5,.8,.16,2);saveGame();
}

/* ================= save / state ================= */
function saveGame(){
  const P=game.player;if(!P)return;
  store.set('ef-save',{lvl:game.lvl,xp:game.xp,coins:game.coins,pots:game.pots,dmgUp:game.dmgUp,hpUp:game.hpUp,shards:game.shards,stage:game.stage,killed:[...game.killed],T:game.T,pos:[P.x,P.z],chests:world.chests.filter(c=>c.opened).map(c=>c.id),kills:game.kills,deaths:game.deaths,maxhp:P.maxhp-((HEROES[game.hero]||{}).hpAdd||0),maxst:P.maxst,playT:game.playT||0,sprites:OW.sprites.filter(p=>p.got).map(p=>p.id),towers:OW.towers.filter(t=>t.on).map(t=>t.id),inv:game.inv});
}
function resetWorld(){
  for(const e of game.enemies){scene.remove(e.c.root);if(e.trail)scene.remove(e.trail.m);}game.enemies.length=0;
  for(const p of game.pickups){scene.remove(p.m);if(p.beam)scene.remove(p.beam);}game.pickups.length=0;
  for(const p of projs){scene.remove(p.m);}projs.length=0;for(const d of decals)d.visible=false;
  for(const c of world.chests){c.opened=false;c.open=0;c.lid.rotation.x=0;}
  for(const b of world.breakables){b.hp=1;b.m.visible=true;b.c.r=.4;}resetDamage();
  world.gate.opening=false;world.gate.open=0;world.gate.g.position.y=world.gate.y0;if(world.gateBoxRef){world.gateBoxRef.hw=4.4;world.gateBoxRef.hd=.9;}
  world.brazier.lit=false;game.lock=null;game.boss=null;$('boss').hidden=true;music.boss=false;
}
function spawnAll(){
  CAMPS.forEach(c=>{c.e.forEach((k,i)=>{const a=i*TAU/c.e.length+R(),r=RR(3,5);spawnEnemy(k,c.x+Math.cos(a)*r,c.z+Math.sin(a)*r,c.id+'-'+i,[c.x,c.z]);});});
  spawnEnemy('troll',ARENAS.troll.x-2,ARENAS.troll.z,'boss-troll',[ARENAS.troll.x,ARENAS.troll.z]);
  spawnEnemy('warden',ARENAS.frost.x,ARENAS.frost.z,'boss-warden',[ARENAS.frost.x,ARENAS.frost.z]);
  spawnEnemy('magma',ARENAS.magma.x,ARENAS.magma.z,'boss-magma',[ARENAS.magma.x,ARENAS.magma.z]);
  ensureColossus();
}
function newState(){
  Object.assign(game,{stage:0,shards:[false,false,false],coins:0,pots:2,dmgUp:0,hpUp:0,lvl:1,xp:0,killed:new Set(),T:.3,kills:0,deaths:0,playT:0,won:false,inv:invDefault()});
  const P=game.player;P.maxhp=100;P.maxst=100;P.hp=100;P.st=100;P.mp=0;P.x=0;P.z=80;P.y=gh(0,80);P.yaw=Math.PI;P.dead=false;P.state='free';P.vx=P.vz=0;P.iT=1;
  cam.yaw=Math.PI;cam.pitch=.38;
}
function loadState(s){
  Object.assign(game,{stage:s.stage,shards:s.shards,coins:s.coins,pots:s.pots,dmgUp:s.dmgUp,hpUp:s.hpUp,lvl:s.lvl,xp:s.xp,killed:new Set(s.killed),T:s.T,kills:s.kills||0,deaths:s.deaths||0,playT:s.playT||0,won:false,inv:Object.assign(invDefault(),s.inv||{})});
  const P=game.player;P.maxhp=s.maxhp||100;P.maxst=s.maxst||100;P.hp=P.maxhp;P.st=P.maxst;P.mp=0;P.x=s.pos[0];P.z=s.pos[1];P.y=gh(P.x,P.z);P.dead=false;P.state='free';P.vx=P.vz=0;P.iT=1.5;
  if(gh(P.x,P.z)<0){P.x=0;P.z=80;P.y=gh(0,80);}
}
function applyWorld(s){
  resetWorld();spawnAll();
  if(s){for(const c of world.chests)if(s.chests&&s.chests.includes(c.id)){c.opened=true;c.open=1;c.lid.rotation.x=-1.9;}}
  if(game.stage>=3){world.brazier.lit=true;world.gate.open=1;world.gate.g.position.y=world.gate.y0-8.2;if(world.gateBoxRef){world.gateBoxRef.hw=.01;world.gateBoxRef.hd=.01;}}
  owApply(s);invHud();stopFish();if(game.player){game.player.rest=false;game.player.emote=null;}setQuestText();
}
function swapHero(id){const P=game.player;if(!HEROES[id])id='knight';if(game.hero===id&&P.c)return;scene.remove(P.c.root);P.c=makeHero(id);scene.add(P.c.root);P.c.root.visible=true;game.hero=id;}
function startGame(cont){
  initAudio();swapHero(store.get('ef-hero','knight'));
  const s=cont?store.get('ef-save',null):null;
  if(s)loadState(s);else{store.set('ef-save',null);newState();}
  applyHeroStats();
  applyWorld(s);
  $('title').hidden=true;$('hud').hidden=false;$('touch').hidden=!touchDev;$('pause').hidden=true;$('dead').hidden=true;$('end').hidden=true;
  game.st='play';game.dialog=null;$('dlg').hidden=true;game.regionName='';fadeIn();
  if(!s)setTimeout(()=>toast('Find Elder Maren in the village',3.2),600);
}
function fadeIn(){const f=$('fade');f.style.transition='none';f.style.opacity=1;requestAnimationFrame(()=>requestAnimationFrame(()=>{f.style.transition='opacity .9s';f.style.opacity=0;}));}
function toTitle(){if(playing())netSend({t:'bye'});game.st='title';saveGame();if(game.player&&game.player.mount)dismount();$('title').hidden=false;$('hud').hidden=true;$('touch').hidden=true;$('pause').hidden=true;$('dead').hidden=true;$('end').hidden=true;$('dlg').hidden=true;game.dialog=null;$('bCont').disabled=!store.get('ef-save',null);$('bCont').style.opacity=store.get('ef-save',null)?1:.45;if(document.pointerLockElement)document.exitPointerLock();}
function victory(){
  game.won=true;$('endtxt').textContent=`The Cinder Colossus is no more and the Flame of Emberfall burns anew. Level ${game.lvl}, ${game.kills} foes felled, ${game.deaths} falls, ${Math.round((game.playT||0)/60)} minutes on the isle.`;
  $('end').hidden=false;if(document.pointerLockElement)document.exitPointerLock();sfx('bell');
}
function respawn(){
  const P=game.player;P.dead=false;P.hp=P.maxhp;P.st=P.maxst;P.state='free';P.x=0;P.z=80;P.y=gh(0,80);P.vx=P.vz=0;P.iT=2;game.coins=Math.floor(game.coins*.9);
  if(!NET.guest&&!livePeers().some(r=>!r.dd))for(const e of game.enemies)if(e.state!=='dead'&&!e.boss){e.state='return';}
  $('dead').hidden=true;fadeIn();cam.yaw=Math.PI;
}


/* ================= input ================= */
const keys={};let locked=false,lockFailed=false,dragLook=false;
function requestLock(){try{const p=glc.requestPointerLock();if(p&&p.catch)p.catch(()=>{lockFailed=true;});}catch(e){lockFailed=true;}}
document.addEventListener('pointerlockchange',()=>{const was=locked;locked=document.pointerLockElement===glc;if(was&&!locked&&game.st==='play'&&!game.dialog&&!game.player.dead&&$('end').hidden&&$('dead').hidden)setPause(true);});
document.addEventListener('pointerlockerror',()=>{lockFailed=true;});
function cycleView(){game.mode=game.mode==='third'?'first':game.mode==='first'?'top':'third';cam.pitch=game.mode==='top'?1.0:game.mode==='first'?0:.38;cam.dist=game.mode==='top'?24:7.5;if(game.mode==='top')cam.yaw=Math.round(cam.yaw/(PI/4))*PI/4;const n={third:'Third person',first:'First person',top:'Top-down'}[game.mode];$('bView').textContent='View: '+n;toast(n+' view',1.4);}
function setPause(p){
  if(p&&game.st==='play'){game.st='pause';$('pause').hidden=false;if(document.pointerLockElement)document.exitPointerLock();}
  else if(!p&&game.st==='pause'){game.st='play';$('pause').hidden=true;}
}
addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
  if(e.repeat)return;keys[e.code]=true;
  if(game.st==='load')return;initAudio();
  if(game.st==='pause'){if(e.code==='Escape'||e.code==='KeyP')setPause(false);return;}
  if(game.st!=='play')return;
  if(e.code==='Escape'||e.code==='KeyP'){setPause(true);return;}
  if(cam.mapOpen&&/^Digit[1-9]$/.test(e.code)){fastTravel(+e.code.slice(5)-1);return;}
  if(game.dialog){if(e.code==='KeyE'||e.code==='Space'||e.code==='Enter')advanceDialog();else if(e.code==='Digit1')chooseOpt(0);else if(e.code==='Digit2')chooseOpt(1);else if(e.code==='Escape')closeDialog();return;}
  switch(e.code){
    case'Space':input.jump=.2;break;case'KeyJ':input.attack=.3;break;case'KeyK':case'ControlLeft':input.dodge=.3;break;case'KeyR':input.special=.3;break;case'KeyQ':input.potion=.3;break;
    case'KeyE':interact();break;case'KeyG':doCtx();break;case'KeyH':eatFood();break;case'KeyZ':case'KeyX':case'KeyC':case'KeyB':doEmote(e.code);break;case'KeyF':toggleLock();break;case'KeyV':cycleView();break;case'KeyM':case'Tab':cam.mapOpen=!cam.mapOpen;break;
  }
});
addEventListener('keyup',e=>{keys[e.code]=false;});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});
glc.addEventListener('mousedown',e=>{
  initAudio();if(game.st!=='play')return;if(game.dialog){advanceDialog();return;}
  if(!locked&&!lockFailed){requestLock();return;}
  if(lockFailed&&!locked){dragLook=true;if(e.button===0)input.attack=.3;return;}
  if(e.button===0)input.attack=.3;else if(e.button===2)input.dodge=.3;
});
addEventListener('mouseup',()=>{dragLook=false;});addEventListener('blur',()=>{dragLook=false;});
addEventListener('mousemove',e=>{if(game.st!=='play')return;if(locked||dragLook){const cx=clamp(e.movementX||0,-120,120),cy=clamp(e.movementY||0,-120,120);input.camDX+=cx;input.camDY+=cy;}});
addEventListener('contextmenu',e=>e.preventDefault());
glc.addEventListener('wheel',e=>{e.preventDefault();if(game.mode==='third')cam.dist=clamp(cam.dist+e.deltaY*.006,3.5,13);else if(game.mode==='top')cam.dist=clamp(cam.dist+e.deltaY*.012,14,38);},{passive:false});
$('dlg').addEventListener('click',()=>advanceDialog());
function toggleLock(){if(game.lock){game.lock=null;return;}const e=nearestEnemy(26,false);if(e){game.lock=e;sfx('ui');}}
// touch
(()=>{
  const joy=$('joy'),knob=$('knob');let id=null;
  const mv=e=>{const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const m=Math.hypot(dx,dy),mx=r.width/2;if(m>mx){dx*=mx/m;dy*=mx/m;}knob.style.left=(41+dx)+'px';knob.style.top=(41+dy)+'px';input.tx=dx/mx;input.ty=dy/mx;input.tsprint=Math.hypot(dx,dy)/mx>.92;};
  joy.addEventListener('pointerdown',e=>{id=e.pointerId;joy.setPointerCapture(id);mv(e);initAudio();});
  joy.addEventListener('pointermove',e=>{if(e.pointerId===id)mv(e);});
  const end=e=>{if(e.pointerId===id){id=null;input.tx=input.ty=0;input.tsprint=false;knob.style.left='41px';knob.style.top='41px';}};
  joy.addEventListener('pointerup',end);joy.addEventListener('pointercancel',end);
  const look=$('look');let lid=null,lx=0,ly=0;
  look.addEventListener('pointerdown',e=>{lid=e.pointerId;look.setPointerCapture(lid);lx=e.clientX;ly=e.clientY;initAudio();});
  look.addEventListener('pointermove',e=>{if(e.pointerId===lid){input.camDX+=(e.clientX-lx)*1.6;input.camDY+=(e.clientY-ly)*1.6;lx=e.clientX;ly=e.clientY;}});
  const le=e=>{if(e.pointerId===lid)lid=null;};look.addEventListener('pointerup',le);look.addEventListener('pointercancel',le);
  const bind=(id,fn)=>$(id).addEventListener('pointerdown',e=>{e.preventDefault();initAudio();if(game.st==='play')fn();});
  bind('tAtk',()=>{if(game.dialog)advanceDialog();else input.attack=.3;});bind('tRoll',()=>input.dodge=.3);bind('tJump',()=>input.jump=.2);bind('tSpec',()=>input.special=.3);bind('tUse',()=>interact());bind('tPot',()=>input.potion=.3);bind('tCam',()=>cycleView());bind('tDo',()=>doCtx());bind('tLock',()=>toggleLock());bind('tEat',()=>eatFood());bind('tMap',()=>{cam.mapOpen=!cam.mapOpen;});
  $('tJump').addEventListener('pointerdown',()=>{keys.Space=true;});const jr=()=>{keys.Space=false;};$('tJump').addEventListener('pointerup',jr);$('tJump').addEventListener('pointercancel',jr);$('tJump').addEventListener('pointerleave',jr);
  const emo=$('emo');bind('tEmo',()=>emo.classList.toggle('on'));emo.querySelectorAll('button').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();initAudio();if(game.st==='play'){doEmote(b.dataset.e);emo.classList.remove('on');}}));
})();
$('menubtn').addEventListener('click',()=>setPause(true));

/* ================= camera ================= */
const _f=new THREE.Vector3();
function updateCamera(dt){
  const P=game.player,m=game.mode;const rawDX=input.camDX;
  if(!game.dialog){
    const sens=m==='first'?.0022:.0026;cam.yaw-=input.camDX*sens;cam.pitch+=input.camDY*.0022;
    if(keys.ArrowLeft)cam.yaw+=dt*2.2;if(keys.ArrowRight)cam.yaw-=dt*2.2;if(keys.ArrowUp)cam.pitch-=dt*1.3;if(keys.ArrowDown)cam.pitch+=dt*1.3;
  }
  input.camDX=input.camDY=0;
  if(m==='third')cam.pitch=clamp(cam.pitch,-.2,1.3);else if(m==='first')cam.pitch=clamp(cam.pitch,-1.35,1.35);else cam.pitch=clamp(cam.pitch,.7,1.3);
  if(game.lock&&game.lock.state!=='dead'&&m!=='first'&&Math.abs(rawDX)<2){const tx=game.lock.x-P.x,tz=game.lock.z-P.z;if(Math.hypot(tx,tz)>32){game.lock=null;}else cam.yaw+=angDiff(cam.yaw,Math.atan2(tx,tz))*Math.min(1,dt*3.2);}
  else if(game.lock&&game.lock.state==='dead')game.lock=null;
  if(game.dialog&&game.dialog.npc){const n=game.dialog.npc,d=Math.atan2(n.x-P.x,n.z-P.z);cam.yaw+=angDiff(cam.yaw,d+.0)*Math.min(1,dt*2.4);}
  const hc=P.c.head,cp=P.c.cape;
  const target=new THREE.Vector3(P.x,P.y+(m==='top'?.6:1.6)+(P.swim?-.6:0),P.z);
  const sh=cam.shake>0?cam.shake:0;cam.shake=Math.max(0,cam.shake-dt*2.2);
  const fovTarget=(m==='top'?44:m==='first'?78:62)+(P.state==='roll'?5:0)+(P.sp>.8&&P.state==='free'?4:0);cam.fov=lerp(cam.fov,fovTarget,Math.min(1,dt*6));if(Math.abs(camera.fov-cam.fov)>.01){camera.fov=cam.fov;camera.updateProjectionMatrix();}
  if(m==='first'){
    hc.visible=false;if(cp)cp.visible=false;
    const ey=P.y+1.72+(P.swim?-.5:0);_f.set(Math.sin(cam.yaw)*Math.cos(cam.pitch),-Math.sin(cam.pitch),Math.cos(cam.yaw)*Math.cos(cam.pitch));
    camera.position.set(P.x+Math.sin(cam.yaw)*.12,ey,P.z+Math.cos(cam.yaw)*.12);camera.lookAt(camera.position.x+_f.x,camera.position.y+_f.y,camera.position.z+_f.z);
  }else{
    hc.visible=true;if(cp)cp.visible=true;
    const dist=cam.dist,cp2=Math.cos(cam.pitch),ox=-Math.sin(cam.yaw)*cp2*dist,oy=Math.sin(cam.pitch)*dist,oz=-Math.cos(cam.yaw)*cp2*dist;
    let t=1;for(let k=1;k<=10;k++){const q=k/10,x=target.x+ox*q,y=target.y+oy*q,z=target.z+oz*q;if(y<gh(x,z)+.6||insideSolid(x,y,z)){t=Math.max(.12,(k-1)/10);break;}}
    const tp=new THREE.Vector3(target.x+ox*t,target.y+oy*t,target.z+oz*t);const gy=surfaceAt(tp.x,tp.z,tp.y+1)+.7;if(tp.y<gy)tp.y=gy;
    if(!cam.init){cam.pos.copy(tp);cam.init=true;}
    cam.pos.lerp(tp,1-Math.exp(-dt*(m==='top'?9:16)));
    camera.position.copy(cam.pos);camera.lookAt(target.x,target.y+(m==='top'?0:.2),target.z);
  }
  if(sh>0){camera.position.x+=(Math.random()-.5)*sh*.5;camera.position.y+=(Math.random()-.5)*sh*.5;camera.position.z+=(Math.random()-.5)*sh*.5;}
}

/* ================= HUD canvas ================= */
const _pv=new THREE.Vector3();
function proj(x,y,z){_pv.set(x,y,z).project(camera);if(_pv.z>1||_pv.z<-1)return null;return[(_pv.x*.5+.5)*W,(-_pv.y*.5+.5)*H];}
function regionOf(x,z){
  const h=gh(x,z);
  if(Math.hypot(x-VILLAGE.x,z-VILLAGE.z)<40)return'Hearthmoor Village';
  if(Math.hypot(x-ARENAS.hollow.x,z-ARENAS.hollow.z)<34)return'The Sunken Hollow';
  if(Math.hypot(x-CRT.x,z-CRT.z)<52)return'Ember Crater';
  if(Math.hypot(x-MTN.x,z-MTN.z)<62&&h>12)return'Frostpeak';
  if(h<1.8)return'The Shoreline';
  if(forestW(x,z)>.45)return'Mosswood';
  return'Emberfall Meadows';
}
// where the compass and (on a phone) the minimap go: between the two panels if there is room, else under them
let _lay=null,_layT=0;
function hudLayout(){const now=performance.now();if(_lay&&now-_layT<500&&_lay.W===W&&_lay.H===H)return _lay;_layT=now;
  const b=$('bars').getBoundingClientRect(),q=$('quest').getBoundingClientRect(),gap=q.left-b.right,top=NET.top||0;let cw,cy,mx;
  if(gap>=300){cw=Math.min(420,gap-24);cy=top+28;mx=q.left-10;}else{cw=Math.min(420,W-32);cy=Math.max(b.bottom,q.bottom)+22;mx=W-14;}
  return _lay={cw,cy,mx,W,H};}
function drawHUD(){
  const dpr=hudc.width/W;hx.setTransform(dpr,0,0,dpr,0,0);hx.clearRect(0,0,W,H);
  if(game.st!=='play'&&game.st!=='pause')return;
  const P=game.player;
  // enemy bars
  hx.textAlign='center';
  for(const e of game.enemies){if(e.state==='dead'||e.boss)continue;const d=Math.hypot(e.x-P.x,e.z-P.z);if(d>28)continue;if(!(e.aggroT>0||e.state==='chase'||e.state==='windup'||e.hp<e.maxhp||game.lock===e))continue;
    const p=proj(e.x,e.y+(e.def.scale||1)*2.2+(e.c.isWolf?-.5:0),e.z);if(!p)continue;const w=44,x=p[0]-w/2,y=p[1];
    hx.fillStyle='rgba(0,0,0,.6)';hx.fillRect(x-1,y-1,w+2,7);hx.fillStyle=e.state==='windup'?'#ffb02a':'#e5483f';hx.fillRect(x,y,w*clamp(e.hp/e.maxhp,0,1),5);}
  // damage numbers
  for(const q of game.pops){const k=q.t/1.1;const p=proj(q.x,q.y+k*1.4,q.z);if(!p)continue;hx.globalAlpha=Math.max(0,1-k*k);hx.font=`800 ${q.big?26:18}px 'Cinzel',serif`;hx.lineWidth=4;hx.strokeStyle='rgba(0,0,0,.75)';hx.strokeText(q.txt,p[0],p[1]);hx.fillStyle=q.col;hx.fillText(q.txt,p[0],p[1]);}
  if(game.bark&&!game.dialog){const bk=game.bark,p=proj(bk.n.x,bk.n.y+2.7,bk.n.z);if(p){const k=bk.t,al=Math.min(1,k*4,(3.4-k)*3);hx.globalAlpha=Math.max(0,al);hx.font="700 16px 'Alegreya Sans',sans-serif";const w=hx.measureText(bk.txt).width+22,x=p[0]-w/2,y=p[1]-34;hx.fillStyle='rgba(255,246,222,.95)';hx.strokeStyle='#5a3a22';hx.lineWidth=2.5;hx.beginPath();hx.roundRect(x,y,w,30,10);hx.fill();hx.stroke();hx.beginPath();hx.moveTo(p[0]-6,y+30);hx.lineTo(p[0],y+38);hx.lineTo(p[0]+6,y+30);hx.fill();hx.fillStyle='#3a2410';hx.fillText(bk.txt,p[0],y+16);hx.globalAlpha=1;}}
  hx.globalAlpha=1;
  // friends: name and health over their heads
  if(NET.on)for(const r of livePeers()){if(!r.c||!r.c.root.visible||!r.d)continue;const p=proj(r.d.x,r.d.y+(r.mt>=0?3.7:2.6),r.d.z);if(!p)continue;
    const dist=Math.round(Math.hypot(r.d.x-P.x,r.d.z-P.z)),txt=r.name+(dist>12?'  '+dist+' m':'');hx.font="700 15px 'Alegreya Sans',sans-serif";const w=hx.measureText(txt).width+18;
    hx.fillStyle='rgba(20,30,48,.82)';hx.strokeStyle='#7fd8ff';hx.lineWidth=2;hx.beginPath();hx.roundRect(p[0]-w/2,p[1]-24,w,22,9);hx.fill();hx.stroke();hx.fillStyle='#dff6ff';hx.fillText(txt,p[0],p[1]-8);
    hx.fillStyle='rgba(0,0,0,.6)';hx.fillRect(p[0]-22,p[1],44,5);hx.fillStyle=r.dd?'#777':'#6fd36b';hx.fillRect(p[0]-22,p[1],44*clamp((r.hp||0)/(r.mhp||100),0,1),5);}
  // lock reticle
  if(game.lock&&game.lock.state!=='dead'){const e=game.lock,p=proj(e.x,e.y+(e.def.scale||1)*1.1,e.z);if(p){hx.strokeStyle='#ffd24a';hx.lineWidth=2.5;const s=18+Math.sin(game.time*6)*2;hx.beginPath();hx.moveTo(p[0],p[1]-s);hx.lineTo(p[0]+s,p[1]);hx.lineTo(p[0],p[1]+s);hx.lineTo(p[0]-s,p[1]);hx.closePath();hx.stroke();}}
  // compass
  const L=hudLayout(),cw=L.cw,cx=W/2,cy=L.cy;
  hx.save();hx.beginPath();hx.rect(cx-cw/2,cy-16,cw,34);hx.clip();hx.fillStyle='rgba(20,12,6,.55)';hx.fillRect(cx-cw/2,cy-16,cw,34);
  const k=cw/2/1.35;
  const cards=[['N',PI],['E',PI/2],['S',0],['W',-PI/2]];
  for(let i=0;i<24;i++){const a=i*TAU/24,rel=angDiff(cam.yaw,a),x=cx-rel*k;hx.strokeStyle='rgba(255,230,180,.45)';hx.beginPath();hx.moveTo(x,cy+6);hx.lineTo(x,cy+(i%3===0?-2:2));hx.stroke();}
  hx.font="800 16px 'Cinzel',serif";hx.fillStyle='#ffd27a';for(const [n,a] of cards){const rel=angDiff(cam.yaw,a),x=cx-rel*k;hx.fillText(n,x,cy+6);}
  if(NET.on)for(const r of livePeers()){if(!r.d)continue;const a=Math.atan2(r.d.x-P.x,r.d.z-P.z),rel=clamp(angDiff(cam.yaw,a),-1.3,1.3),x=cx-rel*k;hx.fillStyle='#7fd8ff';hx.beginPath();hx.arc(x,cy+10,4.5,0,TAU);hx.fill();}
  const ob=objective();if(ob){const a=Math.atan2(ob.x-P.x,ob.z-P.z),rel=clamp(angDiff(cam.yaw,a),-1.3,1.3),x=cx-rel*k;hx.fillStyle='#ff8a3d';hx.beginPath();hx.moveTo(x,cy-12);hx.lineTo(x+7,cy-3);hx.lineTo(x,cy+3);hx.lineTo(x-7,cy-3);hx.closePath();hx.fill();}
  hx.restore();
  // minimap
  if(!cam.mapOpen){const R0=touchDev?52:(H<460?46:72),mx=touchDev?L.mx-R0:R0+16,my=touchDev?cy+26+R0:H-R0-18,ppw=1.5;
    hx.save();hx.translate(mx,my);hx.beginPath();hx.arc(0,0,R0,0,TAU);hx.clip();hx.fillStyle='#143a5c';hx.fillRect(-R0,-R0,R0*2,R0*2);
    hx.save();hx.rotate(cam.yaw+PI);const sc=ppw*(440/256),u=(P.x+world.mapHW)/(2*world.mapHW)*256,v=(P.z+world.mapHW)/(2*world.mapHW)*256;hx.scale(sc,sc);hx.drawImage(world.mapCanvas,-u,-v);hx.restore();
    hx.save();hx.rotate(cam.yaw+PI);
    if(NET.on)for(const r of livePeers()){if(!r.d)continue;let dx=(r.d.x-P.x)*ppw,dz=(r.d.z-P.z)*ppw;const dd=Math.hypot(dx,dz);if(dd>R0-5){dx*=(R0-5)/dd;dz*=(R0-5)/dd;}hx.fillStyle='#7fd8ff';hx.strokeStyle='#05202c';hx.lineWidth=2;hx.beginPath();hx.arc(dx,dz,4.5,0,TAU);hx.fill();hx.stroke();}
    for(const n of game.npcs){hx.fillStyle='#ffe27a';hx.beginPath();hx.arc((n.x-P.x)*ppw,(n.z-P.z)*ppw,2.5,0,TAU);hx.fill();}
    for(const e of game.enemies){if(e.state==='dead')continue;const dx=(e.x-P.x)*ppw,dz=(e.z-P.z)*ppw;if(Math.hypot(dx,dz)>R0)continue;hx.fillStyle=e.boss?'#ff3a2a':'#d84a3a';hx.beginPath();hx.arc(dx,dz,e.boss?4:2,0,TAU);hx.fill();}
    if(ob){let dx=(ob.x-P.x)*ppw,dz=(ob.z-P.z)*ppw;const dd=Math.hypot(dx,dz);if(dd>R0-6){dx*=(R0-6)/dd;dz*=(R0-6)/dd;}hx.strokeStyle='#ffb02a';hx.lineWidth=2.5;hx.beginPath();hx.arc(dx,dz,5+Math.sin(game.time*5)*1.5,0,TAU);hx.stroke();}
    hx.restore();
    hx.rotate(cam.yaw-P.yaw);hx.fillStyle='#fff';hx.strokeStyle='#000';hx.lineWidth=1.5;hx.beginPath();hx.moveTo(0,-7);hx.lineTo(5,6);hx.lineTo(0,3);hx.lineTo(-5,6);hx.closePath();hx.fill();hx.stroke();
    hx.restore();hx.strokeStyle='#a2793f';hx.lineWidth=3;hx.beginPath();hx.arc(mx,my,R0,0,TAU);hx.stroke();
  }else{
    const S=Math.min(W,H)*.82,mx=W/2-S/2,my=H/2-S/2;hx.fillStyle='rgba(8,14,24,.82)';hx.fillRect(0,0,W,H);hx.drawImage(world.mapCanvas,mx,my,S,S);hx.strokeStyle='#a2793f';hx.lineWidth=4;hx.strokeRect(mx,my,S,S);
    const tw=x=>mx+(x+world.mapHW)/(2*world.mapHW)*S,tz=z=>my+(z+world.mapHW)/(2*world.mapHW)*S;
    const lab=(t,x,z,c)=>{hx.font="800 13px 'Cinzel',serif";hx.fillStyle=c||'#fff';hx.strokeStyle='#000';hx.lineWidth=3;hx.strokeText(t,tw(x),tz(z)-8);hx.fillText(t,tw(x),tz(z)-8);};
    lab('Village',VILLAGE.x,VILLAGE.z,'#ffe27a');lab('Mosswood',-100,18);lab('Frostpeak',-30,-100);lab('Ember Crater',CRT.x,CRT.z,'#ff8a3d');lab('Sunken Hollow',0,-22,'#9fe8ff');
    for(const e of game.enemies){if(e.boss&&e.state!=='dead'){hx.fillStyle='#ff3a2a';hx.beginPath();hx.arc(tw(e.x),tz(e.z),5,0,TAU);hx.fill();}}
    if(ob){hx.strokeStyle='#ffb02a';hx.lineWidth=3;hx.beginPath();hx.arc(tw(ob.x),tz(ob.z),9+Math.sin(game.time*5)*2,0,TAU);hx.stroke();}
    const wp=owWaypoints();for(const t of OW.towers){hx.fillStyle=t.on?'#ffc23a':'#7fd8ff';hx.strokeStyle='#000';hx.lineWidth=2;hx.beginPath();hx.moveTo(tw(t.x),tz(t.z)-8);hx.lineTo(tw(t.x)+6,tz(t.z));hx.lineTo(tw(t.x),tz(t.z)+8);hx.lineTo(tw(t.x)-6,tz(t.z));hx.closePath();hx.fill();hx.stroke();}
    hx.textAlign='left';hx.font="700 15px 'Alegreya Sans',sans-serif";if(!touchDev){hx.fillStyle='#ffe27a';hx.fillText('FAST TRAVEL  (press a number)',12,H*.5-wp.length*11-14);
    wp.slice(0,9).forEach((w,i)=>{hx.fillStyle='#fff';hx.fillText((i+1)+'  '+w.n,12,H*.5-wp.length*11+i*22+4);});}
    hx.fillStyle='#9fe8ff';hx.fillText('Sprites '+OW.count+'/'+OW.nSprites+'   Towers '+OW.towers.filter(t=>t.on).length+'/'+OW.towers.length,12,touchDev?H-14:H*.5+wp.length*11+26);hx.textAlign='center';
    if(NET.on)for(const r of livePeers()){if(!r.d)continue;hx.fillStyle='#7fd8ff';hx.strokeStyle='#000';hx.lineWidth=2;hx.beginPath();hx.arc(tw(r.d.x),tz(r.d.z),6,0,TAU);hx.fill();hx.stroke();lab(r.name,r.d.x,r.d.z,'#bff0ff');}
    hx.save();hx.translate(tw(P.x),tz(P.z));hx.rotate(PI-P.yaw);hx.fillStyle='#fff';hx.strokeStyle='#000';hx.beginPath();hx.moveTo(0,-9);hx.lineTo(6,8);hx.lineTo(0,4);hx.lineTo(-6,8);hx.closePath();hx.fill();hx.stroke();hx.restore();
    hx.fillStyle='#fff';hx.font="600 15px 'Alegreya Sans',sans-serif";if(!touchDev)hx.fillText('Press M to close',W/2,my+S+22);
  }
}

/* ================= main update ================= */
game.hurtPlayer=hurtPlayer;
let fireT=0,smokeT=0,flyT=0,lastRegion='';
function step(dt){
  game.time+=dt;game.playT+=dt;updateWind(game.time);game.T=(game.T+dt/540)%1;game.saveT+=dt;
  for(const k of['jump','attack','dodge','special','potion'])input[k]=Math.max(0,input[k]-dt);
  let mx=(keys.KeyD?1:0)-(keys.KeyA?1:0),my=(keys.KeyW?1:0)-(keys.KeyS?1:0);
  if(touchDev&&(input.tx||input.ty)){mx=input.tx;my=-input.ty;}
  input.mx=mx;input.my=my;input.sprint=!!(keys.ShiftLeft||keys.ShiftRight||input.tsprint);
  const P=game.player;
  updatePlayer(dt);if(NET.on)updatePeers(dt);
  music.combat=0;
  for(const e of game.enemies.slice()){updateEnemy(e,dt);if(e.c&&e.c.root)e.c.root.visible=(Math.abs(e.x-P.x)<75&&Math.abs(e.z-P.z)<75)||e.boss&&e.awake;if(e.state==='chase'||e.state==='windup'||e.state==='attack')music.combat=1;}
  if(game.boss&&game.boss.state!=='dead')music.combat=1;else if(music.boss){music.boss=false;}
  for(const q of game.pops)q.t+=dt;game.pops=game.pops.filter(q=>q.t<1.1);
  updateProjs(dt,game);updatePickups(dt);updateParticles(dt);updateNPCs(dt);updateDialog(dt);
  for(const f of world.animated)f(dt);
  // world dynamics
  for(const c of world.chests){if(c.opened&&c.open<1){c.open=Math.min(1,c.open+dt*2.2);c.lid.rotation.x=-1.9*(1-Math.pow(1-c.open,3));}}
  const g=world.gate;if(g&&g.opening&&g.open<1){g.open=Math.min(1,g.open+dt/3.2);g.g.position.y=g.y0-8.2*g.open;cam.shake=Math.max(cam.shake,.12);if(R()<.5)burst(g.box.x+RR(-4,4),g.y0+.4,g.box.z+RR(-1,1),0xb8b0a0,3,2.5,.8,.25);if(g.open>=1){g.opening=false;if(world.gateBoxRef){world.gateBoxRef.hw=.01;world.gateBoxRef.hd=.01;}}}
  const br=world.brazier;if(br){const o=br.lit?.92+Math.sin(game.time*17)*.06:0;br.f.material.opacity=o;br.f2.material.opacity=o;br.f.scale.set(1+Math.sin(game.time*13)*.08,1+Math.sin(game.time*9)*.12,1);}
  fireT+=dt;updateDamage(dt);syncMapUI();document.body.classList.toggle('mapopen',!!cam.mapOpen);updateFlameFX();updateAmbient();for(const f of world.fires){const k=1+Math.sin(game.time*14+f.ph)*.12+Math.sin(game.time*23+f.ph)*.08;f.f1.scale.set(k,1+Math.sin(game.time*11+f.ph)*.2,k);f.f2.scale.set(1/k,1+Math.sin(game.time*17+f.ph)*.25,1/k);}
  // lights
  let bf=null,bd=30;for(const f of world.fires){const d=Math.hypot(f.x-P.x,f.z-P.z);if(d<bd){bd=d;bf=f;}}
  if(world.forge){const d=Math.hypot(world.forge.x-P.x,world.forge.z-P.z);if(d<bd){bd=d;bf=world.forge;}}
  if(world.brazier&&world.brazier.lit){const d=Math.hypot(world.brazier.x-P.x,world.brazier.z-P.z);if(d<bd){bd=d;bf=world.brazier;}}
  if(bf){fireLight.position.set(bf.x,bf.y+.5,bf.z);fireLight.intensity=(1.5+Math.sin(game.time*19)*.3+Math.sin(game.time*31)*.2)*(.55+light.night*.9)*(1-bd/32);}else fireLight.intensity=0;
  const dcr=Math.hypot(P.x-CRT.x,P.z-CRT.z);lavaLight.intensity=dcr<90?(2.2+Math.sin(game.time*3)*.4)*(1-dcr/95):0;if(lavaU)lavaU.t.value=game.time;
  smokeT-=dt;if(smokeT<=0){smokeT=.16;for(const s of smokes)if(Math.hypot(s.x-P.x,s.z-P.z)<70)spark(s.x+RR(-.2,.2),s.y,s.z+RR(-.2,.2),RR(-.1,.4),RR(1,1.8),RR(-.2,.2),0x9a9a9a,1.8,.35,-.3);
    for(const f of world.fires)if(Math.hypot(f.x-P.x,f.z-P.z)<45){spark(f.x+RR(-.2,.2),f.y,f.z+RR(-.2,.2),RR(-.3,.3),RR(1.5,3),RR(-.3,.3),R()<.5?0xffb04a:0xff7a2a,.8,.08,-1);}}
  if(light.night>.5){flyT-=dt;if(flyT<=0){flyT=.12;const a=R()*TAU,r=RR(4,18),x=P.x+Math.cos(a)*r,z=P.z+Math.sin(a)*r,h=gh(x,z);if(h>2&&h<20)spark(x,h+RR(.5,2.5),z,RR(-.4,.4),RR(-.1,.3),RR(-.4,.4),0xd8ff70,3,.1,0);}}
  for(const cg of cloudGroup.children){cg.position.x+=cg.userData.sp*dt;if(cg.position.x>450)cg.position.x=-450;}
  // dialog/region/hud
  const reg=regionOf(P.x,P.z);if(reg!==lastRegion){lastRegion=reg;$('regionname').textContent=reg;if(game.st==='play'&&game.time>2)toast(reg,2.2);}
  game.toastT-=dt;if(game.toastT<=0)$('toast').style.opacity=0;
  if(game.saveT>25&&!P.dead){game.saveT=0;saveGame();}
  updateCamera(dt);updateSky(game.T,camera.position,P);weatherLook();
  // interaction prompt
  const pr=$('prompt'),it=(!game.dialog&&!P.dead)?(P.mount?{prompt:'Dismount'}:nearestInteract()):null,ca=ctxAction();
  if(it||ca){pr.hidden=false;pr.innerHTML=(it?'<kbd>'+(touchDev?'TALK':'E')+'</kbd>'+it.prompt:'')+(it&&ca?' &nbsp; ':'')+(ca?'<kbd>'+(touchDev?'DO':'G')+'</kbd>'+ca.text:'');$('tUse').style.opacity=1;}else{pr.hidden=true;$('tUse').style.opacity=.45;}
  // bars
  $('hpb').firstElementChild.style.transform='scaleX('+clamp(P.hp/P.maxhp,0,1)+')';$('hpb').lastElementChild.textContent=Math.ceil(P.hp)+' / '+P.maxhp;
  $('stb').firstElementChild.style.transform='scaleX('+clamp(P.st/P.maxst,0,1)+')';
  $('mpb').firstElementChild.style.transform='scaleX('+clamp(P.mp/100,0,1)+')';$('mpb').style.boxShadow=P.mp>=100?'0 0 10px #58b7ff':'none';
  $('xpb').firstElementChild.style.transform='scaleX('+clamp(game.xp/xpNeed(),0,1)+')';
  $('lv').textContent='LV '+game.lvl;$('coins').textContent=game.coins;$('pots').textContent=game.pots;
  const hrs=((game.T*24+6)%24),hh=Math.floor(hrs),mm=Math.floor((hrs-hh)*60);$('clock').textContent=(light.sunElev>0?'☀ ':'☾ ')+String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
  game.hurtV=Math.max(0,game.hurtV-dt*2.2);const low=P.hp/P.maxhp<.3&&!P.dead?(.25+Math.sin(game.time*5)*.12):0;$('hurt').style.opacity=Math.max(game.hurtV*.9,low);
  updateAmbient(dt);
}
function titleCam(dt){
  game.time+=dt;game.T=(game.T+dt/200)%1;const a=game.time*.06+.6,P=game.player;
  const cx=VILLAGE.x,cz=VILLAGE.z-6;camera.position.set(cx+Math.cos(a)*54,gh(cx,cz)+20+Math.sin(game.time*.2)*4,cz+Math.sin(a)*54);camera.lookAt(cx,gh(cx,cz)+7,cz);
  if(camera.fov!==58){camera.fov=58;camera.updateProjectionMatrix();}
  for(const f of world.fires){const k=1+Math.sin(game.time*14+f.ph)*.12;f.f1.scale.set(k,1,k);}
  for(const f of world.animated)f(dt);
  for(const cg of cloudGroup.children){cg.position.x+=cg.userData.sp*dt;if(cg.position.x>450)cg.position.x=-450;}
  smokeT-=dt;if(smokeT<=0){smokeT=.16;for(const s of smokes)spark(s.x+RR(-.2,.2),s.y,s.z+RR(-.2,.2),RR(-.1,.4),RR(1,1.8),RR(-.2,.2),0x9a9a9a,1.8,.35,-.3);}
  updateParticles(dt);
  if(world.brazier)world.brazier.f.material.opacity=0;
  for(const n of game.npcs){poseHumanoid(n.c,{sp:0,phase:0,seed:n.seed,atk:-1,windup:-1},game.time);n.c.root.position.set(n.x,n.y,n.z);n.c.root.rotation.y=n.yaw;}
  updateSky(game.T,camera.position,{x:cx,y:8,z:cz});
}
function renderFrame(){
  waterU.time.value=game.time;waterMesh.position.set(Math.round(camera.position.x/10)*10,0,Math.round(camera.position.z/10)*10);
  const wu=waterMesh.material.uniforms;wu.fogDen.value=scene.fog.density;wu.dayA.value=light.dayAmt;wu.night.value=light.night;
  renderer.render(scene,camera);drawHUD();
}
let lastT=performance.now();
function frame(now){
  const raw=Math.min(.05,(now-lastT)/1000);lastT=now;
  // together the world never stops: the pause menu only takes your hands off the controls
  const shared=NET.on&&game.st==='pause'&&livePeers().length>0;game.inputLocked=game.st==='pause';
  if(game.st==='play'||shared){let dt=raw;if(game.hitstop>0){game.hitstop-=raw;dt=raw*.04;}if(game.slow>0){game.slow-=raw;dt*=.4;}step(dt);}
  else if(game.st==='title')titleCam(raw);
  netTick(raw);
  if(game.st!=='load')renderFrame();
  requestAnimationFrame(frame);
}

/* ================= menus ================= */
function applyQuality(q){
  Q=q;store.set('ef-q',q);const c=QS[q];resize();
  renderer.shadowMap.enabled=!!c.shadow;sun.castShadow=!!c.shadow;
  if(sun.shadow.mapSize.x!==c.sm){sun.shadow.mapSize.set(c.sm,c.sm);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
  if(world.grass)world.grass.count=Math.min(world.grass.userData.full,c.grass);
  scene.traverse(o=>{if(o.material&&o.material.needsUpdate!==undefined)o.material.needsUpdate=true;});
  document.querySelectorAll('#gfx button').forEach(b=>b.classList.toggle('sel',+b.dataset.q===q));
  $('bGfx').textContent='Graphics: '+['','Low','Medium','High'][q];
}
const HERO_IMG={};
function heroPortraits(){
  const W=170,H=220,rt=new THREE.WebGLRenderTarget(W,H),sc=new THREE.Scene(),pc=new THREE.PerspectiveCamera(28,W/H,.1,60);
  sc.add(new THREE.HemisphereLight(0xdff0ff,0x9a8a70,1.25));const dl=new THREE.DirectionalLight(0xfff0d0,1.6);dl.position.set(3,5,4);sc.add(dl);
  const oc=new THREE.Color();renderer.getClearColor(oc);const oa=renderer.getClearAlpha(),ot=renderer.getRenderTarget();
  for(const id in HEROES){
    const c=makeHero(id);c.root.rotation.y=-.5;poseHumanoid(c,{sp:0,phase:0,seed:0},1.3);updateWavers(c,1.3,0);sc.add(c.root);
    const sc2=HEROES[id].o.scale||1;pc.position.set(0,1.3*sc2+.1,6.0);pc.lookAt(0,1.3*sc2,0);
    renderer.setClearColor(0x000000,0);renderer.setRenderTarget(rt);renderer.clear();renderer.render(sc,pc);
    const px=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(rt,0,0,W,H,px);
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;const x=cv.getContext('2d'),im=x.createImageData(W,H);
    for(let r=0;r<H;r++)im.data.set(px.subarray((H-1-r)*W*4,(H-r)*W*4),r*W*4);x.putImageData(im,0,0);
    HERO_IMG[id]=cv.toDataURL();sc.remove(c.root);
  }
  renderer.setRenderTarget(ot);renderer.setClearColor(oc,oa);
}
function paintHeroes(){const cur=store.get('ef-hero','knight'),r=$('heroes');r.innerHTML='';for(const id in HEROES){const b=document.createElement('button');b.className='hero'+(id===cur?' sel':'');b.innerHTML=(HERO_IMG[id]?'<img src="'+HERO_IMG[id]+'" alt="">':'')+'<span>'+HEROES[id].name+'</span>';b.title=HEROES[id].desc;b.onclick=()=>{store.set('ef-hero',id);swapHero(id);paintHeroes();};r.appendChild(b);}$('herodesc').textContent=HEROES[cur]?HEROES[cur].desc:'';}
paintHeroes();
$('bNew').onclick=()=>{initAudio();startGame(false);};
$('bCont').onclick=()=>{if(store.get('ef-save',null)){initAudio();startGame(true);}};
document.querySelectorAll('#gfx button').forEach(b=>b.onclick=()=>applyQuality(+b.dataset.q));
$('bGfx').onclick=()=>applyQuality(Q%3+1);
$('bRes').onclick=()=>setPause(false);$('bView').onclick=cycleView;
$('bMute').onclick=()=>{initAudio();setMuted(!muted);};
$('bQuit').onclick=()=>{toTitle();};$('bQuit2').onclick=()=>toTitle();
$('bResp').onclick=()=>respawn();
$('bFree').onclick=()=>{$('end').hidden=true;};

/* ================= PlayRoom: playing together (up to 2) =================
   Embedded in PlayRoom (?embed=1) the page talks to its parent with postMessage; the parent relays
   every message to the room over the socket (ef:msg) and back. Nothing here talks to a server.
   The host is the playing player with the lowest user id: it runs the enemies, bosses, time and
   weather, and sends a snapshot ~8 times a second ('w'). The other player (the guest) draws those
   enemies as puppets, sends its hits to the host ('hit') and is hurt by the host ('hurt'). Each
   player moves themselves and reports where they are ('p'). Things done to the world (chests,
   forage, felled trees, smashed objects, pots, towers, campfires, quest progress) are sent as they
   happen and applied silently by the other, without the loot. A late joiner asks for the lot ('hello'
   → 'full'). Inventory, health, level, coins and saves stay each player's own. */
const EMBED=/[?&]embed=1/.test(location.search);
const NET={on:false,me:0,names:{},peers:new Map(),guest:false,hostId:0,rx:false,from:0,sendT:0,worldT:0,aliveT:0,scoreT:0,scale:1,top:0,fires:[],queue:[],ready:false};
const LIVE_MS=4000;
function netSend(d){if(NET.on&&EMBED)parent.postMessage({ef:'send',d},location.origin);}
const bitsOf=a=>a.reduce((m,v,i)=>m|(v?1<<i:0),0),fromBits=m=>[0,1,2].map(i=>!!(m&(1<<i)));
const r2=v=>Math.round(v*100)/100;
function livePeers(){const now=performance.now(),a=[];for(const r of NET.peers.values())if(r.pl&&now-r.at<LIVE_MS)a.push(r);return a;}
function playing(){return game.st==='play'||game.st==='pause';}
function netScale(){return NET.on&&playing()&&livePeers().length?1.6:1;}
/* who runs the world: the lowest id among those playing */
function netRole(){
  if(!NET.on)return;
  let low=NET.me;for(const r of livePeers())if(r.id<low)low=r.id;
  const was=NET.guest;NET.hostId=low;NET.guest=playing()&&low!==NET.me;
  if(was&&!NET.guest)becomeHost();else if(!was&&NET.guest)becomeGuest();
  const s=netScale();if(s!==NET.scale&&!NET.guest){for(const e of game.enemies){if(e.state==='dead')continue;const f=e.hp/e.maxhp;e.maxhp=Math.round(e.def.hp*s);e.hp=Math.max(1,Math.round(f*e.maxhp));}}
  NET.scale=s;
}
function becomeGuest(){
  WX.next=1e12;for(const p of projs)scene.remove(p.m);projs.length=0;for(const d of decals)endDecal(d);
  netSend({t:'hello'});
}
function becomeHost(){
  WX.next=game.time+RR(120,240);for(const d of decals)endDecal(d);
  for(const e of game.enemies){if(e.state==='dead')continue;e.strikes=null;e.dec=null;e.t=0;e.cd=1;e.windup=-1;e.atk=-1;e.bow=-1;
    if(e.boss&&!e.awake)e.state='idle';else if(e.state!=='idle')e.state='chase';}
}
/* ---- the other player, drawn here ---- */
function peerOf(id){let r=NET.peers.get(id);if(!r){r={id,name:NET.names[id]||'Friend',at:0,pl:0,c:null,hero:null,d:null,proxy:{x:0,y:0,z:0,dead:false,remote:id},trail:makeTrail(),phase:0,deadT:0,atk:0};NET.peers.set(id,r);}return r;}
function onPose(r,m){
  const first=!r.d;Object.assign(r,m);r.at=performance.now();
  if(first||Math.hypot(r.d.x-m.x,r.d.z-m.z)>30)r.d={x:m.x,y:m.y,z:m.z,yaw:m.yaw};
  if(m.s==='attack'&&r.atk!==m.ai+'/'+m.n)r.atk=m.ai+'/'+m.n,r.at0=m.at;
  if(first&&playing())toast((r.name||'Friend')+' is on the isle',2.6);
}
function updatePeers(dt){
  const now=performance.now(),P=game.player;
  for(const r of NET.peers.values()){
    const live=r.pl&&now-r.at<LIVE_MS&&playing();
    if(!live){if(r.c)r.c.root.visible=false;r.trail.m.visible=false;continue;}
    if(!r.c||r.hero!==r.h){if(r.c)scene.remove(r.c.root);r.c=makeHero(r.h);r.hero=r.h;scene.add(r.c.root);}
    const d=r.d,age=Math.min(.15,(now-r.at)/1000),k=Math.min(1,dt*12);
    d.x+=(r.x+(r.vx||0)*age-d.x)*k;d.z+=(r.z+(r.vz||0)*age-d.z)*k;d.y+=(r.y-d.y)*k;d.yaw+=angDiff(d.yaw,r.yaw)*k;
    const spd=Math.hypot(r.vx||0,r.vz||0);r.phase+=dt*(6+spd*1.35);r.deadT=r.dd?r.deadT+dt:0;
    if(r.s==='attack')r.at0=Math.min(1,(r.at0||0)+dt/[.44,.44,.66][r.ai||0]);
    const c=r.c;
    const st={sp:r.mt>=0?0:clamp(spd/8.6,0,1),phase:r.phase,seed:0,swim:!!r.sw,hit:r.hu?1:0,atk:r.s==='attack'?r.at0:-1,atkIdx:r.ai||0,roll:r.s==='roll'?r.rt:-1,spin:r.s==='spin'?r.sn:-1,glide:!!r.gl,dead:r.dd?Math.min(1,r.deadT*2.2):0};
    c.lift=r.gr?0:clamp(-(r.vy||0)/10,-1,1);poseHumanoid(c,st,game.time);if(r.em&&!r.dd)poseEmote(c,r.em);
    let ry=0;if(r.mt>=0&&!r.dd){ry=1.2;c.legs[0].rotation.set(-.95,0,-.62);c.legs[1].rotation.set(-.95,0,.62);if(r.s==='free'){c.arms[0].rotation.set(-1.25,0,.12);c.arms[1].rotation.set(-1.25,0,-.12);c.pivot.rotation.x=.28;}}
    c.root.position.set(d.x,d.y+(r.sw?-.1:0)+ry,d.z);c.root.rotation.y=d.yaw;c.root.visible=Math.abs(d.x-P.x)<150&&Math.abs(d.z-P.z)<150;
    setFlash(c,r.hu?.6:0);
    updateTrail(r.trail,c,r.s==='attack'&&st.atk>.25&&st.atk<.75||r.s==='spin',dt,r.s==='spin'?[.5,.8,1]:[.9,.95,1]);
    Object.assign(r.proxy,{x:d.x,y:d.y,z:d.z,dead:!!r.dd});
  }
  // friends are solid: step out of each other (walls still win, collideXZ runs after)
  if(!P.dead&&!P.mount)for(const r of livePeers()){if(!r.d||r.dd||r.mt>=0)continue;const dx=P.x-r.d.x,dz=P.z-r.d.z,dd=Math.hypot(dx,dz);if(dd<.9&&dd>1e-3&&Math.abs(P.y-r.d.y)<1.6){P.x+=dx/dd*(.9-dd);P.z+=dz/dd*(.9-dd);collideXZ(P,.45);}}
}
function poseEmote(c,k){
  if(k==='wave'){c.arms[1].rotation.x=0;c.arms[1].rotation.z=2.55+Math.sin(game.time*11)*.25;}
  else if(k==='cheer'){c.arms[0].rotation.x=0;c.arms[1].rotation.x=0;c.arms[0].rotation.z=-2.7;c.arms[1].rotation.z=2.7;c.body.position.y=-.9+Math.abs(Math.sin(game.time*8))*.12;}
  else if(k==='dance'){const s=game.time*7;c.body.position.y=-.9+Math.abs(Math.sin(s))*.1;c.body.rotation.y=Math.sin(s*.5)*.6;c.arms[0].rotation.x=0;c.arms[1].rotation.x=0;c.arms[0].rotation.z=-1.6-Math.sin(s)*.8;c.arms[1].rotation.z=1.6+Math.sin(s+PI)*.8;c.legs[0].rotation.x=Math.sin(s)*.6;c.legs[1].rotation.x=-Math.sin(s)*.6;}
  else if(k==='sit'){c.body.position.y=-.9-.46;c.legs[0].rotation.x=-1.45;c.legs[1].rotation.x=-1.45;c.arms[0].rotation.x=-.7;c.arms[1].rotation.x=-.7;c.body.rotation.x=.08;}
}
/* ---- enemies aim at whoever is nearest; hits on the friend go to the friend ---- */
function targets(){const a=[game.player];if(NET.on&&!NET.guest)for(const r of livePeers())if(r.d)a.push(r.proxy);return a;}
function nearestTarget(e){let best=null,bd=1e9;for(const Q of targets()){if(Q.dead)continue;const d=Math.hypot(Q.x-e.x,Q.z-e.z);if(d<bd){bd=d;best=Q;}}return best||game.player;}
function hurtTarget(Q,dmg,fx,fz,kind){if(Q.remote){if(!Q.dead)netSend({t:'hurt',to:Q.remote,dmg:Math.round(dmg),fx:r2(fx),fz:r2(fz),k:kind});}else hurtPlayer(dmg,fx,fz,kind);}
function hurtAll(test,dmg,fx,fz,kind){for(const Q of targets())if(!Q.dead&&test(Q))hurtTarget(Q,dmg,fx,fz,kind);}
/* ---- the guest's enemies: drawn where the host says ---- */
function puppetEnemy(e,dt){
  const c=e.c;e.flash=Math.max(0,e.flash-dt);e.hit=Math.max(0,e.hit-dt*5);
  if(e.state==='dead'){e.deadT+=dt/.9;poseAny(e,{sp:0,phase:e.phase,dead:Math.min(1,e.deadT),seed:e.seed});if(e.deadT>=2.4){scene.remove(c.root);if(e.trail)scene.remove(e.trail.m);game.enemies.splice(game.enemies.indexOf(e),1);}else if(e.deadT>1.4)c.root.position.y-=dt*.6;return;}
  if(e.nx!=null){const k=Math.min(1,dt*10);e.x+=(e.nx-e.x)*k;e.z+=(e.nz-e.z)*k;e.yaw+=angDiff(e.yaw,e.nyaw)*k;}
  const s=e.ps||{sp:0};e.phase+=dt*(5+(s.sp||0)*(e.spd||4)*1.8);e.y=gh(e.x,e.z);
  poseAny(e,{sp:s.sp||0,phase:e.phase,windup:s.windup==null?-1:s.windup,atk:s.atk==null?-1:s.atk,atkIdx:s.atkIdx||0,bow:s.bow==null?-1:s.bow,recover:s.recover||0,hit:Math.max(e.hit,s.hit||0),seed:e.seed});
  c.root.position.set(e.x,e.y,e.z);c.root.rotation.y=e.yaw;setFlash(c,e.flash>0?e.flash*3.5:(e.state==='windup'?.25+.2*Math.sin(game.time*30):0));
  if(e.trail)updateTrail(e.trail,c,e.state==='charge'||(e.state==='recover'&&(s.atk||-1)>=0),dt,e.def.ele==='ice'?[.5,.9,1]:[1,.6,.2]);
  if(game.boss===e)$('bfill').style.transform='scaleX('+clamp(e.hp/e.maxhp,0,1)+')';
}
const ST_LIST=['idle','chase','return','windup','attack','recover','stagger','charge','rain','dead'];
function worldSnap(){
  const g=livePeers().filter(r=>r.d),near=e=>g.some(r=>Math.abs(r.d.x-e.x)<130&&Math.abs(r.d.z-e.z)<130);
  const en=[];for(const e of game.enemies){if(e.state==='dead'||!near(e))continue;const s=e.ps||{};
    en.push([e.id,e.kind,r2(e.x),r2(e.z),r2(e.yaw),Math.ceil(e.hp),e.maxhp,ST_LIST.indexOf(e.state),r2(s.sp||0),r2(s.windup==null?-1:s.windup),r2(s.atk==null?-1:s.atk),s.atkIdx||0,r2(s.bow==null?-1:s.bow),r2(s.recover||0),r2(e.hit),r2(e.flash),e.awake?1:0]);}
  const dc=[];for(const d of decals)if(d.visible)dc.push([r2(d.position.x),r2(d.position.z),r2(d.userData.r||d.scale.x),r2(d.userData.b.scale.x),d.userData.a.material.color.getHex()]);
  const w={t:'w',T:Math.round(game.T*1e4)/1e4,wt:WX.target,st:game.stage,sh:bitsOf(game.shards),bs:game.boss&&game.boss.state!=='dead'&&game.boss.awake?game.boss.id:'',en,dc};
  if(performance.now()-NET.aliveT>2000){NET.aliveT=performance.now();w.al=game.enemies.filter(e=>e.state!=='dead').map(e=>e.id);}
  return w;
}
function applySnap(w){
  if(Math.abs(angDiff(game.T*TAU,w.T*TAU))>.02)game.T=w.T;WX.target=w.wt;
  setProgress(w.st,fromBits(w.sh));
  const by=new Map(game.enemies.map(e=>[e.id,e]));
  for(const a of w.en){let e=by.get(a[0]);
    if(!e){game.killed.delete(a[0]);e=spawnEnemy(a[1],a[2],a[3],a[0]);if(!e)continue;by.set(e.id,e);}
    if(e.state==='dead')continue;
    e.nx=a[2];e.nz=a[3];e.nyaw=a[4];e.hp=a[5];e.maxhp=a[6];e.state=ST_LIST[a[7]]||'idle';e.ps={sp:a[8],windup:a[9],atk:a[10],atkIdx:a[11],bow:a[12],recover:a[13],hit:a[14]};if(a[15]>e.flash)e.flash=a[15];e.awake=!!a[16];}
  if(w.al){const al=new Set(w.al);for(const e of game.enemies.slice())if(e.state!=='dead'&&!al.has(e.id)){scene.remove(e.c.root);if(e.trail)scene.remove(e.trail.m);game.enemies.splice(game.enemies.indexOf(e),1);if(game.lock===e)game.lock=null;}}
  const b=w.bs&&by.get(w.bs);
  if(b&&b.state!=='dead'){if(game.boss!==b){game.boss=b;$('boss').hidden=false;$('bname').textContent=b.def.name;}}
  else if(game.boss){game.boss=null;$('boss').hidden=true;}
  for(const d of decals)if(d.visible)endDecal(d);
  for(const [x,z,r,f,col] of w.dc){const d=telegraph(null,x,z,r,col);decalFill(d,f);}
}
/* ---- quest progress: anyone advances it for both; the host's world is the one that counts ---- */
function setProgress(st,sh){
  const old=game.stage,same=st===old&&sh.every((v,i)=>v===!!game.shards[i]);if(same)return;
  game.shards=sh.slice();game.stage=st;
  if(st>=3&&old<3){if(!world.brazier.lit)litBrazier();if(!world.gate.open&&!world.gate.opening)openGate();if(!NET.guest)ensureColossus();}
  if(st<3&&old>=3){world.brazier.lit=false;world.gate.opening=false;world.gate.open=0;world.gate.g.position.y=world.gate.y0;if(world.gateBoxRef){world.gateBoxRef.hw=4.4;world.gateBoxRef.hd=.9;}}
  for(let i=game.pickups.length-1;i>=0;i--){const p=game.pickups[i];if(p.kind==='shard'&&game.shards[p.idx]){scene.remove(p.m);if(p.beam)scene.remove(p.beam);game.pickups.splice(i,1);}}
  setQuestText();saveGame();
}
function netProg(){netSend({t:'prog',st:game.stage,sh:bitsOf(game.shards)});}
/* ---- a late joiner gets everything that has happened to the world ---- */
function fullState(){
  return {t:'full',st:game.stage,sh:bitsOf(game.shards),ch:world.chests.filter(c=>c.opened).map(c=>c.id),fg:FORAGE.map((f,i)=>f.t>0?[i,Math.round(f.t)]:null).filter(Boolean),
    tw:OW.towers.filter(t=>t.on).map(t=>t.id),tr:TREES.map((t,i)=>t.dead?i:-1).filter(i=>i>=0),ob:DMG.map((o,i)=>o.hp<o.max?[i,Math.round(o.hp*10)/10]:null).filter(Boolean),
    bk:world.breakables.map((b,i)=>b.hp<=0?i:-1).filter(i=>i>=0),fi:NET.fires};
}
const _zero=new THREE.Matrix4().makeScale(0,0,0);
function applyFull(m){
  setProgress(m.st,fromBits(m.sh));
  for(const c of world.chests)if(m.ch.includes(c.id)&&!c.opened){c.opened=true;c.open=1;c.lid.rotation.x=-1.9;}
  for(const [i,t] of m.fg){const f=FORAGE[i];if(f&&!(f.t>0)){f.t=t;foragePaint(f);}}
  for(const t of OW.towers)if(m.tw.includes(t.id)&&!t.on){t.on=true;owPaintTower(t);}
  for(const i of m.tr){const t=TREES[i];if(!t||t.dead)continue;t.dead=true;t.c.x=t.c.z=1e6;for(const ms of t.ms){ms.setMatrixAt(t.i,_zero);ms.instanceMatrix.needsUpdate=true;}}
  NET.rx=true;
  for(const [i,hp] of m.ob){const o=DMG[i];if(!o||o.dead||o.hp<=hp)continue;o.hp=hp;
    if(hp<=0){if(o.struct)finishCollapse(o);else breakProp(o,null);}else if(o.struct)houseStages(o);}
  for(const i of m.bk){const b=world.breakables[i];if(b&&b.hp>0)breakBreakable(b);}
  NET.rx=false;
  for(const [x,z] of m.fi)if(!world.fires.some(f=>Math.hypot(f.x-x,f.z-z)<1)){campfire(x,z,false);NET.fires.push([x,z]);}
}
/* ---- one message from the room ---- */
function onNet(from,d){
  if(!d||typeof d!=='object'||from===NET.me)return;
  if(d.to&&d.to!==NET.me)return;
  const r=peerOf(from);NET.from=from;
  switch(d.t){
    case'p':onPose(r,d);break;
    case'bye':r.pl=0;break;
    case'ev':if(r.d&&Math.hypot(r.d.x-game.player.x,r.d.z-game.player.z)<60)peerEvent(r,d);break;
    case'hello':if(!NET.guest&&playing())netSend(Object.assign(fullState(),{to:from}));break;
    case'full':if(NET.guest)applyFull(d);break;
    case'w':if(NET.guest&&from===NET.hostId)applySnap(d);break;
    case'prog':if(!NET.guest)setProgress(Math.max(game.stage,d.st),fromBits(d.sh|bitsOf(game.shards)));break;
    case'hit':{if(NET.guest)break;const e=game.enemies.find(x=>x.id===d.id);if(!e||e.state==='dead')break;NET.rx=true;e.killer=from;damageEnemy(e,+d.amt||0,+d.sx||e.x,+d.sz||e.z,+d.kb||4,!!d.cr);NET.rx=false;break;}
    case'hurt':hurtPlayer(+d.dmg||0,+d.fx,+d.fz,d.k);break;
    case'kill':{if(!NET.guest)break;let e=game.enemies.find(x=>x.id===d.id);if(!e){game.killed.delete(d.id);e=spawnEnemy(d.kind,d.x,d.z,d.id);}if(!e||e.state==='dead')break;e.x=d.x;e.z=d.z;e.killer=d.by;NET.rx=true;killEnemy(e);NET.rx=false;break;}
    case'proj':if(NET.guest&&d.o)fireProj(d.o);break;
    case'chest':{const o=world.chests.find(c=>c.id===d.id);if(o&&!o.opened){o.opened=true;sfx('chest');}break;}
    case'forage':{const f=FORAGE[d.i];if(f){f.t=d.ft;foragePaint(f);}break;}
    case'tower':{const t=OW.towers.find(x=>x.id===d.id);if(t&&!t.on){t.on=true;owPaintTower(t);toast(r.name+' lit '+t.name,2.6);}break;}
    case'tree':{const t=TREES[d.i];if(t&&!t.dead){t.dead=true;t.c.x=t.c.z=1e6;FALL.push({t,a:+d.a||0,age:0,remote:true});}break;}
    case'obj':{const o=DMG[d.i];if(!o||o.dead)break;NET.rx=true;damageObj(o,+d.amt||0,{nx:d.nx,nz:d.nz,cx:d.cx,cz:d.cz},d.px==null?null:{x:d.px,y:d.py,z:d.pz});NET.rx=false;break;}
    case'brk':{const b=world.breakables[d.i];if(b&&b.hp>0){NET.rx=true;breakBreakable(b);NET.rx=false;}break;}
    case'fire':if(!world.fires.some(f=>Math.hypot(f.x-d.x,f.z-d.z)<1)){campfire(d.x,d.z,false);NET.fires.push([d.x,d.z]);}break;
  }
}
function peerEvent(r,d){
  const x=r.d.x,y=r.d.y,z=r.d.z,A={x,y,z};
  if(d.k==='sw'){sfx('swing',d.i||0);if(d.kit==='nova'){ringFx(A,0xff8a2a,5.4);ringFx(A,0xffd27a,3.2);}else if(d.kit==='quake')ringFx(A,0xd8f0ff,4.3);
    else if(d.kit==='ranged'){const fx=Math.sin(r.d.yaw),fz=Math.cos(r.d.yaw);for(let i=1;i<=14;i++)spark(x+fx*i*1.1,y+1.2,z+fz*i*1.1,0,0,0,i%2?0x9fe8ff:0xffffff,.35,.16,0);}
    if(d.i===2)burst(x,y+.2,z,0xd8c8a0,14,4,.5,.16);}
  else if(d.k==='spin')sfx('spin');
  else if(d.k==='heal')burst(x,y+1,z,0x7dff7d,20,3,.9,.14,-1);
  else if(d.k==='cast')burst(+d.x,0,+d.z,0xbfeaff,10,2.5,.5,.1);
  else if(d.k==='hurt')burst(x,y+1.2,z,0xff5a4a,10,4,.5,.14);
}
/* ---- every frame: say where I am, run the role, send the world ---- */
function netTick(dt){
  if(!NET.on)return;
  netRole();
  const now=performance.now(),P=game.player,peers=livePeers().length;
  if(playing()&&now-NET.sendT>(peers?80:500)){NET.sendT=now;
    const hi=P.mount?OW.horses.indexOf(P.mount):-1;
    netSend({t:'p',h:game.hero,pl:1,x:r2(P.x),y:r2(P.y),z:r2(P.z),yaw:r2(P.yaw),vx:r2(P.vx),vy:r2(P.vy),vz:r2(P.vz),s:P.state,ai:P.atkIdx,n:P.atkN||0,at:r2(P.atkT||0),rt:r2(P.rollT||0),sn:r2(P.spinT||0),
      sw:P.swim?1:0,gl:P.gliding||P.climbing?1:0,gr:P.grounded?1:0,em:P.emote?P.emote.kind:'',dd:P.dead?1:0,hu:P.hurtT>0?1:0,mt:hi,ms:P.seat||0,hp:Math.ceil(P.hp),mhp:P.maxhp,lv:game.lvl});}
  if(P&&P.mount&&P.seat===0){const r=remoteRider(P.mount,0);if(r&&r.id<NET.me){P.seat=1;P.mount.mounted=false;}}
  if(!NET.guest&&peers&&playing()&&now-NET.worldT>120){NET.worldT=now;netSend(worldSnap());}
  if(now-NET.scoreT>1000){NET.scoreT=now;parent.postMessage({ef:'score',score:netScore(),won:game.won?1:0,playing:playing()?1:0},location.origin);}
}
function netScore(){return Math.min(24000,game.kills*15+game.shards.filter(Boolean).length*800+(game.lvl-1)*100+(OW.count||0)*40+(game.won?5000:0));}
/* ---- horses: a friend driving, me behind them ---- */
function remoteRider(h,seat){const i=OW.horses.indexOf(h);for(const r of livePeers())if(r.mt===i&&(r.ms||0)===seat&&!r.dd)return r;return null;}
/* ---- the parent page ---- */
function netInit(m){
  NET.me=+m.me.id;NET.names[NET.me]=m.me.name;for(const p of m.peers||[])NET.names[+p.id]=p.name;for(const r of NET.peers.values())r.name=NET.names[r.id]||r.name;
  NET.on=true;NET.coop=!!m.coop;
  const s=m.safe||{},root=document.documentElement.style;
  root.setProperty('--st',(s.t||0)+'px');root.setProperty('--sb',(s.b||0)+'px');root.setProperty('--sl',(s.l||0)+'px');root.setProperty('--sr',(s.r||0)+'px');
  NET.top=+m.top||0;root.setProperty('--top',NET.top+'px');document.body.classList.add('embed');
  const others=(m.peers||[]).filter(p=>+p.id!==NET.me).map(p=>p.name);
  const n=$('withwho');if(n)n.textContent=others.length?'Playing with '+others.join(' and ')+' — pick your hero, then New Journey or Continue':'';
}
if(EMBED)addEventListener('message',e=>{
  if(e.origin!==location.origin||!e.data||!e.data.ef)return;const m=e.data;
  if(m.ef==='init')netInit(m);
  else if(m.ef==='names'){for(const p of m.peers||[])NET.names[+p.id]=p.name;for(const r of NET.peers.values())r.name=NET.names[r.id]||r.name;}
  else if(m.ef==='msg'){if(!NET.ready)NET.queue.push(m);else onNet(+m.from,m.d);}
  else if(m.ef==='over'){if(game.st==='play')setPause(true);}
});
function netReady(){NET.ready=true;for(const m of NET.queue)onNet(+m.from,m.d);NET.queue.length=0;if(EMBED)parent.postMessage({ef:'ready'},location.origin);}

/* ================= boot ================= */
const tick=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(){
  const prog=async(p,t)=>{$('loadbar').style.transform='scaleX('+p+')';$('loadtxt').textContent=t;await tick(30);};
  resize();buildMaterials();buildSkyAndLights();await prog(.1,'Raising the mountains…');
  buildTerrain();await prog(.3,'Planting the forests…');
  buildRuins();buildVegetation();await prog(.55,'Raising the village…');
  buildVillage();buildCamps();buildOpenWorld();buildRuinChests();buildLiving();await prog(.75,'Waking the guardians…');
  buildArenas();buildParticles();await prog(.9,'Lighting the embers…');
  game.player=makePlayer();game.player.c.root.visible=true;createNPCs();
  setQuestText();applyWorld(null);
  applyQuality(Q);setMuted(muted);
  try{heroPortraits();}catch(e){console.warn(e);}paintHeroes();
  game.st='title';toTitle();$('load').hidden=true;
  requestAnimationFrame(frame);netReady();
}
/* mobile: tap-friendly map (fast travel list + close button) */
let _mapShown=false;
function syncMapUI(){
  if(!touchDev)return;const on=!!cam.mapOpen&&game.st==='play';if(on===_mapShown)return;_mapShown=on;
  const ov=$('mapov');ov.hidden=!on;if(!on)return;
  const l=$('mapl');l.innerHTML='<b>FAST TRAVEL</b>';owWaypoints().slice(0,9).forEach((w,i)=>{const b=document.createElement('button');b.textContent=w.n;b.onclick=()=>{fastTravel(i);cam.mapOpen=false;};l.appendChild(b);});
  $('mapx').onclick=()=>{cam.mapOpen=false;};
}
if(touchDev)document.body.classList.add('touchui');
if(touchDev){const pn=document.querySelector('#title .panel');if(pn)pn.innerHTML='<b>Move</b> left stick (push to the edge to sprint) · <b>Look</b> drag the right side · <b>ATTACK</b> chain 3 hits · <b>ROLL</b> dodge · <b>JUMP</b> (hold in air to glide, hold at a wall to climb) · <b>SPIN</b> · <b>HEAL</b> · <b>EAT</b> · <b>TALK</b> (NPCs, chests, horse) · <b>DO</b> (fish, pick, cook, campfire) · <b>LOCK</b> target · <b>MAP</b> fast travel · <b>EMOTE</b> wave / dance / cheer / sit · <b>VIEW</b> camera · swing at trees to chop wood';}
window.__ef={NET,livePeers,FALL,setProgress,killEnemy,remoteRider,DMG,hitObjects,damageObj,objNear,treeImpact,DEB,TREES,FORAGE,FISH,WX,ctxAction,doCtx,doEmote,eatFood,owChop,startRest,HERO_IMG,RUINS,swapHero,HEROES,OW,surfaceAt,insideSolid,mount,dismount,fastTravel,activateTower,owWaypoints,game,input,cam,keys,step,gh,world,spawnEnemy,damageEnemy,hurtPlayer,startGame,toTitle,applyQuality,CAMPS,ARENAS,addXP,dropPickup,renderFrame,setPause,cycleView,interact,openDialog,advanceDialog,closeDialog,projs,ensureColossus,respawn,saveGame,boot,titleCam,render:()=>renderFrame(),camera,scene,renderer,updateSky,toggleLock,openChest,nearestInteract};
boot();
})();
