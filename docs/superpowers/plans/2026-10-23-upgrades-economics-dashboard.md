# Upgrades & Economics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players spend cash on permanent fleet upgrades (global, per transit mode, or per-line) and view them alongside a performance dashboard.

**Architecture:** A data-driven upgrade catalog and an `effectiveStats()` lookup function added to the existing pure-logic `lib/sim.ts` engine, replacing direct `MODE_STATS[line.mode]` reads at the three sim call sites that need upgraded values. A new standalone `components/UpgradesPanel.tsx` modal (opened from a new top-bar button in `components/Game.tsx`) renders the shop and two hand-rolled SVG sparklines, calling two new purchase-handler functions that live in `Game.tsx` next to the existing `buyBus`/`travelTo` actions.

**Tech Stack:** Next.js 16 / React 19 / TypeScript (strict, no `any`) / Tailwind 4. No new dependencies. No test framework exists in this repo — verification is `tsc --noEmit` plus scripted browser checks (Playwright via `npx`, not committed), matching how every prior feature in this repo was verified. Pure logic in `lib/sim.ts` is additionally verified with an ephemeral `npx tsx` script (not committed) for a real red/green cycle without adding a permanent test runner dependency.

**Spec:** `docs/superpowers/specs/2026-10-23-upgrades-economics-dashboard-design.md`

## Global Constraints

- Upgrades cost cash only — no new resource (spec: Non-goals).
- Each upgrade is owned or not owned, one-time — no tiers/levels (spec: Non-goals).
- Vehicle purchase price always comes from base `MODE_STATS[mode].price` — upgrades never change it (spec: Data model, "Vehicle price and icon/label always come from the base `MODE_STATS[mode]`").
- No charting library — sparklines are hand-rolled inline SVG (spec: Non-goals).
- Global upgrades carry over on `travelTo()`; per-line upgrades do not (spec: Persistence across city travel).
- Strict TypeScript, no `any` (project `CLAUDE.md`).
- Tailwind utility classes only, no custom inline CSS sheets (project `CLAUDE.md`).
- The 💰 infinite-money and 🏙️ 3D-tilt toggle states must stay intact across this new view (project `CLAUDE.md`) — the dashboard is an overlay, not a route change, so this is satisfied by construction as long as no task resets that state when opening/closing it.

## Review Focus

- A player double-clicking "Buy" on an already-owned global upgrade before the UI re-renders disabled must not be charged twice — `buyGlobalUpgrade` needs its own owned-check, not just a disabled button.
- The same race for the per-line capacity upgrade — `buyLineCapUpgrade` needs its own `capUpgrade`-already-true check.
- A click on an unaffordable upgrade (cash just under cost, e.g. clicked before cash ticks up) must not drive cash negative — the handler itself must gate on cash, not rely solely on the disabled attribute.
- Sparklines on day 1 before the first `rollDay()` has ever run see `g.history = []` (0 points) — must render without NaN/crash, not assume ≥2 points.
- A global upgrade for one mode (e.g. `bus-cap`) must not change another mode's (tram/metro) effective stats, and a per-line `capUpgrade` on one line must not change a sibling line's stats — `sumUpgradeMult`'s mode filter and `effectiveStats`'s per-line flag are the two places this can leak.

---

## File Structure

- **Modify `lib/sim.ts`**: upgrade catalog types/data, `Game.globalUpgrades`, `Line.capUpgrade`, `effectiveStats()`/`sumUpgradeMult()`, and the three call-site swaps (`arrive`, `stepBus`, `tick`) plus the rep-gain multiplier.
- **Create `components/UpgradesPanel.tsx`**: the dashboard modal — performance sparklines, global upgrade grid, per-line upgrade list. Owns its own small `Sparkline` subcomponent (single-use, not worth a separate file).
- **Modify `components/Game.tsx`**: `buyGlobalUpgrade`/`buyLineCapUpgrade` handlers, `upgradesOpen` state, top-bar 📊 button, `travelTo()` persistence line, Lines card capacity display swapped to `effectiveStats`.

---

### Task 1: Upgrade catalog and effective-stats engine

**Files:**
- Modify: `lib/sim.ts`

**Interfaces:**
- Consumes: existing `Mode`, `ModeStats`, `MODE_STATS`, `Game`, `Line`, `createGame`, `buildLine`, `addBus`, `tick` (all already in this file).
- Produces (for Task 2): `UpgradeDef`, `UpgradeEffect`, `GLOBAL_UPGRADES: UpgradeDef[]`, `LINE_CAP_UPGRADE_COST: number`, `LINE_CAP_UPGRADE_MULT: number`, `effectiveStats(g: Game, line: Line): ModeStats`, `sumUpgradeMult(g: Game, kind: UpgradeEffect["kind"], mode?: Mode): number`, `Game.globalUpgrades: Set<string>`, `Line.capUpgrade?: boolean`.

- [ ] **Step 1: Write the failing verification script**

Create `/tmp/verify-upgrades-engine.ts` (not part of the repo):

```ts
import {
  CITIES,
} from "/Users/cburdick28/Documents/OpenVoiceOS/transport/lib/cities";
import {
  createGame, buildLine, addBus, tick, MODE_STATS,
  GLOBAL_UPGRADES, LINE_CAP_UPGRADE_COST, LINE_CAP_UPGRADE_MULT,
  effectiveStats, sumUpgradeMult,
} from "/Users/cburdick28/Documents/OpenVoiceOS/transport/lib/sim";

function assertEq(label: string, actual: number, expected: number, eps = 1e-6) {
  if (Math.abs(actual - expected) > eps) {
    console.error(`FAIL ${label}: got ${actual}, want ${expected}`);
    process.exitCode = 1;
  } else console.log(`ok ${label}`);
}

// catalog shape and values
const byId = Object.fromEntries(GLOBAL_UPGRADES.map((u) => [u.id, u]));
assertEq("bus-cap cost", byId["bus-cap"].cost, 180_000);
assertEq("bus-electric cost", byId["bus-electric"].cost, 220_000);
assertEq("tram-signals cost", byId["tram-signals"].cost, 260_000);
assertEq("metro-tracks cost", byId["metro-tracks"].cost, 500_000);
assertEq("metro-cars cost", byId["metro-cars"].cost, 450_000);
assertEq("real-time-displays cost", byId["real-time-displays"].cost, 150_000);
assertEq("LINE_CAP_UPGRADE_COST", LINE_CAP_UPGRADE_COST, 90_000);
assertEq("LINE_CAP_UPGRADE_MULT", LINE_CAP_UPGRADE_MULT, 1.3);

// effectiveStats: no upgrades owned -> matches base
const g = createGame(CITIES[0]);
const busLine = buildLine(g, [[-3.7, 40.4], [-3.69, 40.41]], [[[-3.7, 40.4], [-3.69, 40.41]]], "#fff", "bus");
assertEq("base bus cap", effectiveStats(g, busLine).cap, MODE_STATS.bus.cap);
assertEq("base bus speed", effectiveStats(g, busLine).speed, MODE_STATS.bus.speed);
assertEq("base bus cost", effectiveStats(g, busLine).costPerMin, MODE_STATS.bus.costPerMin);

// global cap upgrade
g.globalUpgrades.add("bus-cap");
assertEq("upgraded bus cap", effectiveStats(g, busLine).cap, 40 * 1.25);

// global cost upgrade stacks independently
g.globalUpgrades.add("bus-electric");
assertEq("upgraded bus cost", effectiveStats(g, busLine).costPerMin, (85 / 60) * 0.7);

// per-line cap upgrade stacks multiplicatively with the global one
busLine.capUpgrade = true;
assertEq("line+global bus cap", effectiveStats(g, busLine).cap, 40 * 1.25 * 1.3);

// mode isolation: a tram line is untouched by bus upgrades
const tramLine = buildLine(g, [[-3.7, 40.4], [-3.69, 40.41]], [[[-3.7, 40.4], [-3.69, 40.41]]], "#fff", "tram");
assertEq("tram cap unaffected", effectiveStats(g, tramLine).cap, MODE_STATS.tram.cap);
assertEq("tram speed unaffected", effectiveStats(g, tramLine).speed, MODE_STATS.tram.speed);
assertEq("tram cost unaffected", effectiveStats(g, tramLine).costPerMin, MODE_STATS.tram.costPerMin);

// rep-gain multiplier
assertEq("repGainMult default", sumUpgradeMult(g, "repGainMult"), 1);
g.globalUpgrades.add("real-time-displays");
assertEq("repGainMult owned", sumUpgradeMult(g, "repGainMult"), 1.4);

// tick() integration: a metro-tracks upgrade makes a metro bus cover more
// ground in the same dt
const g2 = createGame(CITIES[0]);
const metro = buildLine(g2, [[-3.7, 40.4], [-3.65, 40.45]], [[[-3.7, 40.4], [-3.65, 40.45]]], "#fff", "metro");
addBus(g2, metro);
g2.lines.push(metro);
tick(g2, 1);
const baseline = metro.buses[0].d;
const g3 = createGame(CITIES[0]);
g3.globalUpgrades.add("metro-tracks");
const metro2 = buildLine(g3, [[-3.7, 40.4], [-3.65, 40.45]], [[[-3.7, 40.4], [-3.65, 40.45]]], "#fff", "metro");
addBus(g3, metro2);
g3.lines.push(metro2);
tick(g3, 1);
const upgraded = metro2.buses[0].d;
if (!(upgraded > baseline)) {
  console.error(`FAIL tick speed upgrade: upgraded=${upgraded} baseline=${baseline}`);
  process.exitCode = 1;
} else console.log("ok tick speed upgrade");

if (process.exitCode) process.exit(1);
console.log("ALL OK");
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx --yes tsx /tmp/verify-upgrades-engine.ts`
Expected: a TypeScript error — `GLOBAL_UPGRADES`, `effectiveStats`, `sumUpgradeMult`, `LINE_CAP_UPGRADE_COST`, `LINE_CAP_UPGRADE_MULT` don't exist yet, and `Game`/`Line` don't have `globalUpgrades`/`capUpgrade`.

- [ ] **Step 3: Implement the catalog and types in `lib/sim.ts`**

Add near `MODE_STATS`:

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

Add `globalUpgrades: Set<string>` to the `Game` interface and `capUpgrade?: boolean` to the `Line` interface. In `createGame`, initialize `globalUpgrades: new Set()`.

- [ ] **Step 4: Implement `sumUpgradeMult` and `effectiveStats` in `lib/sim.ts`**

```ts
export function sumUpgradeMult(g: Game, kind: UpgradeEffect["kind"], mode?: Mode): number {
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

The `"mode" in def.effect` narrowing is required for the discriminated union to type-check under strict mode (`repGainMult` has no `mode` field).

- [ ] **Step 5: Wire `effectiveStats` into the sim engine**

- `arrive()`: replace the existing `MODE_STATS[line.mode].cap` read with `effectiveStats(g, line).cap`. Multiply the existing rep-gain term (`g.rep += (Math.max(0, 100 - wait * 2.2) - g.rep) * 0.02`) by `sumUpgradeMult(g, "repGainMult")` — only this term, not the abandonment-penalty term in `spawnPax`.
- `stepBus()`: replace `MODE_STATS[line.mode].speed` with `effectiveStats(g, line).speed`.
- `tick()`: replace `MODE_STATS[line.mode].costPerMin` with `effectiveStats(g, line).costPerMin`.

- [ ] **Step 6: Run the verification script again**

Run: `npx --yes tsx /tmp/verify-upgrades-engine.ts`
Expected: every line prints `ok ...`, final line `ALL OK`, exit code 0.

- [ ] **Step 7: Run the project type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Delete the scratch script and commit**

```bash
rm /tmp/verify-upgrades-engine.ts
git add lib/sim.ts
git commit -m "Add upgrade catalog and effective-stats engine"
```

---

### Task 2: Upgrades dashboard UI, purchase actions, and persistence

**Files:**
- Create: `components/UpgradesPanel.tsx`
- Modify: `components/Game.tsx`

**Interfaces:**
- Consumes from Task 1: `Game`, `Line`, `Mode`, `MODE_STATS`, `GLOBAL_UPGRADES`, `UpgradeDef`, `LINE_CAP_UPGRADE_COST`, `LINE_CAP_UPGRADE_MULT`, `effectiveStats(g, line)`.
- Produces: `UpgradesPanel` default export with props `{ game: Game; onClose: () => void; onBuyGlobal: (id: string) => void; onBuyLineCap: (lineId: number) => void }`.

- [ ] **Step 1: Build `components/UpgradesPanel.tsx`**

A client component (`"use client"`) exporting a local `Sparkline({ data, color }: { data: number[]; color: string })` (fixed `viewBox="0 0 160 40"`, min/max-normalized polyline; when `data.length < 2`, render a flat centered line at y=20 instead of computing a range, so a 0- or 1-point `g.history` never divides by zero) and the default `UpgradesPanel` export with the three sections from the spec's UI section: Performance (two `Sparkline`s fed by `game.history.map(h => h.profit)` and `game.history.map(h => h.riders)`), Fleet Upgrades (one card per `GLOBAL_UPGRADES` entry — `game.globalUpgrades.has(u.id)` decides "Owned ✓" vs. a `disabled={game.cash < u.cost}` "Buy €cost" button calling `onBuyGlobal(u.id)`), Line Upgrades (one row per `game.lines`, `line.capUpgrade` decides "Upgraded ✓" vs. a `disabled={game.cash < LINE_CAP_UPGRADE_COST}` buy button calling `onBuyLineCap(line.id)`; an empty-state message when `game.lines.length === 0`). Fixed overlay: `fixed inset-0 z-30` scrim, a centered panel styled `bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl` per the spec, with a close button calling `onClose`.

- [ ] **Step 2: Wire purchase handlers into `components/Game.tsx`**

Add, near the existing `buyBus`/`toggleInfinite` functions:

```ts
function buyGlobalUpgrade(id: string) {
  const def = GLOBAL_UPGRADES.find((u) => u.id === id);
  if (!def || g.globalUpgrades.has(id)) return;
  if (g.cash < def.cost) return flash(`Need ${eur(def.cost)}`);
  g.cash -= def.cost;
  g.globalUpgrades.add(id);
  pushLog(g, `Bought upgrade: ${def.icon} ${def.name}`, "good");
  force((v) => v + 1);
}

function buyLineCapUpgrade(lineId: number) {
  const line = g.lines.find((l) => l.id === lineId);
  if (!line || line.capUpgrade) return;
  if (g.cash < LINE_CAP_UPGRADE_COST) return flash(`Need ${eur(LINE_CAP_UPGRADE_COST)}`);
  g.cash -= LINE_CAP_UPGRADE_COST;
  line.capUpgrade = true;
  pushLog(g, `${line.name}: fleet capacity upgraded`, "good");
  force((v) => v + 1);
}
```

Import `GLOBAL_UPGRADES`, `LINE_CAP_UPGRADE_COST`, `effectiveStats` from `@/lib/sim` alongside the existing imports.

- [ ] **Step 3: Add the dashboard toggle and mount `UpgradesPanel`**

Add `const [upgradesOpen, setUpgradesOpen] = useState(false);` next to the existing `tilted` state. Add a `📊 Upgrades` button to the top bar, styled consistently with the existing 💰/🏙️ toggle buttons, calling `setUpgradesOpen(true)`. After the top bar's closing JSX, add:

```tsx
{upgradesOpen && (
  <UpgradesPanel
    game={g}
    onClose={() => setUpgradesOpen(false)}
    onBuyGlobal={buyGlobalUpgrade}
    onBuyLineCap={buyLineCapUpgrade}
  />
)}
```

- [ ] **Step 4: Persist global upgrades across city travel**

In `travelTo()`, immediately after the existing `game.current = createGame(city, g.cash);` line, add:

```ts
game.current.globalUpgrades = new Set(g.globalUpgrades);
```

- [ ] **Step 5: Show effective capacity in the Lines card**

In the Lines card's per-line row (`components/Game.tsx`), replace the capacity figure currently read from `MODE_STATS[l.mode].cap` with `effectiveStats(g, l).cap`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Browser-verify the purchase guards (Review Focus items 1–3)**

Start the dev server (`npm run dev`), load the app with a fresh game (starting cash €150,000, no infinite money). Open the 📊 dashboard.

*Insufficient cash, not owned:* confirm **Faster Metro Tracks** (€500,000) shows a disabled "Buy" button and clicking it (if reachable at all) changes neither cash nor its owned state — cash stays €150,000 and the card still reads "Buy", not "Owned ✓".

*Owned guard:* click "Buy" on **Real-Time Displays** (cost exactly €150,000): confirm cash reads €0 and the card now shows "Owned ✓". Click where the button was again (or re-open the dashboard and click any remaining disabled buy button): confirm cash is still €0, not negative, and no second "Bought upgrade" log entry was added. This covers both the already-owned guard and the boundary case where cash exactly equals cost.

- [ ] **Step 8: Browser-verify the dashboard end-to-end (Review Focus items 4–5)**

With a fresh game, open the dashboard before any line exists or any day has rolled over: confirm both sparklines render (flat line, no crash, no console error) and the Line Upgrades section shows its empty state. Toggle 💰 infinite money on. Build a bus line and a tram line. Re-open the dashboard: buy **High-Capacity Buses** (global, bus-only) and confirm the Lines card's bus line capacity increases but the tram line's capacity is unchanged (mode isolation). Buy the per-line capacity upgrade on the bus line and confirm only that line's capacity changes again, not the tram line's; note the bus line's exact capacity reading, then click that same line's upgrade button again and confirm the capacity reading and cash are unchanged (per-line double-buy guard) and no second "fleet capacity upgraded" log entry appears. Confirm zero console errors throughout.

- [ ] **Step 9: Browser-verify persistence across city travel**

Temporarily lower `MADRID`'s `unlockRiders` in `lib/cities.ts` to a small number (mirrors the technique already used in this repo's git history for the multi-city feature), reach the threshold with infinite money + a running line, confirm the unlock toast, travel to Barcelona, and confirm `g.globalUpgrades` still contains the upgrades bought in Madrid (re-open the dashboard in Barcelona and check the "Owned ✓" badges) while the per-line upgrade from the Madrid line is gone (Barcelona starts with no lines, by construction). Revert the `unlockRiders` change and re-run `npx tsc --noEmit` to confirm the repo is clean again.

- [ ] **Step 10: Commit**

```bash
git add components/UpgradesPanel.tsx components/Game.tsx
git commit -m "Add upgrades dashboard, purchase actions, and travel persistence"
```
