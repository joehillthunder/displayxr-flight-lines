# CLAUDE.md

The world's airline network on a 3D globe for Leia glasses-free 3D displays, built on the DisplayXR
inline-3D web SDK. Click an airplane to see its flight, its airline, and the aircraft's maker and
specs, plus a to-scale 3D model of the type. It's a static site with no build step, served by GitHub
Pages from the `main` branch root (legacy build, `.nojekyll`). It's live at
https://joehillthunder.github.io/displayxr-flight-lines/ and it's a room in the Media & UI Lab wing
of the HQ homepage (`home/demos.js`, id `flight-lines`, in `joehillthunder/joehillthunder.github.io`).

## Layout

- `index.html`: the page, all CSS, and the import map. three 0.161.0 and `@displayxr/inline3d`
  1.45.1 are pinned on jsDelivr. Keep versions pinned.
- `js/main.js`: app shell. One renderer on one persistent `<canvas>`, the inline-3D session
  (`createInline3D` + `addScene`), the per-eye render loop, the view state (`st`), pointer input,
  picking, the info panel, filters, tour and deep links.
- `js/network.js`: `Network` builds the routes from the data files, gives each route an aircraft
  type from the airline's fleet that has the range for it, and simulates the flights (seeded RNG,
  great-circle legs, climb/cruise/descent, ground turnaround). `live(f)` returns the read-outs.
- `js/geo.js`: map space. `place()` puts a unit vector at a height on the globe (morph 0) or the
  flat map (morph 1) or anywhere in between. Also `slerp`, `bearing`, and the constants `R`, `FLAT_W`.
- `js/globe.js`: the morphing globe/flat mesh (custom shader with a `flatPos` attribute), the map
  texture painted onto a 4096×2048 canvas from `data/countries-50m.json`, the atmosphere rim, and
  invisible pick proxies (sphere and plane) for the depth cursor.
- `js/topo.js`: minimal TopoJSON decoding (no dependency).
- `js/traffic.js`: the route lines (`LineSegments2` fat lines), the airport dots, the aircraft
  (one `InstancedMesh`), and the selection highlight (route, end rings, labels, halo).
  `textSprite()` makes the label sprites.
- `js/aircraft-model.js`: `buildAircraft(THREE, ac, color)` builds a procedural model from
  `ac.shape` and the real length and span. `MODEL_SCALE` is shared, so every type is to scale with
  every other.
- `js/data/aircraft.js`: `AIRCRAFT` (keyed by ICAO-style type code) and `MAKERS`.
  `js/data/airlines.js`: `AIRLINES`, each with a colour, a fleet, and routes as `{ HUB: 'DEST DEST …' }`.
  `js/data/airports.js`: `AIRPORTS` (IATA code, city, name, country, lat, lon).

## Data rules

- **Traffic is simulated; say so.** Airlines, routes and types are real, but positions are
  generated. The footer and README say this; keep it that way, and never call it live tracking.
- Spec figures are the makers' typical published numbers for the named variant. If you change one,
  use a published source, not a guess.
- To add a route, add the destination to the airline's hub list. The airport must exist in
  `airports.js`, and some type in the fleet must reach it (`rangeKm >= km × 1.08`, or the longest
  type up to ×1.1). Otherwise `Network` skips it and logs `[flights] skipped routes:` to the console.
  Check that list after any data change.
- A new aircraft type needs a `shape` (`body`, `engines`, `mount`, `tail`, `wing`, and optionally
  `prop`, `deck`, `hump`) and a `MAKERS` entry for its maker. Look at it in the showcase with `?type=CODE`.
- Airline colours are brand-ish but lightened so they read on a black panel.
- Flight numbers come from the seeded RNG: outbound legs (from the listed hub) are even, return
  legs odd. A flight's number changes when it turns around, so `?flight=` matches at load time only.

## DisplayXR rules (don't break these)

- Keep one inline-3D session and one canvas for the life of the page; never remount it.
- No CSS `filter`, `opacity`, `border-radius`, `box-shadow` or `backdrop-filter` on the canvas or on
  anything over or around it. Overlays (`#hover`, `#clock`, the full-view `#info`) use a plain `rgba`
  tint and carry `data-inline3d-overlay`.
- Cover the canvas until `handle.firstWoven`, and remove the cover with a hard cut.
- Validate views before clearing, and replay the last good frame.
- Clamp the side-by-side buffer to the GPU limits and the panel width.
- **Units are metres** on a 0.12 m virtual display. z = 0 is the glass and +z comes toward the viewer.
- **Move content, never the eyes.** Drag, zoom, follow and the globe/flat morph all transform `view`.
  The depth slider scales `root.scale.z`.
- `view.position.z` keeps the globe's front surface just in front of the glass at any zoom. The
  showcase model sits about 1.6 cm out of the glass, to the right. Keep pop-out modest and away
  from the window edges.
- Fat lines size their width per eye: `traffic.setViewport(vp.width, vp.height)` runs in `drawEye`.
- Picking uses one camera at the midpoint between the eyes (`pickCam`), never an eye camera, and
  skips aircraft hidden behind the globe (`behindGlobe`).

## Gotchas found the hard way

- **This checkout uses CRLF line endings.** Multi-line `perl -0pi` and `sed` patterns with `\n`
  silently fail to match. Use the Edit tool, or match `\r?\n`.
- **The `gh` token has no `workflow` scope**, so Pages is served from the `main` root, not Actions.
- **In 2D the mono camera follows the mouse (parallax).** A synthetic click right after a mouse
  move can land a few pixels off, so wait for the parallax to settle in tests.
- In `Traffic`, `setMorph()` always rebuilds the lines. `main.js` rebuilds only on morph steps
  above 0.04 and sets `traffic.morph` directly in between.
- On the flat map, segments that jump across the antimeridian are skipped, not drawn across the map.

## Testing

There's no python on the demo PC. A portable Node sometimes sits in an old session scratchpad; it
can import `js/network.js` directly to check route counts, skipped routes and flight numbers.

- **Serve:** a PowerShell `HttpListener` script. Wrap the request loop in try/catch, or a dropped
  connection kills it. Ports 8765 (Muse bridge), 8791 (Battle School) and 8833 are often taken;
  check first.
- **Headless smoke test:** `chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader
  --user-data-dir=<fresh> --virtual-time-budget=9000 --enable-logging=stderr --v=0
  --screenshot=out.png "http://localhost:PORT/?mono&tour"`, then grep `CONSOLE` for errors. You
  should see `[flights] N flights on M routes`.
- **Clicks:** run headless with `--remote-debugging-port`, then use `window.flights` (`net`,
  `traffic`, `st`, `select`, `pick`, `screenOf`) to find a plane's screen position and dispatch
  real mouse events. **Other sessions run Chrome on debugging ports too (9344 was a different
  app).** Check that `localhost:<port>/json` is free and only attach to your own tab. Don't eval
  `location.reload()` over CDP; it hangs the socket.
- **On the 3D panel:** `"C:\Program Files\DisplayXR\Browser\chrome.exe" --user-data-dir=<scratch>
  --enable-logging --v=0 <url>`. The page logs `[flights] firstWoven woven=… confirmed=…`, then
  `frames=… monoFrames=…` every 5 s, to `chrome_debug.log`. Not yet checked on the panel: depth
  comfort, and fps with ~2,400 instances and ~40k line segments at 8K.
- URL parameters: `?tour`, `?flat`, `?flight=BA%2026`, `?type=A388`, `?airline=EK`, `?q=`,
  `?color=maker`, `?speed=`, `?mono`.

Report only what a log or tool actually printed. Never write expected output into a status update.

## Conventions

- Match the existing code: ES modules, 2-space indent, an explanatory block comment at the top of
  each file and on anything non-obvious, and no dependencies beyond the pinned CDN imports.
- The README documents features, keys, URL parameters and the file layout. Keep it in sync.
- Commit to `main` (it deploys). End commit messages with the `Co-Authored-By` line the session
  provides.
