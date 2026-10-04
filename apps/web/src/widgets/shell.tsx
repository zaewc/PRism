'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ArrowUpRight,
  GitBranch,
  GitPullRequest,
  Layers,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
const nav = [
  { href: '/dashboard', label: 'Overview', Icon: LayoutDashboard },
  { href: '/repositories', label: 'Repositories', Icon: GitBranch },
  { href: '/settings/policy', label: 'Merge policies', Icon: SlidersHorizontal },
  { href: '/settings', label: 'Settings', Icon: Settings },
];
export function Shell({ children, demo = false }: { children: React.ReactNode; demo?: boolean }) {
  const pathname = usePathname();
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Layers size={20} />
          </span>
          PRism<span className="brand-beta">BETA</span>
        </Link>
        <div className="workspace-switch">
          <div className="workspace-avatar">P</div>
          <div>
            <strong>Merge governance</strong>
            <small>{demo ? 'Local fixture workspace' : 'Operator workspace'}</small>
          </div>
          <span>⌄</span>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Primary navigation">
          {nav.map(({ href, label, Icon }) => (
            <Link
              key={href}
              className={`nav-item ${(pathname.startsWith(href) && href !== '/settings') || pathname === href || (href === '/dashboard' && pathname.startsWith('/demo')) ? 'active' : ''}`}
              href={demo && href === '/dashboard' ? '/demo' : href}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-caption">ENGINE</div>
        <div className="engine-item">
          <Activity size={15} />
          Evidence pipeline
          <span className="status-dot green" />
        </div>
        <div className="engine-item">
          <ShieldCheck size={15} />
          Policy enforcement
        </div>
        <div className="sidebar-bottom">
          <div className="mono">PRism v0.1.0</div>
          <Link href="/" className="muted-link">
            About PRism <ArrowUpRight size={13} />
          </Link>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <div>
            <GitPullRequest size={15} />
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>
              {pathname.includes('analyses') || pathname.includes('pulls/')
                ? 'Analysis'
                : pathname.includes('policy')
                  ? 'Merge policies'
                  : pathname.includes('repositories')
                    ? 'Repositories'
                    : pathname.includes('settings')
                      ? 'Settings'
                      : 'Overview'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <span className="status-dot" />
              {demo ? 'Fixture replay' : 'GitHub App'}
            </span>
            <div className="avatar">OP</div>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span className="mono">DEMO</span> Synthetic PRs analyzed by the local engine. Jev is
            unavailable; this demo policy explicitly permits deterministic-only decisions.
          </div>
        )}
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
