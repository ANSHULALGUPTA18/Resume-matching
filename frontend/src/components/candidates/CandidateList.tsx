import React, { useState } from 'react';
import CandidateCard from './CandidateCard';
import { useApp } from '../../contexts/AppContext';

const CandidateList: React.FC = () => {
  const { candidates } = useApp();
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');

  const filteredCandidates = candidates.filter(candidate => {
    if (filter === 'all') return true;
    return candidate.status === filter;
  });

  const sortedCandidates = [...filteredCandidates].sort((a, b) => {
    if (sortBy === 'score') return (b.score?.overall || 0) - (a.score?.overall || 0);
    if (sortBy === 'name') return (a.personalInfo?.name || '').localeCompare(b.personalInfo?.name || '');
    return 0;
  });

  const refreshCandidates = async () => {
    // Refresh candidates list after status change
    // In a real app, you'd fetch from API
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-md ${
              filter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All ({candidates.length})
          </button>
          <button
            onClick={() => setFilter('shortlisted')}
            className={`px-4 py-2 rounded-md ${
              filter === 'shortlisted'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Shortlisted ({candidates.filter(c => c.status === 'shortlisted').length})
          </button>
          <button
            onClick={() => setFilter('hold')}
            className={`px-4 py-2 rounded-md ${
              filter === 'hold'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            On Hold ({candidates.filter(c => c.status === 'hold').length})
          </button>
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="score">Sort by Score</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      {sortedCandidates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No candidates found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sortedCandidates.map((candidate) => (
            <CandidateCard
              key={candidate._id}
              candidate={candidate}
              onStatusChange={refreshCandidates}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CandidateList;
