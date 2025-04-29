document.addEventListener('DOMContentLoaded', () => {
    const apiKey = "9cb2794cd1e350280b8d6efe7551b87b";

    // --- Set Copyright Year ---
    const copyrightYearSpan = document.getElementById('copyright-year');
    if (copyrightYearSpan) {
        copyrightYearSpan.textContent = new Date().getFullYear();
    }
    // --- End Copyright Year ---

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
    const rainSoonHours = 3; // How many hours ahead to check for rain (max depends on API)
    const rainProbabilityThreshold = 0.3; // Probability of Precipitation (POP) threshold (30%)

    // --- Core Functions ---

    function getUserLocation() {
        if (!navigator.geolocation) {
            handleError("Geolocation is not supported by your browser.");
            return;
        }

        // Don't show loading overlay if content is already visible (for background refresh)
        if (contentDiv.style.display !== 'flex') {
             loadingDiv.style.display = 'flex';
             contentDiv.style.display = 'none';
             errorDiv.style.display = 'none';
        } else {
             // Optionally show a subtle refresh indicator somewhere if needed
        }


        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                // Clear previous error message if location is now successful
                if (errorDiv.style.display === 'flex') {
                    errorDiv.style.display = 'none';
                    errorMessageSpan.textContent = '';
                }
                getWeatherData(latitude, longitude);
            },
            (error) => {
                // Avoid showing error if content is already displayed (maybe connection issue during refresh)
                if (contentDiv.style.display !== 'flex') {
                    handleError(`Geolocation error: ${error.message}`);
                } else {
                    console.warn(`Geolocation error during refresh: ${error.message}`);
                    // Optionally update 'last updated' with a warning?
                }
            }
        );
    }

    async function getWeatherData(lat, lon) {
        const forecastApiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        const currentApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

        try {
            // Update loading text only if it's the initial load
            if (loadingDiv.style.display === 'flex') {
                loadingDiv.querySelector('i').classList.add('fa-spin');
                loadingDiv.lastChild.textContent = ' Fetching latest weather data...';
            }

            const [currentResponse, forecastResponse] = await Promise.all([
                fetch(currentApiUrl),
                fetch(forecastApiUrl)
            ]);

            // Combine error checking
            if (!currentResponse.ok || !forecastResponse.ok) {
                let errorMessages = [];
                if (!currentResponse.ok) {
                    let msg = `Current Weather Error ${currentResponse.status}`;
                    try { msg += `: ${(await currentResponse.json()).message}`; } catch (e) {}
                    errorMessages.push(msg);
                }
                 if (!forecastResponse.ok) {
                    let msg = `Forecast Error ${forecastResponse.status}`;
                    try { msg += `: ${(await forecastResponse.json()).message}`; } catch (e) {}
                    errorMessages.push(msg);
                }
                throw new Error(errorMessages.join('; '));
            }

            const currentData = await currentResponse.json();
            const forecastData = await forecastResponse.json();

            processWeatherData(currentData, forecastData);

            // Ensure correct display state after successful fetch
            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'flex'; // Use flex as defined in CSS
            errorDiv.style.display = 'none';

        } catch (error) {
            console.error("Weather fetch error:", error);
            // Avoid showing full error overlay if content is already displayed
            if (contentDiv.style.display !== 'flex') {
                 handleError(error.message);
            } else {
                 console.warn(`Weather fetch error during refresh: ${error.message}`);
                 // Optionally update 'last updated' with an error/warning status
                 lastUpdatedSpan.textContent = `${new Date().toLocaleTimeString()} (Update failed)`;
            }
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
            <p><i class="fas fa-info-circle"></i> Condition: ${capitalizeFirstLetter(currentDesc)} <img src="https://openweathermap.org/img/wn/${currentIconCode}.png" alt="Weather icon"></p>
            <p><i class="fas fa-tint"></i> Humidity: ${humidity}%</p>
            <p><i class="fas fa-wind"></i> Wind: ${windSpeed.toFixed(1)} m/s</p>
        `;


        // 3. Analyze Forecast for Rain Prediction
        const now = new Date();
        const forecastList = forecastData.list;
        let isCurrentlyRaining = /rain|drizzle|thunderstorm/i.test(currentData.weather[0].main);
        let rainExpectedTime = null;
        let nextRainIntensity = "";

        const checkUntilTimestamp = now.getTime() / 1000 + rainSoonHours * 60 * 60;

        for (const forecast of forecastList) {
            const forecastTimestamp = forecast.dt;
            // Only check future forecasts within our window
            if (forecastTimestamp > now.getTime() / 1000 && forecastTimestamp <= checkUntilTimestamp) {
                 const pop = forecast.pop || 0;

                 const isRainyForecast = forecast.weather.some(w =>
                     /rain|drizzle|thunderstorm/i.test(w.main) ||
                     [500, 501, 502, 503, 504, 511, 520, 521, 522, 531,
                      300, 301, 302, 310, 311, 312, 313, 314, 321,
                      200, 201, 202, 210, 211, 212, 221, 230, 231, 232
                     ].includes(w.id)
                 );

                if (isRainyForecast && pop >= rainProbabilityThreshold) {
                    rainExpectedTime = new Date(forecastTimestamp * 1000);
                    // Determine intensity (basic)
                    if (forecast.rain && forecast.rain['3h']) {
                        const rainVol = forecast.rain['3h'];
                        if (rainVol < 1) nextRainIntensity = " (light)";
                        else if (rainVol < 5) nextRainIntensity = " (moderate)";
                        else nextRainIntensity = " (heavy)";
                    } else if (forecast.weather.some(w => /thunderstorm/i.test(w.main))) {
                         nextRainIntensity = " (possible thunderstorms)";
                    } else if (isRainyForecast) {
                         // Default to light if specific volume unknown but rain expected
                         nextRainIntensity = " (light)";
                    }
                    break; // Found the first significant rain event
                }
            }
             // Optimization: Stop checking if forecast time exceeds our window
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
        errorMessageSpan.textContent = `Error: ${message}. Please check console for details, ensure location is enabled, and API key is correct.`;
        body.classList.remove('state-clear', 'state-rain-soon', 'state-raining'); // Reset background
        body.style.background = ''; // Ensure default background applies if specific classes removed
    }

    // --- Helper Functions ---
    function capitalizeFirstLetter(string) {
        if (!string) return '';
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
