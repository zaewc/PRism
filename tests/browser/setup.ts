import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export default async function setup() {
  const env = { ...process.env, DATABASE_URL: process.env.PRISM_BROWSER_DATABASE_URL };
  try { await run(process.execPath, ['--import', 'tsx', 'scripts/browser-database.ts', 'setup'], { env }); }
  catch (error) { await run(process.execPath, ['--import', 'tsx', 'scripts/browser-database.ts', 'drop'], { env }); throw error; }
  return async () => { await run(process.execPath, ['--import', 'tsx', 'scripts/browser-database.ts', 'drop'], { env }); };
}
