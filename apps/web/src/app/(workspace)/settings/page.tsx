import { GitFork, ShieldCheck } from 'lucide-react';
export default function Page() {
  const slug = process.env.GITHUB_APP_SLUG;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE SETTINGS</div>
          <h1>Integrations & access</h1>
          <p>Connect the App and configure server-side credentials.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <GitFork size={16} /> GitHub App
            </h2>
          </div>
          <div className="settings-body">
            <div className="setting-row">
              <span>App slug</span>
              <code>{slug || 'Not configured'}</code>
            </div>
            <div className="setting-row">
              <span>Installation authentication</span>
              <span className="tag">
                {process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY_PATH
                  ? 'Configured'
                  : 'Not configured'}
              </span>
            </div>
            <div className="setting-row">
              <span>Webhook signature verification</span>
              <span className="tag">HMAC-SHA256</span>
            </div>
            <p>
              Register a GitHub App with Contents read, Pull requests read, Checks write and Commit
              statuses read. Add Actions read for CI completion events. Code scanning read is
              optional.
            </p>
            {slug ? (
              <a
                className="button primary"
                href={`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`}
              >
                <GitFork size={14} />
                Install on selected repositories
              </a>
            ) : (
              <p>
                Set GITHUB_APP_SLUG and the App credentials in the server environment. Follow the
                setup guide in the repository README.
              </p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <ShieldCheck size={16} /> Judgment & governance
            </h2>
          </div>
          <div className="settings-body">
            <div className="setting-row">
              <span>Jev API</span>
              <span className="tag">
                {process.env.JEV_API_KEY ? 'Key configured' : 'Not configured'}
              </span>
            </div>
            <div className="setting-row">
              <span>Model</span>
              <code>{process.env.JEV_MODEL ?? 'jev-1.13.0'}</code>
            </div>
            <div className="setting-row">
              <span>Provider failure default</span>
              <span className="tag">Review required</span>
            </div>
            <div className="setting-row">
              <span>Dashboard access</span>
              <span className="tag">Single operator</span>
            </div>
            <p>
              Configure the required PRism check in the repository ruleset and select this App as
              its source. REVIEW and BLOCK both prevent that required check from passing.
            </p>
            <p>
              Credential configuration does not establish a successful connection. Confirm the live
              webhook and Check Run flow after installation.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
