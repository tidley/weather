# Forecast

Simple, single-location weather dashboard aimed at quick kitesurfing checks.

## Run it

- Open `index.html` directly in a browser, or
- Serve the folder (recommended for mobile testing):

```bash
node server.js
```

Then open `http://localhost:8787`.

## Configure location

Edit the `config` block in `app.js`:

- `locationName`
- `latitude`
- `longitude`
- `timezone`
- `windSpeedUnit` (use `kn` for knots)

## Tides (UKHO)

The tide feed is pulled from the UKHO API and proxied locally to avoid CORS issues. Update the feed in `app.js`:

- `config.tide.stationId` (UKHO station ID, e.g. `0085`)
- `config.tide.sourceUrl` (link for the “Tide source” button)
- `config.tide.apiUrl` (local proxy; defaults to `http://localhost:8787/tides`)

Set your UKHO key before running the server:

Create a `.env` file (see `.env.example`) with:

```bash
UKHO_KEY=your-key-here
```
