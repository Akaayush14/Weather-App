const API_KEY = "YOUR_API_KEY"; 

async function getWeather() {
  const city = document.getElementById("cityInput").value.trim();
  const resultDiv = document.getElementById("weatherResult");
  const errorDiv = document.getElementById("errorMsg");

  if (!city) return;

  resultDiv.classList.add("hidden");
  errorDiv.classList.add("hidden");

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`
    );
    const data = await response.json();

    if (data.cod !== 200) {
      errorDiv.classList.remove("hidden");
      return;
    }

    document.getElementById("cityName").textContent = `${data.name}, ${data.sys.country}`;
    document.getElementById("description").textContent = data.weather[0].description;
    document.getElementById("temp").textContent = Math.round(data.main.temp);
    document.getElementById("humidity").textContent = data.main.humidity;
    document.getElementById("wind").textContent = data.wind.speed;
    document.getElementById("weatherIcon").src =
      `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;

    resultDiv.classList.remove("hidden");
  } catch (error) {
    errorDiv.classList.remove("hidden");
  }
}

document.getElementById("cityInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter") getWeather();
});