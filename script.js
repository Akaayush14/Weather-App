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

    // ── Run comfort prediction ──
    await predictComfort(data);

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

// ═══════════════════════════════════════════════════════════
// ── FEATURE 2: PERSONAL COMFORT PREDICTOR (TF.js) ────────
// A tiny neural network trained on your personal ratings.
// Inputs: temp (normalized), humidity, wind, condition code
// Output: comfort score 0–10
// Bootstrapped with synthetic defaults; retrains after 10+ ratings.
// ═══════════════════════════════════════════════════════════

let comfortModel = null;
const COMFORT_STORAGE_KEY = "comfort-ratings-v1";
const MODEL_TRAINED_KEY = "comfort-model-trained";

// Condition codes → numeric bucket (0=Clear,1=Clouds,2=Rain,3=Snow,4=Extreme)
function conditionBucket(weatherMain) {
  const map = { Clear: 0, Clouds: 1, Drizzle: 2, Rain: 2, Thunderstorm: 4, Snow: 3, Mist: 1, Fog: 1, Haze: 1 };
  return (map[weatherMain] ?? 1) / 4; // normalize 0–1
}

// Normalize inputs to [0,1] range
function normalizeInputs(tempC, humidity, windSpeed, condBucket) {
  return [
    Math.min(Math.max((tempC + 20) / 70, 0), 1),  // -20°C to 50°C → 0–1
    humidity / 100,
    Math.min(windSpeed / 30, 1),                   // 0–30 m/s → 0–1
    condBucket
  ];
}

// Build a fresh untrained model
function buildModel() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 16, activation: "relu", inputShape: [4] }));
  model.add(tf.layers.dense({ units: 8, activation: "relu" }));
  model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));
  model.compile({ optimizer: tf.train.adam(0.01), loss: "meanSquaredError" });
  return model;
}

// Synthetic bootstrap data — "reasonable" defaults so model works before any ratings
function syntheticData() {
  return [
    // [tempC, humidity, wind, condBucket(norm)] → comfort 0–1
    [22, 50, 3, 0,   0.95],  // perfect sunny day
    [25, 45, 5, 0,   0.90],
    [18, 60, 4, 0.25, 0.85], // mild cloudy
    [15, 70, 6, 0.25, 0.75],
    [10, 65, 8, 0.25, 0.60],
    [5,  70, 10, 0.5, 0.40], // cold rainy
    [0,  80, 12, 0.5, 0.25],
    [35, 80, 2, 0,   0.30],  // hot humid
    [38, 85, 1, 0,   0.20],
    [40, 90, 0, 0,   0.10],
    [-5, 85, 15, 0.75, 0.20], // cold snowy
    [2,  90, 20, 1.0, 0.05],  // storm
    [28, 55, 3, 0,   0.88],
    [20, 65, 5, 0.25, 0.80],
    [12, 75, 7, 0.5,  0.50],
    [8,  60, 9, 0.25, 0.55],
    [30, 40, 4, 0,    0.75],
    [33, 35, 6, 0,    0.65],
    [16, 55, 3, 0,    0.85],
    [24, 50, 2, 0,    0.92],
  ];
}

async function initComfortModel() {
  try {
    // Try loading saved model first
    comfortModel = await tf.loadLayersModel("localstorage://comfort-model");
    updateModelStatusUI();
    return;
  } catch (e) {
    // No saved model — train on synthetic defaults
  }

  comfortModel = buildModel();
  const data = syntheticData();
  const xs = tf.tensor2d(data.map(r => normalizeInputs(r[0], r[1], r[2], r[3])));
  const ys = tf.tensor2d(data.map(r => [r[4]]));

  await comfortModel.fit(xs, ys, { epochs: 100, verbose: 0 });
  xs.dispose(); ys.dispose();

  updateModelStatusUI();
}

async function predictComfort(weatherData) {
  if (!comfortModel) await initComfortModel();

  // Always work in Celsius internally
  let tempC = weatherData.main.temp;
  if (unit === "imperial") tempC = (tempC - 32) * 5 / 9;

  const humidity = weatherData.main.humidity;
  const wind = weatherData.wind.speed;
  const cond = conditionBucket(weatherData.weather[0].main);

  const input = tf.tensor2d([normalizeInputs(tempC, humidity, wind, cond)]);
  const predTensor = comfortModel.predict(input);
  const pred = (await predTensor.data())[0];
  input.dispose(); predTensor.dispose();

  const score = Math.round(pred * 10 * 10) / 10; // 0.0–10.0
  const pct = pred * 100;

  document.getElementById("comfortScore").textContent = score.toFixed(1);
  document.getElementById("comfortBar").style.width = `${pct}%`;
  document.getElementById("comfortBar").style.background = comfortBarColor(pred);

  const labels = ["Very uncomfortable", "Quite uncomfortable", "A bit uncomfortable",
                  "Somewhat comfortable", "Comfortable", "Very comfortable", "Perfect!"];
  const idx = Math.min(Math.floor(pred * labels.length), labels.length - 1);
  document.getElementById("comfortText").textContent = labels[idx];

  // Render rating stars
  renderRatingStars(tempC, humidity, wind, weatherData.weather[0].main);
  document.getElementById("ratingThanks").classList.add("hidden");
}

function comfortBarColor(pred) {
  if (pred < 0.3) return "#e74c3c";
  if (pred < 0.5) return "#e67e22";
  if (pred < 0.7) return "#f1c40f";
  if (pred < 0.85) return "#2ecc71";
  return "#27ae60";
}

// ─── Rating Stars ─────────────────────────────────────────
function renderRatingStars(tempC, humidity, wind, weatherMain) {
  const container = document.getElementById("ratingStars");
  container.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const star = document.createElement("button");
    star.className = "star-btn";
    star.textContent = i <= 5 ? "★" : "★";
    star.title = `Rate ${i}/10`;
    star.onclick = () => saveRating(i, tempC, humidity, wind, weatherMain);
    container.appendChild(star);
  }
}

function saveRating(score, tempC, humidity, wind, weatherMain) {
  const ratings = JSON.parse(localStorage.getItem(COMFORT_STORAGE_KEY) || "[]");
  ratings.push({
    tempC: Math.round(tempC * 10) / 10,
    humidity,
    wind,
    cond: conditionBucket(weatherMain),
    score: score / 10,
    ts: Date.now()
  });
  localStorage.setItem(COMFORT_STORAGE_KEY, JSON.stringify(ratings));

  // Highlight selected stars
  const stars = document.querySelectorAll(".star-btn");
  stars.forEach((s, i) => {
    s.classList.toggle("star-selected", i < score);
  });

  document.getElementById("ratingThanks").classList.remove("hidden");
  updateModelStatusUI();

  // Auto-retrain once enough data
  if (ratings.length >= 10 && ratings.length % 5 === 0) {
    retrainModel();
  }
}

// ─── Retrain Model ────────────────────────────────────────
async function retrainModel() {
  const ratings = JSON.parse(localStorage.getItem(COMFORT_STORAGE_KEY) || "[]");
  if (ratings.length < 5) {
    alert("Need at least 5 ratings to retrain. Keep rating weather days!");
    return;
  }

  document.getElementById("modelState").textContent = "Retraining…";

  // Combine synthetic defaults with user ratings (user data weighted 3x)
  const synthetic = syntheticData().map(r => ({
    tempC: r[0], humidity: r[1], wind: r[2], cond: r[3], score: r[4]
  }));
  const allData = [...synthetic, ...ratings, ...ratings, ...ratings];

  const xs = tf.tensor2d(allData.map(r => normalizeInputs(r.tempC, r.humidity, r.wind, r.cond)));
  const ys = tf.tensor2d(allData.map(r => [r.score]));

  comfortModel = buildModel();
  await comfortModel.fit(xs, ys, {
    epochs: 200,
    verbose: 0,
    validationSplit: 0.1,
    callbacks: { onEpochEnd: (epoch) => {
      if (epoch % 50 === 0)
        document.getElementById("modelState").textContent = `Training… epoch ${epoch}/200`;
    }}
  });

  xs.dispose(); ys.dispose();

  // Save to localStorage
  await comfortModel.save("localstorage://comfort-model");
  localStorage.setItem(MODEL_TRAINED_KEY, "true");

  document.getElementById("modelState").textContent = `Trained on ${ratings.length} personal ratings`;
  document.getElementById("retrainBtn").classList.add("hidden");

  // Re-run prediction with updated model
  if (lastWeatherData) await predictComfort(lastWeatherData);
}

// ─── Reset Model ──────────────────────────────────────────
function resetModel() {
  if (!confirm("Reset your comfort model and all ratings?")) return;
  localStorage.removeItem(COMFORT_STORAGE_KEY);
  localStorage.removeItem(MODEL_TRAINED_KEY);
  try { localStorage.removeItem("tensorflowjs_models/comfort-model/info"); } catch(e) {}
  comfortModel = null;
  initComfortModel();
  updateModelStatusUI();
  if (lastWeatherData) predictComfort(lastWeatherData);
}

// ─── Model Status UI ─────────────────────────────────────
function updateModelStatusUI() {
  const ratings = JSON.parse(localStorage.getItem(COMFORT_STORAGE_KEY) || "[]");
  const trained = localStorage.getItem(MODEL_TRAINED_KEY) === "true";

  document.getElementById("ratingCount").textContent = ratings.length;
  document.getElementById("modelState").textContent =
    trained ? `Personalized (${ratings.length} ratings)` :
    ratings.length >= 5 ? "Ready to personalize — click Retrain" :
    "Default (needs 5+ ratings)";

  const retrainBtn = document.getElementById("retrainBtn");
  if (ratings.length >= 5) {
    retrainBtn.classList.remove("hidden");
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
updateModelStatusUI();
initComfortModel();