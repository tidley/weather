console.log('APP.JS VERSION:', '2026-01-14-php-tides-1');

const config = {
  locationName: 'St Leonards-on-Sea, UK',
  latitude: 50.849533,
  longitude: 0.537056,
  timezone: 'Europe/London',
  windSpeedUnit: 'kn',
  forecastWindowHours: 2,
  // Open-Meteo Forecast API supports up to 16 days via forecast_days.
  forecastDays: 16,
  weather: {
    // Server-side cached proxy.
    apiUrl: '/weather.php',
  },
  waves: {
    // Open-Meteo Marine proxy (uses waves-cache.json if available).
    apiUrl: '/waves.php',
  },
  tide: {
    provider: 'ukho',
    stationId: '0085',
    sourceUrl: 'https://admiraltyapi.portal.azure-api.net/',
    apiUrl: '/tides.php',
    // Minimum tide coverage to extend to (days). Weather horizon is 16 days.
    predictDays: 16,
  },
};

const ui = {
  locationName: document.getElementById('location-name'),
  weatherUpdated: document.getElementById('weather-updated'),
  tidesUpdated: document.getElementById('tides-updated'),
  currentSummary: document.getElementById('current-summary'),
  currentTemp: document.getElementById('current-temp'),
  currentWind: document.getElementById('current-wind'),
  currentWindDir: document.getElementById('current-wind-dir'),
  currentWindArrow: document.getElementById('current-wind-arrow'),
  currentGusts: document.getElementById('current-gusts'),
  currentPrecip: document.getElementById('current-precip'),
  currentCloud: document.getElementById('current-cloud'),
  currentCloudIcon: document.getElementById('current-cloud-icon'),
  currentScore: document.getElementById('current-score'),
  forecastGrid: document.getElementById('forecast-grid'),
  forecastHeadRow: document.getElementById('forecast-head-row'),
  forecastBody: document.getElementById('forecast-body'),
  forecastRange: document.getElementById('forecast-range'),
  tideStatus: document.getElementById('tide-status'),
  tideSource: document.getElementById('tide-source'),
  tideSvg: document.getElementById('tide-svg'),
  refresh: document.getElementById('refresh'),
};

const cacheKeys = {
  weather: 'forecast.weather',
  tides: 'forecast.tides',
  waves: 'forecast.waves',
  weatherUpdatedAt: 'forecast.weatherUpdatedAt',
  tidesUpdatedAt: 'forecast.tidesUpdatedAt',
  wavesUpdatedAt: 'forecast.wavesUpdatedAt',
};

const formatWindow = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
});

const formatHeaderDay = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
});

const formatHeaderDate = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
});

const formatHeaderHour = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
});

const formatTideTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
});

const CACHE_STALE_MS = 24 * 60 * 60 * 1000;
const forecastScrollContainer = document.querySelector('.forecast-scroll');
const meteoconsCache = new Map();
let tapTooltip;
let tapTooltipTarget;
let tapTooltipVisible = false;

function shouldEnableTapTooltips() {
  return window.matchMedia && window.matchMedia('(hover: none)').matches;
}

function hideTapTooltip() {
  if (!tapTooltip || !tapTooltipVisible) return;
  tapTooltip.classList.remove('visible');
  tapTooltipVisible = false;
  tapTooltipTarget = null;
}

function showTapTooltip(target, text) {
  if (!tapTooltip) return;
  tapTooltip.textContent = text;
  tapTooltip.classList.add('visible');
  tapTooltipVisible = true;
  tapTooltipTarget = target;

  const rect = target.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  const tooltipRect = tapTooltip.getBoundingClientRect();
  const margin = 8;
  let top = rect.top + scrollY - tooltipRect.height - margin;
  if (top < scrollY + margin) {
    top = rect.bottom + scrollY + margin;
  }
  let left = rect.left + scrollX + rect.width / 2 - tooltipRect.width / 2;
  const minLeft = scrollX + margin;
  const maxLeft = scrollX + window.innerWidth - tooltipRect.width - margin;
  left = Math.max(minLeft, Math.min(maxLeft, left));
  tapTooltip.style.top = `${Math.round(top)}px`;
  tapTooltip.style.left = `${Math.round(left)}px`;
}

function tooltipTextForCell(cell) {
  if (!cell) return '';
  const titleText = cell.getAttribute('title');
  if (titleText) return titleText;
  if (cell.classList.contains('label-cell')) {
    const raw = cell.dataset.fullLabel || cell.textContent || '';
    return raw.replace(/\.\s*$/, '');
  }
  return '';
}
function updateForecastStickyLabelModeFromScroll() {
  if (!forecastScrollContainer) return;
  const scrolled = forecastScrollContainer.scrollLeft > 8;
  document.documentElement.classList.toggle('forecast-scrolled', scrolled);
}

if (forecastScrollContainer) {
  forecastScrollContainer.addEventListener(
    'scroll',
    updateForecastStickyLabelModeFromScroll,
    {
      passive: true,
    },
  );
  updateForecastStickyLabelModeFromScroll();
}

document
  .querySelectorAll('.meteocons-icon[data-meteocons]')
  .forEach((icon) => {
    renderMeteoconsIcon(icon, icon.dataset.meteocons);
  });

if (shouldEnableTapTooltips()) {
  tapTooltip = document.createElement('div');
  tapTooltip.className = 'tap-tooltip';
  tapTooltip.setAttribute('role', 'tooltip');
  tapTooltip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tapTooltip);

  document.addEventListener('click', (event) => {
    const target = event.target.closest(
      '.forecast-grid .label-cell, .forecast-grid .data-cell',
    );
    if (!target) {
      hideTapTooltip();
      return;
    }
    const text = tooltipTextForCell(target);
    if (!text) return;
    if (tapTooltipTarget === target && tapTooltipVisible) {
      hideTapTooltip();
      return;
    }
    showTapTooltip(target, text);
  });

  window.addEventListener('scroll', hideTapTooltip, true);
  window.addEventListener('resize', hideTapTooltip);
}

function setUpdatedLabel(target, label, isoTime) {
  if (!target) return;
  if (!isoTime) {
    target.textContent = `${label}: —`;
    return;
  }
  const date = new Date(isoTime);
  target.textContent = `${label}: ${date.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

function setLocation() {
  if (ui.locationName) ui.locationName.textContent = config.locationName;
}

function windCompass(degrees) {
  if (degrees === null || degrees === undefined) return '—';
  const directions = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

function formatValue(value, unit, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  return `${Math.round(value)}${unit}`;
}

function arrowForDegrees(degrees) {
  if (degrees === null || degrees === undefined) return 'rotate(0deg)';
  return `rotate(${(degrees + 90) % 360}deg)`;
}

function fetchMeteoconsSvg(name) {
  if (!meteoconsCache.has(name)) {
    const url = `https://api.iconify.design/meteocons:${name}.svg?color=currentColor&width=1em&height=1em`;
    const promise = fetch(url)
      .then((response) => (response.ok ? response.text() : ''))
      .catch(() => '');
    meteoconsCache.set(name, promise);
  }
  return meteoconsCache.get(name);
}

function renderMeteoconsIcon(el, name) {
  if (!el || !name) return;
  if (el.dataset.meteocons === name && el.firstChild) return;
  el.dataset.meteocons = name;
  el.classList.add('meteocons-icon');
  fetchMeteoconsSvg(name).then((svg) => {
    if (!svg || el.dataset.meteocons !== name) return;
    el.innerHTML = svg;
  });
}

function createMeteoconsIcon(name, extraClass) {
  const icon = document.createElement('span');
  icon.className = `meteocons-icon${extraClass ? ` ${extraClass}` : ''}`;
  icon.setAttribute('aria-hidden', 'true');
  renderMeteoconsIcon(icon, name);
  return icon;
}

function colorForValue(value, stops) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'transparent';
  }
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  let chosen = sorted[0];
  for (const stop of sorted) {
    if (value >= stop.value) chosen = stop;
  }
  return chosen.color;
}

function hexToRgb(hex) {
  const sanitized = hex.replace('#', '');
  const value =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((c) => c + c)
          .join('')
      : sanitized;
  const number = Number.parseInt(value, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function lerpColor(start, end, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(start);
  const [r2, g2, b2] = hexToRgb(end);
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

function timeGradient(time) {
  const hour = time.getHours() + time.getMinutes() / 60;
  const t = hour <= 12 ? hour / 12 : (24 - hour) / 12;
  return lerpColor('#02060b', '#1e4e9c', t);
}

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians) {
  return (radians * 180) / Math.PI;
}

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const now = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );
  return Math.floor((now - start) / 86400000) + 1;
}

function isDaylight(date, latitude, longitude) {
  const doy = dayOfYear(date);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const gamma = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24);
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const timeOffset =
    eqTime + 4 * longitude - 60 * (-date.getTimezoneOffset() / 60);
  const trueSolarTime =
    (date.getHours() * 60 +
      date.getMinutes() +
      date.getSeconds() / 60 +
      timeOffset) %
    1440;
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  const latRad = toRad(latitude);
  const zenith =
    Math.cos(latRad) * Math.cos(decl) * Math.cos(toRad(hourAngle)) +
    Math.sin(latRad) * Math.sin(decl);
  const solarZenith = toDeg(Math.acos(Math.min(Math.max(zenith, -1), 1)));
  return solarZenith < 90.833;
}

function parseHeightNumber(value) {
  if (!value) return null;
  const number = Number.parseFloat(String(value));
  return Number.isNaN(number) ? null : number;
}

function skyIcon(cloudCover, time) {
  if (
    cloudCover === null ||
    cloudCover === undefined ||
    Number.isNaN(cloudCover)
  ) {
    return 'not-available-fill';
  }
  const hour = time ? time.getHours() : 12;
  const isNight = hour < 6 || hour >= 20;

  if (cloudCover < 20) {
    return isNight ? 'clear-night-fill' : 'clear-day-fill';
  }
  if (cloudCover < 50) {
    return isNight ? 'partly-cloudy-night-fill' : 'partly-cloudy-day-fill';
  }
  if (cloudCover < 80) {
    return isNight ? 'partly-cloudy-night-fill' : 'cloudy-fill';
  }
  return 'cloudy-fill';
}

function lunarPhaseInfo(date) {
  const reference = Date.UTC(2000, 0, 6, 18, 14, 0);
  const synodicMonth = 29.53058867;
  const daysSince = (date.getTime() - reference) / 86400000;
  const phase = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
  const fraction = phase / synodicMonth;
  const index = Math.floor(fraction * 8) % 8;
  const icons = [
    'moon-new-fill',
    'moon-waxing-crescent-fill',
    'moon-first-quarter-fill',
    'moon-waxing-gibbous-fill',
    'moon-full-fill',
    'moon-waning-gibbous-fill',
    'moon-last-quarter-fill',
    'moon-waning-crescent-fill',
  ];
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  return { icon: icons[index], illumination };
}

function buildUrl() {
  const params = new URLSearchParams({
    latitude: config.latitude,
    longitude: config.longitude,
    timezone: config.timezone,
    wind_speed_unit: config.windSpeedUnit,
    forecast_days: String(config.forecastDays),
    current: [
      'temperature_2m',
      'precipitation',
      'cloud_cover',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
    ].join(','),
    hourly: [
      'temperature_2m',
      'precipitation_probability',
      'precipitation',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'cloud_cover',
    ].join(','),
  });

  const base =
    config.weather?.apiUrl || 'https://api.open-meteo.com/v1/forecast';
  return `${base}?${params.toString()}`;
}

function buildWavesUrl(options = {}) {
  const params = new URLSearchParams({
    latitude: config.latitude,
    longitude: config.longitude,
    timezone: config.timezone,
    forecast_days: String(config.waves?.forecastDays || config.forecastDays),
    hourly: ['wave_height', 'wave_period', 'wave_direction'].join(','),
  });
  const base =
    config.waves?.apiUrl || 'https://marine-api.open-meteo.com/v1/marine';
  const url = new URL(base, window.location.origin);
  params.forEach((value, key) => url.searchParams.set(key, value));
  if (options.force && url.origin === window.location.origin) {
    url.searchParams.set('refresh', '1');
  }
  return url.toString();
}

function setTideStatus(message) {
  if (!ui.tideStatus) return;
  ui.tideStatus.textContent = message;
  ui.tideStatus.style.display = 'block';
}

function clearTideStatus() {
  if (!ui.tideStatus) return;
  ui.tideStatus.style.display = 'none';
}

function renderCurrent(data) {
  const current = data.current;
  ui.currentTemp.textContent = formatValue(current.temperature_2m, '°C');
  ui.currentWind.textContent = formatValue(current.wind_speed_10m, ' kt');
  ui.currentWindDir.textContent = `${windCompass(current.wind_direction_10m)}`;
  if (ui.currentWindArrow) {
    ui.currentWindArrow.style.transform = arrowForDegrees(
      current.wind_direction_10m,
    );
  }
  ui.currentGusts.textContent = formatValue(current.wind_gusts_10m, ' kt');
  ui.currentPrecip.textContent = formatValue(current.precipitation, ' mm');
  ui.currentCloud.textContent = formatValue(current.cloud_cover, '% cloud');
  if (ui.currentCloudIcon) {
    const currentTime = current.time ? new Date(current.time) : new Date();
    const icon = skyIcon(current.cloud_cover, currentTime);
    renderMeteoconsIcon(ui.currentCloudIcon, icon);
    ui.currentCloudIcon.style.color =
      current.cloud_cover < 20 ? '#ffd54a' : '#dbe7ff';
  }

  const wind = Math.round(current.wind_speed_10m);
  const gusts = Math.round(current.wind_gusts_10m);
  const rain = Math.round(current.precipitation || 0);
  if (ui.currentSummary) {
    ui.currentSummary.textContent = `${wind} kt / ${gusts} kt · ${rain} mm`;
  }
}

function formatHeight(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${Number(value).toFixed(2)} m`;
}

function normalizeEventType(rawType) {
  if (!rawType) return 'TIDE';
  const value = String(rawType).toLowerCase();
  if (value.includes('high')) return 'HIGH';
  if (value.includes('low')) return 'LOW';
  return value.toUpperCase();
}

function parseUkhOEvents(data) {
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];

  return items
    .map((item) => {
      const dateText =
        item.EventDateTime ||
        item.EventDateTimeUtc ||
        item.DateTime ||
        item.dateTime ||
        item.date ||
        item.time;
      const date = dateText ? new Date(dateText) : null;
      const type = normalizeEventType(
        item.EventType || item.eventType || item.Type || item.type,
      );
      const height = formatHeight(
        item.Height ||
          item.height ||
          item.HeightInMeters ||
          item.heightInMeters ||
          item.Value,
      );
      return {
        type,
        height,
        timeText:
          date && !Number.isNaN(date.getTime())
            ? formatTideTime.format(date)
            : '—',
        date: date && !Number.isNaN(date.getTime()) ? date : null,
      };
    })
    .filter((item) => item.date);
}

async function loadTides(options = {}) {
  if (config.tide.provider !== 'ukho' || !config.tide.apiUrl) {
    setTideStatus('No tide feed configured.');
    if (ui.tideSource) {
      ui.tideSource.textContent = 'Manual';
    }
    return [];
  }

  if (ui.tideSource) {
    ui.tideSource.textContent = 'UKHO';
  }

  const url = new URL(config.tide.apiUrl, window.location.origin);
  url.searchParams.set('station', config.tide.stationId);
  url.searchParams.set('refresh', options.force ? '1' : '0');

  try {
    const response = await fetch(url.toString());
    const updatedAt = response.headers.get('X-Updated-At');
    if (!response.ok) {
      let details = '';
      try {
        const payload = await response.json();
        if (payload?.error) {
          details = payload.error;
        }
        if (payload?.details) {
          details = details ? `${details} ${payload.details}` : payload.details;
        }
      } catch (error) {
        details = await response.text();
      }
      const message = details
        ? `UKHO tide error: ${response.status} (${details})`
        : `UKHO tide error: ${response.status}`;
      throw new Error(message);
    }
    const data = await response.json();
    const items = parseUkhOEvents(data);
    return { items, updatedAt };
  } catch (error) {
    setTideStatus('Tide feed unavailable.');
    console.error(error);
    return { items: [], updatedAt: null };
  }
}

function describeTideCoverage(items) {
  if (!items.length) {
    return 'No tide events returned.';
  }
  const sorted = [...items].sort((a, b) => a.date - b.date);
  const start = sorted[0].date;
  const end = sorted[sorted.length - 1].date;
  if (!start || !end) {
    return 'Tide feed loaded, but dates were missing.';
  }
  const days = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
  return `Tides available for ~${days} days.`;
}

function tideForWindow(tideEvents, windowStart, windowEnd) {
  const within = tideEvents.filter(
    (event) =>
      event.date && event.date >= windowStart && event.date < windowEnd,
  );
  if (!within.length) {
    const level = tideLevelAt(tideEvents, windowStart);
    if (!level) return '—';
    return `${level.height.toFixed(2)}`;
  }
  return within
    .slice(0, 2)
    .map((event) => {
      const value = parseHeightNumber(event.height);
      return value === null
        ? `${event.type[0]} —`
        : `${event.type[0]} ${value.toFixed(2)}`;
    })
    .join(', ');
}

function tideLevelAt(tideEvents, time) {
  const events = tideEvents
    .filter((event) => event.date)
    .sort((a, b) => a.date - b.date);
  if (events.length < 2) return null;

  const nextIndex = events.findIndex((event) => event.date >= time);
  if (nextIndex === -1) return null;
  if (nextIndex === 0) {
    const next = events[0];
    const after = events[1];
    const h1 = parseHeightNumber(next.height);
    const h2 = parseHeightNumber(after.height);
    if (h1 === null || h2 === null) return null;
    return {
      height: h1,
      lowerHalf: h1 <= (Math.min(h1, h2) + Math.max(h1, h2)) / 2,
    };
  }
  const prev = events[nextIndex - 1];
  const next = events[nextIndex];
  const h1 = parseHeightNumber(prev.height);
  const h2 = parseHeightNumber(next.height);
  if (h1 === null || h2 === null) return null;

  const segmentMs = next.date - prev.date;
  const elapsedMs = time - prev.date;
  const ratio = segmentMs ? Math.min(Math.max(elapsedMs / segmentMs, 0), 1) : 0;
  const height = h1 + ((h2 - h1) * (1 - Math.cos(Math.PI * ratio))) / 2;
  const mid = (Math.min(h1, h2) + Math.max(h1, h2)) / 2;
  return {
    height,
    lowerHalf: height <= mid,
  };
}

function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

function linearFit(points) {
  // points: [{x, y}] where x is ms, y is height
  const clean = points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (clean.length < 2) return null;
  const n = clean.length;
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (const p of clean) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function extendTideEvents(tideEvents, horizonEnd) {
  // Extends HW/LW events to horizonEnd using empirical cadence.
  // Predicted events keep the last known height to avoid false precision.
  const base = tideEvents
    .filter((e) => e.date instanceof Date && !Number.isNaN(e.date.getTime()))
    .map((e) => ({ ...e }))
    .sort((a, b) => a.date - b.date);

  if (base.length < 6) return base;
  if (!(horizonEnd instanceof Date)) return base;
  const last = base[base.length - 1];
  if (last.date >= horizonEnd) return base;

  let lastHigh = null;
  let lastLow = null;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    const value = parseHeightNumber(base[i].height);
    if (value === null) continue;
    if (base[i].type === 'HIGH' && lastHigh === null) {
      lastHigh = value;
    }
    if (base[i].type === 'LOW' && lastLow === null) {
      lastLow = value;
    }
    if (lastHigh !== null && lastLow !== null) break;
  }

  // Estimate typical interval between consecutive events (HW->LW or LW->HW).
  const deltas = [];
  for (let i = 1; i < base.length; i++) {
    const dt = base[i].date - base[i - 1].date;
    if (dt > 2 * 60 * 60 * 1000 && dt < 10 * 60 * 60 * 1000) deltas.push(dt);
  }
  const step = median(deltas) || 6.21 * 60 * 60 * 1000; // ~6h 12m 36s

  // Continue alternating event types.
  let nextType = last.type;
  let nextTime = new Date(last.date.getTime());
  while (nextTime < horizonEnd) {
    nextType = nextType === 'HIGH' ? 'LOW' : 'HIGH';
    nextTime = new Date(nextTime.getTime() + step);

    const cap =
      nextType === 'HIGH'
        ? lastHigh
        : nextType === 'LOW'
        ? lastLow
        : null;
    const heightText =
      cap === null || !Number.isFinite(cap)
        ? null
        : `${Math.max(cap, 0).toFixed(2)}m`;

    base.push({
      type: nextType,
      height: heightText,
      timeText: formatTideTime.format(nextTime),
      date: nextTime,
      predicted: true,
    });
  }

  return base;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

const SHORE_NORMAL_DEG = 180;

function waveDelta({ waveHeight, wavePeriod, windDirDegrees }) {
  if (!Number.isFinite(waveHeight) || waveHeight < 0.3) {
    return {
      delta: 0,
      tag: 'flat/none',
      detail: 'Wave height < 0.3m or missing',
    };
  }

  const H = waveHeight;
  const P = Number.isFinite(wavePeriod) ? wavePeriod : null;

  const windToShore = Number.isFinite(windDirDegrees)
    ? Math.cos(((windDirDegrees - SHORE_NORMAL_DEG) * Math.PI) / 180)
    : 0;

  const heightGood = clamp(1 - Math.abs(H - 0.9) / 0.7);
  const periodGood = P === null ? 0.5 : clamp((P - 7) / (12 - 7));
  const windClean = clamp(1 - Math.max(0, windToShore));

  const good = heightGood * periodGood * windClean;

  const tooBig = clamp((H - 1.8) / (2.8 - 1.8));
  const tooShort = P === null ? 0 : clamp((7 - P) / (7 - 5));
  const onshore = clamp(Math.max(0, windToShore));

  const bad = clamp(Math.max(tooBig, tooShort) * (0.6 + 0.4 * onshore));

  const quality = clamp(good - bad, -1, 1);
  const delta = Math.max(0, 0.18 * quality);

  const windTag =
    windToShore > 0.25
      ? 'onshore'
      : windToShore < -0.25
      ? 'offshore'
      : 'cross-shore';
  const periodText = P === null ? 'n/a' : `${P.toFixed(1)}s`;
  const detailParts = [];
  if (quality > 0) {
    const positives = [];
    if (heightGood > 0.6) positives.push('mid-height');
    if (periodGood > 0.6) positives.push('longer period');
    if (windClean > 0.6) positives.push('clean wind');
    detailParts.push(
      positives.length ? `good: ${positives.join(', ')}` : 'good: mixed',
    );
  } else {
    const issues = [];
    if (tooBig > 0.2) issues.push('too big');
    if (tooShort > 0.2) issues.push('short period');
    if (onshore > 0.2) issues.push('onshore wind');
    detailParts.push(
      issues.length ? `issues: ${issues.join(', ')}` : 'issues: mixed',
    );
  }
  const detail = `H ${H.toFixed(2)}m, P ${periodText}, ${windTag} wind; ${detailParts.join(
    ', ',
  )}`;

  const tag = delta > 0 ? 'good' : 'neutral';
  return { delta, tag, detail };
}

function kiteIndex({
  windSpeed,
  gustSpeed,
  windDirDegrees,
  tideLevel,
  tideRange,
  isDaylightNow,
  waveHeight,
  wavePeriod,
}) {
  const reasons = [];
  const details = {};

  const windValue = Number.isFinite(windSpeed) ? windSpeed : 0;
  const sw =
    windValue <= 18
      ? windValue < 8
        ? 0
        : 0.1 + (0.9 * clamp(windValue - 8, 0, 10)) / 10
      : clamp(1 - (windValue - 18) / (25 - 18));
  reasons.push(
    `S_w wind speed: ${sw.toFixed(2)} (wind ${Math.round(windValue)} kt)`,
  );
  details.wind = `Wind ${Math.round(windValue)} kt \u2192 S_w ${sw.toFixed(2)}`;

  const gustFactor = windValue ? gustSpeed / windValue : null;
  let sg = 0;
  if (gustFactor !== null) {
    if (gustFactor <= 1.3) sg = 1;
    else if (gustFactor >= 1.6) sg = 0;
    else sg = 1 - (gustFactor - 1.3) / (1.6 - 1.3);
    sg = Math.max(0.3, sg);
  }
  reasons.push(
    gustFactor !== null
      ? `S_g gust steadiness: ${sg.toFixed(2)} (gust factor ${gustFactor.toFixed(
          2,
        )})`
      : 'S_g gust steadiness: n/a',
  );
  details.gust =
    gustFactor !== null
      ? `Gust factor ${gustFactor.toFixed(2)} \u2192 S_g ${sg.toFixed(2)}`
      : `Gust factor n/a \u2192 S_g ${sg.toFixed(2)}`;

  let sd = 0.2;
  if (Number.isFinite(windDirDegrees)) {
    const dir = ((windDirDegrees % 360) + 360) % 360;
    if (dir >= 135 && dir <= 225) {
      sd = 1;
    } else if ((dir >= 45 && dir < 135) || (dir > 225 && dir <= 315)) {
      sd = 0.75;
    }
  }
  const directionLabel = Number.isFinite(windDirDegrees)
    ? `${Math.round(windDirDegrees)}°`
    : 'n/a';
  reasons.push(`S_d direction: ${sd.toFixed(2)} (${directionLabel})`);
  details.direction = `Direction ${directionLabel} \u2192 S_d ${sd.toFixed(2)}`;

  let st = 0.5;
  if (tideLevel && tideRange && tideRange.max > tideRange.min) {
    const tNorm = clamp(
      (tideLevel.height - tideRange.min) / (tideRange.max - tideRange.min),
    );
    const target = 0.2;
    st = clamp(1 - Math.abs(tNorm - target) / 0.5);
  }
  st = Math.max(0.3, st);
  reasons.push(`S_t tide: ${st.toFixed(2)} (prefers low)`);
  if (tideLevel && tideRange && tideRange.max > tideRange.min) {
    details.tide = `Tide ${tideLevel.height.toFixed(2)}m (range ${tideRange.min.toFixed(
      2,
    )}-${tideRange.max.toFixed(2)}m) \u2192 S_t ${st.toFixed(2)}`;
  } else {
    details.tide = `Tide data n/a \u2192 S_t ${st.toFixed(2)}`;
  }

  const sl = isDaylightNow ? 1.0 : 0.0;
  reasons.push(
    `S_l daylight: ${sl.toFixed(2)} (${isDaylightNow ? 'day' : 'night'})`,
  );
  details.daylight = `${
    isDaylightNow ? 'Daylight' : 'Night'
  } \u2192 S_l ${sl.toFixed(2)}`;

  const baseKi =
    Math.pow(sw, 0.35) *
    Math.pow(sg, 0.3) *
    Math.pow(sd, 0.2) *
    Math.pow(st, 0.1) *
    Math.pow(sl, 0.05);

  const { delta: waveBonus, tag: waveTag, detail: waveDetail } = waveDelta({
    waveHeight,
    wavePeriod,
    windDirDegrees,
  });
  const ki = clamp(baseKi + waveBonus);

  reasons.push(
    waveBonus === 0
      ? 'Waves: neutral (flat/no data) \u2192 \u0394_wave +0.00'
      : `Waves: ${waveTag} \u2192 \u0394_wave ${
          waveBonus >= 0 ? '+' : ''
        }${waveBonus.toFixed(2)}`,
  );
  details.waves =
    waveBonus === 0
      ? `${waveDetail} \u2192 \u0394_wave +0.00`
      : `${waveDetail} \u2192 \u0394_wave ${
          waveBonus >= 0 ? '+' : ''
        }${waveBonus.toFixed(2)}`;

  let stars = 0;
  if (ki >= 0.8) stars = 5;
  else if (ki >= 0.65) stars = 4;
  else if (ki >= 0.5) stars = 3;
  else if (ki >= 0.35) stars = 2;

  return {
    ki,
    stars,
    reasons,
    gustFactor,
    scores: { sw, sg, sd, st, sl, waveBonus },
    details,
  };
}

function buildHeaderCell(time) {
  const cell = document.createElement('th');
  cell.className = 'data-cell';
  cell.style.background = timeGradient(time);
  const wrapper = document.createElement('div');
  wrapper.className = 'cell-stack';
  const day = document.createElement('span');
  day.className = 'cell-main';
  day.textContent = formatHeaderDay.format(time);
  const hour = document.createElement('span');
  hour.className = 'cell-sub';
  hour.textContent = formatHeaderDate.format(time);
  wrapper.append(day, hour);
  cell.appendChild(wrapper);
  return cell;
}

function buildTimeCell(time) {
  const hour = `${formatHeaderHour.format(time)}h`;
  return buildDataCell(hour, '', timeGradient(time));
}

function buildDataCell(mainText, subText, background) {
  const cell = document.createElement('td');
  cell.className = 'data-cell';
  if (background) {
    cell.style.background = background;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'cell-stack';
  const main = document.createElement('span');
  main.className = 'cell-main';
  main.textContent = mainText;
  const sub = document.createElement('span');
  sub.className = 'cell-sub';
  sub.textContent = subText || '';
  wrapper.append(main, sub);
  cell.appendChild(wrapper);
  return cell;
}

function setCellSubText(cell, text) {
  const sub = cell.querySelector('.cell-sub');
  if (sub) {
    sub.textContent = text;
    if (text.includes('[')) {
      sub.classList.add('ki-score');
    }
  }
}

function formatScoreTag(value) {
  if (!Number.isFinite(value)) return '[—]';
  return `[${value.toFixed(2)}]`;
}

function formatDeltaTag(value) {
  if (!Number.isFinite(value)) return '[—]';
  const sign = value >= 0 ? '+' : '';
  return `[${sign}${value.toFixed(2)}]`;
}

function addCellScoreLine(cell, text) {
  if (!cell || !text) return;
  const wrapper = cell.querySelector('.cell-stack, .wind-cell');
  if (!wrapper) return;
  const line = document.createElement('span');
  line.className = 'cell-sub ki-score';
  line.textContent = text;
  wrapper.appendChild(line);
}

function starText(stars) {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 5 - stars));
}

function classifyScore(value) {
  if (!Number.isFinite(value)) return { label: 'n/a', icon: '•' };
  if (value >= 0.75) return { label: 'good', icon: '✔' };
  if (value >= 0.5) return { label: 'fair', icon: '•' };
  if (value >= 0.35) return { label: 'moderate', icon: '•' };
  return { label: 'poor', icon: '❌' };
}

function waveSummaryLabel(waveDeltaValue) {
  if (!Number.isFinite(waveDeltaValue) || waveDeltaValue === 0) {
    return { label: 'neutral', icon: '•' };
  }
  return waveDeltaValue > 0
    ? { label: 'good', icon: '✔' }
    : { label: 'bad', icon: '❌' };
}

function kiHeadline(ki) {
  if (!Number.isFinite(ki)) return 'No data';
  if (ki >= 0.8) return 'Excellent conditions';
  if (ki >= 0.65) return 'Good conditions';
  if (ki >= 0.5) return 'Decent conditions';
  if (ki >= 0.35) return 'Mixed conditions';
  return 'Poor conditions';
}

function formatWaveReason(detail) {
  if (!detail) return 'n/a';
  const clean = detail.split('→')[0].trim();
  const match = clean.match(/;\s*(.*)$/);
  if (!match) return clean;
  const summary = match[1]
    .replace(/^issues:\s*/i, '')
    .replace(/^good:\s*/i, '');
  return summary || clean;
}

function gustSummary(gustFactor) {
  if (!Number.isFinite(gustFactor)) return 'n/a';
  if (gustFactor >= 1.6) return 'gusty, unstable';
  if (gustFactor <= 1.3) return 'steady';
  return 'mixed';
}

function directionSummary(score) {
  if (!Number.isFinite(score)) return 'n/a';
  if (score >= 0.9) return 'aligned';
  if (score >= 0.7) return 'cross';
  return 'off';
}

function formatKiTooltip(score, extras = {}) {
  const sw = score.scores?.sw;
  const sg = score.scores?.sg;
  const sd = score.scores?.sd;
  const st = score.scores?.st;
  const sl = score.scores?.sl;
  const wave = score.scores?.waveBonus;

  const windSpeedText = Number.isFinite(extras.windSpeed)
    ? `${Math.round(extras.windSpeed)} kt`
    : 'n/a';
  const gustFactorText = Number.isFinite(score.gustFactor)
    ? score.gustFactor.toFixed(2)
    : 'n/a';
  const directionText = Number.isFinite(extras.windDirDegrees)
    ? `${Math.round(extras.windDirDegrees)}°`
    : 'n/a';
  const tideText =
    Number.isFinite(extras.tideHeight) &&
    Number.isFinite(extras.tideMin) &&
    Number.isFinite(extras.tideMax)
      ? `${extras.tideHeight.toFixed(2)}m (${extras.tideMin.toFixed(
          2,
        )}-${extras.tideMax.toFixed(2)}m)`
      : 'n/a';
  const daylightText = extras.isDaylightNow ? 'daytime' : 'night';
  const waveReason = formatWaveReason(score.details?.waves);

  const swClass = classifyScore(sw);
  const sgClass = classifyScore(sg);
  const sdClass = classifyScore(sd);
  const stClass = classifyScore(st);
  const slClass = classifyScore(sl);
  const waveClass = waveSummaryLabel(wave);

  const headline = kiHeadline(score.ki);
  const waveValue = Number.isFinite(wave) ? wave.toFixed(2) : '0.00';
  const waveSigned = Number.isFinite(wave) && wave > 0 ? `+${waveValue}` : waveValue;

  return (
    `Kiting Index: ${score.ki.toFixed(2)}  ${starText(score.stars)}\n` +
    `${headline}\n\n` +
    `Main factors:\n` +
    `• ${waveClass.icon} Waves: ${waveSigned} (${waveReason})\n` +
    `• ${sgClass.icon} Gusts: ${Number.isFinite(sg) ? sg.toFixed(2) : '—'} (${gustSummary(
      score.gustFactor,
    )})\n` +
    `• ${sdClass.icon} Direction: ${Number.isFinite(sd) ? sd.toFixed(2) : '—'} (${directionSummary(
      sd,
    )})\n\n` +
    `Score breakdown:\n` +
    `Wind speed: ${Number.isFinite(sw) ? sw.toFixed(2) : '—'} ${
      swClass.label
    } (${windSpeedText})\n` +
    `Gust steadiness: ${Number.isFinite(sg) ? sg.toFixed(2) : '—'} ${
      sgClass.label
    } (${gustFactorText})\n` +
    `Wind direction: ${Number.isFinite(sd) ? sd.toFixed(2) : '—'} ${
      sdClass.label
    } (${directionText})\n` +
    `Tide suitability: ${Number.isFinite(st) ? st.toFixed(2) : '—'} ${
      stClass.label
    } (${tideText})\n` +
    `Daylight: ${Number.isFinite(sl) ? sl.toFixed(2) : '—'} ${
      slClass.label
    } (${daylightText})\n` +
    `Wave adjustment: ${waveSigned} ${waveClass.label} (${waveReason})\n\n` +
    `Formula:\n` +
    `KI = clamp(\n` +
    `  (S_w^0.35 × S_g^0.30 × S_d^0.20 × S_t^0.10 × S_l^0.05)\n` +
    `  + Δ_wave\n` +
    `)`
  );
}

function applyColumnWash(cell, stars) {
  if (stars >= 4) {
    cell.classList.add('col-score-high');
  } else if (stars <= 2) {
    cell.classList.add('col-score-low');
  } else {
    cell.classList.add('col-score-mid');
  }
}

function buildDirectionCell(direction, degrees, subText) {
  const cell = document.createElement('td');
  cell.className = 'data-cell wind-direction-cell';
  const wrapper = document.createElement('div');
  wrapper.className = 'wind-cell';
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.style.transform = arrowForDegrees(degrees);
  const dirEl = document.createElement('span');
  dirEl.className = 'cell-main';
  dirEl.textContent = direction;
  wrapper.append(arrow, dirEl);
  if (subText) {
    const sub = document.createElement('span');
    sub.className = 'cell-sub ki-score';
    sub.textContent = subText;
    wrapper.appendChild(sub);
  }
  cell.appendChild(wrapper);
  return cell;
}

function buildWindCell(speed, direction, degrees) {
  const cell = document.createElement('td');
  cell.className = 'data-cell';
  const wrapper = document.createElement('div');
  wrapper.className = 'wind-cell';
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.style.transform = arrowForDegrees(degrees);
  const speedEl = document.createElement('span');
  speedEl.className = 'cell-main';
  speedEl.textContent = formatValue(speed, ' kt');
  const dirEl = document.createElement('span');
  dirEl.className = 'cell-sub';
  dirEl.textContent = direction;
  wrapper.append(arrow, speedEl, dirEl);
  cell.appendChild(wrapper);
  return cell;
}

function renderTideChart(svg, tideEvents, columns, headerCells) {
  svg.innerHTML = '';
  renderTideChart.lastLabelX = null;
  if (tideEvents.length < 2) return;

  const svgRect = svg.getBoundingClientRect();
  const svgWidth = Math.max(svgRect.width, 300);
  const svgHeight = 80;
  const padding = 10;
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  if (!headerCells.length) return;
  const svgLeft = svgRect.left;
  const headerCenters = headerCells.map((cell) => {
    const rect = cell.getBoundingClientRect();
    return rect.left - svgLeft + rect.width / 2;
  });
  const startX = headerCenters[0];
  const endX = headerCenters[headerCenters.length - 1];
  const start = columns[0]?.time ?? new Date();
  const end = columns[columns.length - 1]?.time ?? new Date();

  const events = tideEvents.filter(
    (event) => event.date && event.date >= start && event.date <= end,
  );
  const lastObservedDate = events
    .filter((event) => !event.predicted)
    .reduce((latest, event) => (latest && latest > event.date ? latest : event.date), null);
  const startLevel = tideLevelAt(tideEvents, start);
  if (startLevel) {
    events.push({
      type: 'CUR',
      height: `${startLevel.height.toFixed(2)} m`,
      timeText: formatTideTime.format(start),
      date: new Date(start),
    });
  }
  events.sort((a, b) => a.date - b.date);
  if (events.length < 2) return;

  const heights = events
    .map((event) => parseHeightNumber(event.height))
    .filter((value) => value !== null);
  if (!heights.length) return;
  const minHeight = Math.min(...heights) - 0.5;
  const maxHeight = Math.max(...heights) + 0.5;
  const scaleY = (value) => {
    const ratio = (value - minHeight) / (maxHeight - minHeight || 1);
    return svgHeight - padding - ratio * (svgHeight - padding * 2);
  };
  const scaleX = (date) =>
    startX + ((date - start) / (end - start || 1)) * (endX - startX);

  const points = [];
  for (let i = 0; i < events.length - 1; i += 1) {
    const current = events[i];
    const next = events[i + 1];
    const h1 = parseHeightNumber(current.height);
    const h2 = parseHeightNumber(next.height);
    if (h1 === null || h2 === null) continue;
    const t1 = current.date;
    const t2 = next.date;
    const segmentMinutes = (t2 - t1) / (60 * 1000);
    const step = 30;
    for (let m = 0; m <= segmentMinutes; m += step) {
      const ratio = segmentMinutes ? m / segmentMinutes : 0;
      const value = h1 + ((h2 - h1) * (1 - Math.cos(Math.PI * ratio))) / 2;
      const time = new Date(t1.getTime() + m * 60 * 1000);
      points.push({ x: scaleX(time), y: scaleY(value) });
    }
  }

  if (!points.length) return;

  if (lastObservedDate) {
    const cutoffX = scaleX(lastObservedDate);
    const shade = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'rect',
    );
    shade.setAttribute('x', cutoffX);
    shade.setAttribute('y', 0);
    shade.setAttribute('width', Math.max(0, svgWidth - cutoffX));
    shade.setAttribute('height', svgHeight);
    shade.setAttribute('class', 'tide-predicted-zone');
    svg.appendChild(shade);
  }

  events.forEach((event) => {
    if (!event.type || (event.type !== 'HIGH' && event.type !== 'LOW')) return;
    const cx = scaleX(event.date);
    const guide = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'line',
    );
    guide.setAttribute('x1', cx);
    guide.setAttribute('x2', cx);
    guide.setAttribute('y1', padding);
    guide.setAttribute('y2', svgHeight - padding);
    guide.setAttribute('stroke', 'rgba(231, 242, 255, 0.08)');
    guide.setAttribute('stroke-width', '1');
    svg.appendChild(guide);
  });

  const fillPath = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'path',
  );
  const baseline = svgHeight - padding;
  const fillD = `${points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')} L ${points[points.length - 1].x} ${baseline} L ${
    points[0].x
  } ${baseline} Z`;
  fillPath.setAttribute('d', fillD);
  fillPath.setAttribute('fill', 'rgba(78, 161, 255, 0.2)');
  svg.appendChild(fillPath);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#2c6bbf');
  path.setAttribute('stroke-width', '2');
  svg.appendChild(path);

  events.forEach((event) => {
    const height = parseHeightNumber(event.height);
    if (height === null) return;
    const cx = scaleX(event.date);
    const cy = scaleY(height);
    const circle = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'circle',
    );
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', '3');
    circle.setAttribute(
      'class',
      event.predicted ? 'tide-marker predicted' : 'tide-marker',
    );
    svg.appendChild(circle);

    if (
      !renderTideChart.lastLabelX ||
      Math.abs(cx - renderTideChart.lastLabelX) > 70
    ) {
      const label = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text',
      );
      label.setAttribute('x', cx);
      label.setAttribute('y', Math.max(cy - 6, padding - 2));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute(
        'class',
        event.predicted ? 'tide-label predicted' : 'tide-label',
      );
      label.textContent = `${event.timeText} · ${event.height}`;
      svg.appendChild(label);
      renderTideChart.lastLabelX = cx;
    }
  });
}

function renderForecast(data, tideEvents) {
  ui.forecastHeadRow.innerHTML = '';
  ui.forecastBody.innerHTML = '';
  const dateLabel = document.createElement('th');
  dateLabel.className = 'label-cell';
  dateLabel.dataset.fullLabel = 'Date';
  dateLabel.dataset.abbrev = 'Date';
  dateLabel.textContent = 'Date';
  ui.forecastHeadRow.appendChild(dateLabel);

  const times = data.hourly.time.map((time) => new Date(time));
  const now = new Date();
  const end = new Date(
    now.getTime() + config.forecastDays * 24 * 60 * 60 * 1000,
  );
  let startIndex = times.findIndex((time) => time >= now);
  if (startIndex < 0) startIndex = 0;

  const windowSize = config.forecastWindowHours;
  const columns = [];
  for (let i = startIndex; i < times.length; i += windowSize) {
    const time = times[i];
    if (time > end) break;
    columns.push({ time, index: i });
    ui.forecastHeadRow.appendChild(buildHeaderCell(time));
  }

  // Extend upstream tide events to cover at least the visible forecast horizon.
  const lastColumnTime = columns.length
    ? columns[columns.length - 1].time
    : end;
  const horizonEnd = new Date(
    lastColumnTime.getTime() + windowSize * 60 * 60 * 1000,
  );
  const minimumEnd = new Date(
    now.getTime() + (config.tide.predictDays || 14) * 24 * 60 * 60 * 1000,
  );
  const targetEnd = horizonEnd > minimumEnd ? horizonEnd : minimumEnd;
  const tideSeries = extendTideEvents(tideEvents, targetEnd);

  const rows = [
    { label: 'Time', abbrev: 'Time', key: 'time' },
    { label: 'KI', abbrev: 'KI', key: 'ki' },
    { label: 'Temp (°C)', abbrev: 'Temp', key: 'temperature_2m' },
    { label: 'Wind (kt)', abbrev: 'Wind', key: 'wind_power' },
    { label: 'Direction', abbrev: 'Dir', key: 'wind_direction_10m' },
    { label: 'Waves (m)', abbrev: 'Wave', key: 'wave' },
    { label: 'Rain (mm)', abbrev: 'Rain', key: 'precipitation' },
    { label: 'Sky', abbrev: 'Sky', key: 'sky' },
    { label: 'Moon', abbrev: 'Moon', key: 'moon' },
    { label: 'Tide (m)', abbrev: 'Tide', key: 'tide' },
    { label: 'Tide curve', abbrev: 'Curve', key: 'tide_curve' },
  ];

  const tideHeights = tideSeries
    .map((event) => parseHeightNumber(event.height))
    .filter((value) => value !== null);
  const tideRange = tideHeights.length
    ? { min: Math.min(...tideHeights), max: Math.max(...tideHeights) }
    : null;

  const columnScores = columns.map((column) => {
    const windSpeed = data.hourly.wind_speed_10m[column.index];
    const gustSpeed = data.hourly.wind_gusts_10m[column.index];
    const degrees = data.hourly.wind_direction_10m[column.index];
    const waveHeight = data.hourly.wave_height?.[column.index];
    const wavePeriod = data.hourly.wave_period?.[column.index];
    const tideLevel = tideLevelAt(tideSeries, column.time);
    return kiteIndex({
      windSpeed,
      gustSpeed,
      windDirDegrees: degrees,
      tideLevel,
      tideRange,
      isDaylightNow: isDaylight(column.time, config.latitude, config.longitude),
      waveHeight,
      wavePeriod,
    });
  });

  // No demo data; show real KI only.

  const headerCells = Array.from(
    ui.forecastHeadRow.querySelectorAll('th.data-cell'),
  );
  headerCells.forEach((cell, index) => {
    if (columnScores[index]) {
      applyColumnWash(cell, columnScores[index].stars);
      const score = columnScores[index];
      const windSpeed = data.hourly.wind_speed_10m[columns[index].index];
      const degrees = data.hourly.wind_direction_10m[columns[index].index];
      const tideLevel = tideLevelAt(tideSeries, columns[index].time);
      cell.title = formatKiTooltip(score, {
        windSpeed,
        windDirDegrees: degrees,
        tideHeight: tideLevel?.height ?? null,
        tideMin: tideRange?.min ?? null,
        tideMax: tideRange?.max ?? null,
        isDaylightNow: isDaylight(
          columns[index].time,
          config.latitude,
          config.longitude,
        ),
      });
    }
  });

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const label = document.createElement('th');
    label.className = 'label-cell';
    label.dataset.fullLabel = row.label;
    label.dataset.abbrev = row.abbrev || row.label;
    label.textContent = row.label;
    if (row.key === 'precipitation') {
      label.title = 'Precipitation probability (%) and amount';
    }
    if (row.key === 'sky') {
      label.title = 'Cloud cover (%)';
    }
    if (row.key === 'moon') {
      label.title = 'Moon illumination (%)';
    }
    if (row.key === 'wind_power') {
      label.title = `Mean wind → gusts (kt).\nGF = gust / wind`;
    }
    if (row.key === 'ki') {
      label.title = 'Kiteability Index (0-1) mapped to stars';
    }
    if (row.key === 'tide_curve') {
      label.title = 'Dark region indicates predicted tides';
    }
    if (row.key === 'wave') {
      label.title = 'Wave height (m) with period (s)';
    }
    tr.appendChild(label);

    if (row.key === 'tide_curve') {
      const cell = document.createElement('td');
      cell.className = 'data-cell tide-curve-cell';
      cell.colSpan = columns.length;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'tide-row-svg');
      cell.appendChild(svg);
      tr.appendChild(cell);
      ui.forecastBody.appendChild(tr);
      return;
    }

    columns.forEach((column, colIndex) => {
      if (row.key === 'wind_power') {
        const speed = data.hourly.wind_speed_10m[column.index];
        const gusts = data.hourly.wind_gusts_10m[column.index];
        const gustFactor = speed ? gusts / speed : null;
        const score = columnScores[colIndex];
        const swTag = formatScoreTag(score.scores?.sw);
        const sgTag = formatScoreTag(score.scores?.sg);
        const gfText = Number.isFinite(gustFactor)
          ? `GF ${gustFactor.toFixed(2)}`
          : 'GF n/a';
        const windColor = colorForValue(speed, [
          { value: 0, color: '#0a1a2b' },
          { value: 8, color: '#12314f' },
          { value: 12, color: '#1a4f86' },
          { value: 16, color: '#1a7a63' },
          { value: 20, color: '#6b8f1a' },
          { value: 24, color: '#c47c13' },
          { value: 28, color: '#c0392b' },
          { value: 32, color: '#7b1d6b' },
        ]);
        const gustColor = colorForValue(gusts, [
          { value: 0, color: '#0a1a2b' },
          { value: 8, color: '#12314f' },
          { value: 12, color: '#1a4f86' },
          { value: 16, color: '#1a7a63' },
          { value: 20, color: '#6b8f1a' },
          { value: 24, color: '#c47c13' },
          { value: 28, color: '#c0392b' },
          { value: 32, color: '#7b1d6b' },
        ]);
        const midColor = lerpColor(windColor, gustColor, 0.5);
        const cell = buildDataCell(
          `${Math.round(speed)}→${Math.round(gusts)}`,
          '',
          `linear-gradient(90deg, ${windColor} 0%, ${midColor} 50%, ${gustColor} 100%)`,
        );
        cell.classList.add('wind-power-cell');
        setCellSubText(cell, `${gfText} ${swTag}`);
        addCellScoreLine(cell, sgTag);
        cell.title = [score.details?.wind, score.details?.gust]
          .filter(Boolean)
          .join('\n');
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'wind_direction_10m') {
        const degrees = data.hourly.wind_direction_10m[column.index];
        const direction = windCompass(degrees);
        const score = columnScores[colIndex];
        const sdTag = formatScoreTag(score.scores?.sd);
        const cell = buildDirectionCell(direction, degrees, sdTag);
        cell.style.background = 'rgba(8, 18, 28, 0.5)';
        applyColumnWash(cell, columnScores[colIndex].stars);
        if (score.details?.direction) {
          cell.title = score.details.direction;
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'wave') {
        const waveHeight = data.hourly.wave_height?.[column.index];
        const wavePeriod = data.hourly.wave_period?.[column.index];
        const score = columnScores[colIndex];
        const heightText = Number.isFinite(waveHeight)
          ? Number(waveHeight).toFixed(1).replace(/\.0$/, '')
          : '—';
        const periodText = Number.isFinite(wavePeriod)
          ? `${Number(wavePeriod).toFixed(1).replace(/\.0$/, '')}s`
          : '';
        const waveTag = formatDeltaTag(score.scores?.waveBonus);
        const cell = buildDataCell(
          heightText,
          periodText,
          colorForValue(waveHeight, [
            { value: 0, color: '#06101f' },
            { value: 0.5, color: '#12314f' },
            { value: 1, color: '#1a4f86' },
            { value: 1.5, color: '#1a7a63' },
            { value: 2, color: '#6b8f1a' },
            { value: 2.5, color: '#c47c13' },
            { value: 3, color: '#c0392b' },
          ]),
        );
        applyColumnWash(cell, columnScores[colIndex].stars);
        if (periodText) {
          addCellScoreLine(cell, waveTag);
        } else {
          setCellSubText(cell, waveTag);
        }
        if (score.details?.waves) {
          cell.title = score.details.waves;
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'tide') {
        const windowStart = column.time;
        const windowEnd = new Date(
          windowStart.getTime() + windowSize * 60 * 60 * 1000,
        );
        const tideText = tideForWindow(tideSeries, windowStart, windowEnd);
        const score = columnScores[colIndex];
        const cell = buildDataCell(
          tideText,
          formatScoreTag(score.scores?.st),
        );
        applyColumnWash(cell, columnScores[colIndex].stars);
        if (score.details?.tide) {
          cell.title = score.details.tide;
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'temperature_2m') {
        const temp = data.hourly.temperature_2m[column.index];
        const cell = buildDataCell(
          `${Math.round(temp)}°`,
          '',
          colorForValue(temp, [
            { value: -2, color: '#1b2b44' },
            { value: 4, color: '#225c8a' },
            { value: 10, color: '#1f8a70' },
            { value: 16, color: '#f6aa1c' },
            { value: 22, color: '#f2545b' },
          ]),
        );
        applyColumnWash(cell, columnScores[colIndex].stars);
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'precipitation') {
        const precip = data.hourly.precipitation[column.index];
        const prob = data.hourly.precipitation_probability[column.index];
        const cell = buildDataCell(
          `${
            Number.isNaN(Number(precip))
              ? '—'
              : Number(precip).toFixed(1).replace(/\.0$/, '')
          }`,
          `${Math.round(prob)}%`,
          colorForValue(prob, [
            { value: 0, color: '#2c6bbf' },
            { value: 30, color: '#1e4e9c' },
            { value: 60, color: '#12314f' },
            { value: 80, color: '#0a1828' },
          ]),
        );
        applyColumnWash(cell, columnScores[colIndex].stars);
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'sky') {
        const cloud = data.hourly.cloud_cover[column.index];
        const icon = skyIcon(cloud, column.time);
        const cell = buildDataCell(
          '',
          `${Math.round(cloud)}%`,
          colorForValue(cloud, [
            { value: 0, color: '#1e4e9c' },
            { value: 30, color: '#163a5a' },
            { value: 60, color: '#0f2538' },
            { value: 80, color: '#081420' },
          ]),
        );
        cell.classList.add('sky-cell');
        const main = cell.querySelector('.cell-main');
        if (main) {
          main.textContent = '';
          main.appendChild(createMeteoconsIcon(icon));
          main.style.color = cloud < 20 ? '#ffd54a' : 'var(--ink)';
        }
        applyColumnWash(cell, columnScores[colIndex].stars);
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'moon') {
        const { icon, illumination } = lunarPhaseInfo(column.time);
        const cell = buildDataCell(
          '',
          `${Math.round(illumination * 100)}%`,
          timeGradient(column.time),
        );
        cell.classList.add('moon-cell');
        const main = cell.querySelector('.cell-main');
        if (main) {
          main.textContent = '';
          main.appendChild(createMeteoconsIcon(icon));
          main.style.color = '#ffdca8';
        }
        applyColumnWash(cell, columnScores[colIndex].stars);
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'time') {
        const score = columnScores[colIndex];
        const cell = buildTimeCell(column.time);
        applyColumnWash(cell, columnScores[colIndex].stars);
        setCellSubText(cell, formatScoreTag(score.scores?.sl));
        if (score.details?.daylight) {
          cell.title = score.details.daylight;
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'ki') {
        const { ki, stars } = columnScores[colIndex];
        const starText = stars ? '★'.repeat(stars) : '―';
        const cell = buildDataCell(
          ki.toFixed(2),
          starText,
          colorForValue(ki, [
            { value: 0, color: '#0a1828' },
            { value: 0.35, color: '#1e4e9c' },
            { value: 0.5, color: '#2f7d32' },
            { value: 0.65, color: '#4caf50' },
            { value: 0.8, color: '#7ed957' },
          ]),
        );
        cell.classList.add('ki-cell');
        const score = columnScores[colIndex];
        const tideLevel = tideLevelAt(tideSeries, column.time);
        cell.title = formatKiTooltip(score, {
          windSpeed: data.hourly.wind_speed_10m[column.index],
          windDirDegrees: data.hourly.wind_direction_10m[column.index],
          tideHeight: tideLevel?.height ?? null,
          tideMin: tideRange?.min ?? null,
          tideMax: tideRange?.max ?? null,
          isDaylightNow: isDaylight(
            column.time,
            config.latitude,
            config.longitude,
          ),
        });
        const sub = cell.querySelector('.cell-sub');
        if (sub) {
          sub.classList.add(stars ? 'ki-stars' : 'ki-zero');
        }
        applyColumnWash(cell, stars);
        tr.appendChild(cell);
        return;
      }
    });

    ui.forecastBody.appendChild(tr);
  });

  if (columns.length) {
    if (ui.forecastRange) {
      ui.forecastRange.textContent = `${formatWindow.format(
        columns[0].time,
      )} → ${formatWindow.format(columns[columns.length - 1].time)}`;
    }
  } else if (ui.forecastRange) {
    ui.forecastRange.textContent = 'No forecast windows';
  }

  const curveRow = ui.forecastBody.querySelector('.tide-curve-cell svg');
  if (curveRow) {
    requestAnimationFrame(() => {
      renderTideChart(curveRow, tideSeries, columns, headerCells);
    });
  }

  if (ui.currentScore && columns.length) {
    const now = new Date();
    const nowIndex = columns.findIndex((column) => column.time >= now);
    const columnIndex = nowIndex >= 0 ? nowIndex : 0;
    const { stars, reasons } = columnScores[columnIndex];
    ui.currentScore.textContent = stars ? '★'.repeat(stars) : '—';
    ui.currentScore.style.color = stars ? '#f7c948' : '#9bb2c8';
    ui.currentScore.title = reasons.length
      ? reasons.join(' \n')
      : 'No score boosts.';
  }

  // Sticky label width is handled via the 'forecast-scrolled' root class.
}

function saveCache(weather, tides, weatherUpdatedAt, tidesUpdatedAt) {
  localStorage.setItem(cacheKeys.weather, JSON.stringify(weather));
  localStorage.setItem(cacheKeys.tides, JSON.stringify(tides));
  if (weatherUpdatedAt)
    localStorage.setItem(cacheKeys.weatherUpdatedAt, String(weatherUpdatedAt));
  if (tidesUpdatedAt)
    localStorage.setItem(cacheKeys.tidesUpdatedAt, String(tidesUpdatedAt));
}

function alignHourlySeries(targetTimes, sourceTimes, sourceValues) {
  if (!Array.isArray(targetTimes) || !Array.isArray(sourceTimes)) {
    return [];
  }
  const lookup = new Map();
  sourceTimes.forEach((time, index) => {
    lookup.set(time, sourceValues?.[index] ?? null);
  });
  return targetTimes.map((time) => (lookup.has(time) ? lookup.get(time) : null));
}

function mergeWaveData(weather, waves) {
  if (!weather?.hourly?.time || !waves?.hourly?.time) {
    return weather;
  }
  const targetTimes = weather.hourly.time;
  const sourceTimes = waves.hourly.time;
  const waveFields = ['wave_height', 'wave_period', 'wave_direction'];
  const mergedHourly = { ...weather.hourly };
  waveFields.forEach((field) => {
    if (Array.isArray(waves.hourly[field])) {
      mergedHourly[field] = alignHourlySeries(
        targetTimes,
        sourceTimes,
        waves.hourly[field],
      );
    }
  });
  return { ...weather, hourly: mergedHourly };
}

function saveWavesCache(waves, updatedAt) {
  localStorage.setItem(cacheKeys.waves, JSON.stringify(waves));
  if (updatedAt)
    localStorage.setItem(cacheKeys.wavesUpdatedAt, String(updatedAt));
}

function loadCache() {
  const weatherRaw = localStorage.getItem(cacheKeys.weather);
  const tidesRaw = localStorage.getItem(cacheKeys.tides);
  const wavesRaw = localStorage.getItem(cacheKeys.waves);
  const weatherUpdatedAt = localStorage.getItem(cacheKeys.weatherUpdatedAt);
  const tidesUpdatedAt = localStorage.getItem(cacheKeys.tidesUpdatedAt);
  const wavesUpdatedAt = localStorage.getItem(cacheKeys.wavesUpdatedAt);
  if (!weatherRaw) return null;
  try {
    const weather = JSON.parse(weatherRaw);
    const tides = tidesRaw
      ? JSON.parse(tidesRaw).map((event) => ({
          ...event,
          date: event.date ? new Date(event.date) : null,
        }))
      : [];
    const waves = wavesRaw ? JSON.parse(wavesRaw) : null;
    return {
      weather,
      tides,
      waves,
      weatherUpdatedAt: weatherUpdatedAt || null,
      tidesUpdatedAt: tidesUpdatedAt || null,
      wavesUpdatedAt: wavesUpdatedAt || null,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

function renderFromCache() {
  const cached = loadCache();
  if (!cached) {
    return false;
  }

  const mergedWeather = mergeWaveData(cached.weather, cached.waves);
  renderCurrent(mergedWeather);
  renderForecast(mergedWeather, cached.tides);
  setTideStatus('');
  setUpdatedLabel(
    ui.weatherUpdated,
    'Weather updated',
    cached.weatherUpdatedAt,
  );
  setUpdatedLabel(ui.tidesUpdated, 'Tides updated', cached.tidesUpdatedAt);

  if (!cached.tides || !cached.tides.length) {
    loadTides({ force: false })
      .then((res) => {
        if (!res?.items || !res.items.length) return;
        renderForecast(cached.weather, res.items);
        saveCache(
          cached.weather,
          res.items,
          cached.weatherUpdatedAt,
          res.updatedAt,
        );
      })
      .catch((error) => {
        console.error(error);
      });
  }

  if (!cached.waves) {
    loadWaves({ force: false })
      .then((res) => {
        if (!res?.data) return;
        const freshWeather = mergeWaveData(cached.weather, res.data);
        renderForecast(freshWeather, cached.tides);
        saveWavesCache(res.data, res.updatedAt);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return cached;
}

function handleError(error) {
  if (ui.currentSummary) {
    ui.currentSummary.textContent = 'Offline';
  }
  setUpdatedLabel(ui.weatherUpdated, 'Weather updated', null);
  setUpdatedLabel(ui.tidesUpdated, 'Tides updated', null);
  console.error(error);
}

async function loadForecast(options = {}) {
  const force = options.force === true;

  setLocation();

  try {
    const [weatherResponse, tideRes, wavesRes] = await Promise.all([
      fetch(buildUrl()),
      loadTides({ force }),
      loadWaves({ force }),
    ]);
    if (!weatherResponse.ok) {
      throw new Error(`Weather proxy error: ${weatherResponse.status}`);
    }
    const weatherUpdatedAt = weatherResponse.headers.get('X-Updated-At');
    const data = await weatherResponse.json();
    const tideItems = tideRes?.items || [];
    const tidesUpdatedAt = tideRes?.updatedAt || null;
    const wavesData = wavesRes?.data || null;
    const wavesUpdatedAt = wavesRes?.updatedAt || null;
    const mergedWeather = mergeWaveData(data, wavesData);

    renderCurrent(mergedWeather);
    renderForecast(mergedWeather, tideItems);
    setTideStatus('');
    setUpdatedLabel(ui.weatherUpdated, 'Weather updated', weatherUpdatedAt);
    setUpdatedLabel(ui.tidesUpdated, 'Tides updated', tidesUpdatedAt);
    saveCache(data, tideItems, weatherUpdatedAt, tidesUpdatedAt);
    if (wavesData) {
      saveWavesCache(wavesData, wavesUpdatedAt);
    }
  } catch (error) {
    handleError(error);
  }
}

async function loadWaves(options = {}) {
  try {
    const response = await fetch(buildWavesUrl(options));
    const updatedAt = response.headers.get('X-Updated-At');
    if (!response.ok) {
      let details = '';
      try {
        const payload = await response.json();
        if (payload?.error) details = payload.error;
        if (payload?.details) {
          details = details ? `${details} ${payload.details}` : payload.details;
        }
      } catch (error) {
        details = await response.text();
      }
      const message = details
        ? `Wave proxy error: ${response.status} (${details})`
        : `Wave proxy error: ${response.status}`;
      throw new Error(message);
    }
    const data = await response.json();
    return { data, updatedAt };
  } catch (error) {
    console.error(error);
    return { data: null, updatedAt: null };
  }
}

if (ui.refresh) {
  ui.refresh.addEventListener('click', () => {
    loadForecast({ force: true });
  });
}

setLocation();
const cacheResult = renderFromCache();
const cacheFresh =
  cacheResult &&
  cacheResult.updated &&
  Date.now() - cacheResult.updated < CACHE_STALE_MS;
if (!cacheFresh) {
  loadForecast({ force: false });
}
