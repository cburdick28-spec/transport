# Madrid Transit Manager

Build bus lines on the real streets of Madrid, keep passengers happy, and survive whatever the city throws at you:
derbis at the Bernabéu, World Cup fan zones, Olympic torch relays, protests, marathons, concerts, metro strikes and snow.

## Events
Each event is announced hours ahead, then hits a part of the map:
- **Closure** (red): stops in the area shut down and buses crawl through it
- **Surge** (gold): demand multiplies in that area
- **Slow** (blue): buses move slower

## Run it
```bash
npm install
npm run dev
```

Stack: Next.js, Tailwind, MapLibre GL. Routing via the public OSRM demo server (falls back to straight lines if unreachable). Map data © OpenStreetMap contributors, tiles © CARTO.
