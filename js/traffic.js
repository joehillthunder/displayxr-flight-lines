// Everything that sits on the map: the route lines, the airports, the aircraft (one instanced
// mesh) and the highlight for the selected flight (its route, end-point rings and labels).

import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { R, place, slerp, latLonFromUnit, unitFromLatLon } from './geo.js';
import { MAKERS } from './data/aircraft.js';

const PLANE_LEN = 0.0021;    // aircraft marker length, metres in the 3D window

/** A small airliner: fuselage, swept wings, tailplane and fin. Nose +z, top +y, span x. */
function planeGeometry(THREE) {
  const L = PLANE_LEN, parts = [];
  const add = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); parts.push(g); };
  // Fuselage: a capsule along z.
  add(new THREE.CapsuleGeometry(L * 0.075, L * 0.82, 3, 8), 0, 0, 0, Math.PI / 2);
  // Wings: a flat swept quad, as a thin box sheared by building it from a shape.
  const wing = new THREE.Shape();
  wing.moveTo(0, L * 0.16); wing.lineTo(L * 0.52, -L * 0.1); wing.lineTo(L * 0.52, -L * 0.2); wing.lineTo(0, -L * 0.12);
  wing.lineTo(-L * 0.52, -L * 0.2); wing.lineTo(-L * 0.52, -L * 0.1); wing.closePath();
  add(new THREE.ExtrudeGeometry(wing, { depth: L * 0.02, bevelEnabled: false }), 0, -L * 0.03, L * 0.02, Math.PI / 2);
  const tail = new THREE.Shape();
  tail.moveTo(0, L * 0.06); tail.lineTo(L * 0.2, -L * 0.06); tail.lineTo(L * 0.2, -L * 0.11); tail.lineTo(0, -L * 0.07);
  tail.lineTo(-L * 0.2, -L * 0.11); tail.lineTo(-L * 0.2, -L * 0.06); tail.closePath();
  add(new THREE.ExtrudeGeometry(tail, { depth: L * 0.015, bevelEnabled: false }), 0, L * 0.01, -L * 0.4, Math.PI / 2);
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.lineTo(L * 0.2, 0); fin.lineTo(L * 0.08, L * 0.2); fin.lineTo(0, L * 0.2); fin.closePath();
  add(new THREE.ExtrudeGeometry(fin, { depth: L * 0.015, bevelEnabled: false }), -L * 0.0075, L * 0.04, -L * 0.52, 0, -Math.PI / 2);
  // Merge into one non-indexed geometry with normals.
  const merged = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of merged) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of merged) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export function textSprite(THREE, lines, { color = '#ffffff', sub = '#9fb4d6', height = 0.0048 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const pad = 14, f1 = 46, f2 = 30;
  g.font = `700 ${f1}px system-ui, Segoe UI, sans-serif`;
  let w = g.measureText(lines[0]).width;
  if (lines[1]) { g.font = `500 ${f2}px system-ui, Segoe UI, sans-serif`; w = Math.max(w, g.measureText(lines[1]).width); }
  c.width = Math.ceil(w + pad * 2); c.height = lines[1] ? f1 + f2 + pad * 2 + 6 : f1 + pad * 2;
  g.fillStyle = 'rgba(4, 10, 24, 0.82)';
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, 14); g.fill();
  g.font = `700 ${f1}px system-ui, Segoe UI, sans-serif`; g.fillStyle = color; g.textBaseline = 'top';
  g.fillText(lines[0], pad, pad);
  if (lines[1]) { g.font = `500 ${f2}px system-ui, Segoe UI, sans-serif`; g.fillStyle = sub; g.fillText(lines[1], pad, pad + f1 + 6); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(height * c.width / c.height, height, 1);
  s.center.set(0.5, -0.35);
  s.renderOrder = 10;
  return s;
}

export class Traffic {
  constructor(THREE, net) {
    this.T = THREE;
    this.net = net;
    this.group = new THREE.Group();
    this.morph = 0;
    this.colorBy = 'airline';
    this.visible = net.flights.map(() => true);
    this.selected = null;
    this.hovered = null;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._up = new THREE.Vector3();
    this._m = new THREE.Matrix4(); this._x = new THREE.Vector3(); this._f = new THREE.Vector3();
    this._s = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this._u = [0, 0, 0]; this._u2 = [0, 0, 0];

    // ---- route lines ----
    this.lineMat = new LineMaterial({
      vertexColors: true, linewidth: 1.3, transparent: true, opacity: 0.26,
      depthWrite: false, blending: THREE.AdditiveBlending, worldUnits: false,
    });
    this.lines = new LineSegments2(new LineSegmentsGeometry(), this.lineMat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 2;
    this.group.add(this.lines);

    // ---- airports ----
    const apGeo = new THREE.SphereGeometry(R * 0.012, 10, 6);
    this.airports = new THREE.InstancedMesh(apGeo, new THREE.MeshBasicMaterial({ color: 0xbfe3ff }), net.airportList.length);
    this.airports.frustumCulled = false;
    this.apUnits = net.airportList.map((a) => unitFromLatLon(a.lat, a.lon));
    this.group.add(this.airports);

    // ---- aircraft ----
    const n = net.flights.length;
    this.planeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.planes = new THREE.InstancedMesh(planeGeometry(THREE), this.planeMat, n);
    this.planes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.planes.frustumCulled = false;
    this.planes.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.3);
    this.planes.renderOrder = 3;
    this.group.add(this.planes);
    this.planePos = new Float32Array(n * 3);   // map-space positions, for picking
    this.applyColors();

    // ---- selection ----
    this.selMat = new LineMaterial({ color: 0xffffff, linewidth: 4, transparent: true, opacity: 0.95, depthWrite: false, worldUnits: false });
    this.selLine = new LineSegments2(new LineSegmentsGeometry(), this.selMat);
    this.selLine.frustumCulled = false; this.selLine.renderOrder = 4; this.selLine.visible = false;
    this.group.add(this.selLine);
    const ringGeo = new THREE.RingGeometry(R * 0.03, R * 0.042, 40);
    this.rings = [0, 1].map(() => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.visible = false; m.renderOrder = 5; this.group.add(m); return m;
    });
    this.halo = new THREE.Mesh(new THREE.RingGeometry(PLANE_LEN * 0.9, PLANE_LEN * 1.1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.halo.visible = false; this.halo.renderOrder = 6;
    this.group.add(this.halo);
    this.labels = [];

    this.rebuildLines();
  }

  colorOf(f) {
    return this.colorBy === 'maker' ? MAKERS[f.route.ac.maker].color : f.route.airline.color;
  }

  applyColors() {
    const c = new this.T.Color();
    for (const f of this.net.flights) this.planes.setColorAt(f.id, c.set(this.colorOf(f)));
    this.planes.instanceColor.needsUpdate = true;
  }

  setColorBy(mode) { this.colorBy = mode; this.applyColors(); this.rebuildLines(); }

  /** Which flights are shown: a predicate on flights. Routes with no shown flight are hidden. */
  setFilter(pred) {
    for (const f of this.net.flights) this.visible[f.id] = pred(f);
    if (this.selected && !this.visible[this.selected.id]) this.select(null);
    this.rebuildLines();
  }

  /** Arc polyline for a route: [[x,y,z], ...] in map space, at the current morph. */
  _arc(route, out, from = 0, to = 1) {
    const segs = Math.max(4, Math.ceil((8 + (route.omega / Math.PI) * 64) * (to - from)));
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = from + (to - from) * (i / segs);
      const u = slerp(route.a, route.b, route.omega, t, this._u);
      place(this._v, u[0], u[1], u[2], route.arc * Math.sin(Math.PI * t), this.morph);
      pts.push([this._v.x, this._v.y, this._v.z, latLonFromUnit(u[0], u[1], u[2])[1]]);
    }
    return pts;
  }

  /** Push a polyline as segments, skipping the jump across the antimeridian on the flat map. */
  _pushSegs(pts, pos, col, color) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (this.morph > 0.5 && Math.abs(a[3] - b[3]) > 180) continue;
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      if (col) col.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }

  rebuildLines() {
    const shown = new Set();
    for (const f of this.net.flights) if (this.visible[f.id]) shown.add(f.route);
    const pos = [], col = [], c = new this.T.Color();
    for (const r of shown) {
      c.set(this.colorBy === 'maker' ? MAKERS[r.ac.maker].color : r.airline.color);
      this._pushSegs(this._arc(r), pos, col, c);
    }
    const g = new LineSegmentsGeometry();
    if (pos.length) { g.setPositions(pos); g.setColors(col); }
    this.lines.geometry.dispose();
    this.lines.geometry = g;
    this.lines.visible = pos.length > 0;
    this.routeCount = shown.size;
    if (this.selected) this._buildSelection();
  }

  setMorph(m) {
    this.morph = m;
    this.rebuildLines();
  }

  // ---- selection ----

  select(f) {
    this.selected = f;
    for (const l of this.labels) { this.group.remove(l); l.material.map.dispose(); l.material.dispose(); }
    this.labels = [];
    if (!f) { this.selLine.visible = false; this.halo.visible = false; for (const r of this.rings) r.visible = false; return; }
    const o = this.net.origin(f), d = this.net.dest(f);
    this.labels = [o, d].map((ap) => textSprite(this.T, [ap.code, ap.city]));
    for (const l of this.labels) this.group.add(l);
    this._buildSelection();
  }

  _buildSelection() {
    const f = this.selected, r = f.route, pos = [];
    this._pushSegs(this._arc(r), pos);
    const g = new LineSegmentsGeometry();
    g.setPositions(pos);
    this.selLine.geometry.dispose();
    this.selLine.geometry = g;
    this.selLine.visible = true;
    this.selMat.color.set(this.colorOf(f)).lerp(new this.T.Color(1, 1, 1), 0.35);
    const ends = [this.net.origin(f), this.net.dest(f)];
    ends.forEach((ap, i) => {
      const u = unitFromLatLon(ap.lat, ap.lon);
      place(this._v, u[0], u[1], u[2], 0.004, this.morph);
      const ring = this.rings[i];
      ring.visible = true;
      ring.position.copy(this._v);
      this._up.set(u[0], u[1], u[2]).lerp(this._w.set(0, 0, 1), this.morph).normalize();
      ring.quaternion.setFromUnitVectors(this._w.set(0, 0, 1), this._up);
      ring.material.color.set(i ? '#ffffff' : this.colorOf(f));
      place(this._v, u[0], u[1], u[2], 0.03, this.morph);
      this.labels[i].position.copy(this._v);
    });
    this.halo.visible = true;
  }

  // ---- per frame ----

  update(time) {
    const net = this.net, m = this.morph, mat = this._m;
    // Airports: dots on the surface.
    this.apUnits.forEach((u, i) => {
      place(this._v, u[0], u[1], u[2], 0.002, m);
      mat.makeTranslation(this._v.x, this._v.y, this._v.z);
      this.airports.setMatrixAt(i, mat);
    });
    this.airports.instanceMatrix.needsUpdate = true;

    for (const f of net.flights) {
      const i = f.id, r = f.route;
      if (!this.visible[i] || !net.airborne(f)) {
        mat.makeScale(0, 0, 0);
        this.planes.setMatrixAt(i, mat);
        this.planePos[i * 3] = NaN;
        continue;
      }
      const t = net.t(f);
      const t2 = Math.min(1, Math.max(0, t + 0.004 * f.dir));
      const u = slerp(r.a, r.b, r.omega, t, this._u);
      const u2 = slerp(r.a, r.b, r.omega, t2, this._u2);
      place(this._v, u[0], u[1], u[2], r.arc * Math.sin(Math.PI * t), m);
      place(this._w, u2[0], u2[1], u2[2], r.arc * Math.sin(Math.PI * t2), m);
      // Basis: nose along the path, top away from the surface.
      const fwd = this._f.subVectors(this._w, this._v);
      if (fwd.lengthSq() < 1e-14) fwd.set(0, 0, 1);
      if (Math.abs(this._w.x - this._v.x) > 0.05) fwd.set(Math.sign(this._v.x) * -1, 0, 0);  // wrapping on the flat map
      fwd.normalize();
      this._up.set(u[0], u[1], u[2]).lerp(this._x.set(0, 0, 1), m).normalize();
      const right = this._x.crossVectors(this._up, fwd).normalize();
      const up = this._up.crossVectors(fwd, right);
      const k = f === this.selected ? 1.9 : f === this.hovered ? 1.45 : 1;
      mat.makeBasis(right.multiplyScalar(k), up.multiplyScalar(k), fwd.multiplyScalar(k)).setPosition(this._v);
      this.planes.setMatrixAt(i, mat);
      this.planePos[i * 3] = this._v.x; this.planePos[i * 3 + 1] = this._v.y; this.planePos[i * 3 + 2] = this._v.z;
      if (f === this.selected) {
        this.halo.position.copy(this._v);
        this.halo.quaternion.setFromRotationMatrix(mat.makeBasis(right.normalize(), fwd.normalize(), up.normalize()));
        this.halo.scale.setScalar(1.6 + 0.35 * Math.sin(time * 4));
      }
    }
    this.planes.instanceMatrix.needsUpdate = true;
    if (this.selected && !net.airborne(this.selected)) this.halo.visible = false;
    else if (this.selected) this.halo.visible = true;
  }

  /** Map-space position of a flight (or null when it isn't drawn). */
  positionOf(f, out) {
    const i = f.id * 3;
    if (Number.isNaN(this.planePos[i])) return null;
    return out.set(this.planePos[i], this.planePos[i + 1], this.planePos[i + 2]);
  }

  /** Per eye: fat lines size their width in the viewport they draw into. */
  setViewport(w, h) {
    this.lineMat.resolution.set(w, h);
    this.selMat.resolution.set(w, h);
  }
}
