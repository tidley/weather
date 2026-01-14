const config = {
  locationName: "Hayling Island, UK",
  latitude: 50.783,
  longitude: -0.975,
  timezone: "Europe/London",
  windSpeedUnit: "kn",
  tide: {
    provider: null,
    apiKey: "",
    stationId: "",
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
}

ui.refresh.addEventListener("click", () => {
  loadForecast();
});

loadForecast();
