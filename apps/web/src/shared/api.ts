import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
export class InvalidRequestError extends Error {}
export function demoMutationGuard() {
  return process.env.PRISM_DEMO === 'true'
    ? NextResponse.json({ error: 'Demo is read-only' }, { status: 409 })
    : null;
}
export async function readJson(request: Request): Promise<unknown> {
  const declaredSize = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > 64_000) {
    throw new InvalidRequestError('REQUEST_TOO_LARGE');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidRequestError('EMPTY_BODY');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 64_000) {
      await reader.cancel();
      throw new InvalidRequestError('REQUEST_TOO_LARGE');
    }
    chunks.push(chunk.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new InvalidRequestError('INVALID_JSON');
  }
}
export function apiError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const status =
    code === 'POLICY_VERSION_CONFLICT'
      ? 409
      : code === 'FINDING_NOT_FOUND'
        ? 404
        : code === 'REQUEST_TOO_LARGE'
          ? 413
          : error instanceof ZodError ||
              error instanceof InvalidRequestError ||
              error instanceof SyntaxError
            ? 400
            : 503;
  const message =
    status === 409
      ? 'Policy version conflict'
      : status === 404
        ? 'Finding not found'
        : status === 413
          ? 'Request too large'
          : status === 400
            ? 'Invalid request'
            : 'Workspace service unavailable';
  return NextResponse.json({ error: message }, { status });
}
