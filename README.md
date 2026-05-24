# Forecast

Simple weather dashboard aimed at quick kitesurfing checks for St Leonards and Hayle, Cornwall. It uses Open-Meteo for weather + marine (waves) and UKHO for tides, with local caching.

## What’s included

- Open-Meteo weather + marine (waves) integration with server-side caching.
- Tide feed via UKHO, cached locally with coverage extension.
- Kiteability Index (KI) and Paddleboarding Index (PI) displayed as 0–100% with detailed hover breakdowns.
- Dense, Windguru-style forecast table:
  - Separate rows for wind, gusts, gust factor, direction, waves, rain, sky, moon, tide, and tide curve.
  - Date row uses alternating day stripes; Time row uses time-of-day shading.
  - “Hide night” is enabled by default, with a toggle to reveal night columns.
- Location toggle for St Leonards and Hayle.
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
- `updater.php` → GitHub release update status/install endpoint

LocalStorage is also used for front-end caching.

## Install as a PWA (mobile home screen)

PWA install needs HTTPS (or `http://localhost`). For a phone, run this on a host with HTTPS.
Firefox Android only shows **Add app to Home screen** when the site is installable (HTTPS + valid manifest + service worker). If you only see **Add to Home screen**, it is not installable yet.

iOS (Safari):
1. Open the site.
2. Tap the Share button.
3. Choose **Add to Home Screen**.

Android (Chrome):
1. Open the site.
2. Tap the menu.
3. Choose **Install app** / **Add to Home screen**.

The page checks for updates through two paths:

- GitHub release OTA updates: when a newer `weather.zip` release is available,
  an **Update** button appears in the header. Installing requires
  `WEATHER_UPDATE_TOKEN`.
- PWA cache updates: when a new service worker has cached newer app assets, the
  same **Update** button activates it and reloads into the new version.

## Release package

GitHub Actions builds `build/weather.zip` for tags matching `v*` and attaches it
to the GitHub release. Update `WEATHER_VERSION` in `version.php` before tagging.
You can also run the same package build locally:

```bash
./scripts/build-release.sh
```

## Configure locations

Edit the `locations` block in `app.js`:

- `locationName`
- `latitude`
- `longitude`
- `tideStationId`
- `tideStationName`

Current locations:

- St Leonards-on-Sea: weather/marine at `50.849533, 0.537056`, UKHO tide station `0085` Hastings.
- Hayle, Cornwall: weather/marine at `50.186111, -5.421389`, UKHO tide station `0547` St. Ives.

Shared settings still live in the `config` block:

- `timezone`
- `windSpeedUnit` (use `kn` for knots)

Optional wave settings live under `config.waves` (default uses the PHP proxy and the same forecast horizon).

## Tides (UKHO)

Set your UKHO key before running the server:

Create a `.env` file (see `.env.example`) with:

```bash
UKHO_KEY=your-key-here
```

Optional OTA update settings:

```bash
WEATHER_UPDATE_TOKEN=long-random-token-for-ota-installs
WEATHER_UPDATE_REPO=tidley/weather
WEATHER_GITHUB_TOKEN=optional-token-for-private-repo-release-downloads
```

Generate and set a real update token on the deployed server:

```bash
openssl rand -hex 32
```

Put the generated value in the deployed `.env` as `WEATHER_UPDATE_TOKEN`.
Keep it secret; the app asks for this token before installing a GitHub release
ZIP. If the GitHub release repo is private, also set `WEATHER_GITHUB_TOKEN` to a
GitHub token that can read releases.

## Live site

https://kiting.tomdwyer.uk

<img width="995" height="865" alt="image" src="https://github.com/user-attachments/assets/357976c4-8ca7-4f1b-9b9c-5a28b72f3e61" />
