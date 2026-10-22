// Madrid events: each one is a set of area effects that kick in for a while.
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

const CITY = 1e9; // effectively citywide

export const EVENT_DEFS: EventDef[] = [
  {
    id: "derbi",
    name: "Derbi at the Bernabéu",
    emoji: "⚽",
    blurb: "80,000 fans pour into Chamartín. Move buses there or lose the money.",
    durationH: 4,
    leadH: 10,
    startHour: [18, 21],
    weight: 3,
    effects: [
      { lat: 40.4531, lng: -3.6883, r: 1300, kind: "surge", mult: 3.8, label: "Match day" },
    ],
  },
  {
    id: "worldcup",
    name: "World Cup Fan Zone",
    emoji: "🏆",
    blurb: "Giant screens at Puerta del Sol. The center fills up, but crowds clog the streets.",
    durationH: 7,
    leadH: 18,
    startHour: [14, 17],
    weight: 2,
    effects: [
      { lat: 40.4168, lng: -3.7038, r: 700, kind: "surge", mult: 3.2, label: "Fan zone" },
      { lat: 40.4168, lng: -3.7038, r: 1100, kind: "slow", mult: 0.6 },
    ],
  },
  {
    id: "olympics",
    name: "Olympic Torch Relay",
    emoji: "🔥",
    blurb: "Paseo del Prado and Cibeles are sealed for the relay. Nearby Retiro and Atocha get slammed.",
    durationH: 3,
    leadH: 16,
    startHour: [9, 11],
    weight: 2,
    effects: [
      { lat: 40.4193, lng: -3.6930, r: 600, kind: "closure", label: "Relay route" },
      { lat: 40.4153, lng: -3.6844, r: 900, kind: "surge", mult: 2.4, label: "Spectators" },
    ],
  },
  {
    id: "protest",
    name: "Protest on Gran Vía",
    emoji: "📢",
    blurb: "Big march through the center. Gran Vía is closed, and people flood nearby areas to meet up.",
    durationH: 5,
    leadH: 6,
    startHour: [12, 17],
    weight: 3,
    effects: [
      { lat: 40.4200, lng: -3.7050, r: 650, kind: "closure", label: "Road closed" },
      { lat: 40.4065, lng: -3.6915, r: 800, kind: "surge", mult: 2.0, label: "Gathering" },
    ],
  },
  {
    id: "marathon",
    name: "Madrid Marathon",
    emoji: "🏃",
    blurb: "Castellana and Retiro are closed all morning. Runners and spectators everywhere.",
    durationH: 5,
    leadH: 20,
    startHour: [7, 8],
    weight: 2,
    effects: [
      { lat: 40.4380, lng: -3.6910, r: 900, kind: "closure", label: "Course closed" },
      { lat: 40.4153, lng: -3.6844, r: 800, kind: "surge", mult: 2.2, label: "Finish line" },
    ],
  },
  {
    id: "concert",
    name: "Concert at the Metropolitano",
    emoji: "🎤",
    blurb: "A stadium show out east. Huge spike, but only for one night.",
    durationH: 4,
    leadH: 12,
    startHour: [19, 21],
    weight: 2,
    effects: [
      { lat: 40.4361, lng: -3.5994, r: 1200, kind: "surge", mult: 4.2, label: "Concert" },
    ],
  },
  {
    id: "pride",
    name: "Orgullo Parade",
    emoji: "🏳️‍🌈",
    blurb: "The parade closes Chueca and the center fills with people.",
    durationH: 6,
    leadH: 24,
    startHour: [15, 18],
    weight: 1,
    effects: [
      { lat: 40.4230, lng: -3.6970, r: 600, kind: "closure", label: "Parade route" },
      { lat: 40.4168, lng: -3.7038, r: 1000, kind: "surge", mult: 3.0, label: "Crowds" },
    ],
  },
  {
    id: "metrostrike",
    name: "Metro Strike",
    emoji: "🚇",
    blurb: "The metro stops for a day, so everyone needs a bus. Demand is up citywide.",
    durationH: 20,
    leadH: 12,
    startHour: [6, 7],
    weight: 1,
    effects: [{ lat: 40.4168, lng: -3.7038, r: CITY, kind: "surge", mult: 1.7, label: "Strike" }],
  },
  {
    id: "snow",
    name: "Snowstorm (Filomena vibes)",
    emoji: "❄️",
    blurb: "Everything slows to a crawl and fewer people travel.",
    durationH: 14,
    leadH: 8,
    startHour: [5, 8],
    weight: 1,
    effects: [
      { lat: 40.4168, lng: -3.7038, r: CITY, kind: "slow", mult: 0.55 },
      { lat: 40.4168, lng: -3.7038, r: CITY, kind: "surge", mult: 0.75 },
    ],
  },
];
