import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { candidateService, Candidate } from '../../services/candidateService';

interface CandidateSummary {
  _id: string;
  personalInfo?: { name?: string };
  score?: { overall?: number };
  status: string;
  fileName: string;
  scoreBreakdown?: { llmScore?: number | null; sectionSemanticScore?: number | null };
  fromCache?: boolean;
}

const ScoreDot: React.FC<{ score?: number }> = ({ score }) => {
  if (score == null) return <span className="text-gray-400 text-xs font-bold">—</span>;
  const color = score >= 75 ? '#22c55e' : score >= 55 ? '#f59e0b' : '#ef4444';
  return <span className="text-xs font-bold" style={{ color }}>{score}%</span>;
};

const BatchProgressPanel: React.FC = () => {
  const { activeBatch, setActiveBatch, setCandidates, candidates } = useApp();
  const candidatesRef = useRef<Candidate[]>(candidates);
  useEffect(() => { candidatesRef.current = candidates; }, [candidates]);
  const [done, setDone]             = useState(0);
  const [failed, setFailed]         = useState(0);
  const [complete, setComplete]     = useState(false);
  const [minimized, setMinimized]   = useState(false);
  const [localCandidates, setLocalCandidates] = useState<CandidateSummary[]>([]);
  const lastSentCountRef            = useRef(0);
  const esRef                       = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!activeBatch) return;

    // Reset state for new batch
    setDone(0);
    setFailed(0);
    setComplete(false);
    setMinimized(false);
    setLocalCandidates([]);
    lastSentCountRef.current = 0;

    const es = new EventSource(`/api/batch/${activeBatch.batchId}/progress`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) { es.close(); return; }

        setDone(data.done);
        setFailed(data.failed ?? 0);

        if (data.newCandidates?.length) {
          setLocalCandidates(prev => [...prev, ...data.newCandidates]);
          // Also push into the main candidates list (sorted by score)
          const merged = [...candidatesRef.current];
          for (const nc of data.newCandidates) {
            if (!merged.find((c: Candidate) => c._id === nc._id)) {
              merged.push(nc as unknown as Candidate);
            }
          }
          setCandidates(merged.sort((a: Candidate, b: Candidate) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0)));
        }

        if (data.status === 'complete') {
          setComplete(true);
          es.close();
          // Final sync: reload all candidates for this job to ensure nothing missed
          candidateService.getCandidatesByJob(activeBatch.jobId)
            .then(all => {
              if (all?.length) {
                setCandidates([...all].sort((a: any, b: any) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0)));
              }
            })
            .catch(() => {});
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => { es.close(); };

    return () => { es.close(); };
  }, [activeBatch]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeBatch) return null;

  const total  = activeBatch.total;
  const pct    = total > 0 ? Math.round((done / total) * 100) : 0;
  const barColor = complete ? '#22c55e' : '#3b82f6';

  const sorted = [...localCandidates].sort(
    (a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0)
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        width: '340px',
        zIndex: 9999,
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: minimized ? 'auto' : '480px',
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: complete ? '#f0fdf4' : '#eff6ff',
          borderBottom: minimized ? 'none' : '1px solid #e5e7eb',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        {/* Status icon */}
        {complete ? (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="#22c55e" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" style={{ color: '#3b82f6' }}>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: complete ? '#15803d' : '#1d4ed8', margin: 0 }}>
            {complete ? 'Batch Complete' : 'Processing Resumes...'}
          </p>
          <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
            {done} / {total} scored{failed > 0 ? ` · ${failed} failed` : ''}
          </p>
        </div>

        {/* Minimise / close */}
        <button
          onClick={() => setMinimized(m => !m)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af' }}
          title={minimized ? 'Expand' : 'Minimise'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {minimized
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            }
          </svg>
        </button>
        <button
          onClick={() => setActiveBatch(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af' }}
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!minimized && (
        <>
          {/* Progress bar */}
          <div style={{ padding: '8px 14px 6px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>
                {complete ? 'Done' : `${total - done - failed} remaining`}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: barColor }}>{pct}%</span>
            </div>
            <div style={{ height: '6px', backgroundColor: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  backgroundColor: barColor,
                  borderRadius: '3px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>

          {/* Candidates list */}
          {sorted.length > 0 && (
            <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #f3f4f6' }}>
              {sorted.map((c, i) => {
                const name    = c.personalInfo?.name || c.fileName || `Candidate ${i + 1}`;
                const overall = c.score?.overall;
                const hasLlm  = c.scoreBreakdown?.llmScore != null;
                const cached  = c.fromCache;
                return (
                  <div
                    key={c._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 14px',
                      borderBottom: '1px solid #f9fafb',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '11px', color: '#d1d5db', width: '16px', textAlign: 'right', flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                          {name}
                        </p>
                        <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                          {c.fileName}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {cached && (
                        <span style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#d97706', padding: '1px 6px', borderRadius: '999px' }}>
                          cached
                        </span>
                      )}
                      {hasLlm && !cached && (
                        <span style={{ fontSize: '10px', backgroundColor: '#f5f3ff', color: '#7c3aed', padding: '1px 6px', borderRadius: '999px' }}>
                          AI
                        </span>
                      )}
                      <ScoreDot score={overall} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {sorted.length === 0 && !complete && (
            <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
              Waiting for first results...
            </div>
          )}

          {/* Complete footer */}
          {complete && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid #f3f4f6', flexShrink: 0, backgroundColor: '#f9fafb' }}>
              <button
                onClick={() => setActiveBatch(null)}
                style={{
                  width: '100%',
                  padding: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: '#22c55e',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Done — results are on the dashboard
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BatchProgressPanel;
