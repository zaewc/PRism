# ADR 0001: Evidence-first, asynchronous merge governance

Date: 2026-10-04. Status: accepted for the local MVP; live acceptance pending credentials.

## Context

PRism must produce a required GitHub check, explain its decision, and remain conservative when data or judgment is unavailable. The initial repository is empty. GitHub App credentials, a Jev key and a live test installation are not yet available; the user requested local implementation and validation first.

## Decisions

1. Use a pnpm/Turborepo TypeScript monorepo. Domain ports depend on no GitHub SDK, database, HTTP framework or queue. Infrastructure implements those ports.
2. Authenticate as a GitHub App, with repository-scoped, short-lived installation tokens. Explicitly send REST API version `2026-03-10`. Never use a PAT for the service.
3. Verify HMAC-SHA256 over raw webhook bytes before parsing. Persist delivery deduplication, immutable job identity and a transactional outbox together in PostgreSQL. Relay the outbox to BullMQ; Redis queue acceptance alone is not durable webhook acceptance.
4. Analysis identity includes installation, repository, subject, base SHA, head SHA and configuration versions. Re-analysis adds an attempt identity. Resolve the current PR from GitHub before and after collection; superseded snapshots cannot produce a passing current check.
5. Deterministic analyzers build typed, located evidence. AST adapters and security providers are replaceable. Unsupported languages, unavailable providers, API truncation and absent coverage remain explicit analysis limitations.
6. Send bounded structured evidence to TypeSafe's `POST /v1/systemone`, never repository source, comments, README, secrets or patches. Pin `jev-1.13.0`; preserve every distribution, actual response model, input/request hashes and timestamps. Convert Score's rubric index into 0–100.
7. Policy is versioned validated configuration. Security, required CI and conflicts can block independently. AI cannot cancel deterministic blockers. Noul alone cannot block. Missing analysis/judge defaults to REVIEW; fail-open is explicit and audited.
8. Map SAFE to `success`, REVIEW to `action_required`, BLOCK to `failure`. REVIEW must not use `neutral` or `skipped`, which can satisfy required checks. Use `PRism` as a stable check name and bind rulesets to this App.
9. Use separate webhook and worker processes, immutable results and append-only audit rows. Retry publication without rewriting a result. Identify checks by external job ID to recover a crash between remote creation and persistence. Bound annotations to 50 in the MVP to avoid duplicate appended annotations on retries.
10. Use server-only credentials and an authenticated operator dashboard. Demo fixtures are explicitly labeled and isolated from installation data. The local dashboard does not substitute for live GitHub acceptance.
11. Pin TypeScript 6.0.3 for the supported Compiler API and lint toolchain. TypeScript 7.0.2's installed package does not provide the same compiler-library interface. Next.js 16.3.8 and React 19.3.0 are pinned, with stable React Compiler support verified by the production build.

## Consequences

PostgreSQL and Redis are required for the real pipeline. Queue delivery is at least once, with idempotent database effects and check publication; external calls cannot be made exactly once across a network crash. A persisted result is reused on publication retries. No untrusted repository code is executed.

The user requested one minimal commit per PR, followed by review, passing CI and merge. Changes are delivered to `zaewc/PRism` using that workflow. Production deployment, live required-check enforcement, calibration and additional parsers are reported separately from local verification.
