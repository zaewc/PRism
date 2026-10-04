import { NextResponse } from 'next/server';
import { z } from 'zod';
import { policySchema } from '@prism/domain';
import { parsePolicyYaml } from '@prism/policy';
import { database, workspaceData } from '../../../shared/data';
import { apiError, demoMutationGuard, InvalidRequestError, readJson } from '../../../shared/api';
export async function GET() { return NextResponse.json((await workspaceData()).repositories.map(r => ({ repositoryId: r.id, configuration: r.configuration }))); }
export async function PUT(request: Request) {
  const guard = demoMutationGuard(); if (guard) return guard;
  try {
    const body = z.object({ repositoryId: z.number().int().positive(), expectedVersion: z.number().int().min(0), format: z.enum(['json', 'yaml']), configuration: z.string().max(64_000) }).parse(await readJson(request));
    const policy = (() => { try { return body.format === 'yaml' ? parsePolicyYaml(body.configuration) : policySchema.parse(JSON.parse(body.configuration)); } catch { throw new InvalidRequestError('INVALID_POLICY'); } })();
    return NextResponse.json(await database().changePolicy(body.repositoryId, policy, body.expectedVersion, process.env.PRISM_ADMIN_USER ?? 'operator'));
  } catch (error) { return apiError(error); }
}
