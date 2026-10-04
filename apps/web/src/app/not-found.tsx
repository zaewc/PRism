import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Snapshot not found</h1>
      <p>The requested repository or analysis does not exist in this workspace.</p>
      <Link className="button" href="/dashboard">
        Return to overview
      </Link>
    </div>
  );
}
