document.addEventListener('DOMContentLoaded', () => {
    const apiKey = "9cb2794cd1e350280b8d6efe7551b87b";

    // Set Copyright Year
    const copyrightYearSpan = document.getElementById('copyright-year');
    if (copyrightYearSpan) { copyrightYearSpan.textContent = new Date().getFullYear(); }

    // DOM Elements
    const weatherCard = document.getElementById('weather-card');
    const loadingDiv = document.getElementById('loading');
    const contentDiv = document.getElementById('content');
    const errorDiv = document.getElementById('error');
    const errorMessageSpan = document.getElementById('error-message');

    const locationSpan = document.querySelector('#location span');
    const statusH2 = document.querySelector('#status h2');
    const forecastDiv = document.getElementById('forecast');
    const currentWeatherDiv = document.getElementById('current-weather');
    const lastUpdatedSpan = document.querySelector('#last-updated span');
    const body = document.body;

    // Configuration
    const refreshIntervalMinutes = 15;
    const rainSoonHours = 3;
    const rainProbabilityThreshold = 0.3;

    // --- State Display Function ---
    function showState(state) { // 'loading', 'content', 'error'
        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'none';
        errorDiv.style.display = 'none';

        if (state === 'loading') loadingDiv.style.display = 'flex';
        else if (state === 'content') contentDiv.style.display = 'flex';
        else if (state === 'error') errorDiv.style.display = 'flex';
    }


    // --- Core Functions ---
    function getUserLocation() {
        if (!navigator.geolocation) {
            handleError("Geolocation is not supported by your browser.");
            return;
        }

        // Show loading only if content isn't already visible OR if error is visible
        if (contentDiv.style.display !== 'flex' || errorDiv.style.display === 'flex') {
             showState('loading');
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                 if (errorDiv.style.display === 'flex') { // Clear previous error message visually
                    errorMessageSpan.textContent = '';
                 }
                getWeatherData(latitude, longitude);
            },
            (error) => {
                if (contentDiv.style.display !== 'flex') { // Only show full error on initial load fail
                    handleError(`Geolocation error: ${error.message}`);
                } else {
                    console.warn(`Geolocation error during refresh: ${error.message}`);
                    // Optionally update 'last updated' to show refresh failed state without blocking UI
                     lastUpdatedSpan.textContent = `${new Date().toLocaleTimeString()} (Loc fail)`;
                }
            }
        );
    }

    async function getWeatherData(lat, lon) {
        const forecastApiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        const currentApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

        try {
            // Ensure loading indicator text is updated if visible
            if (loadingDiv.style.display === 'flex') {
                loadingDiv.querySelector('i').classList.add('fa-spin');
                // Text already shortened in HTML
            }

            const [currentResponse, forecastResponse] = await Promise.all([
                fetch(currentApiUrl),
                fetch(forecastApiUrl)
            ]);

            if (!currentResponse.ok || !forecastResponse.ok) {
                let errorMessages = [];
                if (!currentResponse.ok) errorMessages.push(`Current: ${currentResponse.status}`);
                if (!forecastResponse.ok) errorMessages.push(`Forecast: ${forecastResponse.status}`);
                 try { // Try to get message body if possible
                    if (!currentResponse.ok) errorMessages[0] += `: ${(await currentResponse.json()).message}`;
                     if (!forecastResponse.ok && errorMessages.length > (currentResponse.ok ? 0:1) ) errorMessages[errorMessages.length-1] += `: ${(await forecastResponse.json()).message}`;
                 } catch (e) {}
                throw new Error(errorMessages.join('; '));
            }

            const currentData = await currentResponse.json();
            const forecastData = await forecastResponse.json();

            processWeatherData(currentData, forecastData);

            showState('content'); // Show content on success

        } catch (error) {
            console.error("Weather fetch error:", error);
            if (contentDiv.style.display !== 'flex') { // Only show full error on initial load fail
                 handleError(`Weather data error: ${error.message}`);
            } else {
                 console.warn(`Weather fetch error during refresh: ${error.message}`);
                 lastUpdatedSpan.textContent = `${new Date().toLocaleTimeString()} (API fail)`;
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
        const windSpeed = currentData.wind.speed;

        currentWeatherDiv.innerHTML = `
            <p><i class="fas fa-thermometer-half"></i> Now: <strong>${currentTemp}°C</strong> (Feels ${feelsLike}°C)</p> <!-- Shortened -->
            <p><i class="fas fa-info-circle"></i> ${capitalizeFirstLetter(currentDesc)} <img src="https://openweathermap.org/img/wn/${currentIconCode}.png" alt=""></p> <!-- Shortened -->
            <p><i class="fas fa-tint"></i> Humidity: ${humidity}%</p>
            <p><i class="fas fa-wind"></i> Wind: ${windSpeed.toFixed(1)} m/s</p>
        `;

        // 3. Analyze Forecast for Rain Prediction (Logic remains the same)
        const now = new Date();
        const forecastList = forecastData.list;
        let isCurrentlyRaining = /rain|drizzle|thunderstorm/i.test(currentData.weather[0].main);
        let rainExpectedTime = null;
        let nextRainIntensity = "";
        const checkUntilTimestamp = now.getTime() / 1000 + rainSoonHours * 60 * 60;

        for (const forecast of forecastList) {
            const forecastTimestamp = forecast.dt;
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
                    if (forecast.rain && forecast.rain['3h']) {
                        const rainVol = forecast.rain['3h'];
                        if (rainVol < 1) nextRainIntensity = " (light)";
                        else if (rainVol < 5) nextRainIntensity = " (moderate)";
                        else nextRainIntensity = " (heavy)";
                    } else if (forecast.weather.some(w => /thunderstorm/i.test(w.main))) {
                         nextRainIntensity = " (storms)"; // Shortened
                    } else if (isRainyForecast) {
                         nextRainIntensity = " (light)";
                    }
                    break;
                }
            }
             if (forecastTimestamp > checkUntilTimestamp) break;
        }

        // 4. Update UI Status and Background
        updateUI(isCurrentlyRaining, rainExpectedTime, nextRainIntensity);

        // 5. Update Last Updated Time
        lastUpdatedSpan.textContent = `Updated: ${new Date().toLocaleTimeString()}`; // Shortened
    }

    function updateUI(isCurrentlyRaining, rainExpectedTime, intensity) {
         body.className = ''; // Clear all body classes first
         weatherCard.classList.remove('state-clear', 'state-rain-soon', 'state-raining'); // Clear card state

        if (isCurrentlyRaining) {
            statusH2.innerHTML = `<i class="fas fa-cloud-showers-heavy"></i> Raining Now`; // Shortened
            forecastDiv.innerHTML = `<p>Grab an umbrella!</p>`; // Shortened
            body.classList.add('state-raining');
            weatherCard.classList.add('state-raining');
        } else if (rainExpectedTime) {
            const timeFormatter = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', hour12: false }); // Use 24hr maybe?
            const formattedTime = timeFormatter.format(rainExpectedTime);
            const dayFormatter = new Intl.DateTimeFormat('en', { weekday: 'short' });
            const formattedDay = isToday(rainExpectedTime) ? "" : ` ${dayFormatter.format(rainExpectedTime)}`; // Show day only if not today

            statusH2.innerHTML = `<i class="fas fa-cloud-rain"></i> Rain Expected Soon!`;
            forecastDiv.innerHTML = `<p>Expect${intensity} rain ~<strong>${formattedTime}${formattedDay}</strong>.</p>`; // Shortened
            body.classList.add('state-rain-soon');
             weatherCard.classList.add('state-rain-soon');
        } else {
            statusH2.innerHTML = `<i class="fas fa-sun"></i> No Rain Expected`; // Shortened
            forecastDiv.innerHTML = `<p>Clear for the next ${rainSoonHours} hours.</p>`; // Shortened
            body.classList.add('state-clear');
            weatherCard.classList.add('state-clear');
        }
    }

    function handleError(message) {
        console.error("Handler Error:", message);
        errorMessageSpan.textContent = `Error: ${message}`; // Display error message
        showState('error'); // Show error view
        body.className = ''; // Reset body classes/background
        body.style.background = ''; // Ensure default background
    }

    // --- Helper Functions ---
    function capitalizeFirstLetter(string) { /* ... same as before ... */
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
     }
    function isToday(someDate) { /* ... same as before ... */
        const today = new Date();
        return someDate.getDate() == today.getDate() &&
            someDate.getMonth() == today.getMonth() &&
            someDate.getFullYear() == today.getFullYear();
    }

    // --- Initialization & Auto-Refresh ---
    getUserLocation(); // Initial load
    setInterval(getUserLocation, refreshIntervalMinutes * 60 * 1000);
});
