'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { GitBranch, Save } from 'lucide-react';
import { defaultPolicy, policySchema } from '@prism/domain';
import type { RepositoryRow } from '@prism/database';
export function PolicyEditor({
  repositories,
  demo,
}: {
  repositories: RepositoryRow[];
  demo: boolean;
}) {
  const [selected, setSelected] = useState(repositories[0]?.id ?? null);
  const repository = repositories.find((r) => r.id === selected);
  const [version, setVersion] = useState(
    repository?.configuration ? Number(repository.configuration.version) : 0,
  );
  const [text, setText] = useState(
    JSON.stringify(repository?.configuration ?? defaultPolicy, null, 2),
  );
  const [format, setFormat] = useState<'json' | 'yaml'>('json');
  const save = useMutation({
    mutationFn: async () => {
      if (format === 'json') policySchema.parse(JSON.parse(text));
      return axios.put<{ version: string }>('/api/policies', {
        repositoryId: selected,
        expectedVersion: version,
        format,
        configuration: text,
      });
    },
    onSuccess: (response) => {
      setVersion(Number(response.data.version));
      toast.success(
        `Policy version ${response.data.version} saved. Existing snapshots retain their original policy.`,
      );
    },
    onError: (error) =>
      toast.error(
        axios.isAxiosError(error) && error.response?.status === 409
          ? 'Policy changed elsewhere. Refresh before saving.'
          : 'Policy is invalid or could not be saved',
      ),
  });
  if (!repository)
    return (
      <div className="empty-state">
        <h3>No repository policies yet</h3>
        <p>Install the GitHub App on a repository first.</p>
      </div>
    );
  return (
    <div className="policy-layout">
      <aside className="panel policy-repositories">
        {repositories.map((repo) => (
          <button
            className={repo.id === selected ? 'selected' : ''}
            key={repo.id}
            onClick={() => {
              setSelected(repo.id);
              setVersion(repo.configuration ? Number(repo.configuration.version) : 0);
              setText(JSON.stringify(repo.configuration ?? defaultPolicy, null, 2));
              setFormat('json');
            }}
          >
            <GitBranch size={14} />
            {repo.owner}/{repo.name}
          </button>
        ))}
      </aside>
      <section className="panel policy-editor">
        <div className="panel-heading">
          <h2>Repository policy</h2>
          <div className="filter-chips">
            <button
              className={format === 'json' ? 'selected' : ''}
              onClick={() => setFormat('json')}
            >
              JSON
            </button>
            <button
              className={format === 'yaml' ? 'selected' : ''}
              onClick={() => {
                setFormat('yaml');
                setText(
                  'version: "' +
                    (version || 1) +
                    '"\nthresholds:\n  review: 50\n  block: 75\nrequirePassingCI: true\nrequiredChecks:\n  - name: test\nblockOnCriticalSecurity: true\nrequireTestsForCriticalPaths: true\nfailureMode:\n  judge: review\n  analysis: review\n',
                );
              }}
            >
              YAML example
            </button>
          </div>
        </div>
        <textarea
          aria-label="Repository policy configuration"
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="policy-editor-footer">
          <span>
            {demo
              ? 'Demo policy is read-only.'
              : `Stored version ${version}. New analyses capture the configured policy.`}
          </span>
          <button
            className="button primary"
            disabled={demo || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save size={13} />
            Save policy
          </button>
        </div>
      </section>
    </div>
  );
}
