# Overnight test-suite findings

Suspected bugs / surprises uncovered while writing tests for the calc engine.
Logged here for review rather than changing app logic unattended.

## Minor / robustness (not bugs, no action taken)

1. **`sanitizeSecurities` validates key *shape* but not month range.**
   The `ymOk` check is `/^\d{4}-\d{2}$/`, so keys like `"2026-13"` or
   `"2026-00"` pass and are kept in `ledger`/`values`/`notes`. Harmless in
   normal use (the UI only ever writes real months), but a corrupted or
   hand-edited import could carry an out-of-range month. Low priority —
   would only matter if such data reached a date-formatting path.
   _Tests assert the actual (current) behaviour, not the stricter one._

No correctness bugs found in the tested functions — the tax, projection,
expense-aggregation, formatting/parsing, and sanitisation logic all behave
as documented.
