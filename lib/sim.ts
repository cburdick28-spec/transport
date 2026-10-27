import type { EventDef, EffectKind } from "./events";
import type { CityDef } from "./cities";

export type LngLat = [number, number];

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

export function density(city: CityDef, lat: number, lng: number) {
  let sum = 6; // everywhere has a little demand
  for (const z of city.zones) {
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
export type Mode = "bus" | "tram" | "metro";
export interface ModeStats {
  price: number;
  cap: number;
  speed: number; // meters per game-minute
  costPerMin: number;
  label: string;
  icon: string;
}
export const MODE_STATS: Record<Mode, ModeStats> = {
  bus: { price: 45000, cap: 40, speed: 340, costPerMin: 85 / 60, label: "Bus", icon: "🚌" },
  tram: { price: 120000, cap: 90, speed: 420, costPerMin: 150 / 60, label: "Tram", icon: "🚊" },
  metro: { price: 300000, cap: 220, speed: 680, costPerMin: 320 / 60, label: "Metro", icon: "🚇" },
};

export interface Line {
  id: number;
  name: string;
  color: string;
  mode: Mode;
  stops: Stop[];
  coords: LngLat[];
  cum: number[];
  stopDist: number[];
  len: number;
  buses: Bus[];
  shuttleUntil?: number;
  fareMult?: number;
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
  shuttle?: boolean;
}
export interface LogEntry {
  t: number;
  msg: string;
  tone: "info" | "warn" | "good" | "bad";
}
export interface Game {
  city: CityDef;
  now: number; // game minutes since day 0 00:00
  cash: number;
  fare: number;
  rep: number;
  lines: Line[];
  events: EventInst[];
  log: LogEntry[];
  nextId: number;
  stationCooldown: Record<string, number>;
  lineCount: number;
  lastSchedDay: number;
  revToday: number;
  costToday: number;
  riders: number;
  ridersToday: number;
  abandoned: number;
  history: { day: number; profit: number; riders: number }[];
  bankrupt: boolean;
  infiniteMoney: boolean;
  cityObjectiveDone: boolean;
}

export const STOP_PRICE = 2000;
// ---------- Railgrid stations ----------
// Click a station on the map to play a Railgrid shift. Your grade pays out in the city game.
export const STATION_COOLDOWN_MIN = 1440; // one game day between shifts at the same station
export const STATION_REWARDS: Record<string, { cash: number; rep: number }> = {
  S: { cash: 30000, rep: 12 },
  A: { cash: 18000, rep: 8 },
  B: { cash: 10000, rep: 4 },
  C: { cash: 4000, rep: 1 },
  D: { cash: 0, rep: 0 },
  F: { cash: -6000, rep: -8 },
};

export function stationWaitMin(g: Game, stationId: string) {
  return Math.max(0, (g.stationCooldown[stationId] ?? 0) - g.now);
}

// Returns the reward that was applied, or null if the result was invalid or the station is on cooldown.
export function applyStationResult(g: Game, stationId: string, grade: string) {
  const st = g.city.stations.find((x) => x.id === stationId);
  const r = Object.prototype.hasOwnProperty.call(STATION_REWARDS, grade) ? STATION_REWARDS[grade] : undefined;
  if (!st || !r) return null;
  if (stationWaitMin(g, stationId) > 0) return null;
  g.stationCooldown[stationId] = g.now + STATION_COOLDOWN_MIN;
  g.cash += r.cash;
  g.rep = Math.max(0, Math.min(100, g.rep + r.rep));
  const money = `${r.cash >= 0 ? "+" : "-"}€${Math.abs(r.cash).toLocaleString("en-US")}`;
  pushLog(g, `🚉 ${st.name} shift graded ${grade}: ${money}, happiness ${r.rep >= 0 ? "+" : ""}${r.rep}`, r.cash >= 0 ? "good" : "bad");
  return r;
}

export const SHUTTLE_COST = 6000; // leases 3 buses for one event
export const SHUTTLE_BUSES = 3;
export const SHUTTLE_COLOR = "#e879f9";
const INFINITE_CASH_FLOOR = 1_000_000_000;

// nearest big hub that is at least ~1.5 km from the event so the shuttle is worth it
export function pickHub(city: CityDef, lat: number, lng: number) {
  const sorted = [...city.hubs].sort(
    (a, b) => distM(lat, lng, a.lat, a.lng) - distM(lat, lng, b.lat, b.lng),
  );
  return sorted.find((h) => distM(lat, lng, h.lat, h.lng) > 1500) ?? sorted[sorted.length - 1];
}
export function createGame(city: CityDef, startCash = 150000): Game {
  const g: Game = {
    city,
    now: 6 * 60,
    cash: startCash,
    fare: 1.5,
    rep: 70,
    lines: [],
    events: [],
    log: [],
    nextId: 1,
    stationCooldown: {},
    lineCount: 0,
    lastSchedDay: 0,
    revToday: 0,
    costToday: 0,
    riders: 0,
    ridersToday: 0,
    abandoned: 0,
    history: [],
    bankrupt: false,
    infiniteMoney: false,
    cityObjectiveDone: false,
  };
  pushLog(g, `Welcome to ${city.name}. Build your first line.`, "info");
  // First event is guaranteed so you learn how they work
  if (city.events.length > 0) scheduleEvent(g, city.events[0], 20 * 60);
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
  const pool = g.city.events.filter((d) => !recent.includes(d.id));
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
  mode: Mode = "bus",
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
      base: density(g.city, pt[1], pt[0]),
      served: 0,
    };
  });
  const line: Line = {
    id: g.nextId++,
    name: `Line ${++g.lineCount}`,
    color,
    mode,
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
    const cap = MODE_STATS[line.mode].cap;
    for (const p of stop.queue) {
      const wants = Math.sign(p.dest - i);
      if (wants === bus.dir && bus.pax.length < cap) {
        bus.pax.push(p.dest);
        on++;
        const fare = g.fare * (line.fareMult ?? 1);
        g.cash += fare;
        g.revToday += fare;
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
  const step = MODE_STATS[line.mode].speed * fx.speed * dt;
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
    if (g.lines.some((l) => l.shuttleUntil && g.now >= l.shuttleUntil)) {
      for (const l of g.lines.filter((x) => x.shuttleUntil && g.now >= x.shuttleUntil)) {
        pushLog(g, `${l.name} finished. Leased buses returned.`, "info");
      }
      g.lines = g.lines.filter((l) => !(l.shuttleUntil && g.now >= l.shuttleUntil));
    }
    for (const line of g.lines) {
      spawnPax(g, line, dt, hour);
      for (const bus of line.buses) {
        stepBus(g, line, bus, dt);
        const c = MODE_STATS[line.mode].costPerMin * dt;
        g.cash -= c;
        g.costToday += c;
      }
    }
    if (g.infiniteMoney) {
      if (g.cash < INFINITE_CASH_FLOOR) g.cash = INFINITE_CASH_FLOOR;
    } else if (!g.bankrupt && g.cash < -50000) {
      g.bankrupt = true;
      pushLog(g, "Bankrupt! The city council is taking over your lines.", "bad");
    }
    if (g.city.unlockRiders != null && !g.cityObjectiveDone && g.riders >= g.city.unlockRiders) {
      g.cityObjectiveDone = true;
      pushLog(g, "🎉 Ridership goal reached! A new city is open on the map.", "good");
    }
  }
}

export function fmtClock(now: number) {
  const day = Math.floor(now / 1440) + 1;
  const h = Math.floor((now / 60) % 24);
  const m = Math.floor(now % 60);
  return { day, time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}
