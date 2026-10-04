import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  GitBranch,
  GitPullRequest,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from 'lucide-react';
import { RiskBadge, RiskRadar } from '@prism/ui';
import type { WorkspaceData } from '../shared/data';
import { latestSnapshots } from '../shared/data';
export function DecisionTable({ data }: { data: WorkspaceData }) {
  const rows = latestSnapshots(data.analyses);
  return (
    <div className="table-scroll">
      <table className="decision-table">
        <thead>
          <tr>
            <th>Pull request</th>
            <th>Repository</th>
            <th>Decision</th>
            <th>Risk</th>
            <th>Snapshot</th>
            <th aria-label="Open analysis" />
          </tr>
        </thead>
        <tbody>
          {rows.map((analysis) => (
            <tr key={analysis.id}>
              <td>
                <Link
                  className="pr-title"
                  href={`${data.demo ? '/demo' : ''}/analyses/${analysis.id}`}
                >
                  <GitPullRequest size={15} />
                  <div>
                    <strong>{analysis.title}</strong>
                    <span className="mono">#{analysis.job.pullRequestNumber ?? 'merge-group'}</span>
                  </div>
                </Link>
              </td>
              <td className="repo-cell mono">
                {analysis.job.owner}/{analysis.job.repo}
              </td>
              <td>
                <RiskBadge outcome={analysis.decision.outcome} />
              </td>
              <td>
                <div className="table-risk">
                  <span
                    className={`mono ${analysis.overall >= 75 ? 'red-text' : analysis.overall >= 50 ? 'amber-text' : ''}`}
                  >
                    {analysis.overall}
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${analysis.overall}%`,
                        background:
                          analysis.decision.outcome === 'BLOCK'
                            ? 'var(--red)'
                            : analysis.decision.outcome === 'REVIEW'
                              ? 'var(--amber)'
                              : 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
              </td>
              <td className="mono muted">{analysis.job.headSha.slice(0, 7)}</td>
              <td>
                <Link
                  href={`${data.demo ? '/demo' : ''}/analyses/${analysis.id}`}
                  aria-label={`Open analysis for PR ${analysis.job.pullRequestNumber}`}
                >
                  <ArrowUpRight size={15} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty-state">
          <GitPullRequest size={30} />
          <h3>Waiting for the first pull request</h3>
          <p>Install the GitHub App, configure the repository policy, then open a PR.</p>
          <Link href="/settings" className="button">
            Configure GitHub App <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
export function Dashboard({ data }: { data: WorkspaceData }) {
  const rows = latestSnapshots(data.analyses),
    blocked = rows.filter((a) => a.decision.outcome === 'BLOCK').length,
    review = rows.filter((a) => a.decision.outcome === 'REVIEW').length,
    safe = rows.filter((a) => a.decision.outcome === 'SAFE').length;
  const health = rows.length
    ? Math.round(rows.reduce((sum, a) => sum + 100 - a.overall, 0) / rows.length)
    : null;
  const focus = [...rows].sort((a, b) => b.overall - a.overall)[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MERGE GOVERNANCE</div>
          <h1>Repository health</h1>
          <p>Understand the change. Make the merge decision.</p>
        </div>
        <Link href="/repositories" className="button secondary">
          <GitBranch size={14} /> View repositories <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="summary-grid">
        <div className="summary-card health-card">
          <div className="summary-label">
            <ShieldCheck size={15} /> Health score <span className="mono">/ 100</span>
          </div>
          <div className="summary-number">
            {health ?? '—'}
            <span className="summary-sparkline">
              <svg viewBox="0 0 90 30" aria-hidden="true">
                <polyline
                  points={rows
                    .map(
                      (a, i) =>
                        `${(i / Math.max(1, rows.length - 1)) * 90},${30 - ((100 - a.overall) / 100) * 30}`,
                    )
                    .join(' ')}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
              </svg>
            </span>
          </div>
          <small>100 − mean analyzed risk</small>
        </div>
        <div className="summary-card">
          <div className="summary-label">
            <GitPullRequest size={15} /> Tracked PRs
          </div>
          <div className="summary-number">{rows.length}</div>
          <small>Most recent analyzed snapshots</small>
        </div>
        <div className="summary-card">
          <div className="summary-label red-text">
            <ShieldX size={15} /> Blocked
          </div>
          <div className="summary-number red-text">{blocked}</div>
          <small>Deterministic policy blockers</small>
        </div>
        <div className="summary-card">
          <div className="summary-label amber-text">
            <TriangleAlert size={15} /> Review required
          </div>
          <div className="summary-number amber-text">{review}</div>
          <small>Human attention needed</small>
        </div>
        <div className="summary-card">
          <div className="summary-label green-text">
            <Check size={15} /> Safe
          </div>
          <div className="summary-number green-text">{safe}</div>
          <small>Policy satisfied for that snapshot</small>
        </div>
      </div>
      <div className="overview-grid">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <h2>Risk distribution</h2>
            <span className="tag mono">{rows.length} snapshots</span>
          </div>
          <div className="distribution-chart">
            <div className="chart-y">
              <span>100</span>
              <span>75</span>
              <span>50</span>
              <span>25</span>
              <span>0</span>
            </div>
            <div className="chart-bars">
              {rows.map((a) => (
                <Link
                  key={a.id}
                  href={`${data.demo ? '/demo' : ''}/analyses/${a.id}`}
                  className="chart-column"
                  title={`PR #${a.job.pullRequestNumber}: risk ${a.overall}`}
                >
                  <div className="chart-column-track">
                    <div
                      style={{
                        height: `${Math.max(a.overall, 2)}%`,
                        background:
                          a.decision.outcome === 'BLOCK'
                            ? 'var(--red)'
                            : a.decision.outcome === 'REVIEW'
                              ? 'var(--amber)'
                              : 'var(--accent)',
                      }}
                    >
                      <span className="mono">{a.overall}</span>
                    </div>
                  </div>
                  <span className="mono">#{a.job.pullRequestNumber}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="chart-legend">
            <span>
              <i className="green" />
              Safe
            </span>
            <span>
              <i className="amber" />
              Review
            </span>
            <span>
              <i className="red" />
              Block
            </span>
          </div>
        </section>
        <section className="panel radar-panel">
          <div className="panel-heading">
            <h2>Highest-risk snapshot</h2>
            {focus && <span className="mono muted">#{focus.job.pullRequestNumber}</span>}
          </div>
          {focus ? (
            <RiskRadar scores={focus.scores} />
          ) : (
            <div className="empty-chart">No analyzed snapshots yet</div>
          )}
        </section>
        <section className="panel governance-panel">
          <div className="panel-heading">
            <h2>Governance status</h2>
            <ShieldCheck size={15} />
          </div>
          <div className="governance-count">
            <strong>{data.repositories.length}</strong>
            <span>repositories tracked</span>
          </div>
          <div className="governance-row">
            <span>Decision model</span>
            <span className="mono">Evidence + policy</span>
          </div>
          <div className="governance-row">
            <span>Default judge failure</span>
            <span className="tag">Review required</span>
          </div>
          <div className="governance-row">
            <span>Analysis history</span>
            <span className="mono">Immutable</span>
          </div>
          <p className="governance-note">
            Each decision is tied to a commit SHA and the policy version used to analyze it.
          </p>
          <Link href="/settings/policy" className="text-link">
            Manage merge policies <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <section className="panel recent-panel">
        <div className="panel-heading">
          <h2>
            Recent decisions <span className="count-tag">{rows.length}</span>
          </h2>
          <span className="small muted">
            <ArrowDownRight size={13} /> Commit snapshots
          </span>
        </div>
        <DecisionTable data={data} />
      </section>
    </>
  );
}
