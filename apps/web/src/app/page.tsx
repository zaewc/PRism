import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Code2,
  GitBranch,
  GitFork,
  GitPullRequest,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { RiskBadge } from '@prism/ui';
export const dynamic = 'force-dynamic';
export default function Landing() {
  const install = process.env.GITHUB_APP_SLUG
    ? `https://github.com/apps/${encodeURIComponent(process.env.GITHUB_APP_SLUG)}/installations/new`
    : '/settings';
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Layers size={20} />
          </span>
          PRism
        </Link>
        <div>
          <a href="#how-it-works">How it works</a>
          <Link href="/demo">Demo</Link>
          <a href="https://github.com/zaewc/PRism" target="_blank" rel="noreferrer">
            <GitFork size={16} />
            GitHub
            <ArrowUpRight size={12} />
          </a>
        </div>
        <Link href="/dashboard" className="button secondary">
          Open workspace <ArrowRight size={14} />
        </Link>
      </nav>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-tag">
              <span className="status-dot" />
              Evidence-first merge governance
              <ChevronRight size={12} />
            </div>
            <h1>
              Know the risk
              <br />
              <span>before you merge.</span>
            </h1>
            <p>
              Every pull request changes more than code.
              <br />
              PRism connects repository evidence, AI judgment,
              <br className="desktop-break" /> and your merge policy — right inside GitHub.
            </p>
            <div className="hero-actions">
              <a className="button primary" href={install}>
                <GitFork size={16} />
                Install GitHub App
                <ArrowUpRight size={14} />
              </a>
              <Link className="button secondary" href="/demo">
                View demo
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="hero-footnote">
              <Check size={13} />
              Scoped App permissions<span>·</span>
              <Check size={13} />
              No repository code execution
            </div>
          </div>
          <div className="hero-terminal">
            <div className="terminal-header">
              <span className="terminal-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="mono">PRism / pull request #382</span>
              <span className="tag">LOCAL REPLAY</span>
            </div>
            <div className="terminal-pr">
              <GitPullRequest size={19} />
              <div>
                <strong>feat: update authentication flow</strong>
                <small className="mono">acme/payments · src/auth/login.ts</small>
              </div>
            </div>
            <div className="terminal-pipeline">
              <span>
                <Check size={12} /> Diff
              </span>
              <span>
                <Check size={12} /> AST
              </span>
              <span>
                <Check size={12} /> Tests
              </span>
              <span>
                <Check size={12} /> Policy
              </span>
            </div>
            <div className="terminal-verdict">
              <RiskBadge outcome="BLOCK" />
              <span className="mono">Critical-path tests required</span>
            </div>
            <div className="terminal-findings">
              <div>
                <span className="severity-dot high" />
                <code>AUTHENTICATION_PATH_CHANGED</code>
                <small>medium</small>
              </div>
              <div>
                <span className="severity-dot high" />
                <code>CRITICAL_PATH_WITHOUT_TEST</code>
                <small>high</small>
              </div>
              <div>
                <span className="severity-dot medium" />
                <code>JUDGE_UNAVAILABLE</code>
                <small>review</small>
              </div>
            </div>
            <div className="terminal-bottom">
              <span className="mono">Evidence → policy → required check</span>
              <Link href="/demo">
                Inspect the analysis <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </section>
        <div className="hero-divider">
          <span>CODE CHANGES ARE LOCAL. THEIR IMPACT ISN’T.</span>
        </div>
        <section className="landing-features">
          <article>
            <GitBranch size={22} />
            <h2>See the blast radius.</h2>
            <p>
              Connect changed code to dependency paths, public APIs, critical modules and related
              tests.
            </p>
          </article>
          <article>
            <Code2 size={22} />
            <h2>Evidence before judgment.</h2>
            <p>
              Deterministic analyzers produce located findings. Jev evaluates bounded facts with
              typed probabilities.
            </p>
          </article>
          <article>
            <ShieldCheck size={22} />
            <h2>Your policy. Enforced.</h2>
            <p>
              Combine CI, security and risk thresholds into a required GitHub check that explains
              its decision.
            </p>
          </article>
        </section>
        <section className="flow-section" id="how-it-works">
          <div className="eyebrow">FROM PULL REQUEST TO MERGE DECISION</div>
          <h2>
            A decision pipeline.
            <br />
            <span>Every step accounted for.</span>
          </h2>
          <div className="landing-flow">
            {[
              { title: 'Pull request', sub: 'Immutable commit snapshot' },
              { title: 'Analyze', sub: 'AST, tests, security, dependencies' },
              { title: 'Judge', sub: 'Choice · Score · Noul' },
              { title: 'Decide', sub: 'Versioned repository policy' },
              { title: 'Merge', sub: 'GitHub required check' },
            ].map((stage, index) => (
              <div key={stage.title}>
                <span className="mono flow-number">0{index + 1}</span>
                <strong>{stage.title}</strong>
                <small>{stage.sub}</small>
                {index < 4 && <ArrowRight size={18} />}
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Link className="brand" href="/">
          <Layers size={18} />
          PRism
        </Link>
        <span>Understand the change. Own the decision.</span>
        <a href="https://github.com/zaewc/PRism" target="_blank" rel="noreferrer">
          Source code <ArrowUpRight size={13} />
        </a>
      </footer>
    </div>
  );
}
