// Map space: where a point at (lat, lon) and a height above the surface sits, on the globe or on
// the flat map, or anywhere in between while the view morphs (m = 0 globe, m = 1 flat).
//
// Units are metres in the 3D window (it is 0.12 m tall). The globe faces the viewer at lon 0:
// x = east, y = north, z = toward the viewer.

export const R = 0.046;          // globe radius
export const FLAT_W = 0.16;      // flat map width (lon -180..180)
export const FLAT_H = FLAT_W / 2;
export const FLAT_LIFT = 1.1;    // flat-map arc heights, relative to the globe's

const D2R = Math.PI / 180;

export function unitFromLatLon(lat, lon, out = [0, 0, 0]) {
  const la = lat * D2R, lo = lon * D2R, c = Math.cos(la);
  out[0] = c * Math.sin(lo); out[1] = Math.sin(la); out[2] = c * Math.cos(lo);
  return out;
}

export function latLonFromUnit(x, y, z) {
  return [Math.asin(Math.max(-1, Math.min(1, y))) / D2R, Math.atan2(x, z) / D2R];
}

/** Map-space position of unit vector u at height h (fraction of R), morph m, into out (Vector3). */
export function place(out, ux, uy, uz, h, m) {
  const r = R * (1 + h);
  const gx = ux * r, gy = uy * r, gz = uz * r;
  if (m <= 0) return out.set(gx, gy, gz);
  const [lat, lon] = latLonFromUnit(ux, uy, uz);
  const fx = (lon / 180) * FLAT_W / 2, fy = (lat / 90) * FLAT_H / 2, fz = h * R * FLAT_LIFT;
  return out.set(gx + (fx - gx) * m, gy + (fy - gy) * m, gz + (fz - gz) * m);
}

/** Great-circle point at t in [0, 1] between unit vectors a and b (omega = angle between them). */
export function slerp(a, b, omega, t, out = [0, 0, 0]) {
  if (omega < 1e-6) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; }
  const s = Math.sin(omega), wa = Math.sin((1 - t) * omega) / s, wb = Math.sin(t * omega) / s;
  out[0] = a[0] * wa + b[0] * wb; out[1] = a[1] * wa + b[1] * wb; out[2] = a[2] * wa + b[2] * wb;
  return out;
}

/** Great-circle distance in km between two unit vectors. */
export const EARTH_KM = 6371;
export function angleBetween(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

/** Initial bearing in degrees (0 = north, clockwise) from (lat1, lon1) to (lat2, lon2). */
export function bearing(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / D2R + 360) % 360;
}
