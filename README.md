# Forecast

Simple, single-location weather dashboard aimed at quick kitesurfing checks. It uses Open-Meteo for weather + marine (waves) and UKHO for tides, with local caching.

## Run it (recommended)

Serve the folder with PHP so the proxy endpoints work:

```bash
php -S localhost:8787
```

Then open `http://localhost:8787`.

The PHP endpoints are:
- `weather.php` → Open-Meteo Forecast (cached in `weather-cache.json`)
- `waves.php` → Open-Meteo Marine (cached in `waves-cache.json`)
- `tides.php` → UKHO tidal events (cached in `tides-cache.json`)

LocalStorage is also used for front-end caching.

## Alternate server

There is a simple Node server in `server.js` for static hosting and a `/tides` proxy. If you use it, update `config.tide.apiUrl` to `/tides` and either:
- change `config.weather.apiUrl` / `config.waves.apiUrl` to the Open-Meteo upstream URLs, or
- add equivalent Node proxies for them.

```bash
node server.js
```

## Configure location

Edit the `config` block in `app.js`:

- `locationName`
- `latitude`
- `longitude`
- `timezone`
- `windSpeedUnit` (use `kn` for knots)

Optional wave settings live under `config.waves` (default uses the PHP proxy and the same forecast horizon).

## Tides (UKHO)

Set your UKHO key before running the server:

Create a `.env` file (see `.env.example`) with:

```bash
UKHO_KEY=your-key-here
```
