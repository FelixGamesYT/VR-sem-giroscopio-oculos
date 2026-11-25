'use strict';
/* VR Player Web
   Fluxo: sensores -> quaternion única (cq) -> WebGL (MP4) ou CSS 3D (YouTube). */
const $=s=>$$(s)[0],$$=s=>document.querySelectorAll(s),T=THREE,rad=d=>d*Math.PI/180,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const CFG=[['sens','Sensibilidade',.3,2,.05],['smooth','Suavização',0,.9,.05],['ipd','IPD (mm)',50,75,1],['fov','Zoom / campo de visão (°)',50,110,1],
  ['size','Tamanho da tela',.5,2,.05],['dist','Distância da tela',3,15,.5],['vs','Ajuste vertical',-4,4,.25],['curve','Curvatura da tela',0,1,.05]];
let P={sens:1,smooth:.3,ipd:63,fov:80,size:1,dist:8,vs:0,curve:0,proj:'flat',st:'mono',pad:false};
try{Object.assign(P,JSON.parse(localStorage.vrp))}catch{}
const save=()=>{try{localStorage.vrp=JSON.stringify(P)}catch{}};
let mode='none',vr=false,ytp=[],mesh,tt,pz=300;
const vid=$('#v'),stage=$('#stage');
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,3500)}

/* ---------- Three.js ---------- */
const ren=new T.WebGLRenderer({canvas:$('#gl')}),sc=new T.Scene(),cam=new T.PerspectiveCamera(80,1,.1,200),tex=new T.VideoTexture(vid);
tex.minFilter=T.LinearFilter;tex.generateMipmaps=false;ren.setPixelRatio(Math.min(devicePixelRatio,1.5));
const mat=new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});
function build(){ // tela plana (com curvatura) ou esfera 180/360
  if(mesh){sc.remove(mesh);mesh.geometry.dispose()}
  let g;
  if(P.proj==='flat'){g=new T.PlaneGeometry(16,9,48,1);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,P.curve*p.getX(i)**2/16)}
  else{const h=P.proj==='180';g=new T.SphereGeometry(50,48,32,h?Math.PI:0,h?Math.PI:2*Math.PI);g.scale(-1,1,1)}
  mesh=new T.Mesh(g,mat);sc.add(mesh);place()}
function place(){if(!mesh)return;const f=P.proj==='flat';mesh.position.set(0,f?P.vs:0,f?-P.dist:0);mesh.scale.setScalar(f?P.size:1)}
function layout(){ // posiciona os planos CSS 3D (YouTube) com a mesma geometria da cena WebGL
  const H=innerHeight,u=H/10,W=16*P.size*u,s=(P.ipd-63)*1.5;pz=H/2/Math.tan(rad(P.fov)/2);
  $$('.eye').forEach((el,e)=>{el.style.perspective=pz+'px';const pl=el.querySelector('.plane');
    Object.assign(pl.style,{width:W+'px',height:W*9/16+'px',margin:`${-W*9/32}px 0 0 ${-W/2}px`,transform:`translate3d(${(e?1:-1)*s}px,${-P.vs*u}px,${pz-P.dist*u}px)`});
    const f=ytp[e]&&ytp[e].getIframe&&ytp[e].getIframe(); // recorte SBS / Over-Under no iframe
    if(f)Object.assign(f.style,{width:P.st==='sbs'?'200%':'100%',height:P.st==='ou'?'200%':'100%',marginLeft:e&&P.st==='sbs'?'-100%':'0',marginTop:e&&P.st==='ou'?'-100%':'0'})});
  place()}
function resize(){ren.setSize(innerWidth,innerHeight);layout()}
addEventListener('resize',resize);

/* ---------- Sensores e head tracking ---------- */
const cq=new T.Quaternion(),fq=new T.Quaternion(),qd=new T.Quaternion(),qr=new T.Quaternion(),tq=new T.Quaternion(),q2=new T.Quaternion(),qi=new T.Quaternion(),I=new T.Quaternion(),
  q1=new T.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2),eu=new T.Euler(),X=new T.Vector3(1,0,0),Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1),M=new T.Matrix4();
let S={},my=0,mp=0,tilt=0,yawOff=0,last=0,jx=0,jy=0,dk={};
// o = orientação relativa (giroscópio), ab = absoluta (acelerômetro+magnetômetro), g = gravidade
addEventListener('deviceorientation',e=>{if(e.alpha!=null)S.o=[e.alpha,e.beta,e.gamma]});
addEventListener('deviceorientationabsolute',e=>{if(e.alpha!=null)S.ab=[e.alpha,e.beta,e.gamma]});
addEventListener('devicemotion',e=>{const r=e.rotationRate,g=e.accelerationIncludingGravity;if(r&&r.alpha!=null)S.gyro=1;if(g&&g.x!=null)S.g=[g.x,g.y,g.z]});
const src=()=>S.o&&S.gyro?'o':S.ab?'ab':S.o?'o':S.g?'tilt':'manual';
const sAng=()=>screen.orientation?screen.orientation.angle:(window.orientation||0);
function euler2q(q,a,b,g,o){eu.set(rad(b),rad(a),-rad(g),'YXZ');q.setFromEuler(eu).multiply(q1).multiply(q2.setFromAxisAngle(Z,-rad(o)))}
function track(){ // calcula qd (orientação do aparelho) pela melhor fonte disponível
  const s=src();
  if(s==='o')euler2q(qd,...S.o,sAng());
  else if(s==='ab')euler2q(qd,...S.ab,sAng());
  else if(s==='tilt'){const[x,y,z]=S.g,n=Math.hypot(x,y,z)||1;tilt+=(Math.asin(clamp(-z/n,-1,1))-tilt)*.15;qd.setFromAxisAngle(X,tilt)} // só inclinação: NÃO há yaw
  else qd.identity();
  return s}
function recenter(){track();eu.setFromQuaternion(qd,'YXZ');yawOff=eu.y;my=0;mp=0}
async function askPerm(){ // iOS exige permissão por gesto do usuário; Android/Chrome não
  if(!isSecureContext)toast('Sensores exigem HTTPS (ou localhost).');
  const C=window.DeviceOrientationEvent;
  if(C&&C.requestPermission){try{if(await C.requestPermission()!=='granted')toast('Permissão negada: use os controles na tela.')}catch{toast('Não foi possível pedir permissão de sensores.')}}}

/* ---------- Loop de render ---------- */
function frame(t){
  requestAnimationFrame(frame);const dt=Math.min((t-last)/1000,.1);last=t;if(mode==='none')return;
  const s=track();
  my-=(jx+(dk.r||0)-(dk.l||0))*dt*1.6;mp=clamp(mp+(-jy+(dk.u||0)-(dk.d||0))*dt*1.2,-1.4,1.4);
  qr.setFromAxisAngle(Y,-yawOff);tq.copy(qr).multiply(qd);
  fq.copy(I).slerp(tq,P.sens);                      // sensibilidade
  fq.premultiply(q2.setFromAxisAngle(Y,my)).multiply(qi.setFromAxisAngle(X,mp)); // ajuste manual
  const sm=s==='ab'||s==='tilt'?Math.max(P.smooth,.6):P.smooth; // sem giroscópio o sinal é mais ruidoso
  cq.slerp(fq,Math.max(1-sm,.02));
  if(mode==='yt'){ // gira o "mundo" CSS no sentido oposto, com pivô no olho
    qi.copy(cq).invert();M.makeRotationFromQuaternion(qi);const e=M.elements;[1,4,6,9].forEach(i=>e[i]*=-1); // eixo Y do CSS é invertido
    const tr=`translateZ(${pz}px) matrix3d(${e.join()}) translateZ(${-pz}px)`;$$('.world').forEach(w=>w.style.transform=tr)}
  else if(vid.readyState>1){
    const W=innerWidth,H=innerHeight,n=vr?2:1,w=W/n,sh=(P.ipd-63)*1.5;ren.setScissorTest(true);
    for(let e=0;e<n;e++){
      cam.fov=P.fov;cam.aspect=w/H;cam.setViewOffset(w,H,(e?-1:1)*sh,0,w,H);cam.quaternion.copy(cq);
      cam.position.set((e?1:-1)*P.ipd/2000,0,0).applyQuaternion(cq); // separação das câmeras = IPD (metros)
      tex.repeat.set(P.st==='sbs'?.5:1,P.st==='ou'?.5:1);tex.offset.set(P.st==='sbs'&&e?.5:0,P.st==='ou'&&!e?.5:0); // recorte por olho
      ren.setViewport(e*w,0,w,H);ren.setScissor(e*w,0,w,H);ren.render(sc,cam)}}}

/* ---------- Vídeo local ---------- */
const fmt=s=>isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
vid.ontimeupdate=()=>{$('#seek').value=vid.duration?vid.currentTime/vid.duration*1000:0;$('#time').textContent=fmt(vid.currentTime)};
vid.onplay=vid.onpause=()=>$('#bplay').textContent=vid.paused?'▶':'⏸';
vid.onerror=()=>toast('Não foi possível reproduzir este arquivo (codec não suportado?).');
$('#seek').oninput=e=>{if(vid.duration)vid.currentTime=e.target.value/1000*vid.duration};
$('#vol').oninput=e=>vid.volume=+e.target.value;
$('#file').onchange=e=>{const f=e.target.files[0];if(!f)return;
  stopYT();vid.src=URL.createObjectURL(f);setMode('mp4');build();vid.play().catch(()=>toast('Toque em ▶ para iniciar'))};

/* ---------- YouTube (IFrame API oficial; dois players, um por olho) ---------- */
const ytErr={2:'Link ou ID inválido.',5:'Erro no player HTML5.',100:'Vídeo não encontrado ou privado.',101:'O dono do vídeo não permite incorporação.',150:'O dono do vídeo não permite incorporação.'};
const ytId=u=>(u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/)||u.match(/^([\w-]{11})$/)||[])[1];
const loadYT=()=>new Promise(r=>{if(window.YT&&YT.Player)return r();const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';window.onYouTubeIframeAPIReady=r;s.onerror=()=>toast('Falha ao carregar a API do YouTube (sem internet?).');document.head.append(s)});
function stopYT(){ytp.forEach(p=>{try{p.destroy()}catch{}});ytp=[]}
async function openYT(id){
  await loadYT();vid.pause();setMode('yt');stopYT();
  if(P.proj!=='flat'){P.proj='flat';$('#proj').value='flat';toast('YouTube só funciona em tela plana.')}
  $$('.plane').forEach((pl,e)=>{pl.innerHTML=`<div id="yp${e}"></div>`;
    ytp[e]=new YT.Player('yp'+e,{width:'100%',height:'100%',videoId:id,
      playerVars:{playsinline:1,rel:0,autoplay:1,controls:e?0:1,...(location.protocol.startsWith('http')?{origin:location.origin}:{})},
      events:{onReady:ev=>{layout();if(e)ev.target.mute()},onError:ev=>toast(ytErr[ev.data]||'Erro ao carregar o vídeo.')}})});
}
setInterval(()=>{const[a,b]=ytp;if(mode!=='yt'||!vr||!a||!b||!b.getCurrentTime)return; // mantém o olho direito em sincronia
  try{const st=a.getPlayerState(),sb=b.getPlayerState();if(st===1&&sb!==1)b.playVideo();if(st===2&&sb===1)b.pauseVideo();
    if(Math.abs(a.getCurrentTime()-b.getCurrentTime())>.4)b.seekTo(a.getCurrentTime(),true)}catch{}},1000);

/* ---------- Estados / VR ---------- */
function show(s){$('#home').hidden=s;stage.hidden=!s;if(s)resize()}
function setMode(m){mode=m;$('#gl').hidden=m!=='mp4';$('#css3d').hidden=m!=='yt';$('#ctl').hidden=m!=='mp4';show(true)}
async function enterVR(){
  if(mode==='none')return toast('Abra um vídeo primeiro.');
  await askPerm();vr=true;show(true);stage.classList.add('vr');
  try{await stage.requestFullscreen()}catch{}
  try{await screen.orientation.lock('landscape')}catch{}
  try{await navigator.wakeLock.request('screen')}catch{}
  resize();recenter();if(mode==='mp4')vid.play().catch(()=>{});
  toast('Coloque no headset. Toque = play/pause. Voltar do celular = sair.')}
function exitVR(){vr=false;stage.classList.remove('vr');if(document.fullscreenElement)document.exitFullscreen();resize()}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&vr)exitVR()});
stage.addEventListener('click',e=>{if(e.target.closest('button,input,#joy,#dp'))return;
  if(vr){if(mode==='mp4')vid.paused?vid.play():vid.pause()}else $('#hud').classList.toggle('hide')});

/* ---------- Ações dos botões ---------- */
const A={
  yt:()=>{$('#ytm').hidden=false;$('#yturl').focus()},ytx:()=>$('#ytm').hidden=true,
  ytgo:()=>{const id=ytId($('#yturl').value.trim());if(!id)return toast('Cole um link válido do YouTube.');$('#ytm').hidden=true;openYT(id)},
  file:()=>$('#file').click(),vr:enterVR,
  calib:async()=>{await askPerm();recenter();toast('Visão recentralizada. Olhe para a frente ao calibrar.')},
  cfg:()=>$('#cfg').hidden=!$('#cfg').hidden,
  home:()=>{exitVR();vid.pause();stopYT();setMode('none');show(false)},
  play:()=>vid.paused?vid.play():vid.pause(),back:()=>vid.currentTime-=10,fwd:()=>vid.currentTime+=10,
  fs:()=>document.fullscreenElement?document.exitFullscreen():stage.requestFullscreen().catch(()=>toast('Tela cheia indisponível.'))};
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b)A[b.dataset.act]()});
$('#yturl').onkeydown=e=>{if(e.key==='Enter')A.ytgo()};

/* ---------- Joystick e setas ---------- */
const joy=$('#joy'),kn=$('#knob');
function jm(e){const r=joy.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/(r.width/2),y=(e.clientY-r.top-r.height/2)/(r.height/2);const n=Math.hypot(x,y);if(n>1){x/=n;y/=n}jx=x;jy=y;kn.style.transform=`translate(${x*35}px,${y*35}px)`}
joy.onpointerdown=e=>{joy.setPointerCapture(e.pointerId);joy.onpointermove=jm;jm(e)};
joy.onpointerup=joy.onpointercancel=()=>{joy.onpointermove=null;jx=jy=0;kn.style.transform=''};
$$('#dp button').forEach(b=>{const d=b.dataset.d;b.onpointerdown=()=>dk[d]=1;b.onpointerup=b.onpointerleave=b.onpointercancel=()=>dk[d]=0});

/* ---------- Configurações ---------- */
CFG.forEach(([k,l,mn,mx,st])=>{$('#cfgbody').insertAdjacentHTML('beforeend',`<label>${l}: <output id="o_${k}">${P[k]}</output><input type="range" id="c_${k}" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"></label>`);
  $('#c_'+k).oninput=e=>{P[k]=+e.target.value;$('#o_'+k).textContent=P[k];save();if(k==='curve')build();layout()}});
$('#proj').value=P.proj;$('#st').value=P.st;$('#padck').checked=P.pad;
$('#proj').onchange=e=>{P.proj=e.target.value;if(P.proj!=='flat'&&mode==='yt')toast('180°/360° só valem para MP4.');save();build();layout()};
$('#st').onchange=e=>{P.st=e.target.value;save();layout()};
$('#padck').onchange=e=>{P.pad=e.target.checked;save()};
const MODOS={o:'Giroscópio + fusão do sistema (completo)',ab:'Acelerômetro + magnetômetro (fusão do sistema, mais instável)',tilt:'Somente inclinação (pitch). Giro horizontal só manual',manual:'Manual (joystick/setas)'};
setInterval(()=>{const s=src();$('#pad').hidden=!((P.pad||s==='manual'||s==='tilt')&&mode!=='none');
  if($('#cfg').hidden)return;const y=v=>v?'sim':'não';
  $('#sinfo').textContent=[`HTTPS/contexto seguro: ${y(isSecureContext)}`,`DeviceOrientation: ${y(S.o)}`,`Giroscópio (devicemotion): ${y(S.gyro)}`,`Acelerômetro: ${y(S.g)}`,
    `Orientação absoluta (magnetômetro): ${y(S.ab)}`,`WebXR no navegador: ${y(navigator.xr)} (não usado)`,`\nRastreamento ativo:\n${MODOS[s]}`].join('\n')},500);

build();resize();requestAnimationFrame(frame);
