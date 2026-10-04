import { notFound } from 'next/navigation';
import { workspaceData } from '../../../../../../../shared/data';
import { AnalysisDetail } from '../../../../../../../widgets/analysis-detail';
export default async function Page({ params }: { params: Promise<{ owner: string; repo: string; number: string }> }) { const { owner, repo, number } = await params; const data = await workspaceData(); const history = data.analyses.filter(a => a.job.owner === owner && a.job.repo === repo && a.job.pullRequestNumber === Number(number)).sort((a, b) => b.completedAt.localeCompare(a.completedAt)); const analysis = history[0]; if (!analysis) notFound(); return <AnalysisDetail analysis={analysis} history={history} demo={data.demo} />; }
