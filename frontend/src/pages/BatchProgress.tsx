import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useApp } from '../contexts/AppContext';
import { candidateService } from '../services/candidateService';
import { batchService } from '../services/batchService';

interface CandidateSummary {
  _id: string;
  personalInfo?: { name?: string };
  score?: { overall?: number };
  status: string;
  fileName: string;
  scoreBreakdown?: { llmScore?: number | null; sectionSemanticScore?: number | null };
  fromCache?: boolean;
}

interface ProgressEvent {
  total: number;
  done: number;
  failed: number;
  status: 'processing' | 'complete';
  newCandidates: CandidateSummary[];
  cachedCount?: number;
  error?: string;
}

const ScoreBadge: React.FC<{ score?: number }> = ({ score }) => {
  if (score == null) return <span className="text-gray-400 text-xs">—</span>;
  const color = score >= 75 ? '#22c55e' : score >= 55 ? '#f59e0b' : '#ef4444';
  return (
    <span className="text-xs font-bold" style={{ color }}>
      {score}%
    </span>
  );
};

const BatchProgress: React.FC = () => {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate    = useNavigate();
  const { setCandidates: setAppCandidates, setCurrentJob } = useApp();

  const [total,      setTotal]      = useState(0);
  const [done,       setDone]       = useState(0);
  const [failed,     setFailed]     = useState(0);
  const [complete,   setComplete]   = useState(false);
  const [jobId,      setJobId]      = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [connected,  setConnected]  = useState(false);
  const [cachedCount, setCachedCount] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  // Resolve jobId from batch status on mount
  useEffect(() => {
    if (!batchId) return;
    batchService.getStatus(batchId)
      .then(s => setJobId(s.jobId))
      .catch(() => {});
  }, [batchId]);

  useEffect(() => {
    if (!batchId) return;

    const es = new EventSource(`/api/batch/${batchId}/progress`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        if (data.error) {
          toast.error(data.error);
          es.close();
          return;
        }
        setTotal(data.total);
        setDone(data.done);
        setFailed(data.failed);
        if (data.newCandidates?.length) {
          setCandidates(prev => [...prev, ...data.newCandidates]);
        }
        const cached = data.cachedCount ?? 0;
        if (cached > 0) {
          setCachedCount(prev => prev + cached);
          toast.success(
            `${cached} resume${cached > 1 ? 's' : ''} loaded from cache — no re-processing needed`,
            { icon: '\u26A1', duration: 4000 }
          );
        }
        if (data.status === 'complete') {
          setComplete(true);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [batchId]);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barColor = complete ? '#22c55e' : '#3b82f6';

  const sorted = [...candidates].sort(
    (a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0)
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: connected ? '#22c55e' : '#9ca3af' }}
            />
            <span className="text-xs text-gray-500">
              {connected ? 'Live' : complete ? 'Done' : 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Progress card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-gray-800">
              {complete ? 'Batch Complete' : 'Processing Resumes...'}
            </h1>
            <span className="text-2xl font-bold" style={{ color: barColor }}>
              {pct}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-3 mb-3 overflow-hidden">
            <div
              className="h-3 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>

          <div className="flex gap-6 text-sm text-gray-600">
            <span>
              <span className="font-semibold text-gray-900">{done}</span> scored
            </span>
            {failed > 0 && (
              <span>
                <span className="font-semibold text-red-500">{failed}</span> failed
              </span>
            )}
            <span>
              <span className="font-semibold text-gray-900">{total}</span> total
            </span>
            {cachedCount > 0 && (
              <span>
                <span className="font-semibold text-amber-500">{cachedCount}</span> from cache
              </span>
            )}
            {!complete && total > 0 && (
              <span className="text-gray-400">
                {total - done - failed} remaining
              </span>
            )}
          </div>

          {complete && (
            <button
              onClick={async () => {
                if (jobId) {
                  try {
                    const all = await candidateService.getCandidatesByJob(jobId);
                    if (all?.length > 0) {
                      setAppCandidates(
                        [...all].sort((a: any, b: any) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0))
                      );
                    }
                  } catch {
                    // best-effort — dashboard will still load
                  }
                }
                navigate('/');
              }}
              className="mt-4 w-full py-2 text-sm font-semibold text-white rounded"
              style={{ backgroundColor: '#3b82f6' }}
            >
              View All Results on Dashboard
            </button>
          )}
        </div>

        {/* Candidates as they come in */}
        {candidates.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">
                Scored Candidates ({candidates.length})
                {!complete && (
                  <span className="ml-2 text-xs text-gray-400">updating live...</span>
                )}
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {sorted.map((c, i) => {
                const name = c.personalInfo?.name || c.fileName || `Candidate ${i + 1}`;
                const overall = c.score?.overall;
                const hasLlm = c.scoreBreakdown?.llmScore != null;
                const hasSemantic = c.scoreBreakdown?.sectionSemanticScore != null;
                const isCached = c.fromCache;
                return (
                  <div key={c._id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-5 text-right">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{name}</p>
                        <p className="text-xs text-gray-400">{c.fileName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isCached && (
                        <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
                          Cached
                        </span>
                      )}
                      {hasLlm && (
                        <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                          AI scored
                        </span>
                      )}
                      {hasSemantic && !hasLlm && (
                        <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">
                          Semantic
                        </span>
                      )}
                      <ScoreBadge score={overall} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state while waiting */}
        {candidates.length === 0 && !complete && (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">Waiting for first results...</p>
            <p className="text-xs mt-1">Worker is parsing and scoring resumes</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default BatchProgress;
