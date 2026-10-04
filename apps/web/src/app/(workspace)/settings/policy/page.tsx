import { workspaceData } from '../../../../shared/data';
import { PolicyEditor } from '../../../../features/policy-editor/editor';
export default async function Page() {
  const data = await workspaceData();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">POLICY ENGINE</div>
          <h1>Merge policies</h1>
          <p>Deterministic rules. Versioned decisions. Conservative defaults.</p>
        </div>
      </div>
      <PolicyEditor repositories={data.repositories} demo={data.demo} />
    </>
  );
}
