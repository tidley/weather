# Forecast

Simple, single-location weather dashboard aimed at quick kitesurfing checks. It uses Open-Meteo for weather + marine (waves) and UKHO for tides, with local caching.

## What’s included

- Open-Meteo weather + marine (waves) integration with server-side caching.
- Tide feed via UKHO, cached locally with coverage extension.
- Kiteability Index (KI) displayed as 0–100% with detailed hover breakdown.
- Dense, Windguru-style forecast table:
  - Separate rows for wind, gusts, gust factor, direction, waves, rain, sky, moon, tide, and tide curve.
  - Date row uses alternating day stripes; Time row uses time-of-day shading.
  - Optional “Hide night” toggle to filter night columns.
- Compact summary tile at the top with overall verdict, wind/gusts/direction/temp, waves/tide/rain, and reason chips.

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

## Install as a PWA (mobile home screen)

PWA install needs HTTPS (or `http://localhost`). For a phone, run this on a host with HTTPS.

iOS (Safari):
1. Open the site.
2. Tap the Share button.
3. Choose **Add to Home Screen**.

Android (Chrome):
1. Open the site.
2. Tap the menu.
3. Choose **Install app** / **Add to Home screen**.

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

## Live site

https://kiting.tomdwyer.uk

<img width="995" height="865" alt="image" src="https://github.com/user-attachments/assets/357976c4-8ca7-4f1b-9b9c-5a28b72f3e61" />

