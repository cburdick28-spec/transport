// Shared event types. Each city defines its own EventDef list in lib/cities.ts.
// closure = stops inside are shut and buses crawl through
// surge   = passenger demand multiplier inside the circle
// slow    = buses move slower inside the circle (weather, traffic)

export type EffectKind = "closure" | "surge" | "slow";

export interface Effect {
  lat: number;
  lng: number;
  r: number; // meters
  kind: EffectKind;
  mult?: number; // surge/slow multiplier
  label?: string;
}

export interface EventDef {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  durationH: number;
  leadH: number; // how many hours of warning you get
  startHour: [number, number]; // earliest/latest start hour of day
  weight: number;
  effects: Effect[];
}

export const CITY_RADIUS = 1e9; // effectively citywide
