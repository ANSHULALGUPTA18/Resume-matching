import React, { useState } from 'react';
import Header from '../components/layout/Header';
import JobUpload from '../components/upload/JobUpload';
import CandidateList from '../components/candidates/CandidateList';
import ResumesWidget from '../components/upload/ResumesWidget';
import CheckFitButton from '../components/upload/CheckFitButton';
import { useApp } from '../contexts/AppContext';

const Dashboard: React.FC = () => {
  const { candidates } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');

  const shortlisted = candidates.filter(c => c.status === 'shortlisted').length;
  const onHold      = candidates.filter(c => c.status === 'hold').length;
  const avgScore    = candidates.length > 0
    ? Math.round(candidates.reduce((sum, c) => sum + (c.score?.overall || 0), 0) / candidates.length)
    : 0;

  const tabs = [
    { key: 'all',         label: 'All' },
    { key: 'shortlisted', label: 'Shortlisted' },
    { key: 'hold',        label: 'On Hold' },
  ];

  return (
    <div className="h-screen overflow-hidden flex flex-col" style={{ backgroundColor: '#F3F4F6' }}>
      <Header />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Left sidebar ── */}
        {sidebarOpen && (
          <aside className="w-56 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <JobUpload />
            </div>
          </aside>
        )}

        {/* ── Center panel ── */}
        <main className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white">

          {/* Toolbar row */}
          <div className="flex items-center px-4 py-2 bg-white border-b border-gray-200 gap-3 flex-shrink-0">

            {/* Hamburger */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-500 hover:text-gray-700 flex-shrink-0"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Filter tabs */}
            <div className="flex items-center gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className="px-3 py-1 text-xs font-medium rounded transition-colors"
                  style={
                    filter === tab.key
                      ? { backgroundColor: '#3B82F6', color: '#fff' }
                      : { backgroundColor: '#F3F4F6', color: '#374151' }
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Stats */}
            <div className="flex items-center gap-5">
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold leading-none" style={{ color: '#F97316' }}>{candidates.length}</span>
                <span className="text-xs text-gray-400 mt-0.5">Total</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold leading-none" style={{ color: '#F97316' }}>{shortlisted}</span>
                <span className="text-xs text-gray-400 mt-0.5">Shortlisted</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold leading-none" style={{ color: '#F97316' }}>{onHold}</span>
                <span className="text-xs text-gray-400 mt-0.5">On Hold</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold leading-none" style={{ color: '#F97316' }}>{avgScore}</span>
                <span className="text-xs text-gray-400 mt-0.5">Average Score</span>
              </div>
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none"
            >
              <option value="score">Sort by</option>
              <option value="score">Score</option>
              <option value="name">Name</option>
            </select>
          </div>

          {/* Candidate list content */}
          <div className="flex-1 overflow-y-auto p-4">
            <CandidateList filter={filter} sortBy={sortBy} />
          </div>
        </main>

        {/* ── Right panel ── */}
        <aside className="w-64 bg-white border-l border-gray-200 flex-shrink-0 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 min-h-0 flex flex-col p-3">
            <ResumesWidget />
          </div>
          <div className="p-3 border-t border-gray-100">
            <CheckFitButton />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Dashboard;
