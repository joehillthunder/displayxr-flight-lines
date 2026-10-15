// 3D Flight Lines: app shell.
//
// One three.js renderer on one persistent <canvas> for the life of the page (woven-canvas rules
// 1-3). In the DisplayXR Browser on a 3D display the canvas is an inline-3D window: the runtime
// owns the eyes (a display rig, 0.12 m tall), each frame draws once per eye into its half of the
// double-width buffer, and the page turns the CONTENT, never a camera. Anywhere else it renders a
// 2D preview with a little mouse parallax.
//
// Scene: root (depth slider scales z) > view (globe position, orientation, zoom) > globe + traffic.
// The selected flight's aircraft model floats in front of the screen to the right of the globe.

import * as THREE from 'three';
import { createInline3D } from '@displayxr/inline3d';
import { EyeCamera, EdgeFeather, DepthCursor, raycastHitTest } from '@displayxr/inline3d/three';
import { R } from './geo.js';
import { Globe } from './globe.js';
import { Network } from './network.js';
import { Traffic, textSprite } from './traffic.js';
import { buildAircraft } from './aircraft-model.js';
import { MAKERS } from './data/aircraft.js';

const VIRTUAL_DISPLAY_HEIGHT = 0.12;
const FLAT_TILT = -0.62;           // the flat map leans back so the arcs rise toward the viewer
const PICK_PX = 18;                // how close (CSS px) a click must land to an aircraft
const TOUR_SECONDS = 11;
const IDLE_SPIN = 0.045;           // rad/s the globe turns when left alone

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const cover = $('cover');
const statusEl = $('status');
const params = new URLSearchParams(location.search);
const store = {
  get(k) { try { return localStorage.getItem('dxr-flights.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('dxr-flights.' + k, v); } catch {} },
};
const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// "Airbus A350-900", but "ATR 72-600" rather than "ATR ATR 72-600".
const acName = (ac) => (ac.model.startsWith(ac.maker) ? ac.model : `${ac.maker} ${ac.model}`);

// ---- renderer --------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 1);
renderer.setPixelRatio(1);              // getViewport() is in buffer pixels
renderer.autoClear = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a2333, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(0.4, 0.8, 1);
scene.add(sun);
const root = new THREE.Group();
scene.add(root);
const view = new THREE.Group();
root.add(view);

// Stars far behind the screen, for depth.
{
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 0.5;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
    pos[i * 3 + 2] = -0.12 - Math.random() * 0.12;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  root.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb8e0, size: 0.0006, sizeAttenuation: true, transparent: true, opacity: 0.7 })));
}

const eye = new EyeCamera(THREE);
const feather = new EdgeFeather(THREE, { px: 24 });
const monoCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.005, 10);
const monoDist = VIRTUAL_DISPLAY_HEIGHT / 2 / Math.tan(THREE.MathUtils.degToRad(20));
monoCam.position.set(0, 0, monoDist);

// ---- world ----------------------------------------------------------------------------------
const net = new Network();
if (net.skipped.length) console.info('[flights] skipped routes:\n' + net.skipped.join('\n'));
let globe = null, traffic = null;

// Showcase: the selected aircraft's model, in front of the screen to the right of the globe.
const showcase = new THREE.Group();
showcase.position.set(0.074, -0.004, 0.016);
root.add(showcase);
let model = null, caption = null, showT = 0;

// ---- state -----------------------------------------------------------------------------------
const st = {
  morph: params.has('flat') ? 1 : 0, morphTarget: params.has('flat') ? 1 : 0,
  yaw: -0.2, pitch: 0.45, vYaw: 0, vPitch: 0, zoom: 1.1, zoomTarget: 1.1, flatYaw: 0,
  follow: false, idle: 0,
  selected: null,
  tour: params.has('tour'), tourClock: 0,
  paused: false,
  speed: 0, // sim seconds per real second; set from the slider
  simTime: Date.UTC(2026, 9, 14, 12, 0, 0),
  shiftX: 0,
};

// ---- picking ---------------------------------------------------------------------------------
const pickCam = new THREE.PerspectiveCamera();
pickCam.matrixAutoUpdate = false;
let havePickCam = false;
const _a = new THREE.Matrix4(), _b = new THREE.Matrix4(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
function setPickCam(eyes) {
  _a.fromArray(eyes[0].xf); _b.fromArray(eyes[eyes.length - 1].xf);
  _pa.setFromMatrixPosition(_a).add(_pb.setFromMatrixPosition(_b)).multiplyScalar(0.5);
  _a.setPosition(_pa);
  pickCam.matrixWorld.copy(_a);
  pickCam.matrixWorldInverse.copy(_a).invert();
  pickCam.projectionMatrix.fromArray(eyes[0].proj);
  pickCam.projectionMatrixInverse.copy(pickCam.projectionMatrix).invert();
  havePickCam = true;
}
const camera = () => (sbs ? (havePickCam ? pickCam : null) : monoCam);

const _p = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _inv = new THREE.Matrix4();
/** The aircraft nearest the pointer (NDC), within PICK_PX, that isn't hidden behind the globe. */
function pick(ndc) {
  const cam = camera();
  if (!cam || !traffic) return null;
  view.updateMatrixWorld(true);
  _inv.copy(view.matrixWorld).invert();
  _c.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(_inv);   // camera in map space
  const rect = canvas.getBoundingClientRect();
  const occlude = st.morph < 0.5;
  let best = null, bestD = PICK_PX;
  for (const f of net.flights) {
    if (!traffic.positionOf(f, _p)) continue;
    _w.copy(_p).applyMatrix4(view.matrixWorld).project(cam);
    if (_w.z > 1) continue;
    const d = Math.hypot((_w.x - ndc.x) * rect.width / 2, (_w.y - ndc.y) * rect.height / 2);
    if (d >= bestD) continue;
    if (occlude && behindGlobe(_c, _p)) continue;
    best = f; bestD = d;
  }
  return best;
}
// Does the segment from the camera C to point P pass through the globe first?
const _d = new THREE.Vector3();
function behindGlobe(C, P) {
  _d.subVectors(P, C);
  const a = _d.dot(_d), b = 2 * C.dot(_d), c = C.dot(C) - (R * 0.995) ** 2;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return false;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 && t < 0.999;
}

// ---- selection -------------------------------------------------------------------------------
function select(f, { follow = true } = {}) {
  st.selected = f;
  traffic?.select(f);
  if (model) { showcase.remove(model); disposeTree(model); model = null; }
  if (caption) { showcase.remove(caption); caption.material.map.dispose(); caption.material.dispose(); caption = null; }
  if (f) {
    const ac = f.route.ac;
    model = buildAircraft(THREE, ac, f.route.airline.color);
    showcase.add(model);
    caption = textSprite(THREE, [acName(ac), `${fmt(ac.length, 1)} m long · ${fmt(ac.span, 1)} m span · to scale`], { height: 0.0062 });
    caption.material.depthTest = false;
    caption.renderOrder = 20;
    caption.position.set(0, -0.019, 0);
    caption.center.set(0.5, 1);
    showcase.add(caption);
    showT = 0;
    st.follow = follow && st.morph < 0.5;
  }
  renderInfo();
}

function disposeTree(o) {
  const seen = new Set();
  o.traverse((n) => {
    if (n.geometry && !seen.has(n.geometry)) { seen.add(n.geometry); n.geometry.dispose(); }
    if (n.material && !seen.has(n.material)) { seen.add(n.material); n.material.dispose(); }
  });
}

function randomFlight() {
  const pool = net.flights.filter((f) => traffic.visible[f.id] && net.airborne(f) && f.p > 0.12 && f.p < 0.8 && f !== st.selected);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// ---- info panel --------------------------------------------------------------------------------
const info = $('info');
function renderInfo() {
  const f = st.selected;
  info.classList.toggle('is-empty', !f);
  $('info-empty').hidden = !!f;
  const box = $('info-flight');
  box.hidden = !f;
  if (!f) return;
  const r = f.route, al = r.airline, ac = r.ac, mk = MAKERS[ac.maker];
  const o = net.origin(f), d = net.dest(f);
  box.innerHTML = `
    <div class="flight-head">
      <div class="tailchip" style="background:${al.color}">${esc(al.code)}</div>
      <div><div class="num">${esc(net.number(f))}</div><div class="al">${esc(al.name)} · ${esc(al.country)}</div></div>
      <button class="x" id="close" type="button" aria-label="Close">✕</button>
    </div>
    <div class="route">
      <div class="ap"><b>${o.code}</b><span>${esc(o.city)}</span><span>${esc(o.name)}</span></div>
      <div class="arrow">✈</div>
      <div class="ap to"><b>${d.code}</b><span>${esc(d.city)}</span><span>${esc(d.name)}</span></div>
    </div>
    <div class="progress"><i id="li-bar"></i></div>
    <div class="progress-meta"><span id="li-flown"></span><span id="li-left"></span></div>

    <h2>Live (simulated)</h2>
    <dl class="grid">
      <div><dt>Altitude</dt><dd id="li-alt"></dd></div>
      <div><dt>Ground speed</dt><dd id="li-gs"></dd></div>
      <div><dt>Heading</dt><dd id="li-hdg"></dd></div>
      <div><dt>Phase</dt><dd id="li-phase"></dd></div>
      <div class="wide"><dt>Position</dt><dd id="li-pos"></dd></div>
    </dl>

    <h2>Aircraft</h2>
    <div class="maker"><span class="brand" style="color:${mk.color}">${esc(ac.maker)}</span><span class="model">${esc(ac.model)}</span>
      <small>${esc(ac.category)} · built by ${esc(ac.maker)}, ${esc(mk.country)}</small></div>
    <dl class="grid" style="margin-top:10px">
      <div><dt>First flight</dt><dd>${ac.firstFlight}</dd></div>
      <div><dt>Typical seats</dt><dd>${ac.seats}</dd></div>
      <div><dt>Length</dt><dd>${fmt(ac.length, 1)} m</dd></div>
      <div><dt>Wingspan</dt><dd>${fmt(ac.span, 1)} m</dd></div>
      <div><dt>Max take-off weight</dt><dd>${fmt(ac.mtow, 1)} t</dd></div>
      <div><dt>Range</dt><dd>${fmt(ac.rangeKm)} km</dd></div>
      <div><dt>Cruise speed</dt><dd>${fmt(ac.cruiseKmh)} km/h${ac.shape.prop ? '' : ` · Mach ${ac.mach}`}</dd></div>
      <div><dt>Route length</dt><dd>${fmt(r.km)} km</dd></div>
      <div class="wide"><dt>Engines</dt><dd>${esc(ac.engines)}</dd></div>
    </dl>
    <p class="note">${esc(ac.note)}</p>
    <div class="actions">
      <button id="follow" type="button" aria-pressed="${st.follow}">Follow</button>
      <button id="only-airline" type="button">All ${esc(al.code)} flights</button>
      <button id="only-type" type="button">All ${esc(ac.model)}s</button>
    </div>`;
  $('close').onclick = () => { stopTour(); select(null); };
  $('follow').onclick = () => { st.follow = !st.follow; if (st.follow) setMorphTarget(0); $('follow').setAttribute('aria-pressed', String(st.follow)); };
  $('only-airline').onclick = () => { $('f-airline').value = al.code; $('f-maker').value = ''; $('f-search').value = ''; applyFilter(); };
  $('only-type').onclick = () => { $('f-airline').value = ''; $('f-maker').value = ''; $('f-search').value = ac.model; applyFilter(); };
  updateLive();
}

function updateLive() {
  const f = st.selected;
  if (!f) return;
  const L = net.live(f);
  $('li-bar').style.width = `${(f.ground > 0 ? 100 : f.p * 100).toFixed(1)}%`;
  $('li-flown').textContent = `${fmt(L.flownKm)} km flown`;
  const h = Math.floor(L.leftH), m = Math.round((L.leftH - h) * 60);
  $('li-left').textContent = f.ground > 0 ? 'Landed' : `${fmt(L.leftKm)} km · ${h} h ${String(m).padStart(2, '0')} min to go`;
  $('li-alt').textContent = f.ground > 0 ? 'On the ground' : `${fmt(L.altFt)} ft`;
  $('li-gs').textContent = f.ground > 0 ? '—' : `${fmt(L.gsKt)} kt · ${fmt(L.gsKmh)} km/h`;
  $('li-hdg').textContent = `${fmt(L.heading)}°`;
  $('li-phase').textContent = L.phase;
  $('li-pos').textContent = `${fmt(Math.abs(L.lat), 2)}° ${L.lat >= 0 ? 'N' : 'S'}, ${fmt(Math.abs(L.lon), 2)}° ${L.lon >= 0 ? 'E' : 'W'}`;
}

// ---- filters -----------------------------------------------------------------------------------
function applyFilter() {
  const al = $('f-airline').value, mk = $('f-maker').value;
  const q = $('f-search').value.trim().toLowerCase();
  traffic.setFilter((f) => {
    const r = f.route;
    if (al && r.airline.code !== al) return false;
    if (mk && r.ac.maker !== mk) return false;
    if (!q) return true;
    const hay = [net.number(f), r.airline.name, r.from.code, r.to.code, r.from.city, r.to.city, r.ac.maker, r.ac.model, `${r.ac.maker} ${r.ac.model}`].join(' | ').toLowerCase();
    return hay.includes(q) || hay.replace(/\s+/g, '').includes(q.replace(/\s+/g, ''));
  });
  if (st.selected && !traffic.visible[st.selected.id]) select(null);
  updateStats();
}

function updateStats() {
  if (!traffic) return;
  const shown = net.flights.filter((f) => traffic.visible[f.id]);
  const air = shown.filter((f) => net.airborne(f)).length;
  const airlines = new Set(shown.map((f) => f.route.airline.code)).size;
  const types = new Set(shown.map((f) => f.route.type)).size;
  $('stats').innerHTML = `<b>${fmt(air)}</b> aircraft in the air · <b>${fmt(traffic.routeCount)}</b> routes · <b>${airlines}</b> airlines · <b>${types}</b> aircraft types · <b>${net.airportList.length}</b> airports`;
}

// ---- view controls -----------------------------------------------------------------------------
function setMorphTarget(m) {
  st.morphTarget = m;
  $('v-globe').setAttribute('aria-pressed', String(m === 0));
  $('v-flat').setAttribute('aria-pressed', String(m === 1));
  if (m === 1) st.follow = false;
  $('follow')?.setAttribute('aria-pressed', String(st.follow));
}
$('v-globe').onclick = () => setMorphTarget(0);
$('v-flat').onclick = () => setMorphTarget(1);
function setColorBy(mode) {
  traffic?.setColorBy(mode);
  $('c-airline').setAttribute('aria-pressed', String(mode === 'airline'));
  $('c-maker').setAttribute('aria-pressed', String(mode === 'maker'));
  if (st.selected) traffic.select(st.selected);
}
$('c-airline').onclick = () => setColorBy('airline');
$('c-maker').onclick = () => setColorBy('maker');
$('f-airline').onchange = applyFilter;
$('f-maker').onchange = applyFilter;
$('f-search').oninput = applyFilter;

function startTour() { st.tour = true; st.tourClock = TOUR_SECONDS; $('tour').setAttribute('aria-pressed', 'true'); }
function stopTour() { st.tour = false; $('tour').setAttribute('aria-pressed', 'false'); }
$('tour').onclick = () => (st.tour ? stopTour() : startTour());
$('random').onclick = () => { stopTour(); setMorphTarget(0); select(randomFlight()); };
function setPaused(p) { st.paused = p; $('pause').setAttribute('aria-pressed', String(p)); $('pause').firstChild.textContent = p ? 'Play ' : 'Pause '; }
$('pause').onclick = () => setPaused(!st.paused);

// Speed: log slider from real time (x1) to x3000; default x240.
const speedEl = $('speed');
const speedFrom = (v) => Math.round(Math.pow(3000, v));
const speedTo = (s) => Math.log(s) / Math.log(3000);
speedEl.value = String(speedTo(+(params.get('speed') || store.get('speed') || 240)));
function onSpeed() { st.speed = speedFrom(+speedEl.value); $('speed-val').textContent = `×${fmt(st.speed)}`; store.set('speed', st.speed); }
speedEl.oninput = onSpeed;
onSpeed();
$('depth').oninput = (e) => { root.scale.z = +e.target.value; };

function setFill(on) {
  document.body.classList.toggle('fill', on);
  $('fill').setAttribute('aria-pressed', String(on));
}
$('fill').onclick = () => setFill(!document.body.classList.contains('fill'));
$('exit-fill').onclick = () => setFill(false);

addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'f' || e.key === 'F') setFill(!document.body.classList.contains('fill'));
  else if (e.key === 'Escape') { if (document.body.classList.contains('fill')) setFill(false); else { stopTour(); select(null); } }
  else if (e.key === 'm' || e.key === 'M') setMorphTarget(st.morphTarget ? 0 : 1);
  else if (e.key === 't' || e.key === 'T') (st.tour ? stopTour() : startTour());
  else if (e.key === 'r' || e.key === 'R') $('random').click();
  else if (e.key === ' ') { e.preventDefault(); setPaused(!st.paused); }
});

// ---- pointer: drag to turn, wheel/pinch to zoom, click to pick ------------------------------------
const pointers = new Map();
let downAt = null, dragged = false, hoverNdc = null, pinch0 = 0, zoom0 = 1;
const ndcOf = (e) => {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
};
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  dragged = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = st.zoomTarget;
  }
});
canvas.addEventListener('pointermove', (e) => {
  hoverNdc = ndcOf(e);
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  prev.x = e.clientX; prev.y = e.clientY;
  if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) dragged = true;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    st.zoomTarget = clamp(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch0), 0.7, 2.6);
    return;
  }
  if (!dragged) return;
  canvas.classList.add('dragging');
  const k = 2.8 / canvas.clientWidth / st.zoom;
  st.follow = false; st.idle = 0; stopTour();
  if (st.morph < 0.5) {
    st.yaw += dx * k * 1.6; st.pitch = clamp(st.pitch + dy * k * 1.6, -1.25, 1.25);
    st.vYaw = dx * k * 1.6 * 60; st.vPitch = dy * k * 1.6 * 60;
  } else {
    st.flatYaw = clamp(st.flatYaw + dx * k * 0.6, -0.6, 0.6);
  }
});
const endPointer = (e) => {
  const had = pointers.delete(e.pointerId);
  canvas.classList.remove('dragging');
  if (!had || dragged || pointers.size) return;
  const f = pick(ndcOf(e));
  if (f) { stopTour(); select(f); }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); canvas.classList.remove('dragging'); });
canvas.addEventListener('pointerleave', () => { hoverNdc = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  st.zoomTarget = clamp(st.zoomTarget * Math.exp(-e.deltaY * 0.0012), 0.7, 2.6);
  st.idle = 0;
}, { passive: false });
canvas.addEventListener('dblclick', () => { st.zoomTarget = 1.1; st.follow = false; });

// Gentle mouse parallax in 2D, so the depth reads a little on a flat screen.
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => {
  parallax.tx = (e.clientX / innerWidth - 0.5) * 0.03;
  parallax.ty = (e.clientY / innerHeight - 0.5) * -0.018;
});

// ---- per frame -------------------------------------------------------------------------------------
const hoverEl = $('hover'), clockEl = $('clock');
const qGlobe = new THREE.Quaternion(), qFlat = new THREE.Quaternion(), eul = new THREE.Euler();
let lastLineMorph = -1, hoverClock = 0, infoClock = 0, statsClock = 0, time = 0, last = 0;
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function tick(dt) {
  dt = Math.min(dt, 0.1);
  time += dt;
  if (!traffic) return;

  // Simulation.
  if (!st.paused) { net.step((dt * st.speed) / 3600); st.simTime += dt * st.speed * 1000; }

  // Tour: hop between random flights.
  if (st.tour) {
    st.tourClock += dt;
    if (st.tourClock >= TOUR_SECONDS) { st.tourClock = 0; if (st.morphTarget === 0) select(randomFlight()); else select(randomFlight(), { follow: false }); }
  }

  // Morph between globe and flat map.
  const k = 1 - Math.exp(-dt * 3.2);
  st.morph += (st.morphTarget - st.morph) * k;
  if (Math.abs(st.morph - st.morphTarget) < 0.002) st.morph = st.morphTarget;
  const m = st.morph, em = m * m * (3 - 2 * m);
  globe.setMorph(m);
  if (Math.abs(m - lastLineMorph) > 0.04 || (m === st.morphTarget && m !== lastLineMorph)) { traffic.setMorph(m); lastLineMorph = m; }
  else traffic.morph = m;

  // Orientation: follow the selected flight, coast after a flick, or spin slowly when idle.
  st.idle += dt;
  const dragging = pointers.size > 0 && dragged;
  if (st.follow && st.selected && net.airborne(st.selected)) {
    const L = net.live(st.selected);
    const ty = -L.lon * Math.PI / 180, tp = clamp(L.lat * Math.PI / 180, -1.1, 1.1);
    const kf = 1 - Math.exp(-dt * 2.2);
    st.yaw += angDiff(st.yaw, ty) * kf; st.pitch += (tp - st.pitch) * kf;
  } else if (!dragging) {
    st.yaw += st.vYaw * dt; st.pitch = clamp(st.pitch + st.vPitch * dt, -1.25, 1.25);
    const damp = Math.exp(-dt * 3);
    st.vYaw *= damp; st.vPitch *= damp;
    if (st.idle > 4 && !st.selected) st.yaw += IDLE_SPIN * dt * Math.min(1, (st.idle - 4) / 3);
  }
  st.zoom += (st.zoomTarget - st.zoom) * (1 - Math.exp(-dt * 6));
  qGlobe.setFromEuler(eul.set(st.pitch, st.yaw, 0, 'XYZ'));
  qFlat.setFromEuler(eul.set(FLAT_TILT, st.flatYaw, 0, 'XYZ'));
  view.quaternion.slerpQuaternions(qGlobe, qFlat, em);
  view.scale.setScalar(st.zoom * (1 - 0.2 * em));
  // Make room for the aircraft model; keep the globe's front surface just in front of the screen.
  st.shiftX += ((st.selected ? -0.024 : 0) - st.shiftX) * k;
  view.position.set(st.shiftX * (1 - 0.3 * em), -0.002 * em, (-R * st.zoom * 0.72) * (1 - em) + (-0.006) * em);

  traffic.update(time);

  // Showcase: pop the model in, then turn it slowly.
  if (model) {
    showT = Math.min(1, showT + dt * 2.5);
    const s = 1 - Math.pow(1 - showT, 3);
    model.scale.setScalar(Math.max(0.001, s));
    model.rotation.set(0.32 + 0.06 * Math.sin(time * 0.7), time * 0.45, 0.04 * Math.sin(time * 0.9));
    model.position.y = 0.0015 * Math.sin(time * 1.3);
    for (const p of model.userData.props) p.rotation.z += dt * 40;
    caption.material.opacity = s;
  }

  // Hover read-out, 10 Hz.
  hoverClock += dt;
  if (hoverClock > 0.1) {
    hoverClock = 0;
    const f = hoverNdc && !(pointers.size && dragged) ? pick(hoverNdc) : null;
    traffic.hovered = f;
    canvas.classList.toggle('hovering', !!f);
    hoverEl.hidden = !f;
    if (f) hoverEl.textContent = `${net.number(f)} · ${net.origin(f).code} → ${net.dest(f).code} · ${acName(f.route.ac)}`;
  }
  infoClock += dt;
  if (infoClock > 0.25) {
    infoClock = 0; updateLive();
    clockEl.textContent = `${new Date(st.simTime).toISOString().slice(11, 16)} UTC sim · ×${fmt(st.speed)}${st.paused ? ' · paused' : ''}`;
  }
  statsClock += dt;
  if (statsClock > 2) { statsClock = 0; updateStats(); }
}

function drawEye(cam, vp) {
  renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
  renderer.setScissor(vp.x, vp.y, vp.width, vp.height);
  traffic?.setViewport(vp.width, vp.height);
  renderer.render(scene, cam);
  feather.render(renderer, vp);
}

function drawStereo(eyes) {
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, canvas.width, canvas.height);
  renderer.setScissor(0, 0, canvas.width, canvas.height);
  renderer.clear();
  for (const e of eyes) drawEye(eye.setFromMatrices(e.proj, e.xf), e.vp);
  renderer.setScissorTest(false);
}

function drawMono() {
  const w = canvas.width, h = canvas.height;
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.clear();
  if (sbs) {
    monoCam.aspect = (w / 2) / h; monoCam.updateProjectionMatrix();
    drawEye(monoCam, { x: 0, y: 0, width: w / 2, height: h });
    drawEye(monoCam, { x: w / 2, y: 0, width: w / 2, height: h });
  } else {
    monoCam.aspect = w / h; monoCam.updateProjectionMatrix();
    drawEye(monoCam, { x: 0, y: 0, width: w, height: h });
  }
  renderer.setScissorTest(false);
}

let wall = null, handle = null, sbs = false, lastGood = null, cursor = null;
const cursorTargets = [];

function onXRFrame(views, layer) {
  const now = performance.now();
  const dt = last ? (now - last) / 1000 : 1 / 60; last = now;
  tick(dt);
  if (globe) cursorTargets[0] = globe.pickProxy;
  // Validate BEFORE clearing: a short view list or a missing viewport replays the last good frame.
  let ok = views && views.length >= 2;
  const eyes = [];
  if (ok) {
    for (const v of views) {
      const vp = layer.getViewport(v);
      if (!vp) { ok = false; break; }
      eyes.push({ proj: Float32Array.from(v.projectionMatrix), xf: Float32Array.from(v.transform.matrix), vp: { x: vp.x, y: vp.y, width: vp.width, height: vp.height } });
    }
  }
  if (ok) {
    cursor?.update(views, { layer });
    lastGood = eyes;
    setPickCam(eyes);
    drawStereo(eyes);
  } else if (lastGood) drawStereo(lastGood);
  else drawMono();
}

function onMonoFrame(now) {
  if (sbs) return;
  requestAnimationFrame(onMonoFrame);
  const dt = last ? (now - last) / 1000 : 1 / 60; last = now;
  tick(dt);
  parallax.x += (parallax.tx - parallax.x) * 0.05;
  parallax.y += (parallax.ty - parallax.y) * 0.05;
  monoCam.position.set(parallax.x, parallax.y, monoDist);
  monoCam.lookAt(0, 0, 0);
  monoCam.updateMatrixWorld();
  drawMono();
}

// ---- sizing ----------------------------------------------------------------------------------------
// Inline-3D buffers are double width (left eye | right eye). Clamp to the GPU's limits and to the
// panel width, both axes by one factor, so the eye split stays at 50% of the real buffer.
const gl = renderer.getContext();
const glMax = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0]);
function sizeCanvas() {
  const dpr = devicePixelRatio || 1;
  let w = Math.round((canvas.clientWidth || 640) * dpr);
  let h = Math.round((canvas.clientHeight || 360) * dpr);
  const totalW = sbs ? w * 2 : w;
  const maxW = sbs ? Math.min(glMax, Math.round(screen.width * dpr)) : glMax;
  const s = Math.min(1, maxW / totalW, glMax / h);
  w = Math.floor(w * s); h = Math.floor(h * s);
  const bw = sbs ? w * 2 : w;
  if (canvas.width === bw && canvas.height === h) return;
  renderer.setSize(bw, h, false);
  if (sbs && lastGood) drawStereo(lastGood); else drawMono();
}
new ResizeObserver(sizeCanvas).observe(canvas);

function setStatus(text, kind) { statusEl.textContent = text; statusEl.dataset.kind = kind || ''; }

// ---- boot --------------------------------------------------------------------------------------------
async function boot() {
  sizeCanvas();
  const topo = await fetch('./data/countries-50m.json').then((r) => r.json());
  globe = new Globe(THREE, topo);
  traffic = new Traffic(THREE, net);
  view.add(globe.group, traffic.group);
  globe.setMorph(st.morph);
  traffic.setMorph(st.morph);
  lastLineMorph = st.morph;
  setMorphTarget(st.morphTarget);

  // Filters.
  const alSel = $('f-airline');
  for (const al of Object.values(net.airlines).sort((a, b) => a.name.localeCompare(b.name))) alSel.add(new Option(`${al.name} (${al.code})`, al.code));
  const mkSel = $('f-maker');
  for (const mk of Object.keys(MAKERS)) mkSel.add(new Option(mk, mk));
  if (params.get('airline')) { alSel.value = params.get('airline').toUpperCase(); }
  if (params.get('q')) $('f-search').value = params.get('q');
  applyFilter();
  if (params.get('color') === 'maker') setColorBy('maker');

  // Deep links: ?flight=BA%20117 (or BA117), or ?type=A388 for an airborne flight of that type.
  const want = params.get('flight')?.replace(/\s+/g, '').toUpperCase();
  const wantType = params.get('type')?.toUpperCase();
  if (want) {
    const f = net.flights.find((x) => net.number(x).replace(/\s+/g, '') === want);
    if (f) select(f);
  } else if (wantType) {
    const f = net.flights.find((x) => x.route.type === wantType && net.airborne(x) && x.p > 0.1 && x.p < 0.9);
    if (f) select(f);
  } else if (st.tour) { startTour(); select(randomFlight(), { follow: st.morphTarget === 0 }); }
  console.info(`[flights] ${net.flights.length} flights on ${net.routes.length} routes, ${net.airportList.length} airports`);

  if (!params.has('mono')) {
    try { wall = await createInline3D({ lazy: false }); } catch (e) { console.warn('[flights] inline-3D unavailable', e); }
  }
  if (wall?.supported) {
    sbs = true;
    sizeCanvas();
    cursor = new DepthCursor(THREE, { canvas, hitTest: raycastHitTest(THREE, cursorTargets), raysPerFrame: 3 });
    scene.add(cursor.object);
    handle = wall.addScene(canvas, onXRFrame, {
      virtualDisplayHeight: VIRTUAL_DISPLAY_HEIGHT,
      rectCover: 'auto',
      onLayerLost: () => {
        sbs = false; lastGood = null; havePickCam = false;
        if (cursor) { scene.remove(cursor.object); cursor.dispose(); cursor = null; }
        sizeCanvas(); requestAnimationFrame(onMonoFrame);
        setStatus('3D layer lost: showing 2D', 'warn');
      },
    });
    console.info('[flights] inline-3D session live: addScene registered, waiting for the first woven frame');
    const r = await handle.firstWoven;
    cover.remove();
    console.info(`[flights] firstWoven woven=${r.woven} confirmed=${r.confirmed} reason=${r.reason} ms=${Math.round(r.ms)}`);
    setStatus(r.woven ? 'Glasses-free 3D on (DisplayXR). Move your head to look around the globe.' : '3D window not woven: ' + r.reason, r.woven ? 'ok' : 'warn');
    setInterval(() => {
      const s = handle.stats?.();
      if (s) console.info(`[flights] frames=${s.frames} monoFrames=${s.monoFrames} wovenState=${handle.wovenState ?? 'n/a'} buffer=${canvas.width}x${canvas.height}`);
    }, 5000);
  } else {
    console.info('[flights] no inline-3D session: rendering 2D');
    cover.remove();
    setStatus('2D preview. Open this page in the DisplayXR Browser on a 3D display for glasses-free depth.', '');
    requestAnimationFrame(onMonoFrame);
  }
  // For automated checks: where a flight is on screen (client px), or null if hidden.
  const screenOf = (f) => {
    const cam = camera();
    if (!cam || !traffic.positionOf(f, _p)) return null;
    view.updateMatrixWorld(true);
    _c.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(_inv.copy(view.matrixWorld).invert());
    if (st.morph < 0.5 && behindGlobe(_c, _p)) return null;
    _w.copy(_p).applyMatrix4(view.matrixWorld).project(cam);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (_w.x + 1) / 2 * r.width, y: r.top + (1 - _w.y) / 2 * r.height };
  };
  window.flights = { net, traffic, st, select, pick, screenOf };
}
boot().catch((e) => { console.error(e); setStatus('Could not start: ' + (e?.message || e), 'warn'); cover.textContent = 'Could not load the map.'; });
