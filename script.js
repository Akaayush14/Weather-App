const API_KEY = "9bd6721f677dc1d00209916f11169201";
let unit = "metric";
let unitSymbol = "°C";
let lastCity = "";
let lastWeatherData = null; // store for re-use by comfort/anomaly

// ─── Dark Mode ───────────────────────────────────────────
function toggleDark() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  document.getElementById("darkBtn").textContent = isDark ? "🌙 Dark Mode" : "☀️ Light Mode";
  localStorage.setItem("theme", isDark ? "light" : "dark");
}

// ─── Unit Toggle ─────────────────────────────────────────
function toggleUnit() {
  unit = unit === "metric" ? "imperial" : "metric";
  unitSymbol = unit === "metric" ? "°C" : "°F";
  document.getElementById("unitBtn").textContent =
    unit === "metric" ? "Switch to °F" : "Switch to °C";
  if (lastCity) getWeather(lastCity);
}

// ─── Dynamic Background ──────────────────────────────────
function setBackground(condition) {
  const themes = {
    Clear: "linear-gradient(135deg, #f6d365, #fda085)",
    Clouds: "linear-gradient(135deg, #cfd9df, #e2ebf0)",
    Rain: "linear-gradient(135deg, #4b79a1, #283e51)",
    Drizzle: "linear-gradient(135deg, #89f7fe, #66a6ff)",
    Thunderstorm: "linear-gradient(135deg, #373b44, #4286f4)",
    Snow: "linear-gradient(135deg, #e0eafc, #cfdef3)",
    Mist: "linear-gradient(135deg, #bdc3c7, #2c3e50)",
    default: "linear-gradient(135deg, #74ebd5, #acb6e5)"
  };
  document.body.style.background = themes[condition] || themes.default;
}

// ─── Recent Searches ─────────────────────────────────────
function saveRecent(city) {
  let recent = JSON.parse(localStorage.getItem("recentCities") || "[]");
  recent = [city, ...recent.filter(c => c.toLowerCase() !== city.toLowerCase())].slice(0, 5);
  localStorage.setItem("recentCities", JSON.stringify(recent));
  renderRecent();
}

function renderRecent() {
  const recent = JSON.parse(localStorage.getItem("recentCities") || "[]");
  const container = document.getElementById("recentSearches");
  container.innerHTML = recent.map(city =>
    `<span class="recent-chip" onclick="getWeather('${city}')">${city}</span>`
  ).join("");
}

// ─── Get Weather ─────────────────────────────────────────
async function getWeather(cityOverride) {
  const city = cityOverride || document.getElementById("cityInput").value.trim();
  if (!city) return;
  lastCity = city;

  document.getElementById("weatherResult").classList.add("hidden");
  document.getElementById("errorMsg").classList.add("hidden");
  document.getElementById("forecastSection").classList.add("hidden");
  document.getElementById("hourlySection").classList.add("hidden");
  document.getElementById("alertBanner").classList.add("hidden");

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=${unit}`
    );
    const data = await res.json();

    if (data.cod !== 200) {
      document.getElementById("errorMsg").classList.remove("hidden");
      return;
    }

    lastWeatherData = data;

    // Current weather
    document.getElementById("cityName").textContent = `${data.name}, ${data.sys.country}`;
    document.getElementById("description").textContent = data.weather[0].description;
    document.getElementById("temp").textContent = `${Math.round(data.main.temp)}${unitSymbol}`;
    document.getElementById("humidity").textContent = data.main.humidity;
    document.getElementById("wind").textContent = data.wind.speed;
    document.getElementById("weatherIcon").src =
      `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
    document.getElementById("weatherResult").classList.remove("hidden");

    setBackground(data.weather[0].main);
    saveRecent(data.name);

    // Alerts
    if (data.alerts && data.alerts.length > 0) {
      const banner = document.getElementById("alertBanner");
      banner.textContent = `⚠️ Alert: ${data.alerts[0].event} — ${data.alerts[0].description}`;
      banner.classList.remove("hidden");
    }

    // ── Run anomaly detection ──
    await runAnomalyDetection(data);
    // Forecast + Hourly
    const forecastRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=${unit}`
    );
    const forecastData = await forecastRes.json();

    renderHourly(forecastData.list);
    renderForecast(forecastData.list);

    document.getElementById("hourlySection").classList.remove("hidden");
    document.getElementById("forecastSection").classList.remove("hidden");

  } catch (err) {
    document.getElementById("errorMsg").classList.remove("hidden");
  }
}

// ─── Auto Location ────────────────────────────────────────
function getLocationWeather() {
  if (!navigator.geolocation) return alert("Geolocation not supported.");
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${unit}`
    );
    const data = await res.json();
    document.getElementById("cityInput").value = data.name;
    getWeather(data.name);
  }, () => alert("Could not get your location."));
}

// ─── Hourly Forecast ─────────────────────────────────────
function renderHourly(list) {
  const container = document.getElementById("hourlyCards");
  container.innerHTML = "";
  list.slice(0, 8).forEach(item => {
    const time = new Date(item.dt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const card = document.createElement("div");
    card.className = "hourly-card";
    card.innerHTML = `
      <div class="hour">${time}</div>
      <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png" alt="" />
      <div class="temp">${Math.round(item.main.temp)}${unitSymbol}</div>
    `;
    container.appendChild(card);
  });
}

// ─── 5-Day Forecast ──────────────────────────────────────
function renderForecast(list) {
  const container = document.getElementById("forecastCards");
  container.innerHTML = "";
  const days = {};
  list.forEach(item => {
    const date = new Date(item.dt * 1000);
    const day = date.toLocaleDateString("en-US", { weekday: "short" });
    const hour = date.getHours();
    if (!days[day]) days[day] = { temps: [], icon: item.weather[0].icon, hour };
    days[day].temps.push(item.main.temp);
    if (Math.abs(hour - 12) < Math.abs(days[day].hour - 12)) {
      days[day].icon = item.weather[0].icon;
      days[day].hour = hour;
    }
  });
  Object.entries(days).slice(0, 5).forEach(([day, info]) => {
    const max = Math.round(Math.max(...info.temps));
    const min = Math.round(Math.min(...info.temps));
    const card = document.createElement("div");
    card.className = "forecast-card";
    card.innerHTML = `
      <div class="day">${day}</div>
      <img src="https://openweathermap.org/img/wn/${info.icon}.png" alt="" />
      <div class="max">↑${max}${unitSymbol}</div>
      <div class="min">↓${min}${unitSymbol}</div>
    `;
    container.appendChild(card);
  });
}

// ─── Compare Cities ───────────────────────────────────────
async function compareCities() {
  const city1 = document.getElementById("city1Input").value.trim();
  const city2 = document.getElementById("city2Input").value.trim();
  const errDiv = document.getElementById("compareError");
  const resultDiv = document.getElementById("compareResult");

  errDiv.classList.add("hidden");
  resultDiv.classList.add("hidden");

  if (!city1 || !city2) return;

  try {
    const [res1, res2] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city1}&appid=${API_KEY}&units=${unit}`),
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city2}&appid=${API_KEY}&units=${unit}`)
    ]);
    const [d1, d2] = await Promise.all([res1.json(), res2.json()]);

    if (d1.cod !== 200 || d2.cod !== 200) {
      errDiv.classList.remove("hidden");
      return;
    }

    function buildCard(d) {
      return `
        <h4>${d.name}, ${d.sys.country}</h4>
        <img src="https://openweathermap.org/img/wn/${d.weather[0].icon}.png" alt="" />
        <p>${d.weather[0].description}</p>
        <p>🌡 ${Math.round(d.main.temp)}${unitSymbol}</p>
        <p>💧 Humidity: ${d.main.humidity}%</p>
        <p>💨 Wind: ${d.wind.speed} m/s</p>
      `;
    }

    document.getElementById("compareCard1").innerHTML = buildCard(d1);
    document.getElementById("compareCard2").innerHTML = buildCard(d2);
    resultDiv.classList.remove("hidden");

  } catch (err) {
    errDiv.classList.remove("hidden");
  }
}

// ═══════════════════════════════════════════════════════════
// ── FEATURE 1: ANOMALY DETECTION ────────────────────────
// Uses Open-Meteo historical API to get the past 30-day
// average temperature for this location and month.
// Flags if today is unusually hot/cold/wet using Z-score.
// ═══════════════════════════════════════════════════════════

async function runAnomalyDetection(weatherData) {
  const section = document.getElementById("anomalySection");
  const badge = document.getElementById("anomalyBadge");
  const detail = document.getElementById("anomalyDetail");

  section.classList.add("hidden");

  try {
    const lat = weatherData.coord.lat;
    const lon = weatherData.coord.lon;
    const currentTemp = weatherData.main.temp; // always in metric from OWM

    // Get today's date and 30 days ago
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - 30);

    const fmt = d => d.toISOString().split("T")[0];

    // Fetch historical daily temps from Open-Meteo (free, no key needed)
    const histUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${fmt(past)}&end_date=${fmt(today)}&daily=temperature_2m_mean,precipitation_sum&timezone=auto`;
    const histRes = await fetch(histUrl);
    const histData = await histRes.json();

    if (!histData.daily || !histData.daily.temperature_2m_mean) {
      section.classList.add("hidden");
      return;
    }

    const temps = histData.daily.temperature_2m_mean.filter(t => t !== null);
    const precips = histData.daily.precipitation_sum.filter(p => p !== null);

    // ── Z-score calculation ──
    const mean = temps.reduce((a, b) => a + b, 0) / temps.length;
    const std = Math.sqrt(temps.map(t => (t - mean) ** 2).reduce((a, b) => a + b, 0) / temps.length);

    // Convert current temp to Celsius for fair comparison with Open-Meteo
    let currentTempC = currentTemp;
    if (unit === "imperial") {
      currentTempC = (currentTemp - 32) * 5 / 9;
    }

    const zScore = std > 0 ? (currentTempC - mean) / std : 0;

    // Average precipitation
    const avgPrecip = precips.reduce((a, b) => a + b, 0) / precips.length;
    const todayPrecip = precips[precips.length - 1] || 0;

    // ── Determine anomaly type ──
    let anomalyType = null;
    let anomalyMsg = "";
    let anomalyClass = "";

    if (zScore >= 2) {
      anomalyType = "hot";
      anomalyMsg = `🔥 Unusually hot! ${Math.round(currentTempC)}°C is ${Math.round(zScore * 10) / 10}σ above the 30-day average of ${Math.round(mean)}°C.`;
      anomalyClass = "anomaly-hot";
    } else if (zScore <= -2) {
      anomalyType = "cold";
      anomalyMsg = `🧊 Unusually cold! ${Math.round(currentTempC)}°C is ${Math.abs(Math.round(zScore * 10) / 10)}σ below the 30-day average of ${Math.round(mean)}°C.`;
      anomalyClass = "anomaly-cold";
    } else if (todayPrecip > avgPrecip * 3 && todayPrecip > 5) {
      anomalyType = "wet";
      anomalyMsg = `🌧 Heavy rain day! ${Math.round(todayPrecip)}mm vs. average ${Math.round(avgPrecip)}mm/day over the past 30 days.`;
      anomalyClass = "anomaly-wet";
    }

    if (anomalyType) {
      badge.textContent = anomalyType === "hot" ? "⚠️ Heat Anomaly" :
                          anomalyType === "cold" ? "⚠️ Cold Anomaly" : "⚠️ Rain Anomaly";
      badge.className = `anomaly-badge ${anomalyClass}`;
      detail.textContent = anomalyMsg;
      section.classList.remove("hidden");
    } else {
      // Show "normal" quietly
      badge.textContent = "✓ Normal conditions";
      badge.className = "anomaly-badge anomaly-normal";
      detail.textContent = `Temp is within 30-day norms (avg ${Math.round(mean)}°C, σ=${Math.round(std * 10) / 10}).`;
      section.classList.remove("hidden");
    }

  } catch (e) {
    // Silently fail — anomaly is a bonus feature
    console.warn("Anomaly detection failed:", e);
  }
}




// ─── Enter key support ────────────────────────────────────
document.getElementById("cityInput").addEventListener("keypress", e => {
  if (e.key === "Enter") getWeather();
});

// ─── Init ─────────────────────────────────────────────────
const savedTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
document.getElementById("darkBtn").textContent = savedTheme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode";
renderRecent();