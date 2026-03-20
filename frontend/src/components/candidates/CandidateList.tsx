import React from 'react';
import CandidateCard from './CandidateCard';
import { useApp } from '../../contexts/AppContext';
import { candidateService } from '../../services/candidateService';
import toast from 'react-hot-toast';

interface Props {
  filter: string;
  sortBy: string;
}

const CandidateList: React.FC<Props> = ({ filter, sortBy }) => {
  const { candidates, updateCandidateStatus } = useApp();

  const filteredCandidates = candidates.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const sortedCandidates = [...filteredCandidates].sort((a, b) => {
    if (sortBy === 'score') return (b.score?.overall || 0) - (a.score?.overall || 0);
    if (sortBy === 'name') return (a.personalInfo?.name || '').localeCompare(b.personalInfo?.name || '');
    return 0;
  });

  const handleStatusChange = async (candidateId: string, newStatus: string) => {
    try {
      await candidateService.updateStatus(candidateId, newStatus);
      updateCandidateStatus(candidateId, newStatus);
      toast.success(`Candidate ${newStatus}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  if (sortedCandidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <svg className="h-16 w-16 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium text-gray-700">No Resumes Uploaded</p>
        <p className="text-xs mt-1" style={{ color: '#3B82F6' }}>Start By uploading job description</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedCandidates.map(candidate => (
        <CandidateCard
          key={candidate._id}
          candidate={candidate}
          onStatusChange={handleStatusChange}
        />
      ))}
    </div>
  );
};

export default CandidateList;
