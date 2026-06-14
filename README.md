# Kontor

A personal finance tracker and retirement planner for German tax rules (2026),
built as an installable, offline-capable PWA. No backend, no accounts, no
tracking — all of your data stays on your device.

**Live:** https://thenexus-ai.github.io/kontor/

---

## What it does

Three tabs:

- **Track** — monthly income and expenses, grouped into categories, with
  per-month activity toggles (e.g. insurance paid once a year, gym 8 months).
  Auto-scales monthly ↔ yearly.
- **Plan** — an investment/securities tracker: contributions ledger, current
  value, gain, and money-weighted (IRR) return.
- **Sandbox** — a retirement projection. Slider-driven assumptions (returns,
  inflation, fees, contributions, equity glide-path) feed a month-by-month
  accumulation + decumulation model, with after-tax figures using the German
  Abgeltungsteuer, equity *Teilfreistellung*, and *Sparer-Pauschbetrag*.

**FinHub** (the ⓘ button) is an in-app reference covering German income tax,
investment tax, ETF basics, and deductions — content lives in self-registering
modules under `sources/`.

> All figures are general information, not tax/financial advice. They reflect
> German rules for 2026 and change over time.

## Privacy

- **No third-party requests at runtime.** Fonts are self-hosted; there are no
  CDNs, analytics, or trackers.
- **Data never leaves the device.** It is stored locally (IndexedDB + a
  localStorage cache) and can be exported/imported as JSON.
- On-device data is **not encrypted at rest** — your device lock screen is the
  guard. (An optional passcode / biometric lock is a planned feature.)

## Install (phone or laptop)

Open the live URL, then:

- **iPhone / Safari:** Share → *Add to Home Screen*
- **Android / Chrome:** *Install app* prompt, or ⋮ → *Install app*
- **Desktop Chrome/Edge:** the install icon in the address bar

It launches full-screen, works offline, and persists your data on-device.

## Run locally

It's a static site — no build step required.

```sh
# any static server works; the app entry is finance_dashboard.html
python3 -m http.server 8099
# then open http://localhost:8099/
```

Service workers require HTTPS or `localhost`, so `localhost` is fine for
testing the installable/offline behaviour.

## Development

Requires [Node.js](https://nodejs.org) 20+ (for the test runner only — the app
itself ships no dependencies).

```sh
npm install        # dev-only: jsdom + fake-indexeddb (for tests)
npm test           # run the unit tests (node --test)
npm run check      # syntax-check the JS (node --check)
```

The tests load the real browser scripts into a jsdom + fake-indexeddb context
and exercise the storage layer and the pure calculation engine (tax,
projection, expense aggregation, formatting, sanitisation). See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for how the harness works.

## Build tools

Both are pure-Python, dependency-free, and only needed when assets change:

```sh
python3 tools/gen_logo.py     # regenerate the Kontor logo + PWA icon set
python3 tools/fetch_fonts.py   # re-download + self-host the web fonts
```

After changing any shipped HTML/CSS/JS, **bump the `CACHE` version in `sw.js`**
so installed clients pick up the update (the service worker is cache-first).

## Deploy

GitHub Pages serves the repository root from the `master` branch. Because the
app uses a dot-free `sources/` directory and a `.nojekyll` file, Pages serves
everything verbatim. Changing the Pages *source branch* via the API does **not**
trigger a rebuild — push a commit or POST to the builds endpoint.

## Project layout

```
finance_dashboard.html   app shell + all CSS (single file)
finance_dashboard.js     app logic: tabs, calc engine, rendering, drag layout
storage.js               FDStore — local-first persistence (localStorage + IDB)
sources/finhub-*.js      FinHub reference content (self-registering modules)
fonts.css, fonts/        self-hosted web fonts (no third-party requests)
manifest.webmanifest     PWA manifest
sw.js                    service worker (offline app shell, versioned cache)
index.html               redirect to finance_dashboard.html
icons/                   PWA icons
tools/                   gen_icons.py, fetch_fonts.py (asset generators)
test/                    Node test suite (jsdom + fake-indexeddb)
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for a deeper tour.
