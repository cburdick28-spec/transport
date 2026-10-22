// MapLibre 6 runs its tile worker as a separate module file. Turbopack doesn't bundle it,
// so we serve it from /public and point MapLibre at it with setWorkerUrl().
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/maplibre/${f}`);
}
console.log("copied maplibre worker files to public/maplibre");
