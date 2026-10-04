import { notFound } from 'next/navigation';
import { analysisData, demoData } from '../../../../shared/data';
import { AnalysisDetail } from '../../../../widgets/analysis-detail';
import { Shell } from '../../../../widgets/shell';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const analysis = await analysisData(id, true); if (!analysis) notFound(); const history = (await demoData()).analyses.filter(a => a.job.pullRequestNumber === analysis.job.pullRequestNumber); return <Shell demo><AnalysisDetail analysis={analysis} history={history} demo /></Shell>; }
