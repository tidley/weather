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

## Tides (RSS)

The tide card pulls from an RSS feed by default, proxied locally to avoid CORS issues. Update the feed in `app.js`:

- `config.tide.rssUrl` (RSS feed URL)
- `config.tide.sourceUrl` (link for the “Tide source” button)
- `config.tide.corsProxy` (local proxy; defaults to `http://localhost:8787/rss?url=`)
