import { loadLocalEnv } from '@prism/config';
import { PostgresStore } from '@prism/database';
loadLocalEnv();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const store = new PostgresStore(databaseUrl);
try { await store.migrate(); process.stdout.write('PostgreSQL schema is ready.\n'); } finally { await store.close(); }
