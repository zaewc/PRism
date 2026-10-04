import { notFound } from 'next/navigation';
import { analysisData, workspaceData } from '../../../../shared/data';
import { AnalysisDetail } from '../../../../widgets/analysis-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const analysis = await analysisData(id); if (!analysis) notFound(); const data = await workspaceData(); const history = data.analyses.filter(a => a.job.repositoryId === analysis.job.repositoryId && a.job.pullRequestNumber === analysis.job.pullRequestNumber); return <AnalysisDetail analysis={analysis} history={history} demo={data.demo} />; }
