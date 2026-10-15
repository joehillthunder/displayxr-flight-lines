// Minimal TopoJSON decoding: just enough to turn world-atlas's countries into rings of
// [lon, lat] points, plus every arc once (for borders and coastlines without double drawing).

function decodeArcs(topo) {
  const t = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return t ? [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]] : [x, y];
    });
  });
}

/** Countries as polygons: [{ name, polygons: [[ring, ...holes], ...] }], rings of [lon, lat]. */
export function countries(topo, objectName = 'countries') {
  const arcs = decodeArcs(topo);
  const arc = (i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
  const ring = (ids) => {
    const out = [];
    for (const id of ids) {
      const pts = arc(id);
      out.push(...(out.length ? pts.slice(1) : pts));
    }
    return out;
  };
  return topo.objects[objectName].geometries.map((g) => {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    return { name: g.properties?.name || '', polygons: polys.map((p) => p.map(ring)) };
  });
}

/** Every arc once, as polylines of [lon, lat]: shared borders and coastlines together. */
export function allArcs(topo) {
  return decodeArcs(topo);
}
