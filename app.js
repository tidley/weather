console.log('APP.JS VERSION:', '2026-05-23-window-dates-lines-1');

const DEFAULT_LOCATION_KEY = 'st-leonards';

const locations = {
  'st-leonards': {
    label: 'St Leonards',
    locationName: 'St Leonards-on-Sea, UK',
    latitude: 50.849533,
    longitude: 0.537056,
    tideStationId: '0085',
    tideStationName: 'Hastings',
    shoreNormalDeg: 180,
    kiteTideMode: 'low',
  },
  hayle: {
    label: 'Hayle',
    locationName: 'Hayle, UK',
    latitude: 50.186111,
    longitude: -5.421389,
    tideStationId: '0547',
    tideStationName: 'St. Ives',
    shoreNormalDeg: 0,
    kiteTideMode: 'high',
  },
};

const defaultLocation = locations[DEFAULT_LOCATION_KEY];

const config = {
  activeLocation: DEFAULT_LOCATION_KEY,
  locationName: defaultLocation.locationName,
  latitude: defaultLocation.latitude,
  longitude: defaultLocation.longitude,
  shoreNormalDeg: defaultLocation.shoreNormalDeg,
  kiteTideMode: defaultLocation.kiteTideMode || 'low',
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
    stationId: defaultLocation.tideStationId,
    stationName: defaultLocation.tideStationName,
    sourceUrl: 'https://admiraltyapi.portal.azure-api.net/',
    apiUrl: '/tides.php',
    // Minimum tide coverage to extend to (days). Weather horizon is 16 days.
    predictDays: 16,
  },
};

const ui = {
  locationName: document.getElementById('location-name'),
  currentTemp: document.getElementById('current-temp'),
  currentWind: document.getElementById('current-wind'),
  summaryBand: document.getElementById('decision-band'),
  summaryOverall: document.getElementById('summary-overall'),
  summaryKiScore: document.getElementById('summary-ki-score'),
  summaryPiScore: document.getElementById('summary-pi-score'),
  summaryDaylight: document.getElementById('summary-daylight'),
  summaryUpdated: document.getElementById('summary-updated'),
  summaryWind: document.getElementById('summary-wind'),
  summaryGusts: document.getElementById('summary-gusts'),
  summaryGustQuality: document.getElementById('summary-gust-quality'),
  summaryGustFactor: document.getElementById('summary-gust-factor'),
  summaryDirection: document.getElementById('summary-direction'),
  summaryDirectionIcon: document.getElementById('summary-direction-icon'),
  summaryDirectionSafety: document.getElementById('summary-direction-safety'),
  summaryDirectionDetail: document.getElementById('summary-direction-detail'),
  summaryTemp: document.getElementById('summary-temp'),
  summaryWaves: document.getElementById('summary-waves'),
  summaryTide: document.getElementById('summary-tide'),
  summaryTideUsability: document.getElementById('summary-tide-usability'),
  summaryRain: document.getElementById('summary-rain'),
  summaryBestWindows: document.getElementById('summary-best-windows'),
  summaryMainIssue: document.getElementById('summary-main-issue'),
  summaryChips: document.getElementById('summary-chips'),
  forecastGrid: document.getElementById('forecast-grid'),
  forecastHeadRow: document.getElementById('forecast-head-row'),
  forecastBody: document.getElementById('forecast-body'),
  forecastRange: document.getElementById('forecast-range'),
  tideStatus: document.getElementById('tide-status'),
  tideSource: document.getElementById('tide-source'),
  tideSvg: document.getElementById('tide-svg'),
  refresh: document.getElementById('refresh'),
  toggleNight: document.getElementById('toggle-night'),
  locationOptions: Array.from(
    document.querySelectorAll('input[name="forecast-location"]'),
  ),
};

const cacheKeys = {
  location: 'forecast.location',
  weather: 'forecast.weather',
  tides: 'forecast.tides',
  waves: 'forecast.waves',
  weatherUpdatedAt: 'forecast.weatherUpdatedAt',
  tidesUpdatedAt: 'forecast.tidesUpdatedAt',
  wavesUpdatedAt: 'forecast.wavesUpdatedAt',
};

function isValidLocationKey(locationKey) {
  return Object.prototype.hasOwnProperty.call(locations, locationKey);
}

function cacheKey(key, locationKey = config.activeLocation) {
  if (key === 'location') return cacheKeys.location;
  return `${cacheKeys[key]}.${locationKey}`;
}

function readLocationPreference() {
  try {
    const locationKey = localStorage.getItem(cacheKey('location'));
    return isValidLocationKey(locationKey) ? locationKey : DEFAULT_LOCATION_KEY;
  } catch (error) {
    return DEFAULT_LOCATION_KEY;
  }
}

function saveLocationPreference(locationKey) {
  try {
    localStorage.setItem(cacheKey('location'), locationKey);
  } catch (error) {
    console.warn('Location preference could not be saved', error);
  }
}

const formatWindow = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
});

const formatUpdatedTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
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

const formatSessionDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});

const formatWindowTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
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
let moonIconId = 0;

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

document.querySelectorAll('.meteocons-icon[data-meteocons]').forEach((icon) => {
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
      '.forecast-grid .label-cell, .forecast-grid .data-cell, .summary-tile',
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

function formatUpdatedValue(isoTime) {
  if (!isoTime) return '—';
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return '—';
  return formatUpdatedTime.format(date);
}

function formatAge(isoTime) {
  if (!isoTime) return null;
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function setSummaryUpdated(weatherIso, tidesIso) {
  if (!ui.summaryUpdated) return;
  const weatherText = formatUpdatedValue(weatherIso);
  const tidesText = formatUpdatedValue(tidesIso);
  const newest = [weatherIso, tidesIso]
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  const age = newest ? formatAge(new Date(newest).toISOString()) : null;
  ui.summaryUpdated.textContent = `Weather ${weatherText} · Tides ${tidesText}${
    age ? ` · Updated ${age}` : ''
  }`;
}

function setLocation() {
  if (ui.locationName) ui.locationName.textContent = config.locationName;
  document.title = `${config.locationName} Forecast`;
}

function syncLocationToggle() {
  ui.locationOptions.forEach((input) => {
    input.checked = input.value === config.activeLocation;
  });
}

function applyLocation(locationKey, options = {}) {
  const resolvedKey = isValidLocationKey(locationKey)
    ? locationKey
    : DEFAULT_LOCATION_KEY;
  const location = locations[resolvedKey];
  config.activeLocation = resolvedKey;
  config.locationName = location.locationName;
  config.latitude = location.latitude;
  config.longitude = location.longitude;
  config.shoreNormalDeg = location.shoreNormalDeg;
  config.kiteTideMode = location.kiteTideMode || 'low';
  config.tide.stationId = location.tideStationId;
  config.tide.stationName = location.tideStationName;

  if (options.persist) {
    saveLocationPreference(resolvedKey);
  }

  setLocation();
  syncLocationToggle();
}

function syncNightVisibility() {
  const enabled = ui.toggleNight ? ui.toggleNight.checked : true;
  document.documentElement.classList.toggle('hide-night', enabled);
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

function createMoonPhaseIcon(illumination, isWaxing) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('moon-phase-icon');

  const r = 9;
  const cx = 12;
  const cy = 12;
  const shift = 2 * r * Math.min(Math.max(illumination, 0), 1);
  const dx = isWaxing ? shift : -shift;
  const clipId = `moon-clip-${moonIconId++}`;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const clipPath = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'clipPath',
  );
  clipPath.setAttribute('id', clipId);
  const clipCircle = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'circle',
  );
  clipCircle.setAttribute('cx', String(cx));
  clipCircle.setAttribute('cy', String(cy));
  clipCircle.setAttribute('r', String(r));
  clipPath.appendChild(clipCircle);
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  const lit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  lit.setAttribute('cx', String(cx));
  lit.setAttribute('cy', String(cy));
  lit.setAttribute('r', String(r));
  lit.setAttribute('fill', '#bfe9ff');

  const shadow = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'circle',
  );
  shadow.setAttribute('cx', String(cx + dx));
  shadow.setAttribute('cy', String(cy));
  shadow.setAttribute('r', String(r));
  shadow.setAttribute('fill', '#0b1f2a');
  shadow.setAttribute('clip-path', `url(#${clipId})`);

  svg.appendChild(lit);
  svg.appendChild(shadow);
  return svg;
}

function createWindArrow() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('arrow');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3 12h12l-4-4 1.4-1.4L20.8 12l-8.4 5.4L11 16l4-4H3z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

function colorForValue(value, stops) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'transparent';
  }
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  if (!sorted.length) return 'transparent';
  if (value <= sorted[0].value) return sorted[0].color;

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const next = sorted[i];
    if (value <= next.value) {
      const span = next.value - previous.value;
      const t = span > 0 ? (value - previous.value) / span : 0;
      return lerpColor(previous.color, next.color, t);
    }
  }

  return sorted[sorted.length - 1].color;
}

function qualityBackground(kind) {
  const colors = {
    excellent: 'rgba(15, 139, 84, 0.72)',
    good: 'rgba(77, 151, 79, 0.64)',
    marginal: 'rgba(177, 139, 34, 0.6)',
    poor: 'rgba(196, 108, 32, 0.58)',
    'very-poor': 'rgba(178, 38, 74, 0.62)',
  };
  return colors[kind] || 'rgba(8, 18, 28, 0.5)';
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

function dayStripeColor(time) {
  const dayStart = new Date(
    time.getFullYear(),
    time.getMonth(),
    time.getDate(),
  );
  const dayIndex = Math.floor(dayStart.getTime() / 86400000);
  return dayIndex % 2 === 0 ? '#06101c' : '#163a5a';
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
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const isWaxing = fraction < 0.5;
  return { illumination, isWaxing };
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
  if (!data?.current) return;
}

function kiVerdict(kiPct) {
  if (kiPct >= 65) return 'GOOD';
  if (kiPct >= 45) return 'MARGINAL';
  return 'POOR';
}

function kiReason({ gustFactor, windKt, rainMm, wavesM, wavePeriodS }) {
  if (Number.isFinite(gustFactor) && gustFactor >= 2.0) return 'Gusty';
  if (Number.isFinite(windKt) && windKt < 12) return 'Light wind';
  if (Number.isFinite(rainMm) && rainMm >= 1) return 'Rain';
  if (
    Number.isFinite(wavesM) &&
    Number.isFinite(wavePeriodS) &&
    wavesM >= 2 &&
    wavePeriodS < 7
  )
    return 'Choppy waves';
  return 'Conditions look workable';
}

function formatOrDash(value, unit, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  const fixed = digits === 0 ? Math.round(value) : value.toFixed(digits);
  return unit ? `${fixed} ${unit}` : `${fixed}`;
}

function directionIcon(sdScore) {
  if (!Number.isFinite(sdScore)) return '';
  if (sdScore >= 0.75) return '✓';
  if (sdScore >= 0.5) return '⚠';
  return '✗';
}

function tideLabel(tideLevel, tideRange) {
  if (!tideLevel || !tideRange || tideRange.max <= tideRange.min) return null;
  const tNorm =
    (tideLevel.height - tideRange.min) / (tideRange.max - tideRange.min);
  if (tNorm <= 0.33) return 'Low';
  if (tNorm <= 0.66) return 'Mid';
  return 'High';
}

function renderSummary(
  data,
  tideSeries,
  column,
  score,
  tideRange,
  paddleScore,
  sessionText,
) {
  if (!column || !data?.hourly) return;
  const idx = column.index;
  const wind = data.hourly.wind_speed_10m?.[idx];
  const gusts = data.hourly.wind_gusts_10m?.[idx];
  const gustFactor = wind ? gusts / wind : null;
  const waveHeight = data.hourly.wave_height?.[idx];
  const wavePeriod = data.hourly.wave_period?.[idx];
  const temp = data.hourly.temperature_2m?.[idx];
  const rainProb = data.hourly.precipitation_probability?.[idx];
  const rainMm = data.hourly.precipitation?.[idx];
  const tideScoreTime = forecastWindowMidpoint(
    column.time,
    config.forecastWindowHours,
  );
  const tideLevel = tideLevelAt(tideSeries, tideScoreTime);
  const kiPct = Math.round(score.ki * 100);
  const piPct = paddleScore ? Math.round(paddleScore.pi * 100) : null;
  const verdict = kiteVerdictFromScore(score.ki);
  const gust = gustQuality(gustFactor);
  const tideUse = tideUsability(
    score,
    tideLevel,
    tideRange,
    tideSeries,
    tideScoreTime,
  );
  const mainIssue = mainIssueForColumn({
    score,
    wind,
    gustFactor,
    waveHeight,
    wavePeriod,
    rainMm,
    rainProb,
    isDaylightNow: column.isDaylight,
  });

  if (ui.summaryBand) ui.summaryBand.dataset.verdict = verdict;
  if (ui.summaryBand) {
    const kiTitle = formatKiTooltip(score, {
      windSpeed: wind,
      windDirDegrees: data.hourly.wind_direction_10m?.[idx],
      tideHeight: tideLevel?.height ?? null,
      tideMin: tideRange?.min ?? null,
      tideMax: tideRange?.max ?? null,
      isDaylightNow: column.isDaylight,
    });
    const piTitle = paddleScore
      ? formatPiTooltip(paddleScore, {
          windSpeed: wind,
          waveHeight,
          wavePeriod,
          precipitation: rainMm,
          precipitationProbability: rainProb,
          tideHeight: tideLevel?.height ?? null,
          tideMin: tideRange?.min ?? null,
          tideMax: tideRange?.max ?? null,
          isDaylightNow: column.isDaylight,
        })
      : '';
    ui.summaryBand.title = piTitle ? `${kiTitle}\n\n${piTitle}` : kiTitle;
  }
  if (ui.summaryOverall) ui.summaryOverall.textContent = verdict;
  if (ui.summaryKiScore) ui.summaryKiScore.textContent = `${kiPct}%`;
  if (ui.summaryPiScore) {
    ui.summaryPiScore.textContent =
      piPct === null ? 'PI —' : `PI ${piPct}%`;
  }
  if (ui.summaryDaylight) {
    ui.summaryDaylight.textContent = column.isDaylight ? 'Daylight' : 'Night';
  }

  if (ui.summaryWind) {
    ui.summaryWind.textContent = formatOrDash(wind, 'kt');
  }
  if (ui.summaryGusts) {
    ui.summaryGusts.textContent = Number.isFinite(gusts)
      ? Math.round(gusts)
      : '—';
  }
  if (ui.summaryGustQuality) {
    ui.summaryGustQuality.textContent = gust.label;
    ui.summaryGustQuality.dataset.kind = gust.kind;
  }
  if (ui.summaryGustFactor) {
    ui.summaryGustFactor.textContent = Number.isFinite(gustFactor)
      ? `GF ${gustFactor.toFixed(1)}`
      : 'GF —';
  }
  if (ui.summaryDirection) {
    ui.summaryDirection.textContent = windCompass(
      data.hourly.wind_direction_10m?.[idx],
    );
  }
  if (ui.summaryDirectionIcon) {
    ui.summaryDirectionIcon.textContent = directionIcon(score.scores?.sd);
  }
  if (ui.summaryDirectionSafety) {
    const safety = score.directionSafety;
    ui.summaryDirectionSafety.textContent =
      safety?.shortLabel || safety?.label || '—';
    ui.summaryDirectionSafety.dataset.kind = safety?.kind || '';
  }
  if (ui.summaryDirectionDetail) {
    ui.summaryDirectionDetail.textContent = score.directionSafety?.detail || '—';
  }
  if (ui.summaryTemp) {
    ui.summaryTemp.textContent = formatOrDash(temp, '°C');
  }

  if (ui.summaryWaves) {
    const wavesText = Number.isFinite(waveHeight)
      ? `${waveHeight.toFixed(1)} m`
      : '—';
    const periodText = Number.isFinite(wavePeriod)
      ? ` ${wavePeriod.toFixed(1)} s`
      : '';
    const target = ui.summaryWaves.querySelector('span:last-child');
    if (target) target.textContent = `${wavesText}${periodText}`;
  }
  if (ui.summaryTide) {
    const heightText = Number.isFinite(tideLevel?.height)
      ? ` · ${tideLevel.height.toFixed(1)}m`
      : '';
    ui.summaryTide.textContent = `${tideUse.detail}${heightText}`;
  }
  if (ui.summaryTideUsability) {
    ui.summaryTideUsability.textContent = tideUse.label;
    ui.summaryTideUsability.dataset.kind = tideUse.kind;
  }
  if (ui.summaryRain) {
    const rainText = Number.isFinite(rainMm)
      ? `${rainMm.toFixed(1).replace(/\.0$/, '')} mm`
      : '—';
    const target = ui.summaryRain.querySelector('span:last-child');
    if (target) target.textContent = rainText;
    ui.summaryRain.classList.toggle('muted', Number(rainMm) === 0);
  }
  if (ui.summaryBestWindows) {
    ui.summaryBestWindows.textContent = sessionText || 'No clean windows yet';
  }
  if (ui.summaryMainIssue) {
    ui.summaryMainIssue.textContent = mainIssue;
  }

  if (ui.summaryChips) {
    ui.summaryChips.innerHTML = '';
    ui.summaryChips.style.display = 'none';
    const penalties = [];
    const boosts = [];
    if (Number.isFinite(gustFactor) && gustFactor >= 1.55)
      penalties.push('very gusty');
    else if (Number.isFinite(gustFactor) && gustFactor >= 1.4)
      penalties.push('gusty');
    if (Number.isFinite(wind) && wind < 8) penalties.push('too light');
    if (score.directionSafety?.kind === 'very-poor') penalties.push('offshore');
    else if (score.directionSafety?.kind === 'poor') penalties.push('cross-off');
    if (Number.isFinite(score.scores?.st) && score.scores.st < 0.45)
      penalties.push('tide risk');
    if (Number.isFinite(rainMm) && rainMm >= 1) penalties.push('rain');
    if (!column.isDaylight) penalties.push('dark');
    if (
      Number.isFinite(waveHeight) &&
      Number.isFinite(wavePeriod) &&
      waveHeight >= 1.5 &&
      wavePeriod <= 6
    )
      penalties.push('choppy');
    if (score.scores?.sd >= 0.75) boosts.push('good direction');
    if (column.isDaylight) boosts.push('daylight');
    if (Number.isFinite(paddleScore?.pi) && paddleScore.pi >= 0.65)
      boosts.push('PI window');
    if (
      Number.isFinite(waveHeight) &&
      Number.isFinite(wavePeriod) &&
      waveHeight >= 0.8 &&
      waveHeight <= 1.8 &&
      wavePeriod >= 7
    )
      boosts.push('clean waves');

    const chips = [
      ...penalties.slice(0, 3).map((text) => ({ text, kind: 'penalty' })),
      ...boosts.slice(0, 3).map((text) => ({ text, kind: 'boost' })),
    ];
    if (chips.length) {
      ui.summaryChips.style.display = 'flex';
      chips.slice(0, 3).forEach((chip) => {
        const span = document.createElement('span');
        span.className = `reason-chip ${chip.kind}`;
        span.textContent = chip.text;
        ui.summaryChips.appendChild(span);
      });
    }
  }
}

function formatHeight(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${Number(value).toFixed(1)} m`;
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
    return `${level.height.toFixed(1)}`;
  }
  return within
    .slice(0, 2)
    .map((event) => {
      const value = parseHeightNumber(event.height);
      return value === null
        ? `${event.type[0]} —`
        : `${event.type[0]} ${value.toFixed(1)}`;
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

const HIGH_TIDE_OPTIMUM_HOURS = 1;
const HIGH_TIDE_FADE_HOURS = 6;

function nearestHighTide(tideEvents, time) {
  const targetMs = time instanceof Date ? time.getTime() : Number.NaN;
  if (!Number.isFinite(targetMs)) return null;
  const highs = tideEvents
    .filter(
      (event) =>
        event.type === 'HIGH' &&
        event.date instanceof Date &&
        !Number.isNaN(event.date.getTime()),
    )
    .sort((a, b) => {
      const aDelta = Math.abs(a.date.getTime() - targetMs);
      const bDelta = Math.abs(b.date.getTime() - targetMs);
      return aDelta - bDelta;
    });
  return highs[0] || null;
}

function highTideWindowScore(tideEvents, time) {
  if (!(time instanceof Date) || Number.isNaN(time.getTime())) return null;
  const high = nearestHighTide(tideEvents, time);
  if (!high) return null;
  const hoursFromHigh =
    Math.abs(high.date.getTime() - time.getTime()) / (60 * 60 * 1000);
  const raw =
    hoursFromHigh <= HIGH_TIDE_OPTIMUM_HOURS
      ? 1
      : 1 -
        (hoursFromHigh - HIGH_TIDE_OPTIMUM_HOURS) /
          (HIGH_TIDE_FADE_HOURS - HIGH_TIDE_OPTIMUM_HOURS);
  return {
    score: Math.max(0.3, clamp(raw)),
    nearestHigh: high,
    hoursFromHigh,
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
      nextType === 'HIGH' ? lastHigh : nextType === 'LOW' ? lastLow : null;
    const heightText =
      cap === null || !Number.isFinite(cap)
        ? null
        : `${Math.max(cap, 0).toFixed(1)}m`;

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

const DEFAULT_SHORE_NORMAL_DEG = 180;

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function signedAngleDelta(degrees, targetDegrees) {
  return ((((degrees - targetDegrees) % 360) + 540) % 360) - 180;
}

function beachDirectionSafety(
  windDirDegrees,
  shoreNormalDeg = config.shoreNormalDeg ?? DEFAULT_SHORE_NORMAL_DEG,
) {
  if (!Number.isFinite(windDirDegrees)) {
    return {
      label: 'Unknown',
      shortLabel: 'n/a',
      detail: 'Direction data n/a',
      score: 0.3,
      kind: 'poor',
    };
  }

  const dir = normalizeDegrees(windDirDegrees);
  const delta = signedAngleDelta(dir, shoreNormalDeg);
  const absDelta = Math.abs(delta);
  const side = delta < 0 ? 'left' : 'right';

  if (absDelta <= 18) {
    return {
      label: 'Onshore',
      shortLabel: 'Onshore',
      detail: 'Onshore / choppy',
      score: 0.72,
      kind: 'marginal',
      side,
    };
  }
  if (absDelta <= 65) {
    return {
      label: 'Cross-on',
      shortLabel: 'Cross-on',
      detail: 'Cross-onshore / good',
      score: 1,
      kind: 'excellent',
      side,
    };
  }
  if (absDelta <= 115) {
    return {
      label: 'Cross-shore',
      shortLabel: 'Cross',
      detail: 'Cross-shore / workable',
      score: 0.82,
      kind: 'good',
      side,
    };
  }
  if (absDelta <= 155) {
    return {
      label: 'Cross-off',
      shortLabel: 'Cross-off',
      detail: 'Cross-offshore / caution',
      score: 0.35,
      kind: 'poor',
      side,
    };
  }
  return {
    label: 'Offshore',
    shortLabel: 'Offshore',
    detail: 'Offshore / avoid',
    score: 0.05,
    kind: 'very-poor',
    side,
  };
}

function waveDelta({
  waveHeight,
  wavePeriod,
  windDirDegrees,
  shoreNormalDeg = config.shoreNormalDeg ?? DEFAULT_SHORE_NORMAL_DEG,
}) {
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
    ? Math.cos(((windDirDegrees - shoreNormalDeg) * Math.PI) / 180)
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
  shoreNormalDeg = config.shoreNormalDeg ?? DEFAULT_SHORE_NORMAL_DEG,
  tideLevel,
  tideRange,
  tideEvents = [],
  tideTime,
  tideMode = config.kiteTideMode || 'low',
  isDaylightNow,
  waveHeight,
  wavePeriod,
}) {
  const reasons = [];
  const details = {};

  const windValue = Number.isFinite(windSpeed) ? windSpeed : 0;
  const sw =
    windValue <= 45
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

  const directionSafety = beachDirectionSafety(windDirDegrees, shoreNormalDeg);
  const sd = directionSafety.score;
  const directionLabel = Number.isFinite(windDirDegrees)
    ? `${Math.round(windDirDegrees)}°`
    : 'n/a';
  reasons.push(
    `S_d direction: ${sd.toFixed(2)} (${directionSafety.detail}, ${directionLabel})`,
  );
  details.direction = `Direction ${directionLabel} (${directionSafety.detail}) \u2192 S_d ${sd.toFixed(
    2,
  )}`;

  let st = 0.5;
  let tideTiming = null;
  const scoringTime =
    tideTime instanceof Date && !Number.isNaN(tideTime.getTime())
      ? tideTime
      : null;
  if (tideMode === 'high' && scoringTime) {
    tideTiming = highTideWindowScore(tideEvents, scoringTime);
    if (tideTiming) {
      st = tideTiming.score;
    }
  }
  if (!tideTiming && tideLevel && tideRange && tideRange.max > tideRange.min) {
    const tNorm = clamp(
      (tideLevel.height - tideRange.min) / (tideRange.max - tideRange.min),
    );
    const target = 0.2;
    st = clamp(1 - Math.abs(tNorm - target) / 0.5);
  }
  st = Math.max(0.3, st);
  if (tideTiming) {
    const highTime = formatTideTime.format(tideTiming.nearestHigh.date);
    const highOffset = tideTiming.hoursFromHigh.toFixed(1);
    const windowText =
      tideTiming.hoursFromHigh <= HIGH_TIDE_OPTIMUM_HOURS
        ? 'inside high-tide window'
        : `${highOffset}h from high`;
    reasons.push(
      `S_t tide: ${st.toFixed(2)} (high tide ±${HIGH_TIDE_OPTIMUM_HOURS}h optimum; ${windowText})`,
    );
    const tideHeightText = Number.isFinite(tideLevel?.height)
      ? `; tide ${tideLevel.height.toFixed(2)}m`
      : '';
    details.tide = `Nearest high ${highTime} (${highOffset}h away${tideHeightText}) \u2192 S_t ${st.toFixed(
      2,
    )}`;
  } else if (tideLevel && tideRange && tideRange.max > tideRange.min) {
    reasons.push(`S_t tide: ${st.toFixed(2)} (prefers low)`);
    details.tide = `Tide ${tideLevel.height.toFixed(2)}m (range ${tideRange.min.toFixed(
      2,
    )}-${tideRange.max.toFixed(2)}m) \u2192 S_t ${st.toFixed(2)}`;
  } else {
    reasons.push(`S_t tide: ${st.toFixed(2)} (data n/a)`);
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

  const {
    delta: waveBonus,
    tag: waveTag,
    detail: waveDetail,
  } = waveDelta({
    waveHeight,
    wavePeriod,
    windDirDegrees,
    shoreNormalDeg,
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
    directionSafety,
    tideTiming,
    details,
  };
}

function paddleboardingIndex({
  windSpeed,
  gustSpeed,
  tideLevel,
  tideRange,
  isDaylightNow,
  waveHeight,
  wavePeriod,
  precipitation,
  precipitationProbability,
}) {
  const details = {};
  const windValue = Number.isFinite(windSpeed) ? windSpeed : null;

  let pw = 0.4;
  if (windValue !== null) {
    if (windValue <= 6) {
      pw = 1;
    } else if (windValue <= 10) {
      pw = 1 - ((windValue - 6) / (10 - 6)) * 0.35;
    } else if (windValue <= 16) {
      pw = 0.65 - ((windValue - 10) / (16 - 10)) * 0.5;
    } else if (windValue <= 20) {
      pw = 0.15 - ((windValue - 16) / (20 - 16)) * 0.15;
    } else {
      pw = 0;
    }
  }
  pw = clamp(pw);
  details.wind =
    windValue !== null
      ? `Wind ${Math.round(windValue)} kt \u2192 P_w ${pw.toFixed(2)}`
      : `Wind data n/a \u2192 P_w ${pw.toFixed(2)}`;

  const gustFactor =
    windValue && Number.isFinite(gustSpeed) ? gustSpeed / windValue : null;
  let pg = 0.75;
  if (gustFactor !== null) {
    if (gustFactor <= 1.25) pg = 1;
    else if (gustFactor >= 1.7) pg = 0.15;
    else pg = 1 - ((gustFactor - 1.25) / (1.7 - 1.25)) * 0.85;
  }
  pg = clamp(pg);
  details.gust =
    gustFactor !== null
      ? `Gust factor ${gustFactor.toFixed(2)} \u2192 P_g ${pg.toFixed(2)}`
      : `Gust factor n/a \u2192 P_g ${pg.toFixed(2)}`;

  let pWave = 0.75;
  if (Number.isFinite(waveHeight)) {
    const h = Math.max(0, waveHeight);
    let heightScore = 0;
    if (h <= 0.25) {
      heightScore = 1;
    } else if (h <= 0.6) {
      heightScore = 1 - ((h - 0.25) / (0.6 - 0.25)) * 0.35;
    } else if (h <= 1.0) {
      heightScore = 0.65 - ((h - 0.6) / (1.0 - 0.6)) * 0.45;
    } else if (h <= 1.4) {
      heightScore = 0.2 - ((h - 1.0) / (1.4 - 1.0)) * 0.2;
    }

    let periodScore = 1;
    if (Number.isFinite(wavePeriod) && h >= 0.3) {
      if (wavePeriod < 5) {
        periodScore = 0.65;
      } else if (wavePeriod < 7) {
        periodScore = 0.65 + ((wavePeriod - 5) / (7 - 5)) * 0.25;
      }
    }
    pWave = clamp(heightScore * periodScore);
  }
  const waveHeightText = Number.isFinite(waveHeight)
    ? `${waveHeight.toFixed(2)}m`
    : 'n/a';
  const wavePeriodText = Number.isFinite(wavePeriod)
    ? `${wavePeriod.toFixed(1)}s`
    : 'n/a';
  details.waves = `Waves ${waveHeightText}, ${wavePeriodText} \u2192 P_wave ${pWave.toFixed(
    2,
  )}`;

  let pt = 0.65;
  if (tideLevel && tideRange && tideRange.max > tideRange.min) {
    const tNorm = clamp(
      (tideLevel.height - tideRange.min) / (tideRange.max - tideRange.min),
    );
    const target = 0.62;
    pt = Math.max(0.3, clamp(1 - Math.abs(tNorm - target) / 0.62));
  }
  if (tideLevel && tideRange && tideRange.max > tideRange.min) {
    details.tide = `Tide ${tideLevel.height.toFixed(2)}m (range ${tideRange.min.toFixed(
      2,
    )}-${tideRange.max.toFixed(2)}m) \u2192 P_t ${pt.toFixed(2)}`;
  } else {
    details.tide = `Tide data n/a \u2192 P_t ${pt.toFixed(2)}`;
  }

  const pl = isDaylightNow ? 1 : 0;
  details.daylight = `${
    isDaylightNow ? 'Daylight' : 'Night'
  } \u2192 P_l ${pl.toFixed(2)}`;

  const rainMm = Number.isFinite(precipitation) ? precipitation : null;
  const rainProb = Number.isFinite(precipitationProbability)
    ? precipitationProbability
    : null;
  const amountScore = rainMm === null ? 1 : clamp(1 - rainMm / 2.5);
  const probabilityScore =
    rainProb === null ? 1 : clamp(1 - (Math.max(0, rainProb - 40) / 60) * 0.4);
  const pr = Math.min(amountScore, probabilityScore);
  details.rain = `Rain ${
    rainMm === null ? 'n/a' : `${rainMm.toFixed(1).replace(/\.0$/, '')}mm`
  }, ${rainProb === null ? 'n/a' : `${Math.round(rainProb)}%`} \u2192 P_r ${pr.toFixed(
    2,
  )}`;

  const pi = clamp(
    Math.pow(pw, 0.38) *
      Math.pow(pg, 0.17) *
      Math.pow(pWave, 0.28) *
      Math.pow(pt, 0.07) *
      Math.pow(pr, 0.04) *
      Math.pow(pl, 0.06),
  );

  let stars = 0;
  if (pi >= 0.8) stars = 5;
  else if (pi >= 0.65) stars = 4;
  else if (pi >= 0.5) stars = 3;
  else if (pi >= 0.35) stars = 2;

  return {
    pi,
    stars,
    gustFactor,
    scores: { pw, pg, pWave, pt, pr, pl },
    details,
  };
}

function buildHeaderCell(time, isDaylightNow) {
  const cell = document.createElement('th');
  cell.className = 'data-cell';
  if (!isDaylightNow) {
    cell.classList.add('night-col');
  }
  cell.style.background = dayStripeColor(time);
  const wrapper = document.createElement('div');
  wrapper.className = 'cell-stack';
  const day = document.createElement('span');
  day.className = 'cell-line';
  day.textContent = formatHeaderDay.format(time);
  const date = document.createElement('span');
  date.className = 'cell-line';
  date.textContent = formatHeaderDate.format(time);
  wrapper.append(day, date);
  cell.appendChild(wrapper);
  return cell;
}

function buildTimeCell(time) {
  const hour = `${formatHeaderHour.format(time)}h`;
  return buildDataCell(hour, '', timeGradient(time));
}

function forecastWindowMidpoint(start, windowHours) {
  return new Date(start.getTime() + (windowHours * 60 * 60 * 1000) / 2);
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

function setLabelCellText(cell, fullLabel, abbrev = fullLabel) {
  cell.dataset.fullLabel = fullLabel;
  cell.dataset.abbrev = abbrev;
  const full = document.createElement('span');
  full.className = 'label-text label-full';
  full.textContent = fullLabel;
  const short = document.createElement('span');
  short.className = 'label-text label-abbrev';
  short.textContent = abbrev;
  cell.replaceChildren(full, short);
}

function decorateForecastCell(cell, column) {
  if (!cell || !column) return cell;
  if (!column.isDaylight) cell.classList.add('night-col');
  if (column.isDayStart) cell.classList.add('day-start');
  return cell;
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

function piHeadline(pi) {
  if (!Number.isFinite(pi)) return 'No data';
  if (pi >= 0.8) return 'Excellent paddle conditions';
  if (pi >= 0.65) return 'Good paddle conditions';
  if (pi >= 0.5) return 'Usable with care';
  if (pi >= 0.35) return 'Marginal paddle conditions';
  return 'Poor paddle conditions';
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

function gustQuality(gustFactor) {
  if (!Number.isFinite(gustFactor)) {
    return { label: 'n/a', shortLabel: 'n/a', kind: 'poor' };
  }
  if (gustFactor <= 1.3) {
    return { label: 'Steady', shortLabel: 'Steady', kind: 'excellent' };
  }
  if (gustFactor <= 1.55) {
    return { label: 'Gusty', shortLabel: 'Gusty', kind: 'marginal' };
  }
  return { label: 'Very gusty', shortLabel: 'Very', kind: 'very-poor' };
}

function directionSummary(score) {
  if (!Number.isFinite(score)) return 'n/a';
  if (score >= 0.9) return 'aligned';
  if (score >= 0.7) return 'cross';
  return 'off';
}

function scoreBand(value) {
  if (!Number.isFinite(value)) return 'poor';
  if (value >= 0.8) return 'excellent';
  if (value >= 0.6) return 'good';
  if (value >= 0.4) return 'marginal';
  if (value >= 0.2) return 'poor';
  return 'very-poor';
}

function kiteVerdictFromScore(score) {
  if (!Number.isFinite(score)) return 'UNKNOWN';
  if (score >= 0.6) return 'GOOD';
  if (score >= 0.4) return 'MARGINAL';
  return 'POOR';
}

function tideTrendAt(tideEvents, time) {
  const events = tideEvents
    .filter((event) => event.date)
    .sort((a, b) => a.date - b.date);
  const nextIndex = events.findIndex((event) => event.date >= time);
  if (nextIndex <= 0) return null;
  const prev = events[nextIndex - 1];
  const next = events[nextIndex];
  const h1 = parseHeightNumber(prev.height);
  const h2 = parseHeightNumber(next.height);
  if (h1 === null || h2 === null) return null;
  return h2 > h1 ? 'rising' : 'falling';
}

function tideUsability(score, tideLevel, tideRange, tideEvents, time) {
  const value = score?.scores?.st;
  const trend = tideTrendAt(tideEvents, time);
  const band = tideLabel(tideLevel, tideRange) || 'Tide n/a';
  const highTiming = score?.tideTiming;
  let label = 'Constrained';
  let kind = 'poor';
  if (Number.isFinite(value)) {
    if (value >= 0.72) {
      label = 'Good';
      kind = 'good';
    } else if (value >= 0.48) {
      label = 'Fair';
      kind = 'marginal';
    }
  }
  const highDetail = highTiming
    ? highTiming.hoursFromHigh <= HIGH_TIDE_OPTIMUM_HOURS
      ? 'near high'
      : `${highTiming.hoursFromHigh.toFixed(1)}h from high`
    : null;
  const detail = [highDetail || trend, band].filter(Boolean).join(' & ');
  return { label, detail: detail || 'n/a', kind };
}

function sameLocalDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatSessionRange(start, end) {
  const startText = `${formatSessionDate.format(start)}: ${formatWindowTime.format(
    start,
  )}`;
  const endText = sameLocalDate(start, end)
    ? formatWindowTime.format(end)
    : `${formatSessionDate.format(end)} ${formatWindowTime.format(end)}`;
  return `${startText}-${endText}`;
}

function bestWindowsForScores(columns, scores, scoreKey, threshold, windowSize) {
  const groups = [];
  let current = null;

  columns.forEach((column, index) => {
    const value = scores[index]?.[scoreKey];
    const qualifies =
      column.isDaylight && Number.isFinite(value) && value >= threshold;
    if (!qualifies) {
      if (current) groups.push(current);
      current = null;
      return;
    }

    const isContinuous =
      current &&
      sameLocalDate(current.start, column.time) &&
      column.index - current.lastIndex === windowSize;
    if (!isContinuous) {
      if (current) groups.push(current);
      current = {
        start: column.time,
        end: column.time,
        lastIndex: column.index,
        values: [],
      };
    }
    current.end = column.time;
    current.lastIndex = column.index;
    current.values.push(value);
  });
  if (current) groups.push(current);

  return groups
    .map((group) => ({
      ...group,
      end: new Date(group.end.getTime() + windowSize * 60 * 60 * 1000),
      avg:
        group.values.reduce((sum, value) => sum + value, 0) /
        Math.max(1, group.values.length),
    }))
    .sort((a, b) => b.avg - a.avg || a.start - b.start)
    .slice(0, 2)
    .sort((a, b) => a.start - b.start);
}

function summarizeSessionWindows(columns, kiteScores, paddleScores, windowSize) {
  const kiWindows = bestWindowsForScores(
    columns,
    kiteScores,
    'ki',
    0.6,
    windowSize,
  );
  const piWindows = bestWindowsForScores(
    columns,
    paddleScores,
    'pi',
    0.65,
    windowSize,
  );

  const kiText = kiWindows.length
    ? `KI ${kiWindows.map((item) => formatSessionRange(item.start, item.end)).join('; ')}`
    : 'KI no clean window';
  const piText = piWindows.length
    ? `PI ${piWindows.map((item) => formatSessionRange(item.start, item.end)).join('; ')}`
    : 'PI no clean window';
  return `${kiText}\n${piText}`;
}

function mainIssueForColumn({
  score,
  wind,
  gustFactor,
  waveHeight,
  wavePeriod,
  rainMm,
  rainProb,
  isDaylightNow,
}) {
  const issues = [];
  if (!isDaylightNow) issues.push('dark');
  if (Number.isFinite(wind) && wind < 8) issues.push('too light');
  if (Number.isFinite(gustFactor) && gustFactor >= 1.6)
    issues.push('very gusty wind');
  else if (Number.isFinite(gustFactor) && gustFactor >= 1.45)
    issues.push('gusty wind');
  if (score?.directionSafety?.kind === 'very-poor')
    issues.push('offshore direction');
  else if (score?.directionSafety?.kind === 'poor')
    issues.push('cross-off direction');
  if (Number.isFinite(score?.scores?.st) && score.scores.st < 0.45)
    issues.push('tide constrained');
  if (Number.isFinite(waveHeight) && waveHeight >= 2)
    issues.push(
      Number.isFinite(wavePeriod) && wavePeriod < 7
        ? 'choppy waves'
        : 'large waves',
    );
  if (
    (Number.isFinite(rainMm) && rainMm >= 1) ||
    (Number.isFinite(rainProb) && rainProb >= 75)
  )
    issues.push('patchy rain');

  return issues.length ? issues.slice(0, 2).join(' / ') : 'none obvious';
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
  const tideDetailText = score.details?.tide || tideText;
  const daylightText = extras.isDaylightNow ? 'daytime' : 'night';
  const waveReason = formatWaveReason(score.details?.waves);
  const directionSafetyText = score.directionSafety?.detail || directionSummary(sd);

  const swClass = classifyScore(sw);
  const sgClass = classifyScore(sg);
  const sdClass = classifyScore(sd);
  const stClass = classifyScore(st);
  const slClass = classifyScore(sl);
  const waveClass = waveSummaryLabel(wave);

  const headline = kiHeadline(score.ki);
  const waveValue = Number.isFinite(wave) ? wave.toFixed(2) : '0.00';
  const waveSigned =
    Number.isFinite(wave) && wave > 0 ? `+${waveValue}` : waveValue;

  const kiPercent = Math.round(score.ki * 100);
  return (
    `Kiting Index: ${kiPercent}%  ${starText(score.stars)}\n` +
    `${headline}\n\n` +
    `Main factors:\n` +
    `• ${waveClass.icon} Waves: ${waveSigned} (${waveReason})\n` +
    `• ${sgClass.icon} Gusts: ${Number.isFinite(sg) ? sg.toFixed(2) : '—'} (${gustSummary(
      score.gustFactor,
    )})\n` +
    `• ${sdClass.icon} Direction: ${Number.isFinite(sd) ? sd.toFixed(2) : '—'} (${directionSafetyText})\n\n` +
    `Score breakdown:\n` +
    `Wind speed: ${Number.isFinite(sw) ? sw.toFixed(2) : '—'} ${
      swClass.label
    } (${windSpeedText})\n` +
    `Gust steadiness: ${Number.isFinite(sg) ? sg.toFixed(2) : '—'} ${
      sgClass.label
    } (${gustFactorText})\n` +
    `Wind direction: ${Number.isFinite(sd) ? sd.toFixed(2) : '—'} ${
      sdClass.label
    } (${directionSafetyText}, ${directionText})\n` +
    `Tide suitability: ${Number.isFinite(st) ? st.toFixed(2) : '—'} ${
      stClass.label
    } (${tideDetailText})\n` +
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

function formatPiTooltip(score, extras = {}) {
  const pw = score.scores?.pw;
  const pg = score.scores?.pg;
  const pWave = score.scores?.pWave;
  const pt = score.scores?.pt;
  const pr = score.scores?.pr;
  const pl = score.scores?.pl;

  const windSpeedText = Number.isFinite(extras.windSpeed)
    ? `${Math.round(extras.windSpeed)} kt`
    : 'n/a';
  const gustFactorText = Number.isFinite(score.gustFactor)
    ? score.gustFactor.toFixed(2)
    : 'n/a';
  const waveText = Number.isFinite(extras.waveHeight)
    ? `${extras.waveHeight.toFixed(1)}m${
        Number.isFinite(extras.wavePeriod)
          ? ` / ${extras.wavePeriod.toFixed(1)}s`
          : ''
      }`
    : 'n/a';
  const tideText =
    Number.isFinite(extras.tideHeight) &&
    Number.isFinite(extras.tideMin) &&
    Number.isFinite(extras.tideMax)
      ? `${extras.tideHeight.toFixed(2)}m (${extras.tideMin.toFixed(
          2,
        )}-${extras.tideMax.toFixed(2)}m)`
      : 'n/a';
  const rainText =
    Number.isFinite(extras.precipitation) ||
    Number.isFinite(extras.precipitationProbability)
      ? `${
          Number.isFinite(extras.precipitation)
            ? `${extras.precipitation.toFixed(1).replace(/\.0$/, '')}mm`
            : 'n/a'
        }, ${
          Number.isFinite(extras.precipitationProbability)
            ? `${Math.round(extras.precipitationProbability)}%`
            : 'n/a'
        }`
      : 'n/a';
  const daylightText = extras.isDaylightNow ? 'daytime' : 'night';

  const windClass = classifyScore(pw);
  const gustClass = classifyScore(pg);
  const waveClass = classifyScore(pWave);
  const tideClass = classifyScore(pt);
  const rainClass = classifyScore(pr);
  const daylightClass = classifyScore(pl);
  const piPercent = Math.round(score.pi * 100);

  return (
    `Paddleboarding Index: ${piPercent}%  ${starText(score.stars)}\n` +
    `${piHeadline(score.pi)}\n\n` +
    `Main factors:\n` +
    `• ${waveClass.icon} Waves: ${Number.isFinite(pWave) ? pWave.toFixed(2) : '—'} (${waveText})\n` +
    `• ${windClass.icon} Wind: ${Number.isFinite(pw) ? pw.toFixed(2) : '—'} (${windSpeedText})\n` +
    `• ${gustClass.icon} Gusts: ${Number.isFinite(pg) ? pg.toFixed(2) : '—'} (${gustSummary(
      score.gustFactor,
    )})\n\n` +
    `Score breakdown:\n` +
    `Calm wind: ${Number.isFinite(pw) ? pw.toFixed(2) : '—'} ${
      windClass.label
    } (${windSpeedText})\n` +
    `Gust steadiness: ${Number.isFinite(pg) ? pg.toFixed(2) : '—'} ${
      gustClass.label
    } (${gustFactorText})\n` +
    `Flat water: ${Number.isFinite(pWave) ? pWave.toFixed(2) : '—'} ${
      waveClass.label
    } (${waveText})\n` +
    `Tide suitability: ${Number.isFinite(pt) ? pt.toFixed(2) : '—'} ${
      tideClass.label
    } (${tideText})\n` +
    `Rain comfort: ${Number.isFinite(pr) ? pr.toFixed(2) : '—'} ${
      rainClass.label
    } (${rainText})\n` +
    `Daylight: ${Number.isFinite(pl) ? pl.toFixed(2) : '—'} ${
      daylightClass.label
    } (${daylightText})\n\n` +
    `Formula:\n` +
    `PI = clamp(\n` +
    `  P_w^0.38 × P_g^0.17 × P_wave^0.28 × P_t^0.07 × P_r^0.04 × P_l^0.06\n` +
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
  const arrow = createWindArrow();
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
  const arrow = createWindArrow();
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
    .reduce(
      (latest, event) => (latest && latest > event.date ? latest : event.date),
      null,
    );
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

    // Labels removed for a cleaner tide curve.
  });
}

function renderTideSegment(svg, tideEvents, windowStart, windowEnd, scale) {
  svg.innerHTML = '';
  const width = 60;
  const height = 40;
  const padding = 4;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  if (!tideEvents.length) return;
  const minHeight = scale?.min ?? 0;
  const maxHeight = scale?.max ?? 1;
  const scaleY = (value) => {
    const ratio = (value - minHeight) / (maxHeight - minHeight || 1);
    return height - padding - ratio * (height - padding * 2);
  };
  const scaleX = (date) =>
    padding +
    ((date - windowStart) / (windowEnd - windowStart || 1)) *
      (width - padding * 2);

  const points = [];
  const segmentMinutes = (windowEnd - windowStart) / (60 * 1000);
  const step = 15;
  for (let m = 0; m <= segmentMinutes; m += step) {
    const time = new Date(windowStart.getTime() + m * 60 * 1000);
    const level = tideLevelAt(tideEvents, time);
    if (!level) continue;
    points.push({ x: scaleX(time), y: scaleY(level.height) });
  }
  if (points.length < 2) return;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#2c6bbf');
  path.setAttribute('stroke-width', '2');
  svg.appendChild(path);
}

function renderForecast(data, tideEvents) {
  ui.forecastHeadRow.innerHTML = '';
  ui.forecastBody.innerHTML = '';
  const dateLabel = document.createElement('th');
  dateLabel.className = 'label-cell';
  setLabelCellText(dateLabel, 'Date', 'Date');
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
    const daylight = isDaylight(time, config.latitude, config.longitude);
    const previous = columns[columns.length - 1];
    const isDayStart =
      !previous || previous.time.toDateString() !== time.toDateString();
    const column = { time, index: i, isDaylight: daylight, isDayStart };
    columns.push(column);
    const headerCell = buildHeaderCell(time, daylight);
    if (isDayStart) headerCell.classList.add('day-start');
    ui.forecastHeadRow.appendChild(headerCell);
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
    { label: 'Rideability', abbrev: 'Ride', key: 'section_rideability', section: true },
    { label: 'KI / score', abbrev: 'KI', key: 'ki' },
    { label: 'PI / paddle', abbrev: 'PI', key: 'pi' },
    { label: 'Daylight', abbrev: 'Light', key: 'daylight' },
    { label: 'Wind', abbrev: 'Wind', key: 'section_wind', section: true },
    { label: 'Wind (kt)', abbrev: 'Speed', key: 'wind_speed' },
    { label: 'Gusts (kt)', abbrev: 'Gusts', key: 'wind_gusts' },
    { label: 'Gust quality', abbrev: 'Gust Q', key: 'gust_quality' },
    { label: 'Gust factor', abbrev: 'GF', key: 'gust_factor' },
    { label: 'Direction safety', abbrev: 'Safety', key: 'direction_safety' },
    { label: 'Direction', abbrev: 'Dir', key: 'wind_direction_10m' },
    { label: 'Water', abbrev: 'Water', key: 'section_water', section: true },
    { label: 'Tide usability', abbrev: 'Tide', key: 'tide' },
    { label: 'Tide curve', abbrev: 'Curve', key: 'tide_curve' },
    { label: 'Waves (m)', abbrev: 'Wave', key: 'wave' },
    { label: 'Weather', abbrev: 'Weather', key: 'section_weather', section: true },
    { label: 'Temp (°C)', abbrev: 'Temp', key: 'temperature_2m' },
    { label: 'Rain (mm)', abbrev: 'Rain', key: 'precipitation' },
    { label: 'Sky', abbrev: 'Sky', key: 'sky' },
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
    const tideScoreTime = forecastWindowMidpoint(column.time, windowSize);
    const tideLevel = tideLevelAt(tideSeries, tideScoreTime);
    return kiteIndex({
      windSpeed,
      gustSpeed,
      windDirDegrees: degrees,
      shoreNormalDeg: config.shoreNormalDeg,
      tideLevel,
      tideRange,
      tideEvents: tideSeries,
      tideTime: tideScoreTime,
      tideMode: config.kiteTideMode,
      isDaylightNow: isDaylight(column.time, config.latitude, config.longitude),
      waveHeight,
      wavePeriod,
    });
  });

  const paddleScores = columns.map((column) => {
    const windSpeed = data.hourly.wind_speed_10m[column.index];
    const gustSpeed = data.hourly.wind_gusts_10m[column.index];
    const waveHeight = data.hourly.wave_height?.[column.index];
    const wavePeriod = data.hourly.wave_period?.[column.index];
    const precipitation = data.hourly.precipitation?.[column.index];
    const precipitationProbability =
      data.hourly.precipitation_probability?.[column.index];
    const tideLevel = tideLevelAt(tideSeries, column.time);
    return paddleboardingIndex({
      windSpeed,
      gustSpeed,
      tideLevel,
      tideRange,
      isDaylightNow: isDaylight(column.time, config.latitude, config.longitude),
      waveHeight,
      wavePeriod,
      precipitation,
      precipitationProbability,
    });
  });

  const sessionSummary = summarizeSessionWindows(
    columns,
    columnScores,
    paddleScores,
    windowSize,
  );

  // No demo data; show real scores only.

  const headerCells = Array.from(
    ui.forecastHeadRow.querySelectorAll('th.data-cell'),
  );
  headerCells.forEach((cell, index) => {
    if (columnScores[index]) {
      const score = columnScores[index];
      const windSpeed = data.hourly.wind_speed_10m[columns[index].index];
      const degrees = data.hourly.wind_direction_10m[columns[index].index];
      const tideLevel = tideLevelAt(
        tideSeries,
        forecastWindowMidpoint(columns[index].time, windowSize),
      );
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
    if (row.section) {
      tr.className = 'forecast-section-row';
    }
    const label = document.createElement('th');
    label.className = 'label-cell';
    setLabelCellText(label, row.label, row.abbrev || row.label);
    if (row.key === 'precipitation') {
      label.title = 'Precipitation probability (%) and amount';
    }
    if (row.key === 'sky') {
      label.title = 'Cloud cover (%)';
    }
    if (row.key === 'moon') {
      label.title = 'Moon illumination (%)';
    }
    if (row.key === 'wind_speed') {
      label.title = 'Wind speed (kt)';
    }
    if (row.key === 'wind_gusts') {
      label.title = 'Wind gusts (kt)';
    }
    if (row.key === 'gust_factor') {
      label.title = 'Gust factor (gust / wind)';
    }
    if (row.key === 'gust_quality') {
      label.title = 'Steady / gusty language from gust factor';
    }
    if (row.key === 'direction_safety') {
      label.title = 'Beach-relative wind direction safety';
    }
    if (row.key === 'daylight') {
      label.title = 'Daylight usable window';
    }
    if (row.key === 'ki') {
      label.title = 'Kiteability Index (0-100%)';
    }
    if (row.key === 'pi') {
      label.title = 'Paddleboarding Index (0-100%)';
    }
    if (row.key === 'tide_curve') {
      label.title = 'Dark region indicates predicted tides';
    }
    if (row.key === 'wave') {
      label.title = 'Wave height (m) with period (s)';
    }
    tr.appendChild(label);

    if (row.section) {
      columns.forEach((column) => {
        const cell = document.createElement('td');
        cell.className = 'data-cell section-fill';
        decorateForecastCell(cell, column);
        tr.appendChild(cell);
      });
      ui.forecastBody.appendChild(tr);
      return;
    }

    if (row.key === 'tide_curve') {
      const scale = tideHeights.length
        ? {
            min: Math.min(...tideHeights) - 0.5,
            max: Math.max(...tideHeights) + 0.5,
          }
        : { min: 0, max: 1 };
      columns.forEach((column) => {
        const cell = document.createElement('td');
        cell.className = 'data-cell tide-curve-cell';
        decorateForecastCell(cell, column);
        const svg = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'svg',
        );
        svg.setAttribute('class', 'tide-row-svg');
        const windowStart = column.time;
        const windowEnd = new Date(
          windowStart.getTime() + windowSize * 60 * 60 * 1000,
        );
        renderTideSegment(svg, tideSeries, windowStart, windowEnd, scale);
        cell.appendChild(svg);
        tr.appendChild(cell);
      });
      ui.forecastBody.appendChild(tr);
      return;
    }

    columns.forEach((column, colIndex) => {
      if (row.key === 'wind_speed') {
        const speed = data.hourly.wind_speed_10m[column.index];
        const score = columnScores[colIndex];
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
        const cell = buildDataCell(`${Math.round(speed)}`, '', windColor);
        cell.classList.add('wind-power-cell');
        decorateForecastCell(cell, column);
        if (score.details?.wind) {
          cell.title = score.details.wind;
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'wind_gusts') {
        const gusts = data.hourly.wind_gusts_10m[column.index];
        const score = columnScores[colIndex];
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
        const cell = buildDataCell(`${Math.round(gusts)}`, '', gustColor);
        decorateForecastCell(cell, column);
        if (score.details?.gust) {
          cell.title = score.details.gust;
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'gust_quality') {
        const speed = data.hourly.wind_speed_10m[column.index];
        const gusts = data.hourly.wind_gusts_10m[column.index];
        const gustFactor = speed ? gusts / speed : null;
        const quality = gustQuality(gustFactor);
        const cell = buildDataCell(
          quality.shortLabel,
          Number.isFinite(gustFactor) ? gustFactor.toFixed(1) : '',
          qualityBackground(quality.kind),
        );
        cell.classList.add('quality-cell', `quality-${quality.kind}`);
        decorateForecastCell(cell, column);
        cell.title = Number.isFinite(gustFactor)
          ? `Gust quality ${quality.label} (factor ${gustFactor.toFixed(2)})`
          : 'Gust quality n/a';
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'gust_factor') {
        const speed = data.hourly.wind_speed_10m[column.index];
        const gusts = data.hourly.wind_gusts_10m[column.index];
        const gustFactor = speed ? gusts / speed : null;
        const score = columnScores[colIndex];
        const gfText = Number.isFinite(gustFactor)
          ? gustFactor.toFixed(1)
          : '—';
        const cell = buildDataCell(gfText, '', 'rgba(8, 18, 28, 0.5)');
        decorateForecastCell(cell, column);
        if (score.details?.gust) {
          cell.title = score.details.gust;
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'wind_direction_10m') {
        const degrees = data.hourly.wind_direction_10m[column.index];
        const direction = windCompass(degrees);
        const score = columnScores[colIndex];
        const cell = buildDirectionCell(direction, degrees);
        cell.style.background = 'rgba(8, 18, 28, 0.5)';
        decorateForecastCell(cell, column);
        if (score.details?.direction) {
          cell.title = score.details.direction;
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'direction_safety') {
        const score = columnScores[colIndex];
        const safety = score.directionSafety;
        const cell = buildDataCell(
          safety?.shortLabel || '—',
          safety?.kind === 'very-poor' ? 'avoid' : '',
          qualityBackground(safety?.kind),
        );
        cell.classList.add('direction-safety-cell', `quality-${safety?.kind || 'poor'}`);
        decorateForecastCell(cell, column);
        cell.title = score.details?.direction || safety?.detail || '';
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
        cell.classList.add('wave-cell');
        decorateForecastCell(cell, column);
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
        const tideScoreTime = forecastWindowMidpoint(column.time, windowSize);
        const tideLevel = tideLevelAt(tideSeries, tideScoreTime);
        const usability = tideUsability(
          score,
          tideLevel,
          tideRange,
          tideSeries,
          tideScoreTime,
        );
        const cell = buildDataCell(usability.label, tideText);
        cell.classList.add('tide-cell');
        cell.style.background = qualityBackground(usability.kind);
        decorateForecastCell(cell, column);
        if (score.details?.tide) {
          cell.title = `${score.details.tide}; ${usability.detail}`;
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'temperature_2m') {
        const temp = data.hourly.temperature_2m[column.index];
        const cell = buildDataCell(
          `${Math.round(temp)}°C`,
          '',
          colorForValue(temp, [
            { value: -2, color: '#1b2b44' },
            { value: 4, color: '#225c8a' },
            { value: 10, color: '#1f8a70' },
            { value: 16, color: '#f6aa1c' },
            { value: 22, color: '#f2545b' },
          ]),
        );
        cell.classList.add('temperature-cell');
        decorateForecastCell(cell, column);
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
        cell.classList.add('precipitation-cell');
        decorateForecastCell(cell, column);
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
        decorateForecastCell(cell, column);
        const main = cell.querySelector('.cell-main');
        if (main) {
          main.textContent = '';
          main.appendChild(createMeteoconsIcon(icon));
          main.style.color = cloud < 20 ? '#ffd54a' : 'var(--ink)';
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'moon') {
        const { illumination, isWaxing } = lunarPhaseInfo(column.time);
        const cell = buildDataCell(
          '',
          `${Math.round(illumination * 100)}%`,
          dayStripeColor(column.time),
        );
        cell.classList.add('moon-cell');
        decorateForecastCell(cell, column);
        const main = cell.querySelector('.cell-main');
        if (main) {
          main.textContent = '';
          main.appendChild(createMoonPhaseIcon(illumination, isWaxing));
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'time') {
        const cell = buildTimeCell(column.time);
        decorateForecastCell(cell, column);
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'daylight') {
        const cell = buildDataCell(
          column.isDaylight ? 'Day' : 'Night',
          '',
          column.isDaylight
            ? 'rgba(53, 113, 60, 0.48)'
            : 'rgba(8, 18, 28, 0.7)',
        );
        cell.classList.add('daylight-cell');
        decorateForecastCell(cell, column);
        cell.title = column.isDaylight ? 'Daylight window' : 'Night';
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'ki') {
        const { ki, stars } = columnScores[colIndex];
        const kiPercent = Math.round(ki * 100);
        const cell = buildDataCell(
          `${kiPercent}%`,
          '',
          colorForValue(ki, [
            { value: 0, color: '#0a1828' },
            { value: 0.35, color: '#1e4e9c' },
            { value: 0.5, color: '#2f7d32' },
            { value: 0.65, color: '#4caf50' },
            { value: 0.8, color: '#7ed957' },
          ]),
        );
        cell.classList.add('ki-cell', `band-${scoreBand(ki)}`);
        decorateForecastCell(cell, column);
        const score = columnScores[colIndex];
        const tideLevel = tideLevelAt(
          tideSeries,
          forecastWindowMidpoint(column.time, windowSize),
        );
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
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'pi') {
        const score = paddleScores[colIndex];
        const piPercent = Math.round(score.pi * 100);
        const cell = buildDataCell(
          `${piPercent}%`,
          '',
          colorForValue(score.pi, [
            { value: 0, color: '#0a1828' },
            { value: 0.35, color: '#1e4e9c' },
            { value: 0.5, color: '#20736b' },
            { value: 0.65, color: '#3c9860' },
            { value: 0.8, color: '#7ed957' },
          ]),
        );
        cell.classList.add('pi-cell', `band-${scoreBand(score.pi)}`);
        decorateForecastCell(cell, column);
        const tideLevel = tideLevelAt(tideSeries, column.time);
        cell.title = formatPiTooltip(score, {
          windSpeed: data.hourly.wind_speed_10m[column.index],
          waveHeight: data.hourly.wave_height?.[column.index],
          wavePeriod: data.hourly.wave_period?.[column.index],
          precipitation: data.hourly.precipitation?.[column.index],
          precipitationProbability:
            data.hourly.precipitation_probability?.[column.index],
          tideHeight: tideLevel?.height ?? null,
          tideMin: tideRange?.min ?? null,
          tideMax: tideRange?.max ?? null,
          isDaylightNow: isDaylight(
            column.time,
            config.latitude,
            config.longitude,
          ),
        });
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

  if (columns.length) {
    const now = new Date();
    const nowIndex = columns.findIndex((column) => column.time >= now);
    const columnIndex = nowIndex >= 0 ? nowIndex : 0;
    const score = columnScores[columnIndex];
    renderSummary(
      data,
      tideSeries,
      columns[columnIndex],
      score,
      tideRange,
      paddleScores[columnIndex],
      sessionSummary,
    );
  }

  // Sticky label width is handled via the 'forecast-scrolled' root class.
}

function saveCache(weather, tides, weatherUpdatedAt, tidesUpdatedAt) {
  localStorage.setItem(cacheKey('weather'), JSON.stringify(weather));
  localStorage.setItem(cacheKey('tides'), JSON.stringify(tides));
  if (weatherUpdatedAt)
    localStorage.setItem(
      cacheKey('weatherUpdatedAt'),
      String(weatherUpdatedAt),
    );
  if (tidesUpdatedAt)
    localStorage.setItem(cacheKey('tidesUpdatedAt'), String(tidesUpdatedAt));
}

function alignHourlySeries(targetTimes, sourceTimes, sourceValues) {
  if (!Array.isArray(targetTimes) || !Array.isArray(sourceTimes)) {
    return [];
  }
  const lookup = new Map();
  sourceTimes.forEach((time, index) => {
    lookup.set(time, sourceValues?.[index] ?? null);
  });
  return targetTimes.map((time) =>
    lookup.has(time) ? lookup.get(time) : null,
  );
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
  localStorage.setItem(cacheKey('waves'), JSON.stringify(waves));
  if (updatedAt)
    localStorage.setItem(cacheKey('wavesUpdatedAt'), String(updatedAt));
}

function loadCache() {
  const weatherRaw = localStorage.getItem(cacheKey('weather'));
  const tidesRaw = localStorage.getItem(cacheKey('tides'));
  const wavesRaw = localStorage.getItem(cacheKey('waves'));
  const weatherUpdatedAt = localStorage.getItem(cacheKey('weatherUpdatedAt'));
  const tidesUpdatedAt = localStorage.getItem(cacheKey('tidesUpdatedAt'));
  const wavesUpdatedAt = localStorage.getItem(cacheKey('wavesUpdatedAt'));
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
      updated: weatherUpdatedAt ? Date.parse(weatherUpdatedAt) : null,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

function resetForecastView() {
  if (ui.forecastHeadRow) {
    ui.forecastHeadRow.innerHTML = '';
    const dateLabel = document.createElement('th');
    dateLabel.className = 'label-cell';
    dateLabel.dataset.fullLabel = 'Date';
    dateLabel.dataset.abbrev = 'Date';
    dateLabel.textContent = 'Date';
    ui.forecastHeadRow.appendChild(dateLabel);
  }

  if (ui.forecastBody) {
    ui.forecastBody.innerHTML = '';
  }

  if (ui.summaryBand) {
    ui.summaryBand.dataset.verdict = '';
    ui.summaryBand.title = '';
  }

  if (ui.summaryOverall) {
    ui.summaryOverall.textContent = 'Loading...';
  }
  if (ui.summaryKiScore) ui.summaryKiScore.textContent = '—';
  if (ui.summaryPiScore) ui.summaryPiScore.textContent = 'PI —';
  if (ui.summaryDaylight) ui.summaryDaylight.textContent = '—';
  if (ui.summaryGustQuality) ui.summaryGustQuality.textContent = '—';
  if (ui.summaryGustFactor) ui.summaryGustFactor.textContent = '—';
  if (ui.summaryDirectionSafety) ui.summaryDirectionSafety.textContent = '—';
  if (ui.summaryDirectionDetail) ui.summaryDirectionDetail.textContent = '—';
  if (ui.summaryTideUsability) ui.summaryTideUsability.textContent = '—';
  if (ui.summaryBestWindows) ui.summaryBestWindows.textContent = '—';
  if (ui.summaryMainIssue) ui.summaryMainIssue.textContent = '—';

  if (ui.summaryChips) {
    ui.summaryChips.innerHTML = '';
    ui.summaryChips.style.display = 'none';
  }

  clearTideStatus();
  setSummaryUpdated(null, null);
}

function isCacheFresh(cached) {
  return (
    cached &&
    Number.isFinite(cached.updated) &&
    Date.now() - cached.updated < CACHE_STALE_MS
  );
}

function renderFromCache() {
  const locationKey = config.activeLocation;
  const cached = loadCache();
  if (!cached) {
    return false;
  }

  const mergedWeather = mergeWaveData(cached.weather, cached.waves);
  renderForecast(mergedWeather, cached.tides);
  setTideStatus('');
  setSummaryUpdated(cached.weatherUpdatedAt, cached.tidesUpdatedAt);

  if (!cached.tides || !cached.tides.length) {
    loadTides({ force: false })
      .then((res) => {
        if (locationKey !== config.activeLocation) return;
        if (!res?.items || !res.items.length) return;
        renderForecast(mergeWaveData(cached.weather, cached.waves), res.items);
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
        if (locationKey !== config.activeLocation) return;
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

function hydrateForecast(options = {}) {
  if (options.reset) {
    resetForecastView();
  }

  const cacheResult = renderFromCache();
  if (!isCacheFresh(cacheResult)) {
    loadForecast({ force: false });
  }
}

function handleError(error) {
  setSummaryUpdated(null, null);
  console.error(error);
}

async function loadForecast(options = {}) {
  const force = options.force === true;
  const locationKey = config.activeLocation;

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
    if (locationKey !== config.activeLocation) return;
    const mergedWeather = mergeWaveData(data, wavesData);

    renderForecast(mergedWeather, tideItems);
    setTideStatus('');
    setSummaryUpdated(weatherUpdatedAt, tidesUpdatedAt);
    saveCache(data, tideItems, weatherUpdatedAt, tidesUpdatedAt);
    if (wavesData) {
      saveWavesCache(wavesData, wavesUpdatedAt);
    }
  } catch (error) {
    if (locationKey !== config.activeLocation) return;
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

if (ui.toggleNight) {
  ui.toggleNight.addEventListener('change', () => {
    syncNightVisibility();
  });
}

ui.locationOptions.forEach((input) => {
  input.addEventListener('change', (event) => {
    if (!event.target.checked) return;
    const previousLocation = config.activeLocation;
    applyLocation(event.target.value, { persist: true });
    if (config.activeLocation === previousLocation) return;
    hydrateForecast({ reset: true });
  });
});

applyLocation(readLocationPreference());
if (ui.toggleNight) {
  ui.toggleNight.checked = true;
}
syncNightVisibility();
hydrateForecast({ reset: true });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  });
}
