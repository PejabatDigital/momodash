(function(){
'use strict';
const $ = id => document.getElementById(id);
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
};
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

if(!window.THREE){
  document.querySelector('#startPanel .lede').textContent = 'The 3D engine could not load. Check your internet connection and reload the page.';
  $('playBtn').disabled = true;
  return;
}

/* ---------- Constants ---------- */
const LANES = [-2.2, 0, 2.2];
const START_SPEED = 11, MAX_SPEED = 16;
const GRAV = 26, JUMP_V = 9.6;
const SPAWN_Z = -160;
const SEG = 12, NSEG = 16;
const DSPAN = 200;
const SWING_TIME = 4.5;
const BEST_KEY = 'momo-temple-best';
const LEVEL_KEY = 'momo-temple-level';
const MAX_LIVES = 5;
const LEVELS = {
  beginner:{ name:'Beginner', start:11, max:11, dMax:0.25 },
  normal:{ name:'Normal', start:START_SPEED, max:MAX_SPEED, dMax:1 }
};
const MUTE_KEY = 'momo-temple-muted';

/* ---------- Renderer / scene ---------- */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const scene = new THREE.Scene();
const HORIZON = 0xf4ddb0;
scene.background = new THREE.Color(HORIZON);
scene.fog = new THREE.Fog(HORIZON, 42, 115);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 420);

const hemi = new THREE.HemisphereLight(0xfff0d2, 0x6a7f45, 0.58);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6b8, 0.62);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
{ const sc = sun.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 25; sc.bottom = -25; sc.near = 1; sc.far = 75; }
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const SUN_OFF = new THREE.Vector3(-7, 18, 9);

/* ---------- Helpers ---------- */
const rnd = (a,b) => a + Math.random()*(b-a);
const pick = arr => arr[Math.random()*arr.length|0];
const gradTex = (() => {
  const d = new Uint8Array([105,105,105,255, 185,185,185,255, 255,255,255,255]);
  const tx = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  tx.minFilter = tx.magFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.needsUpdate = true;
  return tx;
})();
function toon(color, extra){ return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap:gradTex }, extra || {})); }
function canvasTex(w, h, draw, rx, ry){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1); t.anisotropy = MAX_ANISO;
  return t;
}
function rrect(g, x, y, w, h, r){
  g.beginPath(); g.moveTo(x+r, y); g.lineTo(x+w-r, y); g.quadraticCurveTo(x+w, y, x+w, y+r);
  g.lineTo(x+w, y+h-r); g.quadraticCurveTo(x+w, y+h, x+w-r, y+h); g.lineTo(x+r, y+h);
  g.quadraticCurveTo(x, y+h, x, y+h-r); g.lineTo(x, y+r); g.quadraticCurveTo(x, y, x+r, y); g.closePath();
}
function speckle(g, x, y, w, h, n){
  for(let i=0;i<n;i++){
    g.fillStyle = Math.random() < 0.5 ? 'rgba(90,60,25,' + rnd(0.06,0.16) + ')' : 'rgba(255,240,205,' + rnd(0.06,0.18) + ')';
    const s = rnd(1.5, 4.5); g.fillRect(x + Math.random()*w, y + Math.random()*h, s, s);
  }
}
function crack(g, x, y, w, h){
  g.strokeStyle = 'rgba(70,46,20,.55)'; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); let cx = x + rnd(0.2,0.8)*w, cy = y + rnd(0.1,0.4)*h; g.moveTo(cx, cy);
  for(let i=0;i<5;i++){ cx += rnd(-0.18,0.18)*w; cy += rnd(0.08,0.16)*h; g.lineTo(cx, cy); }
  g.stroke();
}
function mossBlob(g, x, y, r){
  for(let i=0;i<7;i++){
    g.fillStyle = pick(['#6f9a3f','#5d8a35','#82ab4a']);
    g.beginPath(); g.arc(x + rnd(-r,r), y + rnd(-r*0.5,r*0.5), rnd(r*0.35, r*0.8), 0, 6.283); g.fill();
  }
}
function carve(g, drawPath, lw){
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = lw; g.strokeStyle = 'rgba(255,238,200,.55)'; g.save(); g.translate(2, 2); drawPath(); g.stroke(); g.restore();
  g.lineWidth = lw; g.strokeStyle = 'rgba(92,62,28,.8)'; drawPath(); g.stroke();
}

/* ---------- Textures ---------- */
function tilesTexture(){
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#5a4630'; g.fillRect(0, 0, w, h);
    const cols = 3, rows = 4, tw = w/cols, th = h/rows, gap = 8;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const x = c*tw + gap/2, y = r*th + gap/2, ww = tw - gap, hh = th - gap;
      g.fillStyle = pick(['#dcb97f','#d4b074','#e0c089','#d0aa6e']);
      rrect(g, x, y, ww, hh, 12); g.fill();
      g.fillStyle = 'rgba(255,244,210,.28)'; rrect(g, x+4, y+4, ww-8, 10, 5); g.fill();
      g.fillStyle = 'rgba(95,62,26,.22)'; rrect(g, x+4, y+hh-14, ww-8, 10, 5); g.fill();
      speckle(g, x, y, ww, hh, 220);
      if(Math.random() < 0.45) crack(g, x, y, ww, hh);
      if(Math.random() < 0.12){
        const cx = x + ww/2, cy = y + hh/2;
        carve(g, () => { g.beginPath(); for(let a=0;a<14;a+=0.2){ const rr = 6 + a*3.2; const px = cx + Math.cos(a)*rr, py = cy + Math.sin(a)*rr; a === 0 ? g.moveTo(px, py) : g.lineTo(px, py); } }, 5);
      }
      if(Math.random() < 0.35) mossBlob(g, x + (Math.random()<0.5 ? 10 : ww-10), y + rnd(20, hh-20), 16);
    }
    for(let i=0;i<60;i++){
      const vertical = Math.random() < 0.5;
      const px = vertical ? Math.round(rnd(0,cols))*tw : rnd(0,w), py = vertical ? rnd(0,h) : Math.round(rnd(0,rows))*th;
      g.fillStyle = pick(['#6f9a3f','#5d8a35']); g.beginPath(); g.arc(px, py, rnd(3,7), 0, 6.283); g.fill();
    }
  });
}
const tileTextures = [tilesTexture(), tilesTexture()];
const brickTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6b5236'; g.fillRect(0, 0, w, h);
  const rows = 4, rh = h/rows;
  for(let r=0;r<rows;r++){
    const off = r%2 ? 64 : 0;
    for(let c=-1;c<3;c++){
      const x = c*128 + off + 3, y = r*rh + 3;
      g.fillStyle = pick(['#d6b47b','#ceaa70','#dbbd87']);
      rrect(g, x, y, 122, rh-6, 8); g.fill();
      g.fillStyle = 'rgba(255,244,210,.25)'; g.fillRect(x+4, y+3, 114, 5);
      speckle(g, x, y, 122, rh-6, 50);
    }
  }
  mossBlob(g, rnd(20,230), rnd(10,60), 14);
}, 1, 1);
const faceTex = canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#d7b47a'; g.fillRect(0, 0, w, h);
  speckle(g, 0, 0, w, h, 600);
  g.fillStyle = 'rgba(95,62,26,.25)'; g.fillRect(0, h-18, w, 18);
  carve(g, () => { g.beginPath(); rrect(g, 20, 30, w-40, h-70, 18); }, 8);
  const cx = w/2, cy = h*0.46;
  carve(g, () => {
    g.beginPath(); g.arc(cx, cy, 70, 0, 6.283);
    g.moveTo(cx-66, cy); g.arc(cx-86, cy, 20, 0, 6.283);
    g.moveTo(cx+106, cy); g.arc(cx+86, cy, 20, 0, 6.283);
  }, 7);
  carve(g, () => { g.beginPath(); g.ellipse(cx, cy+26, 44, 30, 0, 0, 6.283); }, 6);
  g.fillStyle = 'rgba(70,45,18,.85)';
  g.beginPath(); g.arc(cx-26, cy-14, 11, 0, 6.283); g.arc(cx+26, cy-14, 11, 0, 6.283); g.fill();
  carve(g, () => { g.beginPath(); g.arc(cx, cy+22, 20, 0.3, Math.PI-0.3); }, 5);
  carve(g, () => { g.beginPath(); for(let i=0;i<5;i++){ g.moveTo(40 + i*44, h-80); g.lineTo(60 + i*44, h-60); g.lineTo(40 + i*44, h-40); } }, 5);
  mossBlob(g, 40, 30, 18); mossBlob(g, w-50, 36, 14);
}, 1, 1);
const bandTex = canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#d2ae74'; g.fillRect(0, 0, w, h);
  speckle(g, 0, 0, w, h, 300);
  carve(g, () => { g.beginPath(); g.rect(10, 12, w-20, h-24); }, 6);
  for(let i=0;i<5;i++){
    const cx = 56 + i*100, cy = h/2;
    carve(g, () => { g.beginPath(); for(let a=0;a<12;a+=0.2){ const rr = 3 + a*2.6; const px = cx + Math.cos(a)*rr, py = cy + Math.sin(a)*rr; a === 0 ? g.moveTo(px, py) : g.lineTo(px, py); } }, 5);
  }
}, 1, 1);
const barkTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#7a5332'; g.fillRect(0, 0, w, h);
  for(let i=0;i<40;i++){
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(60,36,18,.55)' : 'rgba(160,112,70,.35)';
    g.lineWidth = rnd(2, 6); g.beginPath(); let x = rnd(0, w); g.moveTo(x, 0);
    for(let y=0;y<=h;y+=32){ x += rnd(-6, 6); g.lineTo(x, y); } g.stroke();
  }
}, 2, 1);
const ringTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#5c3a1f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e6c58d'; g.beginPath(); g.arc(w/2, h/2, 108, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(150,100,50,.7)'; g.lineWidth = 4;
  for(let r=18;r<104;r+=16){ g.beginPath(); g.arc(w/2 + rnd(-2,2), h/2 + rnd(-2,2), r, 0, 6.283); g.stroke(); }
  g.fillStyle = '#9b6a3a'; g.beginPath(); g.arc(w/2, h/2, 8, 0, 6.283); g.fill();
}, 1, 1);
const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#5f8f3a'; g.fillRect(0, 0, w, h);
  for(let i=0;i<120;i++){
    g.fillStyle = pick(['rgba(116,166,72,.5)','rgba(78,122,46,.5)','rgba(140,180,80,.35)']);
    g.beginPath(); g.arc(rnd(0,w), rnd(0,h), rnd(6, 22), 0, 6.283); g.fill();
  }
  g.strokeStyle = 'rgba(160,200,100,.35)'; g.lineWidth = 2;
  for(let i=0;i<260;i++){ const x = rnd(0,w), y = rnd(0,h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-3,3), y - rnd(5,11)); g.stroke(); }
}, 40, 70);
function spriteTex(draw){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  draw(c.getContext('2d')); return new THREE.CanvasTexture(c);
}
const dotTex = spriteTex(g => { const gr = g.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.35,'rgba(255,255,255,.6)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0,0,64,64); });
const sparkTex = spriteTex(g => {
  g.fillStyle = '#fff'; g.beginPath();
  for(let i=0;i<8;i++){ const a = i*Math.PI/4, r = i%2 ? 7 : 31; g.lineTo(32 + Math.cos(a)*r, 32 + Math.sin(a)*r); }
  g.closePath(); g.fill();
  const gr = g.createRadialGradient(32,32,0,32,32,14); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0,0,64,64);
});
const dustTex = spriteTex(g => {
  for(let i=0;i<5;i++){ const gr = g.createRadialGradient(20+i*6,28+(i%2)*8,0,20+i*6,28+(i%2)*8,18); gr.addColorStop(0,'rgba(255,255,255,.9)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0,0,64,64); }
});
const leafTex = spriteTex(g => {
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(4,32); g.quadraticCurveTo(32,2,60,32); g.quadraticCurveTo(32,62,4,32); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(6,32); g.lineTo(58,32); g.stroke();
});
const shaftTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  const gx = g.createLinearGradient(0,0,64,0); gx.addColorStop(0,'rgba(255,255,255,0)'); gx.addColorStop(0.5,'rgba(255,255,255,1)'); gx.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = gx; g.fillRect(0,0,64,256);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0,0,0,256); gy.addColorStop(0,'rgba(0,0,0,.9)'); gy.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0,0,64,256);
  return new THREE.CanvasTexture(c);
})();

/* ---------- Materials ---------- */
const mat = {
  decor:toon(0xffffff, { vertexColors:true }),
  stoneSide:toon(0xb8935c),
  tiles:tileTextures.map(tx => toon(0xffffff, { map:tx })),
  brick:toon(0xffffff, { map:brickTex }),
  face:toon(0xffffff, { map:faceTex }),
  band:toon(0xffffff, { map:bandTex }),
  bark:toon(0xffffff, { map:barkTex }),
  ring:toon(0xffffff, { map:ringTex }),
  moss:toon(0x6f9a3f), mossDark:toon(0x4f7f32), vine:toon(0x3f7a2e), leaf:toon(0x3e8a3c),
  fur:toon(0x86532d), furDark:toon(0x5c3520), skin:toon(0xf0cf9f), eye:toon(0x1b1410),
  white:new THREE.MeshBasicMaterial({ color:0xffffff }), sclera:toon(0xfffdf5),
  scarf:toon(0xe0452f), banana:toon(0xf7c928, { emissive:0x3a2800 }), bananaTip:toon(0x5c3520),
  red:toon(0xe0452f), grey:toon(0xdfe5e7), mushroom:toon(0xe0452f), stem:toon(0xf3e6c8),
  gem:toon(0x4fd6c6, { emissive:0x1b6a62 })
};
const outlineMat = new THREE.MeshBasicMaterial({ color:0x2b1a0c, side:THREE.BackSide });
const outlineCache = {};
function extrudeOutlineMat(th){
  if(outlineCache[th]) return outlineCache[th];
  const m = new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { oColor:{ value:new THREE.Color(0x2b1a0c) }, thick:{ value:th } }]),
    vertexShader:[
      '#include <fog_pars_vertex>',
      'uniform float thick;',
      'void main(){',
      '  vec4 mvPosition = modelViewMatrix * vec4(position + normal * thick, 1.0);',
      '  gl_Position = projectionMatrix * mvPosition;',
      '  #include <fog_vertex>',
      '}'
    ].join('\n'),
    fragmentShader:[
      'uniform vec3 oColor;',
      '#include <fog_pars_fragment>',
      'void main(){',
      '  gl_FragColor = vec4(oColor, 1.0);',
      '  #include <fog_fragment>',
      '}'
    ].join('\n'),
    side:THREE.BackSide, fog:true
  });
  outlineCache[th] = m; return m;
}
const _bs = new THREE.Vector3();
function outlineBox(mesh, t){
  const g = mesh.geometry; if(!g.boundingBox) g.computeBoundingBox();
  g.boundingBox.getSize(_bs);
  const o = new THREE.Mesh(g, outlineMat);
  o.scale.set((_bs.x + 2*t)/_bs.x, (_bs.y + 2*t)/_bs.y, (_bs.z + 2*t)/_bs.z);
  mesh.add(o); return o;
}
function outlineSmooth(mesh, t){ const o = new THREE.Mesh(mesh.geometry, extrudeOutlineMat(t)); mesh.add(o); return o; }

/* ---------- Baked (single-mesh) scenery ---------- */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(),
      _n = new THREE.Vector3(), _sv = new THREE.Vector3(), _pv = new THREE.Vector3(), _m3 = new THREE.Matrix3(), _c = new THREE.Color();
class Baker {
  constructor(){ this.parts = []; }
  add(geo, color, px, py, pz, rx, ry, rz, sx, sy, sz){
    this.parts.push({ geo, color, px:px||0, py:py||0, pz:pz||0, rx:rx||0, ry:ry||0, rz:rz||0,
      sx:sx===undefined?1:sx, sy:sy===undefined?1:sy, sz:sz===undefined?1:sz });
    return this;
  }
  build(){
    let vc = 0, ic = 0;
    for(const p of this.parts){ vc += p.geo.attributes.position.count; ic += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; }
    const pos = new Float32Array(vc*3), nor = new Float32Array(vc*3), col = new Float32Array(vc*3);
    const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0;
    for(const p of this.parts){
      _e.set(p.rx, p.ry, p.rz); _q.setFromEuler(_e); _pv.set(p.px, p.py, p.pz); _sv.set(p.sx, p.sy, p.sz);
      _m4.compose(_pv, _q, _sv); _m3.getNormalMatrix(_m4);
      _c.set(p.color); const j = 1 + rnd(-0.07, 0.07);
      const pa = p.geo.attributes.position, na = p.geo.attributes.normal;
      for(let i=0;i<pa.count;i++){
        _v.fromBufferAttribute(pa, i).applyMatrix4(_m4);
        pos[(vo+i)*3] = _v.x; pos[(vo+i)*3+1] = _v.y; pos[(vo+i)*3+2] = _v.z;
        _n.fromBufferAttribute(na, i).applyMatrix3(_m3).normalize();
        nor[(vo+i)*3] = _n.x; nor[(vo+i)*3+1] = _n.y; nor[(vo+i)*3+2] = _n.z;
        col[(vo+i)*3] = Math.min(1, _c.r*j); col[(vo+i)*3+1] = Math.min(1, _c.g*j); col[(vo+i)*3+2] = Math.min(1, _c.b*j);
      }
      if(p.geo.index){ const ia = p.geo.index.array; for(let k=0;k<ia.length;k++) idx[io+k] = ia[k] + vo; io += ia.length; }
      else { for(let k=0;k<pa.count;k++) idx[io+k] = vo + k; io += pa.count; }
      vo += pa.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }
  mesh(cast){ const m = new THREE.Mesh(this.build(), mat.decor); m.castShadow = !!cast; return m; }
}
const B = {
  box:new THREE.BoxGeometry(1,1,1),
  sph:new THREE.SphereGeometry(1,12,9),
  ico:new THREE.IcosahedronGeometry(1,1),
  cyl:new THREE.CylinderGeometry(1,1,1,8),
  cylT:new THREE.CylinderGeometry(0.75,1,1,8),
  cone:new THREE.ConeGeometry(1,1,6),
  cone4:new THREE.ConeGeometry(1,1,4)
};
const C = { stone:0xd6b47b, stoneDark:0xa98552, stoneDeep:0x7d6340, moss:0x6f9a3f, mossDark:0x4f7f32,
  leaf:0x3e8a3c, leaf2:0x5aa843, leaf3:0x2f6f35, bark:0x6f4a2b, bark2:0x8a6038, flower1:0xf06d8f, flower2:0xf7a33a, yellow:0xffe07a };

/* ---------- Sky & distance ---------- */
const skyMat = new THREE.ShaderMaterial({
  uniforms:{ top:{ value:new THREE.Color(0x4fb3d6) }, horizon:{ value:new THREE.Color(HORIZON) }, glow:{ value:new THREE.Color(0xfff0c0) },
    sunDir:{ value:new THREE.Vector3(-0.35, 0.16, -1).normalize() } },
  vertexShader:'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:[
    'uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir; varying vec3 vDir;',
    'void main(){',
    '  float h = clamp(vDir.y, 0.0, 1.0);',
    '  vec3 col = mix(horizon, top, pow(h, 0.5));',
    '  float s = max(dot(normalize(vDir), sunDir), 0.0);',
    '  col += glow * (pow(s, 6.0) * 0.35 + pow(s, 90.0) * 0.9);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n'),
  side:THREE.BackSide, depthWrite:false, fog:false
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), skyMat);
sky.renderOrder = -10; scene.add(sky);
function ridgeTex(color, draw){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = color; draw(g); const t = new THREE.CanvasTexture(c); return t;
}
const far = new THREE.Group(); scene.add(far);
function addRidge(tex, z, w, h, y){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false, fog:false }));
  m.position.set(0, y, z); m.renderOrder = -5; far.add(m);
}
addRidge(ridgeTex('#d6c99c', g => {
  g.beginPath(); g.moveTo(0,256);
  for(let x=0;x<=1024;x+=16){ g.lineTo(x, 150 - Math.sin(x*0.006)*55 - Math.sin(x*0.017+1)*25); }
  g.lineTo(1024,256); g.fill();
  const bx = 360, by = 150; for(let i=0;i<6;i++){ const w = 96 - i*14; g.fillRect(bx - w/2, by - (i+1)*10, w, 10.5); }
  g.fillRect(bx-6, by-74, 12, 15);
}), -290, 900, 225, 36);
addRidge(ridgeTex('#a9b67f', g => {
  g.beginPath(); g.moveTo(0,256);
  for(let x=0;x<=1024;x+=8){ g.lineTo(x, 175 - Math.abs(Math.sin(x*0.03))*28 - Math.sin(x*0.008)*22); }
  g.lineTo(1024,256); g.fill();
}), -260, 800, 200, 64);
addRidge(ridgeTex('#86a162', g => {
  g.beginPath(); g.moveTo(0,256);
  for(let x=0;x<=1024;x+=6){ g.lineTo(x, 222 - Math.abs(Math.sin(x*0.05+2))*22 - Math.sin(x*0.013)*10); }
  g.lineTo(1024,256); g.fill();
}), -230, 700, 175, 75);

/* ---------- Ground & track ---------- */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 460), toon(0xffffff, { map:grassTex }));
ground.rotation.x = -Math.PI/2; ground.position.set(0, -0.45, -170); ground.receiveShadow = true;
scene.add(ground);
const tileGeo = new THREE.BoxGeometry(6.6, 0.24, SEG);
const segs = [];
function buildSegSide(){
  const b = new Baker();
  b.add(B.box, C.stoneDeep, 0, -0.37, 0, 0,0,0, 7.4, 0.5, SEG);
  for(const s of [-1,1]){
    for(let k=0;k<4;k++){
      const z = -SEG/2 + 1.5 + k*3, hgt = rnd(0.55, 0.8);
      b.add(B.box, pick([C.stone, C.stoneDark]), s*3.62, -0.3 + hgt/2, z, 0, rnd(-0.04,0.04), 0, 0.72, hgt, 2.9);
      b.add(B.box, C.stone, s*3.62, -0.3 + hgt + 0.05, z, 0, 0, 0, 0.8, 0.1, 2.94);
      if(Math.random() < 0.45) b.add(B.sph, pick([C.moss, C.mossDark]), s*3.62 + rnd(-0.2,0.2), -0.3 + hgt + 0.1, z + rnd(-1,1), 0,0,0, rnd(0.3,0.5), 0.18, rnd(0.5,0.9));
    }
  }
  const m = b.mesh(false); m.receiveShadow = true; return m;
}
for(let i=0;i<NSEG;i++){
  const g = new THREE.Group();
  const tiles = new THREE.Mesh(tileGeo, [mat.stoneSide, mat.stoneSide, mat.tiles[i%2], mat.stoneSide, mat.stoneSide, mat.stoneSide]);
  tiles.position.y = -0.12; tiles.receiveShadow = true; g.add(tiles);
  g.add(buildSegSide());
  g.position.z = 6 - i*SEG;
  scene.add(g); segs.push(g);
}

/* ---------- Scenery pieces ---------- */
function makeJungleTree(){
  const b = new Baker(), h = rnd(4.5, 6.5);
  b.add(B.cylT, C.bark, 0, h/2, 0, 0,0,0, 0.35, h, 0.35);
  for(let i=0;i<4;i++){ const a = i*1.57 + rnd(-0.3,0.3); b.add(B.cone, C.bark, Math.cos(a)*0.35, 0.3, Math.sin(a)*0.35, Math.sin(a)*0.5, 0, -Math.cos(a)*0.5, 0.18, 0.9, 0.18); }
  const n = 5 + (Math.random()*3|0);
  for(let i=0;i<n;i++){
    const r = rnd(1.1, 1.8);
    b.add(B.ico, pick([C.leaf, C.leaf2, C.leaf3]), rnd(-1.4,1.4), h + rnd(-0.3, 1.4), rnd(-1.2,1.2), 0,0,0, r, r*0.8, r);
  }
  for(let i=0;i<3;i++){ const len = rnd(1.5, 3); b.add(B.cyl, C.leaf3, rnd(-1.5,1.5), h - 0.4 - len/2, rnd(-1,1), 0,0,0, 0.04, len, 0.04); }
  const m = b.mesh(true); m.scale.setScalar(rnd(0.9, 1.35)); m.userData.kind = 'tree'; return m;
}
function makePalm(){
  const b = new Baker(), segsN = 8, bend = rnd(0.5, 1.4) * (Math.random()<0.5?-1:1);
  let x = 0, y = 0;
  for(let i=0;i<segsN;i++){
    const t = i/segsN, nx = bend*t*t*1.8, ny = y + 0.72;
    b.add(B.cylT, i%2 ? C.bark : C.bark2, (x+nx)/2, (y+ny)/2, 0, 0, 0, -(nx-x)*1.2, 0.2 - t*0.05, 0.78, 0.2 - t*0.05);
    x = nx; y = ny;
  }
  for(let i=0;i<7;i++){
    const a = i*0.9 + rnd(-0.2,0.2);
    b.add(B.sph, pick([C.leaf, C.leaf2]), x + Math.cos(a)*1.1, y - 0.25, Math.sin(a)*1.1, 0, -a, -0.45, 1.45, 0.08, 0.32);
  }
  for(let i=0;i<3;i++) b.add(B.sph, 0x6b4423, x + rnd(-0.2,0.2), y - 0.3, rnd(-0.2,0.2), 0,0,0, 0.17,0.17,0.17);
  const m = b.mesh(true); m.scale.setScalar(rnd(0.9, 1.3)); m.userData.kind = 'palm'; return m;
}
function makeBush(){
  const b = new Baker();
  const n = 5 + (Math.random()*3|0);
  for(let i=0;i<n;i++){
    const a = i*(6.283/n) + rnd(-0.2,0.2);
    b.add(B.sph, pick([C.leaf, C.leaf2, C.leaf3]), Math.cos(a)*0.5, 0.45, Math.sin(a)*0.5, 0, -a, 0.6, 0.85, 0.1, 0.42);
  }
  b.add(B.sph, C.leaf3, 0, 0.25, 0, 0,0,0, 0.45, 0.35, 0.45);
  if(Math.random() < 0.7){
    const fc = pick([C.flower1, C.flower2]);
    for(let i=0;i<3;i++){ const fx = rnd(-0.6,0.6), fz = rnd(-0.6,0.6); b.add(B.sph, fc, fx, 0.75, fz, 0,0,0, 0.14,0.1,0.14); b.add(B.sph, C.yellow, fx, 0.8, fz, 0,0,0, 0.05,0.05,0.05); }
  }
  const m = b.mesh(false); m.scale.setScalar(rnd(0.9, 1.6)); m.userData.kind = 'bush'; return m;
}
function makeFern(){
  const b = new Baker();
  for(let i=0;i<6;i++){ const a = i*1.05 + rnd(-0.2,0.2); b.add(B.cone4, pick([C.leaf2, C.leaf]), Math.cos(a)*0.45, 0.5, Math.sin(a)*0.45, 0, -a, -1.0, 0.18, 1.3, 0.06); }
  const m = b.mesh(false); m.scale.setScalar(rnd(0.8, 1.3)); m.userData.kind = 'fern'; return m;
}
function makeGrass(){
  const b = new Baker();
  for(let i=0;i<9;i++) b.add(B.cone4, pick([C.leaf2, C.moss, C.leaf]), rnd(-0.8,0.8), 0.25, rnd(-0.8,0.8), rnd(-0.2,0.2), rnd(0,3), rnd(-0.2,0.2), 0.07, rnd(0.4,0.7), 0.07);
  const m = b.mesh(false); m.userData.kind = 'grass'; m.userData.extra = true; return m;
}
function makePillar(){
  const b = new Baker(), h = rnd(2, 4.5);
  b.add(B.cyl, C.stone, 0, h/2, 0, 0,0,0, 0.62, h, 0.62);
  for(let y=0.5;y<h;y+=0.9) b.add(B.cyl, C.stoneDark, 0, y, 0, 0,0,0, 0.66, 0.08, 0.66);
  b.add(B.box, C.stone, 0, h + 0.15, 0, 0, rnd(0,1), rnd(-0.1,0.1), 1.5, 0.35, 1.5);
  b.add(B.sph, C.moss, rnd(-0.3,0.3), h + 0.35, 0, 0,0,0, 0.7, 0.18, 0.6);
  for(let i=0;i<2;i++){ const len = rnd(1, h*0.7); b.add(B.cyl, C.leaf3, rnd(-0.55,0.55), h - len/2, 0.62, 0,0,0, 0.04, len, 0.04); }
  const m = b.mesh(true); m.userData.kind = 'pillar'; return m;
}
function makeWall(){
  const b = new Baker();
  for(let k=0;k<3;k++){
    const hh = rnd(0.9, 2.3), z = -1.4 + k*1.4;
    b.add(B.box, pick([C.stone, C.stoneDark]), 0, hh/2, z, 0,0,0, 0.9, hh, 1.35);
    b.add(B.box, C.stone, 0, hh + 0.06, z, 0,0,0, 1.0, 0.12, 1.4);
    if(Math.random() < 0.5) b.add(B.sph, C.moss, 0, hh + 0.12, z, 0,0,0, 0.45, 0.15, 0.6);
    if(Math.random() < 0.4) b.add(B.box, C.stoneDeep, 0, hh*0.55, z, 0,0,0, 0.95, 0.3, 0.3);
  }
  const m = b.mesh(true); m.userData.kind = 'wall'; return m;
}
function makeStatue(){
  const b = new Baker();
  b.add(B.box, C.stoneDark, 0, 0.5, 0, 0,0,0, 2.2, 1, 2.0);
  b.add(B.box, C.stone, 0, 1.9, 0, 0,0,0, 1.9, 1.8, 1.7);
  for(const s of [-1,1]){
    b.add(B.sph, C.stone, s*1.1, 2.1, 0, 0,0,0, 0.45, 0.45, 0.25);
    b.add(B.box, C.stoneDeep, s*0.42, 2.25, 0.86, 0,0,0, 0.38, 0.26, 0.05);
  }
  b.add(B.box, C.stone, 0, 2.5, 0.8, 0,0,0, 1.5, 0.18, 0.2);
  b.add(B.box, C.stone, 0, 1.75, 0.95, 0,0,0, 0.35, 0.5, 0.35);
  b.add(B.box, C.stoneDeep, 0, 1.3, 0.86, 0,0,0, 0.9, 0.18, 0.05);
  b.add(B.sph, C.moss, 0, 2.85, 0, 0,0,0, 1.1, 0.25, 0.95);
  b.add(B.sph, C.mossDark, 0.5, 2.9, -0.3, 0,0,0, 0.5, 0.2, 0.5);
  const m = b.mesh(true); m.scale.setScalar(rnd(1.1, 1.4)); m.userData.kind = 'statue'; return m;
}
function makeGate(){
  const b = new Baker();
  for(const s of [-1,1]){
    b.add(B.box, C.stone, s*4.7, 3.5, 0, 0,0,0, 1.1, 7, 1.1);
    for(let y=1;y<7;y+=1.5) b.add(B.box, C.stoneDark, s*4.7, y, 0, 0,0,0, 1.18, 0.12, 1.18);
    for(let i=0;i<4;i++){ const len = rnd(1.2, 2.8); b.add(B.cyl, C.leaf3, s*rnd(3.4, 4.8), 6.75 - len/2, -0.72, 0,0,0, 0.05, len, 0.05); b.add(B.sph, C.leaf2, s*rnd(3.4,4.8), 6.75 - len, -0.72, 0,0,0, 0.12,0.12,0.12); }
  }
  b.add(B.box, C.stoneDark, 0, 7.3, 0, 0,0,0, 10.6, 1.1, 1.4);
  for(let i=-4;i<=4;i++) b.add(B.box, C.stoneDeep, i*1.1, 7.3, 0.71, 0,0,0, 0.5, 0.5, 0.05);
  b.add(B.box, C.stone, 0, 8.05, 0, 0,0,0, 11.4, 0.4, 1.7);
  b.add(B.sph, C.moss, -2, 8.3, 0, 0,0,0, 2.5, 0.25, 0.8);
  b.add(B.sph, C.mossDark, 3, 8.3, 0, 0,0,0, 1.8, 0.22, 0.7);
  const m = b.mesh(true); m.userData.kind = 'gate'; m.userData.gate = true; return m;
}
const flames = [];
const flameMat = new THREE.MeshBasicMaterial({ color:0xffa02b });
const flameCore = new THREE.MeshBasicMaterial({ color:0xfff0a0 });
const glowMatProto = new THREE.SpriteMaterial({ map:dotTex, color:0xffb347, transparent:true, opacity:0.55, blending:THREE.AdditiveBlending, depthWrite:false });
function makeTorch(){
  const g = new THREE.Group();
  const b = new Baker();
  b.add(B.box, C.stoneDark, 0, 0.8, 0, 0,0,0, 0.4, 1.6, 0.4);
  b.add(B.cylT, C.stone, 0, 1.75, 0, Math.PI, 0, 0, 0.35, 0.35, 0.35);
  b.add(B.sph, C.moss, 0.1, 0.1, 0.1, 0,0,0, 0.35, 0.15, 0.35);
  g.add(b.mesh(false));
  const f = new THREE.Mesh(B.cone, flameMat); f.scale.set(0.2, 0.55, 0.2); f.position.y = 2.15; g.add(f);
  const core = new THREE.Mesh(B.cone, flameCore); core.scale.set(0.1, 0.3, 0.1); core.position.y = 2.05; g.add(core);
  const glow = new THREE.Sprite(glowMatProto); glow.scale.set(1.8, 1.8, 1); glow.position.y = 2.1; g.add(glow);
  flames.push({ f, core, glow, ph:Math.random()*6 });
  g.userData.kind = 'torch'; return g;
}
const shaftMat = new THREE.MeshBasicMaterial({ map:shaftTex, color:0xfff0c4, transparent:true, opacity:0.2, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false });
const shaftGeo = new THREE.PlaneGeometry(2.6, 22);
function makeShaft(){
  const m = new THREE.Mesh(shaftGeo, shaftMat);
  m.rotation.set(0, rnd(-0.4, 0.4), rnd(0.25, 0.45)); m.userData.kind = 'shaft'; m.userData.extra = true; return m;
}
const XR = { tree:[7.5,16], palm:[6,14], bush:[4.6,9], fern:[4.4,7], grass:[4.2,8], pillar:[5.4,10], wall:[4.9,5.4], statue:[6,7.5], torch:[4.35,4.5], shaft:[3,8] };
function sideX(kind){ const r = XR[kind] || [5,12]; return (Math.random()<0.5 ? -1 : 1) * rnd(r[0], r[1]); }
const decor = [];
function placeDecor(d, z){
  const k = d.userData.kind;
  if(d.userData.gate){ d.position.set(0, 0, z); return; }
  const x = sideX(k);
  const y = k === 'shaft' ? 9 : -0.45;
  d.position.set(x, y, z);
  if(k === 'statue') d.rotation.y = x > 0 ? -0.7 : 0.7;
  else if(k === 'wall' || k === 'torch') d.rotation.y = 0;
  else if(k !== 'shaft') d.rotation.y = Math.random()*6.283;
}
function addDecor(d, z){ placeDecor(d, z); scene.add(d); decor.push(d); }
const DECOR_SET = [[makeJungleTree,14],[makePalm,12],[makeBush,18],[makeFern,10],[makeGrass,20],[makePillar,6],[makeWall,8],[makeStatue,3],[makeTorch,6],[makeShaft,6]];
for(const [fn, n] of DECOR_SET) for(let i=0;i<n;i++) addDecor(fn(), 14 - Math.random()*DSPAN);
addDecor(makeGate(), -70);
addDecor(makeGate(), -170);

/* ---------- Ambient particles ---------- */
const POLLEN = 150;
const pollenGeo = new THREE.BufferGeometry();
const pollenPos = new Float32Array(POLLEN*3), pollenPh = new Float32Array(POLLEN);
for(let i=0;i<POLLEN;i++){ pollenPos[i*3] = rnd(-10,10); pollenPos[i*3+1] = rnd(0.3,7); pollenPos[i*3+2] = rnd(-70,8); pollenPh[i] = Math.random()*6.28; }
pollenGeo.setAttribute('position', new THREE.BufferAttribute(pollenPos, 3));
const pollen = new THREE.Points(pollenGeo, new THREE.PointsMaterial({ size:0.17, map:dotTex, color:0xfff1a8, transparent:true, opacity:0.85, depthWrite:false, blending:THREE.AdditiveBlending }));
pollen.frustumCulled = false; scene.add(pollen);
const leaves = [];
const leafGeo = new THREE.PlaneGeometry(0.34, 0.34);
const leafMats = [0x5aa843, 0x8cbf4a, 0xd9a13a].map(c => new THREE.MeshBasicMaterial({ map:leafTex, color:c, alphaTest:0.5, side:THREE.DoubleSide }));
for(let i=0;i<14;i++){
  const m = new THREE.Mesh(leafGeo, pick(leafMats));
  m.position.set(rnd(-8,8), rnd(1,9), rnd(-60,6)); m.userData.v = rnd(0.5,1.1); m.userData.ph = Math.random()*6.28;
  m.userData.extra = true; scene.add(m); leaves.push(m);
}

/* ---------- Momo ---------- */
function buildMonkey(){
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const S = new THREE.SphereGeometry(1, 20, 14);
  const sph = (r, m, x, y, z, sx, sy, sz, ol) => {
    const o = new THREE.Mesh(S, m); o.scale.set(r*(sx||1), r*(sy||1), r*(sz||1)); o.position.set(x||0, y||0, z||0);
    o.castShadow = true; if(ol) outlineSmooth(o, Math.round(ol/r*1000)/1000); return o;
  };
  body.add(sph(0.42, mat.fur, 0, 0.98, 0, 1, 1.1, 0.92, 0.03));
  body.add(sph(0.3, mat.skin, 0, 0.94, -0.25, 1, 1.15, 0.55));
  const head = new THREE.Group(); head.position.y = 1.72; body.add(head);
  head.add(sph(0.44, mat.fur, 0, 0, 0, 1, 0.96, 1, 0.03));
  for(let i=-1;i<=1;i++){ const tf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 6), mat.furDark); tf.position.set(i*0.09, 0.46, 0.04); tf.rotation.set(0.35, 0, -i*0.4); head.add(tf); }
  for(const s of [-1,1]) head.add(sph(0.2, mat.skin, s*0.13, 0.06, -0.3, 1, 1.15, 0.6));
  head.add(sph(0.25, mat.skin, 0, -0.13, -0.33, 1.3, 0.85, 0.8, 0.02));
  const eyes = [], pupils = [], lids = [], xs = [];
  for(const s of [-1,1]){
    const e = sph(0.1, mat.sclera, s*0.14, 0.08, -0.41, 1, 1.2, 0.6); e.castShadow = false; head.add(e); eyes.push(e);
    const pu = new THREE.Group(); pu.position.set(s*0.14, 0.07, -0.465); head.add(pu); pupils.push(pu);
    const pm = sph(0.055, mat.eye); pm.castShadow = false; pu.add(pm);
    const sh = new THREE.Mesh(S, mat.white); sh.scale.setScalar(0.02); sh.position.set(0.02, 0.025, -0.04); pu.add(sh);
    const lid = sph(0.108, mat.fur, s*0.14, 0.08, -0.405, 1, 1.25, 0.62); lid.castShadow = false; lid.scale.y = 0.001; lid.visible = false; head.add(lid); lids.push(lid);
    const xg = new THREE.Group(); xg.position.set(s*0.14, 0.08, -0.47); xg.visible = false; head.add(xg); xs.push(xg);
    for(const r of [0.8, -0.8]){ const bar = new THREE.Mesh(B.box, mat.eye); bar.scale.set(0.16, 0.035, 0.02); bar.rotation.z = r; xg.add(bar); }
    head.add(sph(0.018, mat.eye, s*0.05, -0.08, -0.52));
    const ear = sph(0.17, mat.fur, s*0.46, 0.04, 0, 1, 1, 0.45, 0.022); head.add(ear);
    head.add(sph(0.11, mat.skin, s*0.48, 0.04, -0.05, 1, 1, 0.4));
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 6, 12, Math.PI), mat.eye);
  smile.position.set(0, -0.15, -0.53); smile.rotation.z = Math.PI; head.add(smile);
  const oMouth = sph(0.055, mat.eye, 0, -0.17, -0.53, 1, 1.2, 0.5); oMouth.visible = false; oMouth.castShadow = false; head.add(oMouth);
  const scarf = new THREE.Group(); scarf.position.set(0, 1.36, 0); body.add(scarf);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.075, 8, 20), mat.scarf); band.rotation.x = Math.PI/2; band.castShadow = true; scarf.add(band);
  outlineSmooth(band, 0.03);
  const knot = sph(0.09, mat.scarf, 0, 0, 0.3); scarf.add(knot);
  const tails = [];
  for(const s of [-1,1]){
    const tp = new THREE.Group(); tp.position.set(s*0.05, 0, 0.32); scarf.add(tp);
    const tm = new THREE.Mesh(B.box, mat.scarf); tm.scale.set(0.13, 0.03, 0.5); tm.position.z = 0.25; tm.castShadow = true; tp.add(tm);
    outlineBox(tm, 0.02); tails.push(tp);
  }
  const arms = [], legs = [];
  const armGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.6, 10);
  const legGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.48, 10);
  for(const s of [-1,1]){
    const a = new THREE.Group(); a.position.set(s*0.43, 1.24, 0);
    const am = new THREE.Mesh(armGeo, mat.fur); am.position.y = -0.3; am.castShadow = true; a.add(am); outlineBox(am, 0.035);
    a.add(sph(0.12, mat.skin, 0, -0.64, 0, 1, 1, 1, 0.02));
    body.add(a); arms.push(a);
    const l = new THREE.Group(); l.position.set(s*0.2, 0.6, 0);
    const lm = new THREE.Mesh(legGeo, mat.fur); lm.position.y = -0.24; lm.castShadow = true; l.add(lm); outlineBox(lm, 0.035);
    l.add(sph(0.15, mat.skin, 0, -0.52, -0.08, 1, 0.55, 1.45, 0.02));
    body.add(l); legs.push(l);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.78, 0.35); body.add(tail);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0), new THREE.Vector3(0,-0.12,0.4), new THREE.Vector3(0,0.12,0.78),
    new THREE.Vector3(0,0.6,0.8), new THREE.Vector3(0,0.78,0.5), new THREE.Vector3(0,0.62,0.3)
  ]);
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.06, 8, false), mat.fur); tailMesh.castShadow = true; tail.add(tailMesh);
  outlineSmooth(tailMesh, 0.03);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16), new THREE.ShaderMaterial({
    uniforms:{ c:{ value:new THREE.Color(0x7ff0e0) } },
    vertexShader:'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader:'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(c * (f * 1.1 + 0.06), 1.0); }',
    transparent:true, blending:THREE.AdditiveBlending, depthWrite:false
  }));
  bubble.position.y = 1.0; bubble.visible = false; root.add(bubble);
  return { root, body, head, arms, legs, tail, bubble, eyes, pupils, lids, xs, smile, oMouth, scarf, tails };
}
const monkey = buildMonkey();
scene.add(monkey.root);
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.28, depthWrite:false }));
blob.rotation.x = -Math.PI/2; blob.position.y = 0.02; scene.add(blob);
const vine = new THREE.Group();
{ const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 16, 6), mat.vine); rope.position.y = 8; vine.add(rope); outlineBox(rope, 0.025);
  for(let i=0;i<6;i++){ const lf = new THREE.Mesh(B.sph, mat.leaf); lf.scale.set(0.22, 0.05, 0.12); lf.position.set(i%2 ? 0.16 : -0.16, 1.2 + i*2.2, 0); lf.rotation.z = i%2 ? -0.5 : 0.5; vine.add(lf); } }
vine.visible = false; scene.add(vine);

/* ---------- Effects ---------- */
const fx = [];
for(let i=0;i<80;i++){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:sparkTex, transparent:true, depthWrite:false }));
  s.visible = false; scene.add(s);
  fx.push({ s, life:0, max:1, vx:0, vy:0, vz:0, g:0, s0:1, s1:1, op:1 });
}
let fxIdx = 0;
function spawnFx(tex, add, color, x, y, z, vx, vy, vz, life, s0, s1, grav, op){
  const f = fx[fxIdx]; fxIdx = (fxIdx + 1) % fx.length;
  const m = f.s.material; m.map = tex; m.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending; m.color.setHex(color);
  f.s.position.set(x, y, z); f.s.visible = true;
  Object.assign(f, { life, max:life, vx, vy, vz, g:grav || 0, s0, s1, op:op === undefined ? 1 : op });
}
function burstSparkle(x, y, z, color, n){
  for(let i=0;i<n;i++){
    const a = Math.random()*6.283, e = rnd(-0.6, 1.2), sp = rnd(2.5, 5);
    spawnFx(sparkTex, true, Math.random()<0.4 ? 0xffffff : color, x, y, z, Math.cos(a)*sp, e*sp, Math.sin(a)*sp*0.6, rnd(0.3,0.5), rnd(0.35,0.55), 0.05, 4);
  }
}
function puffDust(x, z, n, big){
  for(let i=0;i<n;i++){
    spawnFx(dustTex, false, 0xeedcb4, x + rnd(-0.3,0.3), 0.15, z + rnd(-0.2,0.3), rnd(-1.4,1.4), rnd(0.4,1.2), rnd(0.2,1.2), rnd(0.35,0.6), big ? 0.5 : 0.3, big ? 1.4 : 0.8, 0, 0.75);
  }
}
function starsAround(x, y, z){
  for(let i=0;i<9;i++){ const a = i*0.7; spawnFx(sparkTex, true, i%2 ? 0xfff3a0 : 0xffffff, x + Math.cos(a)*0.5, y + rnd(-0.1,0.3), z + Math.sin(a)*0.5, Math.cos(a)*2, rnd(1,2.5), Math.sin(a)*1.5, 0.7, 0.45, 0.1, 2); }
}
const debris = [];
for(let i=0;i<16;i++){
  const m = new THREE.Mesh(B.box, toon(pick([C.stone, C.stoneDark]))); m.visible = false; m.castShadow = true; scene.add(m);
  debris.push({ m, life:0, vx:0, vy:0, vz:0, rx:0, rz:0 });
}
function smashDebris(x, z){
  for(let i=0;i<12;i++){
    const d = debris[i % debris.length], s = rnd(0.2, 0.45);
    d.m.visible = true; d.m.scale.setScalar(s); d.m.position.set(x + rnd(-0.8,0.8), rnd(0.3,2.2), z);
    Object.assign(d, { life:1.3, vx:rnd(-4,4), vy:rnd(3,8), vz:rnd(-2,4), rx:rnd(-8,8), rz:rnd(-8,8), s });
  }
}
const lineMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
const lines = [];
{ const lg = new THREE.BoxGeometry(0.035, 0.035, 4.5);
  for(let i=0;i<20;i++){ const m = new THREE.Mesh(lg, lineMat); const a = rnd(0, 6.283);
    m.position.set(Math.cos(a)*rnd(2.8,6.5), 2.4 + Math.sin(a)*rnd(1.5,3.5), rnd(-40,6)); m.visible = false; scene.add(m); lines.push(m); } }

/* ---------- Obstacles & items ---------- */
const OG = {
  log:new THREE.CylinderGeometry(0.42, 0.42, 2.0, 14),
  mushCap:new THREE.SphereGeometry(0.15, 12, 8, 0, 6.283, 0, Math.PI/2),
  mushStem:new THREE.CylinderGeometry(0.05, 0.06, 0.16, 8),
  beam:new THREE.BoxGeometry(2.3, 0.56, 0.7),
  post:new THREE.BoxGeometry(0.3, 1.9, 0.36),
  block:new THREE.BoxGeometry(1.95, 2.6, 1.3),
  cap:new THREE.BoxGeometry(2.05, 0.2, 1.4)
};
const obstacles = [], items = [];
function addObstacle(type, lane, z){
  const g = new THREE.Group();
  let hit;
  if(type === 'log'){
    const l = new THREE.Mesh(OG.log, [mat.bark, mat.ring, mat.ring]); l.rotation.z = Math.PI/2; l.position.y = 0.42; l.castShadow = true; g.add(l);
    outlineBox(l, 0.05);
    for(let i=0;i<2;i++){
      const x = rnd(-0.6, 0.6);
      const st = new THREE.Mesh(OG.mushStem, mat.stem); st.position.set(x, 0.88, rnd(-0.1,0.1)); g.add(st);
      const cp = new THREE.Mesh(OG.mushCap, mat.mushroom); cp.position.set(x, 0.94, st.position.z); cp.scale.setScalar(rnd(0.8,1.2)); g.add(cp);
    }
    const m = new THREE.Mesh(B.sph, mat.moss); m.scale.set(0.5, 0.12, 0.35); m.position.set(0.35, 0.82, 0); g.add(m);
    hit = { y0:0, y1:0.84, d:0.84 };
  } else if(type === 'beam'){
    const b = new THREE.Mesh(OG.beam, [mat.brick, mat.brick, mat.brick, mat.brick, mat.band, mat.brick]); b.position.y = 1.62; b.castShadow = true; g.add(b);
    outlineBox(b, 0.05);
    for(const s of [-1,1]){ const p = new THREE.Mesh(OG.post, mat.brick); p.position.set(s*1.02, 0.95, 0); p.castShadow = true; g.add(p); outlineBox(p, 0.04); }
    const m = new THREE.Mesh(B.sph, mat.moss); m.scale.set(1.1, 0.14, 0.4); m.position.y = 1.92; g.add(m);
    for(let i=0;i<3;i++){
      const len = rnd(0.2, 0.35), vx = rnd(-0.8, 0.8);
      const v = new THREE.Mesh(B.cyl, mat.vine); v.scale.set(0.035, len, 0.035); v.position.set(vx, 1.34 - len/2, 0.3); g.add(v);
      const lf = new THREE.Mesh(B.sph, mat.leaf); lf.scale.set(0.09, 0.06, 0.04); lf.position.set(vx, 1.34 - len, 0.3); g.add(lf);
    }
    hit = { y0:1.3, y1:1.9, d:0.7 };
  } else {
    const b = new THREE.Mesh(OG.block, [mat.brick, mat.brick, mat.brick, mat.brick, mat.face, mat.brick]); b.position.y = 1.3; b.castShadow = true; g.add(b);
    outlineBox(b, 0.05);
    const c = new THREE.Mesh(OG.cap, mat.moss); c.position.y = 2.68; g.add(c); outlineBox(c, 0.03);
    for(let i=0;i<5;i++){ const gr = new THREE.Mesh(B.cone4, mat.leaf); gr.scale.set(0.06, rnd(0.25,0.45), 0.06); gr.position.set(rnd(-0.85,0.85), 2.9, rnd(-0.5,0.5)); g.add(gr); }
    hit = { y0:0, y1:2.6, d:1.3 };
  }
  g.position.set(LANES[lane], 0, z);
  scene.add(g);
  obstacles.push(Object.assign({ mesh:g, type, x:LANES[lane], z }, hit));
}
const IG = {
  banana:new THREE.TorusGeometry(0.27, 0.09, 8, 16, Math.PI*1.1),
  tip:new THREE.CylinderGeometry(0.035, 0.05, 0.12, 6),
  magnet:new THREE.TorusGeometry(0.3, 0.11, 10, 18, Math.PI),
  magnetTip:new THREE.BoxGeometry(0.22, 0.2, 0.22),
  gem:new THREE.IcosahedronGeometry(0.34, 0),
  ring:new THREE.TorusGeometry(0.55, 0.03, 6, 28)
};
const ringMat = new THREE.MeshBasicMaterial({ color:0xfff1a8, transparent:true, opacity:0.75 });
function addItem(kind, lane, z, y){
  const mesh = new THREE.Group();
  if(kind === 'banana'){
    const b = new THREE.Mesh(IG.banana, mat.banana); b.rotation.z = -0.9; mesh.add(b); outlineSmooth(b, 0.03);
    const tip = new THREE.Mesh(IG.tip, mat.bananaTip); tip.position.set(0.22, 0.19, 0); tip.rotation.z = -0.5; mesh.add(tip);
  } else if(kind === 'magnet'){
    const u = new THREE.Mesh(IG.magnet, mat.red); mesh.add(u); outlineSmooth(u, 0.03);
    for(const s of [-1,1]){ const tp = new THREE.Mesh(IG.magnetTip, mat.grey); tp.position.set(s*0.3, -0.08, 0); mesh.add(tp); outlineBox(tp, 0.025); }
    mesh.add(new THREE.Mesh(IG.ring, ringMat));
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map:dotTex, color:0xff7a5c, transparent:true, opacity:0.6, blending:THREE.AdditiveBlending, depthWrite:false }));
    gl.scale.set(1.8, 1.8, 1); mesh.add(gl);
  } else {
    const gm = new THREE.Mesh(IG.gem, mat.gem); mesh.add(gm); outlineBox(gm, 0.03);
    mesh.add(new THREE.Mesh(IG.ring, ringMat));
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map:dotTex, color:0x7ff0e0, transparent:true, opacity:0.65, blending:THREE.AdditiveBlending, depthWrite:false }));
    gl.scale.set(1.9, 1.9, 1); mesh.add(gl);
  }
  mesh.position.set(LANES[lane], y, z);
  scene.add(mesh);
  items.push({ mesh, kind, x:LANES[lane], y, z, phase:Math.random()*6.28, pulled:false });
}

/* ---------- Scenery motion ---------- */
function sceneryMove(dz){
  ground.material.map.offset.y += dz * 70/460;
  for(let i=0;i<POLLEN;i++){ const k = i*3+2; pollenPos[k] += dz*0.6; if(pollenPos[k] > 8){ pollenPos[k] -= 78; pollenPos[k-2] = rnd(-10,10); } }
  for(const l of leaves) l.position.z += dz*0.8;
  for(const f of fx) if(f.life > 0) f.s.position.z += dz;
  for(const d of debris) if(d.life > 0) d.m.position.z += dz;
  for(const m of lines){ m.position.z += dz*1.7; if(m.position.z > 8) m.position.z -= 48; }
}
function updateScenery(dt){
  sky.position.copy(camera.position);
  far.position.set(camera.position.x, 0, camera.position.z);
  sun.target.position.set(p.x*0.5, 0, -12);
  sun.position.copy(sun.target.position).add(SUN_OFF);
  for(let i=0;i<POLLEN;i++){ pollenPos[i*3] += Math.sin(t*0.7 + pollenPh[i])*dt*0.3; pollenPos[i*3+1] += Math.cos(t*0.9 + pollenPh[i])*dt*0.2; }
  pollenGeo.attributes.position.needsUpdate = true;
  for(const l of leaves){
    const u = l.userData;
    l.position.y -= u.v*dt; l.position.x += Math.sin(t*1.3 + u.ph)*dt*0.8;
    l.rotation.set(t*1.7 + u.ph, t*1.1 + u.ph, Math.sin(t*2 + u.ph));
    if(l.position.y < 0 || l.position.z > 8){ l.position.set(rnd(-8,8), rnd(7,10), rnd(-60,-10)); }
  }
  for(const f of flames){
    const k = 1 + Math.sin(t*14 + f.ph)*0.12 + Math.sin(t*23 + f.ph*2)*0.08;
    f.f.scale.set(0.2*k, 0.55*(2-k), 0.2*k); f.core.scale.set(0.1, 0.3*k, 0.1);
    f.glow.material.opacity = 0.45 + (k-1)*1.2;
  }
  for(const f of fx){
    if(f.life <= 0) continue;
    f.life -= dt;
    if(f.life <= 0){ f.s.visible = false; continue; }
    const tt = 1 - f.life/f.max;
    f.vy -= f.g*dt;
    f.s.position.x += f.vx*dt; f.s.position.y += f.vy*dt; f.s.position.z += f.vz*dt;
    const sc = f.s0 + (f.s1 - f.s0)*tt; f.s.scale.set(sc, sc, 1);
    f.s.material.opacity = f.op*(1 - tt*tt);
  }
  for(const d of debris){
    if(d.life <= 0) continue;
    d.life -= dt; d.vy -= 18*dt;
    d.m.position.x += d.vx*dt; d.m.position.y += d.vy*dt; d.m.position.z += d.vz*dt;
    if(d.m.position.y < d.s/2){ d.m.position.y = d.s/2; d.vy *= -0.35; d.vx *= 0.7; }
    d.m.rotation.x += d.rx*dt; d.m.rotation.z += d.rz*dt;
    if(d.life < 0.3) d.m.scale.setScalar(Math.max(0.001, d.s*d.life/0.3));
    if(d.life <= 0) d.m.visible = false;
  }
  const lineTarget = state === 'play' ? Math.min(1, Math.max(0, (speed - 24)/12))*0.45 + (swingT > 0 ? 0.5 : 0) : 0;
  lineMat.opacity += (lineTarget - lineMat.opacity)*Math.min(1, dt*4);
  const showLines = lineMat.opacity > 0.01 && quality > 0;
  for(const m of lines) m.visible = showLines;
}
function sceneryReset(){
  for(const f of fx){ f.life = 0; f.s.visible = false; }
  for(const d of debris){ d.life = 0; d.m.visible = false; }
}

/* ---------- Quality ---------- */
const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
let quality = coarse ? 1 : 2;
function applyQuality(){
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(quality === 2 ? Math.min(dpr, 2) : quality === 1 ? Math.min(dpr, 1.5) : 1);
  sun.castShadow = quality > 0;
  blob.visible = quality === 0;
  pollen.visible = quality > 0;
  for(const d of decor) if(d.userData.extra) d.visible = quality > 0;
  for(const l of leaves) l.visible = quality > 0;
}

/* ---------- Game state ---------- */
const p = { lane:1, x:0, y:0, vy:0, slideT:0, queuedSlide:false };
let state = 'menu';
let t = 0, elapsed = 0, distance = 0, bananas = 0, meter = 0;
let baseSpeed = START_SPEED, speed = START_SPEED;
let swingT = 0, magnetT = 0, invulnT = 0, shield = false;
let lastPowerAt = 0, lastRowZ = 0, nextGap = 20, dieT = 0, shake = 0, runPhase = 0;
let crashType = 'log';
let levelKey = store.get(LEVEL_KEY) === 'beginner' ? 'beginner' : 'normal';
let lives = MAX_LIVES;
const bests = {
  beginner: parseInt(store.get(BEST_KEY + '-beginner') || '0', 10) || 0,
  normal: parseInt(store.get(BEST_KEY + '-normal') || store.get(BEST_KEY) || '0', 10) || 0
};

let points = 0, combo = 0, mult = 1, maxCombo = 0;
let readyT = 0, readySeq = [], readyTotal = 0, countShown = '', pausedFrom = 'play';
function score(){ return Math.floor(points); }
function multFor(c){ return c >= 30 ? 4 : c >= 20 ? 3 : c >= 10 ? 2 : 1; }
function addCombo(){
  combo++;
  if(combo > maxCombo) maxCombo = combo;
  const m = multFor(combo);
  if(m > mult){
    mult = m; sfx.multUp();
    const f = $('multFlash'); f.textContent = 'x' + m + '!';
    f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
  }
}
function breakCombo(){
  if(combo >= 5) sfx.comboBreak();
  combo = 0; mult = 1;
}
function showCount(text, cls){
  const c = $('countdown');
  c.hidden = false; c.textContent = text;
  c.className = 'count' + (text.length > 3 ? ' small' : '');
  void c.offsetWidth; c.classList.add(cls);
}
function hideCount(){ $('countdown').hidden = true; countShown = ''; }
function beginReady(fresh){
  readySeq = fresh ? [['Get ready!',1.1],['3',0.7],['2',0.7],['1',0.7]] : [['3',0.7],['2',0.7],['1',0.7]];
  readyTotal = readySeq.reduce((a,x) => a + x[1], 0);
  readyT = 0; countShown = '';
  Object.assign(p, { y:0, vy:0, slideT:0, queuedSlide:false });
  state = 'ready';
}
function difficulty(){ return Math.min(LEVELS[levelKey].dMax, elapsed/100); }
function gapFor(){
  const minGap = Math.max(15, baseSpeed*0.95);
  return minGap + Math.random()*minGap*0.6;
}
function pickType(d){
  const r = Math.random();
  if(r < 0.4) return 'log';
  if(r < 0.68 + 0.05*d) return 'beam';
  return 'block';
}
function generateRow(z0, prevZ){
  const d = difficulty();
  const lanes = [null,null,null];
  const pObs = 0.42 + 0.33*d;
  for(let i=0;i<3;i++) if(Math.random() < pObs) lanes[i] = pickType(d);
  if(lanes.every(v => v===null)) lanes[Math.random()*3|0] = pickType(d);
  if(lanes.every(v => v==='block')) lanes[Math.random()*3|0] = Math.random()<0.5 ? 'log' : 'beam';
  if(d < 0.35 && !lanes.includes(null)) lanes[Math.random()*3|0] = null;
  lanes.forEach((type,i) => { if(type) addObstacle(type, i, z0); });

  const cand = [0,1,2].filter(i => lanes[i] !== 'block');
  const lane = cand[Math.random()*cand.length|0];
  const trail = [];
  for(let z = prevZ - 5; z > z0 + 4 && trail.length < 9; z -= 2.3) trail.push(z);
  let powerIdx = -1;
  if(elapsed - lastPowerAt > 18 && trail.length >= 3 && Math.random() < 0.35){
    powerIdx = trail.length/2|0; lastPowerAt = elapsed;
  }
  trail.forEach((z,i) => {
    if(i === powerIdx) addItem((shield || Math.random()<0.5) ? 'magnet' : 'shield', lane, z, 1.0);
    else addItem('banana', lane, z, 0.9);
  });
  if(lanes[lane] === 'log'){
    addItem('banana', lane, z0+2.3, 1.9); addItem('banana', lane, z0, 2.5); addItem('banana', lane, z0-2.3, 1.9);
  } else if(lanes[lane] === 'beam'){
    addItem('banana', lane, z0, 0.55);
  } else {
    addItem('banana', lane, z0, 0.9);
  }
}
function reset(){
  for(const o of obstacles) scene.remove(o.mesh); obstacles.length = 0;
  for(const it of items) scene.remove(it.mesh); items.length = 0;
  Object.assign(p, { lane:1, x:0, y:0, vy:0, slideT:0, queuedSlide:false });
  elapsed = 0; distance = 0; bananas = 0; meter = 0;
  swingT = 0; magnetT = 0; invulnT = 0; shield = false; lastPowerAt = 0;
  baseSpeed = LEVELS[levelKey].start; speed = baseSpeed; dieT = 0; shake = 0;
  lives = MAX_LIVES; renderLives();
  points = 0; combo = 0; mult = 1; maxCombo = 0;
  monkey.body.rotation.set(0,0,0); monkey.body.position.set(0,0,0); monkey.root.visible = true;
  sceneryReset(); hurtFaceT = 0; squash = 1;
  let z = -40, prev = -6;
  while(z > SPAWN_Z){ generateRow(z, prev); prev = z; z -= gapFor(); }
  lastRowZ = prev; nextGap = gapFor();
}

/* ---------- Sound ---------- */
let actx = null;
let muted = store.get(MUTE_KEY) === '1';
function ensureAudio(){
  if(!actx){ try{ actx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ actx = null; } }
  if(actx && actx.state === 'suspended') actx.resume();
}
function tone(f1, f2, dur, type, vol, delay){
  if(muted || !actx) return;
  const t0 = actx.currentTime + (delay || 0);
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f1, t0);
  o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(vol || 0.05, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const sfx = {
  banana(){ tone(988,1480,0.07,'triangle',0.05); },
  jump(){ tone(260,560,0.14,'square',0.035); },
  slide(){ tone(420,160,0.16,'sawtooth',0.03); },
  lane(){ tone(520,380,0.05,'triangle',0.025); },
  power(){ tone(523,784,0.1,'square',0.04); tone(784,1175,0.14,'square',0.04,0.1); },
  swing(){ [523,659,784,1047].forEach((f,i) => tone(f,f*1.01,0.12,'triangle',0.05,i*0.07)); },
  shield(){ tone(1200,300,0.25,'triangle',0.06); },
  crash(){ tone(220,55,0.45,'sawtooth',0.09); tone(140,40,0.5,'square',0.05,0.05); },
  hurt(){ tone(330,110,0.25,'sawtooth',0.07); },
  tick(){ tone(660,660,0.12,'square',0.045); },
  go(){ tone(990,1320,0.25,'square',0.05); },
  multUp(){ [784,988,1319].forEach((f,i) => tone(f,f,0.09,'square',0.045,i*0.06)); },
  comboBreak(){ tone(392,196,0.2,'triangle',0.05); }
};
/* ---------- Actions ---------- */
function moveLeft(){ if(state==='play' && p.lane>0){ p.lane--; sfx.lane(); } }
function moveRight(){ if(state==='play' && p.lane<2){ p.lane++; sfx.lane(); } }
function jump(){
  if(state!=='play' || swingT>0) return;
  if(p.y <= 0.02){ p.vy = JUMP_V; p.slideT = 0; p.queuedSlide = false; sfx.jump(); onJump(); }
}
function slide(){
  if(state!=='play' || swingT>0) return;
  if(p.y > 0.05){ p.vy = -22; p.queuedSlide = true; }
  else { p.slideT = 0.7; sfx.slide(); }
}
function swing(){
  if(state!=='play' || meter < 1 || swingT > 0) return;
  meter = 0; swingT = SWING_TIME; p.slideT = 0; p.queuedSlide = false; sfx.swing();
  burstSparkle(p.x, 1.6, 0, 0x8fd16a, 16);
}
function startGame(key){
  ensureAudio();
  if(state !== 'menu' && state !== 'over' && state !== 'paused') return;
  if(entry) return;
  $('boardPanel').hidden = true;
  if(key === 'beginner' || key === 'normal'){ levelKey = key; store.set(LEVEL_KEY, key); }
  reset();
  beginReady(true);
  $('startPanel').hidden = true; $('overPanel').hidden = true; $('pausePanel').hidden = true; $('hud').hidden = false;
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function pause(){
  if(state !== 'play' && state !== 'ready') return;
  pausedFrom = state;
  state = 'paused'; $('pausePanel').hidden = false; $('resumeBtn').focus();
}
function resume(){
  if(state !== 'paused') return;
  state = pausedFrom; $('pausePanel').hidden = true;
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
  last = performance.now();
}
function showMenu(){
  state = 'menu';
  hideCount();
  reset();
  $('overPanel').hidden = true; $('pausePanel').hidden = true; $('hud').hidden = true; $('startPanel').hidden = false;
  $('playBtn').focus();
}
function hurt(o){
  lives--; renderLives();
  if(lives <= 0){ die(o); return; }
  invulnT = 1.6; sfx.hurt();
  shake = reduceMotion ? 0 : 0.25;
  scene.remove(o.mesh); obstacles.splice(obstacles.indexOf(o), 1);
  const h = $('hurt'); h.classList.remove('show'); void h.offsetWidth; h.classList.add('show');
  starsAround(p.x, p.y + 2.1, 0); hurtFaceT = 1.8;
  breakCombo();
  beginReady(false);
}
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="#E5533D" stroke="#FFF6DC" stroke-width="1.6"/></svg>';
function renderLives(){
  const el = $('lives');
  if(el.children.length !== MAX_LIVES) el.innerHTML = HEART.repeat(MAX_LIVES);
  for(let i=0;i<MAX_LIVES;i++) el.children[i].classList.toggle('lost', i >= lives);
  el.setAttribute('aria-label', lives + ' of ' + MAX_LIVES + ' lives left');
}
function die(o){
  starsAround(p.x, p.y + 2.1, 0);
  state = 'dying'; dieT = 0; crashType = o.type;
  shake = reduceMotion ? 0 : 0.45;
  sfx.crash();
}
/* ---------- Leaderboard ---------- */
const SCORES_KEY = 'momo-temple-scores-';
const NAME_KEY = 'momo-temple-name';
const BOARD_SIZE = 6;
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function cleanName(n){ return String(n || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }
function loadBoard(k){
  try{
    const a = JSON.parse(store.get(SCORES_KEY + k) || '[]');
    if(!Array.isArray(a)) return [];
    return a.filter(e => e && typeof e.s === 'number' && typeof e.n === 'string')
            .map(e => ({ n:cleanName(e.n) || '????', s:Math.floor(e.s), t:e.t || 0 }))
            .sort((x,y) => y.s - x.s || x.t - y.t).slice(0, BOARD_SIZE);
  }catch(e){ return []; }
}
function qualifies(k, sc){
  if(sc <= 0) return false;
  const a = loadBoard(k);
  return a.length < BOARD_SIZE || sc > a[a.length-1].s;
}
const GLOBAL_BOARD_SIZE = 10;
function renderBoardList(elId, a, size, highlightT){
  let html = '';
  for(let i=0;i<size;i++){
    const e = a[i];
    if(e) html += '<li' + (highlightT && e.t === highlightT ? ' class="me"' : '') + '><span class="rank">' + (i+1) +
      '</span><span class="nm">' + e.n + '</span><span class="sc">' + e.s.toLocaleString() + '</span></li>';
    else html += '<li class="empty"><span class="rank">' + (i+1) + '</span><span class="nm">----</span><span class="sc">0</span></li>';
  }
  $(elId).innerHTML = html;
}
function renderBoard(elId, k, highlightT){ renderBoardList(elId, loadBoard(k), BOARD_SIZE, highlightT); }
let globalReqId = 0;
function fetchGlobalBoard(level){
  const reqId = ++globalReqId;
  $('boardNote').hidden = true;
  renderBoardList('menuBoard', [], GLOBAL_BOARD_SIZE);
  fetch('/api/leaderboard?level=' + level)
    .then(r => { if(!r.ok) throw new Error('bad response'); return r.json(); })
    .then(data => {
      if(reqId !== globalReqId) return;
      const a = (data.entries || []).map(e => ({ n:cleanName(e.n) || '????', s:Math.floor(e.s), t:e.t }));
      renderBoardList('menuBoard', a, GLOBAL_BOARD_SIZE);
    })
    .catch(() => {
      if(reqId !== globalReqId) return;
      $('boardNote').textContent = "Couldn't load global scores. Check your connection.";
      $('boardNote').hidden = false;
    });
}
function submitGlobalScore(level, name, score){
  fetch('/api/scores', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ level, name, score })
  }).catch(() => {});
}
const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let entry = null;
function buildSlots(){
  let html = '';
  for(let i=0;i<4;i++){
    html += '<div class="slot" id="slot' + i + '">' +
      '<button class="arrow" id="up' + i + '" aria-label="Letter ' + (i+1) + ' next">' + UP + '</button>' +
      '<button class="letter" id="let' + i + '" aria-label="Letter ' + (i+1) + '">A</button>' +
      '<button class="arrow" id="down' + i + '" aria-label="Letter ' + (i+1) + ' previous">' + DOWN + '</button></div>';
  }
  $('slots').innerHTML = html;
  for(let i=0;i<4;i++){
    $('up' + i).addEventListener('click', () => { bump(i, 1); });
    $('down' + i).addEventListener('click', () => { bump(i, -1); });
    $('let' + i).addEventListener('click', () => { if(entry){ entry.active = i; renderEntry(); } });
  }
}
function bump(i, dir){
  if(!entry) return;
  const c = CHARS.indexOf(entry.letters[i]);
  entry.letters[i] = CHARS[(c + dir + CHARS.length) % CHARS.length];
  entry.active = i; renderEntry(); sfx.lane();
}
function renderEntry(){
  for(let i=0;i<4;i++){
    $('let' + i).textContent = entry.letters[i];
    $('slot' + i).classList.toggle('active', i === entry.active);
  }
}
function openEntry(sc){
  const saved = (cleanName(store.get(NAME_KEY)) || 'MOMO').padEnd(4, 'A');
  entry = { letters:saved.split(''), active:0, score:sc };
  renderEntry();
  $('nameEntry').hidden = false; $('overBoardWrap').hidden = true;
  $('let0').focus();
}
function saveEntry(){
  if(!entry) return;
  const name = entry.letters.join('');
  store.set(NAME_KEY, name);
  const stamp = Date.now();
  const a = loadBoard(levelKey);
  a.push({ n:name, s:entry.score, t:stamp });
  a.sort((x,y) => y.s - x.s || x.t - y.t);
  store.set(SCORES_KEY + levelKey, JSON.stringify(a.slice(0, BOARD_SIZE)));
  submitGlobalScore(levelKey, name, entry.score);
  entry = null;
  sfx.power();
  showOverBoard(stamp);
}
function showOverBoard(highlightT){
  $('nameEntry').hidden = true; $('overBoardWrap').hidden = false;
  $('overBoardTitle').textContent = 'High scores: ' + LEVELS[levelKey].name;
  renderBoard('overBoard', levelKey, highlightT);
  $('againBtn').focus();
}
function handleEntryKey(e){
  const k = e.key;
  if(/^[a-zA-Z0-9]$/.test(k)){
    entry.letters[entry.active] = k.toUpperCase();
    entry.active = Math.min(3, entry.active + 1);
  } else if(k === 'Backspace' || k === 'ArrowLeft'){ entry.active = Math.max(0, entry.active - 1); }
  else if(k === 'ArrowRight'){ entry.active = Math.min(3, entry.active + 1); }
  else if(k === 'ArrowUp'){ bump(entry.active, 1); }
  else if(k === 'ArrowDown'){ bump(entry.active, -1); }
  else if(k === 'Enter'){ e.preventDefault(); saveEntry(); return; }
  else return;
  e.preventDefault();
  renderEntry();
  const f = $('let' + entry.active); if(f && f.focus) f.focus();
}
let boardTab = 'normal';
let boardScope = 'local';
function openScores(){
  boardTab = levelKey;
  boardScope = 'local';
  renderScopeToggle();
  renderScoresTab();
  $('startPanel').hidden = true; $('boardPanel').hidden = false;
  $('closeBoardBtn').focus();
}
function renderScopeToggle(){
  $('scopeLocal').setAttribute('aria-pressed', boardScope === 'local' ? 'true' : 'false');
  $('scopeGlobal').setAttribute('aria-pressed', boardScope === 'global' ? 'true' : 'false');
}
function renderScoresTab(){
  $('tabBeginner').setAttribute('aria-pressed', boardTab === 'beginner' ? 'true' : 'false');
  $('tabNormal').setAttribute('aria-pressed', boardTab === 'normal' ? 'true' : 'false');
  $('boardNote').hidden = true;
  if(boardScope === 'global') fetchGlobalBoard(boardTab);
  else renderBoard('menuBoard', boardTab);
}
function closeScores(){
  $('boardPanel').hidden = true; $('startPanel').hidden = false;
  $('scoresBtn').focus();
}
function openHowTo(){
  $('startPanel').hidden = true; $('howToPanel').hidden = false;
  $('closeHowToBtn').focus();
}
function closeHowTo(){
  $('howToPanel').hidden = true; $('startPanel').hidden = false;
  $('howToBtn').focus();
}
let settingsFrom = 'start';
function renderSoundToggle(){
  $('soundToggleBtn').setAttribute('aria-pressed', muted ? 'false' : 'true');
  $('soundToggleLabel').textContent = muted ? 'Off' : 'On';
}
function renderPaceToggle(){
  $('paceBeginner').setAttribute('aria-pressed', levelKey === 'beginner' ? 'true' : 'false');
  $('paceNormal').setAttribute('aria-pressed', levelKey === 'normal' ? 'true' : 'false');
}
function setPace(key){
  levelKey = key; store.set(LEVEL_KEY, key);
  renderPaceToggle();
}
function openSettings(from){
  settingsFrom = from;
  $(from === 'pause' ? 'pausePanel' : 'startPanel').hidden = true;
  renderSoundToggle(); renderPaceToggle();
  $('settingsPanel').hidden = false;
  $('closeSettingsBtn').focus();
}
function closeSettings(){
  $('settingsPanel').hidden = true;
  $(settingsFrom === 'pause' ? 'pausePanel' : 'startPanel').hidden = false;
  $(settingsFrom === 'pause' ? 'pauseSettingsBtn' : 'settingsBtn').focus();
}

function showOver(){
  state = 'over';
  const s = score();
  const isBest = s > bests[levelKey];
  if(isBest){ bests[levelKey] = s; store.set(BEST_KEY + '-' + levelKey, String(s)); }
  const best = bests[levelKey];
  $('overTitle').textContent = 'Out of lives!';
  $('finalLabel').textContent = 'points on ' + LEVELS[levelKey].name;
  $('finalScore').textContent = s.toLocaleString();
  $('finalBananas').textContent = bananas.toLocaleString();
  $('finalDist').textContent = Math.floor(distance).toLocaleString() + ' m';
  $('finalBest').textContent = best.toLocaleString();
  $('finalStreak').textContent = maxCombo.toLocaleString();
  hideCount();
  $('newBest').hidden = !isBest || s === 0;
  $('hud').hidden = true; $('overPanel').hidden = false;
  if(qualifies(levelKey, s)) openEntry(s);
  else showOverBoard(0);
}

/* ---------- Update ---------- */
function physics(dt){
  p.x += (LANES[p.lane] - p.x) * Math.min(1, dt*15);
  if(swingT > 0){
    p.y += (3.0 - p.y) * Math.min(1, dt*6); p.vy = 0;
  } else {
    p.vy -= GRAV*dt; p.y += p.vy*dt;
    if(p.y <= 0){
      if(p.vy < -4) onLand(p.vy < -14);
      p.y = 0; p.vy = 0;
      if(p.queuedSlide && state==='play'){ p.queuedSlide = false; p.slideT = 0.7; sfx.slide(); }
    }
  }
  if(p.slideT > 0) p.slideT = Math.max(0, p.slideT - dt);
}
function moveWorld(dz){
  for(const s of segs){ s.position.z += dz; if(s.position.z - SEG/2 > 14) s.position.z -= NSEG*SEG; }
  for(const d of decor){
    d.position.z += dz;
    if(d.position.z > 20) placeDecor(d, d.position.z - DSPAN);
  }
  for(let i=obstacles.length-1;i>=0;i--){
    const o = obstacles[i]; o.z += dz; o.mesh.position.z = o.z;
    if(o.z > 14){ scene.remove(o.mesh); obstacles.splice(i,1); }
  }
  for(let i=items.length-1;i>=0;i--){
    const it = items[i]; it.z += dz;
    if(it.z > 10){ scene.remove(it.mesh); items.splice(i,1); }
  }
  lastRowZ += dz;
  sceneryMove(dz);
}
function playerHeight(){ return (p.slideT > 0 && p.y < 0.05) ? 0.85 : 1.85; }
function updateItems(dt, idle){
  const ph = playerHeight(), pcy = p.y + ph/2;
  const pulling = !idle && (magnetT > 0 || swingT > 0);
  for(let i=items.length-1;i>=0;i--){
    const it = items[i];
    if(pulling && it.kind==='banana' && it.z > -18 && it.z < 1.5){
      const k = Math.min(1, dt*9);
      it.x += (p.x - it.x)*k; it.y += (pcy - it.y)*k; it.z += (0 - it.z)*Math.min(1, dt*5);
      it.pulled = true;
    }
    it.mesh.position.set(it.x, it.pulled ? it.y : it.y + Math.sin(t*3 + it.phase)*0.09, it.z);
    it.mesh.rotation.y += dt*3;
    if(!idle && it.kind === 'banana' && !it.missed && it.z > 1.2){ it.missed = true; breakCombo(); }
    if(!idle && Math.abs(it.x - p.x) < 0.95 && Math.abs(it.z) < 0.95 && Math.abs(it.y - pcy) < 1.25){
      burstSparkle(it.x, it.y, it.z, it.kind === 'banana' ? 0xffe066 : it.kind === 'magnet' ? 0xff6a4d : 0x7ff0e0, it.kind === 'banana' ? 7 : 16);
      if(it.kind === 'banana'){
        bananas++; points += 10*mult; addCombo();
        if(swingT <= 0) meter = Math.min(1, meter + 0.025); sfx.banana();
      } else if(it.kind === 'magnet'){ magnetT = 10; sfx.power(); }
      else { shield = true; sfx.power(); }
      scene.remove(it.mesh); items.splice(i,1);
    }
  }
}
function checkHits(){
  if(swingT > 0 || invulnT > 0) return;
  const ph = playerHeight();
  for(let i=0;i<obstacles.length;i++){
    const o = obstacles[i];
    if(Math.abs(o.z) > 2) continue;
    if(Math.abs(p.x - o.x) < 1.1 && Math.abs(o.z) < 0.35 + o.d/2 && p.y < o.y1 && p.y + ph > o.y0){
      if(shield){
        shield = false; invulnT = 1.0; sfx.shield();
        smashDebris(o.x, o.z); burstSparkle(p.x, 1.1, 0, 0x7ff0e0, 12);
        scene.remove(o.mesh); obstacles.splice(i,1);
      } else {
        hurt(o);
      }
      return;
    }
  }
}

/* ---------- HUD ---------- */
const hudCache = {};
function setText(id, v){ if(hudCache[id] !== v){ hudCache[id] = v; $(id).textContent = v; } }
function updateHUD(){
  setText('score', score().toLocaleString());
  setText('bananaCount', bananas.toLocaleString());
  setText('mult', 'x' + mult);
  $('mult').classList.toggle('hot', mult > 1);
  setText('comboCount', String(combo));
  const fill = swingT > 0 ? swingT/SWING_TIME : meter;
  const w = Math.round(fill*100) + '%';
  if(hudCache.fill !== w){ hudCache.fill = w; $('meterFill').style.width = w; }
  const ready = meter >= 1 && swingT <= 0;
  const btn = $('swingBtn');
  btn.classList.toggle('ready', ready);
  btn.classList.toggle('active', swingT > 0);
  setText('swingLabel', swingT > 0 ? 'Swinging!' : (ready ? 'Swing! (tap or E)' : 'Vine swing'));
  const mt = $('magnetTag');
  mt.hidden = magnetT <= 0;
  if(magnetT > 0) setText('magnetTag', 'Magnet ' + Math.ceil(magnetT) + 's');
  $('shieldTag').hidden = !shield;
}

/* ---------- Animation ---------- */
let squash = 1, blinkT = 2.5, blinkDur = 0, hurtFaceT = 0, dustT = 0;
function animateMonkey(dt){
  const m = monkey, L = m.legs, A = m.arms;
  let bRX = 0, bRZ = 0, bY = 0, legA = 0, legB = 0, armA = 0, armB = 0, armZa = 0, armZb = 0;
  const onGround = p.y <= 0.02;
  if(state === 'menu'){
    bY = Math.abs(Math.sin(t*2))*0.04;
    armZb = 2.4 + Math.sin(t*7)*0.35;
    armA = Math.sin(t*2)*0.15;
  } else if(state === 'dying' || state === 'over'){
    bRX = 1.35; legA = -1.4; legB = -1.0; armA = 2.6; armB = 2.2; armZa = -0.6; armZb = 0.6;
  } else if(swingT > 0){
    armB = Math.PI; armA = Math.sin(t*6)*0.5;
    legA = Math.sin(t*5)*0.5; legB = -legA; bRZ = Math.sin(t*3)*0.12;
  } else if(p.slideT > 0 && onGround){
    bRX = 1.2; legA = legB = 1.35; armA = armB = -0.6;
  } else if(!onGround){
    legA = 0.9; legB = -0.4; armA = armB = 2.6; armZa = -0.3; armZb = 0.3;
  } else if(state === 'ready'){
    bY = Math.abs(Math.sin(t*3))*0.03; armA = 0.25; armB = -0.25; legA = 0.15; legB = -0.15; bRX = -0.08;
  } else if(state === 'play' || state === 'paused'){
    runPhase += dt*(6 + speed*0.35);
    legA = Math.sin(runPhase)*0.95; legB = -legA;
    armA = -legA*0.8; armB = -legB*0.8;
    bY = Math.abs(Math.cos(runPhase))*0.07; bRX = -0.12;
    if(state === 'play' && quality > 0){
      dustT -= dt;
      if(dustT <= 0){ dustT = 0.11; puffDust(p.x, 0.25, 1, false); }
    }
  }
  const k = Math.min(1, dt*22);
  m.body.rotation.x += (bRX - m.body.rotation.x)*k;
  m.body.rotation.z += (bRZ - m.body.rotation.z)*k;
  m.body.position.y += (bY - m.body.position.y)*k;
  L[0].rotation.x += (legA - L[0].rotation.x)*k;
  L[1].rotation.x += (legB - L[1].rotation.x)*k;
  A[0].rotation.x += (armA - A[0].rotation.x)*k;
  A[1].rotation.x += (armB - A[1].rotation.x)*k;
  A[0].rotation.z += (armZa - A[0].rotation.z)*k;
  A[1].rotation.z += (armZb - A[1].rotation.z)*k;
  m.tail.rotation.z = Math.sin(t*4)*0.25;
  m.tail.rotation.x = Math.sin(t*3)*0.1;
  const flap = state === 'play' ? 0.35 + speed*0.012 : 0.15;
  m.tails[0].rotation.set(-0.5 + Math.sin(t*16)*flap, -0.25, 0);
  m.tails[1].rotation.set(-0.4 + Math.sin(t*16 + 1.3)*flap, 0.25, 0);
  squash += (1 - squash)*Math.min(1, dt*9);
  const sx = 1/Math.sqrt(squash);
  m.body.scale.set(sx, squash, sx);
  const targetRY = state === 'menu' ? Math.PI : 0;
  m.root.rotation.y += (targetRY - m.root.rotation.y)*Math.min(1, dt*5);
  m.root.rotation.z = (p.x - LANES[p.lane])*0.12;
  m.root.position.set(p.x, p.y, 0);
  m.root.visible = !(invulnT > 0 && Math.floor(t*12) % 2 === 0);
  m.bubble.visible = shield;
  if(shield) m.bubble.scale.setScalar(1 + Math.sin(t*5)*0.04);

  // face: blink, hurt eyes
  if(hurtFaceT > 0) hurtFaceT -= dt;
  const hurtFace = hurtFaceT > 0 || state === 'dying' || state === 'over';
  blinkT -= dt;
  if(blinkT <= 0){ blinkDur = 0.15; blinkT = rnd(2, 4.5); }
  let lid = 0;
  if(blinkDur > 0){ blinkDur -= dt; lid = Math.sin(Math.max(0, blinkDur)/0.15*Math.PI); }
  if(p.slideT > 0 && onGround) lid = Math.max(lid, 0.45);
  for(let i=0;i<2;i++){
    m.lids[i].visible = !hurtFace && lid > 0.04;
    m.lids[i].scale.y = 0.135*Math.max(0.001, lid);
    m.pupils[i].visible = !hurtFace && lid < 0.6;
    m.eyes[i].visible = !hurtFace;
    m.xs[i].visible = hurtFace;
  }
  m.smile.visible = !hurtFace; m.oMouth.visible = hurtFace;
  if(state === 'menu'){ for(const pu of m.pupils) pu.position.x = Math.sign(pu.position.x)*0.14 + Math.sin(t*0.8)*0.02; }

  blob.position.x = p.x;
  const sc = 1/(1 + p.y*0.45);
  blob.scale.set(sc, sc, sc);
  vine.visible = swingT > 0;
  if(swingT > 0){
    vine.position.set(p.x + 0.35, p.y + 1.9, 0.05);
    vine.rotation.z = Math.sin(t*3)*0.12;
  }
}
function onJump(){ squash = 1.28; }
function onLand(hard){ squash = hard ? 0.66 : 0.78; if(quality > 0 || hard) puffDust(p.x, 0.1, hard ? 7 : 4, true); }

const camPos = new THREE.Vector3(0, 1.7, 4.6), camLook = new THREE.Vector3(0, 0.35, 0);
const tmpPos = new THREE.Vector3(), tmpLook = new THREE.Vector3();
let portrait = true, baseFov = 60;
function updateCamera(dt){
  if(state === 'menu'){
    if(portrait){ tmpPos.set(0, 1.7, 4.6); tmpLook.set(0, 0.35, 0); }
    else { tmpPos.set(1.5, 1.6, 4.4); tmpLook.set(1.5, 1.1, 0); }
  } else {
    const lift = swingT > 0 ? 1.6 : 0;
    if(portrait){ tmpPos.set(p.x*0.6, 4.9 + lift, 9.4); tmpLook.set(p.x*0.4, 1.3 + lift*0.6, -9); }
    else { tmpPos.set(p.x*0.5, 4.3 + lift, 7.6); tmpLook.set(p.x*0.35, 1.5 + lift*0.6, -8); }
  }
  const k = Math.min(1, dt*(state === 'menu' ? 3 : 6));
  camPos.lerp(tmpPos, k); camLook.lerp(tmpLook, k);
  camera.position.copy(camPos);
  if(shake > 0){
    shake = Math.max(0, shake - dt);
    camera.position.x += (Math.random()-0.5)*shake;
    camera.position.y += (Math.random()-0.5)*shake;
  }
  camera.lookAt(camLook);
  const fovT = baseFov + (state === 'play' && !reduceMotion ? Math.min(7, Math.max(0, (speed - 14)*0.25)) + (swingT > 0 ? 7 : 0) : 0);
  if(Math.abs(camera.fov - fovT) > 0.01){ camera.fov += (fovT - camera.fov)*Math.min(1, dt*4); camera.updateProjectionMatrix(); }
}

function update(dt){
  t += dt;
  if(state === 'play'){
    elapsed += dt;
    const lv = LEVELS[levelKey];
    baseSpeed = Math.min(lv.max, lv.start + elapsed*0.22);
    speed = baseSpeed*(swingT > 0 ? 1.35 : 1);
    distance += speed*dt;
    points += speed*dt*mult;
    if(swingT > 0){ swingT -= dt; if(swingT <= 0){ swingT = 0; invulnT = 0.9; p.vy = 2; } }
    if(magnetT > 0) magnetT = Math.max(0, magnetT - dt);
    if(invulnT > 0) invulnT = Math.max(0, invulnT - dt);
    physics(dt);
    moveWorld(speed*dt);
    while(lastRowZ - SPAWN_Z >= nextGap){
      const z = lastRowZ - nextGap;
      generateRow(z, lastRowZ); lastRowZ = z; nextGap = gapFor();
    }
    updateItems(dt, false);
    checkHits();
    if(state === 'play') updateHUD();
  } else if(state === 'ready'){
    readyT += dt;
    if(readyT >= readyTotal){
      state = 'play'; showCount('Go!', 'go'); sfx.go();
    } else {
      let acc = 0, label = '';
      for(const [txt, d] of readySeq){ if(readyT < acc + d){ label = txt; break; } acc += d; }
      if(label !== countShown){
        countShown = label; showCount(label, 'pop');
        if(label.length === 1) sfx.tick();
      }
    }
    updateItems(dt, true);
    updateHUD();
  } else if(state === 'dying'){
    dieT += dt;
    physics(dt);
    moveWorld(speed*dt*Math.max(0, 1 - dieT*2.5));
    updateItems(dt, true);
    if(dieT > 1.1) showOver();
  } else {
    updateItems(dt, true);
  }
  animateMonkey(dt);
  updateCamera(dt);
  updateScenery(dt);
}

/* ---------- Loop / resize ---------- */
function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h;
  portrait = camera.aspect < 0.85;
  baseFov = portrait ? 74 : 58;
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
let last = performance.now(), perfAcc = 0, perfN = 0;
function frame(now){
  requestAnimationFrame(frame);
  let dt = (now - last)/1000; last = now;
  if(!(dt > 0)) dt = 0;
  if(state === 'play'){
    perfAcc += dt; perfN++;
    if(perfAcc >= 3){
      if(perfAcc/perfN > 1/42 && quality > 0){ quality--; applyQuality(); resize(); }
      perfAcc = 0; perfN = 0;
    }
  } else { perfAcc = 0; perfN = 0; }
  dt = Math.min(dt, 0.033);
  if(state !== 'paused') update(dt);
  renderer.render(scene, camera);
}

/* ---------- Input ---------- */
window.addEventListener('keydown', e => {
  const k = e.key;
  if(state === 'play'){
    if(k==='ArrowLeft' || k==='a' || k==='A'){ moveLeft(); e.preventDefault(); }
    else if(k==='ArrowRight' || k==='d' || k==='D'){ moveRight(); e.preventDefault(); }
    else if(k==='ArrowUp' || k==='w' || k==='W' || k===' '){ jump(); e.preventDefault(); }
    else if(k==='ArrowDown' || k==='s' || k==='S'){ slide(); e.preventDefault(); }
    else if(k==='e' || k==='E' || k==='Shift'){ swing(); }
    else if(k==='p' || k==='P' || k==='Escape'){ pause(); }
  } else if(state === 'paused'){
    if(k === 'Escape' && !$('settingsPanel').hidden){ closeSettings(); e.preventDefault(); }
    else if(k==='p' || k==='P' || k==='Escape'){ resume(); e.preventDefault(); }
  } else if(state === 'over'){
    if(entry) handleEntryKey(e);
    else if(k === 'Enter'){ startGame(levelKey); e.preventDefault(); }
  } else if(state === 'menu' && k === 'Escape' && !$('settingsPanel').hidden){
    closeSettings();
  } else if(state === 'menu' && k === 'Escape' && !$('boardPanel').hidden){
    closeScores();
  }
});
let sw = null;
canvas.addEventListener('pointerdown', e => { sw = { x:e.clientX, y:e.clientY, used:false, id:e.pointerId }; });
window.addEventListener('pointermove', e => {
  if(!sw || sw.used || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if(Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
  sw.used = true;
  if(Math.abs(dx) > Math.abs(dy)){ if(dx < 0) moveLeft(); else moveRight(); }
  else { if(dy < 0) jump(); else slide(); }
});
window.addEventListener('pointerup', () => { sw = null; });
window.addEventListener('pointercancel', () => { sw = null; });
document.addEventListener('visibilitychange', () => { if(document.hidden) pause(); });

$('playBtn').addEventListener('click', () => startGame(levelKey));
$('againBtn').addEventListener('click', () => startGame(levelKey));
$('levelBtn').addEventListener('click', showMenu);
$('saveScoreBtn').addEventListener('click', saveEntry);
$('scoresBtn').addEventListener('click', openScores);
$('closeBoardBtn').addEventListener('click', closeScores);
$('howToBtn').addEventListener('click', openHowTo);
$('closeHowToBtn').addEventListener('click', closeHowTo);
$('tabBeginner').addEventListener('click', () => { boardTab = 'beginner'; renderScoresTab(); });
$('tabNormal').addEventListener('click', () => { boardTab = 'normal'; renderScoresTab(); });
$('scopeLocal').addEventListener('click', () => { boardScope = 'local'; renderScopeToggle(); renderScoresTab(); });
$('scopeGlobal').addEventListener('click', () => { boardScope = 'global'; renderScopeToggle(); renderScoresTab(); });
$('settingsBtn').addEventListener('click', () => openSettings('start'));
$('pauseSettingsBtn').addEventListener('click', () => openSettings('pause'));
$('closeSettingsBtn').addEventListener('click', closeSettings);
$('soundToggleBtn').addEventListener('click', () => {
  muted = !muted; store.set(MUTE_KEY, muted ? '1' : '0'); ensureAudio(); renderSoundToggle(); $('soundToggleBtn').blur();
});
$('paceBeginner').addEventListener('click', () => setPace('beginner'));
$('paceNormal').addEventListener('click', () => setPace('normal'));
$('resumeBtn').addEventListener('click', resume);
$('pauseBtn').addEventListener('click', pause);
$('restartBtn').addEventListener('click', () => startGame(levelKey));
$('pauseHomeBtn').addEventListener('click', showMenu);
$('swingBtn').addEventListener('click', () => { swing(); $('swingBtn').blur(); });

/* ---------- Boot ---------- */
renderLives();
buildSlots();
applyQuality();
resize();
reset();
requestAnimationFrame(frame);
})();
