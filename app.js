const config = {
  locationName: "St Leonards-on-Sea, UK",
  latitude: 50.849533,
  longitude: 0.537056,
  timezone: "Europe/London",
  windSpeedUnit: "kn",
  forecastWindowHours: 2,
  forecastDays: 7,
  tide: {
    provider: "ukho",
    stationId: "0085",
    sourceUrl: "https://admiraltyapi.portal.azure-api.net/",
    apiUrl: "http://localhost:8787/tides",
  },
};

const ui = {
  locationName: document.getElementById("location-name"),
  lastUpdated: document.getElementById("last-updated"),
  currentSummary: document.getElementById("current-summary"),
  currentTemp: document.getElementById("current-temp"),
  currentWind: document.getElementById("current-wind"),
  currentWindDir: document.getElementById("current-wind-dir"),
  currentGusts: document.getElementById("current-gusts"),
  currentPrecip: document.getElementById("current-precip"),
  currentCloud: document.getElementById("current-cloud"),
  forecastGrid: document.getElementById("forecast-grid"),
  forecastHeadRow: document.getElementById("forecast-head-row"),
  forecastBody: document.getElementById("forecast-body"),
  forecastRange: document.getElementById("forecast-range"),
  tideStatus: document.getElementById("tide-status"),
  tideSource: document.getElementById("tide-source"),
  tideLink: document.getElementById("tide-link"),
  tideSvg: document.getElementById("tide-svg"),
  refresh: document.getElementById("refresh"),
};

const cacheKeys = {
  weather: "forecast.weather",
  tides: "forecast.tides",
  updated: "forecast.updated",
};

const formatWindow = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
});

const formatHeaderDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
});

const formatHeaderDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
});

const formatHeaderHour = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
});

const formatTideTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

function windCompass(degrees) {
  if (degrees === null || degrees === undefined) return "—";
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

function formatValue(value, unit, fallback = "—") {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  return `${Math.round(value)}${unit}`;
}

function arrowForDegrees(degrees) {
  if (degrees === null || degrees === undefined) return "rotate(0deg)";
  return `rotate(${(degrees + 90) % 360}deg)`;
}

function colorForValue(value, stops) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "transparent";
  }
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  let chosen = sorted[0];
  for (const stop of sorted) {
    if (value >= stop.value) chosen = stop;
  }
  return chosen.color;
}

function parseHeightNumber(value) {
  if (!value) return null;
  const number = Number.parseFloat(String(value));
  return Number.isNaN(number) ? null : number;
}

function buildUrl() {
  const params = new URLSearchParams({
    latitude: config.latitude,
    longitude: config.longitude,
    timezone: config.timezone,
    wind_speed_unit: config.windSpeedUnit,
    current: [
      "temperature_2m",
      "precipitation",
      "cloud_cover",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
    ].join(","),
    hourly: [
      "temperature_2m",
      "precipitation_probability",
      "precipitation",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "cloud_cover",
    ].join(","),
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function setLoadingState() {
  if (ui.currentSummary) {
    ui.currentSummary.textContent = "Refreshing";
  }
  ui.lastUpdated.textContent = "Fetching latest data…";
}

function setCachedUpdated(timestamp) {
  if (!timestamp) return;
  ui.lastUpdated.textContent = `Updated ${new Date(timestamp).toLocaleTimeString(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  )} (cached)`;
}

function setTideStatus(message) {
  if (!ui.tideStatus) return;
  ui.tideStatus.textContent = message;
  ui.tideStatus.style.display = "block";
}

function clearTideStatus() {
  if (!ui.tideStatus) return;
  ui.tideStatus.style.display = "none";
}

function renderCurrent(data) {
  const current = data.current;
  ui.currentTemp.textContent = formatValue(current.temperature_2m, "°C");
  ui.currentWind.textContent = formatValue(current.wind_speed_10m, " kt");
  ui.currentWindDir.textContent = `${windCompass(current.wind_direction_10m)} wind`;
  ui.currentGusts.textContent = formatValue(current.wind_gusts_10m, " kt");
  ui.currentPrecip.textContent = formatValue(current.precipitation, " mm");
  ui.currentCloud.textContent = formatValue(current.cloud_cover, "% cloud");

  const wind = Math.round(current.wind_speed_10m);
  const gusts = Math.round(current.wind_gusts_10m);
  const rain = Math.round(current.precipitation || 0);
  if (ui.currentSummary) {
    ui.currentSummary.textContent = `${wind} kt / ${gusts} kt · ${rain} mm`;
  }
}

function formatHeight(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Number(value).toFixed(2)} m`;
}

function normalizeEventType(rawType) {
  if (!rawType) return "TIDE";
  const value = String(rawType).toLowerCase();
  if (value.includes("high")) return "HIGH";
  if (value.includes("low")) return "LOW";
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
        item.EventType || item.eventType || item.Type || item.type
      );
      const height = formatHeight(
        item.Height ||
          item.height ||
          item.HeightInMeters ||
          item.heightInMeters ||
          item.Value
      );
      return {
        type,
        height,
        timeText:
          date && !Number.isNaN(date.getTime())
            ? formatTideTime.format(date)
            : "—",
        date: date && !Number.isNaN(date.getTime()) ? date : null,
      };
    })
    .filter((item) => item.date);
}

async function loadTides() {
  if (config.tide.provider !== "ukho" || !config.tide.apiUrl) {
    setTideStatus("No tide feed configured.");
    if (ui.tideSource) {
      ui.tideSource.textContent = "Manual";
    }
    return [];
  }

  if (ui.tideSource) {
    ui.tideSource.textContent = "UKHO";
  }
  if (config.tide.sourceUrl) {
    ui.tideLink.href = config.tide.sourceUrl;
  }

  const url = new URL(config.tide.apiUrl);
  url.searchParams.set("station", config.tide.stationId);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      let details = "";
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
    return items;
  } catch (error) {
    setTideStatus("Tide feed unavailable.");
    console.error(error);
    return [];
  }
}

function describeTideCoverage(items) {
  if (!items.length) {
    return "No tide events returned.";
  }
  const sorted = [...items].sort((a, b) => a.date - b.date);
  const start = sorted[0].date;
  const end = sorted[sorted.length - 1].date;
  if (!start || !end) {
    return "Tide feed loaded, but dates were missing.";
  }
  const days =
    Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
  return `Tides available for ~${days} days.`;
}

function tideForWindow(tideEvents, windowStart, windowEnd) {
  const within = tideEvents.filter(
    (event) =>
      event.date &&
      event.date >= windowStart &&
      event.date < windowEnd
  );
  if (!within.length) return "—";
  return within
    .slice(0, 2)
    .map((event) => `${event.type[0]} ${event.height}`)
    .join(", ");
}

function buildHeaderCell(time) {
  const cell = document.createElement("th");
  cell.className = "data-cell";
  const wrapper = document.createElement("div");
  wrapper.className = "cell-stack";
  const day = document.createElement("span");
  day.className = "cell-main";
  day.textContent = formatHeaderDay.format(time);
  const hour = document.createElement("span");
  hour.className = "cell-sub";
  hour.textContent = formatHeaderDate.format(time);
  wrapper.append(day, hour);
  cell.appendChild(wrapper);
  return cell;
}

function buildTimeCell(time) {
  const hour = `${formatHeaderHour.format(time)}h`;
  return buildDataCell(hour, "", "rgba(8, 18, 28, 0.55)");
}

function buildDataCell(mainText, subText, background) {
  const cell = document.createElement("td");
  cell.className = "data-cell";
  if (background) {
    cell.style.background = background;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "cell-stack";
  const main = document.createElement("span");
  main.className = "cell-main";
  main.textContent = mainText;
  const sub = document.createElement("span");
  sub.className = "cell-sub";
  sub.textContent = subText || "";
  wrapper.append(main, sub);
  cell.appendChild(wrapper);
  return cell;
}

function buildDirectionCell(direction, degrees) {
  const cell = document.createElement("td");
  cell.className = "data-cell";
  const wrapper = document.createElement("div");
  wrapper.className = "wind-cell";
  const arrow = document.createElement("span");
  arrow.className = "arrow";
  arrow.style.transform = arrowForDegrees(degrees);
  const dirEl = document.createElement("span");
  dirEl.className = "cell-main";
  dirEl.textContent = direction;
  wrapper.append(arrow, dirEl);
  cell.appendChild(wrapper);
  return cell;
}

function buildWindCell(speed, direction, degrees) {
  const cell = document.createElement("td");
  cell.className = "data-cell";
  const wrapper = document.createElement("div");
  wrapper.className = "wind-cell";
  const arrow = document.createElement("span");
  arrow.className = "arrow";
  arrow.style.transform = arrowForDegrees(degrees);
  const speedEl = document.createElement("span");
  speedEl.className = "cell-main";
  speedEl.textContent = formatValue(speed, " kt");
  const dirEl = document.createElement("span");
  dirEl.className = "cell-sub";
  dirEl.textContent = direction;
  wrapper.append(arrow, speedEl, dirEl);
  cell.appendChild(wrapper);
  return cell;
}

function renderTideChart(svg, tideEvents, columns, start, end) {
  svg.innerHTML = "";
  renderTideChart.lastLabelX = null;
  if (tideEvents.length < 2) return;

  const columnWidth = 62;
  const svgWidth = Math.max(columns.length * columnWidth, 300);
  const svgHeight = 120;
  const padding = 16;
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const events = tideEvents
    .filter((event) => event.date && event.date >= start && event.date <= end)
    .sort((a, b) => a.date - b.date);
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
    ((date - start) / (end - start || 1)) * svgWidth;

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
      const value = h1 + (h2 - h1) * (1 - Math.cos(Math.PI * ratio)) / 2;
      const time = new Date(t1.getTime() + m * 60 * 1000);
      points.push({ x: scaleX(time), y: scaleY(value) });
    }
  }

  if (!points.length) return;
  const fillPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const baseline = svgHeight - padding;
  const fillD = `${points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ")} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
  fillPath.setAttribute("d", fillD);
  fillPath.setAttribute("fill", "rgba(78, 161, 255, 0.2)");
  svg.appendChild(fillPath);

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#62c1ff");
  path.setAttribute("stroke-width", "2");
  svg.appendChild(path);

  events.forEach((event) => {
    const height = parseHeightNumber(event.height);
    if (height === null) return;
    const cx = scaleX(event.date);
    const cy = scaleY(height);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", "4");
    circle.setAttribute("class", "tide-marker");
    svg.appendChild(circle);

    if (!renderTideChart.lastLabelX || Math.abs(cx - renderTideChart.lastLabelX) > 70) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", cx + 6);
      label.setAttribute("y", cy - 8);
      label.setAttribute("class", "tide-label");
      label.textContent = `${event.type[0]} ${event.timeText} · ${event.height}`;
      svg.appendChild(label);
      renderTideChart.lastLabelX = cx;
    }
  });
}

function renderForecast(data, tideEvents) {
  ui.forecastHeadRow.innerHTML = "";
  ui.forecastBody.innerHTML = "";
  ui.forecastHeadRow.appendChild(
    Object.assign(document.createElement("th"), {
      className: "label-cell",
      textContent: "Date",
    })
  );

  const times = data.hourly.time.map((time) => new Date(time));
  const now = new Date();
  const end = new Date(now.getTime() + config.forecastDays * 24 * 60 * 60 * 1000);
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

  const rows = [
    { label: "Time", key: "time" },
    { label: "Temp °C", key: "temperature_2m" },
    { label: "Wind kt", key: "wind_speed_10m" },
    { label: "Direction", key: "wind_direction_10m" },
    { label: "Gusts kt", key: "wind_gusts_10m" },
    { label: "Rain mm", key: "precipitation" },
    { label: "Tide", key: "tide" },
    { label: "Tide curve", key: "tide_curve" },
  ];

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const label = document.createElement("th");
    label.className = "label-cell";
    label.textContent = row.label;
    tr.appendChild(label);

    if (row.key === "tide_curve") {
      const cell = document.createElement("td");
      cell.className = "data-cell tide-curve-cell";
      cell.colSpan = columns.length;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "tide-row-svg");
      cell.appendChild(svg);
      tr.appendChild(cell);
      ui.forecastBody.appendChild(tr);
      return;
    }

    columns.forEach((column) => {
      if (row.key === "wind_speed_10m") {
        const speed = data.hourly.wind_speed_10m[column.index];
        const cell = buildDataCell(
          `${Math.round(speed)}`,
          "",
          colorForValue(speed, [
            { value: 0, color: "#0a1a2b" },
            { value: 8, color: "#12314f" },
            { value: 12, color: "#1a4f86" },
            { value: 16, color: "#1a7a63" },
            { value: 20, color: "#6b8f1a" },
            { value: 24, color: "#c47c13" },
            { value: 28, color: "#c0392b" },
            { value: 32, color: "#7b1d6b" },
          ])
        );
        tr.appendChild(cell);
        return;
      }

      if (row.key === "wind_direction_10m") {
        const degrees = data.hourly.wind_direction_10m[column.index];
        const direction = windCompass(degrees);
        const cell = buildDirectionCell(direction, degrees);
        cell.style.background = "rgba(8, 18, 28, 0.5)";
        tr.appendChild(cell);
        return;
      }

      if (row.key === "tide") {
        const windowStart = column.time;
        const windowEnd = new Date(
          windowStart.getTime() + windowSize * 60 * 60 * 1000
        );
        const tideText = tideForWindow(tideEvents, windowStart, windowEnd);
        const cell = buildDataCell(tideText, "", "rgba(10, 24, 38, 0.4)");
        tr.appendChild(cell);
        return;
      }

      if (row.key === "temperature_2m") {
        const temp = data.hourly.temperature_2m[column.index];
        const cell = buildDataCell(
          `${Math.round(temp)}°`,
          "",
          colorForValue(temp, [
            { value: -2, color: "#1b2b44" },
            { value: 4, color: "#225c8a" },
            { value: 10, color: "#1f8a70" },
            { value: 16, color: "#f6aa1c" },
            { value: 22, color: "#f2545b" },
          ])
        );
        tr.appendChild(cell);
        return;
      }

      if (row.key === "wind_gusts_10m") {
        const gusts = data.hourly.wind_gusts_10m[column.index];
        const cell = buildDataCell(
          `${Math.round(gusts)}`,
          "",
          colorForValue(gusts, [
            { value: 0, color: "#0f2235" },
            { value: 10, color: "#1a4f86" },
            { value: 18, color: "#6b8f1a" },
            { value: 24, color: "#c47c13" },
            { value: 30, color: "#c0392b" },
          ])
        );
        tr.appendChild(cell);
        return;
      }

      if (row.key === "precipitation") {
        const precip = data.hourly.precipitation[column.index];
        const prob = data.hourly.precipitation_probability[column.index];
        const cell = buildDataCell(
          `${Number.isNaN(Number(precip)) ? "—" : Number(precip).toFixed(1).replace(/\.0$/, "")}`,
          `${Math.round(prob)}%`,
          colorForValue(prob, [
            { value: 0, color: "#0a1828" },
            { value: 30, color: "#12314f" },
            { value: 60, color: "#1e4e9c" },
            { value: 80, color: "#2c6bbf" },
          ])
        );
        tr.appendChild(cell);
        return;
      }

      if (row.key === "time") {
        const cell = buildTimeCell(column.time);
        tr.appendChild(cell);
        return;
      }
    });

    ui.forecastBody.appendChild(tr);
  });

  if (columns.length) {
    if (ui.forecastRange) {
      ui.forecastRange.textContent = `${formatWindow.format(columns[0].time)} → ${formatWindow.format(
        columns[columns.length - 1].time
      )}`;
    }
  } else if (ui.forecastRange) {
    ui.forecastRange.textContent = "No forecast windows";
  }

  const curveRow = ui.forecastBody.querySelector(".tide-curve-cell svg");
  if (curveRow) {
    renderTideChart(curveRow, tideEvents, columns, now, end);
  }
}

function saveCache(weather, tides) {
  const timestamp = Date.now();
  localStorage.setItem(cacheKeys.weather, JSON.stringify(weather));
  localStorage.setItem(cacheKeys.tides, JSON.stringify(tides));
  localStorage.setItem(cacheKeys.updated, String(timestamp));
}

function loadCache() {
  const weatherRaw = localStorage.getItem(cacheKeys.weather);
  const tidesRaw = localStorage.getItem(cacheKeys.tides);
  const updatedRaw = localStorage.getItem(cacheKeys.updated);
  if (!weatherRaw) return null;
  try {
    const weather = JSON.parse(weatherRaw);
    const tides = tidesRaw ? JSON.parse(tidesRaw) : [];
    return {
      weather,
      tides,
      updated: updatedRaw ? Number(updatedRaw) : null,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

function renderFromCache() {
  const cached = loadCache();
  if (!cached) {
    ui.lastUpdated.textContent = "No cached data. Tap Refresh.";
    return;
  }
  renderCurrent(cached.weather);
  renderForecast(cached.weather, cached.tides);
  setTideStatus("");
  setCachedUpdated(cached.updated);
}

function setLocation() {
  ui.locationName.textContent = config.locationName;
}

function setLastUpdated() {
  ui.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function handleError(error) {
  if (ui.currentSummary) {
    ui.currentSummary.textContent = "Offline";
  }
  ui.lastUpdated.textContent = "Could not refresh data";
  console.error(error);
}

async function loadForecast() {
  setLoadingState();
  setLocation();

  try {
    const [weatherResponse, tideEvents] = await Promise.all([
      fetch(buildUrl()),
      loadTides(),
    ]);
    if (!weatherResponse.ok) {
      throw new Error(`Open-Meteo error: ${weatherResponse.status}`);
    }
    const data = await weatherResponse.json();
    renderCurrent(data);
    renderForecast(data, tideEvents);
    setTideStatus("");
    setLastUpdated();
    saveCache(data, tideEvents);
  } catch (error) {
    handleError(error);
  }
}

ui.refresh.addEventListener("click", () => {
  loadForecast();
});

setLocation();
renderFromCache();
