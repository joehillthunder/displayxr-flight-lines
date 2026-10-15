// The route network and the simulated traffic on it.
//
// Routes, airlines and aircraft types are real; the flights are simulated. Each route gets an
// aircraft type from its airline's fleet that has the range for it, and one to three aircraft
// fly it back and forth along the great circle with a climb, cruise and descent profile.

import { AIRPORTS } from './data/airports.js';
import { AIRLINES } from './data/airlines.js';
import { AIRCRAFT } from './data/aircraft.js';
import { unitFromLatLon, angleBetween, slerp, latLonFromUnit, bearing, EARTH_KM } from './geo.js';

// Small seeded RNG so the same routes get the same aircraft and flight numbers every visit.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUND_HOURS = 1.2;   // turnaround on the ground before the return leg

function pickType(fleet, km, rnd) {
  const fits = fleet.filter((c) => AIRCRAFT[c].rangeKm >= km * 1.08);
  if (!fits.length) {
    const longest = fleet.reduce((a, c) => (AIRCRAFT[c].rangeKm > AIRCRAFT[a].rangeKm ? c : a));
    return AIRCRAFT[longest].rangeKm * 1.1 >= km ? longest : null;
  }
  // Prefer the type whose range is about twice the trip (short hops get regional aircraft,
  // long-haul gets wide-bodies), with some spread so a hub's routes are not all one type.
  const scored = fits.map((c) => ({ c, s: Math.abs(Math.log(AIRCRAFT[c].rangeKm / (km * 2 + 1200))) + rnd() * 0.6 }));
  scored.sort((a, b) => a.s - b.s);
  return scored[0].c;
}

export class Network {
  constructor(seed = 20261014) {
    const rnd = mulberry32(seed);
    this.airlines = Object.fromEntries(AIRLINES.map((a) => [a.code, a]));
    this.airports = AIRPORTS;
    this.routes = [];
    this.flights = [];
    this.skipped = [];
    const usedAirports = new Set();

    for (const al of AIRLINES) {
      let num = 2 + Math.floor(rnd() * 40) * 2;
      for (const [hub, list] of Object.entries(al.routes)) {
        for (const dest of list.split(/\s+/).filter(Boolean)) {
          const A = AIRPORTS[hub], B = AIRPORTS[dest];
          if (!A || !B) { this.skipped.push(`${al.code} ${hub}-${dest}: unknown airport`); continue; }
          const a = unitFromLatLon(A.lat, A.lon), b = unitFromLatLon(B.lat, B.lon);
          const omega = angleBetween(a, b), km = omega * EARTH_KM;
          const type = pickType(al.fleet, km, rnd);
          if (!type) { this.skipped.push(`${al.code} ${hub}-${dest}: ${Math.round(km)} km is beyond the fleet's range`); continue; }
          usedAirports.add(hub); usedAirports.add(dest);
          const ac = AIRCRAFT[type];
          const route = {
            id: this.routes.length, airline: al, from: A, to: B, a, b, omega, km, type, ac,
            // Visual arc height (fraction of the globe radius): longer routes arc higher.
            arc: 0.018 + 0.15 * Math.pow(omega / Math.PI, 0.8),
            hours: km / ac.cruiseKmh + 0.45,
            cruiseFt: ac.shape.prop ? 23000 + Math.round(rnd() * 3) * 1000 : (km < 1200 ? 31000 : 35000) + Math.round(rnd() * 4) * 1000,
          };
          this.routes.push(route);
          const n = km < 2500 ? 2 + (rnd() < 0.4 ? 1 : 0) : km < 7000 ? 1 + (rnd() < 0.7 ? 1 : 0) : 1 + (rnd() < 0.45 ? 1 : 0);
          for (let k = 0; k < n; k++) {
            num += 2 + Math.floor(rnd() * 6) * 2;
            const dir = k % 2 === 0 ? (rnd() < 0.5 ? 1 : -1) : -this.flights[this.flights.length - 1].dir;
            this.flights.push({
              id: this.flights.length, route, dir,
              base: (num % 1000) || 1,           // outbound number; the return leg is base + 1
              p: rnd() * 0.96,                    // progress along the leg
              ground: 0,                          // hours left on the ground
              wind: (rnd() - 0.5) * 60,           // km/h, so ground speeds differ a little
              legs: 0,
            });
          }
        }
      }
    }
    this.airportList = [...usedAirports].map((c) => AIRPORTS[c]);
  }

  /** Advance the simulation by `h` simulated hours. */
  step(h) {
    for (const f of this.flights) {
      if (f.ground > 0) {
        f.ground -= h;
        if (f.ground <= 0) { f.ground = 0; f.p = 0; }
        continue;
      }
      f.p += h / f.route.hours;
      if (f.p >= 1) { f.p = 1; f.dir = -f.dir; f.ground = GROUND_HOURS * (0.6 + 0.8 * ((f.id * 7919) % 100) / 100); f.legs++; }
    }
  }

  // ---- per-flight read-outs ----

  /** Flight number: outbound legs (away from the listed hub) even, return legs odd. */
  number(f) { return `${f.route.airline.code} ${f.dir > 0 ? f.base : f.base + 1}`; }
  origin(f) { return f.dir > 0 ? f.route.from : f.route.to; }
  dest(f) { return f.dir > 0 ? f.route.to : f.route.from; }
  /** Parameter along the route's stored direction (from -> to). */
  t(f) { return f.dir > 0 ? f.p : 1 - f.p; }
  airborne(f) { return f.ground <= 0 && f.p > 0 && f.p < 1; }

  /** Altitude fraction of cruise: climb, cruise, descend. */
  altFrac(f) {
    const km = f.route.km;
    const climb = Math.min(0.35, 220 / km), desc = Math.min(0.4, 300 / km);
    const x = Math.min(1, f.p / climb, (1 - f.p) / desc);
    return x * x * (3 - 2 * x);
  }

  live(f) {
    const r = f.route, alt = this.altFrac(f);
    const u = slerp(r.a, r.b, r.omega, this.t(f));
    const u2 = slerp(r.a, r.b, r.omega, Math.min(1, Math.max(0, this.t(f) + 0.002 * f.dir)));
    const [lat, lon] = latLonFromUnit(u[0], u[1], u[2]);
    const [lat2, lon2] = latLonFromUnit(u2[0], u2[1], u2[2]);
    const gsKmh = Math.max(0, r.ac.cruiseKmh * (0.42 + 0.58 * alt) + f.wind * alt);
    return {
      lat, lon,
      heading: bearing(lat, lon, lat2, lon2),
      altFt: Math.round((r.cruiseFt * alt) / 100) * 100,
      gsKmh,
      gsKt: gsKmh / 1.852,
      flownKm: f.p * r.km,
      leftKm: (1 - f.p) * r.km,
      leftH: (1 - f.p) * r.hours,
      phase: f.ground > 0 ? 'On the ground' : f.p < Math.min(0.35, 220 / r.km) * 0.98 ? 'Climbing' : f.p > 1 - Math.min(0.4, 300 / r.km) ? 'Descending' : 'Cruising',
    };
  }
}
