# Overnight run — summary

Branch: `night/tests-and-docs` (off `master`). **Nothing was pushed, merged, or
deployed** — `master` and the live site are untouched. Review, then merge if you
like what you see.

## What got done

**Phase 1 — calc-engine test suite (40 tests, all green)**
| File | Covers |
|------|--------|
| `test/_loadApp.mjs` | harness: loads the real browser scripts into jsdom+fake-indexeddb via a single `vm` script so cross-file bindings resolve |
| `test/calc-tax.test.mjs` | `applyTax`, `effRate` (Teilfreistellung, Sparer-Pauschbetrag, combined/negative gains) |
| `test/calc-projection.test.mjs` | `computeModel` (month counts, pot conservation, contributions, growth, equity glide, sustainable withdrawal, step-up) |
| `test/calc-expenses.test.mjs` | `monthlyRate`/`activeCount`/`annualActual`/`annualFull`, `parseNum` (de-DE), `eur` |
| `test/calc-securities.test.mjs` | `sanitizeSecurities` normalisation |

(plus the pre-existing `test/storage.test.mjs` — 40 total.)

**Phase 2 — docs**
- `README.md` — what it is, install, run, develop, build tools, deploy.
- `ARCHITECTURE.md` — file/load order, tabs, calc engine, storage, PWA, fonts,
  mobile layout, test harness.

## Findings
See `FINDINGS.md`. **No correctness bugs.** One minor robustness note:
`sanitizeSecurities` validates `YYYY-MM` shape but not the month *range*
(e.g. `"2026-13"` passes). Low priority, left untouched.

## Not done / next opportunities
- `moneyWeightedReturn()` (IRR) and other securities helpers are state/DOM-
  coupled, so they'd need a stateful fixture harness — skipped to avoid building
  something fragile unattended. Good next test target.
- Consider extracting the IRR NPV/bisection math into a pure helper to make it
  unit-testable.

## To run / review
```sh
npm test            # 40 passing
git log master..    # the night's commits
```

## Commits
`31470af` harness+tax · `6302b4a` projection · `d92e2ee` expenses/format ·
`7c2e956` securities · `5ff3655` docs · (+ this summary)
