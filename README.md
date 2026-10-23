# Transit Manager

Build bus, tram, and metro lines on the real streets of four cities, keep passengers happy, and survive whatever
each city throws at you: derbies, festivals, strikes, parades and weather.

## Cities
Start in Madrid. Serve enough riders to hit each city's ridership goal and the next one opens up:
Madrid → Barcelona → Lisbon → Paris. Cash carries over when you travel; lines and stops don't, since they're tied
to that city's streets. Already-unlocked cities stay travelable, so you can go back and keep building anywhere
you've been.

## Modes
Bus, tram, and metro each have their own price, capacity, speed, and running cost — pick a mode before drawing a
line. All three route along real streets.

## Events
Each event is announced hours ahead, then hits a part of the map:
- **Closure** (red): stops in the area shut down and buses crawl through it
- **Surge** (gold): demand multiplies in that area
- **Slow** (blue): vehicles move slower

## Infinite money
The 💰 toggle in the top bar gives you an effectively unlimited cash floor, in any city, any time — for playing
around with the map and lines without worrying about going bankrupt.

## 3D view
Real extruded buildings render once you're zoomed in close. The 🏙️ toggle tilts and rotates the camera to see
them; toggle it off to go back to the flat top-down view for easier line-building.

## Run it
```bash
npm install
npm run dev
```

Stack: Next.js, Tailwind, MapLibre GL. Routing via the public OSRM demo server (falls back to straight lines if unreachable). Map data © OpenStreetMap contributors, tiles © CARTO.
