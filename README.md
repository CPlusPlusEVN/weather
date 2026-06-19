# Current Conditions — a small weather app

A single-page weather lookup. The browser calls our own `/api/weather` endpoint;
a Netlify Function calls WeatherAPI.com server-side so the **API key is never
exposed in the browser**.

```
Browser  ──►  /api/weather?city=Lisbon  ──►  Netlify Function  ──►  WeatherAPI.com
(no key)         (rewrite, status 200)        (holds WEATHERAPI_KEY)
```

## A note on the spec

The brief mixed two providers. The concrete details (endpoint `current.json`,
fields `temp_c`, `condition.text`, `condition.icon`, `humidity`, `wind_kph`) are
all **WeatherAPI.com**, so this is built against WeatherAPI.com. The stray
references to OpenWeatherMap / `OPENWEATHER_API_KEY` looked like leftover
boilerplate and would not parse the response shape described.

The env var is named **`WEATHERAPI_KEY`** to match the actual provider. If you
genuinely need `OPENWEATHER_API_KEY`, it's a one-line change in two places:
`netlify/functions/weather.js` and `.env.example`.

Also worth knowing: WeatherAPI.com returns **HTTP 400 with `error.code 1006`**
for an unknown city (not a 404 like OpenWeatherMap). The function translates
that into a clean **404** from our own endpoint, so "city not found" is handled
exactly as intended.

## Files

```
weather-app/
├── public/
│   └── index.html              # the SPA (vanilla JS, no build step)
├── netlify/
│   └── functions/
│       └── weather.js          # serverless proxy; holds the key
├── netlify.toml                # publish dir + /api/weather rewrite
├── .env.example                # documents WEATHERAPI_KEY
└── .gitignore
```

## Run it locally

1. Get a free key at <https://www.weatherapi.com/>.
2. Create your env file:
   ```bash
   cp .env.example .env
   # then edit .env and paste your real key
   ```
3. Install the Netlify CLI (gives you the function runtime + the `/api` rewrite
   locally — a plain static server will NOT run the function):
   ```bash
   npm install -g netlify-cli
   ```
4. Start it:
   ```bash
   netlify dev
   ```
   `netlify dev` reads `.env` automatically and serves the site (usually at
   <http://localhost:8888>) with `/api/weather` wired to the function.

> Tip: hit the function directly to debug —
> `http://localhost:8888/api/weather?city=Lisbon`.

## Deploy to Netlify

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
   The `netlify.toml` already sets the publish dir and functions dir, so no
   build command is needed.
3. Set the key as an environment variable:
   **Site configuration → Environment variables → Add a variable**
   - Key: `WEATHERAPI_KEY`
   - Value: your real key
4. Deploy. (Or from the CLI: `netlify deploy --prod`.)

The `.env` file stays local and is gitignored — production reads the key from
Netlify's environment instead.

## Behavior covered

- **Empty input** → "Type a city name first." (checked client- and server-side)
- **City not found** → friendly message, surfaced as a 404 from `/api/weather`
- **Network / upstream failure** → "Can't reach the server…" / 502 from the API
- **Missing key on the server** → generic 500, with the real reason in the logs
- **Loading state** → the button shows "Checking…" and disables while fetching
