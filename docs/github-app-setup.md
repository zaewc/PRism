# GitHub App setup and live acceptance

This guide describes the implemented integration. It is not evidence of a live installation. No App private key or Jev credential was available during local verification.

## Register and deploy

Create a GitHub App with a public HTTPS webhook URL ending in `/api/github/webhooks`. Route it to the webhook process on port 3001. Choose a random signing secret of at least 24 characters. Store the downloaded RSA key outside Git and mount it read-only into the worker.

| Repository permission | Access | Purpose |
| --- | --- | --- |
| Metadata | Read | Repository identity |
| Contents | Read | Trees, blobs and dependency review |
| Pull requests | Read | Current SHA, files and mergeability |
| Checks | Write | Create and update the PRism Check Run |
| Commit statuses | Read | Legacy CI status contexts |
| Actions | Read | Workflow completion refresh events |
| Code scanning alerts | Read, optional | SHA-scoped alerts when enabled |

Subscribe to `pull_request`, `check_run`, `status`, `workflow_run` and `merge_group`. Installation creation, deletion, suspension and unsuspension are handled. Install on selected repositories. Repository-selection change synchronization is not implemented; token permissions remain the authorization boundary for removed repositories.

Configure `DATABASE_URL`, `REDIS_URL`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_PRIVATE_KEY_PATH`, `GITHUB_WEBHOOK_SECRET`, `JEV_API_KEY` and `APP_URL`. `APP_URL` must be the public dashboard origin: it supplies details links and validates browser writes behind a TLS proxy. Pin `JEV_MODEL=jev-1.13.0` unless intentionally evaluating another version. Enable `GITHUB_CODE_SCANNING=true` only with the corresponding permission and capability.

The worker obtains short-lived installation tokens scoped to the job's repository. The service does not accept a PAT. Tokens, raw webhook bodies, source bodies and private-key values are not persisted as analysis data or logged.

## Enforce governance

1. Open a test PR and verify the webhook delivery received HTTP 202 after database persistence.
2. Configure `/settings/policy` with actual CI check names. Prefer binding each required CI check to its App ID, discovered through the check-runs API for the test commit.
3. Create a branch ruleset requiring the stable check name **PRism**, selecting this App as its source. Require the branch to be up to date or use a merge queue, so a previously passing head is not accepted against a changed base without fresh analysis.
4. Confirm SAFE publishes `success`, REVIEW publishes `action_required`, and BLOCK publishes `failure`. Neutral or skipped conclusions must not represent REVIEW.
5. For a merge queue, subscribe CI workflows to `merge_group: checks_requested` and require their checks alongside PRism. The worker analyzes the synthetic merge-group SHA separately from constituent PRs.

Annotations are capped at 50 findings per job. The detail page contains complete persisted evidence. Re-analysis produces a new attempt instead of editing a historical result. Old head/base snapshots are canceled instead of publishing success; enqueue the current PR to analyze a new snapshot.

## Live acceptance record

All items remain pending credentials. Record delivery/job ID, SHA, Check Run ID, model version and links when completing them:

| Scenario | Required observation |
| --- | --- |
| Real PR opened | Signed delivery → persisted outbox → worker → Jev → completed Check Run |
| Authentication change without related tests | Deterministic BLOCK with located reasons; merge prevented |
| Supporting tests added | New SHA/analysis; previous result preserved; decision follows evidence |
| Missing/failing required CI | REVIEW or BLOCK remains non-passing |
| Jev timeout, 429 or invalid response | Explicit unavailable state and configured conservative decision |
| Forged delivery or duplicate retry | Signature rejected, or delivery/job deduplicated |
| Commit arrives during analysis | Old check canceled; no stale success on new SHA |
| Remote publication retry | Persisted judgment reused; remote check recovered by external job ID |
| Ruleset source binding | Another App's same-named check cannot satisfy PRism |
| Merge queue | Check and CI on synthetic SHA enforce the policy |
| App suspended/uninstalled | New jobs do not process as an active installation |

Local HTTP contract doubles test API mapping, not real App permissions, TypeSafe model compatibility or ruleset enforcement. Verify these boundaries before treating an installation as production accepted.
