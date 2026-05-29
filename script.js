const API_KEY = "9bd6721f677dc1d00209916f11169201";
let unit = "metric";
let unitSymbol = "°C";
let lastCity = "";
let lastWeatherData = null;

// ═══════════════════════════════════════════════════════════
// ── CANVAS WEATHER ENGINE ───────────────────────────────
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById("weatherCanvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("canvasOverlay");

let currentScene = null;
let animFrameId = null;
let particles = [];
let lightningTimer = 0;
let lightningActive = false;
let lightningOpacity = 0;
let windSpeed = 3; // updated from API

const SCENES = {
  Clear:        { bg: ["#f6d365","#fda085"], overlay: "rgba(246,211,101,0.08)", darkBg: ["#1a1040","#2d1b69"], darkOverlay: "rgba(10,5,40,0.45)" },
  Clouds:       { bg: ["#c9d6df","#e2ebf0"], overlay: "rgba(180,195,210,0.12)", darkBg: ["#1c2230","#2a3245"], darkOverlay: "rgba(20,28,48,0.5)" },
  Rain:         { bg: ["#4b79a1","#283e51"], overlay: "rgba(40,62,81,0.35)", darkBg: ["#0d1b2a","#1a2f44"], darkOverlay: "rgba(5,15,30,0.55)" },
  Drizzle:      { bg: ["#89f7fe","#66a6ff"], overlay: "rgba(100,160,240,0.2)", darkBg: ["#0f2040","#1a3060"], darkOverlay: "rgba(5,15,45,0.5)" },
  Thunderstorm: { bg: ["#373b44","#4286f4"], overlay: "rgba(30,30,60,0.45)", darkBg: ["#0a0c14","#111624"], darkOverlay: "rgba(0,0,10,0.65)" },
  Snow:         { bg: ["#e0eafc","#cfdef3"], overlay: "rgba(210,225,245,0.1)", darkBg: ["#141d2e","#1e2a40"], darkOverlay: "rgba(10,18,35,0.5)" },
  Mist:         { bg: ["#bdc3c7","#95a5a6"], overlay: "rgba(150,165,170,0.2)", darkBg: ["#1a1e22","#252c30"], darkOverlay: "rgba(15,18,22,0.55)" },
  default:      { bg: ["#74ebd5","#acb6e5"], overlay: "rgba(100,180,200,0.1)", darkBg: ["#101828","#1a2640"], darkOverlay: "rgba(8,14,30,0.5)" }
};

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", () => { resizeCanvas(); });
resizeCanvas();

// ── Particle Factories ──────────────────────────────────

function makeRaindrop(intensity) {
  const speed = 12 + Math.random() * 8 + intensity * 0.05;
  const angle = (windSpeed * 1.5) * (Math.PI / 180);
  return {
    x: Math.random() * (canvas.width + 200) - 100,
    y: Math.random() * canvas.height * 0.3 - canvas.height * 0.3,
    len: 12 + Math.random() * 14,
    speed,
    vx: Math.sin(angle) * speed * 0.4,
    vy: Math.cos(angle) * speed,
    alpha: 0.25 + Math.random() * 0.45,
    width: 0.8 + Math.random() * 0.8
  };
}

function makeDrizzleDrop() {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * 0.3 - canvas.height * 0.3,
    len: 6 + Math.random() * 6,
    speed: 5 + Math.random() * 4,
    vx: windSpeed * 0.3,
    vy: 5 + Math.random() * 4,
    alpha: 0.2 + Math.random() * 0.3,
    width: 0.5 + Math.random() * 0.5
  };
}

function makeSnowflake() {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * 0.2 - canvas.height * 0.2,
    r: 1.5 + Math.random() * 4,
    speed: 0.6 + Math.random() * 1.4,
    drift: (Math.random() - 0.5) * 0.5,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.01 + Math.random() * 0.02,
    alpha: 0.5 + Math.random() * 0.5
  };
}

function makeCloud() {
  return {
    x: -300,
    y: 30 + Math.random() * (canvas.height * 0.4),
    w: 180 + Math.random() * 200,
    h: 60 + Math.random() * 60,
    speed: 0.2 + Math.random() * 0.3,
    alpha: 0.07 + Math.random() * 0.12
  };
}

function makeMistLayer(i) {
  return {
    x: Math.random() * canvas.width,
    y: canvas.height * (0.3 + i * 0.18),
    w: 400 + Math.random() * 400,
    h: 80 + Math.random() * 80,
    speed: 0.15 + Math.random() * 0.2,
    alpha: 0.06 + Math.random() * 0.1
  };
}

function makeSunRay(i, total) {
  return {
    angle: (i / total) * Math.PI * 2,
    len: canvas.height * 1.2,
    width: 40 + Math.random() * 60,
    speed: 0.0003 + Math.random() * 0.0002,
    alpha: 0.04 + Math.random() * 0.04
  };
}

function makeStar() {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * 0.6,
    r: 0.5 + Math.random() * 1.5,
    twinkle: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.02 + Math.random() * 0.03,
    alpha: 0.4 + Math.random() * 0.6
  };
}

// ── Scene Initializers ──────────────────────────────────

function initScene(condition) {
  particles = [];
  currentScene = condition;
  cancelAnimationFrame(animFrameId);

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const scene = SCENES[condition] || SCENES.default;
  const colors = isDark ? scene.darkBg : scene.bg;
  const ov = isDark ? scene.darkOverlay : scene.overlay;

  // Gradient background on body
  document.body.style.transition = "background 1.2s ease";
  document.body.style.background = `linear-gradient(160deg, ${colors[0]}, ${colors[1]})`;
  overlay.style.background = ov;

  // Update app icon
  const icons = { Clear:"☀️", Clouds:"⛅", Rain:"🌧", Drizzle:"🌦", Thunderstorm:"⛈", Snow:"❄️", Mist:"🌫", Fog:"🌫", Haze:"🌫" };
  document.getElementById("appIcon").textContent = icons[condition] || "🌤";

  if (condition === "Rain" || condition === "Thunderstorm") {
    const count = condition === "Thunderstorm" ? 280 : 220;
    for (let i = 0; i < count; i++) particles.push(makeRaindrop(count));
    if (condition === "Thunderstorm") lightningTimer = 60 + Math.random() * 120;
  } else if (condition === "Drizzle") {
    for (let i = 0; i < 120; i++) particles.push(makeDrizzleDrop());
  } else if (condition === "Snow") {
    for (let i = 0; i < 180; i++) {
      const s = makeSnowflake();
      s.y = Math.random() * canvas.height; // spread initially
      particles.push(s);
    }
  } else if (condition === "Clouds") {
    for (let i = 0; i < 7; i++) {
      const c = makeCloud();
      c.x = Math.random() * canvas.width; // spread initially
      particles.push(c);
    }
  } else if (condition === "Mist" || condition === "Fog" || condition === "Haze") {
    for (let i = 0; i < 5; i++) particles.push(makeMistLayer(i));
  } else if (condition === "Clear") {
    for (let i = 0; i < 14; i++) particles.push(makeSunRay(i, 14));
    if (isDark) {
      for (let i = 0; i < 120; i++) particles.push(makeStar());
    }
  } else {
    // Default — gentle mist
    for (let i = 0; i < 4; i++) particles.push(makeMistLayer(i));
  }

  animate(condition);
}

// ── Draw Functions ──────────────────────────────────────

function drawRain(p, isDark) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.strokeStyle = isDark ? "rgba(160,200,255,0.8)" : "rgba(180,220,255,0.85)";
  ctx.lineWidth = p.width;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + p.vx * (p.len / p.vy), p.y + p.len);
  ctx.stroke();
  ctx.restore();
}

function drawSnow(p) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCloud(p, isDark) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  const grd = ctx.createRadialGradient(p.x + p.w/2, p.y + p.h/2, 0, p.x + p.w/2, p.y + p.h/2, p.w * 0.7);
  const col = isDark ? "rgba(140,160,200," : "rgba(255,255,255,";
  grd.addColorStop(0, col + "0.9)");
  grd.addColorStop(1, col + "0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(p.x + p.w/2, p.y + p.h/2, p.w/2, p.h/2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMist(p, isDark) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  const grd = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
  const col = isDark ? "rgba(140,155,175," : "rgba(210,220,230,";
  grd.addColorStop(0, col + "0)");
  grd.addColorStop(0.3, col + "1)");
  grd.addColorStop(0.7, col + "1)");
  grd.addColorStop(1, col + "0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(p.x + p.w/2, p.y, p.w/2, p.h/2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSunRay(p, isDark) {
  const cx = canvas.width * 0.82, cy = -80;
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.translate(cx, cy);
  ctx.rotate(p.angle);
  const grd = ctx.createLinearGradient(0, 0, 0, p.len);
  const col = isDark ? "rgba(120,100,200," : "rgba(255,220,80,";
  grd.addColorStop(0, col + "0.5)");
  grd.addColorStop(0.5, col + "0.18)");
  grd.addColorStop(1, col + "0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(-p.width/2, 0);
  ctx.lineTo(p.width/2, 0);
  ctx.lineTo(p.width * 1.5, p.len);
  ctx.lineTo(-p.width * 1.5, p.len);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStar(p) {
  p.twinkle += p.twinkleSpeed;
  const a = p.alpha * (0.5 + 0.5 * Math.sin(p.twinkle));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLightning() {
  if (!lightningActive) return;
  ctx.save();
  ctx.globalAlpha = lightningOpacity * 0.85;
  ctx.fillStyle = "rgba(200,220,255,1)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw bolt
  ctx.globalAlpha = lightningOpacity;
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = 2 + Math.random() * 2;
  ctx.shadowColor = "rgba(160,180,255,1)";
  ctx.shadowBlur = 20;
  const startX = canvas.width * (0.2 + Math.random() * 0.6);
  let x = startX, y = 0;
  ctx.beginPath();
  ctx.moveTo(x, y);
  while (y < canvas.height * 0.7) {
    x += (Math.random() - 0.5) * 80;
    y += 40 + Math.random() * 40;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Main Animate Loop ───────────────────────────────────

function animate(condition) {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (condition === "Rain" || condition === "Drizzle" || condition === "Thunderstorm") {
    particles.forEach(p => {
      drawRain(p, isDark);
      p.x += p.vx; p.y += p.vy;
      if (p.y > canvas.height + 20) {
        p.x = Math.random() * (canvas.width + 200) - 100;
        p.y = -20 - Math.random() * 60;
      }
    });
    if (condition === "Thunderstorm") {
      lightningTimer--;
      if (lightningTimer <= 0) {
        lightningActive = true;
        lightningOpacity = 0.7 + Math.random() * 0.3;
        lightningTimer = 80 + Math.random() * 200;
      }
      if (lightningActive) {
        drawLightning();
        lightningOpacity -= 0.08;
        if (lightningOpacity <= 0) lightningActive = false;
      }
    }

  } else if (condition === "Snow") {
    particles.forEach(p => {
      drawSnow(p);
      p.wobble += p.wobbleSpeed;
      p.x += p.drift + Math.sin(p.wobble) * 0.4 + windSpeed * 0.05;
      p.y += p.speed;
      if (p.y > canvas.height + 10) { p.y = -10; p.x = Math.random() * canvas.width; }
      if (p.x > canvas.width + 10) p.x = -10;
      if (p.x < -10) p.x = canvas.width + 10;
    });

  } else if (condition === "Clouds") {
    particles.forEach(p => {
      drawCloud(p, isDark);
      p.x += p.speed;
      if (p.x > canvas.width + 300) p.x = -300;
    });

  } else if (condition === "Mist" || condition === "Fog" || condition === "Haze") {
    particles.forEach(p => {
      drawMist(p, isDark);
      p.x += p.speed;
      if (p.x > canvas.width + p.w) p.x = -p.w;
    });

  } else if (condition === "Clear") {
    particles.forEach(p => {
      if (p.len !== undefined) {
        // sun ray
        p.angle += p.speed;
        drawSunRay(p, isDark);
      } else {
        // star
        drawStar(p);
      }
    });

  } else {
    // default — gentle mist
    particles.forEach(p => {
      drawMist(p, isDark);
      p.x += p.speed;
      if (p.x > canvas.width + p.w) p.x = -p.w;
    });
  }

  animFrameId = requestAnimationFrame(() => animate(condition));
}

// ─── Dark Mode ───────────────────────────────────────────
function toggleDark() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  document.getElementById("darkBtn").textContent = isDark ? "🌙 Dark" : "☀️ Light";
  localStorage.setItem("theme", isDark ? "light" : "dark");
  // Re-init canvas scene for new theme
  if (currentScene) initScene(currentScene);
}

// ─── Unit Toggle ─────────────────────────────────────────
function toggleUnit() {
  unit = unit === "metric" ? "imperial" : "metric";
  unitSymbol = unit === "metric" ? "°C" : "°F";
  document.getElementById("unitBtn").textContent =
    unit === "metric" ? "Switch to °F" : "Switch to °C";
  if (lastCity) getWeather(lastCity);
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
    `<span class="recent-chip" onclick="getWeather('${city}')">
      ${city}
      <button class="chip-delete" onclick="deleteRecent(event, '${city}')" title="Remove">✕</button>
    </span>`
  ).join("");
}

function deleteRecent(event, city) {
  event.stopPropagation(); // don't trigger getWeather
  let recent = JSON.parse(localStorage.getItem("recentCities") || "[]");
  recent = recent.filter(c => c.toLowerCase() !== city.toLowerCase());
  localStorage.setItem("recentCities", JSON.stringify(recent));
  renderRecent();
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
    windSpeed = data.wind.speed;

    // Current weather
    document.getElementById("cityName").textContent = `${data.name}, ${data.sys.country}`;
    document.getElementById("description").textContent = data.weather[0].description;
    document.getElementById("temp").textContent = `${Math.round(data.main.temp)}${unitSymbol}`;
    document.getElementById("humidity").textContent = data.main.humidity;
    document.getElementById("wind").textContent = data.wind.speed;
    document.getElementById("feelsLike").textContent = `${Math.round(data.main.feels_like)}${unitSymbol}`;
    document.getElementById("weatherIcon").src =
      `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
    document.getElementById("weatherResult").classList.remove("hidden");

    // Trigger canvas scene
    const condition = data.weather[0].main;
    initScene(condition);
    saveRecent(data.name);

    // Alerts
    if (data.alerts && data.alerts.length > 0) {
      const banner = document.getElementById("alertBanner");
      banner.textContent = `⚠️ Alert: ${data.alerts[0].event} — ${data.alerts[0].description}`;
      banner.classList.remove("hidden");
    }

    // Anomaly detection
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

    if (d1.cod !== 200 || d2.cod !== 200) { errDiv.classList.remove("hidden"); return; }

    function buildCard(d) {
      return `
        <h4>${d.name}, ${d.sys.country}</h4>
        <img src="https://openweathermap.org/img/wn/${d.weather[0].icon}.png" alt="" style="width:40px" />
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
// ── ANOMALY DETECTION ────────────────────────────────────
// ═══════════════════════════════════════════════════════════
async function runAnomalyDetection(weatherData) {
  const section = document.getElementById("anomalySection");
  const badge   = document.getElementById("anomalyBadge");
  const detail  = document.getElementById("anomalyDetail");
  section.classList.add("hidden");

  try {
    const lat = weatherData.coord.lat;
    const lon = weatherData.coord.lon;
    const currentTemp = weatherData.main.temp;

    const today = new Date();
    const past  = new Date();
    past.setDate(today.getDate() - 30);
    const fmt = d => d.toISOString().split("T")[0];

    const histUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${fmt(past)}&end_date=${fmt(today)}&daily=temperature_2m_mean,precipitation_sum&timezone=auto`;
    const histRes  = await fetch(histUrl);
    const histData = await histRes.json();

    if (!histData.daily || !histData.daily.temperature_2m_mean) return;

    const temps   = histData.daily.temperature_2m_mean.filter(t => t !== null);
    const precips = histData.daily.precipitation_sum.filter(p => p !== null);

    const mean = temps.reduce((a, b) => a + b, 0) / temps.length;
    const std  = Math.sqrt(temps.map(t => (t - mean) ** 2).reduce((a, b) => a + b, 0) / temps.length);

    let currentTempC = currentTemp;
    if (unit === "imperial") currentTempC = (currentTemp - 32) * 5 / 9;

    const zScore = std > 0 ? (currentTempC - mean) / std : 0;
    const avgPrecip   = precips.reduce((a, b) => a + b, 0) / precips.length;
    const todayPrecip = precips[precips.length - 1] || 0;

    let anomalyType = null, anomalyMsg = "", anomalyClass = "";

    if (zScore >= 2) {
      anomalyType = "hot";
      anomalyMsg = `🔥 It's much hotter than usual today! At ${Math.round(currentTempC)}°C, it's about ${Math.round(Math.abs(currentTempC - mean))}° warmer than the typical ${Math.round(mean)}°C you'd expect this time of year. Stay hydrated and avoid the sun during peak hours.`;
      anomalyClass = "anomaly-hot";
    } else if (zScore <= -2) {
      anomalyType = "cold";
      anomalyMsg = `🧊 It's much colder than usual today! At ${Math.round(currentTempC)}°C, it's about ${Math.round(Math.abs(currentTempC - mean))}° colder than the typical ${Math.round(mean)}°C for this time of year. Bundle up before heading out!`;
      anomalyClass = "anomaly-cold";
    } else if (todayPrecip > avgPrecip * 3 && todayPrecip > 5) {
      anomalyType = "wet";
      anomalyMsg = `🌧 Way more rain than usual today! ${Math.round(todayPrecip)}mm of rain has fallen — that's roughly ${Math.round(todayPrecip / Math.max(avgPrecip, 0.1))}× the normal daily amount. Carry an umbrella and watch for puddles!`;
      anomalyClass = "anomaly-wet";
    }

    if (anomalyType) {
      badge.textContent = anomalyType === "hot" ? "⚠️ Hotter than usual" :
                          anomalyType === "cold" ? "⚠️ Colder than usual" : "⚠️ More rain than usual";
      badge.className = `anomaly-badge ${anomalyClass}`;
      detail.textContent = anomalyMsg;
    } else {
      badge.textContent = "✓ Normal conditions";
      badge.className = "anomaly-badge anomaly-normal";
      detail.textContent = `Temperatures are normal for this time of year — around ${Math.round(mean)}°C on average over the past 30 days.`;
    }
    section.classList.remove("hidden");

  } catch (e) {
    console.warn("Anomaly detection failed:", e);
  }
}

// ─── Enter key support ────────────────────────────────────
document.getElementById("cityInput").addEventListener("keypress", e => {
  if (e.key === "Enter") getWeather();
});
document.getElementById("city1Input").addEventListener("keypress", e => {
  if (e.key === "Enter") compareCities();
});
document.getElementById("city2Input").addEventListener("keypress", e => {
  if (e.key === "Enter") compareCities();
});

// ─── Init ─────────────────────────────────────────────────
const savedTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
document.getElementById("darkBtn").textContent = savedTheme === "dark" ? "☀️ Light" : "🌙 Dark";
renderRecent();
initScene("default");