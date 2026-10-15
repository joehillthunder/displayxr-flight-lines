# 3D Flight Lines

The world's airline network on a 3D globe, built for glasses-free 3D displays with
[DisplayXR inline-3D](https://www.npmjs.com/package/@displayxr/inline3d) and three.js.

**Live:** https://joehillthunder.github.io/displayxr-flight-lines/

- About 1,350 real routes flown by 64 airlines, with about 2,400 aircraft moving along great-circle arcs.
- Click any airplane to see its flight, airline and route, live (simulated) altitude, speed and heading, and the
  aircraft's maker and specs: first flight, engines, length, wingspan, MTOW, range, cruise speed and seats.
- The selected aircraft type floats in front of the screen as a 3D model built from its real proportions
  (engine count and mount, T-tail, high wing, propellers, upper deck). Every model uses the same scale, so an A380
  really is bigger than an ATR 72.
- Globe or flat map (they morph into each other), airline or maker colours, filters by airline, maker or search,
  a tour mode, and a time-warp speed slider.

The traffic is **simulated**. The airlines, routes and aircraft types are real, but the positions are generated:
this is not live ADS-B tracking. Specs are the makers' typical published figures for the variant named.

## Running it

It's static ES modules with no build step. Serve the folder over HTTP and open `index.html`. In the DisplayXR
Browser on a 3D display it renders woven stereo; anywhere else it shows a 2D preview.

| URL parameter | Effect |
| --- | --- |
| `?tour` | Start the tour (hops to a random flight every 11 s) |
| `?flat` | Start on the flat map |
| `?flight=BA%2026` | Open with that flight selected |
| `?type=A388` | Open with a flight of that aircraft type selected (codes in `js/data/aircraft.js`) |
| `?airline=EK` | Show one airline |
| `?q=dreamliner` | Pre-fill the search |
| `?color=maker` | Colour aircraft by maker |
| `?speed=600` | Time warp (sim seconds per second) |
| `?mono` | Force the 2D renderer |

Keys: <kbd>M</kbd> globe/flat, <kbd>T</kbd> tour, <kbd>R</kbd> random flight, <kbd>Space</kbd> pause,
<kbd>F</kbd> full view, <kbd>Esc</kbd> deselect.

## Layout

| File | What it does |
| --- | --- |
| `js/data/aircraft.js` | Aircraft types, makers and spec figures, plus the shape used for the 3D model |
| `js/data/airlines.js` | Airlines, colours, fleets and routes (hub → destinations) |
| `js/data/airports.js` | Airports (IATA code, city, name, lat/lon) |
| `js/network.js` | Builds routes, assigns each one a type its range allows, simulates the flights |
| `js/globe.js` | Globe/flat-map mesh, map texture painted from Natural Earth, atmosphere |
| `js/traffic.js` | Route lines, airports, the instanced aircraft, selection highlight |
| `js/aircraft-model.js` | Procedural 3D aircraft from real proportions |
| `js/main.js` | Renderer, DisplayXR session, input, picking, info panel |

To add a route, add the destination to the airline's hub list in `airlines.js`. The airport must be in
`airports.js`, and a type in the airline's fleet must have the range for it; otherwise the route is skipped and
listed in the console.

Map data: [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public domain; ISC licence in `data/`).
