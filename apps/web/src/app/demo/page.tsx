import { demoData } from '../../shared/data';
import { Shell } from '../../widgets/shell';
import { Dashboard } from '../../widgets/dashboard';
export const dynamic = 'force-dynamic';
export default async function Page() {
  return (
    <Shell demo>
      <Dashboard data={await demoData()} />
    </Shell>
  );
}
