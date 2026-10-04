import { NextResponse } from 'next/server';
import { latestSnapshots, workspaceData } from '../../../shared/data';
export async function GET() {
  return NextResponse.json(
    latestSnapshots((await workspaceData()).analyses).map((a) => ({
      owner: a.job.owner,
      repo: a.job.repo,
      number: a.job.pullRequestNumber,
      kind: a.job.kind,
      headSha: a.job.headSha,
      baseSha: a.job.baseSha,
      analysisId: a.id,
      decision: a.decision,
      snapshotOnly: true,
    })),
  );
}
