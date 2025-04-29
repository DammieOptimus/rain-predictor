document.addEventListener('DOMContentLoaded', () => {
    const apiKey = "9cb2794cd1e350280b8d6efe7551b87b"; // <-- IMPORTANT: REPLACE THIS!

    // DOM Elements
    const loadingDiv = document.getElementById('loading');
    const contentDiv = document.getElementById('content');
    const errorDiv = document.getElementById('error');
    const errorMessageSpan = document.getElementById('error-message');

    const locationSpan = document.querySelector('#location span');
    const statusH2 = document.querySelector('#status h2');
    const forecastDiv = document.getElementById('forecast');
    const currentWeatherDiv = document.getElementById('current-weather');
    const lastUpdatedSpan = document.querySelector('#last-updated span');
    const weatherCard = document.getElementById('weather-card');
    const body = document.body;

    // Configuration
    const refreshIntervalMinutes = 15; // How often to check for new weather data
    const rainSoonHours = 3; // How many hours ahead to check for rain
    const rainProbabilityThreshold = 0.3; // Probability of Precipitation (POP) threshold (30%)

    // --- Core Functions ---

    function getUserLocation() {
        if (!navigator.geolocation) {
            handleError("Geolocation is not supported by your browser.");
            return;
        }

        loadingDiv.style.display = 'flex';
        contentDiv.style.display = 'none';
        errorDiv.style.display = 'none';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                getWeatherData(latitude, longitude);
            },
            (error) => {
                handleError(`Geolocation error: ${error.message}`);
                // Maybe fallback to a default location or ask user to input
            }
        );
    }

    async function getWeatherData(lat, lon) {
        // Use One Call API 3.0 (requires subscription usually, but free tier often includes hourly)
        // Or use the 5 day / 3 hour forecast API which is free
        // Let's use the 5 day / 3 hour forecast for broader free tier compatibility
        const forecastApiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        // Also fetch current weather for immediate status
        const currentApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

        try {
            loadingDiv.style.display = 'flex'; // Show loading indicator during fetch
            loadingDiv.querySelector('i').classList.add('fa-spin'); // Ensure spinner is spinning
            loadingDiv.lastChild.textContent = ' Fetching latest weather data...';

            const [currentResponse, forecastResponse] = await Promise.all([
                fetch(currentApiUrl),
                fetch(forecastApiUrl)
            ]);

            if (!currentResponse.ok || !forecastResponse.ok) {
                // Try to get error details from the response body
                let currentErrorMsg = `HTTP error ${currentResponse.status}`;
                let forecastErrorMsg = `HTTP error ${forecastResponse.status}`;
                try {
                    if (!currentResponse.ok) currentErrorMsg += `: ${(await currentResponse.json()).message}`;
                    if (!forecastResponse.ok) forecastErrorMsg += `: ${(await forecastResponse.json()).message}`;
                } catch (e) { /* ignore json parsing error */ }

                throw new Error(`Failed to fetch data. Current: ${currentErrorMsg}. Forecast: ${forecastErrorMsg}`);
            }

            const currentData = await currentResponse.json();
            const forecastData = await forecastResponse.json();

            processWeatherData(currentData, forecastData);

            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'flex'; // Use flex as defined in CSS
            errorDiv.style.display = 'none';

        } catch (error) {
            console.error("Weather fetch error:", error);
            handleError(error.message);
        }
    }

    function processWeatherData(currentData, forecastData) {
        // 1. Update Location Name
        locationSpan.textContent = `${currentData.name}, ${currentData.sys.country}`;

        // 2. Update Current Conditions Display
        const currentTemp = Math.round(currentData.main.temp);
        const currentDesc = currentData.weather[0].description;
        const currentIconCode = currentData.weather[0].icon;
        const feelsLike = Math.round(currentData.main.feels_like);
        const humidity = currentData.main.humidity;
        const windSpeed = currentData.wind.speed; // m/s

        currentWeatherDiv.innerHTML = `
            <p><i class="fas fa-thermometer-half"></i> Now: <strong>${currentTemp}°C</strong> (Feels like ${feelsLike}°C)</p>
            <p><i class="fas fa-info-circle"></i> Condition: ${capitalizeFirstLetter(currentDesc)} <img src="https://openweathermap.org/img/wn/${currentIconCode}.png" alt="Weather icon" style="vertical-align: middle; height: 20px;"></p>
            <p><i class="fas fa-tint"></i> Humidity: ${humidity}%</p>
            <p><i class="fas fa-wind"></i> Wind: ${windSpeed.toFixed(1)} m/s</p>
        `;


        // 3. Analyze Forecast for Rain Prediction
        const now = new Date();
        const forecastList = forecastData.list;
        let isCurrentlyRaining = /rain|drizzle|thunderstorm/i.test(currentData.weather[0].main); // Check current main condition
        let rainExpectedTime = null;
        let nextRainIntensity = "";

        // Check the next few forecast periods (OpenWeatherMap provides 3-hour intervals)
        const checkUntilTimestamp = now.getTime() / 1000 + rainSoonHours * 60 * 60;

        for (const forecast of forecastList) {
            const forecastTimestamp = forecast.dt;
            if (forecastTimestamp > now.getTime() / 1000 && forecastTimestamp <= checkUntilTimestamp) {
                // Check 'pop' (Probability of Precipitation) if available and significant
                const pop = forecast.pop || 0; // Probability of Precipitation (0 to 1)

                // Check weather condition codes or main description for rain types
                const isRainyForecast = forecast.weather.some(w =>
                    /rain|drizzle|thunderstorm/i.test(w.main) || // Check main category
                    [500, 501, 502, 503, 504, // Rain codes
                        511, // Freezing rain
                        520, 521, 522, 531, // Shower rain codes
                        300, 301, 302, 310, 311, 312, 313, 314, 321, // Drizzle codes
                        200, 201, 202, 210, 211, 212, 221, 230, 231, 232 // Thunderstorm codes
                    ].includes(w.id)
                );


                if (isRainyForecast && pop >= rainProbabilityThreshold) {
                    rainExpectedTime = new Date(forecastTimestamp * 1000);
                    // Try to get intensity info if available (might be in 'rain' object)
                    if (forecast.rain && forecast.rain['3h']) {
                        const rainVol = forecast.rain['3h']; // mm in the last 3 hours
                        if (rainVol < 1) nextRainIntensity = " (light)";
                        else if (rainVol < 5) nextRainIntensity = " (moderate)";
                        else nextRainIntensity = " (heavy)";
                    } else if (/thunderstorm/i.test(forecast.weather[0].main)) {
                        nextRainIntensity = " (possible thunderstorms)";
                    }
                    break; // Found the first upcoming rain event
                }
            }
            // Stop checking if we go too far into the future (beyond rainSoonHours)
            if (forecastTimestamp > checkUntilTimestamp) break;
        }

        // 4. Update UI Status and Background
        updateUI(isCurrentlyRaining, rainExpectedTime, nextRainIntensity);

        // 5. Update Last Updated Time
        lastUpdatedSpan.textContent = new Date().toLocaleTimeString();
    }

    function updateUI(isCurrentlyRaining, rainExpectedTime, intensity) {
        body.classList.remove('state-clear', 'state-rain-soon', 'state-raining');
        weatherCard.classList.remove('state-clear', 'state-rain-soon', 'state-raining');

        if (isCurrentlyRaining) {
            statusH2.innerHTML = `<i class="fas fa-cloud-showers-heavy"></i> It's Raining Now`;
            forecastDiv.innerHTML = `<p>Seek shelter or grab an umbrella!</p>`;
            body.classList.add('state-raining');
            weatherCard.classList.add('state-raining');
        } else if (rainExpectedTime) {
            const timeFormatter = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', hour12: true });
            const formattedTime = timeFormatter.format(rainExpectedTime);
            const dayFormatter = new Intl.DateTimeFormat('en', { weekday: 'short' });
            const formattedDay = isToday(rainExpectedTime) ? "today" : `on ${dayFormatter.format(rainExpectedTime)}`;

            statusH2.innerHTML = `<i class="fas fa-cloud-rain"></i> Rain Expected Soon!`;
            forecastDiv.innerHTML = `<p>Prepare for${intensity} rain around <strong>${formattedTime} ${formattedDay}</strong>.</p>`;
            body.classList.add('state-rain-soon');
            weatherCard.classList.add('state-rain-soon');
        } else {
            statusH2.innerHTML = `<i class="fas fa-sun"></i> No Rain Expected Soon`;
            forecastDiv.innerHTML = `<p>Looks clear for the next ${rainSoonHours} hours. Enjoy!</p>`;
            body.classList.add('state-clear');
            weatherCard.classList.add('state-clear');
        }
    }

    function handleError(message) {
        console.error("Handler Error:", message);
        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'none';
        errorDiv.style.display = 'flex'; // Use flex as defined in CSS
        errorMessageSpan.textContent = message;
        body.classList.remove('state-clear', 'state-rain-soon', 'state-raining'); // Reset background
    }

    // --- Helper Functions ---
    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    function isToday(someDate) {
        const today = new Date();
        return someDate.getDate() == today.getDate() &&
            someDate.getMonth() == today.getMonth() &&
            someDate.getFullYear() == today.getFullYear();
    }

    // --- Initialization & Auto-Refresh ---
    getUserLocation(); // Initial load

    // Set interval to automatically refresh weather data
    setInterval(getUserLocation, refreshIntervalMinutes * 60 * 1000);
});