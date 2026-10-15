// A procedural 3D model of an aircraft type, built from its real proportions (length, wingspan,
// fuselage diameter) and layout (engine count and mount, T-tail, high wing, propellers, upper
// deck), painted in the airline's colour. Every model uses the same metres-to-scene scale, so an
// A380 really is bigger than an ATR 72 when you click between them.

export const MODEL_SCALE = 0.00062;   // scene metres per real metre (a 72 m A380 is about 4.5 cm)

export function buildAircraft(THREE, ac, liveryHex) {
  const s = MODEL_SCALE, sh = ac.shape;
  const L = ac.length * s, span = ac.span * s, D = sh.body * s, rad = D / 2;
  const group = new THREE.Group();
  const livery = new THREE.Color(liveryHex);
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.38, metalness: 0.1, side: THREE.DoubleSide });
  const paint = new THREE.MeshStandardMaterial({ color: livery, roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide });
  const grey = new THREE.MeshStandardMaterial({ color: 0xa9b2c0, roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1424, roughness: 0.1, metalness: 0.6, side: THREE.DoubleSide });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); group.add(m); return m; };

  // ---- fuselage: a lathe profile along z (nose at +L/2) ----
  const prof = [];
  const nose = Math.min(L * 0.12, D * 1.7), tailLen = Math.min(L * 0.26, D * 3.2);
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const z = -L / 2 + (L * i) / N;        // tail -> nose
    const fromNose = L / 2 - z, fromTail = z + L / 2;
    let r = rad;
    if (fromNose < nose) r = rad * Math.sqrt(Math.max(0, 1 - ((nose - fromNose) / nose) ** 2));
    else if (fromTail < tailLen) r = rad * (0.18 + 0.82 * Math.pow(fromTail / tailLen, 0.75));
    prof.push(new THREE.Vector2(Math.max(r, 1e-6), z));
  }
  const body = new THREE.LatheGeometry(prof, 32);
  body.rotateX(Math.PI / 2);   // lathe axis y -> z, nose toward +z
  body.scale(1, sh.deck === 2 ? 1.18 : 1, 1);
  // Tail cone sweeps up: lift vertices near the tail.
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), fromTail = z + L / 2;
    if (fromTail < tailLen) p.setY(i, p.getY(i) + rad * 0.55 * (1 - fromTail / tailLen) ** 1.5);
  }
  body.computeVertexNormals();
  add(body, white);

  // Belly band in the livery colour, and a window line.
  // Theta 0 ends up at the bottom after the rotate, so centre the arc on 0.
  const band = new THREE.CylinderGeometry(rad * 1.012, rad * 1.012, L - nose - tailLen, 32, 1, true, -Math.PI * 0.38, Math.PI * 0.76);
  band.rotateX(Math.PI / 2);
  band.scale(1, sh.deck === 2 ? 1.18 : 1, 1);
  add(band, paint, 0, 0, (tailLen - nose) / 2);
  const winLen = L - nose - tailLen * 0.9;
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(D * 0.02, D * 0.07, winLen), dark, side * rad * 0.985, rad * 0.25, (tailLen - nose) / 2);
    if (sh.deck === 2) add(new THREE.BoxGeometry(D * 0.02, D * 0.07, winLen * 0.95), dark, side * rad * 0.9, rad * 0.78, (tailLen - nose) / 2);
  }
  // Cockpit windows.
  const cock = new THREE.SphereGeometry(rad * 0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3.2);
  const ck = add(cock, glass, 0, rad * (sh.deck === 2 ? 0.95 : 0.45), L / 2 - nose * 0.55);
  ck.rotation.x = 0.9; ck.scale.set(1, 0.6, 1);

  // 747 hump.
  if (sh.hump) {
    const hump = new THREE.SphereGeometry(rad * 0.82, 24, 12);
    hump.scale(1, 0.92, 4.6);
    add(hump, white, 0, rad * 0.6, L / 2 - nose * 0.55 - rad * 3.1);
  }

  // ---- wings ----
  const jet = !sh.prop;
  const sweep = jet ? (ac.mach >= 0.83 ? 0.62 : 0.5) : 0.05;   // tan(sweep angle)
  const rootChord = jet ? Math.max(D * 1.8, L * 0.17) : L * 0.12;
  const tipChord = rootChord * (jet ? 0.24 : 0.55);
  const semi = span / 2 - rad * 0.6;
  const wingZ = jet ? (sh.mount === 'tail' ? -L * 0.05 : L * 0.04) : L * 0.06;
  const wingY = sh.wing === 'high' ? rad * 0.82 : -rad * 0.55;
  const thick = Math.max(D * 0.07, 0.00035);
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(semi, -semi * sweep);
    shape.lineTo(semi, -semi * sweep - tipChord);
    shape.lineTo(0, -rootChord);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    g.rotateX(Math.PI / 2);   // shape y -> z
    g.scale(side, 1, 1);
    g.computeVertexNormals();
    const w = add(g, white, side * rad * 0.6, wingY + thick / 2, wingZ + rootChord / 2);
    w.rotation.z = side * (jet ? 0.08 : 0.01);   // dihedral
    // Winglet on modern jets.
    if (jet && ac.firstFlight >= 1985 && !sh.deck) {
      const wl = new THREE.Shape();
      wl.moveTo(0, 0); wl.lineTo(tipChord * 0.9, 0); wl.lineTo(tipChord * 0.55, tipChord * 0.9); wl.lineTo(tipChord * 0.2, tipChord * 0.9); wl.closePath();
      const wg = new THREE.ExtrudeGeometry(wl, { depth: thick * 0.6, bevelEnabled: false });
      wg.rotateY(-Math.PI / 2);
      add(wg, paint, side * (rad * 0.6 + semi) + thick * 0.3, wingY + thick + semi * Math.sin(0.08), wingZ + rootChord / 2 - semi * sweep - tipChord * 0.95);
    }
  }

  // ---- engines ----
  const engR = jet ? Math.max(D * (sh.engines === 4 ? 0.2 : ac.mtow > 150 ? 0.27 : 0.24), 0.0004) : D * 0.16;
  const engLen = jet ? engR * 3.6 : D * 1.25;
  const nacelle = new THREE.CylinderGeometry(engR, engR * 0.82, engLen, 24, 1, false);
  nacelle.rotateX(Math.PI / 2);
  const intake = new THREE.TorusGeometry(engR * 0.92, engR * 0.12, 8, 24);
  const fan = new THREE.CircleGeometry(engR * 0.85, 24);
  const engines = [];
  if (sh.mount === 'tail') {
    for (const side of [-1, 1]) {
      const z = -L / 2 + tailLen * 1.25;
      engines.push([side * (rad + engR * 1.15), rad * 0.35, z]);
    }
  } else {
    const spots = sh.engines === 4 ? [0.36, 0.66] : [jet ? 0.34 : 0.3];
    for (const side of [-1, 1]) {
      for (const f of spots) {
        const x = side * (rad * 0.6 + semi * f);
        const zLead = wingZ + rootChord / 2 - semi * f * sweep;
        const wy = wingY + semi * f * Math.sin(jet ? 0.08 : 0.01);   // the wing rises with dihedral
        engines.push(jet
          ? [x, wy - thick / 2 - engR * 1.05, zLead + engLen * 0.3]
          : [x, wy - engR * 0.2, zLead + engLen * 0.15]);
      }
    }
  }
  group.userData.props = [];
  {
    for (const [x, y, z] of engines) {
      add(nacelle, white, x, y, z);
      add(intake, paint, x, y, z + engLen / 2);
      add(fan, dark, x, y, z + engLen / 2 - engR * 0.05);
      if (sh.mount !== 'tail' && jet) add(new THREE.BoxGeometry(engR * 0.25, engR * 1.1, engLen * 0.6), grey, x, y + engR * 0.75, z - engLen * 0.1);
      if (sh.prop) {
        const prop = new THREE.Group();
        const bladeGeo = new THREE.BoxGeometry(D * 0.08, D * 1.3, D * 0.02);
        bladeGeo.translate(0, D * 0.65, 0);
        for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(bladeGeo, dark); b.rotation.z = (k / 6) * Math.PI * 2; prop.add(b); }
        const spinner = new THREE.Mesh(new THREE.ConeGeometry(engR * 0.7, engR * 1.4, 16), paint);
        spinner.rotation.x = Math.PI / 2; spinner.position.z = engR * 0.5;
        prop.add(spinner);
        prop.position.set(x, y, z + engLen / 2 + D * 0.02);
        group.add(prop);
        group.userData.props.push(prop);
      }
    }
  }

  // ---- tail: fin and tailplane ----
  const finH = jet ? Math.max(D * 1.65, L * 0.13) : D * 1.9;
  const finRoot = tailLen * 0.95, finTip = finRoot * 0.42;
  // Fin profile: x runs forward from the tail, y up; the leading edge sweeps back.
  const finLead = finRoot - finH * (jet ? 0.75 : 0.45);
  const finTrail = Math.max(-finRoot * 0.15, finLead - finTip);
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(finRoot, 0); finShape.lineTo(finLead, finH); finShape.lineTo(finTrail, finH);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: thick * 1.2, bevelEnabled: false });
  finGeo.rotateY(-Math.PI / 2);   // shape x -> +z, extrusion -> -x
  finGeo.computeVertexNormals();
  const finZ0 = -L / 2 + tailLen * 0.05;
  add(finGeo, paint, thick * 0.6, rad * 0.75, finZ0);
  // Tailplane: at the fin top for a T-tail, on the tail cone otherwise.
  const tpSpan = span * (jet ? 0.34 : 0.3) / 2, tpRoot = tailLen * 0.42;
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(tpSpan, -tpSpan * sweep * 0.9); shape.lineTo(tpSpan, -tpSpan * sweep * 0.9 - tpRoot * 0.45); shape.lineTo(0, -tpRoot); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: thick * 0.8, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.scale(side, 1, 1);
    g.computeVertexNormals();
    if (sh.tail === 'T') add(g, paint, 0, rad * 0.75 + finH, finZ0 + finLead);
    else add(g, white, 0, rad * 0.45, finZ0 + tpRoot + tailLen * 0.08);
  }

  // Landing gear is retracted in flight; a soft shadow disc reads better than wheels at this size.
  group.userData.length = L;
  group.userData.span = span;
  return group;
}
