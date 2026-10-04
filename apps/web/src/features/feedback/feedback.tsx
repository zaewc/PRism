'use client';
import { useState } from 'react';
import axios from 'axios';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquare, RotateCw } from 'lucide-react';
export function AnalysisActions({ analysisId, demo }: { analysisId: string; demo: boolean }) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [kind, setKind] = useState<'safe' | 'incorrect'>('incorrect');
  const reanalyze = useMutation({
    mutationFn: () => axios.post(`/api/analyses/${analysisId}/reanalyze`),
    onSuccess: () => toast.success('Re-analysis queued for this snapshot'),
    onError: () => toast.error('Could not queue re-analysis'),
  });
  const feedback = useMutation({
    mutationFn: () => axios.post('/api/feedback', { analysisId, kind, reason }),
    onSuccess: () => {
      toast.success('Feedback recorded. The existing decision is preserved.');
      setOpen(false);
      setReason('');
    },
    onError: () => toast.error('Could not record feedback'),
  });
  return (
    <>
      <div className="analysis-actions">
        <button
          className="button secondary"
          disabled={demo || reanalyze.isPending}
          onClick={() => reanalyze.mutate()}
        >
          <RotateCw size={14} /> Re-analyze
        </button>
        <button className="button secondary" disabled={demo} onClick={() => setOpen(!open)}>
          <MessageSquare size={14} /> Feedback
        </button>
      </div>
      {open && (
        <form
          className="feedback-form panel"
          onSubmit={(event) => {
            event.preventDefault();
            feedback.mutate();
          }}
        >
          <label>
            Feedback type
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value === 'safe' ? 'safe' : 'incorrect')}
            >
              <option value="incorrect">This finding is incorrect</option>
              <option value="safe">Mark as safe for evaluation</option>
            </select>
          </label>
          <label>
            Reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={8}
              maxLength={2000}
            />
          </label>
          <button className="button" disabled={feedback.isPending || reason.trim().length < 8}>
            Record feedback
          </button>
        </form>
      )}
    </>
  );
}
