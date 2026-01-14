# Forecast

Simple, single-location weather dashboard aimed at quick kitesurfing checks.

## Run it

- Open `index.html` directly in a browser, or
- Serve the folder (recommended for mobile testing):

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Configure location

Edit the `config` block in `app.js`:

- `locationName`
- `latitude`
- `longitude`
- `timezone`
- `windSpeedUnit` (use `kn` for knots)

Tide data is left as a manual placeholder for now; add your provider details when ready.
