# Upgrades & Economics Dashboard

Status: approved design, ready for implementation planning
Date: 2026-10-23

## Context

This is item 5 of 6 from a broader "visual + gameplay overhaul" request for Transit
Manager (`cburdick28-spec/transport`), which was scoped down per-subsystem rather
than attempted as one branch. The other five items (glow/styled line rendering,
smooth vehicle animation, day/night cycle, weather engine, transfer-aware passenger
AI) are explicitly out of scope here and will get their own specs if requested.

The game is a client-side Next.js + MapLibre GL transit sim. Game state lives in a
mutable `Game` object (`lib/sim.ts`) held in a React `useRef` and mutated by a
`requestAnimationFrame` loop; React re-renders are throttled to ~4/sec for UI only.
Per-city content (zones, hubs, events) is data-driven via `CityDef` in
`lib/cities.ts`. Vehicle economics (price/capacity/speed/running cost per mode) live
in a static `MODE_STATS: Record<Mode, ModeStats>` table in `lib/sim.ts`, read
directly at every call site that needs it.

## Goal

Let players spend cash on permanent upgrades that improve their fleet's capacity,
speed, running cost, or passenger happiness — both city-wide (global, per transit
mode) and for a single line (per-line) — and give them a dashboard to see those
options alongside recent financial/ridership performance.

## Non-goals

- No new currency/resource (research points, etc.) — upgrades cost cash only.
- No upgrade tiers/levels in v1 — each upgrade is owned or not owned, one-time.
- No changes to vehicle purchase price — upgrades affect cap/speed/cost, not the
  price of buying a new vehicle.
- No charting library dependency — sparklines are hand-rolled inline SVG.
- Does not touch rendering/animation, weather, day-night, or passenger-transfer
  systems (separate specs).

## Data model (`lib/sim.ts`)

### Upgrade catalog

```ts
export type UpgradeEffect =
  | { kind: "modeCapMult"; mode: Mode; mult: number }
  | { kind: "modeSpeedMult"; mode: Mode; mult: number }
  | { kind: "modeCostMult"; mode: Mode; mult: number }
  | { kind: "repGainMult"; mult: number };

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  cost: number;
  effect: UpgradeEffect;
}

export const GLOBAL_UPGRADES: UpgradeDef[] = [
  { id: "bus-cap", name: "High-Capacity Buses", icon: "🚌", blurb: "Articulated buses carry more riders per trip.", cost: 180_000, effect: { kind: "modeCapMult", mode: "bus", mult: 1.25 } },
  { id: "bus-electric", name: "Electric Buses", icon: "🔋", blurb: "Lower running costs, cleaner streets.", cost: 220_000, effect: { kind: "modeCostMult", mode: "bus", mult: 0.7 } },
  { id: "tram-signals", name: "Tram Priority Signals", icon: "🚦", blurb: "Trams get green lights at every junction.", cost: 260_000, effect: { kind: "modeSpeedMult", mode: "tram", mult: 1.2 } },
  { id: "metro-tracks", name: "Faster Metro Tracks", icon: "🛤️", blurb: "Upgraded rail lets trains run faster.", cost: 500_000, effect: { kind: "modeSpeedMult", mode: "metro", mult: 1.2 } },
  { id: "metro-cars", name: "Extended Metro Cars", icon: "🚇", blurb: "Longer trains, more capacity per run.", cost: 450_000, effect: { kind: "modeCapMult", mode: "metro", mult: 1.25 } },
  { id: "real-time-displays", name: "Real-Time Displays", icon: "📱", blurb: "Riders trust a system that tells them the truth.", cost: 150_000, effect: { kind: "repGainMult", mult: 1.4 } },
];

export const LINE_CAP_UPGRADE_COST = 90_000;
export const LINE_CAP_UPGRADE_MULT = 1.3;
```

Six global upgrades, one per-line upgrade type ("Extra Carriages," +30% capacity for
that line only). This is intentionally a short v1 catalog — easy to extend later
since it's data, not code, matching the existing `MODE_STATS`/`CITIES` pattern.

### Game state

```ts
export interface Game {
  // ...existing fields...
  globalUpgrades: Set<string>; // owned GLOBAL_UPGRADES ids
}

export interface Line {
  // ...existing fields...
  capUpgrade?: boolean;
}
```

`createGame` initializes `globalUpgrades: new Set()`.

### Effective stats

A new `effectiveStats(g: Game, line: Line): ModeStats` replaces direct
`MODE_STATS[line.mode]` reads wherever upgrades should apply:

```ts
function sumUpgradeMult(g: Game, kind: UpgradeEffect["kind"], mode?: Mode): number {
  let m = 1;
  for (const id of g.globalUpgrades) {
    const def = GLOBAL_UPGRADES.find((u) => u.id === id);
    if (!def || def.effect.kind !== kind) continue;
    if ("mode" in def.effect && def.effect.mode !== mode) continue;
    m *= def.effect.mult;
  }
  return m;
}

export function effectiveStats(g: Game, line: Line): ModeStats {
  const base = MODE_STATS[line.mode];
  const cap = base.cap * sumUpgradeMult(g, "modeCapMult", line.mode) * (line.capUpgrade ? LINE_CAP_UPGRADE_MULT : 1);
  const speed = base.speed * sumUpgradeMult(g, "modeSpeedMult", line.mode);
  const costPerMin = base.costPerMin * sumUpgradeMult(g, "modeCostMult", line.mode);
  return { ...base, cap, speed, costPerMin };
}
```

Call sites that switch from `MODE_STATS[line.mode]` to `effectiveStats(g, line)`:
- `arrive()` — boarding capacity check (`cap`)
- `stepBus()` — movement speed (`speed`)
- `tick()` — running cost accrual (`costPerMin`)
- `components/Game.tsx` — the Lines card's displayed capacity/mode line

Vehicle **price** and **icon/label** always come from the base `MODE_STATS[mode]` —
upgrades never change what a new vehicle costs to buy.

Reputation gain: in `arrive()`, the existing rep-gain term
(`g.rep += (Math.max(0, 100 - wait * 2.2) - g.rep) * 0.02`) is multiplied by
`sumUpgradeMult(g, "repGainMult")`. Only the positive gain term is affected —
abandonment penalties in `spawnPax` are untouched, so Real-Time Displays rewards
good service rather than blunting the penalty for bad service.

### Persistence across city travel

Global upgrades represent fleet technology the player owns, not per-city
infrastructure, so they carry over on `travelTo()` the same way cash does:

```ts
game.current = createGame(city, g.cash);
game.current.globalUpgrades = new Set(g.globalUpgrades);
```

Per-line upgrades (`capUpgrade`) do **not** carry over — lines themselves are
already discarded on travel, so this requires no new code, just confirming the
existing reset behavior is correct for the new field too.

## UI (`components/Game.tsx`)

### Entry point

A new top-bar toggle button, alongside the existing 💰 and 🏙️ buttons:

```
📊 Upgrades
```

Opens a centered modal overlay (`fixed inset-0 z-30`, dark scrim backdrop,
click-outside-to-close), distinct in style from the rest of the UI's opaque dark
cards — genuinely translucent glassmorphism:
`bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl`.

### Section 1 — Performance

Two small inline SVG sparklines, built from the existing `g.history` (already
capped at 14 entries: `{ day, profit, riders }`):
- Profit per day (red/green depending on sign)
- Riders per day

A reusable `Sparkline({ data, color }: { data: number[]; color: string })`
component: fixed viewBox, min/max-normalized polyline, no axes/labels — a glance
indicator, not a full chart. No new dependency.

### Section 2 — Fleet Upgrades (global)

A grid of cards, one per `GLOBAL_UPGRADES` entry: icon, name, blurb, and either a
"Buy €cost" button (disabled + dimmed if `g.cash < cost`) or an "Owned ✓" badge if
already in `g.globalUpgrades`.

`buyGlobalUpgrade(id: string)`: guards on affordability and not-already-owned,
deducts cash, adds to the set, logs via `pushLog`.

### Section 3 — Line Upgrades (per-line)

One row per current line (empty state if no lines yet): line name/color/mode icon,
and either a "Upgrade capacity +30% · €90,000" button or an "Upgraded ✓" badge.

`buyLineCapUpgrade(lineId: number)`: same guard pattern, sets `line.capUpgrade = true`.

## Testing

- `tsc --noEmit` clean.
- Browser-verified: open the dashboard, confirm sparklines render from real
  `g.history` data, buy a global upgrade and confirm the relevant stat changes
  (e.g. bus capacity rises, boarding reflects it), buy a line upgrade and confirm
  only that line is affected, confirm owned upgrades show "Owned ✓" and can't be
  bought twice, confirm insufficient-cash buttons are disabled, confirm global
  upgrades (but not line upgrades) survive a `travelTo()` city switch.
- Zero console errors during the above.
