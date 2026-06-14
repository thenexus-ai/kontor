# Kontor

A personal finance tracker and retirement planner for German tax rules (2026),
built as an installable, offline-capable PWA. No backend, no accounts, no
tracking — all of your data stays on your device.

**Live:** https://thenexus-ai.github.io/kontor/

## What it does

- **Track** — monthly income and expenses, grouped into categories, with
  per-month activity toggles. Auto-scales monthly ↔ yearly.
- **Plan** — an investment/securities tracker: contributions ledger, current
  value, gain, and money-weighted (IRR) return.
- **Sandbox** — a retirement projection. Slider-driven assumptions (returns,
  inflation, fees, contributions, equity glide-path) feed a month-by-month
  accumulation + decumulation model, with after-tax figures using the German
  Abgeltungsteuer, equity *Teilfreistellung*, and *Sparer-Pauschbetrag*.

**FinHub** (the ⓘ button) is an in-app reference covering German income tax,
investment tax, ETF basics, and deductions.

> All figures are general information, not tax/financial advice. They reflect
> German rules for 2026 and change over time.

## Privacy

- **No third-party requests at runtime.** Fonts are self-hosted; no CDNs,
  analytics, or trackers.
- **Data never leaves the device.** Stored locally (IndexedDB + a localStorage
  cache); can be exported/imported as JSON.
- On-device data is **not encrypted at rest** — your device lock screen is the
  guard. (An optional passcode / biometric lock is planned.)

## Install (phone or laptop)

Open the live URL, then:

- **iPhone / Safari:** Share → *Add to Home Screen*
- **Android / Chrome:** *Install app* prompt, or ⋮ → *Install app*
- **Desktop Chrome/Edge:** the install icon in the address bar

It launches full-screen, works offline, and persists your data on-device.

## Run locally

It's a static site — no build step, no dependencies.

```sh
# any static server works; the app entry is finance_dashboard.html
python3 -m http.server 8099
# then open http://localhost:8099/
```

Service workers require HTTPS or `localhost`, so `localhost` is fine for testing
the installable/offline behaviour.
