import { z } from 'zod';
export type { IngestCommand, RepositoryIdentity } from './events.js';

export const riskCategories = ['bug', 'breaking', 'security', 'tests', 'dependencies', 'architecture', 'maintainability', 'operational'] as const;
export const categorySchema = z.enum(riskCategories);
export type RiskCategory = z.infer<typeof categorySchema>;
export const severitySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const locationSchema = z.object({ path: z.string().min(1), line: z.number().int().positive(), endLine: z.number().int().positive().optional(), sha: shaSchema });
export const evidenceSchema = z.object({
  id: z.string(), code: z.string(), category: categorySchema, severity: severitySchema,
  confidence: z.number().min(0).max(1), source: z.string(), analyzerVersion: z.string(),
  message: z.string(), location: locationSchema.optional(), metadata: z.record(z.string(), z.unknown()),
});
export type RiskEvidence = z.infer<typeof evidenceSchema>;
export type CodeLocation = z.infer<typeof locationSchema>;
export const jobSchema = z.object({
  id: z.uuid(), installationId: z.number().int().positive(), repositoryId: z.number().int().positive(),
  owner: z.string().regex(/^[a-zA-Z0-9-]+$/), repo: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  kind: z.enum(['pull_request', 'merge_group']), pullRequestNumber: z.number().int().positive().nullable(),
  headSha: shaSchema, baseSha: shaSchema, deliveryId: z.string().min(1),
  analyzerVersion: z.string(), configurationHash: z.string(), attempt: z.string(),
});
export type AnalysisJob = z.infer<typeof jobSchema>;

export const policySchema = z.object({
  version: z.string().min(1).default('1'),
  thresholds: z.object({ review: z.number().min(1).max(100).default(50), block: z.number().min(1).max(100).default(75) }).default({ review: 50, block: 75 }),
  blockOnCriticalSecurity: z.boolean().default(true), blockHighDependencySeverity: z.boolean().default(true),
  requirePassingCI: z.boolean().default(true),
  requiredChecks: z.array(z.object({ name: z.string().min(1), appId: z.number().int().positive().optional() })).default([]),
  requireTestsForCriticalPaths: z.boolean().default(true),
  criticalPaths: z.array(z.string().min(1)).default(['auth/', 'security/', 'payment/', 'billing/', 'session/', 'migration/', 'database/']),
  judge: z.object({ blockProbability: z.number().min(0).max(1).default(0.85), minConfidence: z.number().min(0).max(1).default(0.5), weight: z.number().min(0).max(0.5).default(0.25) }).default({ blockProbability: 0.85, minConfidence: 0.5, weight: 0.25 }),
  failureMode: z.object({ judge: z.enum(['review', 'closed', 'open']).default('review'), analysis: z.enum(['review', 'closed']).default('review') }).default({ judge: 'review', analysis: 'review' }),
  allowIgnore: z.boolean().default(false),
}).strict().superRefine((p, ctx) => {
  if (p.thresholds.review > p.thresholds.block) ctx.addIssue({ code: 'custom', path: ['thresholds'], message: 'review must not exceed block' });
  if (p.requiredChecks.some(c => c.name === 'PRism')) ctx.addIssue({ code: 'custom', path: ['requiredChecks'], message: 'PRism cannot require itself' });
  if (new Set(p.requiredChecks.map(c => `${c.name}:${c.appId ?? ''}`)).size !== p.requiredChecks.length) ctx.addIssue({ code: 'custom', path: ['requiredChecks'], message: 'Duplicate required checks' });
});
export type MergePolicy = z.infer<typeof policySchema>;
export const defaultPolicy = policySchema.parse({});

export const fileSchema = z.object({ path: z.string(), previousPath: z.string().optional(), status: z.enum(['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged']), additions: z.number(), deletions: z.number(), patch: z.string().optional(), binary: z.boolean().default(false) });
export type ChangedFile = z.infer<typeof fileSchema>;
export interface SourceFile { path: string; content: string; sha: string }
export interface ParsedSymbol { name: string; signature: string; line: number; endLine: number; exported: boolean; kind: 'function' | 'class' | 'variable' }
export interface ParsedCall { name: string; line: number; literalArguments: string[]; dynamicArguments: boolean }
export interface ParsedFile { path: string; language: string; imports: string[]; exports: string[]; symbols: ParsedSymbol[]; calls: ParsedCall[]; branches: number; parseErrors: number; unsafeAssertions: number }
export interface ParserAdapter { supports(path: string): boolean; parse(file: SourceFile): ParsedFile }
export interface ProviderState { source: string; status: 'available' | 'unavailable' | 'partial' | 'disabled'; reason: string }
export interface CheckState { name: string; appId?: number; state: 'success' | 'failure' | 'pending'; sha: string }
export interface RepositorySnapshot {
  job: AnalysisJob; title: string; files: ChangedFile[]; sources: SourceFile[]; baseSources: SourceFile[];
  repositoryPaths: string[]; checks: CheckState[]; mergeable: boolean | null;
  externalEvidence: RiskEvidence[]; providers: ProviderState[]; limitations: string[];
  history: { analyzed: number; reverted: number };
}
export interface AnalysisContext { snapshot: RepositorySnapshot; policy: MergePolicy; parsed: ParsedFile[]; baseParsed: ParsedFile[] }
export interface RepositoryAnalyzer { name: string; version: string; analyze(context: AnalysisContext): RiskEvidence[] }
export interface SecurityProvider { name: string; collect(job: AnalysisJob): Promise<{ evidence: RiskEvidence[]; state: ProviderState }> }

export const scoresSchema = z.object({ bug: z.number().min(0).max(100), breaking: z.number().min(0).max(100), security: z.number().min(0).max(100), tests: z.number().min(0).max(100), dependencies: z.number().min(0).max(100), architecture: z.number().min(0).max(100), maintainability: z.number().min(0).max(100), operational: z.number().min(0).max(100) });
export type RiskScores = z.infer<typeof scoresSchema>;
export const probabilitySchema = z.number().min(0).max(1);
export const choiceResultSchema = z.object({ choice: z.enum(['SAFE', 'LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK', 'CRITICAL']), probabilities: z.record(z.string(), probabilitySchema), confidence: probabilitySchema });
export type ChoiceResult = z.infer<typeof choiceResultSchema>;
export const scoreResultSchema = z.object({ score: z.number().min(0).max(100), confidence: probabilitySchema, probabilities: z.record(z.string(), probabilitySchema), legend: z.record(z.string(), z.string()) });
export type ScoreResult = z.infer<typeof scoreResultSchema>;
export interface JudgeInput { evidence: RiskEvidence[]; deterministicScores: RiskScores; limitations: string[] }
export interface NoulResult { trueProbability: number; falseProbability: number }
export interface JudgeModel {
  choice(input: JudgeInput): Promise<ChoiceResult>;
  score(input: JudgeInput, category: RiskCategory): Promise<ScoreResult>;
  noul(input: JudgeInput): Promise<NoulResult>;
  evaluate(input: JudgeInput): Promise<JudgeResult>;
}
export const judgeResultSchema = z.object({
  status: z.enum(['available', 'unavailable', 'mock']), model: z.string(), modelVersion: z.string(), promptVersion: z.string(),
  inputHash: z.string(), requestHash: z.string(), timestamp: z.iso.datetime(),
  choice: choiceResultSchema.nullable(), scores: z.record(categorySchema, scoreResultSchema).nullable(),
  trueProbability: probabilitySchema.nullable(), falseProbability: probabilitySchema.nullable(), error: z.string().nullable(),
});
export type JudgeResult = z.infer<typeof judgeResultSchema>;
export const decisionSchema = z.object({ outcome: z.enum(['SAFE', 'REVIEW', 'BLOCK']), reasons: z.array(z.object({ code: z.string(), message: z.string(), evidenceIds: z.array(z.string()) })), policyVersion: z.string() });
export type Decision = z.infer<typeof decisionSchema>;
export interface RiskAggregator { aggregate(evidence: RiskEvidence[], judge: JudgeResult, policy: MergePolicy): { scores: RiskScores; overall: number; contributions: Record<RiskCategory, string[]> } }
export interface PolicyEngine { evaluate(input: { evidence: RiskEvidence[]; overall: number; judge: JudgeResult; checks: CheckState[]; mergeable: boolean | null; limitations: string[]; kind: AnalysisJob['kind'] }, policy: MergePolicy): Decision }
export const analysisSchema = z.object({
  id: z.uuid(), job: jobSchema, title: z.string(), startedAt: z.iso.datetime(), completedAt: z.iso.datetime(),
  evidence: z.array(evidenceSchema), scores: scoresSchema, deterministicScores: scoresSchema, overall: z.number().min(0).max(100),
  contributions: z.record(categorySchema, z.array(z.string())), judge: judgeResultSchema, decision: decisionSchema,
  files: z.array(fileSchema), limitations: z.array(z.string()), providers: z.array(z.object({ source: z.string(), status: z.enum(['available', 'unavailable', 'partial', 'disabled']), reason: z.string() })),
  checks: z.array(z.object({ name: z.string(), appId: z.number().optional(), state: z.enum(['success', 'failure', 'pending']), sha: shaSchema })),
  policy: policySchema, analyzerVersion: z.string(), durations: z.record(z.string(), z.number()),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type JobStatus = 'queued' | 'running' | 'completed' | 'stale' | 'failed';
export interface StoredJob { job: AnalysisJob; policy: MergePolicy; status: JobStatus; checkRunId: number | null; result: Analysis | null; error: string | null }
export interface GitHubProvider {
  isCurrent(job: AnalysisJob): Promise<boolean>;
  collect(job: AnalysisJob, policy: MergePolicy): Promise<RepositorySnapshot>;
}
export interface CheckReporter {
  start(job: AnalysisJob, existingId: number | null): Promise<number>;
  publish(job: AnalysisJob, checkRunId: number, analysis: Analysis): Promise<void>;
  cancel(job: AnalysisJob, checkRunId: number, reason: string): Promise<void>;
  fail(job: AnalysisJob, checkRunId: number, reason: string): Promise<void>;
}
export interface AnalysisStore {
  getJob(id: string): Promise<StoredJob | null>;
  isInstallationActive(installationId: number): Promise<boolean>;
  isLatestJob(id: string): Promise<boolean>;
  markRunning(id: string): Promise<void>;
  saveCheckRun(id: string, checkRunId: number): Promise<void>;
  saveResult(analysis: Analysis): Promise<void>;
  finish(id: string, status: JobStatus, error?: string): Promise<void>;
  audit(action: string, subject: string, details: Record<string, unknown>): Promise<void>;
}
