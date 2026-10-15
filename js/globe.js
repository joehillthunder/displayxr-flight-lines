// The map surface: one grid mesh that is a globe at morph 0 and a flat world map at morph 1,
// textured with countries painted from world-atlas (Natural Earth 1:50m), plus an atmosphere
// rim on the globe and invisible pick proxies for the depth cursor.

import { R, FLAT_W, FLAT_H } from './geo.js';
import { countries, allArcs } from './topo.js';

const TEX_W = 4096, TEX_H = 2048;

function paintMap(topo) {
  const c = document.createElement('canvas');
  c.width = TEX_W; c.height = TEX_H;
  const g = c.getContext('2d');
  const X = (lon) => ((lon + 180) / 360) * TEX_W;
  const Y = (lat) => ((90 - lat) / 180) * TEX_H;

  // Ocean: deep blue, a little lighter toward the equator.
  const ocean = g.createLinearGradient(0, 0, 0, TEX_H);
  ocean.addColorStop(0, '#040a17'); ocean.addColorStop(0.5, '#0a1a33'); ocean.addColorStop(1, '#040a17');
  g.fillStyle = ocean; g.fillRect(0, 0, TEX_W, TEX_H);

  // Graticule every 15 degrees.
  g.strokeStyle = 'rgba(90, 140, 210, 0.16)'; g.lineWidth = 2;
  g.beginPath();
  for (let lon = -180; lon <= 180; lon += 15) { g.moveTo(X(lon), 0); g.lineTo(X(lon), TEX_H); }
  for (let lat = -75; lat <= 75; lat += 15) { g.moveTo(0, Y(lat)); g.lineTo(TEX_W, Y(lat)); }
  g.stroke();
  g.strokeStyle = 'rgba(120, 170, 240, 0.28)';
  g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(TEX_W, Y(0)); g.stroke();

  // Land.
  const land = new Path2D();
  for (const ctry of countries(topo)) {
    for (const poly of ctry.polygons) {
      for (const ring of poly) {
        ring.forEach(([lon, lat], i) => (i ? land.lineTo(X(lon), Y(lat)) : land.moveTo(X(lon), Y(lat))));
        land.closePath();
      }
    }
  }
  // Soft coastal glow under the land fill.
  g.save();
  g.shadowColor = 'rgba(70, 160, 255, 0.55)'; g.shadowBlur = 14;
  g.fillStyle = '#16304d'; g.fill(land, 'evenodd');
  g.restore();
  const landFill = g.createLinearGradient(0, 0, 0, TEX_H);
  landFill.addColorStop(0, '#2a4466'); landFill.addColorStop(0.5, '#1d3a5a'); landFill.addColorStop(1, '#2a4466');
  g.fillStyle = landFill; g.fill(land, 'evenodd');

  // Borders and coasts: every arc once.
  g.strokeStyle = 'rgba(140, 195, 255, 0.55)'; g.lineWidth = 1.6; g.lineJoin = 'round';
  g.beginPath();
  for (const arc of allArcs(topo)) {
    arc.forEach(([lon, lat], i) => {
      // Don't draw the straight closing edges along the antimeridian and the poles.
      const prev = arc[i - 1];
      if (!i || Math.abs(lon - prev[0]) > 170 || (Math.abs(lat) > 89.9 && Math.abs(prev[1]) > 89.9)) g.moveTo(X(lon), Y(lat));
      else g.lineTo(X(lon), Y(lat));
    });
  }
  g.stroke();
  return c;
}

const vert = /* glsl */`
  attribute vec3 flatPos;
  uniform float morph;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vUv = uv;
    vec3 p = mix(position, flatPos, morph);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Limb darkening on the globe: how directly the surface faces the eye.
    vec3 n = normalize(normalMatrix * normalize(position));
    float ndv = max(0.0, dot(n, normalize(-mv.xyz)));
    vShade = mix(0.35 + 0.65 * pow(ndv, 0.6), 1.0, morph);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */`
  uniform sampler2D map;
  uniform float brightness;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vec3 c = texture2D(map, vUv).rgb * vShade * brightness;
    gl_FragColor = vec4(c, 1.0);
  }`;

const atmoVert = /* glsl */`
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const atmoFrag = /* glsl */`
  uniform float strength;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    // Back faces of the shell: 0 at its outer edge, about 0.42 where it meets the globe's limb.
    float d = -dot(vN, vV);
    float rim = pow(clamp(d / 0.42, 0.0, 1.0), 1.8);
    float a = rim * strength;
    gl_FragColor = vec4(vec3(0.25, 0.6, 1.0) * a, a);
  }`;

export class Globe {
  constructor(THREE, topo, { lonSeg = 160, latSeg = 80 } = {}) {
    this.T = THREE;
    this.group = new THREE.Group();

    const tex = new THREE.CanvasTexture(paintMap(topo));
    tex.anisotropy = 8;
    tex.colorSpace = THREE.NoColorSpace;   // shader writes texture values straight out (sRGB in, sRGB out)
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;

    // Grid: (lonSeg + 1) x (latSeg + 1) vertices, with a duplicated seam so u runs 0..1.
    const pos = [], flat = [], uv = [], idx = [];
    for (let j = 0; j <= latSeg; j++) {
      const v = j / latSeg, lat = 90 - v * 180, la = lat * Math.PI / 180;
      for (let i = 0; i <= lonSeg; i++) {
        const u = i / lonSeg, lon = -180 + u * 360, lo = lon * Math.PI / 180;
        pos.push(R * Math.cos(la) * Math.sin(lo), R * Math.sin(la), R * Math.cos(la) * Math.cos(lo));
        flat.push((lon / 180) * FLAT_W / 2, (lat / 90) * FLAT_H / 2, 0);
        uv.push(u, 1 - v);
      }
    }
    const row = lonSeg + 1;
    for (let j = 0; j < latSeg; j++) {
      for (let i = 0; i < lonSeg; i++) {
        const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('flatPos', new THREE.Float32BufferAttribute(flat, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // Bounds that hold both shapes, so the mesh is never culled mid-morph.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.max(R, FLAT_W / 2) * 1.05);

    this.uniforms = { map: { value: tex }, morph: { value: 0 }, brightness: { value: 1 } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide,
    }));
    this.mesh.renderOrder = 0;
    this.group.add(this.mesh);

    // Atmosphere: a slightly larger back-facing shell with a rim glow. Globe only.
    this.atmoUniforms = { strength: { value: 0.9 } };
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.1, 96, 48),
      new THREE.ShaderMaterial({
        uniforms: this.atmoUniforms, vertexShader: atmoVert, fragmentShader: atmoFrag,
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.group.add(this.atmo);

    // Pick proxies (never drawn): the depth cursor and pointer rays hit these.
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    this.proxySphere = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), hidden);
    this.proxyFlat = new THREE.Mesh(new THREE.PlaneGeometry(FLAT_W, FLAT_H), hidden);
    this.group.add(this.proxySphere, this.proxyFlat);
    this.morph = 0;
  }

  setMorph(m) {
    this.morph = m;
    this.uniforms.morph.value = m;
    this.atmo.visible = m < 0.98;
    this.atmoUniforms.strength.value = 0.9 * (1 - m) ** 2;
    this.atmo.scale.setScalar(1 - 0.3 * m);
  }

  /** The proxy that matches the current shape, for the depth cursor and picking. */
  get pickProxy() { return this.morph < 0.5 ? this.proxySphere : this.proxyFlat; }
}
