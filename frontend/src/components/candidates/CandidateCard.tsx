import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Candidate } from '../../services/candidateService';
import { candidateService } from '../../services/candidateService';
import toast from 'react-hot-toast';

interface Props {
  candidate: Candidate;
  onStatusChange: () => void;
}

const CandidateCard: React.FC<Props> = ({ candidate, onStatusChange }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const handleStatusChange = async (status: string) => {
    try {
      await candidateService.updateStatus(candidate._id, status);
      toast.success(`Candidate ${status}`);
      onStatusChange();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg mr-4">
              {candidate.personalInfo?.name?.split(' ').map(n => n[0]).join('') || 'N/A'}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {candidate.personalInfo?.name || 'Unknown'}
              </h3>
              <p className="text-sm text-gray-600">{candidate.personalInfo?.email || 'No email'}</p>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {candidate.skills?.slice(0, 5).map((skill, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                >
                  {skill}
                </span>
              )) || <span className="text-sm text-gray-500">No skills listed</span>}
              {candidate.skills && candidate.skills.length > 5 && (
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                  +{candidate.skills.length - 5} more
                </span>
              )}
            </div>
          </div>

          {candidate.improvements && candidate.improvements.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Areas for Improvement:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {candidate.improvements.slice(0, 2).map((improvement, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-yellow-500 mr-2">•</span>
                    {improvement}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            {candidate.status !== 'shortlisted' && (
              <button
                onClick={() => handleStatusChange('shortlisted')}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
              >
                Shortlist
              </button>
            )}
            {candidate.status !== 'hold' && (
              <button
                onClick={() => handleStatusChange('hold')}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-sm"
              >
                Hold
              </button>
            )}
            {candidate.status !== 'rejected' && (
              <button
                onClick={() => handleStatusChange('rejected')}
                className="px-4 py-2 border border-red-600 text-red-600 rounded-md hover:bg-red-50 transition-colors text-sm"
              >
                Reject
              </button>
            )}
          </div>
        </div>

        <div className="ml-6">
          <div style={{ width: 100, height: 100 }}>
            <CircularProgressbar
              value={candidate.score?.overall || 0}
              text={`${candidate.score?.overall || 0}%`}
              styles={buildStyles({
                pathColor: getScoreColor(candidate.score?.overall || 0),
                textColor: '#333',
                trailColor: '#e5e7eb',
              })}
            />
          </div>
          <div className="mt-2 text-center">
            <span className={`px-2 py-1 rounded-full text-xs font-medium
              ${candidate.status === 'shortlisted' ? 'bg-green-100 text-green-800' : 
                candidate.status === 'hold' ? 'bg-yellow-100 text-yellow-800' :
                candidate.status === 'rejected' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'}`}>
              {candidate.status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CandidateCard;
