# OSE M/M/1 Queue Simulation — Frontend

Static frontend for the M/M/1 queue simulation. The queue state, random arrivals,
service completions, waiting-time statistics, and histogram calculations are
performed by the FastAPI backend.

## Files

- `index.html` — page structure
- `styles.css` — visual styling
- `config.js` — local and online backend URLs
- `app.js` — UI controls, API calls, canvas drawing, and Chart.js rendering
- `_headers` — recommended Cloudflare Pages response headers

## Run locally

Start the backend first at `http://127.0.0.1:8000`, then run:

```powershell
cd C:\ose-mm1-queue-frontend
python -m http.server 5500
```

Open `http://127.0.0.1:5500`.

## Connect to Render

After deploying the backend, replace the placeholder in `config.js` with the
actual Render URL, without a trailing slash.

## Deploy to Cloudflare Pages

- Framework preset: `None`
- Build command: `exit 0`
- Build output directory: `.`
- Production branch: `main`
