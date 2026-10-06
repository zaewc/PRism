# Evaluation and validation boundaries

The delivery includes 39 unit tests, nine service integration tests and ten browser tests, plus seven golden cases. Integration uses real PostgreSQL/Redis and an HTTP OTLP collector. GitHub/TypeSafe contract doubles do not make external calls. Test discovery is scoped to repository test directories, excluding package-store copies.

## Golden replay

Cases exercise documentation SAFE, critical authentication BLOCK, authentication with a related changed assertion SAFE under an explicit deterministic-only policy, public API REVIEW, credential BLOCK, absent CI REVIEW and deleted public module REVIEW. The fixture's `failureMode.judge=open` is labeled; production defaults to REVIEW when Jev is unavailable. A mock judge always requires REVIEW even under fail-open policy.

`pnpm evaluate` reports multiclass accuracy and binary BLOCK precision, recall, F1, false-positive rate and false-negative rate. False SAFE/false BLOCK and undefined rates are tested. Seven matching synthetic labels are a regression check, not a generalization claim or live AI accuracy measure.

## Risk and calibration

Eight category scores and overall 0–100 are heuristic indices, not defect-free merge probabilities. Jev can elevate risk, never remove deterministic blockers. The adapter preserves Choice distributions/confidence, Score distributions/legends/confidence, Noul true/false probability, actual/pinned models, prompt version, hashes and timestamp. Noul has no separate confidence field; corroboration uses classification confidence and strong evidence. Invalid distributions become provider failure.

`pnpm prism calibrate observations.json` accepts `{ "risk": 42, "unsafe": false }` observations. Empirical safety rates are reported per 20-point bucket only at 30+ samples, with Wilson intervals; fewer samples yield null estimates. Labels must reflect observed outcomes or reviewed feedback, not model predictions copied into expected labels. Automatic training and incident/revert inference are deferred.

## Reproducibility and limits

Results retain SHA, configuration/analyzer versions, evidence, contributions, limitations and judgment metadata. Publication retries reuse results. AST cache keys include repository/SHA/configuration/analyzer/source fingerprints; structures omit source bodies/literal arguments and expire after seven days.

Collection defaults to at most 100 JS/TS files and 200 KB per source. Truncation, unsupported languages, missing textual source diffs and configured provider failure remain visible. PR AST comparison uses merge-base source; the target base SHA remains a freshness guard.

Related test detection uses changed assertions, imports and colocated names. It does not establish executed coverage or function-level behavior. Whole-program dataflow/types, non-JS/TS parsers, coverage artifacts and an external scanner runner are not implemented. SARIF is an interchange boundary. Commit snapshots and explicit outcomes/feedback are stored; automatic historical risk learning is deferred.

The monorepo and Linux container build pass. Non-root smoke checks verify runtime App slug, demo rendering, CLI startup and mutation rejection. The [live fixture record](live-acceptance.md) now verifies scoped installation authentication, signed deliveries, real Check Run annotations and operator APIs. No production deployment, successful Jev inference or enforced ruleset is claimed. Complete the remaining [live acceptance](github-app-setup.md) checks before production acceptance.
