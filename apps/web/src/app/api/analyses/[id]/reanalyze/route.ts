import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { database } from '../../../../../shared/data';
import { apiError, demoMutationGuard } from '../../../../../shared/api';
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = demoMutationGuard();
  if (guard) return guard;
  try {
    const id = z.uuid().parse((await params).id),
      db = database();
    const analysis = await db.analysis(id);
    if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    const { job } = analysis;
    const result = await db.ingest(
      randomUUID(),
      'dashboard-reanalysis',
      {
        type: 'rerequest',
        installationId: job.installationId,
        repository: { id: job.repositoryId, name: job.repo, owner: { login: job.owner } },
        externalId: id,
        actor: process.env.PRISM_ADMIN_USER ?? 'operator',
      },
      job.analyzerVersion,
    );
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
