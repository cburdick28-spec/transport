# Transit Manager - Claude Code Instructions

## Build & Test Commands
- Dev Server: `npm run dev`
- Build check: `npm run build` (or verify package.json scripts)

## Architecture Principles
- **Tech Stack:** Next.js (App Router), Tailwind CSS, MapLibre GL.
- **Routing:** Handled via OSRM demo server; must gracefully degrade to straight lines if down.
- **Map Rendering:** Keep calculations out of the main map render tick thread to preserve 60fps.

## Code Style & Rules
- Always use TypeScript with strict typing. No `any`.
- Tailwind utility classes only; avoid custom inline CSS sheets.
- Maintain the state of the 💰 (infinite cash) and 🏙 (3D tilt) toggles across all view switches.
