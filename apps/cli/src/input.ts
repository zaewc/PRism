import { z } from 'zod';
import { evidenceSchema, fileSchema, jobSchema, shaSchema, analysisSchema } from '@prism/domain';
export const snapshotSchema = z.object({
  job: jobSchema, title: z.string().max(1000), files: z.array(fileSchema).max(3000),
  sources: z.array(z.object({ path: z.string(), content: z.string().max(200_000), sha: shaSchema })).max(100),
  baseSources: z.array(z.object({ path: z.string(), content: z.string().max(200_000), sha: shaSchema })).max(100),
  repositoryPaths: z.array(z.string()).max(100_000), checks: analysisSchema.shape.checks.transform(checks => checks.map(({ appId, ...check }) => ({ ...check, ...(appId !== undefined ? { appId } : {}) }))),
  mergeable: z.boolean().nullable(), externalEvidence: z.array(evidenceSchema).max(5000),
  providers: analysisSchema.shape.providers, limitations: z.array(z.string()),
  history: z.object({ analyzed: z.number().int().nonnegative(), reverted: z.number().int().nonnegative() }),
}).strict();
