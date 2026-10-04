# Official-source research

Checked 2026-10-04. These findings drive ADR 0001 and the implementation. This is a source map, not copied documentation.

| Source | Architecture consequence |
| --- | --- |
| [GitHub REST versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions) | Send `2026-03-10` explicitly. |
| [App installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) | JWT obtains scoped, expiring installation tokens; no PAT. |
| [Webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) | Compare SHA256 HMAC against raw bytes using constant-time comparison. |
| [Webhook events](https://docs.github.com/en/webhooks/webhook-events-and-payloads) | Handle installation lifecycle, PRs, check re-requests and merge-group subjects separately. |
| [Check runs](https://docs.github.com/en/rest/checks/runs) | Stable name, external ID, details URL; maximum 50 annotations per request; repeated updates append annotations. |
| [Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) | Configure required `PRism` check and expected App source. |
| [Merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue) | Analyze synthetic `merge_group` SHA, not a constituent PR SHA. |
| [Actions events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) | Dogfooding CI subscribes to `merge_group` as well as `pull_request`. |
| [Dependency review](https://docs.github.com/en/rest/dependency-graph/dependency-review) | Contents-read provider consumes GitHub vulnerability results; inaccessible provider is not a clean scan. |
| [Code scanning](https://docs.github.com/en/rest/code-scanning/code-scanning) | Optional adapter requires code-scanning read permission, not security write. |
| [GraphQL](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql) | Keep provider port independent of REST; paginate connection cursors for future graph queries. MVP uses REST. |
| [TypeSafe API](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), [Score](https://docs.typesafe.ai/primitives/score) | Use official endpoint, pin model, validate answer types/distributions and normalize Score's 0–(levels−1) index. Noul has no separate confidence. |
| [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) | Parse JS/TS syntax without executing code. Semantic/security findings remain evidence rather than proof. |
| [Semgrep SARIF](https://docs.semgrep.dev/semgrep-appsec-platform/json-and-sarif) | Interoperate through SARIF instead of inventing a vulnerability database. |
| [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids) | Queue ID is a UUID without colons; durable deduplication remains in PostgreSQL after queue retention expires. |
| [OpenTelemetry Node](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) | Instrument pipeline stages; initialize SDK before application modules. |
| [Next.js React Compiler](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler) | Stable compiler support uses `reactCompiler: true` and its Babel plugin. |

Dependency versions are verified against the package registry and locked. Source fixtures, HTTP contract doubles and a real local database/queue integration suite provide local evidence; none is described as a live GitHub/Jev run.
