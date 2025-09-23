import React from 'react';
import { useApp } from '../../contexts/AppContext';

const Header: React.FC = () => {
  const { currentJob, candidates } = useApp();
  
  const stats = {
    total: candidates.length,
    shortlisted: candidates.filter(c => c.status === 'shortlisted').length,
    onHold: candidates.filter(c => c.status === 'hold').length,
    avgScore: candidates.length > 0 
      ? Math.round(candidates.reduce((sum, c) => sum + (c.score?.overall || 0), 0) / candidates.length)
      : 0
  };

  return (
    <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">ATS Resume Optimizer Pro</h1>
            {currentJob && (
              <p className="mt-1 text-indigo-200">
                {currentJob.title} at {currentJob.company}
              </p>
            )}
          </div>
          
          <div className="flex space-x-8">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-indigo-200">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.shortlisted}</div>
              <div className="text-sm text-indigo-200">Shortlisted</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.onHold}</div>
              <div className="text-sm text-indigo-200">On Hold</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.avgScore}%</div>
              <div className="text-sm text-indigo-200">Avg Score</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
