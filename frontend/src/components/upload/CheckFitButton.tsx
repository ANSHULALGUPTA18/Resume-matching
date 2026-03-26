import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { candidateService, type Candidate } from '../../services/candidateService';
import toast from 'react-hot-toast';

const CheckFitButton: React.FC = () => {
  const { currentJob, uploadedResumes, setCandidates } = useApp();
  const [processing, setProcessing]     = useState(false);
  const [current, setCurrent]           = useState(0);
  const [total, setTotal]               = useState(0);
  const [duplicates, setDuplicates]     = useState(0);

  const handleCheckFit = async () => {
    if (!currentJob)                     { toast.error('Please upload a job description first'); return; }
    if (uploadedResumes.length === 0)    { toast.error('Please upload at least one resume');    return; }

    setProcessing(true);
    setCurrent(0);
    setDuplicates(0);
    const total = uploadedResumes.length;
    setTotal(total);

    const allCandidates: Candidate[] = [];
    let dupCount = 0;

    for (let i = 0; i < uploadedResumes.length; i++) {
      setCurrent(i + 1);
      try {
        const response = await candidateService.uploadResume(currentJob._id, uploadedResumes[i].file);
        if (response.candidates && Array.isArray(response.candidates)) {
          for (const c of response.candidates) {
            if ((c as any).isDuplicate) {
              dupCount++;
              toast(`⚠ Duplicate: ${uploadedResumes[i].fileName}`, { icon: '⚠️', duration: 2500 });
            } else {
              allCandidates.push(c as Candidate);
            }
          }
        }
      } catch (err: any) {
        toast.error(`Failed: ${uploadedResumes[i].fileName}`);
      }
    }

    setDuplicates(dupCount);

    const sorted = [...allCandidates].sort(
      (a, b) => (b.score?.overall || 0) - (a.score?.overall || 0)
    );
    setCandidates(sorted);

    if (sorted.length > 0) {
      const msg = dupCount > 0
        ? `${sorted.length} analyzed, ${dupCount} duplicate(s) skipped`
        : `Analysis complete. Top: ${sorted[0]?.personalInfo?.name || sorted[0]?.fileName || 'Top Match'}`;
      toast.success(msg);
    } else if (dupCount > 0) {
      toast(`All ${dupCount} resume(s) were duplicates — already analyzed`, { icon: '⚠️' });
    }

    setProcessing(false);
    setCurrent(0);
    setTotal(0);

    // Phase 3 (embeddings) + Phase 4 (Groq) run async on backend.
    // Re-fetch at 5s and 15s to capture updated semantic + LLM scores.
    const jobId = currentJob._id;
    const refresh = async () => {
      try {
        const updated = await candidateService.getCandidatesByJob(jobId);
        if (updated?.length > 0) {
          setCandidates([...updated].sort((a, b) => (b.score?.overall || 0) - (a.score?.overall || 0)));
        }
      } catch {}
    };
    setTimeout(refresh, 5000);
    setTimeout(refresh, 15000);
  };

  const isDisabled = !currentJob || uploadedResumes.length === 0 || processing;
  const progressPct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div>
      {processing && total > 0 && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Analyzing {current}/{total} resumes...</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%`, backgroundColor: '#3B82F6' }}
            />
          </div>
        </div>
      )}
      <button
        onClick={handleCheckFit}
        disabled={isDisabled}
        className="w-full py-2 text-sm font-semibold rounded text-white transition-colors"
        style={{
          backgroundColor: isDisabled ? '#9CA3AF' : '#3B82F6',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        {processing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Processing...
          </span>
        ) : (
          'Check Fit'
        )}
      </button>
    </div>
  );
};

export default CheckFitButton;
