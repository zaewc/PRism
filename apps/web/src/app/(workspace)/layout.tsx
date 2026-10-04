import { Shell } from '../../widgets/shell';
export const dynamic = 'force-dynamic';
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Shell demo={process.env.PRISM_DEMO === 'true'}>{children}</Shell>;
}
