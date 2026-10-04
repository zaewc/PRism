import { workspaceData } from '../../../shared/data';
import { Dashboard } from '../../../widgets/dashboard';
export default async function Page() {
  return <Dashboard data={await workspaceData()} />;
}
