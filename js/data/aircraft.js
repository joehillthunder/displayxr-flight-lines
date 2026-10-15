// Aircraft types: the brand (manufacturer), the model, and published spec figures.
//
// The figures are the manufacturers' typical published numbers for the variant named. Range is the
// typical design range with a standard passenger load, seats are a typical two- or three-class
// layout, and cruise is the usual cruise speed at altitude. Airlines' real aircraft differ by
// engine, cabin layout and weight variant.
//
// `shape` drives the procedural 3D model in js/aircraft-model.js:
//   body   fuselage diameter (m)        engines  count
//   mount  'wing' | 'tail'              tail     'low' (conventional) | 'T'
//   wing   'low' | 'high'               prop     true for turboprops
//   deck   2 for a full-length upper deck

export const MAKERS = {
  Airbus: { country: 'Europe (Toulouse, France)', color: '#7fb2ff' },
  Boeing: { country: 'United States (Arlington, Virginia)', color: '#9ad0ff' },
  Embraer: { country: 'Brazil (São José dos Campos)', color: '#8ee6c4' },
  ATR: { country: 'France / Italy (Toulouse)', color: '#ffd28a' },
  'De Havilland Canada': { country: 'Canada (Toronto)', color: '#ffb48a' },
  Bombardier: { country: 'Canada (Montréal)', color: '#f5a3c7' },
  COMAC: { country: 'China (Shanghai)', color: '#ff9a9a' },
};

export const AIRCRAFT = {
  A220: {
    maker: 'Airbus', model: 'A220-300', family: 'A220', category: 'Narrow-body jet',
    firstFlight: 2015, engines: '2 × Pratt & Whitney PW1500G geared turbofan',
    length: 38.7, span: 35.1, mtow: 70.9, rangeKm: 6700, cruiseKmh: 830, mach: 0.78, seats: '120–150',
    note: 'Designed by Bombardier as the CSeries; Airbus took it over in 2018.',
    shape: { body: 3.7, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  A320: {
    maker: 'Airbus', model: 'A320-200', family: 'A320', category: 'Narrow-body jet',
    firstFlight: 1987, engines: '2 × CFM56-5B or IAE V2500 turbofan',
    length: 37.57, span: 35.8, mtow: 78, rangeKm: 6100, cruiseKmh: 830, mach: 0.78, seats: '150–180',
    note: 'The first airliner with digital fly-by-wire controls and a side-stick.',
    shape: { body: 3.95, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  A20N: {
    maker: 'Airbus', model: 'A320neo', family: 'A320', category: 'Narrow-body jet',
    firstFlight: 2014, engines: '2 × CFM LEAP-1A or Pratt & Whitney PW1100G',
    length: 37.57, span: 35.8, mtow: 79, rangeKm: 6300, cruiseKmh: 830, mach: 0.78, seats: '150–180',
    note: '"neo" = new engine option: about 15–20% less fuel per seat than the A320ceo.',
    shape: { body: 3.95, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  A21N: {
    maker: 'Airbus', model: 'A321neo', family: 'A320', category: 'Narrow-body jet',
    firstFlight: 2016, engines: '2 × CFM LEAP-1A or Pratt & Whitney PW1100G',
    length: 44.51, span: 35.8, mtow: 97, rangeKm: 7400, cruiseKmh: 830, mach: 0.78, seats: '180–220',
    note: 'The best-selling member of the A320 family; the XLR variant stretches range to about 8,700 km.',
    shape: { body: 3.95, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  A333: {
    maker: 'Airbus', model: 'A330-300', family: 'A330', category: 'Wide-body jet',
    firstFlight: 1992, engines: '2 × GE CF6-80E1, PW4000 or Rolls-Royce Trent 700',
    length: 63.67, span: 60.3, mtow: 242, rangeKm: 11750, cruiseKmh: 871, mach: 0.82, seats: '250–300',
    note: 'Shares its wing and cockpit with the four-engine A340.',
    shape: { body: 5.64, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  A339: {
    maker: 'Airbus', model: 'A330-900neo', family: 'A330', category: 'Wide-body jet',
    firstFlight: 2017, engines: '2 × Rolls-Royce Trent 7000',
    length: 63.66, span: 64, mtow: 251, rangeKm: 13300, cruiseKmh: 871, mach: 0.82, seats: '260–300',
    note: 'A new, longer wing with sharklets and the Trent 7000 from the 787 family of engines.',
    shape: { body: 5.64, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  A359: {
    maker: 'Airbus', model: 'A350-900', family: 'A350', category: 'Wide-body jet',
    firstFlight: 2013, engines: '2 × Rolls-Royce Trent XWB-84',
    length: 66.8, span: 64.75, mtow: 283, rangeKm: 15000, cruiseKmh: 903, mach: 0.85, seats: '300–350',
    note: 'Over half the airframe is carbon-fibre composite. The ULR version flies Singapore–New York nonstop.',
    shape: { body: 5.96, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  A35K: {
    maker: 'Airbus', model: 'A350-1000', family: 'A350', category: 'Wide-body jet',
    firstFlight: 2016, engines: '2 × Rolls-Royce Trent XWB-97',
    length: 73.79, span: 64.75, mtow: 322, rangeKm: 16100, cruiseKmh: 903, mach: 0.85, seats: '350–410',
    note: 'Seven metres longer than the -900, with six-wheel main landing gear.',
    shape: { body: 5.96, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  A388: {
    maker: 'Airbus', model: 'A380-800', family: 'A380', category: 'Double-deck wide-body jet',
    firstFlight: 2005, engines: '4 × Rolls-Royce Trent 900 or Engine Alliance GP7200',
    length: 72.72, span: 79.75, mtow: 575, rangeKm: 14800, cruiseKmh: 903, mach: 0.85, seats: '500–575',
    note: 'The largest passenger airliner ever built: two full-length decks, certified for up to 853 seats.',
    shape: { body: 7.14, engines: 4, mount: 'wing', tail: 'low', wing: 'low', deck: 2 },
  },
  B738: {
    maker: 'Boeing', model: '737-800', family: '737', category: 'Narrow-body jet',
    firstFlight: 1997, engines: '2 × CFM56-7B turbofan',
    length: 39.5, span: 35.8, mtow: 79, rangeKm: 5400, cruiseKmh: 842, mach: 0.785, seats: '162–189',
    note: 'The most-delivered member of the Next-Generation 737 family.',
    shape: { body: 3.76, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  B38M: {
    maker: 'Boeing', model: '737 MAX 8', family: '737', category: 'Narrow-body jet',
    firstFlight: 2016, engines: '2 × CFM LEAP-1B turbofan',
    length: 39.52, span: 35.9, mtow: 82.2, rangeKm: 6570, cruiseKmh: 842, mach: 0.785, seats: '162–189',
    note: 'Recognisable by its split-tip "AT" winglets and the serrated chevrons on the engine nacelles.',
    shape: { body: 3.76, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  B752: {
    maker: 'Boeing', model: '757-200', family: '757', category: 'Narrow-body jet',
    firstFlight: 1982, engines: '2 × Rolls-Royce RB211-535 or Pratt & Whitney PW2000',
    length: 47.32, span: 38.05, mtow: 115.7, rangeKm: 7250, cruiseKmh: 850, mach: 0.80, seats: '200–239',
    note: 'A long, powerful narrow-body still used across the North Atlantic.',
    shape: { body: 3.76, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  B763: {
    maker: 'Boeing', model: '767-300ER', family: '767', category: 'Wide-body jet',
    firstFlight: 1986, engines: '2 × GE CF6-80C2 or Pratt & Whitney PW4000',
    length: 54.94, span: 47.57, mtow: 186.9, rangeKm: 11070, cruiseKmh: 851, mach: 0.80, seats: '218–269',
    note: 'The airliner that made twin-engine transatlantic flying (ETOPS) routine.',
    shape: { body: 5.03, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  B772: {
    maker: 'Boeing', model: '777-200ER', family: '777', category: 'Wide-body jet',
    firstFlight: 1996, engines: '2 × GE90, Pratt & Whitney PW4090 or Rolls-Royce Trent 800',
    length: 63.73, span: 60.93, mtow: 297.6, rangeKm: 13080, cruiseKmh: 892, mach: 0.84, seats: '301–400',
    note: 'The first airliner designed entirely on computer (CATIA), with no full-size mock-up.',
    shape: { body: 6.2, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  B77W: {
    maker: 'Boeing', model: '777-300ER', family: '777', category: 'Wide-body jet',
    firstFlight: 2003, engines: '2 × GE90-115B, the most powerful jet engine in airline service',
    length: 73.86, span: 64.8, mtow: 351.5, rangeKm: 13650, cruiseKmh: 892, mach: 0.84, seats: '350–400',
    note: 'The workhorse of long-haul flying: Emirates alone has flown well over a hundred of them.',
    shape: { body: 6.2, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  B788: {
    maker: 'Boeing', model: '787-8 Dreamliner', family: '787', category: 'Wide-body jet',
    firstFlight: 2009, engines: '2 × GE GEnx-1B or Rolls-Royce Trent 1000',
    length: 56.72, span: 60.12, mtow: 228, rangeKm: 13530, cruiseKmh: 903, mach: 0.85, seats: '240–250',
    note: 'Half carbon-fibre composite, with bigger windows and a lower cabin altitude than older jets.',
    shape: { body: 5.77, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  B789: {
    maker: 'Boeing', model: '787-9 Dreamliner', family: '787', category: 'Wide-body jet',
    firstFlight: 2013, engines: '2 × GE GEnx-1B or Rolls-Royce Trent 1000',
    length: 62.81, span: 60.12, mtow: 254, rangeKm: 14010, cruiseKmh: 903, mach: 0.85, seats: '290–300',
    note: 'The longest-legged 787: Qantas flies it Perth–London nonstop, about 14,500 km.',
    shape: { body: 5.77, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  B78X: {
    maker: 'Boeing', model: '787-10 Dreamliner', family: '787', category: 'Wide-body jet',
    firstFlight: 2017, engines: '2 × GE GEnx-1B or Rolls-Royce Trent 1000 TEN',
    length: 68.28, span: 60.12, mtow: 254, rangeKm: 11730, cruiseKmh: 903, mach: 0.85, seats: '330–340',
    note: 'A stretched 787 built only in South Carolina; it trades range for seats.',
    shape: { body: 5.77, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  B748: {
    maker: 'Boeing', model: '747-8 Intercontinental', family: '747', category: 'Wide-body jet (upper-deck hump)',
    firstFlight: 2011, engines: '4 × GE GEnx-2B67',
    length: 76.25, span: 68.4, mtow: 447.7, rangeKm: 14320, cruiseKmh: 917, mach: 0.855, seats: '410–467',
    note: 'The last and longest Jumbo Jet; production ended in 2023 after 1,574 747s.',
    shape: { body: 6.5, engines: 4, mount: 'wing', tail: 'low', wing: 'low', hump: true },
  },
  E175: {
    maker: 'Embraer', model: 'E175', family: 'E-Jet', category: 'Regional jet',
    firstFlight: 2003, engines: '2 × GE CF34-8E turbofan',
    length: 31.68, span: 28.65, mtow: 40.37, rangeKm: 3700, cruiseKmh: 830, mach: 0.78, seats: '76–88',
    note: 'The backbone of US regional flying, sized to fit pilot "scope clause" limits.',
    shape: { body: 3.01, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  E190: {
    maker: 'Embraer', model: 'E190', family: 'E-Jet', category: 'Regional jet',
    firstFlight: 2004, engines: '2 × GE CF34-10E turbofan',
    length: 36.24, span: 28.72, mtow: 51.8, rangeKm: 4500, cruiseKmh: 830, mach: 0.78, seats: '96–114',
    note: 'A double-bubble fuselage gives four-abreast seating with no middle seats.',
    shape: { body: 3.01, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  E295: {
    maker: 'Embraer', model: 'E195-E2', family: 'E-Jet E2', category: 'Regional jet',
    firstFlight: 2017, engines: '2 × Pratt & Whitney PW1900G geared turbofan',
    length: 41.5, span: 35.12, mtow: 61.5, rangeKm: 4800, cruiseKmh: 833, mach: 0.78, seats: '120–146',
    note: 'The largest aircraft Embraer has built, with a new high-aspect-ratio wing.',
    shape: { body: 3.01, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  AT76: {
    maker: 'ATR', model: 'ATR 72-600', family: 'ATR 72', category: 'Regional turboprop',
    firstFlight: 2009, engines: '2 × Pratt & Whitney Canada PW127M turboprop',
    length: 27.17, span: 27.05, mtow: 23, rangeKm: 1528, cruiseKmh: 510, mach: 0.45, seats: '68–78',
    note: 'Burns about 40% less fuel than a regional jet on short hops.',
    shape: { body: 2.87, engines: 2, mount: 'wing', tail: 'T', wing: 'high', prop: true },
  },
  DH8D: {
    maker: 'De Havilland Canada', model: 'Dash 8-400', family: 'Dash 8', category: 'Regional turboprop',
    firstFlight: 1998, engines: '2 × Pratt & Whitney Canada PW150A turboprop',
    length: 32.81, span: 28.42, mtow: 29.57, rangeKm: 2040, cruiseKmh: 667, mach: 0.55, seats: '78–90',
    note: 'One of the fastest turboprop airliners, close to jet speeds on short routes.',
    shape: { body: 2.69, engines: 2, mount: 'wing', tail: 'T', wing: 'high', prop: true },
  },
  CRJ9: {
    maker: 'Bombardier', model: 'CRJ900', family: 'CRJ', category: 'Regional jet',
    firstFlight: 2001, engines: '2 × GE CF34-8C5 turbofan',
    length: 36.2, span: 24.85, mtow: 38.33, rangeKm: 2956, cruiseKmh: 830, mach: 0.78, seats: '76–90',
    note: 'Rear-mounted engines and a T-tail; the CRJ programme now belongs to Mitsubishi.',
    shape: { body: 2.69, engines: 2, mount: 'tail', tail: 'T', wing: 'low' },
  },
  C919: {
    maker: 'COMAC', model: 'C919', family: 'C919', category: 'Narrow-body jet',
    firstFlight: 2017, engines: '2 × CFM LEAP-1C turbofan',
    length: 38.9, span: 35.8, mtow: 72.5, rangeKm: 4075, cruiseKmh: 834, mach: 0.785, seats: '158–192',
    note: "China's first home-grown narrow-body airliner; it entered service with China Eastern in 2023.",
    shape: { body: 3.96, engines: 2, mount: 'wing', tail: 'low', wing: 'low' },
  },
  C909: {
    maker: 'COMAC', model: 'C909 (ARJ21-700)', family: 'ARJ21', category: 'Regional jet',
    firstFlight: 2008, engines: '2 × GE CF34-10A turbofan',
    length: 33.46, span: 27.29, mtow: 43.5, rangeKm: 2225, cruiseKmh: 828, mach: 0.78, seats: '78–97',
    note: 'Renamed from ARJ21 to C909 in 2024.',
    shape: { body: 3.3, engines: 2, mount: 'tail', tail: 'T', wing: 'low' },
  },
};
