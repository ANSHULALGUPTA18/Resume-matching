import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { batchService } from '../../services/batchService';
import toast from 'react-hot-toast';

const CheckFitButton: React.FC = () => {
  const { currentJob, uploadedResumes, setActiveBatch } = useApp();
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!currentJob)                  { toast.error('Please upload a job description first'); return; }
    if (uploadedResumes.length === 0) { toast.error('Please upload at least one resume');    return; }

    setLoading(true);
    try {
      const files = uploadedResumes.map(r => r.file);
      const { batchId, totalQueued } = await batchService.uploadBatch(currentJob._id, files);
      setActiveBatch({ batchId, jobId: currentJob._id, total: totalQueued });
      setLoading(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Upload failed');
      setLoading(false);
    }
  };

  const isDisabled = !currentJob || uploadedResumes.length === 0;
  const count      = uploadedResumes.length;

  return (
    <button
      onClick={handleAnalyze}
      disabled={isDisabled || loading}
      className="w-full py-2 text-sm font-semibold rounded text-white transition-colors"
      style={{
        backgroundColor: isDisabled || loading ? '#9CA3AF' : '#3B82F6',
        cursor: isDisabled || loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Queuing...
        </span>
      ) : (
        `Analyze${count > 0 ? ` (${count})` : ''}`
      )}
    </button>
  );
};

export default CheckFitButton;
