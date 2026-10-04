'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h2>Workspace data is unavailable</h2>
      <p>Check the database connection and service configuration.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
