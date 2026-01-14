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

## Tides (RSS)

The tide card pulls from an RSS feed by default. Update the feed in `app.js`:

- `config.tide.rssUrl` (RSS feed URL)
- `config.tide.sourceUrl` (link for the “Tide source” button)
- `config.tide.corsProxy` (optional; some RSS feeds block browser requests)

If the feed blocks CORS, set `corsProxy` to a compatible proxy prefix that accepts a URL query.
