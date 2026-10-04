import { NextResponse } from 'next/server';
import { z } from 'zod';
import { database } from '../../../shared/data';
import { apiError, demoMutationGuard, readJson } from '../../../shared/api';
export async function POST(request: Request) {
  const guard = demoMutationGuard(); if (guard) return guard;
  try {
    const body = z.object({ analysisId: z.uuid(), evidenceId: z.string().optional(), kind: z.enum(['safe', 'incorrect', 'reverted', 'bugfix', 'incident']), reason: z.string().trim().min(8).max(2000) }).parse(await readJson(request));
    return NextResponse.json({ id: await database().addFeedback(body.analysisId, body.evidenceId ?? null, process.env.PRISM_ADMIN_USER ?? 'operator', body.kind, body.reason) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
