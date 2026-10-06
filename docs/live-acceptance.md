# Live fixture acceptance record

Date: 2026-10-06 (Asia/Seoul). Scope: an operator-selected private fixture repository, a real GitHub App installation, local PostgreSQL/Redis and a temporary HTTPS webhook tunnel. The fixture contains synthetic authentication code. This is partial live acceptance, not production acceptance or model-accuracy evidence.

Repository identifiers, credential values and temporary public URLs are omitted from this document. The operator database retains delivery GUIDs, immutable job/result IDs, commit SHAs, policy versions and remote Check Run IDs.

## Observed results

| Scenario | Observed result |
| --- | --- |
| App authentication and installation | App JWT authenticates; slug matches; installation token accesses the selected repository; required installation grants are present |
| Storage and startup | PostgreSQL/Redis connect; all 11 migration tables exist; webhook environment and DB readiness pass |
| Public webhook | HTTPS readiness returns 200; forged signatures return 401; actual PR deliveries receive 202 after persistence |
| Uncovered authentication change | Existing CI passes, but an authentication behavior change without a changed related assertion produces BLOCK and a completed PRism check with `failure`; three located annotations are published |
| Related assertion added | New SHA triggers a new analysis; quality CI passes; test-related blocker is removed; result is REVIEW solely because Jev returns 401 |
| Non-passing REVIEW | The current SHA has a completed PRism check with `action_required`, not `neutral` or `skipped` |
| Immutable history | Earlier BLOCK results remain stored alongside the new SHA's REVIEW results; superseded concurrent jobs are marked stale |
| GitHub redelivery | Re-requesting an actual analyzing delivery leaves one delivery record and one analysis job for its GUID |
| Operator UI and policy | Anonymous workspace API returns 401; authenticated reads and policy save return 200; required `quality` is bound to its observed GitHub Actions App; real database-backed BLOCK is visible without browser errors |
| Local secret isolation | Private key parses as RSA; local key/environment permissions are 0600; Git and recursive Docker exclusions protect secrets; a dummy-only Docker probe verifies exclusion |

The updated fixture PR remains unmerged while its current PRism result is REVIEW. The default judge failure policy has not been changed to fail-open to manufacture a passing result.

## Still pending

- **Successful Jev inference:** the provided credential reaches the official endpoint but receives `JEV_HTTP_401`. No live Choice/Score/Noul result, confidence or SAFE judgment is claimed.
- **Required-check enforcement:** the selected repository is private, and the current GitHub plan rejects the ruleset API with 403 requiring an eligible plan or public repository. A failed check alone does not establish that GitHub prevents merging. Visibility remains private until the operator explicitly chooses otherwise.
- **Merge queue:** the installation subscribes to `merge_queue_entry`, which is not `merge_group`. Correct subscription, synthetic-SHA CI and enforced queue behavior remain pending.
- **Other live failure scenarios:** timeout/rate-limit/invalid model responses, remote publication crash recovery, another App's same-named check, suspension/uninstall and a controlled commit arriving mid-analysis are covered by local contracts where applicable but are not claimed as completed live tests.
- **Production operation:** no durable deployment, permanent tunnel, production traffic, outcome calibration or additional language parser acceptance is claimed.

See the [setup checklist](github-app-setup.md) and [evaluation boundaries](evaluation.md). Successful local tests and a synthetic live fixture do not establish general AI judgment accuracy.
