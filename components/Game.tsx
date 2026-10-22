"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BUS_CAP,
  BUS_PRICE,
  SHUTTLE_BUSES,
  SHUTTLE_COLOR,
  SHUTTLE_COST,
  STOP_PRICE,
  ZONES,
  addBus,
  buildLine,
  createGame,
  fmtClock,
  fxAt,
  pickHub,
  pushLog,
  tick,
  type Game,
  type LngLat,
} from "@/lib/sim";

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#38bdf8", "#a78bfa", "#f472b6", "#14b8a6", "#eab308"];
const SPEEDS = [0, 3, 9, 24]; // game minutes per real second
const SPEED_LABELS = ["⏸", "1×", "3×", "8×"];
const TILE_PROVIDERS: string[][] = [
  [
    "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  ],
  ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
];
const EMPTY = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;

const eur = (n: number) =>
  (n < 0 ? "-" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("en-US");

function circlePoly(lat: number, lng: number, r: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const pts: [number, number][] = [];
  const dLat = r / 111320;
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}

async function fetchLeg(a: LngLat, b: LngLat): Promise<LngLat[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: ctrl.signal });
    const json = await res.json();
    const coords = json?.routes?.[0]?.geometry?.coordinates as LngLat[] | undefined;
    if (coords && coords.length >= 2) return coords;
  } catch {
    /* fall through to straight line */
  } finally {
    clearTimeout(timer);
  }
  return [a, b];
}

export default function GameView() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const game = useRef<Game>(createGame());
  const speedRef = useRef(1);
  const buildRef = useRef(false);
  const draftRef = useRef<LngLat[]>([]);
  const linesVer = useRef(0);
  const lineSig = useRef("");
  const prevSpeed = useRef(1);
  const markers = useRef<Map<number, maplibregl.Marker>>(new Map());

  const [, force] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [routing, setRouting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tiles, setTilesState] = useState<"ok" | "osm" | "blocked">("ok");

  const g = game.current;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // ---------- map setup ----------
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        sources: {
          base: {
            type: "raster",
            tiles: TILE_PROVIDERS[0],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors © CARTO",
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#0b0f17" } },
          { id: "base", type: "raster", source: "base" },
        ],
      },
      center: [-3.7038, 40.4168],
      zoom: 12.3,
      minZoom: 10.5,
      maxBounds: [
        [-4.0, 40.25],
        [-3.4, 40.6],
      ],
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // If map tiles can't load (school filter, offline), fall back and then keep playing on a blank map
    let provider = 0;
    let tileErrs = 0;
    let tileOk = 0;
    map.on("data", (ev) => {
      const e = ev as { sourceId?: string; tile?: unknown };
      if (e.sourceId === "base" && e.tile) tileOk++;
    });
    map.on("error", (ev) => {
      const e = ev as { sourceId?: string; tile?: unknown };
      if (e.sourceId !== "base" || !e.tile) return;
      tileErrs++;
      if (tileOk > 0 || tileErrs < 6) return;
      tileErrs = 0;
      provider++;
      if (provider < TILE_PROVIDERS.length) {
        try {
          (map.getSource("base") as maplibregl.RasterTileSource).setTiles(TILE_PROVIDERS[provider]);
          setTilesState("osm");
        } catch {
          setTilesState("blocked");
        }
      } else {
        setTilesState("blocked");
      }
    });

    map.on("load", () => {
      for (const id of ["zones", "events", "lines", "stops", "buses", "draft"]) {
        map.addSource(id, { type: "geojson", data: EMPTY });
      }
      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "zones",
        paint: { "fill-color": "#38bdf8", "fill-opacity": ["get", "o"] },
      });
      (map.getSource("zones") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: ZONES.map((z) => {
          const f = circlePoly(z.lat, z.lng, z.r);
          f.properties = { o: (z.w / 100) * 0.12 };
          return f;
        }),
      });
      map.addLayer({
        id: "events-fill",
        type: "fill",
        source: "events",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["==", ["get", "status"], "active"], 0.28, 0.07],
        },
      });
      map.addLayer({
        id: "events-line",
        type: "line",
        source: "events",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "lines-casing",
        type: "line",
        source: "lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0b0f17", "line-width": 7 },
      });
      map.addLayer({
        id: "lines",
        type: "line",
        source: "lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4 },
      });
      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#ffffff", "line-width": 3, "line-dasharray": [1.5, 1.5] },
      });
      map.addLayer({
        id: "draft-pts",
        type: "circle",
        source: "draft",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#111827",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "w"], 0, 4, 40, 13],
          "circle-color": ["case", ["get", "closed"], "#ef4444", "#ffffff"],
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 2.5,
        },
      });
      map.addLayer({
        id: "buses",
        type: "circle",
        source: "buses",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      linesVer.current++;
    });

    map.on("click", (e) => {
      if (!buildRef.current) return;
      draftRef.current = [...draftRef.current, [e.lngLat.lng, e.lngLat.lat]];
      setDraft(draftRef.current);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // cursor + draft preview
  useEffect(() => {
    buildRef.current = building;
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = building ? "crosshair" : "";
  }, [building]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let src: maplibregl.GeoJSONSource | undefined;
    try {
      src = map.getSource("draft") as maplibregl.GeoJSONSource | undefined;
    } catch {
      return;
    }
    if (!src) return;
    const feats: GeoJSON.Feature[] = draft.map((p) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: p },
    }));
    if (draft.length > 1) {
      feats.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: draft },
      });
    }
    src.setData({ type: "FeatureCollection", features: feats });
  }, [draft]);

  // ---------- game loop ----------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastRender = 0;
    let lastUi = 0;
    let lastEv = 0;

    const loop = (nowMs: number) => {
      const realDt = Math.min(0.1, (nowMs - last) / 1000);
      last = nowMs;
      const sp = SPEEDS[speedRef.current === undefined ? 1 : speedIndex(speedRef.current)];
      if (sp > 0 && !game.current.bankrupt) tick(game.current, realDt * sp);

      const map = mapRef.current;
      const ready = map && map.getSource("buses");
      if (ready && map) {
        const gm = game.current;
        if (nowMs - lastRender > 90) {
          lastRender = nowMs;
          const busF: GeoJSON.Feature[] = [];
          for (const l of gm.lines)
            for (const b of l.buses)
              busF.push({
                type: "Feature",
                properties: { color: l.color },
                geometry: { type: "Point", coordinates: [b.lng, b.lat] },
              });
          (map.getSource("buses") as maplibregl.GeoJSONSource).setData({
            type: "FeatureCollection",
            features: busF,
          });
          const stopF: GeoJSON.Feature[] = [];
          for (const l of gm.lines)
            for (const s of l.stops)
              stopF.push({
                type: "Feature",
                properties: { color: l.color, w: s.queue.length, closed: s.closed },
                geometry: { type: "Point", coordinates: [s.lng, s.lat] },
              });
          (map.getSource("stops") as maplibregl.GeoJSONSource).setData({
            type: "FeatureCollection",
            features: stopF,
          });
        }
        const sig = gm.lines.map((l) => l.id).join(",");
        if (sig !== lineSig.current) {
          lineSig.current = sig;
          linesVer.current++;
        }
        if (linesVer.current > 0) {
          linesVer.current = 0;
          (map.getSource("lines") as maplibregl.GeoJSONSource).setData({
            type: "FeatureCollection",
            features: gm.lines.map((l) => ({
              type: "Feature",
              properties: { color: l.color },
              geometry: { type: "LineString", coordinates: l.coords },
            })),
          });
        }
        if (nowMs - lastEv > 800) {
          lastEv = nowMs;
          const evF: GeoJSON.Feature[] = [];
          const alive = new Set<number>();
          for (const e of gm.events) {
            if (!e.announced || e.ended) continue;
            alive.add(e.uid);
            const status = e.started ? "active" : "soon";
            for (const ef of e.def.effects) {
              if (ef.r > 1e6) continue;
              const color =
                ef.kind === "closure" ? "#ef4444" : ef.kind === "surge" ? "#fbbf24" : "#60a5fa";
              const poly = circlePoly(ef.lat, ef.lng, ef.r);
              poly.properties = { color, status };
              evF.push(poly);
            }
            // emoji pin on the first area
            const first = e.def.effects.find((x) => x.r < 1e6);
            if (first && !markers.current.has(e.uid)) {
              const el = document.createElement("div");
              el.textContent = e.def.emoji;
              el.style.cssText =
                "font-size:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.7));pointer-events:none";
              markers.current.set(
                e.uid,
                new maplibregl.Marker({ element: el }).setLngLat([first.lng, first.lat]).addTo(map),
              );
            }
          }
          for (const [uid, m] of markers.current) {
            if (!alive.has(uid)) {
              m.remove();
              markers.current.delete(uid);
            }
          }
          (map.getSource("events") as maplibregl.GeoJSONSource).setData({
            type: "FeatureCollection",
            features: evF,
          });
        }
      }
      if (nowMs - lastUi > 250) {
        lastUi = nowMs;
        force((v) => v + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- actions ----------
  function setSpd(i: number) {
    if (i > 0) prevSpeed.current = i;
    speedRef.current = i;
    setSpeed(i);
  }

  const togglePause = useCallback(() => {
    if (speedRef.current === 0) {
      speedRef.current = prevSpeed.current || 1;
    } else {
      prevSpeed.current = speedRef.current;
      speedRef.current = 0;
    }
    setSpeed(speedRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  async function startShuttle(uid: number) {
    const e = g.events.find((x) => x.uid === uid);
    if (!e || e.shuttle || e.ended) return;
    const target = e.def.effects.find((x) => x.kind === "surge" && x.r < 1e6);
    if (!target) return;
    if (fxAt(g, target.lat, target.lng).closed) return flash("That area is closed right now");
    if (g.cash < SHUTTLE_COST) return flash(`Shuttle lease costs ${eur(SHUTTLE_COST)}`);
    e.shuttle = true; // lock immediately so it can't be double-clicked
    g.cash -= SHUTTLE_COST;
    setRouting(true);
    const hub = pickHub(target.lat, target.lng);
    const a: LngLat = [hub.lng, hub.lat];
    const b: LngLat = [target.lng, target.lat];
    const leg = await fetchLeg(a, b);
    const line = buildLine(g, [a, b], [leg], SHUTTLE_COLOR);
    line.name = `${e.def.emoji} Shuttle`;
    line.shuttleUntil = e.end + 30;
    line.fareMult = 2; // event tickets cost double
    line.stops[0].base = Math.max(line.stops[0].base, 160); // hubs are busy
    for (let i = 0; i < SHUTTLE_BUSES; i++) addBus(g, line);
    g.lines.push(line);
    pushLog(g, `${e.def.emoji} Shuttle running ${hub.name} → ${e.def.name} (${SHUTTLE_BUSES} leased buses)`, "good");
    setRouting(false);
  }

  function undo() {
    draftRef.current = draftRef.current.slice(0, -1);
    setDraft(draftRef.current);
  }

  function cancelBuild() {
    draftRef.current = [];
    setDraft([]);
    setBuilding(false);
  }

  async function finishLine() {
    const pts = draftRef.current;
    if (pts.length < 2) return flash("Place at least 2 stops");
    const cost = pts.length * STOP_PRICE + BUS_PRICE;
    if (g.cash < cost) return flash(`Need ${eur(cost)} (stops + first bus)`);
    setRouting(true);
    const legs = await Promise.all(pts.slice(0, -1).map((p, i) => fetchLeg(p, pts[i + 1])));
    const color = COLORS[g.lines.length % COLORS.length];
    const line = buildLine(g, pts, legs, color);
    addBus(g, line);
    g.lines.push(line);
    g.cash -= cost;
    pushLog(g, `Opened ${line.name} with ${pts.length} stops (${(line.len / 1000).toFixed(1)} km)`, "good");
    linesVer.current++;
    setRouting(false);
    cancelBuild();
  }

  function buyBus(lineId: number) {
    const line = g.lines.find((l) => l.id === lineId);
    if (!line) return;
    if (g.cash < BUS_PRICE) return flash(`A bus costs ${eur(BUS_PRICE)}`);
    g.cash -= BUS_PRICE;
    addBus(g, line);
    pushLog(g, `Bought a bus for ${line.name}`, "info");
  }

  function focusLine(lineId: number) {
    const line = g.lines.find((l) => l.id === lineId);
    const map = mapRef.current;
    if (!line || !map) return;
    const b = new maplibregl.LngLatBounds();
    line.coords.forEach((c) => b.extend(c));
    map.fitBounds(b, { padding: 120, duration: 800, maxZoom: 15 });
  }

  const clock = fmtClock(g.now);
  const sat = Math.round(g.rep);
  const profitToday = g.revToday - g.costToday;
  const visibleEvents = g.events.filter((e) => e.announced && !e.ended);
  const liveEvents = visibleEvents.filter((e) => e.started);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b0f17] text-slate-100">
      <div ref={mapEl} className="absolute inset-0" />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-white/10 bg-[#0b0f17]/90 px-4 py-2 shadow-xl backdrop-blur">
          <Stat label="Cash" value={eur(g.cash)} tone={g.cash < 0 ? "bad" : "good"} />
          <Stat label="Today" value={(profitToday >= 0 ? "+" : "") + eur(profitToday)} tone={profitToday >= 0 ? "good" : "bad"} />
          <Stat label="Riders" value={g.ridersToday.toLocaleString("en-US")} />
          <Stat label="Happy" value={`${sat}%`} tone={sat > 60 ? "good" : sat > 35 ? "warn" : "bad"} />
        </div>
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/10 bg-[#0b0f17]/90 px-2 py-1.5 shadow-xl backdrop-blur">
          <span className="px-2 text-sm font-semibold tabular-nums">
            Day {clock.day} · {clock.time}
          </span>
          <button
            onClick={togglePause}
            title="Space"
            className={`h-8 rounded-lg px-3 text-sm font-bold transition ${
              speed === 0 ? "bg-amber-400 text-slate-900" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {speed === 0 ? "▶ Play" : "⏸ Pause"}
          </button>
          {SPEEDS.map((_, i) => i === 0 ? null : (
            <button
              key={i}
              onClick={() => setSpd(i)}
              className={`h-8 min-w-9 rounded-lg px-2 text-sm font-semibold transition ${
                speed === i ? "bg-white text-slate-900" : "text-slate-300 hover:bg-white/10"
              }`}
            >
              {SPEED_LABELS[i]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="pointer-events-auto ml-auto rounded-2xl border border-white/10 bg-[#0b0f17]/90 px-3 py-2 text-sm font-semibold shadow-xl backdrop-blur hover:bg-white/10"
        >
          {panelOpen ? "Hide panel" : "Show panel"}
        </button>
      </div>

      {tiles !== "ok" && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-sky-300/30 bg-black/70 px-4 py-1.5 text-xs font-semibold text-sky-200 backdrop-blur">
          {tiles === "osm"
            ? "Switched to the backup map server"
            : "Map tiles are blocked on this network. Blue glow = busy districts. The game still works."}
        </div>
      )}

      {speed === 0 && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-300/40 bg-black/70 px-4 py-1.5 text-sm font-bold tracking-wide text-amber-200 backdrop-blur">
          PAUSED · press Space to resume
        </div>
      )}

      {/* live event banners */}
      {liveEvents.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[72px] z-10 flex justify-center gap-2 px-3">
          {liveEvents.map((e) => (
            <div
              key={e.uid}
              className="rounded-full border border-amber-300/40 bg-amber-400/15 px-4 py-1.5 text-sm font-semibold text-amber-200 backdrop-blur"
            >
              {e.def.emoji} {e.def.name} · live
            </div>
          ))}
        </div>
      )}

      {/* side panel */}
      {panelOpen && (
        <div className="absolute bottom-3 left-3 top-[72px] z-10 flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col gap-3 overflow-y-auto pr-1">
          {/* build */}
          <Card title="Build">
            {!building ? (
              <button
                onClick={() => setBuilding(true)}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                + New bus line
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-300">
                  Click the map to place stops in order. {draft.length} placed · cost{" "}
                  <b>{eur(draft.length * STOP_PRICE + BUS_PRICE)}</b>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={finishLine}
                    disabled={routing || draft.length < 2}
                    className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                  >
                    {routing ? "Routing…" : "Open line"}
                  </button>
                  <button onClick={undo} className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
                    Undo
                  </button>
                  <button onClick={cancelBuild} className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
                    ✕
                  </button>
                </div>
              </div>
            )}
            <label className="mt-3 flex items-center justify-between text-sm text-slate-300">
              Fare
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.1}
                  value={g.fare}
                  onChange={(e) => {
                    g.fare = Number(e.target.value);
                    force((v) => v + 1);
                  }}
                  className="w-28 accent-emerald-400"
                />
                <b className="w-12 text-right tabular-nums">€{g.fare.toFixed(2)}</b>
              </span>
            </label>
          </Card>

          {/* events */}
          <Card title="Events">
            {visibleEvents.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing on the radar. Madrid is quiet… for now.</p>
            ) : (
              <ul className="space-y-2">
                {visibleEvents.map((e) => {
                  const live = e.started;
                  const mins = live ? e.end - g.now : e.start - g.now;
                  const h = Math.max(0, Math.round(mins / 60));
                  return (
                    <li key={e.uid} className="rounded-xl bg-white/5 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {e.def.emoji} {e.def.name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            live ? "bg-red-500/20 text-red-300" : "bg-amber-400/15 text-amber-200"
                          }`}
                        >
                          {live ? `live · ${h}h left` : `in ${h}h`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-snug text-slate-400">{e.def.blurb}</p>
                      {e.def.effects.some((x) => x.kind === "surge" && x.r < 1e6) &&
                        (e.shuttle ? (
                          <div className="mt-2 text-xs font-semibold text-fuchsia-300">🚌 Shuttle running</div>
                        ) : (
                          <button
                            onClick={() => startShuttle(e.uid)}
                            disabled={routing}
                            className="mt-2 w-full rounded-lg bg-fuchsia-500/20 px-2 py-1.5 text-xs font-bold text-fuchsia-200 transition hover:bg-fuchsia-500/30 disabled:opacity-40"
                          >
                            🚌 Run event shuttle · {eur(SHUTTLE_COST)} · 2× fares
                          </button>
                        ))}
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                        {e.def.effects
                          .filter((x) => x.r < 1e6)
                          .map((x, i) => (
                            <span
                              key={i}
                              className={`rounded-md px-1.5 py-0.5 ${
                                x.kind === "closure"
                                  ? "bg-red-500/15 text-red-300"
                                  : x.kind === "surge"
                                    ? "bg-amber-400/15 text-amber-200"
                                    : "bg-sky-400/15 text-sky-200"
                              }`}
                            >
                              {x.kind === "closure" ? "closed" : x.kind === "surge" ? `${x.mult}× demand` : "slow"}
                              {x.label ? ` · ${x.label}` : ""}
                            </span>
                          ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* lines */}
          <Card title={`Lines (${g.lines.length})`}>
            {g.lines.length === 0 ? (
              <p className="text-sm text-slate-400">No lines yet. Hit “New bus line” and tap out a route.</p>
            ) : (
              <ul className="space-y-2">
                {g.lines.map((l) => {
                  const waiting = l.stops.reduce((s, x) => s + x.queue.length, 0);
                  const onboard = l.buses.reduce((s, b) => s + b.pax.length, 0);
                  const closed = l.stops.filter((s) => s.closed).length;
                  return (
                    <li key={l.id} className="rounded-xl bg-white/5 p-2.5">
                      <div className="flex items-center justify-between">
                        <button onClick={() => focusLine(l.id)} className="flex items-center gap-2 text-sm font-semibold">
                          <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />
                          {l.name}
                        </button>
                        <button
                          onClick={() => buyBus(l.id)}
                          className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/20"
                        >
                          + Bus · {eur(BUS_PRICE)}
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {(l.len / 1000).toFixed(1)} km · {l.stops.length} stops · {l.buses.length} bus
                        {l.buses.length === 1 ? "" : "es"} · cap {BUS_CAP}
                      </div>
                      <div className="mt-1 text-xs">
                        <span className={waiting > 40 ? "text-red-300" : "text-slate-300"}>{waiting} waiting</span>
                        <span className="text-slate-500"> · </span>
                        <span className="text-slate-300">{onboard} onboard</span>
                        {closed > 0 && <span className="text-red-300"> · {closed} stop(s) closed</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* log */}
          <Card title="News">
            <ul className="space-y-1.5">
              {g.log.slice(0, 8).map((e, i) => (
                <li
                  key={i}
                  className={`text-xs leading-snug ${
                    e.tone === "bad"
                      ? "text-red-300"
                      : e.tone === "warn"
                        ? "text-amber-200"
                        : e.tone === "good"
                          ? "text-emerald-300"
                          : "text-slate-300"
                  }`}
                >
                  <span className="text-slate-500">{fmtClock(e.t).time}</span> {e.msg}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-xl">
          {toast}
        </div>
      )}

      {g.bankrupt && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="max-w-sm rounded-2xl bg-[#0b0f17] p-6 text-center shadow-2xl">
            <div className="text-4xl">📉</div>
            <h2 className="mt-2 text-xl font-bold">Bankrupt</h2>
            <p className="mt-1 text-sm text-slate-400">
              Cash ran dry. Next run: watch the event feed and move buses to where the crowds are.
            </p>
            <button
              onClick={() => location.reload()}
              className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function speedIndex(i: number) {
  return Math.max(0, Math.min(SPEEDS.length - 1, i));
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0b0f17]/90 p-3 shadow-xl backdrop-blur">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const color =
    tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : tone === "warn" ? "text-amber-200" : "text-slate-100";
  return (
    <div className="leading-tight">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
