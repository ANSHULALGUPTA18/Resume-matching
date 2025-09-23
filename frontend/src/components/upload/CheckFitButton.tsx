import React, { useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { useApp } from '../../contexts/AppContext';
import { candidateService, type Candidate } from '../../services/candidateService';
import toast from 'react-hot-toast';

const CheckFitButton: React.FC = () => {
  const { currentJob, uploadedResumes, setCandidates } = useApp();
  const [processing, setProcessing] = useState(false);

  const handleCheckFit = async () => {
    if (!currentJob) {
      toast.error('Please upload a job description first');
      return;
    }

    if (uploadedResumes.length === 0) {
      toast.error('Please upload at least one resume');
      return;
    }

    setProcessing(true);

    try {
      // Convert uploaded resumes back to File array for processing
      const files = uploadedResumes.map(resume => resume.file);
      
      const response = await candidateService.uploadResumes(currentJob._id, files);

      // Replace candidates list with analyzed results sorted by relevance (score desc)
      if (response.candidates && Array.isArray(response.candidates)) {
        const sorted: Candidate[] = [...response.candidates].sort((a: Candidate, b: Candidate) => (b.score?.overall || 0) - (a.score?.overall || 0));
        setCandidates(sorted);

        const top = sorted[0];
        const topName = top?.personalInfo?.name || top?.fileName || 'Top Match';
        toast.success(`Analysis complete. Top match: ${topName}`);
      } else {
        toast.success(`${uploadedResumes.length} resume(s) analyzed successfully!`);
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast.error(error.response?.data?.message || 'Failed to analyze resumes');
    } finally {
      setProcessing(false);
    }
  };

  const isDisabled = !currentJob || uploadedResumes.length === 0 || processing;

  return (
    <div className="mt-4">
      <button
        onClick={handleCheckFit}
        disabled={isDisabled}
        className={`w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm transition-colors
          ${isDisabled 
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
            : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
          }`}
      >
        {processing ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            Analyzing Resumes...
          </>
        ) : (
          <>
            <CheckCircleIcon className="h-5 w-5 mr-2" />
            Check Fit
          </>
        )}
      </button>
      
      {!currentJob && (
        <p className="mt-2 text-sm text-gray-500 text-center">
          Upload a job description to enable analysis
        </p>
      )}
      
      {currentJob && uploadedResumes.length === 0 && (
        <p className="mt-2 text-sm text-gray-500 text-center">
          Upload resumes to analyze their fit
        </p>
      )}
    </div>
  );
};

export default CheckFitButton;
