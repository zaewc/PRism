'use client';
import { useState } from 'react';
import { ArrowUpRight, ChevronRight, GitBranch, FileCode2, Search } from 'lucide-react';
import { riskCategories } from '@prism/domain';
import type { Analysis, RiskCategory } from '@prism/domain';
export function EvidenceExplorer({ analysis }: { analysis: Analysis }) {
  const [category, setCategory] = useState<RiskCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(analysis.evidence[0]?.id ?? null);
  const evidence = analysis.evidence.filter(
    (e) =>
      (category === 'all' || e.category === category) &&
      `${e.code} ${e.message} ${e.location?.path ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const finding = evidence.find((e) => e.id === selected);
  const file = analysis.files.find((f) => f.path === finding?.location?.path);
  return (
    <section className="panel evidence-panel">
      <div className="panel-heading">
        <h2>
          <GitBranch size={16} /> Evidence graph{' '}
          <span className="count-tag">{analysis.evidence.length}</span>
        </h2>
        <span className="tag mono">SHA {analysis.job.headSha.slice(0, 7)}</span>
      </div>
      <div className="evidence-graph">
        <svg
          viewBox="0 0 800 210"
          role="img"
          aria-label="Interactive graph linking changed files, evidence, risk and merge decision"
        >
          <defs>
            <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="var(--border-strong)" />
            </marker>
          </defs>
          <rect
            x="20"
            y="75"
            width="140"
            height="60"
            rx="6"
            fill="var(--surface-2)"
            stroke="var(--border-strong)"
          />
          <text x="90" y="99" textAnchor="middle" fill="var(--text)" fontSize="12">
            Changed files
          </text>
          <text x="90" y="120" textAnchor="middle" fill="var(--muted)" fontSize="11">
            {analysis.files.length} files
          </text>
          {evidence.slice(0, 4).map((e, i) => (
            <g
              key={e.id}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${e.code}`}
              onClick={() => setSelected(e.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelected(e.id);
                }
              }}
              className="graph-node"
            >
              <path
                d={`M160,105 C210,105 210,${32 + i * 48} 260,${32 + i * 48}`}
                fill="none"
                stroke="var(--border-strong)"
                markerEnd="url(#arrow)"
              />
              <path
                d={`M440,${32 + i * 48} C490,${32 + i * 48} 490,105 540,105`}
                fill="none"
                stroke="var(--border-strong)"
                markerEnd="url(#arrow)"
              />
              <rect
                x="260"
                y={14 + i * 48}
                width="180"
                height="36"
                rx="5"
                fill={selected === e.id ? 'var(--accent-soft)' : 'var(--surface-2)'}
                stroke={selected === e.id ? 'var(--accent)' : 'var(--border-strong)'}
              />
              <circle
                cx="275"
                cy={32 + i * 48}
                r="3"
                fill={
                  e.severity === 'critical' || e.severity === 'high' ? 'var(--red)' : 'var(--amber)'
                }
              />
              <text x="290" y={36 + i * 48} fill="var(--text)" fontSize="9" fontFamily="monospace">
                {e.code.slice(0, 22)}
              </text>
            </g>
          ))}
          <rect
            x="540"
            y="75"
            width="100"
            height="60"
            rx="6"
            fill="var(--accent-soft)"
            stroke="var(--accent)"
          />
          <text x="590" y="99" textAnchor="middle" fill="var(--muted)" fontSize="10">
            OVERALL RISK
          </text>
          <text x="590" y="122" textAnchor="middle" fill="var(--accent)" fontSize="20">
            {analysis.overall}
          </text>
          <line
            x1="640"
            y1="105"
            x2="680"
            y2="105"
            stroke="var(--border-strong)"
            markerEnd="url(#arrow)"
          />
          <rect
            x="690"
            y="75"
            width="100"
            height="60"
            rx="6"
            fill="var(--surface-2)"
            stroke={analysis.decision.outcome === 'BLOCK' ? 'var(--red)' : 'var(--accent)'}
          />
          <text x="740" y="110" textAnchor="middle" fill="var(--text)" fontSize="12">
            {analysis.decision.outcome}
          </text>
        </svg>
        <div className="graph-caption">
          Select a node to inspect its evidence. Showing {Math.min(evidence.length, 4)} of{' '}
          {evidence.length} matching findings.
        </div>
      </div>
      <div className="evidence-toolbar">
        <div className="filter-chips">
          <button
            className={category === 'all' ? 'selected' : ''}
            onClick={() => setCategory('all')}
          >
            All evidence
          </button>
          {riskCategories
            .filter((c) => analysis.evidence.some((e) => e.category === c))
            .map((c) => (
              <button
                key={c}
                className={category === c ? 'selected' : ''}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
        </div>
        <label className="search-box">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search evidence..."
            aria-label="Search evidence"
          />
        </label>
      </div>
      <div className="evidence-split">
        <div className="finding-list">
          {evidence.map((e) => (
            <button
              className={`finding-item ${selected === e.id ? 'selected' : ''}`}
              key={e.id}
              onClick={() => setSelected(e.id)}
            >
              <span className={`severity-dot ${e.severity}`} />
              <div>
                <strong className="mono">{e.code}</strong>
                <span>{e.message}</span>
                <small className="mono">
                  {e.location?.path ?? e.source}
                  {e.location ? ':' + e.location.line : ''}
                </small>
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
          {!evidence.length && <div className="empty-chart">No matching evidence</div>}
        </div>
        <div className="finding-detail">
          {finding ? (
            <>
              <div className="finding-detail-heading">
                <span
                  className={`tag ${finding.severity === 'critical' || finding.severity === 'high' ? 'red-text' : 'amber-text'}`}
                >
                  {finding.severity}
                </span>
                <span className="mono muted">
                  {Math.round(finding.confidence * 100)}% confidence
                </span>
              </div>
              <h3 className="mono">{finding.code}</h3>
              <p>{finding.message}</p>
              <div className="finding-source">
                <span>Source</span>
                <span className="mono">{finding.source}</span>
              </div>
              {finding.location && (
                <a
                  className="file-link mono"
                  href={`https://github.com/${analysis.job.owner}/${analysis.job.repo}/blob/${analysis.job.headSha}/${finding.location.path.split('/').map(encodeURIComponent).join('/')}#L${finding.location.line}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileCode2 size={14} />
                  {finding.location.path}:{finding.location.line}
                  <ArrowUpRight size={14} />
                </a>
              )}
              {file?.patch ? (
                <div className="diff-excerpt">
                  <div className="diff-heading mono">Diff excerpt · {file.path}</div>
                  <pre>
                    {file.patch.split('\n').map((line, index) => (
                      <span
                        key={index}
                        className={
                          line.startsWith('+')
                            ? 'diff-add'
                            : line.startsWith('-')
                              ? 'diff-remove'
                              : line.startsWith('@@')
                                ? 'diff-hunk'
                                : ''
                        }
                      >
                        {line}
                        {'\n'}
                      </span>
                    ))}
                  </pre>
                </div>
              ) : (
                <div className="empty-chart">A textual diff is not available for this finding.</div>
              )}
            </>
          ) : (
            <div className="empty-chart">Select evidence to inspect the file and diff.</div>
          )}
        </div>
      </div>
    </section>
  );
}
