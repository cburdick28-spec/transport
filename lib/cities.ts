import { CITY_RADIUS, type EventDef } from "./events";

export type LngLat = [number, number];

export interface Zone {
  lat: number;
  lng: number;
  r: number; // meters
  w: number; // population weight
}

export interface Hub {
  name: string;
  lng: number;
  lat: number;
}

export interface CityDef {
  id: string;
  name: string;
  center: LngLat;
  zoom: number;
  bounds: [LngLat, LngLat];
  zones: Zone[];
  hubs: Hub[];
  events: EventDef[];
  /** Total riders to serve in this city to unlock the next one. null = final city. */
  unlockRiders: number | null;
}

const MADRID: CityDef = {
  id: "madrid",
  name: "Madrid",
  center: [-3.7038, 40.4168],
  zoom: 12.3,
  bounds: [
    [-4.0, 40.25],
    [-3.4, 40.6],
  ],
  zones: [
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
  ],
  hubs: [
    { name: "Atocha", lng: -3.6915, lat: 40.4065 },
    { name: "Nuevos Ministerios", lng: -3.692, lat: 40.446 },
    { name: "Moncloa", lng: -3.719, lat: 40.435 },
    { name: "Plaza Elíptica", lng: -3.7183, lat: 40.3855 },
    { name: "Av. de América", lng: -3.677, lat: 40.438 },
    { name: "Sol", lng: -3.7038, lat: 40.4168 },
  ],
  unlockRiders: 2500,
  events: [
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
        { lat: 40.4193, lng: -3.693, r: 600, kind: "closure", label: "Relay route" },
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
        { lat: 40.42, lng: -3.705, r: 650, kind: "closure", label: "Road closed" },
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
        { lat: 40.438, lng: -3.691, r: 900, kind: "closure", label: "Course closed" },
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
      effects: [{ lat: 40.4361, lng: -3.5994, r: 1200, kind: "surge", mult: 4.2, label: "Concert" }],
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
        { lat: 40.423, lng: -3.697, r: 600, kind: "closure", label: "Parade route" },
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
      effects: [{ lat: 40.4168, lng: -3.7038, r: CITY_RADIUS, kind: "surge", mult: 1.7, label: "Strike" }],
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
        { lat: 40.4168, lng: -3.7038, r: CITY_RADIUS, kind: "slow", mult: 0.55 },
        { lat: 40.4168, lng: -3.7038, r: CITY_RADIUS, kind: "surge", mult: 0.75 },
      ],
    },
  ],
};

const BARCELONA: CityDef = {
  id: "barcelona",
  name: "Barcelona",
  center: [2.1734, 41.3874],
  zoom: 12.4,
  bounds: [
    [1.95, 41.28],
    [2.28, 41.48],
  ],
  zones: [
    { lat: 41.3851, lng: 2.1734, r: 1400, w: 90 }, // Eixample
    { lat: 41.4036, lng: 2.1527, r: 1100, w: 75 }, // Gràcia
    { lat: 41.3786, lng: 2.1326, r: 1300, w: 65 }, // Sants
    { lat: 41.4036, lng: 2.1744, r: 1200, w: 85 }, // Sagrada Família
    { lat: 41.3802, lng: 2.1925, r: 1100, w: 60 }, // Barceloneta
    { lat: 41.385, lng: 2.12, r: 1300, w: 55 }, // Les Corts
    { lat: 41.4036, lng: 2.2, r: 1500, w: 60 }, // Poblenou
    { lat: 41.428, lng: 2.168, r: 1600, w: 55 }, // Horta-Guinardó
    { lat: 41.3755, lng: 2.17, r: 1100, w: 100 }, // Gothic Quarter / Las Ramblas
  ],
  hubs: [
    { name: "Plaça Catalunya", lng: 2.1701, lat: 41.3874 },
    { name: "Sants Estació", lng: 2.1403, lat: 41.3792 },
    { name: "Plaça d'Espanya", lng: 2.1489, lat: 41.3748 },
    { name: "Glòries", lng: 2.1874, lat: 41.4036 },
    { name: "Fòrum", lng: 2.2169, lat: 41.411 },
  ],
  unlockRiders: 4000,
  events: [
    {
      id: "clasico",
      name: "El Clàsico at Camp Nou",
      emoji: "⚽",
      blurb: "The whole city watches. Les Corts and Sants fill with fans before kickoff.",
      durationH: 4,
      leadH: 10,
      startHour: [19, 21],
      weight: 3,
      effects: [{ lat: 41.3809, lng: 2.1228, r: 1300, kind: "surge", mult: 3.8, label: "Match day" }],
    },
    {
      id: "merce",
      name: "La Mercè Festival",
      emoji: "🎉",
      blurb: "Fire runs and giants parade through the Gothic Quarter. The old town is packed.",
      durationH: 8,
      leadH: 20,
      startHour: [17, 19],
      weight: 2,
      effects: [
        { lat: 41.3755, lng: 2.17, r: 900, kind: "surge", mult: 3.2, label: "Festival" },
        { lat: 41.3755, lng: 2.17, r: 1100, kind: "slow", mult: 0.6 },
      ],
    },
    {
      id: "santjordi",
      name: "Sant Jordi",
      emoji: "🌹🏳️",
      blurb: "Book and rose stalls line Passeig de Gràcia and Rambla de Catalunya. Huge foot traffic.",
      durationH: 10,
      leadH: 24,
      startHour: [9, 10],
      weight: 2,
      effects: [{ lat: 41.3917, lng: 2.1649, r: 900, kind: "surge", mult: 2.6, label: "Stalls" }],
    },
    {
      id: "primavera",
      name: "Primavera Sound",
      emoji: "🎤",
      blurb: "The Fòrum stage draws a late-night crowd out east.",
      durationH: 6,
      leadH: 14,
      startHour: [20, 22],
      weight: 2,
      effects: [{ lat: 41.411, lng: 2.2169, r: 1300, kind: "surge", mult: 4.0, label: "Concert" }],
    },
    {
      id: "vaga",
      name: "Metro Strike (Vaga)",
      emoji: "🚇",
      blurb: "TMB walks out for the day. Everyone who'd take the metro needs a bus instead.",
      durationH: 20,
      leadH: 12,
      startHour: [6, 7],
      weight: 1,
      effects: [{ lat: 41.3874, lng: 2.1734, r: CITY_RADIUS, kind: "surge", mult: 1.7, label: "Strike" }],
    },
  ],
};

const LISBON: CityDef = {
  id: "lisbon",
  name: "Lisbon",
  center: [-9.1393, 38.7223],
  zoom: 12.4,
  bounds: [
    [-9.25, 38.65],
    [-9.05, 38.8],
  ],
  zones: [
    { lat: 38.7139, lng: -9.1365, r: 1000, w: 95 }, // Baixa / Rossio
    { lat: 38.7122, lng: -9.1326, r: 900, w: 65 }, // Alfama
    { lat: 38.7107, lng: -9.1427, r: 900, w: 80 }, // Chiado / Bairro Alto
    { lat: 38.697, lng: -9.206, r: 1300, w: 55 }, // Belém
    { lat: 38.768, lng: -9.095, r: 1400, w: 70 }, // Parque das Nações
    { lat: 38.714, lng: -9.165, r: 1200, w: 55 }, // Campo de Ourique
    { lat: 38.736, lng: -9.148, r: 1300, w: 65 }, // Avenidas Novas
    { lat: 38.706, lng: -9.172, r: 1100, w: 50 }, // Alcântara
  ],
  hubs: [
    { name: "Rossio", lng: -9.1393, lat: 38.7145 },
    { name: "Cais do Sodré", lng: -9.1455, lat: 38.7064 },
    { name: "Oriente", lng: -9.0989, lat: 38.7678 },
    { name: "Marquês de Pombal", lng: -9.1498, lat: 38.7253 },
    { name: "Entrecampos", lng: -9.1538, lat: 38.7497 },
  ],
  unlockRiders: 6000,
  events: [
    {
      id: "derbi",
      name: "Derby at the Estádio da Luz",
      emoji: "⚽",
      blurb: "Benfica play at home and the north of the city turns red and white.",
      durationH: 4,
      leadH: 10,
      startHour: [19, 21],
      weight: 3,
      effects: [{ lat: 38.7527, lng: -9.1846, r: 1300, kind: "surge", mult: 3.6, label: "Match day" }],
    },
    {
      id: "santos",
      name: "Santos Populares",
      emoji: "🎊",
      blurb: "Grilled sardines and street parties fill Alfama all night.",
      durationH: 9,
      leadH: 18,
      startHour: [18, 20],
      weight: 2,
      effects: [
        { lat: 38.7122, lng: -9.1326, r: 800, kind: "surge", mult: 3.4, label: "Street party" },
        { lat: 38.7122, lng: -9.1326, r: 1000, kind: "slow", mult: 0.55 },
      ],
    },
    {
      id: "nosalive",
      name: "NOS Alive",
      emoji: "🎤",
      blurb: "A big festival out by the river draws crowds toward Belém.",
      durationH: 6,
      leadH: 16,
      startHour: [19, 21],
      weight: 2,
      effects: [{ lat: 38.697, lng: -9.206, r: 1200, kind: "surge", mult: 3.8, label: "Festival" }],
    },
    {
      id: "greve",
      name: "Tram & Metro Strike",
      emoji: "🚋",
      blurb: "A transit strike (greve) leaves the whole city needing buses.",
      durationH: 20,
      leadH: 12,
      startHour: [6, 7],
      weight: 1,
      effects: [{ lat: 38.7223, lng: -9.1393, r: CITY_RADIUS, kind: "surge", mult: 1.7, label: "Strike" }],
    },
    {
      id: "heatwave",
      name: "Heatwave",
      emoji: "🥵",
      blurb: "Scorching heat slows everything and keeps some riders home.",
      durationH: 14,
      leadH: 10,
      startHour: [10, 13],
      weight: 1,
      effects: [
        { lat: 38.7223, lng: -9.1393, r: CITY_RADIUS, kind: "slow", mult: 0.7 },
        { lat: 38.7223, lng: -9.1393, r: CITY_RADIUS, kind: "surge", mult: 0.8 },
      ],
    },
  ],
};

const PARIS: CityDef = {
  id: "paris",
  name: "Paris",
  center: [2.3522, 48.8566],
  zoom: 12.3,
  bounds: [
    [2.2, 48.8],
    [2.5, 48.92],
  ],
  zones: [
    { lat: 48.8606, lng: 2.3376, r: 1000, w: 95 }, // Louvre
    { lat: 48.8575, lng: 2.36, r: 1000, w: 70 }, // Le Marais
    { lat: 48.8867, lng: 2.3431, r: 1100, w: 65 }, // Montmartre
    { lat: 48.853, lng: 2.37, r: 1000, w: 70 }, // Bastille
    { lat: 48.8698, lng: 2.3076, r: 1200, w: 75 }, // Champs-Élysées
    { lat: 48.8422, lng: 2.3219, r: 1100, w: 65 }, // Montparnasse
    { lat: 48.872, lng: 2.382, r: 1200, w: 55 }, // Belleville
    { lat: 48.8496, lng: 2.3487, r: 900, w: 60 }, // Quartier Latin
  ],
  hubs: [
    { name: "Châtelet", lng: 2.3472, lat: 48.8583 },
    { name: "Gare du Nord", lng: 2.3553, lat: 48.8809 },
    { name: "Gare de Lyon", lng: 2.3731, lat: 48.8443 },
    { name: "Montparnasse", lng: 2.3207, lat: 48.8422 },
    { name: "Nation", lng: 2.3961, lat: 48.8483 },
  ],
  unlockRiders: null,
  events: [
    {
      id: "psg",
      name: "PSG Match at Parc des Princes",
      emoji: "⚽",
      blurb: "Les Parisiens play at home and the west of the city fills up.",
      durationH: 4,
      leadH: 10,
      startHour: [20, 21],
      weight: 3,
      effects: [{ lat: 48.8414, lng: 2.253, r: 1300, kind: "surge", mult: 3.6, label: "Match day" }],
    },
    {
      id: "bastille",
      name: "Bastille Day Parade",
      emoji: "🎆",
      blurb: "The Champs-Élysées shuts down for the military parade and fireworks crowds.",
      durationH: 6,
      leadH: 30,
      startHour: [9, 11],
      weight: 2,
      effects: [
        { lat: 48.8698, lng: 2.3076, r: 900, kind: "closure", label: "Parade route" },
        { lat: 48.8698, lng: 2.3076, r: 1300, kind: "surge", mult: 3.2, label: "Spectators" },
      ],
    },
    {
      id: "fetemusique",
      name: "Fête de la Musique",
      emoji: "🎶",
      blurb: "Free concerts on every corner. Le Marais and Bastille are packed all night.",
      durationH: 7,
      leadH: 20,
      startHour: [18, 20],
      weight: 2,
      effects: [
        { lat: 48.8575, lng: 2.36, r: 900, kind: "surge", mult: 3.0, label: "Street music" },
        { lat: 48.853, lng: 2.37, r: 900, kind: "surge", mult: 2.6, label: "Street music" },
      ],
    },
    {
      id: "greve",
      name: "RATP Strike (Grève)",
      emoji: "🚇",
      blurb: "Metro and RER lines walk out. Everyone needs a bus today.",
      durationH: 20,
      leadH: 12,
      startHour: [6, 7],
      weight: 1,
      effects: [{ lat: 48.8566, lng: 2.3522, r: CITY_RADIUS, kind: "surge", mult: 1.8, label: "Strike" }],
    },
    {
      id: "fashionweek",
      name: "Fashion Week",
      emoji: "👗",
      blurb: "Shows and street-style crowds clog the Champs-Élysées and Marais.",
      durationH: 10,
      leadH: 24,
      startHour: [10, 12],
      weight: 1,
      effects: [
        { lat: 48.8698, lng: 2.3076, r: 900, kind: "surge", mult: 2.2, label: "Shows" },
        { lat: 48.8575, lng: 2.36, r: 900, kind: "surge", mult: 2.0, label: "Shows" },
      ],
    },
  ],
};

export const CITIES: CityDef[] = [MADRID, BARCELONA, LISBON, PARIS];
