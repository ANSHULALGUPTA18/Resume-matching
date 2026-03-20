import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { candidateService, type Candidate } from '../../services/candidateService';
import toast from 'react-hot-toast';

const CheckFitButton: React.FC = () => {
  const { currentJob, uploadedResumes, setCandidates } = useApp();
  const [processing, setProcessing] = useState(false);

  const handleCheckFit = async () => {
    if (!currentJob) { toast.error('Please upload a job description first'); return; }
    if (uploadedResumes.length === 0) { toast.error('Please upload at least one resume'); return; }

    setProcessing(true);
    try {
      const files = uploadedResumes.map(r => r.file);
      const response = await candidateService.uploadResumes(currentJob._id, files);
      if (response.candidates && Array.isArray(response.candidates)) {
        const sorted: Candidate[] = [...response.candidates].sort(
          (a: Candidate, b: Candidate) => (b.score?.overall || 0) - (a.score?.overall || 0)
        );
        setCandidates(sorted);
        const top = sorted[0];
        toast.success(`Analysis complete. Top match: ${top?.personalInfo?.name || top?.fileName || 'Top Match'}`);
      } else {
        toast.success(`${uploadedResumes.length} resume(s) analyzed successfully!`);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to analyze resumes');
    } finally {
      setProcessing(false);
    }
  };

  const isDisabled = !currentJob || uploadedResumes.length === 0 || processing;

  return (
    <button
      onClick={handleCheckFit}
      disabled={isDisabled}
      className="w-full py-2 text-sm font-semibold rounded text-white mt-3 transition-colors"
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
          Analyzing...
        </span>
      ) : (
        'Check Fit'
      )}
    </button>
  );
};

export default CheckFitButton;
