import { createAppAuth } from '@octokit/auth-app';
import { z } from 'zod';

export const API_VERSION = '2026-03-10';
export class GitHubHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null = null) { super(`GITHUB_HTTP_${status}`); }
}
export interface GitHubTransport {
  request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<{ data: unknown; headers: Headers }>;
}
export class InstallationTransport implements GitHubTransport {
  private readonly auth;
  constructor(options: { appId: number; privateKey: string; installationId: number; repositoryId: number; fetch?: typeof fetch }, private readonly observe?: (remaining: number, reset: number) => void) {
    this.options = options;
    this.auth = createAppAuth({ appId: options.appId, privateKey: options.privateKey, installationId: options.installationId });
  }
  private readonly options;
  async request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) {
    if (!path.startsWith('/repos/') && !path.startsWith('/installation/')) throw new Error('GITHUB_PATH_NOT_ALLOWED');
    const auth = await this.auth({ type: 'installation', repositoryIds: [this.options.repositoryId] });
    const response = await (this.options.fetch ?? fetch)(`https://api.github.com${path}`, { method, headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION, 'User-Agent': 'PRism/0.1.0', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000), redirect: 'error' });
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    this.observe?.(remaining, reset);
    if (!response.ok) {
      const retry = Number(response.headers.get('retry-after'));
      throw new GitHubHttpError(response.status, retry > 0 ? retry * 1000 : remaining === 0 && reset > 0 ? Math.max(1000, reset * 1000 - Date.now()) : null);
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > 12_000_000) throw new Error('GITHUB_RESPONSE_TOO_LARGE');
    return { data: text ? JSON.parse(text) : null, headers: response.headers };
  }
}
export async function paginated<T>(transport: GitHubTransport, path: string, schema: z.ZodType<T>, extract: (data: unknown) => unknown = data => data, maxItems = 5000): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const response = await transport.request('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const items = z.array(schema).parse(extract(response.data));
    result.push(...items);
    if (result.length > maxItems) throw new Error('GITHUB_PAGINATION_LIMIT');
    const links = response.headers.get('link');
    if (!links?.includes('rel="next"')) return result;
    // Reconstruct the same endpoint rather than following an untrusted pagination URL.
  }
  throw new Error('GITHUB_PAGINATION_LIMIT');
}
