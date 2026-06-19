// netlify/functions/weather.js
//
// Server-side proxy for WeatherAPI.com. The browser calls /api/weather?city=...
// (mapped to this function in netlify.toml) and never sees the API key.
//
// Env var: WEATHERAPI_KEY  (set in Netlify dashboard or local .env)
//
// NOTE ON THE ENV VAR NAME: the original spec mentioned OPENWEATHER_API_KEY,
// but this app talks to WeatherAPI.com, not OpenWeatherMap. The name is kept
// accurate on purpose. If you must use OPENWEATHER_API_KEY, change the two
// references below and in .env.example / README — nothing else depends on it.

const UPSTREAM = "https://api.weatherapi.com/v1/current.json";

// JSON response helper. CORS is permissive because the function is meant to be
// hit from our own origin via the /api/weather redirect; tighten if needed.
function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(payload),
  };
}

exports.handler = async (event) => {
  // Only GET is meaningful here.
  if (event.httpMethod && event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed." });
  }

  const params = event.queryStringParameters || {};
  const city = (params.city || "").trim();

  // Empty input — friendly, actionable.
  if (!city) {
    return json(400, { error: "Please enter a city name." });
  }

  const key = process.env.WEATHERAPI_KEY;
  if (!key) {
    // Misconfiguration, not the user's fault. Don't leak which var is missing
    // to the client beyond a generic note; the detail is in the server logs.
    console.error("WEATHERAPI_KEY is not set in the environment.");
    return json(500, { error: "Weather service is not configured. Try again later." });
  }

  const url = `${UPSTREAM}?key=${encodeURIComponent(key)}&q=${encodeURIComponent(
    city
  )}&aqi=no`;

  let upstream;
  let data;
  try {
    upstream = await fetch(url);
    data = await upstream.json();
  } catch (err) {
    // DNS failure, timeout, connection reset, unparseable body, etc.
    console.error("Upstream request failed:", err);
    return json(502, {
      error: "Couldn't reach the weather service. Please try again in a moment.",
    });
  }

  if (!upstream.ok) {
    // WeatherAPI returns HTTP 400 with an error.code, NOT a 404, for unknown
    // cities. We translate to clean status codes for our own frontend.
    const code = data && data.error && data.error.code;

    if (code === 1006) {
      // "No matching location found." -> behave like a 404 for the client.
      return json(404, {
        error: "We couldn't find that city. Check the spelling and try again.",
      });
    }

    // 1002/2006/2007/2008 are key problems (missing/invalid/quota/disabled).
    if ([1002, 2006, 2007, 2008].includes(code)) {
      console.error("WeatherAPI auth/quota error:", data.error);
      return json(500, { error: "Weather service authentication failed." });
    }

    // Anything else — surface a generic message at the upstream's status.
    console.error("WeatherAPI error:", upstream.status, data && data.error);
    return json(upstream.status || 502, {
      error: "The weather service returned an error. Please try again.",
    });
  }

  // Success. Hand back only the fields the frontend needs, in a stable shape.
  const loc = data.location || {};
  const cur = data.current || {};
  const cond = cur.condition || {};

  return json(200, {
    city: loc.name,
    region: loc.region,
    country: loc.country,
    temp_c: cur.temp_c,
    temp_f: cur.temp_f,
    condition: cond.text,
    // WeatherAPI returns a protocol-relative URL (//cdn...). Make it absolute.
    icon: cond.icon ? `https:${cond.icon}` : null,
    humidity: cur.humidity,
    wind_kph: cur.wind_kph,
  });
};
