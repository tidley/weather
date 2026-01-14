const config = {
  locationName: "Hayling Island, UK",
  latitude: 50.783,
  longitude: -0.975,
  timezone: "Europe/London",
  windSpeedUnit: "kn",
  tide: {
    provider: "rss",
    rssUrl: "https://www.tidetimes.org.uk/hastings-tide-times.rss",
    sourceUrl: "https://www.tidetimes.org.uk/hastings-tide-times",
    corsProxy: "",
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
  hourlyList: document.getElementById("hourly-list"),
  hourlyWindow: document.getElementById("hourly-window"),
  dailyList: document.getElementById("daily-list"),
  dailySummary: document.getElementById("daily-summary"),
  tideStatus: document.getElementById("tide-status"),
  tideList: document.getElementById("tide-list"),
  tideSource: document.getElementById("tide-source"),
  tideLink: document.getElementById("tide-link"),
  refresh: document.getElementById("refresh"),
};

const formatTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const formatDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
});

const formatDateTime = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
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
  return `rotate(${degrees}deg)`;
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
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "wind_direction_10m_dominant",
    ].join(","),
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function setLoadingState() {
  ui.currentSummary.textContent = "Refreshing";
  ui.lastUpdated.textContent = "Fetching latest data…";
}

function setTideStatus(message) {
  ui.tideStatus.textContent = message;
  ui.tideStatus.style.display = "block";
}

function clearTideStatus() {
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
  ui.currentSummary.textContent = `${wind} kt / ${gusts} kt · ${rain} mm`;
}

function renderHourly(data) {
  ui.hourlyList.innerHTML = "";
  const now = new Date();
  const times = data.hourly.time.map((time) => new Date(time));
  let startIndex = times.findIndex((time) => time >= now);
  if (startIndex < 0) startIndex = 0;
  const endIndex = Math.min(startIndex + 12, times.length);

  const template = document.getElementById("hourly-item");
  for (let i = startIndex; i < endIndex; i += 1) {
    const clone = template.content.cloneNode(true);
    const time = times[i];
    clone.querySelector(".hour-time").textContent = formatTime.format(time);
    clone.querySelector(".hour-temp").textContent = formatValue(
      data.hourly.temperature_2m[i],
      "°C"
    );
    clone.querySelector(".wind-speed").textContent = formatValue(
      data.hourly.wind_speed_10m[i],
      " kt"
    );
    clone.querySelector(".arrow").style.transform = arrowForDegrees(
      data.hourly.wind_direction_10m[i]
    );
    clone.querySelector(".hour-precip").textContent = `${formatValue(
      data.hourly.precipitation_probability[i],
      "%"
    )} · ${formatValue(data.hourly.precipitation[i], " mm", "0 mm")}`;
    ui.hourlyList.appendChild(clone);
  }

  if (times[startIndex]) {
    ui.hourlyWindow.textContent = `from ${formatDateTime.format(times[startIndex])}`;
  }
}

function renderDaily(data) {
  ui.dailyList.innerHTML = "";
  const template = document.getElementById("daily-item");

  for (let i = 0; i < data.daily.time.length; i += 1) {
    const clone = template.content.cloneNode(true);
    const time = new Date(data.daily.time[i]);
    clone.querySelector(".day-name").textContent = formatDay.format(time);
    clone.querySelector(".day-temp").textContent = `${formatValue(
      data.daily.temperature_2m_max[i],
      "°C"
    )} / ${formatValue(data.daily.temperature_2m_min[i], "°C")}`;
    clone.querySelector(".day-wind").textContent = `${formatValue(
      data.daily.wind_speed_10m_max[i],
      " kt"
    )} · ${windCompass(data.daily.wind_direction_10m_dominant[i])}`;
    clone.querySelector(".day-precip").textContent = formatValue(
      data.daily.precipitation_probability_max[i],
      "%"
    );
    ui.dailyList.appendChild(clone);
  }

  const maxWind = Math.max(...data.daily.wind_speed_10m_max);
  ui.dailySummary.textContent = `Max ${Math.round(maxWind)} kt`;
}

function extractHeight(text) {
  if (!text) return null;
  const match = text.match(/([0-9]+(?:\\.[0-9]+)?)\\s?m/i);
  if (!match) return null;
  return `${match[1]} m`;
}

function extractTime(text) {
  if (!text) return null;
  const match = text.match(/\\b([01]?\\d|2[0-3]):[0-5]\\d\\b/);
  if (!match) return null;
  return match[0];
}

function parseTideItems(xmlDoc) {
  const items = Array.from(xmlDoc.querySelectorAll("item"));
  return items.map((item) => {
    const title = item.querySelector("title")?.textContent?.trim() ?? "";
    const description =
      item.querySelector("description")?.textContent?.trim() ?? "";
    const pubDateText = item.querySelector("pubDate")?.textContent?.trim() ?? "";
    const pubDate = pubDateText ? new Date(pubDateText) : null;
    const typeMatch = title.match(/\\b(High|Low)\\b/i);
    const type = typeMatch ? typeMatch[1].toUpperCase() : "TIDE";
    const height =
      extractHeight(title) ?? extractHeight(description) ?? "—";
    const timeText =
      (pubDate && !Number.isNaN(pubDate.getTime())
        ? formatTideTime.format(pubDate)
        : null) ||
      extractTime(title) ||
      extractTime(description) ||
      "—";

    return {
      title,
      type,
      height,
      timeText,
      date: pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate : null,
    };
  });
}

function renderTides(items) {
  ui.tideList.innerHTML = "";
  if (!items.length) {
    setTideStatus("No tide items found.");
    return;
  }

  const now = new Date();
  const upcoming = items
    .filter((item) => !item.date || item.date >= now)
    .sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return a.date - b.date;
    })
    .slice(0, 6);

  const displayItems = upcoming.length ? upcoming : items.slice(0, 6);
  displayItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "tide-row";
    row.innerHTML = `
      <div class="tide-time">${item.timeText}</div>
      <div class="tide-type">${item.type}</div>
      <div class="tide-height">${item.height}</div>
    `;
    ui.tideList.appendChild(row);
  });

  clearTideStatus();
}

async function loadTides() {
  if (config.tide.provider !== "rss" || !config.tide.rssUrl) {
    setTideStatus("No tide feed configured.");
    ui.tideSource.textContent = "Manual";
    return;
  }

  ui.tideSource.textContent = "RSS";
  if (config.tide.sourceUrl) {
    ui.tideLink.href = config.tide.sourceUrl;
  }

  const rssUrl = config.tide.corsProxy
    ? `${config.tide.corsProxy}${encodeURIComponent(config.tide.rssUrl)}`
    : config.tide.rssUrl;

  try {
    const response = await fetch(rssUrl);
    if (!response.ok) {
      throw new Error(`Tide RSS error: ${response.status}`);
    }
    const text = await response.text();
    const xmlDoc = new DOMParser().parseFromString(text, "text/xml");
    const items = parseTideItems(xmlDoc);
    renderTides(items);
  } catch (error) {
    setTideStatus("Tide feed blocked or unavailable.");
    console.error(error);
  }
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
  ui.currentSummary.textContent = "Offline";
  ui.lastUpdated.textContent = "Could not refresh data";
  console.error(error);
}

async function loadForecast() {
  setLoadingState();
  setLocation();

  try {
    const response = await fetch(buildUrl());
    if (!response.ok) {
      throw new Error(`Open-Meteo error: ${response.status}`);
    }
    const data = await response.json();
    renderCurrent(data);
    renderHourly(data);
    renderDaily(data);
    setLastUpdated();
  } catch (error) {
    handleError(error);
  }

  loadTides();
}

ui.refresh.addEventListener("click", () => {
  loadForecast();
});

loadForecast();
