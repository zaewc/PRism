export interface RepositoryIdentity { id: number; name: string; owner: { login: string } }
export type IngestCommand =
  | { type: 'installation'; installationId: number; active: boolean; account: string; repositories: RepositoryIdentity[] }
  | { type: 'analyze'; installationId: number; repository: RepositoryIdentity; kind: 'pull_request' | 'merge_group'; number: number | null; headSha: string; baseSha: string; title: string; attempt: string }
  | { type: 'closed'; installationId: number; repository: RepositoryIdentity; number: number; headSha: string; merged: boolean }
  | { type: 'refresh'; installationId: number; repository: RepositoryIdentity; headSha: string }
  | { type: 'rerequest'; installationId: number; repository: RepositoryIdentity; externalId: string; actor: string }
  | { type: 'ignored'; reason: string };
