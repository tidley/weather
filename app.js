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
  currentGusts: document.getElementById('current-gusts'),
  currentPrecip: document.getElementById('current-precip'),
  currentCloud: document.getElementById('current-cloud'),
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
  weatherUpdatedAt: 'forecast.weatherUpdatedAt',
  tidesUpdatedAt: 'forecast.tidesUpdatedAt',
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

const forecastScrollContainer = document.querySelector('.forecast-scroll');
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
  return lerpColor('#081420', '#1e4e9c', t);
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
    return '—';
  }
  const hour = time ? time.getHours() : 12;
  const isNight = hour < 6 || hour >= 20;

  if (cloudCover < 20) return isNight ? '🌕' : '☀️';
  if (cloudCover < 50) return isNight ? '🌙' : '⛅';
  if (cloudCover < 80) return isNight ? '☁️🌙' : '🌥️';
  return '☁️';
}

function lunarPhaseInfo(date) {
  const reference = Date.UTC(2000, 0, 6, 18, 14, 0);
  const synodicMonth = 29.53058867;
  const daysSince = (date.getTime() - reference) / 86400000;
  const phase = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
  const fraction = phase / synodicMonth;
  const index = Math.floor(fraction * 8) % 8;
  const icons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
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
  ui.currentWindDir.textContent = `${windCompass(
    current.wind_direction_10m,
  )} wind`;
  ui.currentGusts.textContent = formatValue(current.wind_gusts_10m, ' kt');
  ui.currentPrecip.textContent = formatValue(current.precipitation, ' mm');
  ui.currentCloud.textContent = formatValue(current.cloud_cover, '% cloud');

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
  // Extends HW/LW events to horizonEnd using empirical cadence + height trend.
  // This is not a full harmonic constituent model, but it is stable enough to
  // provide a coherent multi-day curve when the upstream feed is limited.
  const base = tideEvents
    .filter((e) => e.date instanceof Date && !Number.isNaN(e.date.getTime()))
    .map((e) => ({ ...e }))
    .sort((a, b) => a.date - b.date);

  if (base.length < 6) return base;
  if (!(horizonEnd instanceof Date)) return base;
  const last = base[base.length - 1];
  if (last.date >= horizonEnd) return base;

  // Estimate typical interval between consecutive events (HW->LW or LW->HW).
  const deltas = [];
  for (let i = 1; i < base.length; i++) {
    const dt = base[i].date - base[i - 1].date;
    if (dt > 2 * 60 * 60 * 1000 && dt < 10 * 60 * 60 * 1000) deltas.push(dt);
  }
  const step = median(deltas) || 6.21 * 60 * 60 * 1000; // ~6h 12m 36s

  // Fit separate height trends for HW and LW using recent history.
  const recent = base.slice(-24);
  const pointsHW = recent
    .filter((e) => e.type === 'HIGH')
    .map((e) => ({ x: e.date.getTime(), y: parseHeightNumber(e.height) }));
  const pointsLW = recent
    .filter((e) => e.type === 'LOW')
    .map((e) => ({ x: e.date.getTime(), y: parseHeightNumber(e.height) }));
  const fitHW = linearFit(pointsHW);
  const fitLW = linearFit(pointsLW);

  // Fall back to medians if fit is unavailable.
  const hwMedian = median(pointsHW.map((p) => p.y));
  const lwMedian = median(pointsLW.map((p) => p.y));

  // Continue alternating event types.
  let nextType = last.type;
  let nextTime = new Date(last.date.getTime());
  while (nextTime < horizonEnd) {
    nextType = nextType === 'HIGH' ? 'LOW' : 'HIGH';
    nextTime = new Date(nextTime.getTime() + step);

    const tms = nextTime.getTime();
    let predictedHeight = null;
    if (nextType === 'HIGH') {
      predictedHeight = fitHW ? fitHW.slope * tms + fitHW.intercept : hwMedian;
    } else {
      predictedHeight = fitLW ? fitLW.slope * tms + fitLW.intercept : lwMedian;
    }

    const heightText =
      predictedHeight === null || !Number.isFinite(predictedHeight)
        ? null
        : `${Math.max(predictedHeight, 0).toFixed(2)}m`;

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

function kiteIndex({
  windSpeed,
  gustSpeed,
  windDirDegrees,
  tideLevel,
  tideRange,
  isDaylightNow,
}) {
  const reasons = [];

  const windValue = Number.isFinite(windSpeed) ? windSpeed : 0;
  const sw =
    windValue <= 18
      ? clamp((windValue - 12) / (18 - 12))
      : clamp(1 - (windValue - 18) / (25 - 18));
  reasons.push(`Wind ${Math.round(windValue)} kt → S_w ${sw.toFixed(2)}`);

  const gustFactor = windValue ? gustSpeed / windValue : null;
  let sg = 0;
  if (gustFactor !== null) {
    if (gustFactor <= 1.3) sg = 1;
    else if (gustFactor >= 1.6) sg = 0;
    else sg = 1 - (gustFactor - 1.3) / (1.6 - 1.3);
  }
  reasons.push(
    gustFactor !== null
      ? `Gust factor ${gustFactor.toFixed(2)} → S_g ${sg.toFixed(2)}`
      : 'Gust factor n/a',
  );

  let sd = 0.7;
  if (windDirDegrees >= 135 && windDirDegrees <= 225) {
    sd = 1;
  } else if (windDirDegrees >= 100 && windDirDegrees <= 260) {
    sd = 0.7;
  } else {
    sd = 0;
  }
  reasons.push(`Direction → S_d ${sd.toFixed(1)}`);

  let st = 0.5;
  if (tideLevel && tideRange && tideRange.max > tideRange.min) {
    const tNorm = clamp(
      (tideLevel.height - tideRange.min) / (tideRange.max - tideRange.min),
    );
    st = clamp(1 - Math.abs(tNorm - 0.6) / 0.6);
  }
  reasons.push(`Tide → S_t ${st.toFixed(2)}`);

  const sl = isDaylightNow ? 1.0 : 0.1;
  reasons.push(`Daylight → S_l ${sl.toFixed(1)}`);

  const ki =
    Math.pow(sw, 0.35) *
    Math.pow(sg, 0.3) *
    Math.pow(sd, 0.2) *
    Math.pow(st, 0.1) *
    Math.pow(sl, 0.05);

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
  }
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

function buildDirectionCell(direction, degrees) {
  const cell = document.createElement('td');
  cell.className = 'data-cell';
  const wrapper = document.createElement('div');
  wrapper.className = 'wind-cell';
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.style.transform = arrowForDegrees(degrees);
  const dirEl = document.createElement('span');
  dirEl.className = 'cell-main';
  dirEl.textContent = direction;
  wrapper.append(arrow, dirEl);
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
  const svgHeight = 120;
  const padding = 16;
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
    circle.setAttribute('r', '4');
    circle.setAttribute('class', 'tide-marker');
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
      label.setAttribute('y', cy - 10);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'tide-label');
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
    const tideLevel = tideLevelAt(tideSeries, column.time);
    return kiteIndex({
      windSpeed,
      gustSpeed,
      windDirDegrees: degrees,
      tideLevel,
      tideRange,
      isDaylightNow: isDaylight(column.time, config.latitude, config.longitude),
    });
  });

  // No demo data; show real KI only.

  const headerCells = Array.from(
    ui.forecastHeadRow.querySelectorAll('th.data-cell'),
  );
  headerCells.forEach((cell, index) => {
    if (columnScores[index]) {
      applyColumnWash(cell, columnScores[index].stars);
      cell.title = `KI ${columnScores[index].ki.toFixed(2)} · ${'★'.repeat(
        columnScores[index].stars,
      )}\nS_w^0.35 × S_g^0.30 × S_d^0.20 × S_t^0.10 × S_l^0.05\n${columnScores[
        index
      ].reasons.join('\n')}`;
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
      label.title = 'Precipitation probability (%) and amount.';
    }
    if (row.key === 'sky') {
      label.title = 'Cloud cover (%).';
    }
    if (row.key === 'moon') {
      label.title = 'Moon illumination (%).';
    }
    if (row.key === 'wind_power') {
      label.title = `Mean wind → gusts (kt).\nGF = gust / wind.`;
    }
    if (row.key === 'ki') {
      label.title = 'Kiteability Index (0-1) mapped to stars.';
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
          `${Math.round(speed)} → ${Math.round(gusts)}`,
          '',
          `linear-gradient(90deg, ${windColor} 0%, ${midColor} 50%, ${gustColor} 100%)`,
        );
        cell.classList.add('wind-power-cell');
        if (gustFactor) {
          setCellSubText(cell, `${gustFactor.toFixed(2)}`);
          const sub = cell.querySelector('.cell-sub');
          if (sub) {
            sub.classList.add('gf-value');
          }
        }
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'wind_direction_10m') {
        const degrees = data.hourly.wind_direction_10m[column.index];
        const direction = windCompass(degrees);
        const cell = buildDirectionCell(direction, degrees);
        cell.style.background = 'rgba(8, 18, 28, 0.5)';
        applyColumnWash(cell, columnScores[colIndex].stars);
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'tide') {
        const windowStart = column.time;
        const windowEnd = new Date(
          windowStart.getTime() + windowSize * 60 * 60 * 1000,
        );
        const tideText = tideForWindow(tideSeries, windowStart, windowEnd);
        const tideLevel = tideLevelAt(tideSeries, windowStart);
        const heightValue = tideLevel ? tideLevel.height : null;
        const cell = buildDataCell(
          tideText,
          '',
          colorForValue(heightValue, [
            { value: 0, color: '#081420' },
            { value: 2, color: '#0f2538' },
            { value: 4, color: '#163a5a' },
            { value: 6, color: '#2c6bbf' },
          ]),
        );
        applyColumnWash(cell, columnScores[colIndex].stars);
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
        const cell = buildDataCell(
          skyIcon(cloud, column.time),
          `${Math.round(cloud)}%`,
          colorForValue(cloud, [
            { value: 0, color: '#1e4e9c' },
            { value: 30, color: '#163a5a' },
            { value: 60, color: '#0f2538' },
            { value: 80, color: '#081420' },
          ]),
        );
        const main = cell.querySelector('.cell-main');
        if (main) {
          main.style.fontSize = '1.2rem';
          main.style.color = cloud < 20 ? '#ffd54a' : 'var(--ink)';
        }
        applyColumnWash(cell, columnScores[colIndex].stars);
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'moon') {
        const { icon, illumination } = lunarPhaseInfo(column.time);
        const cell = buildDataCell(
          icon,
          `${Math.round(illumination * 100)}%`,
          timeGradient(column.time),
        );
        const main = cell.querySelector('.cell-main');
        if (main) {
          main.style.fontSize = '1.15rem';
        }
        applyColumnWash(cell, columnScores[colIndex].stars);
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'time') {
        const cell = buildTimeCell(column.time);
        applyColumnWash(cell, columnScores[colIndex].stars);
        tr.appendChild(cell);
        return;
      }

      if (row.key === 'ki') {
        const { ki, stars, reasons } = columnScores[colIndex];
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
        cell.title =
          `KI ${ki.toFixed(2)} (${stars}★)\n` +
          'S_w^0.35 × S_g^0.30 × S_d^0.20 × S_t^0.10 × S_l^0.05\n' +
          reasons.join('\n');
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

function loadCache() {
  const weatherRaw = localStorage.getItem(cacheKeys.weather);
  const tidesRaw = localStorage.getItem(cacheKeys.tides);
  const weatherUpdatedAt = localStorage.getItem(cacheKeys.weatherUpdatedAt);
  const tidesUpdatedAt = localStorage.getItem(cacheKeys.tidesUpdatedAt);
  if (!weatherRaw) return null;
  try {
    const weather = JSON.parse(weatherRaw);
    const tides = tidesRaw
      ? JSON.parse(tidesRaw).map((event) => ({
          ...event,
          date: event.date ? new Date(event.date) : null,
        }))
      : [];
    return {
      weather,
      tides,
      weatherUpdatedAt: weatherUpdatedAt || null,
      tidesUpdatedAt: tidesUpdatedAt || null,
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

  renderCurrent(cached.weather);
  renderForecast(cached.weather, cached.tides);
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

  return true;
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
    const [weatherResponse, tideRes] = await Promise.all([
      fetch(buildUrl()),
      loadTides({ force }),
    ]);
    if (!weatherResponse.ok) {
      throw new Error(`Weather proxy error: ${weatherResponse.status}`);
    }
    const weatherUpdatedAt = weatherResponse.headers.get('X-Updated-At');
    const data = await weatherResponse.json();
    const tideItems = tideRes?.items || [];
    const tidesUpdatedAt = tideRes?.updatedAt || null;

    renderCurrent(data);
    renderForecast(data, tideItems);
    setTideStatus('');
    setUpdatedLabel(ui.weatherUpdated, 'Weather updated', weatherUpdatedAt);
    setUpdatedLabel(ui.tidesUpdated, 'Tides updated', tidesUpdatedAt);
    saveCache(data, tideItems, weatherUpdatedAt, tidesUpdatedAt);
  } catch (error) {
    handleError(error);
  }
}

if (ui.refresh) {
  ui.refresh.addEventListener('click', () => {
    loadForecast({ force: true });
  });
}

setLocation();
const hasCache = renderFromCache();
if (!hasCache) {
  loadForecast({ force: false });
}
