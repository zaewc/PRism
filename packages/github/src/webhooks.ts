import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { shaSchema } from '@prism/domain';

export function verifySignature(raw: Buffer, signature: string | undefined, secret: string): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const received = Buffer.from(signature.slice(7), 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
const installation = z.object({ id: z.number().int().positive() });
const repository = z.object({ id: z.number().int().positive(), name: z.string().min(1), owner: z.object({ login: z.string().min(1) }) });
const base = z.object({ action: z.string().optional(), installation, repository });
const pr = base.extend({ number: z.number().int().positive(), pull_request: z.object({ id: z.number(), title: z.string(), state: z.enum(['open', 'closed']), merged: z.boolean().default(false), merged_at: z.string().nullable().optional(), head: z.object({ sha: shaSchema }), base: z.object({ sha: shaSchema }) }) });
const group = base.extend({ merge_group: z.object({ head_sha: shaSchema, base_sha: shaSchema, head_ref: z.string(), base_ref: z.string() }) });
const check = base.extend({ check_run: z.object({ id: z.number(), name: z.string(), head_sha: shaSchema, external_id: z.string().nullable(), app: z.object({ id: z.number() }), pull_requests: z.array(z.object({ number: z.number() })).default([]) }), requested_action: z.object({ identifier: z.string() }).optional(), sender: z.object({ login: z.string() }).optional() });
const status = base.extend({ sha: shaSchema, state: z.string(), context: z.string() });
const workflow = base.extend({ workflow_run: z.object({ head_sha: shaSchema }) });
const lifecycle = z.object({ action: z.string(), installation: installation.extend({ account: z.object({ login: z.string() }).optional() }), repositories: z.array(repository).default([]) });
export type WebhookCommand =
  | { type: 'installation'; installationId: number; active: boolean; account: string; repositories: z.infer<typeof repository>[] }
  | { type: 'analyze'; installationId: number; repository: z.infer<typeof repository>; kind: 'pull_request' | 'merge_group'; number: number | null; headSha: string; baseSha: string; title: string; attempt: string }
  | { type: 'closed'; installationId: number; repository: z.infer<typeof repository>; number: number; headSha: string; merged: boolean }
  | { type: 'refresh'; installationId: number; repository: z.infer<typeof repository>; headSha: string }
  | { type: 'rerequest'; installationId: number; repository: z.infer<typeof repository>; externalId: string; actor: string }
  | { type: 'ignored'; reason: string };
export function parseWebhook(event: string, payload: unknown, appId: number, _deliveryId: string): WebhookCommand {
  if (event === 'ping') return { type: 'ignored', reason: 'ping' };
  if (event === 'installation') {
    const parsed = lifecycle.parse(payload);
    if (!['created', 'deleted', 'suspend', 'unsuspend'].includes(parsed.action)) return { type: 'ignored', reason: 'unsupported installation action' };
    return { type: 'installation', installationId: parsed.installation.id, active: ['created', 'unsuspend'].includes(parsed.action), account: parsed.installation.account?.login ?? '', repositories: parsed.repositories };
  }
  if (event === 'pull_request') {
    const parsed = pr.parse(payload);
    if (parsed.action === 'closed') return { type: 'closed', installationId: parsed.installation.id, repository: parsed.repository, number: parsed.number, headSha: parsed.pull_request.head.sha, merged: parsed.pull_request.merged };
    if (!['opened', 'synchronize', 'reopened', 'ready_for_review'].includes(parsed.action ?? '')) return { type: 'ignored', reason: 'unsupported PR action' };
    return { type: 'analyze', installationId: parsed.installation.id, repository: parsed.repository, kind: 'pull_request', number: parsed.number, headSha: parsed.pull_request.head.sha, baseSha: parsed.pull_request.base.sha, title: parsed.pull_request.title, attempt: 'initial' };
  }
  if (event === 'merge_group') {
    const parsed = group.parse(payload);
    if (parsed.action !== 'checks_requested') return { type: 'ignored', reason: 'unsupported merge group action' };
    return { type: 'analyze', installationId: parsed.installation.id, repository: parsed.repository, kind: 'merge_group', number: null, headSha: parsed.merge_group.head_sha, baseSha: parsed.merge_group.base_sha, title: `Merge queue: ${parsed.merge_group.head_ref}`, attempt: 'initial' };
  }
  if (event === 'check_run') {
    const parsed = check.parse(payload);
    if (parsed.check_run.app.id === appId && (parsed.action === 'rerequested' || (parsed.action === 'requested_action' && parsed.requested_action?.identifier === 'reanalyze')) && parsed.check_run.external_id) return { type: 'rerequest', installationId: parsed.installation.id, repository: parsed.repository, externalId: parsed.check_run.external_id, actor: parsed.sender?.login ?? 'unknown' };
    if (parsed.action === 'completed' && parsed.check_run.app.id !== appId) return { type: 'refresh', installationId: parsed.installation.id, repository: parsed.repository, headSha: parsed.check_run.head_sha };
    return { type: 'ignored', reason: 'unrelated check run' };
  }
  if (event === 'status') { const parsed = status.parse(payload); return { type: 'refresh', installationId: parsed.installation.id, repository: parsed.repository, headSha: parsed.sha }; }
  if (event === 'workflow_run') { const parsed = workflow.parse(payload); return parsed.action === 'completed' ? { type: 'refresh', installationId: parsed.installation.id, repository: parsed.repository, headSha: parsed.workflow_run.head_sha } : { type: 'ignored', reason: 'workflow still running' }; }
  return { type: 'ignored', reason: `unsupported event: ${event.slice(0, 80)}` };
}
