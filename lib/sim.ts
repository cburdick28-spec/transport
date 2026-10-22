import { EVENT_DEFS, type EventDef, type EffectKind } from "./events";

export type LngLat = [number, number];

// ---------- Madrid demand map ----------
// Population weight per district. Stops near these generate more riders.
const ZONES = [
  { lat: 40.4168, lng: -3.7038, r: 1200, w: 100 }, // Centro / Sol
  { lat: 40.437, lng: -3.704, r: 1300, w: 70 }, // Chamberí
  { lat: 40.43, lng: -3.677, r: 1500, w: 85 }, // Salamanca
  { lat: 40.4153, lng: -3.6844, r: 1100, w: 55 }, // Retiro
  { lat: 40.4531, lng: -3.6883, r: 1400, w: 75 }, // Chamartín
  { lat: 40.435, lng: -3.719, r: 1300, w: 60 }, // Moncloa
  { lat: 40.4065, lng: -3.6915, r: 1400, w: 70 }, // Atocha / Arganzuela
  { lat: 40.46, lng: -3.7, r: 1300, w: 65 }, // Tetuán
  { lat: 40.393, lng: -3.66, r: 1800, w: 80 }, // Vallecas
  { lat: 40.383, lng: -3.728, r: 1800, w: 75 }, // Carabanchel
  { lat: 40.385, lng: -3.704, r: 1500, w: 55 }, // Usera
  { lat: 40.44, lng: -3.65, r: 1600, w: 65 }, // Ciudad Lineal
];

export function distM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function density(lat: number, lng: number) {
  let sum = 6; // everywhere has a little demand
  for (const z of ZONES) {
    const d = distM(lat, lng, z.lat, z.lng);
    sum += z.w * Math.exp(-((d / (z.r * 1.1)) ** 2));
  }
  return sum;
}

// ---------- types ----------
export interface Passenger {
  dest: number;
  t: number;
}
export interface Stop {
  id: number;
  lng: number;
  lat: number;
  queue: Passenger[];
  closed: boolean;
  base: number;
  served: number;
}
export interface Bus {
  id: number;
  d: number;
  dir: 1 | -1;
  next: number;
  dwell: number;
  pax: number[];
  lng: number;
  lat: number;
}
export interface Line {
  id: number;
  name: string;
  color: string;
  stops: Stop[];
  coords: LngLat[];
  cum: number[];
  stopDist: number[];
  len: number;
  buses: Bus[];
}
export interface EventInst {
  uid: number;
  def: EventDef;
  start: number;
  end: number;
  announceAt: number;
  announced: boolean;
  started: boolean;
  ended: boolean;
}
export interface LogEntry {
  t: number;
  msg: string;
  tone: "info" | "warn" | "good" | "bad";
}
export interface Game {
  now: number; // game minutes since day 0 00:00
  cash: number;
  fare: number;
  rep: number;
  lines: Line[];
  events: EventInst[];
  log: LogEntry[];
  nextId: number;
  lastSchedDay: number;
  revToday: number;
  costToday: number;
  riders: number;
  ridersToday: number;
  abandoned: number;
  history: { day: number; profit: number; riders: number }[];
  bankrupt: boolean;
}

export const BUS_PRICE = 45000;
export const STOP_PRICE = 2000;
export const BUS_CAP = 40;
const BUS_COST_PER_MIN = 85 / 60;
const SPEED_M_PER_MIN = 340; // ~20 km/h

export function createGame(): Game {
  const g: Game = {
    now: 6 * 60,
    cash: 150000,
    fare: 1.5,
    rep: 70,
    lines: [],
    events: [],
    log: [],
    nextId: 1,
    lastSchedDay: 0,
    revToday: 0,
    costToday: 0,
    riders: 0,
    ridersToday: 0,
    abandoned: 0,
    history: [],
    bankrupt: false,
  };
  pushLog(g, "Welcome to Madrid. Build your first line.", "info");
  // First event is guaranteed so you learn how they work
  scheduleEvent(g, EVENT_DEFS[0], 20 * 60);
  return g;
}

export function pushLog(g: Game, msg: string, tone: LogEntry["tone"]) {
  g.log.unshift({ t: g.now, msg, tone });
  if (g.log.length > 40) g.log.pop();
}

function scheduleEvent(g: Game, def: EventDef, startMin: number) {
  g.events.push({
    uid: g.nextId++,
    def,
    start: startMin,
    end: startMin + def.durationH * 60,
    announceAt: Math.max(g.now, startMin - def.leadH * 60),
    announced: false,
    started: false,
    ended: false,
  });
}

function pickDef(g: Game): EventDef {
  const recent = g.events.slice(-3).map((e) => e.def.id);
  const pool = EVENT_DEFS.filter((d) => !recent.includes(d.id));
  const total = pool.reduce((s, d) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const d of pool) {
    r -= d.weight;
    if (r <= 0) return d;
  }
  return pool[0];
}

// ---------- geometry helpers ----------
export function buildLine(
  g: Game,
  stopPts: LngLat[],
  legs: LngLat[][],
  color: string,
): Line {
  const coords: LngLat[] = [];
  const cum: number[] = [];
  const stopDist: number[] = [0];
  let total = 0;
  legs.forEach((leg) => {
    leg.forEach((p, i) => {
      if (coords.length === 0) {
        coords.push(p);
        cum.push(0);
        return;
      }
      if (i === 0) return; // legs share their joint point
      const prev = coords[coords.length - 1];
      total += distM(prev[1], prev[0], p[1], p[0]);
      coords.push(p);
      cum.push(total);
    });
    stopDist.push(total);
  });
  const stops: Stop[] = stopPts.map((p, i) => {
    // use snapped road point when we have it
    const snapped =
      i === 0
        ? legs[0][0]
        : legs[i - 1][legs[i - 1].length - 1];
    const pt = snapped ?? p;
    return {
      id: g.nextId++,
      lng: pt[0],
      lat: pt[1],
      queue: [],
      closed: false,
      base: density(pt[1], pt[0]),
      served: 0,
    };
  });
  const line: Line = {
    id: g.nextId++,
    name: `Line ${g.lines.length + 1}`,
    color,
    stops,
    coords,
    cum,
    stopDist,
    len: total,
    buses: [],
  };
  return line;
}

export function addBus(g: Game, line: Line) {
  const b: Bus = {
    id: g.nextId++,
    d: 0,
    dir: -1,
    next: 0,
    dwell: 0,
    pax: [],
    lng: line.coords[0][0],
    lat: line.coords[0][1],
  };
  line.buses.push(b);
}

function pointAt(line: Line, d: number): LngLat {
  const { cum, coords } = line;
  if (d <= 0) return coords[0];
  if (d >= line.len) return coords[coords.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / seg;
  return [
    coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t,
    coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t,
  ];
}

// ---------- events -> effects at a point ----------
export interface Fx {
  closed: boolean;
  demand: number;
  speed: number;
}
export function fxAt(g: Game, lat: number, lng: number): Fx {
  const fx: Fx = { closed: false, demand: 1, speed: 1 };
  for (const e of g.events) {
    if (!e.started || e.ended) continue;
    for (const ef of e.def.effects) {
      if (distM(lat, lng, ef.lat, ef.lng) > ef.r) continue;
      const k: EffectKind = ef.kind;
      if (k === "closure") {
        fx.closed = true;
        fx.speed *= 0.3;
      } else if (k === "surge") fx.demand *= ef.mult ?? 1;
      else fx.speed *= ef.mult ?? 1;
    }
  }
  return fx;
}

function todMult(hour: number) {
  if (hour < 5) return 0.12;
  if (hour < 7) return 0.5;
  if (hour < 10) return 1.9; // morning rush
  if (hour < 16) return 1.0;
  if (hour < 20) return 1.8; // evening rush
  if (hour < 23) return 0.8;
  return 0.25;
}

// ---------- passengers + bus movement ----------
function spawnPax(g: Game, line: Line, dt: number, hour: number) {
  const tod = todMult(hour);
  const repF = 0.7 + 0.3 * (g.rep / 100);
  const n = line.stops.length;
  line.stops.forEach((s, i) => {
    const fx = fxAt(g, s.lat, s.lng);
    s.closed = fx.closed;
    if (fx.closed) {
      s.queue.length = 0; // people give up and go elsewhere, no penalty
      return;
    }
    const exp = s.base * 0.012 * tod * fx.demand * repF * dt;
    let k = Math.floor(exp) + (Math.random() < exp % 1 ? 1 : 0);
    while (k-- > 0 && s.queue.length < 90) {
      // choose a destination along the line, biased to short trips
      const canFwd = i < n - 1;
      const canBack = i > 0;
      const goFwd = canFwd && (!canBack || Math.random() < 0.5);
      const room = goFwd ? n - 1 - i : i;
      const step = 1 + Math.floor(Math.random() * Math.random() * room);
      s.queue.push({ dest: goFwd ? i + step : i - step, t: g.now });
    }
    // abandon after an hour of waiting
    while (s.queue.length && g.now - s.queue[0].t > 60) {
      s.queue.shift();
      g.abandoned++;
      g.rep += (10 - g.rep) * 0.015;
    }
  });
}

function arrive(g: Game, line: Line, bus: Bus) {
  const i = bus.next;
  const stop = line.stops[i];
  const n = line.stops.length;
  if (stop.closed) {
    // skip closed stop: keep driving
    bus.dwell = 0;
  } else {
    // alight
    const before = bus.pax.length;
    bus.pax = bus.pax.filter((d) => d !== i);
    const off = before - bus.pax.length;
    // turn around at the terminals
    if ((i === n - 1 && bus.dir === 1) || (i === 0 && bus.dir === -1)) {
      bus.pax = [];
      bus.dir = (bus.dir * -1) as 1 | -1;
    }
    // board matching direction
    let on = 0;
    const rest: Passenger[] = [];
    for (const p of stop.queue) {
      const wants = Math.sign(p.dest - i);
      if (wants === bus.dir && bus.pax.length < BUS_CAP) {
        bus.pax.push(p.dest);
        on++;
        g.cash += g.fare;
        g.revToday += g.fare;
        g.riders++;
        g.ridersToday++;
        stop.served++;
        const wait = g.now - p.t;
        g.rep += (Math.max(0, 100 - wait * 2.2) - g.rep) * 0.02;
      } else rest.push(p);
    }
    stop.queue = rest;
    bus.dwell = 0.4 + (on + off) * 0.04;
  }
  // choose next stop
  if (bus.next + bus.dir < 0 || bus.next + bus.dir > n - 1) {
    bus.dir = (bus.dir * -1) as 1 | -1;
  }
  bus.next += bus.dir;
}

function stepBus(g: Game, line: Line, bus: Bus, dt: number) {
  if (bus.dwell > 0) {
    bus.dwell -= dt;
    return;
  }
  const fx = fxAt(g, bus.lat, bus.lng);
  const step = SPEED_M_PER_MIN * fx.speed * dt;
  const target = line.stopDist[bus.next];
  if (bus.dir * (target - bus.d) <= step) {
    bus.d = target;
    const p = pointAt(line, bus.d);
    bus.lng = p[0];
    bus.lat = p[1];
    arrive(g, line, bus);
  } else {
    bus.d += bus.dir * step;
    const p = pointAt(line, bus.d);
    bus.lng = p[0];
    bus.lat = p[1];
  }
}

function runEvents(g: Game) {
  for (const e of g.events) {
    if (!e.announced && g.now >= e.announceAt) {
      e.announced = true;
      const inH = Math.max(0, Math.round((e.start - g.now) / 60));
      pushLog(g, `${e.def.emoji} ${e.def.name} in ~${inH}h. ${e.def.blurb}`, "warn");
    }
    if (!e.started && g.now >= e.start) {
      e.started = true;
      pushLog(g, `${e.def.emoji} ${e.def.name} is happening now`, "bad");
    }
    if (e.started && !e.ended && g.now >= e.end) {
      e.ended = true;
      pushLog(g, `${e.def.emoji} ${e.def.name} is over`, "info");
    }
  }
  // prune old events
  g.events = g.events.filter((e) => !(e.ended && g.now - e.end > 60));
}

function rollDay(g: Game) {
  const day = Math.floor(g.now / 1440);
  if (day <= g.lastSchedDay) return;
  g.lastSchedDay = day;
  g.history.push({ day: day - 1, profit: g.revToday - g.costToday, riders: g.ridersToday });
  if (g.history.length > 14) g.history.shift();
  pushLog(
    g,
    `Day ${day} done: ${g.revToday - g.costToday >= 0 ? "+" : ""}€${Math.round(g.revToday - g.costToday)} profit, ${g.ridersToday} riders`,
    g.revToday - g.costToday >= 0 ? "good" : "bad",
  );
  g.revToday = 0;
  g.costToday = 0;
  g.ridersToday = 0;
  // 1-2 new events for tomorrow
  const count = Math.random() < 0.45 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const def = pickDef(g);
    const [lo, hi] = def.startHour;
    const hr = lo + Math.random() * (hi - lo);
    scheduleEvent(g, def, (day + 1) * 1440 + Math.round(hr * 60));
  }
}

export function tick(g: Game, dtTotal: number) {
  let left = dtTotal;
  while (left > 0) {
    const dt = Math.min(0.25, left);
    left -= dt;
    g.now += dt;
    const hour = (g.now / 60) % 24;
    runEvents(g);
    rollDay(g);
    for (const line of g.lines) {
      spawnPax(g, line, dt, hour);
      for (const bus of line.buses) {
        stepBus(g, line, bus, dt);
        const c = BUS_COST_PER_MIN * dt;
        g.cash -= c;
        g.costToday += c;
      }
    }
    if (!g.bankrupt && g.cash < -50000) {
      g.bankrupt = true;
      pushLog(g, "Bankrupt! The city council is taking over your lines.", "bad");
    }
  }
}

export function fmtClock(now: number) {
  const day = Math.floor(now / 1440) + 1;
  const h = Math.floor((now / 60) % 24);
  const m = Math.floor(now % 60);
  return { day, time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}
