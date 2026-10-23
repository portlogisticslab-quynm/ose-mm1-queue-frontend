# OSE M/M/1 Queue Simulation (frontend-only)

Static site: the M/M/1 simulation runs in the browser (`mm1-engine.js`), no backend.

- `index.html`, `styles.css`, `app.js` — UI (same layout as the former FastAPI-served page, plus a Speed selector)
- `mm1-engine.js` — port of the backend 1.0.0-demo model: time step Δt = 0.2,
  service completion p = 1 − e^(−μΔt), at most one arrival p = 1 − e^(−λΔt), FIFO,
  waiting time = start − arrival; histogram over [0, max wait], density = count / (n·width)
- Deploy: Cloudflare Pages, build command `exit 0`, output `.`
