# Security and operations model

PRism is a self-hosted **single operator** service. One operator can access installed repository data. Organization membership/RBAC and OAuth sessions are deferred.

## Trust boundaries

| Boundary | Implemented control | Residual limit |
| --- | --- | --- |
| Internet → webhook | Raw-body HMAC, constant-time comparison, bounded body and rate limit | Terminate TLS and apply infrastructure limits |
| Webhook → queue | Transaction records delivery, job and outbox before 202 | External effects are at least once |
| Worker → GitHub | Scoped expiring token, bounded pagination, timeout, no redirects | Missing capabilities leave evidence incomplete |
| Repository → analyzer | Parse without execution, bounded files, SHA provenance | Syntax/call heuristics do not prove semantic correctness |
| Evidence → Jev | Allowlisted facts, no source/prose/paths, typed distributions | Judgment remains uncertain and needs corroboration |
| Model → policy | Cannot erase blockers; Noul alone cannot block; default REVIEW | Explicit fail-open is an operator decision, recorded in reasons |
| Browser → API | Authentication, constant-time digest, configured Origin, no-store and security headers | Use HTTPS; add identity/RBAC for multiple users |
| Analysis → storage/UI | Immutable results/audits/feedback, redacted excerpts, sanitized cache | Secret detection is bounded, not comprehensive DLP |

Demo mode is explicit and read-only. Production database failure does not activate fixtures. There is no automatic merge permission, write-to-source permission or untrusted code execution. Feedback does not rewrite a decision or authorize a merge. `allowIgnore` has no override handler in this MVP; keep it false.

## Processes and storage

Build with `pnpm build`. Start web with `pnpm --filter @prism/web start`, webhook with `pnpm --filter @prism/github-app start`, and worker with `pnpm --filter @prism/worker start`. Container commands can override the default web command. Runtime variables work without `.env`.

Keep PostgreSQL/Redis private, use durable backups and restricted credentials, and configure storage encryption and Redis authentication/TLS for the deployment. Mount the RSA key read-only into the worker only. Web reads integration configuration for status display but does not authenticate to GitHub. Use distinct environment sets per process.

Migration SQL is an idempotent bootstrap. Incremental production migrations, automated retention and key rotation orchestration are not implemented. Immutable rows reject updates/deletes; retention requires an administrative migration. Expired AST cache rows are ignored/refreshed; expired cache cleanup can be scheduled administratively.

Jobs capture installation/repository, subject, base/head SHA, configuration hash, analyzer version and attempt. BullMQ uses UUID IDs, bounded concurrency, five attempts and backoff honoring GitHub retry timing. Outbox leases recover relay failure. Publication retries reuse results; exactly one external request cannot be guaranteed across a crash.

PR freshness is checked before collection and immediately before publication. Strict up-to-date rules or merge queues cover base movement. Merge-group checks target synthetic SHAs. Dashboard entries remain explicitly labeled historical snapshots.

## Observability and recovery

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an HTTP OTLP collector base URL. Traces/metrics/logs export to `/v1/traces`, `/v1/metrics`, `/v1/logs`. Stages include collection, AST, analyzers, Jev, risk, policy and publication. Structured stdout uses identifiers and error codes without source or credential bodies. A collector integration test verifies all three exported signals.

Monitor outbox backlog, failed jobs, retries, provider failures, rate limits, stage latency and publication errors. Webhook liveness and DB readiness are separate. `worker_ready` means process initialization, not GitHub/Jev connectivity. A public worker health endpoint is not implemented.

Restart the relay/worker after interruption and inspect failed jobs/audits. Re-analysis creates an attempt. Policy changes affect new jobs while historical results retain captured policy. Do not mutate analysis JSON or bypass the App-bound ruleset to change a decision.
